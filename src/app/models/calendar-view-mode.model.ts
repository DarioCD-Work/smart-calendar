export type CalendarViewMode = 'month' | '15-days' | 'week' | 'agenda';

export const calendarViewOptions: { value: CalendarViewMode; label: string }[] = [
  { value: 'month', label: 'Mes' },
  { value: '15-days', label: '15 días' },
  { value: 'week', label: 'Semana' },
  { value: 'agenda', label: 'Agenda' }
];

export function isCalendarViewMode(value: unknown): value is CalendarViewMode {
  return calendarViewOptions.some((option) => option.value === value);
}