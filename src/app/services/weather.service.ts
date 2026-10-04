import { computed, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { WeatherLocation, WeatherSnapshot, weatherCondition } from '../models/weather.model';
import { CalendarStorageService } from './calendar-storage.service';
import { WallClockService } from './wall-clock.service';

interface ForecastResponse {
  current?: { temperature_2m: number; weather_code: number; is_day: number };
  daily?: { time: string[]; temperature_2m_min: number[]; temperature_2m_max: number[]; precipitation_probability_max?: number[] };
}

@Injectable({ providedIn: 'root' })
export class WeatherService implements OnDestroy {
  private readonly storage = inject(CalendarStorageService);
  private readonly clock = inject(WallClockService);
  private readonly interval = 30 * 60_000;
  private initialization?: Promise<void>;
  private timer?: ReturnType<typeof setTimeout>;
  private request?: { controller: AbortController; promise: Promise<void> };
  private started = false;
  private lastAttempt = 0;
  private writes: Promise<void> = Promise.resolve();
  private readonly enabledState = signal(true);
  private readonly locationState = signal<WeatherLocation | null>(null);
  private readonly snapshotState = signal<WeatherSnapshot | null>(null);
  readonly enabled = this.enabledState.asReadonly();
  readonly location = this.locationState.asReadonly();
  readonly snapshot = this.snapshotState.asReadonly();
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly condition = computed(() => weatherCondition(this.snapshot()?.code ?? -1, this.snapshot()?.isDay));
  readonly stale = computed(() => {
    const data = this.snapshot();
    return Boolean(data && (this.clock.now() - data.updatedAt >= this.interval
      || data.date !== this.locationDate(this.clock.now(), data.location.timezone)));
  });
  private readonly foreground = () => {
    if (document.visibilityState === 'visible') {
      if (!this.request && this.error() && Date.now() - this.lastAttempt >= 60_000) {
        this.lastAttempt = 0;
      }
      void this.refresh();
    } else {
      this.clearTimer();
    }
  };
  private readonly online = () => {
    this.lastAttempt = 0;
    void this.refresh();
  };

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    document.addEventListener('visibilitychange', this.foreground);
    window.addEventListener('pageshow', this.foreground);
    window.addEventListener('online', this.online);
    await this.initialize();
    if (this.started) await this.refresh();
  }

  private initialize(): Promise<void> {
    this.initialization ??= Promise.all([
      this.storage.getAppPreference<boolean>('weatherEnabled'),
      this.storage.getAppPreference<WeatherLocation | null>('weatherLocation'),
      this.storage.getAppPreference<WeatherSnapshot | null>('weatherSnapshot')
    ]).then(([enabled, location, snapshot]) => {
      this.enabledState.set(enabled !== false);
      if (location && this.validLocation(location)) this.locationState.set(location);
      if (snapshot && this.sameLocation(snapshot.location, this.location())
        && Number.isFinite(snapshot.temperature) && Number.isFinite(snapshot.minimum)
        && Number.isFinite(snapshot.maximum) && Number.isFinite(snapshot.updatedAt)) {
        this.snapshotState.set(snapshot);
      }
    }).catch(() => this.error.set('No se pudieron cargar las preferencias del tiempo.'));
    return this.initialization;
  }

  async configure(enabled: boolean, location?: WeatherLocation | null): Promise<void> {
    await this.initialize();
    const selectedLocation = location === undefined ? this.location() : location;
    if (selectedLocation && !this.validLocation(selectedLocation)) throw new Error('Ubicación no válida.');
    const changed = !this.sameLocation(selectedLocation, this.location());
    this.enabledState.set(enabled);
    this.locationState.set(selectedLocation);
    if (changed || !enabled) {
      this.request?.controller.abort();
      this.request = undefined;
      this.loading.set(false);
      this.lastAttempt = 0;
      if (changed) this.snapshotState.set(null);
    }
    this.clearTimer();
    const save = this.writes.then(async () => {
      await this.storage.saveAppPreference('weatherEnabled', enabled);
      await this.storage.saveAppPreference('weatherLocation', selectedLocation);
    });
    this.writes = save.catch(() => undefined);
    try {
      await save;
      this.error.set(null);
    } catch {
      this.error.set('No se pudo guardar la configuración del tiempo.');
      throw new Error('No se pudo guardar la configuración del tiempo.');
    }
    void this.refresh();
  }

  async searchLocations(query: string, signal?: AbortSignal): Promise<WeatherLocation[]> {
    if (query.trim().length < 2) return [];
    if (!navigator.onLine) throw new Error('Sin conexión para buscar ubicaciones.');
    const parameters = new URLSearchParams({ name: query.trim(), count: '6', language: 'es', format: 'json' });
    const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${parameters}`, { signal });
    if (!response.ok) throw new Error('No se pudo buscar la ubicación.');
    const data = await response.json() as { results?: (WeatherLocation & { admin1?: string; admin2?: string; country?: string })[] };
    return (data.results ?? []).map(item => ({
      name: [...new Set([item.name, item.admin2 || item.admin1, item.country].filter(Boolean))].join(', '),
      latitude: item.latitude,
      longitude: item.longitude,
      timezone: item.timezone
    })).filter(location => this.validLocation(location));
  }

  refresh(): Promise<void> {
    if (!this.started || !this.enabled() || !this.location() || document.visibilityState !== 'visible') {
      return Promise.resolve();
    }
    if (this.request) return this.request.promise;
    const data = this.snapshot();
    const recent = data && Date.now() - data.updatedAt < this.interval
      && data.date === this.locationDate(Date.now(), data.location.timezone);
    if (!navigator.onLine) {
      this.clearTimer();
      return Promise.resolve();
    }
    if (recent || (this.error() && Date.now() - this.lastAttempt < this.interval)) {
      this.schedule();
      return Promise.resolve();
    }
    const location = this.location()!;
    const controller = new AbortController();
    this.lastAttempt = Date.now();
    this.loading.set(true);
    const timeout = setTimeout(() => controller.abort(), 20_000);
    const promise = this.load(location, controller.signal).finally(() => {
      clearTimeout(timeout);
      if (this.request?.controller === controller) {
        this.request = undefined;
        this.loading.set(false);
        this.schedule();
      }
    });
    this.request = { controller, promise };
    return promise;
  }

  private async load(location: WeatherLocation, signal: AbortSignal): Promise<void> {
    try {
      const parameters = new URLSearchParams({
        latitude: String(location.latitude), longitude: String(location.longitude),
        current: 'temperature_2m,weather_code,is_day',
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
        timezone: location.timezone || 'auto', forecast_days: '1'
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${parameters}`, { signal });
      if (!response.ok) throw new Error('Tiempo no disponible.');
      const data = await response.json() as ForecastResponse;
      if (!data.current || !data.daily || !data.daily.time?.[0]
        || ![data.current.temperature_2m, data.current.weather_code, data.daily.temperature_2m_min?.[0],
          data.daily.temperature_2m_max?.[0]].every(value => typeof value === 'number' && Number.isFinite(value))) {
        throw new Error('Tiempo no disponible.');
      }
      if (signal.aborted || !this.sameLocation(location, this.location())) return;
      const snapshot: WeatherSnapshot = {
        location, temperature: data.current.temperature_2m, code: data.current.weather_code,
        isDay: data.current.is_day === 1, minimum: data.daily.temperature_2m_min[0],
        maximum: data.daily.temperature_2m_max[0], date: data.daily.time[0], updatedAt: Date.now(),
        rainProbability: data.daily.precipitation_probability_max?.[0] ?? undefined
      };
      this.snapshotState.set(snapshot);
      this.error.set(null);
      await this.storage.saveAppPreference('weatherSnapshot', snapshot).catch(() => undefined);
    } catch {
      if (this.request?.controller.signal === signal && this.started
        && this.sameLocation(location, this.location()) && this.enabled()) {
        this.error.set('No se pudo actualizar el tiempo.');
      }
    }
  }

  private schedule(): void {
    this.clearTimer();
    if (this.started && this.enabled() && this.location() && document.visibilityState === 'visible') {
      const due = Math.max(this.snapshot()?.updatedAt ?? 0, this.lastAttempt) + this.interval;
      this.timer = setTimeout(() => void this.refresh(), Math.max(60_000, due - Date.now()));
    }
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private validLocation(location: WeatherLocation): boolean {
    return typeof location.name === 'string' && Boolean(location.name.trim())
      && Number.isFinite(location.latitude) && Math.abs(location.latitude) <= 90
      && Number.isFinite(location.longitude) && Math.abs(location.longitude) <= 180;
  }

  private sameLocation(first: WeatherLocation | null | undefined, second: WeatherLocation | null): boolean {
    return first?.latitude === second?.latitude && first?.longitude === second?.longitude
      && first?.timezone === second?.timezone;
  }

  private locationDate(timestamp: number, timezone?: string): string {
    const parts = new Intl.DateTimeFormat('en', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .formatToParts(timestamp);
    return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
  }

  stop(): void {
    this.started = false;
    this.clearTimer();
    this.request?.controller.abort();
    this.request = undefined;
    this.loading.set(false);
    document.removeEventListener('visibilitychange', this.foreground);
    window.removeEventListener('pageshow', this.foreground);
    window.removeEventListener('online', this.online);
  }

  ngOnDestroy(): void {
    this.stop();
  }
}