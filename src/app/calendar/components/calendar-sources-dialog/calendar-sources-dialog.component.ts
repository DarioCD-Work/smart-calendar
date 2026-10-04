import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { EventCategory } from '../../../models/event-category.model';
import { GoogleCalendarAccountView } from '../../../models/google-account.model';

export interface LocalCalendarView {
  category: EventCategory;
  visible: boolean;
}

@Component({
  selector: 'app-calendar-sources-dialog',
  imports: [ButtonModule, DialogModule],
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

  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly localVisibilityChanged = new EventEmitter<{ categoryId: string; visible: boolean }>();
  @Output() readonly googleVisibilityChanged = new EventEmitter<{ calendarId: string; visible: boolean }>();
  @Output() readonly connectGoogle = new EventEmitter<void>();
  @Output() readonly reconnectGoogle = new EventEmitter<string>();
  @Output() readonly disconnectGoogle = new EventEmitter<string>();

  onVisibleChange(visible: boolean): void {
    if (!visible) {
      this.closed.emit();
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