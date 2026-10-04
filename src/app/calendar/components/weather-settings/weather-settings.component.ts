import { Component, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { WeatherLocation } from '../../../models/weather.model';
import { WeatherService } from '../../../services/weather.service';

@Component({
  selector: 'app-weather-settings',
  imports: [FormsModule],
  templateUrl: './weather-settings.component.html',
  styleUrl: './weather-settings.component.css'
})
export class WeatherSettingsComponent implements OnDestroy {
  readonly weather = inject(WeatherService);
  readonly results = signal<WeatherLocation[]>([]);
  readonly searching = signal(false);
  readonly saving = signal(false);
  readonly message = signal<string | null>(null);
  query = '';
  private search?: AbortController;

  async searchLocations(): Promise<void> {
    this.search?.abort();
    const controller = new AbortController();
    this.search = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    this.searching.set(true);
    this.message.set(null);
    try {
      const results = await this.weather.searchLocations(this.query, controller.signal);
      if (controller.signal.aborted) return;
      this.results.set(results);
      if (!results.length) this.message.set('No se encontraron ubicaciones.');
    } catch {
      if (this.search === controller) this.message.set('No se pudo buscar la ubicación. Comprueba la conexión.');
    } finally {
      clearTimeout(timeout);
      if (this.search === controller) this.searching.set(false);
    }
  }

  async configure(enabled: boolean, location?: WeatherLocation | null): Promise<void> {
    this.saving.set(true);
    this.message.set(null);
    try {
      await this.weather.configure(enabled, location);
      this.results.set([]);
      this.query = '';
    } catch {
      this.message.set('No se pudo guardar la configuración del tiempo.');
    } finally {
      this.saving.set(false);
    }
  }

  ngOnDestroy(): void {
    this.search?.abort();
  }
}