import { CalendarDisplayOccurrence } from './calendar-display-event.model';

export interface CalendarEventSegment {
  eventId: string;
  occurrenceStartDate: string;
  occurrence: CalendarDisplayOccurrence;
  weekIndex: number;
  startColumn: number;
  endColumn: number;
  lane: number;
  isStart: boolean;
  isEnd: boolean;
}