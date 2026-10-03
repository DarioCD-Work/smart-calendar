import { Injectable } from '@angular/core';
import { CalendarDate, CalendarEvent } from '../models/calendar-event.model';
import { CalendarEventOccurrence } from '../models/calendar-event-occurrence.model';
import {
  addCalendarDays,
  calendarDateOrdinal,
  compareCalendarDates,
  parseCalendarDate
} from './calendar-date.service';

@Injectable({ providedIn: 'root' })
export class CalendarRecurrenceService {
  getOccurrences(
    events: readonly CalendarEvent[],
    rangeStart: CalendarDate,
    rangeEnd: CalendarDate
  ): CalendarEventOccurrence[] {
    if (compareCalendarDates(rangeStart, rangeEnd) > 0) {
      return [];
    }

    return events
      .flatMap((event) => this.getEventOccurrences(event, rangeStart, rangeEnd))
      .sort((first, second) => {
        const dateOrder = compareCalendarDates(first.startDate, second.startDate);
        return dateOrder || (first.event.startTime ?? '').localeCompare(second.event.startTime ?? '');
      });
  }

  private getEventOccurrences(
    event: CalendarEvent,
    rangeStart: CalendarDate,
    rangeEnd: CalendarDate
  ): CalendarEventOccurrence[] {
    if (compareCalendarDates(event.endDate, event.startDate) < 0) {
      return [];
    }

    const durationDays = calendarDateOrdinal(event.endDate) - calendarDateOrdinal(event.startDate);

    if (!event.recurrence) {
      return event.startDate <= rangeEnd && event.endDate >= rangeStart
        ? [this.createOccurrence(event, event.startDate, durationDays)]
        : [];
    }

    const firstStart = compareCalendarDates(event.startDate, addCalendarDays(rangeStart, -durationDays)) > 0
      ? event.startDate
      : addCalendarDays(rangeStart, -durationDays);
    const recurrenceEnd = event.recurrence.endDate ?? rangeEnd;
    const lastStart = compareCalendarDates(recurrenceEnd, rangeEnd) < 0 ? recurrenceEnd : rangeEnd;

    if (compareCalendarDates(firstStart, lastStart) > 0 || compareCalendarDates(lastStart, event.startDate) < 0) {
      return [];
    }

    const interval = Math.max(1, Math.floor(event.recurrence.interval || 1));
    let occurrenceStarts: CalendarDate[];

    switch (event.recurrence.frequency) {
      case 'daily':
        occurrenceStarts = this.getDailyStarts(event.startDate, firstStart, lastStart, interval);
        break;
      case 'weekly':
        occurrenceStarts = this.getWeeklyStarts(
          event.startDate,
          firstStart,
          lastStart,
          interval,
          event.recurrence.daysOfWeek
        );
        break;
      case 'yearly':
        occurrenceStarts = this.getYearlyStarts(event.startDate, firstStart, lastStart, interval);
        break;
    }

    return occurrenceStarts
      .map((startDate) => this.createOccurrence(event, startDate, durationDays))
      .filter((occurrence) => occurrence.endDate >= rangeStart && occurrence.startDate <= rangeEnd);
  }

  private createOccurrence(
    event: CalendarEvent,
    startDate: CalendarDate,
    durationDays: number
  ): CalendarEventOccurrence {
    return {
      eventId: event.id,
      event,
      startDate,
      endDate: addCalendarDays(startDate, durationDays)
    };
  }

  private getDailyStarts(
    seriesStart: CalendarDate,
    firstDate: CalendarDate,
    lastDate: CalendarDate,
    interval: number
  ): CalendarDate[] {
    const daysUntilFirst = Math.max(0, calendarDateOrdinal(firstDate) - calendarDateOrdinal(seriesStart));
    const firstInterval = Math.ceil(daysUntilFirst / interval) * interval;
    const starts: CalendarDate[] = [];

    for (let offset = firstInterval; ; offset += interval) {
      const date = addCalendarDays(seriesStart, offset);
      if (compareCalendarDates(date, lastDate) > 0) {
        break;
      }
      starts.push(date);
    }

    return starts;
  }

  private getWeeklyStarts(
    seriesStart: CalendarDate,
    firstDate: CalendarDate,
    lastDate: CalendarDate,
    interval: number,
    configuredDays: number[] | undefined
  ): CalendarDate[] {
    const startDate = parseCalendarDate(seriesStart);
    const selectedDays = new Set(configuredDays?.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6));

    if (selectedDays.size === 0) {
      selectedDays.add(startDate.getDay());
    }

    const startWeek = calendarDateOrdinal(addCalendarDays(seriesStart, -((startDate.getDay() + 6) % 7)));
    const starts: CalendarDate[] = [];

    for (let date = firstDate; compareCalendarDates(date, lastDate) <= 0; date = addCalendarDays(date, 1)) {
      const daysFromStart = calendarDateOrdinal(date) - calendarDateOrdinal(seriesStart);
      const weekIndex = Math.floor((calendarDateOrdinal(date) - startWeek) / 7);

      if (daysFromStart >= 0 && weekIndex % interval === 0 && selectedDays.has(parseCalendarDate(date).getDay())) {
        starts.push(date);
      }
    }

    return starts;
  }

  private getYearlyStarts(
    seriesStart: CalendarDate,
    firstDate: CalendarDate,
    lastDate: CalendarDate,
    interval: number
  ): CalendarDate[] {
    const seriesDate = parseCalendarDate(seriesStart);
    const firstYear = Math.max(seriesDate.getFullYear(), parseCalendarDate(firstDate).getFullYear());
    const lastYear = parseCalendarDate(lastDate).getFullYear();
    const starts: CalendarDate[] = [];

    for (let year = firstYear; year <= lastYear; year += 1) {
      if ((year - seriesDate.getFullYear()) % interval !== 0) {
        continue;
      }

      const lastDayOfMonth = new Date(year, seriesDate.getMonth() + 1, 0).getDate();
      const startDate = [
        year.toString().padStart(4, '0'),
        (seriesDate.getMonth() + 1).toString().padStart(2, '0'),
        Math.min(seriesDate.getDate(), lastDayOfMonth).toString().padStart(2, '0')
      ].join('-');

      if (startDate >= firstDate && startDate <= lastDate) {
        starts.push(startDate);
      }
    }

    return starts;
  }
}