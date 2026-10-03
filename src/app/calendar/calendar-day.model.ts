export interface CalendarDay {
  date: Date;
  dateKey: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isPast: boolean;
  isToday: boolean;
  isFuture: boolean;
  isSelected: boolean;
  accessibleLabel: string;
}