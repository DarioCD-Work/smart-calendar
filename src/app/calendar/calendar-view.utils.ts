import { CalendarViewMode } from '../models/calendar-view-mode.model';
import { addCalendarDays, formatCalendarDate, parseCalendarDate } from '../services/calendar-date.service';
import { CalendarDay } from './calendar-day.model';
import { generateCalendarDays, isSameCalendarDate } from './calendar-date.utils';

export function generateViewDays(
  mode: CalendarViewMode,
  anchor: Date,
  today: Date,
  selectedDate: Date | null
): CalendarDay[] {
  if (mode === 'month') {
    return generateCalendarDays(anchor, today, selectedDate);
  }

  const anchorKey = formatCalendarDate(anchor);
  const firstDate = mode === 'week'
    ? addCalendarDays(anchorKey, -((anchor.getDay() + 6) % 7))
    : anchorKey;
  const dayCount = mode === 'week' ? 7 : mode === '15-days' ? 15 : 30;
  const todayKey = formatCalendarDate(today);
  const formatter = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  return Array.from({ length: dayCount }, (_, index) => {
    const dateKey = addCalendarDays(firstDate, index);
    const date = parseCalendarDate(dateKey);
    return {
      date,
      dateKey,
      dayNumber: date.getDate(),
      isCurrentMonth: true,
      isPast: dateKey < todayKey,
      isToday: dateKey === todayKey,
      isFuture: dateKey > todayKey,
      isSelected: selectedDate !== null && isSameCalendarDate(date, selectedDate),
      accessibleLabel: formatter.format(date)
    };
  });
}

export function viewRowLengths(mode: CalendarViewMode, dayCount: number): number[] {
  if (mode === '15-days') {
    return [7, 8];
  }
  if (mode === 'week') {
    return [7];
  }
  return Array.from({ length: Math.ceil(dayCount / 7) }, (_, index) => Math.min(7, dayCount - index * 7));
}

export function formatCalendarRange(start: Date, end: Date): string {
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric'
  }).formatRange(start, end);
}