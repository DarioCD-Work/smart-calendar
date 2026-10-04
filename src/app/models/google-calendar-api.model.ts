export interface GoogleCalendarListResponse {
  items?: GoogleCalendarListEntry[];
  nextPageToken?: string;
}

export interface GoogleCalendarListEntry {
  id: string;
  summary?: string;
  primary?: boolean;
  backgroundColor?: string;
  foregroundColor?: string;
  colorId?: string;
  timeZone?: string;
  selected?: boolean;
  deleted?: boolean;
}

export interface GoogleCalendarColorsResponse {
  calendar?: Record<string, { background?: string; foreground?: string }>;
  event?: Record<string, { background?: string; foreground?: string }>;
}

export interface GoogleCalendarEventsResponse {
  items?: GoogleCalendarApiEvent[];
  nextPageToken?: string;
}

export interface GoogleCalendarApiEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  colorId?: string;
  start?: GoogleCalendarDateTime;
  end?: GoogleCalendarDateTime;
  recurringEventId?: string;
  originalStartTime?: GoogleCalendarDateTime;
  eventType?: string;
  attachments?: GoogleCalendarAttachment[];
}

export interface GoogleCalendarAttachment {
  fileUrl?: string;
  title?: string;
  mimeType?: string;
}

export interface GoogleCalendarDateTime {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}
