import { CalendarComponent } from './calendar.component';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { CalendarEvent } from '../models/calendar-event.model';
import { formatCalendarDate } from '../services/calendar-date.service';
import { CalendarEventService } from '../services/calendar-event.service';
import { CalendarSourceService } from '../services/calendar-source.service';
import { GoogleCalendarService } from '../services/google-calendar.service';

describe('CalendarComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CalendarComponent] });
  });

  function createCalendar(): CalendarComponent {
    return TestBed.runInInjectionContext(() => new CalendarComponent());
  }

  it('navigates across December and January in both directions', () => {
    const calendar = createCalendar();
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    calendar.navigateMonth(11 - currentMonth);
    expect(calendar.monthLabel()).toBe(`Diciembre de ${currentYear}`);

    calendar.navigateMonth(1);
    expect(calendar.monthLabel()).toBe(`Enero de ${currentYear + 1}`);

    calendar.navigateMonth(-1);
    expect(calendar.monthLabel()).toBe(`Diciembre de ${currentYear}`);

    calendar.navigateMonth(-11);
    expect(calendar.monthLabel()).toBe(`Enero de ${currentYear}`);

    calendar.navigateMonth(-1);
    expect(calendar.monthLabel()).toBe(`Diciembre de ${currentYear - 1}`);
  });

  it('selects days, changes month for adjacent days, and returns to today', () => {
    const calendar = createCalendar();
    const dayToSelect = calendar.days().find((day) => day.isCurrentMonth && day.dayNumber === 15);

    expect(dayToSelect).toBeDefined();
    calendar.selectDay(dayToSelect!);
    expect(calendar.days().find((day) => day.dayNumber === 15)?.isSelected).toBeTrue();

    const adjacentDay = calendar.days().find((day) => !day.isCurrentMonth)!;
    calendar.selectDay(adjacentDay);
    expect(calendar.days().find((day) => day.isSelected)?.isCurrentMonth).toBeTrue();

    calendar.navigateMonth(1);
    calendar.goToToday();
    expect(calendar.days().find((day) => day.isToday)?.isSelected).toBeTrue();
  });

  it('keeps local events in the unified display when Google reports an offline failure', () => {
    const date = formatCalendarDate(new Date());
    const localEvent: CalendarEvent = {
      id: 'local-only',
      title: 'Evento local',
      startDate: date,
      endDate: date,
      allDay: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };
    const eventService = {
      events: signal([localEvent]),
      categories: signal([])
    };
    const googleService = {
      occurrences: signal([]),
      error: signal('No se pudieron actualizar los calendarios de Google.'),
      loading: signal(false),
      isConfigured: signal(false),
      connectedAccountIds: signal<string[]>([])
    };
    const sourceService = {
      isLocalCalendarVisible: () => true,
      getLocalCalendarViews: () => [],
      getGoogleAccountViews: () => []
    };

    TestBed.overrideProvider(CalendarEventService, { useValue: eventService });
    TestBed.overrideProvider(CalendarSourceService, { useValue: sourceService });
    TestBed.overrideProvider(GoogleCalendarService, { useValue: googleService });

    const calendar = createCalendar();

    expect(calendar.localEventOccurrences().map((occurrence) => occurrence.event.title))
      .toEqual(['Evento local']);
    expect(calendar.eventOccurrences().map((occurrence) => occurrence.event.title))
      .toEqual(['Evento local']);
    expect(calendar.googleCalendarError()).toContain('No se pudieron actualizar');
  });
});