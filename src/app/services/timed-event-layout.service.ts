import { Injectable } from '@angular/core';
import { CalendarDisplayOccurrence } from '../models/calendar-display-event.model';

export interface TimedEventLayout {
  occurrence: CalendarDisplayOccurrence;
  startMinutes: number;
  endMinutes: number;
  topPercent: number;
  heightPercent: number;
  column: number;
  columnCount: number;
  leftPercent: number;
  widthPercent: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface TimedDayLayout {
  timed: TimedEventLayout[];
  allDay: CalendarDisplayOccurrence[];
  untimed: CalendarDisplayOccurrence[];
}

function minutes(value: string | undefined): number | null {
  if (!value || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minute] = value.split(':').map(Number);
  return hours * 60 + minute;
}

@Injectable({ providedIn: 'root' })
export class TimedEventLayoutService {
  calculateDayLayout(occurrences: readonly CalendarDisplayOccurrence[], date: string): TimedDayLayout {
    const visible = [...new Map(occurrences.filter(occurrence =>
      occurrence.startDate <= date && occurrence.endDate >= date)
      .map(occurrence => [occurrence.eventId, occurrence])).values()];
    const layout: TimedDayLayout = { timed: [], allDay: [], untimed: [] };
    for (const occurrence of visible) {
      if (occurrence.event.allDay) {
        layout.allDay.push(occurrence);
        continue;
      }
      const start = date > occurrence.startDate ? 0 : minutes(occurrence.event.startTime);
      const end = date < occurrence.endDate
        || (occurrence.event.source === 'google' && occurrence.event.endTime === '00:00')
        ? 1440 : minutes(occurrence.event.endTime);
      if (start === null || end === null || end <= start) {
        if (end === 0 && date > occurrence.startDate) continue;
        layout.untimed.push(occurrence);
        continue;
      }
      layout.timed.push({
        occurrence, startMinutes: start, endMinutes: end,
        topPercent: start / 1440 * 100, heightPercent: (end - start) / 1440 * 100,
        column: 0, columnCount: 1, leftPercent: 0, widthPercent: 100,
        continuesBefore: date > occurrence.startDate,
        continuesAfter: date < occurrence.endDate
      });
    }
    layout.timed.sort((first, second) => first.startMinutes - second.startMinutes
      || (second.endMinutes - second.startMinutes) - (first.endMinutes - first.startMinutes)
      || first.occurrence.eventId.localeCompare(second.occurrence.eventId));
    let group: TimedEventLayout[] = [];
    let groupEnd = -1;
    for (const event of layout.timed) {
      if (group.length && event.startMinutes >= groupEnd) {
        this.assignColumns(group);
        group = [];
      }
      group.push(event);
      groupEnd = Math.max(group.length === 1 ? -1 : groupEnd, event.endMinutes);
    }
    this.assignColumns(group);
    return layout;
  }

  private assignColumns(group: TimedEventLayout[]): void {
    const occupiedUntil: number[] = [];
    for (const event of group) {
      let column = occupiedUntil.findIndex(end => end <= event.startMinutes);
      if (column < 0) column = occupiedUntil.length;
      occupiedUntil[column] = event.endMinutes;
      event.column = column;
    }
    for (const event of group) {
      let span = 1;
      for (let column = event.column + 1; column < occupiedUntil.length; column += 1) {
        if (group.some(other => other.column === column
          && other.startMinutes < event.endMinutes && other.endMinutes > event.startMinutes)) break;
        span += 1;
      }
      event.columnCount = occupiedUntil.length;
      event.leftPercent = event.column / event.columnCount * 100;
      event.widthPercent = span / event.columnCount * 100;
    }
  }
}