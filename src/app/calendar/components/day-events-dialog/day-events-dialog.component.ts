import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { CalendarEventOccurrence } from '../../../models/calendar-event-occurrence.model';
import { EventCategory } from '../../../models/event-category.model';
import { parseCalendarDate } from '../../../services/calendar-date.service';

@Component({
  selector: 'app-day-events-dialog',
  imports: [ButtonModule, DialogModule],
  templateUrl: './day-events-dialog.component.html',
  styleUrl: './day-events-dialog.component.css'
})
export class DayEventsDialogComponent {
  @Input() visible = false;
  @Input() date: string | null = null;
  @Input() events: CalendarEventOccurrence[] = [];
  @Input() categories: EventCategory[] = [];

  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly eventSelected = new EventEmitter<CalendarEventOccurrence>();

  onVisibleChange(visible: boolean): void {
    if (!visible) {
      this.closed.emit();
    }
  }

  get dateLabel(): string {
    if (!this.date) {
      return '';
    }

    const label = new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(parseCalendarDate(this.date));

    return label.charAt(0).toLocaleUpperCase('es-ES') + label.slice(1);
  }

  categoryColor(event: CalendarEventOccurrence['event']): string {
    return this.categories.find((category) => category.id === event.categoryId)?.color ?? '#687975';
  }
}