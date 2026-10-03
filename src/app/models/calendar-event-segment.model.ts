import { CalendarEventOccurrence } from './calendar-event-occurrence.model';

export interface CalendarEventSegment {
  eventId: string;
  occurrenceStartDate: string;
  occurrence: CalendarEventOccurrence;
  weekIndex: number;
  startColumn: number;
  endColumn: number;
  lane: number;
  isStart: boolean;
  isEnd: boolean;
}