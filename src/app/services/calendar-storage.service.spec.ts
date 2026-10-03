import { CalendarStorageService } from './calendar-storage.service';

describe('CalendarStorageService', () => {
  const databaseName = 'smart-calendar';
  const storage = new CalendarStorageService();
  const eventIds: string[] = [];
  const categoryIds: string[] = [];

  afterEach(async () => {
    await Promise.all(eventIds.splice(0).map((id) => storage.deleteEvent(id)));
    await Promise.all(categoryIds.splice(0).map((id) => storage.deleteCategory(id)));
  });

  it('migrates existing single-date events to equal start and end dates', async () => {
    await new Promise<void>((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(databaseName);
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
      deleteRequest.onblocked = () => reject(new Error('No se pudo preparar la migración de prueba.'));
    });

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);

      request.onupgradeneeded = () => {
        const database = request.result;
        const events = database.createObjectStore('events', { keyPath: 'id' });
        database.createObjectStore('categories', { keyPath: 'id' });
        events.put({ id: 'legacy-event', title: 'Evento antiguo', date: '2026-10-10', allDay: true });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    const migratedEvents = await new CalendarStorageService().getEvents();
    expect(migratedEvents).toContain(jasmine.objectContaining({
      id: 'legacy-event',
      startDate: '2026-10-10',
      endDate: '2026-10-10'
    }));
    expect(migratedEvents[0]).not.toEqual(jasmine.objectContaining({ date: jasmine.any(String) }));
  });

  it('seeds categories and persists event/category create, update, and delete operations', async () => {
    const categories = await storage.getCategories();
    expect(categories.map((category) => category.name)).toContain('Personal');
    expect(categories.map((category) => category.name)).toContain('Entrenamiento');

    const category = await storage.createCategory({ name: 'Prueba local', color: '#357a5b' });
    categoryIds.push(category.id);

    const updatedCategory = await storage.updateCategory({
      ...category,
      name: 'Prueba actualizada',
      color: '#9C27B0'
    });
    expect(updatedCategory.name).toBe('Prueba actualizada');
    expect((await new CalendarStorageService().getCategories())
      .find((storedCategory) => storedCategory.id === category.id)?.color).toBe('#9C27B0');

    await expectAsync(storage.createEvent({
      title: 'Rango inválido',
      startDate: '2026-10-12',
      endDate: '2026-10-10',
      allDay: true
    })).toBeRejectedWithError('La fecha de finalización no puede ser anterior a la fecha de inicio.');

    const event = await storage.createEvent({
      title: 'Reunión de prueba',
      startDate: '2026-10-06',
      endDate: '2026-10-06',
      startTime: '09:30',
      endTime: '10:00',
      allDay: false,
      categoryId: category.id,
      notes: 'Persistido localmente',
      recurrence: { frequency: 'weekly', interval: 1, daysOfWeek: [2] }
    });
    eventIds.push(event.id);

    const reopenedStorage = new CalendarStorageService();
    expect((await reopenedStorage.getEvents()).find((storedEvent) => storedEvent.id === event.id)).toEqual(event);

    const updatedEvent = await storage.updateEvent({ ...event, title: 'Reunión editada' });
    expect((await reopenedStorage.getEvents()).find((storedEvent) => storedEvent.id === event.id)?.title)
      .toBe('Reunión editada');
    expect(new Date(updatedEvent.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(event.updatedAt).getTime()
    );

    await storage.deleteEvent(event.id);
    expect((await reopenedStorage.getEvents()).some((storedEvent) => storedEvent.id === event.id)).toBeFalse();

    await storage.deleteCategory(category.id);
    expect((await reopenedStorage.getCategories()).some((storedCategory) => storedCategory.id === category.id))
      .toBeFalse();
  });
});