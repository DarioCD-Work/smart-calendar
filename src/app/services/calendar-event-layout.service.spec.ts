import { CalendarDisplayEvent, CalendarDisplayOccurrence } from '../models/calendar-display-event.model';
import { CalendarEventLayoutService } from './calendar-event-layout.service';

function occurrence(id: string, startDate: string, endDate: string): CalendarDisplayOccurrence {
  const event: CalendarDisplayEvent = {
    id,
    source: 'google',
    title: id,
    startDate,
    endDate,
    allDay: true,
    color: '#4285F4',
  };

  return { eventId: id, occurrenceKey: `${id}:${startDate}`, event, startDate, endDate };
}

describe('CalendarEventLayoutService', () => {
  const service = new CalendarEventLayoutService();

  it('splits a Friday-to-Tuesday event into continuous weekly segments', () => {
    const segments = service.getMultiDaySegments(
      [occurrence('trip', '2026-10-09', '2026-10-13')],
      '2026-09-28',
      '2026-11-01'
    );

    expect(segments.map(({ weekIndex, startColumn, endColumn, isStart, isEnd }) => ({
      weekIndex, startColumn, endColumn, isStart, isEnd
    }))).toEqual([
      { weekIndex: 1, startColumn: 4, endColumn: 6, isStart: true, isEnd: false },
      { weekIndex: 2, startColumn: 0, endColumn: 1, isStart: false, isEnd: true }
    ]);
    expect(segments.every((segment) => segment.occurrence === segments[0].occurrence)).toBeTrue();
    expect(segments.map((segment) => segment.occurrence.event.color)).toEqual(['#4285F4', '#4285F4']);
    expect(segments.every((segment) => segment.occurrence.event.color === '#4285F4')).toBeTrue();
  });

  it('clips segments to the visible range and marks continuation ends correctly', () => {
    const segments = service.getMultiDaySegments(
      [occurrence('trip', '2026-09-25', '2026-11-03')],
      '2026-09-28',
      '2026-11-01'
    );

    expect(segments[0].startColumn).toBe(0);
    expect(segments[0].isStart).toBeFalse();
    expect(segments.at(-1)?.endColumn).toBe(6);
    expect(segments.at(-1)?.isEnd).toBeFalse();
  });

  it('assigns overlapping segments separate lanes and reuses free lanes', () => {
    const segments = service.getMultiDaySegments([
      occurrence('first', '2026-10-06', '2026-10-08'),
      occurrence('second', '2026-10-07', '2026-10-09'),
      occurrence('third', '2026-10-10', '2026-10-11')
    ], '2026-10-05', '2026-10-11');

    expect(segments.map((segment) => [segment.eventId, segment.lane])).toEqual([
      ['first', 0], ['second', 1], ['third', 0]
    ]);
    expect(service.laneCount(segments, 0)).toBe(2);
  });

  it('returns only the multi-day lanes that cross a specific day column', () => {
    const segments = service.getMultiDaySegments([
      occurrence('first', '2026-10-06', '2026-10-10'),
      occurrence('second', '2026-10-08', '2026-10-12')
    ], '2026-10-05', '2026-10-11');

    expect(service.getOccupiedMultiDayLanes(segments, 0, 0)).toEqual([]);
    expect(service.getOccupiedMultiDayLanes(segments, 0, 1)).toEqual([0]);
    expect(service.getOccupiedMultiDayLanes(segments, 0, 3)).toEqual([0, 1]);
    expect(service.getOccupiedMultiDayLanes(segments, 0, 6)).toEqual([1]);
  });
});