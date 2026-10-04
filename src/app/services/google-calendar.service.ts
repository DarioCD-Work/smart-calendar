import { computed, Injectable, inject, OnDestroy, signal } from '@angular/core';
import { CalendarDate } from '../models/calendar-event.model';
import { CalendarDisplayEvent, CalendarDisplayOccurrence } from '../models/calendar-display-event.model';
import {
  GoogleCalendarApiEvent,
  GoogleCalendarColorsResponse,
  GoogleCalendarEventsResponse,
  GoogleCalendarListEntry,
  GoogleCalendarListResponse
} from '../models/google-calendar-api.model';
import { GoogleCalendarAuthService } from './google-calendar-auth.service';
import { CalendarSourceService } from './calendar-source.service';
import { addCalendarDays, formatCalendarDate, parseCalendarDate } from './calendar-date.service';
import { WallClockService } from './wall-clock.service';

export type GoogleSyncStatus = 'idle' | 'syncing' | 'success' | 'offline' | 'auth-required' | 'error';

interface AccountSyncResult {
  failed: boolean;
  lastSuccessfulSync: Date | null;
}

interface CachedEvents {
  expiresAt: number;
  occurrences: CalendarDisplayOccurrence[];
}

interface CachedColors {
  expiresAt: number;
  colors: GoogleCalendarColorsResponse;
}

@Injectable({ providedIn: 'root' })
export class GoogleCalendarService implements OnDestroy {
  private readonly auth = inject(GoogleCalendarAuthService);
  private readonly sources = inject(CalendarSourceService);
  private readonly clock = inject(WallClockService);
  private readonly onlineState = signal(navigator.onLine);
  private readonly accountResults = signal<Record<string, AccountSyncResult>>({});
  private lastNetworkSuccessAt = 0;
  private readonly accountNetworkSuccess = new Map<string, number>();
  private readonly responseCache = new Map<string, CachedEvents>();
  private cachedColors?: CachedColors;
  private colorsRequest?: Promise<GoogleCalendarColorsResponse>;
  private currentRange?: { start: CalendarDate; end: CalendarDate };
  private refreshSequence = 0;
  private initialization?: Promise<void>;
  private syncEnabled = false;
  private syncTimer?: ReturnType<typeof setTimeout>;
  private activeRefresh?: { key: string; controller: AbortController; promise: Promise<void> };
  private readonly onForeground = () => {
    this.onlineState.set(navigator.onLine);
    if (document.visibilityState === 'visible') {
      void this.synchronizeAutomatically();
    } else {
      this.clearSyncTimer();
    }
  };
  private readonly onOnline = () => {
    this.onlineState.set(true);
    void this.synchronizeAutomatically();
  };
  private readonly onOffline = () => this.onlineState.set(false);

  readonly occurrences = signal<CalendarDisplayOccurrence[]>([]);
  readonly todayOccurrences = signal<CalendarDisplayOccurrence[]>([]);
  readonly lastSuccessfulSync = signal<Date | null>(null);
  readonly nextAutomaticSync = signal<number | null>(null);
  readonly syncAccounts = computed(() => {
    this.clock.now();
    return this.sources.getGoogleAccountViews(this.connectedAccountIds()).map(account => {
      const result = this.accountResults()[account.accountId];
      const status: GoogleSyncStatus = !this.onlineState() ? 'offline'
        : !this.auth.hasValidAccessToken(account.accountId) ? 'auth-required'
        : this.loading() ? 'syncing'
        : result?.failed ? 'error'
        : result?.lastSuccessfulSync ? 'success' : 'idle';
      return { ...account, status, lastSuccessfulSync: result?.lastSuccessfulSync ?? null };
    });
  });
  readonly syncStatus = computed<GoogleSyncStatus>(() => {
    if (!this.onlineState()) return 'offline';
    if (this.loading()) return 'syncing';
    const statuses = this.syncAccounts().map(account => account.status);
    if (statuses.includes('auth-required')) return 'auth-required';
    if (statuses.includes('error')) return 'error';
    return this.lastSuccessfulSync() || statuses.includes('success') ? 'success' : 'idle';
  });
  private readonly cachedKnownEvents = signal<CalendarDisplayEvent[]>([]);
  readonly knownEvents = this.cachedKnownEvents.asReadonly();
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly isConfigured = computed(() => this.auth.isConfigured);
  readonly connectedAccountIds = computed(() => {
    this.clock.now();
    return this.auth.activeAccountIds().filter(accountId => this.auth.hasValidAccessToken(accountId));
  });

  initialize(): Promise<void> {
    this.initialization ??= this.restoreRememberedAccounts();
    return this.initialization;
  }

  startAutomaticSync(): void {
    if (this.syncEnabled || typeof document === 'undefined') {
      return;
    }

    this.syncEnabled = true;
    this.onlineState.set(navigator.onLine);
    document.addEventListener('visibilitychange', this.onForeground);
    window.addEventListener('pageshow', this.onForeground);
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    this.scheduleSync();
  }

  stopAutomaticSync(): void {
    this.syncEnabled = false;
    this.clearSyncTimer();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onForeground);
      window.removeEventListener('pageshow', this.onForeground);
      window.removeEventListener('online', this.onOnline);
      window.removeEventListener('offline', this.onOffline);
    }
    this.activeRefresh?.controller.abort();
    this.activeRefresh = undefined;
    this.refreshSequence += 1;
    this.loading.set(false);
  }

  ngOnDestroy(): void {
    this.stopAutomaticSync();
  }

  private clearSyncTimer(): void {
    this.nextAutomaticSync.set(null);
    if (this.syncTimer !== undefined) {
      clearTimeout(this.syncTimer);
      this.syncTimer = undefined;
    }
  }

  private scheduleSync(): void {
    this.clearSyncTimer();
    if (this.syncEnabled && document.visibilityState === 'visible') {
      this.nextAutomaticSync.set(Date.now() + 60_000);
      this.syncTimer = setTimeout(() => void this.synchronizeAutomatically(), 60_000);
    }
  }

  private async synchronizeAutomatically(): Promise<void> {
    if (!this.syncEnabled || document.visibilityState !== 'visible') {
      return;
    }
    this.clearSyncTimer();
    try {
      if (navigator.onLine && this.currentRange) {
        await this.refreshVisibleEvents(this.currentRange.start, this.currentRange.end, true);
      }
    } catch {
      this.error.set('No se pudieron actualizar los calendarios de Google.');
    } finally {
      this.scheduleSync();
    }
  }

  async connectAccount(loginHint?: string): Promise<string> {
    if (!this.auth.isConfigured) {
      throw new Error('Configura el Client ID en src/environments/environment.ts antes de conectar Google.');
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const tokenResponse = await this.auth.requestAccessToken(loginHint);
      const accessToken = tokenResponse.access_token;
      if (!accessToken) {
        throw new Error('Google no devolvió un token de acceso.');
      }

      const [calendarEntries, colors] = await Promise.all([
        this.getAllPages<GoogleCalendarListEntry>(
          'https://www.googleapis.com/calendar/v3/users/me/calendarList?showHidden=true&maxResults=250',
          accessToken
        ),
        this.getColorPalette(accessToken)
      ]);
      const primaryCalendar = calendarEntries.find((calendar) => calendar.primary);
      if (!primaryCalendar?.id) {
        throw new Error('No se pudo identificar la cuenta principal de Google.');
      }

      const accountId = primaryCalendar.id;
      await this.sources.saveGoogleAccount({ accountId, email: accountId });
      const calendars = calendarEntries
        .filter((calendar) => !calendar.deleted)
        .map((calendar) => ({
          calendarId: calendar.id,
          name: calendar.summary || calendar.id,
          calendarColor: calendar.backgroundColor
            ?? colors.calendar?.[calendar.colorId ?? '']?.background
            ?? '#4285F4',
          visible: calendar.selected ?? calendar.primary ?? true,
          primary: calendar.primary ?? false,
          timeZone: calendar.timeZone
        }));

      await this.sources.saveGoogleCalendars(accountId, accountId, calendars);
      this.auth.storeAccessToken(accountId, tokenResponse);
      this.recordAccountResult(accountId, false, new Date());
      await this.refreshCurrentRange();
      return accountId;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo conectar Google Calendar.';
      this.error.set(message);
      throw error;
    } finally {
      this.loading.set(false);
    }
  }

  async disconnectAccount(accountId: string): Promise<void> {
    await this.sources.disconnectGoogleAccount(accountId);
    this.auth.forgetAccount(accountId);
    this.accountResults.update(results => {
      const next = { ...results };
      delete next[accountId];
      return next;
    });
    await this.refreshCurrentRange();
  }

  async setCalendarVisibility(calendarId: string, visible: boolean): Promise<void> {
    await this.sources.setGoogleCalendarVisibility(calendarId, visible);
    await this.refreshCurrentRange();
  }

  refreshVisibleEvents(rangeStart: CalendarDate, rangeEnd: CalendarDate, forceRefresh = false): Promise<void> {
    this.currentRange = { start: rangeStart, end: rangeEnd };
    const key = JSON.stringify([
      rangeStart,
      rangeEnd,
      this.sources.googleCalendars().filter((calendar) => calendar.visible),
      this.auth.activeAccountIds()
    ]);
    if (this.activeRefresh?.key === key && !this.activeRefresh.controller.signal.aborted) {
      return this.activeRefresh.promise;
    }

    this.activeRefresh?.controller.abort();
    const controller = new AbortController();
    const requestTimeout = setTimeout(() => controller.abort(), 30_000);
    const promise = this.loadVisibleEvents(rangeStart, rangeEnd, forceRefresh, controller.signal)
      .finally(() => {
        clearTimeout(requestTimeout);
        if (this.activeRefresh?.controller === controller) {
          this.activeRefresh = undefined;
        }
      });
    this.activeRefresh = { key, controller, promise };
    return promise;
  }

  private async loadVisibleEvents(
    rangeStart: CalendarDate,
    rangeEnd: CalendarDate,
    forceRefresh: boolean,
    signal: AbortSignal
  ): Promise<void> {
    const sequence = ++this.refreshSequence;
    const visibleCalendars = this.sources.googleCalendars().filter((calendar) => calendar.visible);

    if (!navigator.onLine) {
      this.onlineState.set(false);
      this.loading.set(false);
      return;
    }

    if (visibleCalendars.length === 0) {
      this.publishOccurrences([]);
      this.todayOccurrences.set([]);
      this.error.set(null);
      this.loading.set(false);
      return;
    }

    const unauthenticatedAccounts = [...new Set(visibleCalendars
      .filter((calendar) => !this.auth.hasAccessToken(calendar.accountId))
      .map((calendar) => calendar.accountEmail))];
    const authorizedCalendars = visibleCalendars.filter((calendar) =>
      this.auth.hasAccessToken(calendar.accountId)
    );

    if (authorizedCalendars.length === 0) {
      this.publishOccurrences([]);
      this.todayOccurrences.set([]);
      this.error.set('Vuelve a conectar las cuentas Google para actualizar sus calendarios.');
      this.loading.set(false);
      return;
    }

    const availableCalendarKeys = new Set(authorizedCalendars
      .filter((calendar) => this.auth.hasAccessToken(calendar.accountId))
      .map((calendar) => `${calendar.accountId}\u0000${calendar.calendarId}`));
    this.publishOccurrences(this.occurrences().filter((occurrence) =>
      availableCalendarKeys.has(`${occurrence.event.accountId}\u0000${occurrence.event.calendarId}`)
      && occurrence.endDate >= rangeStart
      && occurrence.startDate <= rangeEnd
    ));

    this.loading.set(true);
    const failures: string[] = [];
    const failedAccountIds = new Set<string>();
    const today = formatCalendarDate(new Date());
    const todayByCalendar = new Map<string, CalendarDisplayOccurrence[]>();
    const networkSuccessBefore = this.lastNetworkSuccessAt;
    const previousAccountSuccess = new Map(this.accountNetworkSuccess);
    const metadataRequests = new Map<string, Promise<GoogleCalendarListEntry[]>>();

    try {
      const calendarOccurrences = await Promise.all(authorizedCalendars.map(async (calendar) => {
        const accessToken = this.auth.getAccessToken(calendar.accountId);
        if (!accessToken) {
          return [];
        }

        try {
          let currentCalendar = calendar;
          if (forceRefresh) {
            let metadataRequest = metadataRequests.get(calendar.accountId);
            if (!metadataRequest) {
              metadataRequest = this.getAllPages<GoogleCalendarListEntry>(
                'https://www.googleapis.com/calendar/v3/users/me/calendarList?showHidden=true&maxResults=250',
                accessToken,
                signal
              );
              metadataRequests.set(calendar.accountId, metadataRequest);
            }
            const entries = await metadataRequest;
            const entry = entries.find((item) => item.id === calendar.calendarId && !item.deleted);
            if (!entry) {
              todayByCalendar.set(`${calendar.accountId}\u0000${calendar.calendarId}`, []);
              this.responseCache.delete(JSON.stringify([
                calendar.accountId, calendar.calendarId, rangeStart, rangeEnd
              ]));
              return [];
            }
            const colors = await this.getColorPalette(accessToken);
            currentCalendar = {
              ...calendar,
              name: entry.summary || calendar.name,
              calendarColor: entry.backgroundColor
                ?? colors.calendar?.[entry.colorId ?? '']?.background
                ?? calendar.calendarColor,
              timeZone: entry.timeZone ?? calendar.timeZone
            };
          }
          const occurrences = await this.getCalendarOccurrences(currentCalendar, accessToken, rangeStart, rangeEnd, forceRefresh, signal);
          const todays = rangeStart <= today && rangeEnd >= today
            ? occurrences.filter(occurrence => occurrence.startDate <= today && occurrence.endDate >= today)
            : await this.getCalendarOccurrences(currentCalendar, accessToken, today, today, forceRefresh, signal);
          todayByCalendar.set(`${calendar.accountId}\u0000${calendar.calendarId}`, todays);
          return occurrences;
        } catch (error) {
          if (signal.aborted) {
            return [];
          }
          failedAccountIds.add(calendar.accountId);
          if (error instanceof GoogleCalendarApiError && error.status === 401) {
            this.auth.forgetAccount(calendar.accountId);
            failures.push(calendar.accountEmail);
            return [];
          }
          failures.push(calendar.accountEmail);
          return this.responseCache.get(JSON.stringify([
            calendar.accountId, calendar.calendarId, rangeStart, rangeEnd
          ]))?.occurrences ?? [];
        }
      }));

      if (sequence !== this.refreshSequence || signal.aborted) {
        if (sequence === this.refreshSequence && signal.aborted) {
          this.error.set('No se pudieron actualizar los calendarios de Google.');
          for (const calendar of authorizedCalendars) this.recordAccountResult(calendar.accountId, true);
        }
        return;
      }

      this.publishOccurrences(calendarOccurrences.flat());
      const todays = authorizedCalendars.flatMap(calendar => {
        const key = `${calendar.accountId}\u0000${calendar.calendarId}`;
        return todayByCalendar.get(key) ?? this.responseCache.get(JSON.stringify([
          calendar.accountId, calendar.calendarId, today, today
        ]))?.occurrences ?? this.todayOccurrences().filter(occurrence =>
          occurrence.event.accountId === calendar.accountId && occurrence.event.calendarId === calendar.calendarId
          && occurrence.startDate <= today && occurrence.endDate >= today);
      });
      this.todayOccurrences.set([...new Map(todays.map(occurrence => [occurrence.eventId, occurrence])).values()]);
      const hadNetworkSuccess = this.lastNetworkSuccessAt > networkSuccessBefore;
      for (const accountId of new Set(authorizedCalendars.map(calendar => calendar.accountId))) {
        if (failedAccountIds.has(accountId)) this.recordAccountResult(accountId, true);
        else if ((this.accountNetworkSuccess.get(accountId) ?? 0) > (previousAccountSuccess.get(accountId) ?? 0)) {
          this.recordAccountResult(accountId, false, new Date());
        }
      }
      if (hadNetworkSuccess && !failures.length && !unauthenticatedAccounts.length) {
        this.lastSuccessfulSync.set(new Date());
      }
      this.error.set(failures.length || unauthenticatedAccounts.length
        ? 'No se pudieron actualizar todos los calendarios de Google. Reconecta las cuentas afectadas.'
        : null);
    } finally {
      if (sequence === this.refreshSequence) {
        this.loading.set(false);
      }
    }
  }

  private publishOccurrences(occurrences: CalendarDisplayOccurrence[]): void {
    const next = [...new Map(occurrences.map((occurrence) => [occurrence.eventId, occurrence])).values()]
      .sort((first, second) => first.startDate.localeCompare(second.startDate)
        || (first.event.startTime ?? '').localeCompare(second.event.startTime ?? '')
        || first.eventId.localeCompare(second.eventId));
    if (JSON.stringify(next) !== JSON.stringify(this.occurrences())) {
      this.occurrences.set(next);
    }
  }

  private recordAccountResult(accountId: string, failed: boolean, successfulAt?: Date): void {
    this.accountResults.update(results => ({
      ...results,
      [accountId]: { failed, lastSuccessfulSync: successfulAt ?? results[accountId]?.lastSuccessfulSync ?? null }
    }));
  }

  async refreshCurrentRange(): Promise<void> {
    if (this.currentRange) {
      await this.refreshVisibleEvents(this.currentRange.start, this.currentRange.end);
    }
  }

  private async restoreRememberedAccounts(): Promise<void> {
    await this.sources.initialize();
    const rememberedAccounts = this.sources.getGoogleAccountViews([]);

    if (!this.auth.isConfigured || rememberedAccounts.length === 0) {
      return;
    }

    try {
      await this.auth.loadLibrary();
    } catch {
      this.error.set('No se pudo comprobar la sesión de Google. Reconecta las cuentas cuando tengas conexión.');
      return;
    }

    for (const account of rememberedAccounts) {
      try {
        const response = await this.auth.requestAccessToken(account.email, 'none');
        this.auth.storeAccessToken(account.accountId, response);
      } catch {
        // GIS could not restore silently; keep the configured account and let refresh expose reconnect state.
      }
    }
  }

  private getColorPalette(accessToken: string): Promise<GoogleCalendarColorsResponse> {
    if (this.cachedColors && this.cachedColors.expiresAt > Date.now()) {
      return Promise.resolve(this.cachedColors.colors);
    }

    this.colorsRequest ??= this.getJson<GoogleCalendarColorsResponse>(
      'https://www.googleapis.com/calendar/v3/colors',
      accessToken
    ).catch(() => ({ calendar: {}, event: {} })).then((colors) => {
      this.cachedColors = { colors, expiresAt: Date.now() + 6 * 60 * 60 * 1000 };
      return colors;
    }).finally(() => {
      this.colorsRequest = undefined;
    });

    return this.colorsRequest;
  }

  private async getCalendarOccurrences(
    calendar: ReturnType<CalendarSourceService['googleCalendars']>[number],
    accessToken: string,
    rangeStart: CalendarDate,
    rangeEnd: CalendarDate,
    forceRefresh = false,
    signal?: AbortSignal
  ): Promise<CalendarDisplayOccurrence[]> {
    const cacheKey = JSON.stringify([calendar.accountId, calendar.calendarId, rangeStart, rangeEnd]);
    const cached = this.responseCache.get(cacheKey);
    if (!forceRefresh && cached && cached.expiresAt > Date.now()) {
      return cached.occurrences;
    }

    if (!forceRefresh) {
      for (const [storedKey, entry] of this.responseCache) {
        const [accountId, calendarId, cachedStart, cachedEnd] = JSON.parse(storedKey) as [string, string, string, string];
        if (entry.expiresAt > Date.now()
          && accountId === calendar.accountId && calendarId === calendar.calendarId
          && cachedStart <= rangeStart && cachedEnd >= rangeEnd) {
          const occurrences = entry.occurrences.filter((occurrence) =>
            occurrence.startDate <= rangeEnd && occurrence.endDate >= rangeStart);
          this.responseCache.set(cacheKey, { expiresAt: entry.expiresAt, occurrences });
          return occurrences;
        }
      }
    }

    const endExclusive = addCalendarDays(rangeEnd, 1);
    const parameters = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '2500',
      timeMin: localMidnightRfc3339(rangeStart),
      timeMax: localMidnightRfc3339(endExclusive),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone
    });
    const calendarPath = encodeURIComponent(calendar.calendarId);
    const [apiEvents, colors] = await Promise.all([
      this.getAllPages<GoogleCalendarApiEvent>(
        `https://www.googleapis.com/calendar/v3/calendars/${calendarPath}/events?${parameters}`,
        accessToken,
        signal
      ),
      this.getColorPalette(accessToken)
    ]);
    const occurrences = apiEvents
      .filter((event) => event.status !== 'cancelled')
      .map((event) => normalizeGoogleEvent(event, calendar, colors));

    signal?.throwIfAborted();
    this.lastNetworkSuccessAt = Date.now();
    this.accountNetworkSuccess.set(calendar.accountId, this.lastNetworkSuccessAt);
    this.responseCache.set(cacheKey, { expiresAt: Date.now() + 60_000, occurrences });
    this.cachedKnownEvents.set([...new Map([...this.responseCache.values()]
      .flatMap((entry) => entry.occurrences)
      .map((occurrence) => [occurrence.eventId, occurrence.event])).values()]);
    return occurrences;
  }

  private async getAllPages<T>(initialUrl: string, accessToken: string, signal?: AbortSignal): Promise<T[]> {
    const values: T[] = [];
    let nextUrl: string | null = initialUrl;

    while (nextUrl) {
      const response = await this.getJson<{ items?: T[]; nextPageToken?: string }>(nextUrl, accessToken, signal);
      values.push(...(response.items ?? []));
      if (!response.nextPageToken) {
        nextUrl = null;
      } else {
        const url = new URL(initialUrl);
        url.searchParams.set('pageToken', response.nextPageToken);
        nextUrl = url.toString();
      }
    }

    return values;
  }

  private async getJson<T>(url: string, accessToken: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal
    });

    if (!response.ok) {
      let message = `Google Calendar respondió ${response.status}.`;
      try {
        const body = await response.json() as { error?: { message?: string } };
        message = body.error?.message ?? message;
      } catch {
        // Keep the HTTP status message when the response body is not JSON.
      }
      throw new GoogleCalendarApiError(response.status, message);
    }

    return response.json() as Promise<T>;
  }
}

class GoogleCalendarApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'GoogleCalendarApiError';
  }
}

export function normalizeGoogleEvent(
  event: GoogleCalendarApiEvent,
  calendar: ReturnType<CalendarSourceService['googleCalendars']>[number],
  colors?: GoogleCalendarColorsResponse
): CalendarDisplayOccurrence {
  if (!event.start || !event.end) {
    throw new Error('Google Calendar devolvió un evento sin inicio o fin.');
  }

  const allDay = Boolean(event.start.date && event.end.date);
  let startDate: CalendarDate;
  let endDate: CalendarDate;
  let startTime: string | undefined;
  let endTime: string | undefined;

  if (allDay) {
    startDate = event.start.date!;
    endDate = addCalendarDays(event.end.date!, -1);
  } else {
    const start = parseGoogleDateTime(event.start.dateTime!, event.start.timeZone);
    const end = parseGoogleDateTime(event.end.dateTime!, event.end.timeZone);
    startDate = formatCalendarDate(start);
    endDate = formatCalendarDate(end);
    startTime = formatLocalTime(start);
    endTime = formatLocalTime(end);

    if (end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0 && endDate > startDate) {
      endDate = addCalendarDays(endDate, -1);
    }
  }

  const occurrenceKey = event.originalStartTime?.dateTime
    ?? event.originalStartTime?.date
    ?? startDate;
  const sourceId = `${calendar.accountId}:${calendar.calendarId}:${event.id}:${occurrenceKey}`;
  const displayEvent: CalendarDisplayEvent = {
    id: sourceId,
    source: 'google',
    title: event.summary?.trim() || 'Evento de Google Calendar',
    startDate,
    endDate,
    startTime,
    endTime,
    allDay,
    color: resolveGoogleEventColor(event, calendar, colors),
    calendarColor: calendar.calendarColor,
    calendarName: calendar.name,
    calendarId: calendar.calendarId,
    accountId: calendar.accountId,
    accountEmail: calendar.accountEmail,
    description: event.description,
    location: event.location,
    htmlLink: event.htmlLink,
    attachments: event.attachments?.map(({ fileUrl, title, mimeType }) => ({ fileUrl, title, mimeType })),
    isRecurring: Boolean(event.recurringEventId)
  };

  return {
    eventId: sourceId,
    occurrenceKey,
    event: displayEvent,
    startDate,
    endDate
  };
}

export function localMidnightRfc3339(dateKey: CalendarDate): string {
  const date = parseCalendarDate(dateKey);
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteOffset / 60).toString().padStart(2, '0');
  const minutes = (absoluteOffset % 60).toString().padStart(2, '0');
  return `${dateKey}T00:00:00${sign}${hours}:${minutes}`;
}

export function parseGoogleDateTime(value: string, timeZone?: string): Date {
  if (/(?:Z|[+-]\d{2}:\d{2})$/i.test(value) || !timeZone) {
    return new Date(value);
  }

  const [datePart, timePart = '00:00:00'] = value.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second = '0'] = timePart.split(':');
  const milliseconds = Number.parseInt(second.split('.')[1]?.padEnd(3, '0') ?? '0', 10);
  const wallClockUtc = Date.UTC(year, month - 1, day, Number(hour), Number(minute), Number.parseInt(second, 10), milliseconds);
  let timestamp = wallClockUtc;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]));
    const representedUtc = Date.UTC(parts['year'], parts['month'] - 1, parts['day'], parts['hour'], parts['minute'], parts['second']);
    timestamp += wallClockUtc - representedUtc;
  }

  return new Date(timestamp);
}

function formatLocalTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

export function resolveGoogleEventColor(
  event: GoogleCalendarApiEvent,
  calendar: ReturnType<CalendarSourceService['googleCalendars']>[number],
  colors?: GoogleCalendarColorsResponse
): string {
  return (event.colorId ? colors?.event?.[event.colorId]?.background : undefined)
    ?? calendar.calendarColor
    ?? '#4285F4';
}