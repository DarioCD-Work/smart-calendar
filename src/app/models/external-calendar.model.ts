export interface LocalCalendarPreference {
  id: string;
  provider: 'local';
  categoryId: string;
  visible: boolean;
}

export interface GoogleCalendarConfig {
  id: string;
  provider: 'google';
  accountId: string;
  accountEmail: string;
  calendarId: string;
  name: string;
  calendarColor?: string;
  visible: boolean;
  primary: boolean;
  timeZone?: string;
}

export type CalendarSourcePreference = LocalCalendarPreference | GoogleCalendarConfig;
