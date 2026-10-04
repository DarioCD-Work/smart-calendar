import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { CalendarDate, CalendarEvent, CalendarEventDraft } from '../../../models/calendar-event.model';
import { EventCategory } from '../../../models/event-category.model';
import { parseCalendarDate, formatCalendarDate } from '../../../services/calendar-date.service';

type RecurrenceSelection = 'none' | 'daily' | 'weekly' | 'custom' | 'yearly';

@Component({
  selector: 'app-event-editor-dialog',
  imports: [ButtonModule, DialogModule, FormsModule, InputTextModule, TextareaModule],
  templateUrl: './event-editor-dialog.component.html',
  styleUrl: './event-editor-dialog.component.css'
})
export class EventEditorDialogComponent implements OnChanges {
  @Input() visible = false;
  @Input() event: CalendarEvent | null = null;
  @Input() initialDate: CalendarDate = '';
  @Input() initialTime: string | null = null;
  @Input() categories: EventCategory[] = [];
  @Input() storageError: string | null = null;

  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly saved = new EventEmitter<CalendarEventDraft>();

  readonly weekdays = [
    { value: 1, label: 'Lunes', shortLabel: 'Lu' },
    { value: 2, label: 'Martes', shortLabel: 'Ma' },
    { value: 3, label: 'Miércoles', shortLabel: 'Mi' },
    { value: 4, label: 'Jueves', shortLabel: 'Ju' },
    { value: 5, label: 'Viernes', shortLabel: 'Vi' },
    { value: 6, label: 'Sábado', shortLabel: 'Sá' },
    { value: 0, label: 'Domingo', shortLabel: 'Do' }
  ];

  title = '';
  startDate = '';
  eventEndDate = '';
  allDay = false;
  startTime = '';
  endTime = '';
  categoryId = '';
  notes = '';
  recurrenceSelection: RecurrenceSelection = 'none';
  interval = 1;
  recurrenceEndDate = '';
  selectedWeekdays: number[] = [];
  validationError: string | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['visible']?.currentValue === true) {
      this.resetForm();
    }
  }

  get dialogTitle(): string {
    return this.event ? 'Editar evento' : 'Nuevo evento';
  }

  get selectedCategory(): EventCategory | undefined {
    return this.categories.find((category) => category.id === this.categoryId);
  }

  onVisibleChange(visible: boolean): void {
    if (!visible) {
      this.closed.emit();
    }
  }

  isWeekdaySelected(weekday: number): boolean {
    return this.selectedWeekdays.includes(weekday);
  }

  toggleWeekday(weekday: number, changeEvent: Event): void {
    const checked = (changeEvent.target as HTMLInputElement).checked;

    if (checked && !this.selectedWeekdays.includes(weekday)) {
      this.selectedWeekdays = [...this.selectedWeekdays, weekday];
    } else if (!checked && this.selectedWeekdays.length > 1) {
      this.selectedWeekdays = this.selectedWeekdays.filter((day) => day !== weekday);
    } else {
      (changeEvent.target as HTMLInputElement).checked = true;
    }
  }

  onRecurrenceChange(selection: RecurrenceSelection): void {
    this.recurrenceSelection = selection;

    if ((selection === 'weekly' || selection === 'custom') && this.selectedWeekdays.length === 0 && this.startDate) {
      this.selectedWeekdays = [parseCalendarDate(this.startDate).getDay()];
    }
  }

  onStartDateChange(): void {
    if (this.eventEndDate < this.startDate) {
      this.eventEndDate = this.startDate;
    }

    if (this.recurrenceEndDate && this.recurrenceEndDate < this.startDate) {
      this.recurrenceEndDate = this.startDate;
    }
  }

  submit(): void {
    const title = this.title.trim();
    this.validationError = null;

    if (!title || !this.startDate || !this.eventEndDate) {
      this.validationError = 'Indica un título y las fechas del evento.';
      return;
    }

    if (this.eventEndDate < this.startDate) {
      this.validationError = 'La fecha de finalización debe ser igual o posterior a la fecha de inicio.';
      return;
    }

    if (this.recurrenceEndDate && this.recurrenceEndDate < this.startDate) {
      this.validationError = 'El fin de la recurrencia no puede ser anterior al inicio del evento.';
      return;
    }

    if ((this.recurrenceSelection === 'weekly' || this.recurrenceSelection === 'custom')
      && this.selectedWeekdays.length === 0) {
      this.validationError = 'Selecciona al menos un día de la semana.';
      return;
    }

    this.saved.emit({
      title,
      startDate: this.startDate,
      endDate: this.eventEndDate,
      allDay: this.allDay,
      ...(this.allDay ? {} : {
        startTime: this.startTime || undefined,
        endTime: this.endTime || undefined
      }),
      categoryId: this.categoryId || undefined,
      notes: this.notes.trim() || undefined,
      recurrence: this.createRecurrenceRule()
    });
  }

  private resetForm(): void {
    const event = this.event;
    const recurrence = event?.recurrence;

    this.title = event?.title ?? '';
    this.startDate = event?.startDate ?? this.initialDate ?? formatCalendarDate(new Date());
    this.eventEndDate = event?.endDate ?? this.startDate;
    this.allDay = event?.allDay ?? false;
    this.startTime = event ? event.startTime ?? '' : this.initialTime ?? '';
    this.endTime = event?.endTime ?? '';
    this.categoryId = event?.categoryId ?? '';
    this.notes = event?.notes ?? '';
    this.recurrenceSelection = !recurrence
      ? 'none'
      : recurrence.frequency === 'daily'
        ? 'daily'
        : recurrence.frequency === 'yearly'
          ? 'yearly'
          : recurrence.interval > 1 ? 'custom' : 'weekly';
    this.interval = recurrence?.interval ?? 1;
    this.recurrenceEndDate = recurrence?.endDate ?? '';
    this.selectedWeekdays = recurrence?.daysOfWeek
      ? [...recurrence.daysOfWeek]
      : recurrence?.frequency === 'weekly'
        ? [parseCalendarDate(this.startDate).getDay()]
        : [];
    this.validationError = null;
  }

  private createRecurrenceRule(): CalendarEventDraft['recurrence'] {
    const endDate = this.recurrenceEndDate || undefined;

    switch (this.recurrenceSelection) {
      case 'daily':
        return { frequency: 'daily', interval: 1, endDate };
      case 'weekly':
        return { frequency: 'weekly', interval: 1, daysOfWeek: [...this.selectedWeekdays], endDate };
      case 'custom':
        return {
          frequency: 'weekly',
          interval: Math.max(1, Math.floor(this.interval || 1)),
          daysOfWeek: [...this.selectedWeekdays],
          endDate
        };
      case 'yearly':
        return { frequency: 'yearly', interval: 1, endDate };
      default:
        return undefined;
    }
  }
}