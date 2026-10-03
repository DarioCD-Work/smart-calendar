import { CalendarComponent } from './calendar.component';
import { TestBed } from '@angular/core/testing';

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
});