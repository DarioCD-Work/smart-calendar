import { Component, EventEmitter, Input, Output, QueryList, ViewChildren } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { ColorPicker } from 'primeng/colorpicker';
import { ColorPickerModule } from 'primeng/colorpicker';
import { DialogModule } from 'primeng/dialog';
import { EventCategory } from '../../../models/event-category.model';
import { CalendarViewMode, calendarViewOptions } from '../../../models/calendar-view-mode.model';
import { WeatherSettingsComponent } from '../weather-settings/weather-settings.component';
import { BackupSettingsComponent } from '../backup-settings/backup-settings.component';

export interface CategoryColorChange {
  categoryId: string;
  color: string;
}

@Component({
  selector: 'app-category-settings-dialog',
  imports: [ButtonModule, ColorPickerModule, DialogModule, FormsModule, WeatherSettingsComponent, BackupSettingsComponent],
  templateUrl: './category-settings-dialog.component.html',
  styleUrl: './category-settings-dialog.component.css'
})
export class CategorySettingsDialogComponent {
  @Input() visible = false;
  @Input() categories: EventCategory[] = [];
  @Input() error: string | null = null;
  @Input() viewMode: CalendarViewMode = 'month';

  @Output() readonly closed = new EventEmitter<void>();
  @Output() readonly colorChanged = new EventEmitter<CategoryColorChange>();
  @Output() readonly viewChanged = new EventEmitter<CalendarViewMode>();

  readonly viewOptions = calendarViewOptions;

  @ViewChildren(ColorPicker) private colorPickers?: QueryList<ColorPicker>;

  onVisibleChange(visible: boolean): void {
    if (!visible) {
      this.requestClose();
    }
  }

  requestClose(): void {
    this.colorPickers?.forEach((picker) => picker.hide());
    this.closed.emit();
  }

  categoryColorCode(category: EventCategory): string {
    return category.color.toLocaleUpperCase('en-US');
  }

  updateColor(category: EventCategory, color: unknown): void {
    if (typeof color !== 'string') {
      return;
    }

    const normalizedColor = color.startsWith('#') ? color : `#${color}`;
    if (!/^#[\da-f]{6}$/i.test(normalizedColor) || normalizedColor.toLowerCase() === category.color.toLowerCase()) {
      return;
    }

    this.colorChanged.emit({ categoryId: category.id, color: normalizedColor.toUpperCase() });
  }
}