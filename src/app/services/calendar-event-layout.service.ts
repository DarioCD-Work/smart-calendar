import { Injectable } from '@angular/core';
import { CalendarDisplayOccurrence } from '../models/calendar-display-event.model';
import { CalendarEventSegment } from '../models/calendar-event-segment.model';
import { addCalendarDays, calendarDateOrdinal, compareCalendarDates } from './calendar-date.service';

interface PendingSegment extends Omit<CalendarEventSegment, 'lane'> {}

@Injectable({ providedIn: 'root' })
export class CalendarEventLayoutService {
  getMultiDaySegments(
    occurrences: readonly CalendarDisplayOccurrence[],
    rangeStart: string,
    rangeEnd: string
  ): CalendarEventSegment[] {
    const pendingSegments = occurrences
      .filter((occurrence) => occurrence.endDate > occurrence.startDate)
      .flatMap((occurrence) => this.splitOccurrence(occurrence, rangeStart, rangeEnd))
      .sort((first, second) => first.weekIndex - second.weekIndex
        || first.startColumn - second.startColumn
        || second.endColumn - first.endColumn
        || (first.occurrence.event.startTime ?? '').localeCompare(second.occurrence.event.startTime ?? ''));

    const lanesByWeek = new Map<number, number[]>();

    return pendingSegments.map((segment) => {
      const lanes = lanesByWeek.get(segment.weekIndex) ?? [];
      let lane = lanes.findIndex((occupiedEnd) => occupiedEnd < segment.startColumn);

      if (lane === -1) {
        lane = lanes.length;
      }

      lanes[lane] = segment.endColumn;
      lanesByWeek.set(segment.weekIndex, lanes);

      return { ...segment, lane };
    });
  }

  laneCount(segments: readonly CalendarEventSegment[], weekIndex: number): number {
    return segments.reduce((count, segment) => segment.weekIndex === weekIndex
      ? Math.max(count, segment.lane + 1)
      : count, 0);
  }

  getOccupiedMultiDayLanes(
    segments: readonly CalendarEventSegment[],
    weekIndex: number,
    dayColumn: number
  ): number[] {
    return [...new Set(segments
      .filter((segment) => segment.weekIndex === weekIndex
        && segment.startColumn <= dayColumn
        && segment.endColumn >= dayColumn)
      .map((segment) => segment.lane))]
      .sort((first, second) => first - second);
  }

  private splitOccurrence(
    occurrence: CalendarDisplayOccurrence,
    rangeStart: string,
    rangeEnd: string
  ): PendingSegment[] {
    const visibleStart = compareCalendarDates(occurrence.startDate, rangeStart) < 0
      ? rangeStart
      : occurrence.startDate;
    const visibleEnd = compareCalendarDates(occurrence.endDate, rangeEnd) > 0
      ? rangeEnd
      : occurrence.endDate;

    if (compareCalendarDates(visibleStart, visibleEnd) > 0) {
      return [];
    }

    const firstVisibleOffset = calendarDateOrdinal(visibleStart) - calendarDateOrdinal(rangeStart);
    const lastVisibleOffset = calendarDateOrdinal(visibleEnd) - calendarDateOrdinal(rangeStart);
    const firstWeek = Math.floor(firstVisibleOffset / 7);
    const lastWeek = Math.floor(lastVisibleOffset / 7);
    const segments: PendingSegment[] = [];

    for (let weekIndex = firstWeek; weekIndex <= lastWeek; weekIndex += 1) {
      const weekStart = addCalendarDays(rangeStart, weekIndex * 7);
      const weekEnd = addCalendarDays(weekStart, 6);
      const segmentStart = compareCalendarDates(visibleStart, weekStart) > 0 ? visibleStart : weekStart;
      const segmentEnd = compareCalendarDates(visibleEnd, weekEnd) < 0 ? visibleEnd : weekEnd;

      segments.push({
        eventId: occurrence.eventId,
        occurrenceStartDate: occurrence.startDate,
        occurrence,
        weekIndex,
        startColumn: calendarDateOrdinal(segmentStart) - calendarDateOrdinal(weekStart),
        endColumn: calendarDateOrdinal(segmentEnd) - calendarDateOrdinal(weekStart),
        isStart: segmentStart === occurrence.startDate,
        isEnd: segmentEnd === occurrence.endDate
      });
    }

    return segments;
  }
}