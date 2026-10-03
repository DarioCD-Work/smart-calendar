import { CalendarDate, CalendarEvent } from './calendar-event.model';

export interface CalendarEventOccurrence {
  eventId: string;
  event: CalendarEvent;
  startDate: CalendarDate;
  endDate: CalendarDate;
}