import { CalendarEvent } from '../models/calendar-event.model';
import { CalendarRecurrenceService } from './calendar-recurrence.service';

function createEvent(
  startDate: string,
  recurrence?: CalendarEvent['recurrence'],
  endDate = startDate
): CalendarEvent {
  return {
    id: 'event-1',
    title: 'Evento de prueba',
    startDate,
    endDate,
    allDay: false,
    recurrence,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z'
  };
}

describe('CalendarRecurrenceService', () => {
  const service = new CalendarRecurrenceService();

  it('returns a single occurrence for a one-time event in the requested range', () => {
    const event = createEvent('2026-10-08');

    const occurrences = service.getOccurrences([event], '2026-10-01', '2026-10-31');

    expect(occurrences.map((occurrence) => occurrence.startDate)).toEqual(['2026-10-08']);
    expect(service.getOccurrences([event], '2026-10-09', '2026-10-31')).toEqual([]);
  });

  it('calculates weekly weekdays at an interval without storing duplicate events', () => {
    const event = createEvent('2026-10-06', {
      frequency: 'weekly',
      interval: 2,
      daysOfWeek: [2, 4],
      endDate: '2026-10-22'
    });

    const occurrences = service.getOccurrences([event], '2026-10-05', '2026-10-31');

    expect(occurrences.map((occurrence) => occurrence.startDate)).toEqual([
      '2026-10-06', '2026-10-08', '2026-10-20', '2026-10-22'
    ]);
    expect(occurrences.every((occurrence) => occurrence.eventId === event.id)).toBeTrue();
  });

  it('limits daily repetitions to the configured end date', () => {
    const event = createEvent('2026-10-01', {
      frequency: 'daily',
      interval: 1,
      endDate: '2026-10-03'
    });

    const occurrences = service.getOccurrences([event], '2026-10-02', '2026-10-05');

    expect(occurrences.map((occurrence) => occurrence.startDate)).toEqual(['2026-10-02', '2026-10-03']);
  });

  it('shows annual events once per year and handles leap-day birthdays', () => {
    const event = createEvent('2024-02-29', { frequency: 'yearly', interval: 1 });

    const occurrences = service.getOccurrences([event], '2025-01-01', '2027-12-31');

    expect(occurrences.map((occurrence) => occurrence.startDate)).toEqual([
      '2025-02-28', '2026-02-28', '2027-02-28'
    ]);
  });

  it('returns one multi-day event when its range overlaps the requested view', () => {
    const event = createEvent('2026-09-29', undefined, '2026-10-03');

    const occurrences = service.getOccurrences([event], '2026-10-01', '2026-10-31');

    expect(occurrences).toHaveSize(1);
    expect(occurrences[0].startDate).toBe('2026-09-29');
    expect(occurrences[0].endDate).toBe('2026-10-03');
    expect(service.getOccurrences([event], '2026-10-04', '2026-10-31')).toEqual([]);
  });

  it('preserves a multi-day duration for each weekly and yearly occurrence', () => {
    const weeklyEvent = createEvent('2026-10-06', {
      frequency: 'weekly',
      interval: 1,
      daysOfWeek: [2]
    }, '2026-10-08');
    const weeklyOccurrences = service.getOccurrences([weeklyEvent], '2026-10-08', '2026-10-15');

    expect(weeklyOccurrences.map(({ startDate, endDate }) => [startDate, endDate])).toEqual([
      ['2026-10-06', '2026-10-08'],
      ['2026-10-13', '2026-10-15']
    ]);

    const annualEvent = createEvent('2026-10-10', { frequency: 'yearly', interval: 1 }, '2026-10-12');
    const annualOccurrences = service.getOccurrences([annualEvent], '2027-10-01', '2027-10-31');

    expect(annualOccurrences.map(({ startDate, endDate }) => [startDate, endDate])).toEqual([
      ['2027-10-10', '2027-10-12']
    ]);
  });
});