import { GoogleCalendarConfig } from './external-calendar.model';

export interface GoogleCalendarAccountConfig {
  accountId: string;
  email: string;
  name?: string;
  picture?: string;
}

export interface GoogleCalendarAccountView extends GoogleCalendarAccountConfig {
  configured: boolean;
  connected: boolean;
  calendars: GoogleCalendarConfig[];
}
