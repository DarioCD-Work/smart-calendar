import { EventCategory } from '../../../models/event-category.model';
import { CategorySettingsDialogComponent } from './category-settings-dialog.component';

describe('CategorySettingsDialogComponent', () => {
  it('normalizes a selected hex color and emits only the category id and color', () => {
    const dialog = new CategorySettingsDialogComponent();
    const category: EventCategory = { id: 'birthday', name: 'Cumpleaños', color: '#BA5664' };
    spyOn(dialog.colorChanged, 'emit');

    dialog.updateColor(category, '9c27b0');

    expect(dialog.colorChanged.emit).toHaveBeenCalledOnceWith({
      categoryId: 'birthday',
      color: '#9C27B0'
    });
    expect(category.color).toBe('#BA5664');
  });

  it('ignores unsupported color values and unchanged colors', () => {
    const dialog = new CategorySettingsDialogComponent();
    const category: EventCategory = { id: 'work', name: 'Trabajo', color: '#3F6C9C' };
    spyOn(dialog.colorChanged, 'emit');

    dialog.updateColor(category, 'rgb(1, 2, 3)');
    dialog.updateColor(category, '#3f6c9c');

    expect(dialog.colorChanged.emit).not.toHaveBeenCalled();
  });
});