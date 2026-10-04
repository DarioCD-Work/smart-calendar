export interface GoogleEventFilter {
  id: string;
  accountId: string;
  calendarId?: string;
  type: 'title-exact';
  value: string;
  enabled: boolean;
}

export function normalizeGoogleEventTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').normalize('NFC').toLowerCase();
}