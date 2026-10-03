import { CalendarDate } from '../models/calendar-event.model';

export function formatCalendarDate(date: Date): CalendarDate {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function parseCalendarDate(date: CalendarDate): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function compareCalendarDates(first: CalendarDate, second: CalendarDate): number {
  return first.localeCompare(second);
}

export function calendarDateOrdinal(date: CalendarDate): number {
  const parsedDate = parseCalendarDate(date);
  return Date.UTC(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate()) / 86_400_000;
}

export function addCalendarDays(date: CalendarDate, dayOffset: number): CalendarDate {
  const result = parseCalendarDate(date);
  result.setDate(result.getDate() + dayOffset);
  return formatCalendarDate(result);
}