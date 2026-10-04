import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CalendarDisplayOccurrence } from '../../../models/calendar-display-event.model';
import { parseCalendarDate } from '../../../services/calendar-date.service';
import { CalendarDay } from '../../calendar-day.model';
import { formatCalendarRange } from '../../calendar-view.utils';

export interface CalendarAgendaDay {
  day: CalendarDay;
  events: CalendarDisplayOccurrence[];
}

@Component({
  selector: 'app-calendar-agenda-view',
  templateUrl: './calendar-agenda-view.component.html',
  styleUrl: './calendar-agenda-view.component.css'
})
export class CalendarAgendaViewComponent {
  @Input() days: CalendarAgendaDay[] = [];
  @Output() readonly daySelected = new EventEmitter<CalendarDay>();
  @Output() readonly eventSelected = new EventEmitter<CalendarDisplayOccurrence>();

  dayLabel(day: CalendarDay): string {
    return new Intl.DateTimeFormat('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(day.date);
  }

  occurrenceRange(occurrence: CalendarDisplayOccurrence): string {
    return formatCalendarRange(parseCalendarDate(occurrence.startDate), parseCalendarDate(occurrence.endDate));
  }
}