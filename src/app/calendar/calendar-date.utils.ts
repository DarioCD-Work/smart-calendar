import { CalendarDay } from './calendar-day.model';
import { formatCalendarDate } from '../services/calendar-date.service';

const accessibleDateFormatter = new Intl.DateTimeFormat('es-ES', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric'
});

function calendarDateKey(date: Date): number {
  return date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate();
}

export function isSameCalendarDate(first: Date, second: Date): boolean {
  return calendarDateKey(first) === calendarDateKey(second);
}

export function generateCalendarDays(
  month: Date,
  today: Date,
  selectedDate: Date | null
): CalendarDay[] {
  const firstOfMonth = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const visibleDayCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
  const firstVisibleDate = new Date(
    firstOfMonth.getFullYear(),
    firstOfMonth.getMonth(),
    1 - mondayOffset
  );
  const todayKey = calendarDateKey(today);

  return Array.from({ length: visibleDayCount }, (_, index) => {
    const date = new Date(
      firstVisibleDate.getFullYear(),
      firstVisibleDate.getMonth(),
      firstVisibleDate.getDate() + index
    );

    const dateKey = calendarDateKey(date);

    return {
      date,
      dateKey: formatCalendarDate(date),
      dayNumber: date.getDate(),
      isCurrentMonth: date.getMonth() === month.getMonth(),
      isPast: dateKey < todayKey,
      isToday: dateKey === todayKey,
      isFuture: dateKey > todayKey,
      isSelected: selectedDate !== null && isSameCalendarDate(date, selectedDate),
      accessibleLabel: accessibleDateFormatter.format(date)
    };
  });
}