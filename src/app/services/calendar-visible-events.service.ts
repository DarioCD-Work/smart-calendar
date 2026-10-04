import { inject, Injectable } from '@angular/core';
import { CalendarDate } from '../models/calendar-event.model';
import { CalendarDisplayOccurrence } from '../models/calendar-display-event.model';
import { CalendarEventService } from './calendar-event.service';
import { CalendarRecurrenceService } from './calendar-recurrence.service';
import { CalendarSourceService } from './calendar-source.service';
import { GoogleEventFilterService } from './google-event-filter.service';

@Injectable({ providedIn: 'root' })
export class CalendarVisibleEventsService {
  private readonly events = inject(CalendarEventService);
  private readonly recurrence = inject(CalendarRecurrenceService);
  private readonly sources = inject(CalendarSourceService);
  private readonly filters = inject(GoogleEventFilterService);

  localOccurrences(start: CalendarDate, end: CalendarDate): CalendarDisplayOccurrence[] {
    return this.recurrence.getOccurrences(this.events.events(), start, end)
      .filter(occurrence => this.sources.isLocalCalendarVisible(occurrence.event.categoryId))
      .map(occurrence => {
        const category = this.events.categories().find(item => item.id === occurrence.event.categoryId);
        return {
          eventId: `local:${occurrence.eventId}:${occurrence.startDate}`,
          occurrenceKey: `${occurrence.eventId}:${occurrence.startDate}`,
          startDate: occurrence.startDate,
          endDate: occurrence.endDate,
          event: {
            id: occurrence.event.id,
            source: 'local' as const,
            title: occurrence.event.title,
            startDate: occurrence.startDate,
            endDate: occurrence.endDate,
            startTime: occurrence.event.startTime,
            endTime: occurrence.event.endTime,
            allDay: occurrence.event.allDay,
            categoryId: occurrence.event.categoryId,
            recurrence: occurrence.event.recurrence,
            color: category?.color,
            calendarName: category?.name ?? 'Local',
            description: occurrence.event.notes,
            localEvent: occurrence.event
          }
        };
      });
  }

  googleOccurrences(occurrences: CalendarDisplayOccurrence[]): CalendarDisplayOccurrence[] {
    const calendars = this.sources.googleCalendars().filter(calendar => calendar.visible);
    return this.filters.visibleOccurrences(occurrences.filter(({ event }) =>
      calendars.some(calendar => calendar.accountId === event.accountId && calendar.calendarId === event.calendarId)));
  }
}