import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { CalendarDisplayOccurrence } from '../../../models/calendar-display-event.model';
import { CalendarEvent } from '../../../models/calendar-event.model';
import { EventCategory } from '../../../models/event-category.model';
import { RecurrenceRule } from '../../../models/calendar-event.model';
import { parseCalendarDate } from '../../../services/calendar-date.service';

@Component({
  selector: 'app-event-details-dialog',
  imports: [ButtonModule, DialogModule],
  templateUrl: './event-details-dialog.component.html',
  styleUrl: './event-details-dialog.component.css'
})
export class EventDetailsDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() occurrence: CalendarDisplayOccurrence | null = null;
  @Input() categories: EventCategory[] = [];

  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly editRequested = new EventEmitter<CalendarEvent>();
  @Output() readonly deleteRequested = new EventEmitter<CalendarDisplayOccurrence>();

  confirmingDelete = false;

  onVisibleChange(visible: boolean): void {
    if (!visible) {
      this.closed.emit();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true || changes['occurrence']) {
      this.confirmingDelete = false;
    }
  }

  get category(): EventCategory | undefined {
    return this.categories.find((item) => item.id === this.occurrence?.event.categoryId);
  }

  get localEvent(): CalendarEvent | null {
    return this.occurrence?.event.source === 'local' ? this.occurrence.event.localEvent ?? null : null;
  }

  formatDate(date: string): string {
    const label = new Intl.DateTimeFormat('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(parseCalendarDate(date));

    return label.charAt(0).toLocaleUpperCase('es-ES') + label.slice(1);
  }

  formatDateRange(startDate: string, endDate: string): string {
    return startDate === endDate
      ? this.formatDate(startDate)
      : `${this.formatDate(startDate)} – ${this.formatDate(endDate)}`;
  }

  recurrenceLabel(rule: RecurrenceRule): string {
    if (rule.frequency === 'daily') {
      return rule.interval === 1 ? 'Todos los días' : `Cada ${rule.interval} días`;
    }

    if (rule.frequency === 'yearly') {
      return rule.interval === 1 ? 'Todos los años' : `Cada ${rule.interval} años`;
    }

    const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const days = (rule.daysOfWeek ?? []).map((day) => dayNames[day]).filter(Boolean).join(', ');
    const interval = rule.interval === 1 ? 'Cada semana' : `Cada ${rule.interval} semanas`;

    return days ? `${interval}: ${days}` : interval;
  }

  requestDelete(): void {
    if (this.confirmingDelete && this.occurrence?.event.source === 'local') {
      this.deleteRequested.emit(this.occurrence);
      return;
    }

    if (this.occurrence?.event.source === 'local') {
      this.confirmingDelete = true;
    }
  }
}