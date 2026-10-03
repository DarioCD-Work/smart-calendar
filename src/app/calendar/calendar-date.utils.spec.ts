import { generateCalendarDays } from './calendar-date.utils';

describe('generateCalendarDays', () => {
  it('starts weeks on Monday and fills only the required number of weeks', () => {
    const days = generateCalendarDays(new Date(2026, 9, 1), new Date(2026, 9, 3), null);

    expect(days).toHaveSize(35);
    expect(days[0].date).toEqual(new Date(2026, 8, 28));
    expect(days[0].isCurrentMonth).toBeFalse();
    expect(days[3].dayNumber).toBe(1);
    expect(days[33].dayNumber).toBe(31);
    expect(days[34].date).toEqual(new Date(2026, 10, 1));
  });

  it('uses six rows when the month spans six Monday-based weeks', () => {
    const days = generateCalendarDays(new Date(2026, 2, 1), new Date(2026, 2, 1), null);

    expect(days).toHaveSize(42);
    expect(days[6].dayNumber).toBe(1);
  });

  it('marks today and the selected date independently', () => {
    const days = generateCalendarDays(
      new Date(2026, 9, 1),
      new Date(2026, 9, 3),
      new Date(2026, 9, 12)
    );

    expect(days.find((day) => day.dayNumber === 3)?.isToday).toBeTrue();
    expect(days.find((day) => day.dayNumber === 12)?.isSelected).toBeTrue();
  });

  it('classifies past, today, and future using the complete calendar date', () => {
    const today = new Date(2026, 9, 3);
    const october = generateCalendarDays(new Date(2026, 9, 1), today, null);

    expect(october.find((day) => day.isCurrentMonth && day.dayNumber === 1)?.isPast).toBeTrue();
    expect(october.find((day) => day.isCurrentMonth && day.dayNumber === 2)?.isPast).toBeTrue();
    expect(october.find((day) => day.isCurrentMonth && day.dayNumber === 3)?.isToday).toBeTrue();
    expect(october.find((day) => day.isCurrentMonth && day.dayNumber === 4)?.isFuture).toBeTrue();

    const september = generateCalendarDays(new Date(2026, 8, 1), today, null);
    const november = generateCalendarDays(new Date(2026, 10, 1), today, null);

    expect(september.filter((day) => day.isCurrentMonth).every((day) => day.isPast)).toBeTrue();
    expect(november.filter((day) => day.isCurrentMonth).every((day) => day.isFuture)).toBeTrue();

    const january = generateCalendarDays(new Date(2026, 0, 1), new Date(2026, 0, 3), null);
    expect(january.find((day) => day.date.getFullYear() === 2025 && day.dayNumber === 31)?.isPast).toBeTrue();
    expect(january.find((day) => day.date.getMonth() === 1 && day.dayNumber === 1)?.isFuture).toBeTrue();
  });
});