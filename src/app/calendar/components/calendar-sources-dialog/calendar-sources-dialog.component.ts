import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { EventCategory } from '../../../models/event-category.model';
import { GoogleCalendarAccountView } from '../../../models/google-account.model';
import { CalendarDisplayEvent } from '../../../models/calendar-display-event.model';
import { GoogleEventFilter, normalizeGoogleEventTitle } from '../../../models/google-event-filter.model';

export interface LocalCalendarView {
  category: EventCategory;
  visible: boolean;
}

@Component({
  selector: 'app-calendar-sources-dialog',
  imports: [ButtonModule, DialogModule, FormsModule],
  templateUrl: './calendar-sources-dialog.component.html',
  styleUrl: './calendar-sources-dialog.component.css'
})
export class CalendarSourcesDialogComponent {
  @Input() visible = false;
  @Input() localCalendars: LocalCalendarView[] = [];
  @Input() googleAccounts: GoogleCalendarAccountView[] = [];
  @Input() googleConfigured = false;
  @Input() loading = false;
  @Input() error: string | null = null;
  @Input() eventFilters: readonly GoogleEventFilter[] = [];
  @Input() knownGoogleEvents: readonly CalendarDisplayEvent[] = [];
  @Input() filterError: string | null = null;

  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly localVisibilityChanged = new EventEmitter<{ categoryId: string; visible: boolean }>();
  @Output() readonly googleVisibilityChanged = new EventEmitter<{ calendarId: string; visible: boolean }>();
  @Output() readonly connectGoogle = new EventEmitter<void>();
  @Output() readonly reconnectGoogle = new EventEmitter<string>();
  @Output() readonly disconnectGoogle = new EventEmitter<string>();
  @Output() readonly titleHidden = new EventEmitter<{ accountId: string; calendarId?: string; title: string }>();
  @Output() readonly filterRemoved = new EventEmitter<string>();

  filterAccountId: string | null = null;
  filterCalendarId = '';
  titleSearch = '';

  get filterAccount(): GoogleCalendarAccountView | undefined {
    return this.googleAccounts.find((account) => account.accountId === this.filterAccountId);
  }

  get uniqueTitles(): string[] {
    const titles = new Map<string, string>();
    const matchingEvents = this.knownGoogleEvents.filter((event) =>
      event.source === 'google'
      && event.accountId === this.filterAccountId
      && (!this.filterCalendarId || event.calendarId === this.filterCalendarId)
    );
    const matchingRules = this.eventFilters.filter((filter) =>
      filter.accountId === this.filterAccountId && (filter.calendarId ?? '') === this.filterCalendarId
    );
    for (const title of [...matchingEvents.map((event) => event.title), ...matchingRules.map((filter) => filter.value)]) {
      const normalized = normalizeGoogleEventTitle(title);
      if (normalized && !titles.has(normalized)) {
        titles.set(normalized, title.trim().replace(/\s+/g, ' '));
      }
    }
    const search = normalizeGoogleEventTitle(this.titleSearch);
    return [...titles.entries()]
      .filter(([normalized]) => normalized.includes(search))
      .map(([, title]) => title)
      .sort((first, second) => first.localeCompare(second, 'es'));
  }

  filtersForAccount(accountId: string): GoogleEventFilter[] {
    return this.eventFilters.filter((filter) => filter.enabled && filter.accountId === accountId);
  }

  filterScopeName(filter: GoogleEventFilter): string {
    if (!filter.calendarId) {
      return 'Todos los calendarios de esta cuenta';
    }
    return this.googleAccounts.find((account) => account.accountId === filter.accountId)
      ?.calendars.find((calendar) => calendar.calendarId === filter.calendarId)?.name ?? filter.calendarId;
  }

  openEventFilters(account: GoogleCalendarAccountView): void {
    this.filterAccountId = account.accountId;
    this.filterCalendarId = account.calendars[0]?.calendarId ?? '';
    this.titleSearch = '';
  }

  titleFilter(title: string): GoogleEventFilter | undefined {
    return this.eventFilters.find((filter) => filter.enabled
      && filter.accountId === this.filterAccountId
      && (filter.calendarId ?? '') === this.filterCalendarId
      && filter.type === 'title-exact'
      && normalizeGoogleEventTitle(filter.value) === normalizeGoogleEventTitle(title));
  }

  setTitleHidden(title: string, event: Event): void {
    if (!this.filterAccountId) {
      return;
    }
    if ((event.target as HTMLInputElement).checked) {
      this.titleHidden.emit({
        accountId: this.filterAccountId,
        ...(this.filterCalendarId ? { calendarId: this.filterCalendarId } : {}),
        title
      });
    } else {
      const filter = this.titleFilter(title);
      if (filter) {
        this.filterRemoved.emit(filter.id);
      }
    }
  }

  close(): void {
    this.filterAccountId = null;
    this.closed.emit();
  }

  onVisibleChange(visible: boolean): void {
    if (!visible) {
      this.close();
    }
  }

  setLocalVisibility(categoryId: string, event: Event): void {
    this.localVisibilityChanged.emit({
      categoryId,
      visible: (event.target as HTMLInputElement).checked
    });
  }

  setGoogleVisibility(calendarId: string, event: Event): void {
    this.googleVisibilityChanged.emit({
      calendarId,
      visible: (event.target as HTMLInputElement).checked
    });
  }
}