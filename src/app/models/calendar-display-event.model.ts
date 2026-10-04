import { CalendarEvent } from './calendar-event.model';

export interface CalendarDisplayEvent {
  id: string;
  source: 'local' | 'google';
  title: string;
  startDate: string;
  endDate: string;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  categoryId?: string;
  recurrence?: CalendarEvent['recurrence'];
  color?: string;
  calendarColor?: string;
  calendarName?: string;
  calendarId?: string;
  accountId?: string;
  accountEmail?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  isRecurring?: boolean;
  localEvent?: CalendarEvent;
}

export interface CalendarDisplayOccurrence {
  eventId: string;
  occurrenceKey: string;
  event: CalendarDisplayEvent;
  startDate: string;
  endDate: string;
}
