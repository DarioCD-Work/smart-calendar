import { Injectable, inject, signal } from '@angular/core';
import { CalendarDisplayOccurrence } from '../models/calendar-display-event.model';
import { GoogleEventFilter, normalizeGoogleEventTitle } from '../models/google-event-filter.model';
import { CalendarStorageService } from './calendar-storage.service';

@Injectable({ providedIn: 'root' })
export class GoogleEventFilterService {
  private readonly storage = inject(CalendarStorageService);
  private readonly storedFilters = signal<GoogleEventFilter[]>([]);
  private initialization?: Promise<void>;
  private writeQueue: Promise<void> = Promise.resolve();

  readonly filters = this.storedFilters.asReadonly();

  initialize(): Promise<void> {
    this.initialization ??= this.storage.getGoogleEventFilters().then((filters) => {
      this.storedFilters.set(filters);
    }).catch((error: unknown) => {
      this.initialization = undefined;
      throw error;
    });
    return this.initialization;
  }

  visibleOccurrences(occurrences: readonly CalendarDisplayOccurrence[]): CalendarDisplayOccurrence[] {
    const filters = this.filters().filter((filter) => filter.enabled);
    return occurrences.filter(({ event }) => event.source !== 'google' || !filters.some((filter) =>
      filter.accountId === event.accountId
      && (!filter.calendarId || filter.calendarId === event.calendarId)
      && filter.type === 'title-exact'
      && normalizeGoogleEventTitle(filter.value) === normalizeGoogleEventTitle(event.title)
    ));
  }

  hideTitle(accountId: string, calendarId: string | undefined, title: string): Promise<void> {
    return this.enqueue(async () => {
      await this.initialize();
      const value = title.trim().replace(/\s+/g, ' ');
      if (!value) {
        return;
      }
      const filter: GoogleEventFilter = {
        id: JSON.stringify([accountId, calendarId ?? null, 'title-exact', normalizeGoogleEventTitle(value)]),
        accountId,
        ...(calendarId ? { calendarId } : {}),
        type: 'title-exact',
        value,
        enabled: true
      };
      await this.storage.saveGoogleEventFilter(filter);
      this.storedFilters.update((filters) => [...filters.filter((item) => item.id !== filter.id), filter]);
    });
  }

  removeFilter(id: string): Promise<void> {
    return this.enqueue(async () => {
      await this.initialize();
      await this.storage.deleteGoogleEventFilter(id);
      this.storedFilters.update((filters) => filters.filter((filter) => filter.id !== id));
    });
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.writeQueue.then(operation);
    this.writeQueue = result.catch(() => undefined);
    return result;
  }
}