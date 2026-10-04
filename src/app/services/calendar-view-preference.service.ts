import { Injectable, inject, signal } from '@angular/core';
import { CalendarViewMode } from '../models/calendar-view-mode.model';
import { CalendarStorageService } from './calendar-storage.service';

@Injectable({ providedIn: 'root' })
export class CalendarViewPreferenceService {
  private readonly storage = inject(CalendarStorageService);
  private readonly selectedMode = signal<CalendarViewMode>('month');
  private initialization?: Promise<void>;
  private writeQueue: Promise<void> = Promise.resolve();
  private selectionVersion = 0;

  readonly viewMode = this.selectedMode.asReadonly();

  initialize(): Promise<void> {
    const version = this.selectionVersion;
    this.initialization ??= this.storage.getCalendarViewMode().then((mode) => {
      if (version === this.selectionVersion) {
        this.selectedMode.set(mode);
      }
    });
    return this.initialization;
  }

  selectView(mode: CalendarViewMode): Promise<void> {
    this.selectionVersion += 1;
    this.selectedMode.set(mode);
    const saved = this.writeQueue.then(() => this.storage.saveCalendarViewMode(mode));
    this.writeQueue = saved.catch(() => undefined);
    return saved;
  }
}