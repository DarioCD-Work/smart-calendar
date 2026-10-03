export type CalendarDate = string;

export interface CalendarEvent {
  id: string;
  title: string;
  startDate: CalendarDate;
  endDate: CalendarDate;
  startTime?: string;
  endTime?: string;
  allDay: boolean;
  categoryId?: string;
  notes?: string;
  recurrence?: RecurrenceRule;
  createdAt: string;
  updatedAt: string;
}

export type CalendarEventDraft = Omit<CalendarEvent, 'id' | 'createdAt' | 'updatedAt'>;

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'yearly';
  interval: number;
  daysOfWeek?: number[];
  endDate?: CalendarDate;
}