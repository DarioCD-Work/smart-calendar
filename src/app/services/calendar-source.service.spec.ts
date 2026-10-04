import { TestBed } from '@angular/core/testing';
import { CalendarSourcePreference, GoogleCalendarConfig } from '../models/external-calendar.model';
import { CalendarStorageService } from './calendar-storage.service';
import { CalendarSourceService } from './calendar-source.service';

describe('CalendarSourceService', () => {
  let storage: jasmine.SpyObj<CalendarStorageService>;
  let sources: CalendarSourceService;

  beforeEach(async () => {
    storage = jasmine.createSpyObj<CalendarStorageService>('CalendarStorageService', [
      'getCalendarSourcePreferences',
      'getGoogleAccountConfigs',
      'saveCalendarSourcePreference',
      'saveGoogleAccountConfig',
      'saveGoogleCalendarsForAccount',
      'deleteGoogleCalendarsForAccount',
      'deleteGoogleAccountConfig'
    ]);
    storage.getCalendarSourcePreferences.and.resolveTo([]);
    storage.getGoogleAccountConfigs.and.resolveTo([]);
    storage.saveCalendarSourcePreference.and.callFake(async (preference) => preference);
    storage.saveGoogleAccountConfig.and.callFake(async (account) => account);
    storage.saveGoogleCalendarsForAccount.and.callFake(async (accountId, accountEmail, calendars) =>
      calendars.map((calendar) => ({
        ...calendar,
        id: `google:${accountId}:${calendar.calendarId}`,
        provider: 'google' as const,
        accountId,
        accountEmail
      }))
    );
    storage.deleteGoogleCalendarsForAccount.and.resolveTo();
    storage.deleteGoogleAccountConfig.and.resolveTo();

    TestBed.configureTestingModule({
      providers: [CalendarSourceService, { provide: CalendarStorageService, useValue: storage }]
    });
    sources = TestBed.inject(CalendarSourceService);
    await sources.initialize();
  });

  it('shows local categories by default and immediately reflects stored visibility changes', async () => {
    expect(sources.isLocalCalendarVisible('birthday')).toBeTrue();

    await sources.setLocalCalendarVisibility('birthday', false);

    expect(storage.saveCalendarSourcePreference).toHaveBeenCalledWith(jasmine.objectContaining({
      provider: 'local',
      categoryId: 'birthday',
      visible: false
    }));
    expect(sources.isLocalCalendarVisible('birthday')).toBeFalse();
  });

  it('groups calendars by account and preserves independent visibility', async () => {
    const calendars: Omit<GoogleCalendarConfig, 'id' | 'provider' | 'accountId' | 'accountEmail'>[] = [
      { calendarId: 'personal', name: 'Personal', calendarColor: '#4285F4', visible: true, primary: true },
      { calendarId: 'holidays', name: 'Festivos', calendarColor: '#0B8043', visible: false, primary: false }
    ];
    const saved = calendars.map((calendar) => ({
      ...calendar,
      id: `google:reader@example.com:${calendar.calendarId}`,
      provider: 'google' as const,
      accountId: 'reader@example.com',
      accountEmail: 'reader@example.com'
    }));
    storage.saveGoogleCalendarsForAccount.and.resolveTo(saved);

    await sources.saveGoogleCalendars('reader@example.com', 'reader@example.com', calendars);

    expect(sources.getGoogleAccountViews(['reader@example.com'])).toEqual([{
      accountId: 'reader@example.com',
      email: 'reader@example.com',
      configured: true,
      connected: true,
      calendars: [...saved].sort((first, second) => first.name.localeCompare(second.name))
    }]);
    expect(sources.googleCalendars().find((calendar) => calendar.calendarId === 'holidays')?.visible)
      .toBeFalse();
  });

  it('remembers a configured account without treating it as connected', async () => {
    await sources.saveGoogleAccount({ accountId: 'reader@example.com', email: 'reader@example.com' });

    const [account] = sources.getGoogleAccountViews([]);
    expect(account.configured).toBeTrue();
    expect(account.connected).toBeFalse();
    expect(storage.saveGoogleAccountConfig).toHaveBeenCalledWith({
      accountId: 'reader@example.com',
      email: 'reader@example.com'
    });
  });

  it('keeps two accounts with the same calendar name and ID as separate sources', async () => {
    const firstCalendar: GoogleCalendarConfig = {
      id: 'google:one:primary',
      provider: 'google',
      accountId: 'one@example.com',
      accountEmail: 'one@example.com',
      calendarId: 'primary',
      name: 'Personal',
      calendarColor: '#4285F4',
      visible: true,
      primary: true
    };
    const secondCalendar: GoogleCalendarConfig = {
      ...firstCalendar,
      id: 'google:two:primary',
      accountId: 'two@example.com',
      accountEmail: 'two@example.com',
      calendarColor: '#E53935'
    };
    sources.preferences.set([firstCalendar, secondCalendar]);

    expect(sources.getGoogleAccountViews([]).map((account) => account.accountId)).toEqual([
      'one@example.com', 'two@example.com'
    ]);
    expect(sources.googleCalendars().map((calendar) => calendar.id)).toEqual([
      'google:one:primary', 'google:two:primary'
    ]);
  });
});