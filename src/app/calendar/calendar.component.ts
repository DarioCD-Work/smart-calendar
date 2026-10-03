import { AfterViewInit, Component, computed, ElementRef, inject, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { CalendarEvent, CalendarEventDraft, CalendarDate } from '../models/calendar-event.model';
import { CalendarEventOccurrence } from '../models/calendar-event-occurrence.model';
import { CalendarEventSegment } from '../models/calendar-event-segment.model';
import { CalendarEventService } from '../services/calendar-event.service';
import { CalendarEventLayoutService } from '../services/calendar-event-layout.service';
import { CalendarRecurrenceService } from '../services/calendar-recurrence.service';
import { addCalendarDays, compareCalendarDates } from '../services/calendar-date.service';
import { CalendarDay } from './calendar-day.model';
import { generateCalendarDays } from './calendar-date.utils';
import { EventEditorDialogComponent } from './components/event-editor-dialog/event-editor-dialog.component';
import { EventDetailsDialogComponent } from './components/event-details-dialog/event-details-dialog.component';
import { DayEventsDialogComponent } from './components/day-events-dialog/day-events-dialog.component';
import {
  CategoryColorChange,
  CategorySettingsDialogComponent
} from './components/category-settings-dialog/category-settings-dialog.component';

interface CalendarDayView {
  day: CalendarDay;
  occupiedLaneCount: number;
  singleDayOccurrences: CalendarEventOccurrence[];
  hiddenEventCount: number;
}

interface CalendarWeekView {
  index: number;
  days: CalendarDayView[];
  segments: CalendarEventSegment[];
  visibleLaneCount: number;
}

@Component({
  selector: 'app-calendar',
  imports: [
    ButtonModule,
    CategorySettingsDialogComponent,
    DayEventsDialogComponent,
    EventDetailsDialogComponent,
    EventEditorDialogComponent
  ],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.css'
})
export class CalendarComponent implements OnInit, AfterViewInit, OnDestroy {
  readonly weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  private readonly eventService = inject(CalendarEventService);
  private readonly recurrenceService = inject(CalendarRecurrenceService);
  private readonly eventLayoutService = inject(CalendarEventLayoutService);
  private readonly today = new Date();
  private readonly displayedMonth = signal(new Date(this.today.getFullYear(), this.today.getMonth(), 1));
  private readonly selectedDate = signal<Date | null>(this.today);
  private readonly gridHeight = signal(0);
  private readonly gridWidth = signal(0);
  private resizeObserver?: ResizeObserver;

  @ViewChild('daysGrid') private daysGrid?: ElementRef<HTMLDivElement>;

  readonly categories = this.eventService.categories;
  readonly storageError = signal<string | null>(null);
  readonly editorError = signal<string | null>(null);
  readonly editorVisible = signal(false);
  readonly editorDate = signal<CalendarDate | null>(null);
  readonly eventBeingEdited = signal<CalendarEvent | null>(null);
  readonly detailsOccurrence = signal<CalendarEventOccurrence | null>(null);
  readonly moreEventsDate = signal<CalendarDate | null>(null);
  readonly categorySettingsVisible = signal(false);
  readonly categorySettingsError = signal<string | null>(null);

  readonly monthLabel = computed(() => {
    const label = new Intl.DateTimeFormat('es-ES', {
      month: 'long',
      year: 'numeric'
    }).format(this.displayedMonth());

    return label.charAt(0).toLocaleUpperCase('es-ES') + label.slice(1);
  });

  readonly days = computed(() => generateCalendarDays(
    this.displayedMonth(),
    this.today,
    this.selectedDate()
  ));

  readonly weekCount = computed(() => this.days().length / 7);

  readonly eventOccurrences = computed(() => {
    const days = this.days();

    if (days.length === 0) {
      return [];
    }

    return this.recurrenceService.getOccurrences(
      this.eventService.events(),
      days[0].dateKey,
      days[days.length - 1].dateKey
    );
  });

  readonly occurrencesByDate = computed(() => {
    const days = this.days();
    const grouped = new Map<CalendarDate, CalendarEventOccurrence[]>();
    const rangeStart = days[0]?.dateKey;
    const rangeEnd = days[days.length - 1]?.dateKey;

    if (!rangeStart || !rangeEnd) {
      return grouped;
    }

    for (const occurrence of this.eventOccurrences()) {
      const firstDate = compareCalendarDates(occurrence.startDate, rangeStart) < 0
        ? rangeStart
        : occurrence.startDate;
      const lastDate = compareCalendarDates(occurrence.endDate, rangeEnd) > 0
        ? rangeEnd
        : occurrence.endDate;

      for (let date = firstDate; compareCalendarDates(date, lastDate) <= 0; date = addCalendarDays(date, 1)) {
        const dayOccurrences = grouped.get(date) ?? [];
        dayOccurrences.push(occurrence);
        grouped.set(date, dayOccurrences);
      }
    }

    return grouped;
  });

  readonly multiDaySegments = computed(() => {
    const days = this.days();
    return days.length === 0
      ? []
      : this.eventLayoutService.getMultiDaySegments(
        this.eventOccurrences(),
        days[0].dateKey,
        days[days.length - 1].dateKey
      );
  });

  readonly weeks = computed<CalendarWeekView[]>(() => {
    const days = this.days();
    const weekCount = days.length / 7;
    const weekHeight = this.gridHeight() / weekCount;
    const compactLayout = this.gridWidth() <= 520;
    const eventAreaTop = compactLayout ? 44 : 54;
    const cellBottomPadding = compactLayout ? 4 : 5;
    const overflowAreaHeight = 26;
    const laneTrackHeight = 26;
    const barHeight = 20;
    const occurrencesByDate = this.occurrencesByDate();
    const allSegments = this.multiDaySegments();

    return Array.from({ length: weekCount }, (_, weekIndex) => {
      const weekSegments = allSegments.filter((segment) => segment.weekIndex === weekIndex);
      const laneCount = this.eventLayoutService.laneCount(weekSegments, weekIndex);
      const laneCapacity = laneCount > 0 && weekHeight >= eventAreaTop + overflowAreaHeight + barHeight
        ? Math.max(1, 1 + Math.floor(
          (weekHeight - eventAreaTop - overflowAreaHeight - barHeight) / laneTrackHeight
        ))
        : 0;
      const visibleLaneCount = Math.min(laneCount, laneCapacity);
      const visibleSegments = weekSegments.filter((segment) => segment.lane < visibleLaneCount);
      const hiddenSegments = weekSegments.filter((segment) => segment.lane >= visibleLaneCount);
      const weekDays = days.slice(weekIndex * 7, weekIndex * 7 + 7);

      return {
        index: weekIndex,
        visibleLaneCount,
        segments: visibleSegments,
        days: weekDays.map((day, columnIndex) => {
          const dateOccurrences = occurrencesByDate.get(day.dateKey) ?? [];
          const singles = dateOccurrences.filter((occurrence) => occurrence.startDate === occurrence.endDate);
          const hasHiddenSegments = hiddenSegments.some((segment) =>
            columnIndex >= segment.startColumn && columnIndex <= segment.endColumn
          );
          const occupiedLanes = this.eventLayoutService.getOccupiedMultiDayLanes(
            visibleSegments,
            weekIndex,
            columnIndex
          );
          const occupiedLaneCount = occupiedLanes.length > 0 ? occupiedLanes[occupiedLanes.length - 1] + 1 : 0;
          const maxSinglesWithoutOverflow = Math.max(
            0,
            Math.floor((weekHeight - cellBottomPadding - eventAreaTop - occupiedLaneCount * laneTrackHeight + 2) / 26)
          );
          const maxSinglesWithOverflow = Math.max(
            0,
            Math.floor((weekHeight - overflowAreaHeight - eventAreaTop - occupiedLaneCount * laneTrackHeight + 2) / 26)
          );
          const hasOverflow = singles.length > maxSinglesWithoutOverflow || hasHiddenSegments;
          const visibleSingleCount = hasOverflow ? maxSinglesWithOverflow : maxSinglesWithoutOverflow;
          const visibleSingles = singles.slice(0, visibleSingleCount);

          return {
            day,
            occupiedLaneCount,
            singleDayOccurrences: visibleSingles,
            hiddenEventCount: singles.length - visibleSingles.length
              + hiddenSegments.filter((segment) =>
                columnIndex >= segment.startColumn && columnIndex <= segment.endColumn
              ).length
          };
        })
      };
    });
  });

  readonly selectedDayOccurrences = computed(() => {
    const date = this.moreEventsDate();
    return date ? this.occurrencesByDate().get(date) ?? [] : [];
  });

  ngOnInit(): void {
    void this.eventService.initialize().catch(() => {
      this.storageError.set('No se pudo abrir el almacenamiento local de eventos.');
    });
  }

  ngAfterViewInit(): void {
    if (!this.daysGrid || typeof ResizeObserver === 'undefined') {
      return;
    }

    this.resizeObserver = new ResizeObserver(([entry]) => {
      this.gridHeight.set(entry.contentRect.height);
      this.gridWidth.set(entry.contentRect.width);
    });
    this.resizeObserver.observe(this.daysGrid.nativeElement);
    const gridBounds = this.daysGrid.nativeElement.getBoundingClientRect();
    this.gridHeight.set(gridBounds.height);
    this.gridWidth.set(gridBounds.width);
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  navigateMonth(offset: number): void {
    const currentMonth = this.displayedMonth();
    this.displayedMonth.set(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1));
    this.selectedDate.set(null);
  }

  goToToday(): void {
    this.displayedMonth.set(new Date(this.today.getFullYear(), this.today.getMonth(), 1));
    this.selectedDate.set(this.today);
  }

  selectDay(day: CalendarDay): void {
    this.selectedDate.set(day.date);

    if (!day.isCurrentMonth) {
      this.displayedMonth.set(new Date(day.date.getFullYear(), day.date.getMonth(), 1));
    }
  }

  openCreateEvent(day: CalendarDay): void {
    this.selectDay(day);
    this.eventBeingEdited.set(null);
    this.editorDate.set(day.dateKey);
    this.editorError.set(null);
    this.editorVisible.set(true);
  }

  openEventDetails(event: MouseEvent, occurrence: CalendarEventOccurrence): void {
    event.stopPropagation();
    this.moreEventsDate.set(null);
    this.detailsOccurrence.set(occurrence);
  }

  openDayEvents(event: MouseEvent, date: CalendarDate): void {
    event.stopPropagation();
    this.moreEventsDate.set(date);
  }

  showOccurrenceDetails(occurrence: CalendarEventOccurrence): void {
    this.moreEventsDate.set(null);
    this.detailsOccurrence.set(occurrence);
  }

  editOccurrence(occurrence: CalendarEventOccurrence): void {
    this.detailsOccurrence.set(null);
    this.eventBeingEdited.set(occurrence.event);
    this.editorDate.set(occurrence.event.startDate);
    this.editorError.set(null);
    this.editorVisible.set(true);
  }

  closeEditor(): void {
    this.editorVisible.set(false);
    this.eventBeingEdited.set(null);
    this.editorError.set(null);
  }

  async saveEvent(draft: CalendarEventDraft): Promise<void> {
    try {
      const existingEvent = this.eventBeingEdited();

      if (existingEvent) {
        await this.eventService.updateEvent({ ...existingEvent, ...draft });
      } else {
        await this.eventService.createEvent(draft);
      }

      this.closeEditor();
    } catch {
      this.editorError.set('No se pudo guardar el evento. Inténtalo de nuevo.');
    }
  }

  async deleteOccurrence(occurrence: CalendarEventOccurrence): Promise<void> {
    try {
      await this.eventService.deleteEvent(occurrence.eventId);
      this.detailsOccurrence.set(null);
    } catch {
      this.storageError.set('No se pudo eliminar el evento. Inténtalo de nuevo.');
    }
  }

  closeDetails(): void {
    this.detailsOccurrence.set(null);
  }

  closeDayEvents(): void {
    this.moreEventsDate.set(null);
  }

  visibleOccurrences(date: CalendarDate): CalendarEventOccurrence[] {
    return (this.occurrencesByDate().get(date) ?? [])
      .filter((occurrence) => occurrence.startDate === occurrence.endDate);
  }

  hiddenOccurrenceCount(date: CalendarDate): number {
    for (const week of this.weeks()) {
      const day = week.days.find((item) => item.day.dateKey === date);
      if (day) {
        return day.hiddenEventCount;
      }
    }

    return 0;
  }

  categoryColor(event: CalendarEvent): string {
    return this.categories().find((category) => category.id === event.categoryId)?.color ?? '#687975';
  }

  openCategorySettings(): void {
    this.categorySettingsError.set(null);
    this.categorySettingsVisible.set(true);
  }

  closeCategorySettings(): void {
    this.categorySettingsVisible.set(false);
    this.categorySettingsError.set(null);
  }

  async updateCategoryColor(change: CategoryColorChange): Promise<void> {
    const category = this.categories().find((item) => item.id === change.categoryId);
    if (!category || category.color.toLowerCase() === change.color.toLowerCase()) {
      return;
    }

    try {
      await this.eventService.updateCategory({ ...category, color: change.color });
      this.categorySettingsError.set(null);
    } catch {
      this.categorySettingsError.set('No se pudo guardar el color. Inténtalo de nuevo.');
    }
  }

  eventTime(event: CalendarEvent): string {
    return event.allDay ? '' : event.startTime ?? event.endTime ?? '';
  }

  onDayCellKeydown(event: KeyboardEvent, day: CalendarDay): void {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.preventDefault();
    this.openCreateEvent(day);
  }
}