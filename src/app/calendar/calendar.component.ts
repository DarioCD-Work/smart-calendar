import { Component, computed, ElementRef, inject, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { CalendarEvent, CalendarEventDraft, CalendarDate } from '../models/calendar-event.model';
import { CalendarDisplayEvent, CalendarDisplayOccurrence } from '../models/calendar-display-event.model';
import { CalendarEventSegment } from '../models/calendar-event-segment.model';
import { GoogleCalendarAccountView } from '../models/google-account.model';
import { CalendarEventService } from '../services/calendar-event.service';
import { CalendarEventLayoutService } from '../services/calendar-event-layout.service';
import { CalendarVisibleEventsService } from '../services/calendar-visible-events.service';
import { CalendarSourceService } from '../services/calendar-source.service';
import { GoogleCalendarService } from '../services/google-calendar.service';
import { GoogleEventFilterService } from '../services/google-event-filter.service';
import { CalendarViewPreferenceService } from '../services/calendar-view-preference.service';
import { CalendarViewMode } from '../models/calendar-view-mode.model';
import { addCalendarDays, compareCalendarDates, formatCalendarDate, parseCalendarDate } from '../services/calendar-date.service';
import { CalendarDay } from './calendar-day.model';
import { formatCalendarRange, generateViewDays, viewRowLengths } from './calendar-view.utils';
import { EventEditorDialogComponent } from './components/event-editor-dialog/event-editor-dialog.component';
import { EventDetailsDialogComponent } from './components/event-details-dialog/event-details-dialog.component';
import { DayEventsDialogComponent } from './components/day-events-dialog/day-events-dialog.component';
import {
  CategoryColorChange,
  CategorySettingsDialogComponent
} from './components/category-settings-dialog/category-settings-dialog.component';
import { CalendarSourcesDialogComponent } from './components/calendar-sources-dialog/calendar-sources-dialog.component';
import { CalendarAgendaDay, CalendarAgendaViewComponent } from './components/calendar-agenda-view/calendar-agenda-view.component';
import { CalendarHeaderStatusComponent } from './components/header-status/header-status.component';
import { TodaySummaryComponent } from './components/today-summary/today-summary.component';
import { DayTimelineComponent } from './components/day-timeline/day-timeline.component';

interface CalendarDayView {
  day: CalendarDay;
  occupiedLaneCount: number;
  singleDayOccurrences: CalendarDisplayOccurrence[];
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
    CalendarHeaderStatusComponent,
    TodaySummaryComponent,
    DayTimelineComponent,
    CalendarAgendaViewComponent,
    CalendarSourcesDialogComponent,
    CategorySettingsDialogComponent,
    DayEventsDialogComponent,
    EventDetailsDialogComponent,
    EventEditorDialogComponent
  ],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.css'
})
export class CalendarComponent implements OnInit, OnDestroy {
  readonly weekdays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

  private readonly eventService = inject(CalendarEventService);
  private readonly visibleEventsService = inject(CalendarVisibleEventsService);
  private readonly eventLayoutService = inject(CalendarEventLayoutService);
  private readonly sourceService = inject(CalendarSourceService);
  private readonly googleCalendarService = inject(GoogleCalendarService);
  private readonly googleEventFilterService = inject(GoogleEventFilterService);
  private readonly viewPreferenceService = inject(CalendarViewPreferenceService);
  private readonly today = new Date();
  private readonly anchorDate = signal(new Date(this.today.getFullYear(), this.today.getMonth(), this.today.getDate()));
  private readonly selectedDate = signal<Date | null>(this.today);
  private readonly gridHeight = signal(0);
  private readonly gridWidth = signal(0);
  private resizeObserver?: ResizeObserver;
  private destroyed = false;

  private daysGrid?: ElementRef<HTMLDivElement>;

  @ViewChild('daysGrid') set calendarGrid(element: ElementRef<HTMLDivElement> | undefined) {
    this.resizeObserver?.disconnect();
    this.daysGrid = element;
    if (!element || this.destroyed || typeof ResizeObserver === 'undefined') {
      return;
    }
    this.resizeObserver = new ResizeObserver(([entry]) => {
      this.gridHeight.set(entry.contentRect.height);
      this.gridWidth.set(entry.contentRect.width);
    });
    this.resizeObserver.observe(element.nativeElement);
    queueMicrotask(() => {
      if (!this.destroyed && this.daysGrid === element) {
        const bounds = element.nativeElement.getBoundingClientRect();
        this.gridHeight.set(bounds.height);
        this.gridWidth.set(bounds.width);
      }
    });
  }

  readonly categories = this.eventService.categories;
  readonly viewMode = this.viewPreferenceService.viewMode;
  readonly isTimelineView = computed(() => this.viewMode() === 'week' || this.viewMode() === '15-days');
  readonly googleCalendarError = this.googleCalendarService.error;
  readonly googleCalendarLoading = this.googleCalendarService.loading;
  readonly googleCalendarConfigured = this.googleCalendarService.isConfigured;
  readonly googleEventFilters = this.googleEventFilterService.filters;
  readonly knownGoogleEvents = this.googleCalendarService.knownEvents;
  readonly googleFilterError = signal<string | null>(null);
  readonly storageError = signal<string | null>(null);
  readonly editorError = signal<string | null>(null);
  readonly editorVisible = signal(false);
  readonly editorDate = signal<CalendarDate | null>(null);
  readonly editorTime = signal<string | null>(null);
  readonly eventBeingEdited = signal<CalendarEvent | null>(null);
  readonly detailsOccurrence = signal<CalendarDisplayOccurrence | null>(null);
  readonly moreEventsDate = signal<CalendarDate | null>(null);
  readonly categorySettingsVisible = signal(false);
  readonly categorySettingsError = signal<string | null>(null);
  readonly calendarSourcesVisible = signal(false);

  readonly monthLabel = computed(() => {
    if (this.viewMode() !== 'month') {
      const days = this.days();
      return formatCalendarRange(days[0].date, days[days.length - 1].date);
    }
    const label = new Intl.DateTimeFormat('es-ES', {
      month: 'long',
      year: 'numeric'
    }).format(this.anchorDate());

    return label.charAt(0).toLocaleUpperCase('es-ES') + label.slice(1);
  });

  readonly days = computed(() => generateViewDays(
    this.viewMode(),
    this.anchorDate(),
    this.today,
    this.selectedDate()
  ));

  readonly rowLengths = computed(() => viewRowLengths(this.viewMode(), this.days().length));
  readonly weekCount = computed(() => this.rowLengths().length);
  readonly previousPeriodLabel = computed(() => this.viewMode() === 'month' ? 'Mes anterior' : 'Periodo anterior');
  readonly nextPeriodLabel = computed(() => this.viewMode() === 'month' ? 'Mes siguiente' : 'Periodo siguiente');

  readonly localEventOccurrences = computed<CalendarDisplayOccurrence[]>(() => {
    const days = this.days();

    if (days.length === 0) {
      return [];
    }

    return this.visibleEventsService.localOccurrences(days[0].dateKey, days[days.length - 1].dateKey);
  });

  readonly allGoogleEvents = this.googleCalendarService.occurrences.asReadonly();
  readonly visibleGoogleEvents = computed(() => this.visibleEventsService.googleOccurrences(this.allGoogleEvents()));

  readonly eventOccurrences = computed(() => [
    ...this.localEventOccurrences(),
    ...this.visibleGoogleEvents()
  ]);

  readonly occurrencesByDate = computed(() => {
    const days = this.days();
    const grouped = new Map<CalendarDate, CalendarDisplayOccurrence[]>();
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
        days[days.length - 1].dateKey,
        this.rowLengths()
      );
  });

  readonly weeks = computed<CalendarWeekView[]>(() => {
    const days = this.days();
    const rowLengths = this.rowLengths();
    const weekCount = rowLengths.length;
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
      const rowOffset = rowLengths.slice(0, weekIndex).reduce((sum, length) => sum + length, 0);
      const weekDays = days.slice(rowOffset, rowOffset + rowLengths[weekIndex]);

      return {
        index: weekIndex,
        visibleLaneCount,
        segments: visibleSegments,
        days: weekDays.map((day, columnIndex) => {
          const dateOccurrences = occurrencesByDate.get(day.dateKey) ?? [];
          const singles = dateOccurrences.filter((occurrence) => occurrence.startDate === occurrence.endDate);
          if (this.viewMode() !== 'month') {
            singles.sort((first, second) => Number(second.event.allDay) - Number(first.event.allDay)
              || (first.event.startTime ?? first.event.endTime ?? '').localeCompare(second.event.startTime ?? second.event.endTime ?? ''));
          }
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

  readonly agendaDays = computed<CalendarAgendaDay[]>(() => {
    const grouped = this.occurrencesByDate();
    return this.days()
      .filter((day) => day.isToday || (grouped.get(day.dateKey)?.length ?? 0) > 0)
      .map((day) => ({
        day,
        events: [...(grouped.get(day.dateKey) ?? [])].sort((first, second) =>
          Number(second.event.allDay) - Number(first.event.allDay)
          || (first.event.startTime ?? first.event.endTime ?? '').localeCompare(second.event.startTime ?? second.event.endTime ?? '')
          || first.event.title.localeCompare(second.event.title, 'es'))
      }));
  });

  readonly localCalendarViews = computed(() => this.sourceService.getLocalCalendarViews(this.categories()));
  readonly googleCalendarAccounts = computed<GoogleCalendarAccountView[]>(() =>
    this.sourceService.getGoogleAccountViews(this.googleCalendarService.connectedAccountIds())
  );

  ngOnInit(): void {
    this.googleCalendarService.startAutomaticSync();
    void this.initializeCalendarSources();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.googleCalendarService.stopAutomaticSync();
  }

  navigateMonth(offset: number): void {
    const anchor = this.anchorDate();
    if (this.viewMode() === 'month') {
      const lastDay = new Date(anchor.getFullYear(), anchor.getMonth() + offset + 1, 0).getDate();
      this.anchorDate.set(new Date(anchor.getFullYear(), anchor.getMonth() + offset, Math.min(anchor.getDate(), lastDay)));
    } else {
      const step = this.viewMode() === 'week' ? 7 : this.viewMode() === '15-days' ? 15 : 30;
      this.anchorDate.set(parseCalendarDate(addCalendarDays(formatCalendarDate(anchor), offset * step)));
    }
    this.selectedDate.set(null);
    void this.refreshGoogleEvents();
  }

  goToToday(): void {
    this.anchorDate.set(new Date(this.today.getFullYear(), this.today.getMonth(), this.today.getDate()));
    this.selectedDate.set(this.today);
    void this.refreshGoogleEvents();
  }

  selectDay(day: CalendarDay): void {
    this.selectedDate.set(day.date);

    if (!day.isCurrentMonth) {
      this.anchorDate.set(day.date);
      void this.refreshGoogleEvents();
    }
  }

  openCreateEvent(day: CalendarDay, initialTime?: string): void {
    this.selectDay(day);
    this.eventBeingEdited.set(null);
    this.editorDate.set(day.dateKey);
    this.editorTime.set(initialTime ?? null);
    this.editorError.set(null);
    this.editorVisible.set(true);
  }

  openEventDetails(event: MouseEvent, occurrence: CalendarDisplayOccurrence): void {
    event.stopPropagation();
    this.moreEventsDate.set(null);
    this.detailsOccurrence.set(occurrence);
  }

  openDayEvents(event: MouseEvent, date: CalendarDate): void {
    event.stopPropagation();
    this.moreEventsDate.set(date);
  }

  showOccurrenceDetails(occurrence: CalendarDisplayOccurrence): void {
    this.moreEventsDate.set(null);
    this.detailsOccurrence.set(occurrence);
  }

  editOccurrence(event: CalendarEvent): void {
    this.detailsOccurrence.set(null);
    this.eventBeingEdited.set(event);
    this.editorDate.set(event.startDate);
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

  async deleteOccurrence(occurrence: CalendarDisplayOccurrence): Promise<void> {
    if (occurrence.event.source !== 'local' || !occurrence.event.localEvent) {
      return;
    }

    try {
      await this.eventService.deleteEvent(occurrence.event.localEvent.id);
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

  visibleOccurrences(date: CalendarDate): CalendarDisplayOccurrence[] {
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

  eventColor(event: CalendarDisplayEvent): string {
    if (event.source === 'google') {
      return event.color ?? '#4285F4';
    }

    return this.categories().find((category) => category.id === event.categoryId)?.color ?? '#687975';
  }

  openCategorySettings(): void {
    this.categorySettingsError.set(null);
    this.categorySettingsVisible.set(true);
  }

  async changeViewMode(mode: CalendarViewMode): Promise<void> {
    if (mode === this.viewMode()) {
      return;
    }
    const selected = this.selectedDate();
    if (selected && this.days().some((day) => day.dateKey === formatCalendarDate(selected))) {
      this.anchorDate.set(selected);
    }
    const savePreference = this.viewPreferenceService.selectView(mode);
    void this.refreshGoogleEvents();
    try {
      await savePreference;
    } catch {
      this.categorySettingsError.set('No se pudo guardar la vista del calendario.');
    }
  }

  openCalendarSources(): void {
    this.calendarSourcesVisible.set(true);
  }

  closeCalendarSources(): void {
    this.calendarSourcesVisible.set(false);
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

  eventTime(event: CalendarDisplayEvent): string {
    return event.allDay ? '' : event.startTime ?? event.endTime ?? '';
  }

  rangeDayLabel(day: CalendarDay): string {
    const weekday = new Intl.DateTimeFormat('es-ES', { weekday: 'short' }).format(day.date);
    const month = new Intl.DateTimeFormat('es-ES', { month: 'short' }).format(day.date);
    return `${weekday} · ${month}`;
  }

  async setLocalCalendarVisibility(categoryId: string, visible: boolean): Promise<void> {
    try {
      await this.sourceService.setLocalCalendarVisibility(categoryId, visible);
    } catch {
      this.googleCalendarService.error.set('No se pudo guardar la preferencia del calendario local.');
    }
  }

  async setGoogleCalendarVisibility(calendarId: string, visible: boolean): Promise<void> {
    try {
      await this.googleCalendarService.setCalendarVisibility(calendarId, visible);
    } catch {
      this.googleCalendarService.error.set('No se pudo guardar la preferencia del calendario Google.');
    }
  }

  async hideGoogleEventTitle(change: { accountId: string; calendarId?: string; title: string }): Promise<void> {
    try {
      await this.googleEventFilterService.hideTitle(change.accountId, change.calendarId, change.title);
      this.googleFilterError.set(null);
    } catch {
      this.googleFilterError.set('No se pudo guardar el filtro de eventos.');
    }
  }

  async removeGoogleEventFilter(id: string): Promise<void> {
    try {
      await this.googleEventFilterService.removeFilter(id);
      this.googleFilterError.set(null);
    } catch {
      this.googleFilterError.set('No se pudo eliminar el filtro de eventos.');
    }
  }

  async connectGoogleAccount(accountId?: string): Promise<void> {
    const account = this.googleCalendarAccounts().find((item) => item.accountId === accountId);
    try {
      await this.googleCalendarService.connectAccount(account?.email);
    } catch {
      // The Google settings dialog displays the service error without affecting local events.
    }
  }

  async disconnectGoogleAccount(accountId: string): Promise<void> {
    try {
      await this.googleCalendarService.disconnectAccount(accountId);
    } catch {
      this.googleCalendarService.error.set('No se pudo desconectar la cuenta de Google.');
    }
  }

  private async initializeCalendarSources(): Promise<void> {
    await this.viewPreferenceService.initialize().catch(() => {
      this.categorySettingsError.set('No se pudo cargar la vista del calendario.');
    });
    await this.eventService.initialize().catch(() => {
      this.storageError.set('No se pudo abrir el almacenamiento local de eventos.');
    });

    await this.googleEventFilterService.initialize().catch(() => {
      this.googleFilterError.set('No se pudieron cargar los filtros de eventos.');
    });

    try {
      await this.googleCalendarService.initialize();
      await this.refreshGoogleEvents();
    } catch {
      this.googleCalendarService.error.set('No se pudieron inicializar los calendarios de Google.');
    }
  }

  private async refreshGoogleEvents(): Promise<void> {
    if (this.destroyed) {
      return;
    }
    const days = this.days();
    if (days.length > 0) {
      await this.googleCalendarService.refreshVisibleEvents(days[0].dateKey, days[days.length - 1].dateKey);
    }
  }

  onDayCellKeydown(event: KeyboardEvent, day: CalendarDay): void {
    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) {
      return;
    }

    event.preventDefault();
    this.openCreateEvent(day);
  }
}