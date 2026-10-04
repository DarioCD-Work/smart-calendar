import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, EventEmitter, inject, OnDestroy, OnInit, Output } from '@angular/core';
import { PopoverModule } from 'primeng/popover';
import { GoogleCalendarService, GoogleSyncStatus } from '../../../services/google-calendar.service';
import { WeatherService } from '../../../services/weather.service';
import { WallClockService } from '../../../services/wall-clock.service';

const presentations: Record<GoogleSyncStatus, { label: string; icon: string }> = {
  idle: { label: 'Google en espera', icon: 'pi-clock' },
  syncing: { label: 'Sincronizando', icon: 'pi-sync' },
  success: { label: 'Sincronizado', icon: 'pi-check' },
  offline: { label: 'Sin conexión', icon: 'pi-wifi' },
  'auth-required': { label: 'Reconectar Google', icon: 'pi-exclamation-triangle' },
  error: { label: 'Error de sincronización', icon: 'pi-exclamation-triangle' }
};

@Component({
  selector: 'app-header-status',
  standalone: true,
  imports: [DatePipe, DecimalPipe, PopoverModule],
  templateUrl: './header-status.component.html',
  styleUrl: './header-status.component.css'
})
export class CalendarHeaderStatusComponent implements OnInit, OnDestroy {
  readonly weather = inject(WeatherService);
  readonly google = inject(GoogleCalendarService);
  private readonly clock = inject(WallClockService);
  @Output() readonly settingsRequested = new EventEmitter<void>();
  @Output() readonly reconnectRequested = new EventEmitter<string>();
  readonly presentation = computed(() => presentations[this.google.syncStatus()]);
  readonly attention = computed(() => ['offline', 'auth-required', 'error'].includes(this.google.syncStatus()));
  readonly relativeSync = computed(() => {
    const last = this.google.lastSuccessfulSync();
    if (!last) return '';
    const minutes = Math.max(0, Math.floor((this.clock.now() - last.getTime()) / 60_000));
    if (!minutes) return 'Ahora';
    return minutes < 60 ? `Hace ${minutes} min` : `Hace ${Math.floor(minutes / 60)} h`;
  });
  readonly nextSyncMinutes = computed(() => {
    const next = this.google.nextAutomaticSync();
    return next ? Math.max(1, Math.ceil((next - this.clock.now()) / 60_000)) : null;
  });

  statusLabel(status: GoogleSyncStatus): string {
    return presentations[status].label;
  }

  ngOnInit(): void {
    void this.weather.start();
  }

  ngOnDestroy(): void {
    this.weather.stop();
  }
}