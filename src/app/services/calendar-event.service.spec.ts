import { TestBed } from '@angular/core/testing';
import { CalendarEvent } from '../models/calendar-event.model';
import { EventCategory } from '../models/event-category.model';
import { CalendarStorageService } from './calendar-storage.service';
import { CalendarEventService } from './calendar-event.service';

describe('CalendarEventService category colors', () => {
  it('updates the category signal without copying color into its events', async () => {
    const category: EventCategory = { id: 'birthday', name: 'Cumpleaños', color: '#BA5664' };
    const event: CalendarEvent = {
      id: 'birthday-event',
      title: 'Cumpleaños Pedro',
      startDate: '2026-08-08',
      endDate: '2026-08-08',
      allDay: true,
      categoryId: category.id,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    };
    const storage = jasmine.createSpyObj<CalendarStorageService>('CalendarStorageService', [
      'getEvents',
      'getCategories',
      'updateCategory'
    ]);
    storage.getEvents.and.resolveTo([event]);
    storage.getCategories.and.resolveTo([category]);
    storage.updateCategory.and.callFake(async (updatedCategory) => updatedCategory);

    TestBed.configureTestingModule({
      providers: [CalendarEventService, { provide: CalendarStorageService, useValue: storage }]
    });

    const service = TestBed.inject(CalendarEventService);
    await service.initialize();
    await service.updateCategory({ ...category, color: '#9C27B0' });

    expect(service.categories().find((item) => item.id === category.id)?.color).toBe('#9C27B0');
    expect(service.events()).toEqual([event]);
    expect(service.events()[0]).not.toEqual(jasmine.objectContaining({ color: '#9C27B0' }));
    expect(storage.updateCategory).toHaveBeenCalledOnceWith({ ...category, color: '#9C27B0' });
  });
});