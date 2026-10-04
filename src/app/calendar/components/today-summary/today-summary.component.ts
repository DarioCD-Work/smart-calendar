import { Component, computed, EventEmitter, inject, Output, ViewChild } from '@angular/core';
import { Popover, PopoverModule } from 'primeng/popover';
import { CalendarDisplayOccurrence } from '../../../models/calendar-display-event.model';
import { CalendarVisibleEventsService } from '../../../services/calendar-visible-events.service';
import { GoogleCalendarService } from '../../../services/google-calendar.service';
import { WallClockService } from '../../../services/wall-clock.service';
import { formatCalendarDate, parseCalendarDate } from '../../../services/calendar-date.service';
import { formatCalendarRange } from '../../calendar-view.utils';

@Component({
  selector: 'app-today-summary',
  imports: [PopoverModule],
  templateUrl: './today-summary.component.html',
  styleUrl: './today-summary.component.css'
})
export class TodaySummaryComponent {
  private readonly visibleEvents = inject(CalendarVisibleEventsService);
  private readonly google = inject(GoogleCalendarService);
  private readonly clock = inject(WallClockService);
  @ViewChild(Popover) private panel?: Popover;
  @Output() readonly eventSelected = new EventEmitter<CalendarDisplayOccurrence>();

  readonly today = computed(() => formatCalendarDate(new Date(this.clock.now())));
  readonly dateLabel = computed(() => {
    const label = new Intl.DateTimeFormat('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long'
    }).format(parseCalendarDate(this.today()));
    return label.charAt(0).toLocaleUpperCase('es-ES') + label.slice(1);
  });
  readonly events = computed(() => {
    const today = this.today();
    const google = this.visibleEvents.googleOccurrences([...this.google.occurrences(), ...this.google.todayOccurrences()]);
    const events = [...this.visibleEvents.localOccurrences(today, today), ...google]
      .filter(occurrence => occurrence.startDate <= today && occurrence.endDate >= today);
    return [...new Map(events.map(occurrence => [occurrence.eventId, occurrence])).values()]
      .sort((first, second) => Number(second.event.allDay) - Number(first.event.allDay)
        || (first.event.startTime ?? first.event.endTime ?? '').localeCompare(second.event.startTime ?? second.event.endTime ?? '')
        || first.event.title.localeCompare(second.event.title, 'es'));
  });

  select(occurrence: CalendarDisplayOccurrence): void {
    this.panel?.hide();
    this.eventSelected.emit(occurrence);
  }

  occurrenceRange(occurrence: CalendarDisplayOccurrence): string {
    return formatCalendarRange(parseCalendarDate(occurrence.startDate), parseCalendarDate(occurrence.endDate));
  }
}