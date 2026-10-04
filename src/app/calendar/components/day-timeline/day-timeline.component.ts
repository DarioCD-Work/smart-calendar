import { Component, computed, ElementRef, inject, input, OnDestroy, output, signal, ViewChild } from '@angular/core';
import { CalendarDisplayOccurrence } from '../../../models/calendar-display-event.model';
import { TimedEventLayoutService } from '../../../services/timed-event-layout.service';
import { WallClockService } from '../../../services/wall-clock.service';
import { formatCalendarDate } from '../../../services/calendar-date.service';

@Component({
  selector: 'app-day-timeline',
  templateUrl: './day-timeline.component.html',
  styleUrl: './day-timeline.component.css'
})
export class DayTimelineComponent implements OnDestroy {
  readonly date = input.required<string>();
  readonly occurrences = input.required<CalendarDisplayOccurrence[]>();
  readonly compact = input(false);
  readonly eventSelected = output<CalendarDisplayOccurrence>();
  readonly createRequested = output<string>();
  readonly dayEventsRequested = output<void>();
  private readonly layoutService = inject(TimedEventLayoutService);
  private readonly clock = inject(WallClockService);
  private readonly canvasHeight = signal(0);
  private readonly canvasWidth = signal(0);
  private observer?: ResizeObserver;
  private canvas?: HTMLElement;
  private pointerPosition?: { y: number; timestamp: number };

  @ViewChild('canvas') set timelineCanvas(element: ElementRef<HTMLElement> | undefined) {
    this.observer?.disconnect();
    this.canvas = element?.nativeElement;
    if (!this.canvas || typeof ResizeObserver === 'undefined') return;
    this.observer = new ResizeObserver(([entry]) => {
      this.canvasHeight.set(entry.contentRect.height);
      this.canvasWidth.set(entry.contentRect.width);
    });
    this.observer.observe(this.canvas);
  }

  readonly layout = computed(() => this.layoutService.calculateDayLayout(this.occurrences(), this.date()));
  readonly allDayLabelHorizontal = computed(() =>
    this.canvasWidth() * (this.canvasWidth() <= 70 ? .24 : .26) / Math.max(1, this.layout().allDay.length) >= 60);
  readonly hours = computed(() => this.compact() ? [0, 6, 12, 18, 24] : [0, 3, 6, 9, 12, 15, 18, 21, 24]);
  readonly blocks = computed(() => {
    const layout = this.layout();
    const width = (this.canvasWidth() - 20) * (layout.allDay.length ? .74 : 1);
    return layout.timed.map(event => {
      const height = event.heightPercent * this.canvasHeight() / 100;
      const eventWidth = width * event.widthPercent / 100;
      const next = layout.timed.find(other => other.startMinutes >= event.endMinutes
        && other.leftPercent < event.leftPercent + event.widthPercent
        && other.leftPercent + other.widthPercent > event.leftPercent);
      const freeHeight = next ? (next.startMinutes - event.startMinutes) / 1440 * this.canvasHeight() : 24;
      const minimumHeight = Math.min(24, freeHeight);
      return {
        ...event, minimumHeight, short: height < 42, narrow: eventWidth < 48,
        dense: Math.max(height, minimumHeight) < 16,
        showTime: height >= 42 ? eventWidth >= 48 : eventWidth >= 94,
        showRange: height >= 70 && eventWidth >= 90
      };
    });
  });
  readonly nowPercent = computed(() => {
    const now = new Date(this.clock.now());
    return formatCalendarDate(now) === this.date()
      ? (now.getHours() * 60 + now.getMinutes()) / 1440 * 100 : null;
  });
  readonly nowLabel = computed(() => new Intl.DateTimeFormat('es-ES', {
    hour: '2-digit', minute: '2-digit'
  }).format(this.clock.now()));
  readonly needsEventList = computed(() => this.layout().untimed.length > 0
    || this.layout().allDay.length > 1
    || (this.layout().allDay.length > 0 && this.canvasWidth() * .26 < 24)
    || this.blocks().some(block => block.dense || block.narrow));

  timeLabel(value: number): string {
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  }

  eventColor(occurrence: CalendarDisplayOccurrence): string {
    return occurrence.event.color ?? occurrence.event.calendarColor
      ?? (occurrence.event.source === 'google' ? '#4285F4' : '#687975');
  }

  select(event: MouseEvent, occurrence: CalendarDisplayOccurrence): void {
    event.stopPropagation();
    this.eventSelected.emit(occurrence);
  }

  capturePointer(event: PointerEvent): void {
    this.pointerPosition = { y: event.clientY, timestamp: event.timeStamp };
  }

  create(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.canvas) return;
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.height) return;
    const pointer = this.pointerPosition;
    const position = pointer && event.detail > 0 && event.timeStamp >= pointer.timestamp
      && event.timeStamp - pointer.timestamp < 500 ? pointer.y : event.clientY;
    this.pointerPosition = undefined;
    const minutes = Math.round((position - bounds.top) / bounds.height * 1440 / 30) * 30;
    this.createRequested.emit(this.timeLabel(Math.max(0, Math.min(1410, minutes))));
  }

  showDayEvents(event: MouseEvent): void {
    event.stopPropagation();
    this.dayEventsRequested.emit();
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}