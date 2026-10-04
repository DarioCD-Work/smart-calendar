import { CalendarEvent } from './calendar-event.model';
import { EventCategory } from './event-category.model';
import { CalendarSourcePreference } from './external-calendar.model';
import { GoogleCalendarAccountConfig } from './google-account.model';
import { GoogleEventFilter } from './google-event-filter.model';

export const backupPreferenceKeys = ['calendarViewMode', 'weatherEnabled', 'weatherLocation'] as const;

export interface SmartCalendarBackupData {
  events: CalendarEvent[];
  categories: EventCategory[];
  calendarSources: CalendarSourcePreference[];
  googleAccounts: GoogleCalendarAccountConfig[];
  googleEventFilters: GoogleEventFilter[];
  appPreferences: { key: string; value: unknown }[];
}

export interface SmartCalendarBackupV1 {
  format: 'smart-calendar-backup';
  version: 1;
  exportedAt: string;
  data: SmartCalendarBackupData;
}

export type SmartCalendarBackup = SmartCalendarBackupV1;