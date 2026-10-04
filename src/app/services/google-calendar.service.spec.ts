import { GoogleCalendarConfig } from '../models/external-calendar.model';
import { GoogleCalendarAccountView } from '../models/google-account.model';
import { GoogleCalendarApiEvent } from '../models/google-calendar-api.model';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { formatCalendarDate } from './calendar-date.service';
import { CalendarSourceService } from './calendar-source.service';
import { GoogleCalendarAuthService } from './google-calendar-auth.service';
import { GoogleCalendarService } from './google-calendar.service';
import {
  localMidnightRfc3339,
  normalizeGoogleEvent,
  parseGoogleDateTime,
  resolveGoogleEventColor
} from './google-calendar.service';

const calendar: GoogleCalendarConfig = {
  id: 'google:reader%40example.com:team',
  provider: 'google',
  accountId: 'reader@example.com',
  accountEmail: 'reader@example.com',
  calendarId: 'team',
  name: 'Trabajo',
  calendarColor: '#3F6C9C',
  visible: true,
  primary: false,
  timeZone: 'America/Los_Angeles'
};

describe('Google Calendar event normalization', () => {
  it('converts the exclusive all-day end into an inclusive display date', () => {
    const event: GoogleCalendarApiEvent = {
      id: 'vacation',
      summary: 'Vacaciones',
      start: { date: '2026-10-10' },
      end: { date: '2026-10-15' }
    };

    const occurrence = normalizeGoogleEvent(event, calendar);

    expect(occurrence.startDate).toBe('2026-10-10');
    expect(occurrence.endDate).toBe('2026-10-14');
    expect(occurrence.event.source).toBe('google');
    expect(occurrence.event.color).toBe('#3F6C9C');
  });

  it('prefers event colorId, then calendarColor, then the default Google fallback', () => {
    const colors = {
      event: { '11': { background: '#A4BDFC', foreground: '#1D1D1D' } },
      calendar: { '9': { background: '#7AE7BF', foreground: '#1D1D1D' } }
    };
    const ownColorEvent: GoogleCalendarApiEvent = { id: 'custom', colorId: '11' };
    const calendarColorEvent: GoogleCalendarApiEvent = { id: 'inherited' };
    const noCalendarColor = { ...calendar, calendarColor: undefined };

    expect(resolveGoogleEventColor(ownColorEvent, calendar, colors)).toBe('#A4BDFC');
    expect(resolveGoogleEventColor(calendarColorEvent, calendar, colors)).toBe('#3F6C9C');
    expect(resolveGoogleEventColor(calendarColorEvent, noCalendarColor, colors)).toBe('#4285F4');
  });

  it('resolves event colorId to a background hex instead of rendering the color ID', () => {
    const occurrence = normalizeGoogleEvent(
      { id: 'custom-color', summary: 'Creatina', colorId: '4', start: { date: '2026-10-10' }, end: { date: '2026-10-11' } },
      calendar,
      { event: { '4': { background: '#E1BEE7', foreground: '#202124' } } }
    );

    expect(occurrence.event.color).toBe('#E1BEE7');
    expect(occurrence.event.color).not.toBe('4');
  });

  it('keeps RFC3339 instants and displays them in the device local timezone', () => {
    const start = new Date('2026-10-10T17:30:00-07:00');
    const end = new Date('2026-10-10T18:45:00-07:00');
    const event: GoogleCalendarApiEvent = {
      id: 'meeting',
      summary: 'Reunión',
      start: { dateTime: '2026-10-10T17:30:00-07:00', timeZone: 'America/Los_Angeles' },
      end: { dateTime: '2026-10-10T18:45:00-07:00', timeZone: 'America/Los_Angeles' }
    };

    const occurrence = normalizeGoogleEvent(event, calendar);

    expect(occurrence.startDate).toBe(formatCalendarDate(start));
    expect(occurrence.endDate).toBe(formatCalendarDate(end));
    expect(occurrence.event.startTime).toBe(`${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`);
    expect(occurrence.event.endTime).toBe(`${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`);
  });

  it('interprets a dateTime without offset in its declared IANA timezone', () => {
    const instant = parseGoogleDateTime('2026-10-10T17:30:00', 'America/Los_Angeles');

    expect(instant.toISOString()).toBe('2026-10-11T00:30:00.000Z');
  });

  it('only treats a timed end at midnight as an exclusive day boundary', () => {
    const overnight = normalizeGoogleEvent({
      id: 'overnight',
      start: { dateTime: '2026-10-10T17:00:00-07:00' },
      end: { dateTime: '2026-10-11T00:00:00-07:00' }
    }, calendar);
    const fullDay = normalizeGoogleEvent({
      id: 'full-day',
      start: { dateTime: '2026-10-10T17:00:00-07:00' },
      end: { dateTime: '2026-10-11T17:00:00-07:00' }
    }, calendar);

    expect(overnight.endDate).toBe(overnight.startDate);
    expect(fullDay.endDate > fullDay.startDate).toBeTrue();
  });

  it('requests the full local day boundary with the device timezone offset', () => {
    const boundary = localMidnightRfc3339('2026-10-10');

    expect(boundary).toMatch(/^2026-10-10T00:00:00[+-]\d{2}:\d{2}$/);
  });
});

describe('GoogleCalendarService remembered accounts', () => {
  const rememberedAccount: GoogleCalendarAccountView = {
    accountId: 'reader@example.com',
    email: 'reader@example.com',
    configured: true,
    connected: false,
    calendars: []
  };

  function createService(silentAuthorizationSucceeds: boolean) {
    const activeAccountIds = signal<string[]>([]);
    const auth = {
      isConfigured: true,
      activeAccountIds,
      loadLibrary: jasmine.createSpy('loadLibrary').and.resolveTo(undefined),
      requestAccessToken: jasmine.createSpy('requestAccessToken'),
      storeAccessToken: jasmine.createSpy('storeAccessToken'),
      hasAccessToken: jasmine.createSpy('hasAccessToken').and.returnValue(false),
      forgetAccount: jasmine.createSpy('forgetAccount')
    } as unknown as GoogleCalendarAuthService;
    const source = {
      initialize: jasmine.createSpy('initialize').and.resolveTo(undefined),
      getGoogleAccountViews: jasmine.createSpy('getGoogleAccountViews').and.returnValue([rememberedAccount]),
      googleCalendars: jasmine.createSpy('googleCalendars').and.returnValue([])
    } as unknown as CalendarSourceService;

    (auth.requestAccessToken as jasmine.Spy).and.callFake(() => silentAuthorizationSucceeds
      ? Promise.resolve({ access_token: 'temporary-token', expires_in: 3600 })
      : Promise.reject(new Error('login_required')));

    TestBed.configureTestingModule({
      providers: [
        GoogleCalendarService,
        { provide: GoogleCalendarAuthService, useValue: auth },
        { provide: CalendarSourceService, useValue: source }
      ]
    });

    return { service: TestBed.inject(GoogleCalendarService), auth, source };
  }

  it('silently requests a token for a remembered account when GIS can restore authorization', async () => {
    const { service, auth } = createService(true);

    await service.initialize();

    expect(auth.requestAccessToken).toHaveBeenCalledOnceWith('reader@example.com', 'none');
    expect(auth.storeAccessToken).toHaveBeenCalledOnceWith('reader@example.com', {
      access_token: 'temporary-token',
      expires_in: 3600
    });
  });

  it('keeps the account configured but unconnected when silent authorization requires interaction', async () => {
    const { service, auth, source } = createService(false);

    await expectAsync(service.initialize()).toBeResolved();

    expect(source.getGoogleAccountViews).toHaveBeenCalledWith([]);
    expect(auth.requestAccessToken).toHaveBeenCalledOnceWith('reader@example.com', 'none');
    expect(auth.storeAccessToken).not.toHaveBeenCalled();
    expect(service.connectedAccountIds()).toEqual([]);
    expect(rememberedAccount.configured).toBeTrue();
    expect(rememberedAccount.connected).toBeFalse();
  });
});