import {
  CalendarStorageService,
  migrateGoogleAccountsFromCalendarSources,
  migrateLegacyCalendarEvents
} from './calendar-storage.service';
import { googleCalendarPreferenceId } from './calendar-source.service';

describe('CalendarStorageService', () => {
  const databaseName = `smart-calendar-migration-${Date.now()}`;
  const storage = new CalendarStorageService();
  const eventIds: string[] = [];
  const categoryIds: string[] = [];
  const sourcePreferenceIds: string[] = [];
  const googleAccountIds: string[] = [];

  afterEach(async () => {
    await Promise.all(eventIds.splice(0).map((id) => storage.deleteEvent(id)));
    await Promise.all(categoryIds.splice(0).map((id) => storage.deleteCategory(id)));
    await Promise.all(sourcePreferenceIds.splice(0).map((id) => storage.deleteCalendarSourcePreference(id)));
    await Promise.all(googleAccountIds.splice(0).map((id) => storage.deleteGoogleAccountConfig(id)));
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
        events.put({ id: 'legacy-event', title: 'Evento antiguo', date: '2026-10-10', allDay: true });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    const migratedEvents = await new Promise<unknown[]>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 2);
      request.onupgradeneeded = () => migrateLegacyCalendarEvents(request.transaction!);
      request.onsuccess = () => {
        const database = request.result;
        const getRequest = database.transaction('events', 'readonly').objectStore('events').getAll();
        getRequest.onsuccess = () => {
          database.close();
          resolve(getRequest.result);
        };
        getRequest.onerror = () => reject(getRequest.error);
      };
      request.onerror = () => reject(request.error);
    });

    expect(migratedEvents).toContain(jasmine.objectContaining({
      id: 'legacy-event',
      startDate: '2026-10-10',
      endDate: '2026-10-10'
    }));
    expect(migratedEvents[0]).not.toEqual(jasmine.objectContaining({ date: jasmine.any(String) }));

    await new Promise<void>((resolve, reject) => {
      const deleteRequest = indexedDB.deleteDatabase(databaseName);
      deleteRequest.onsuccess = () => resolve();
      deleteRequest.onerror = () => reject(deleteRequest.error);
    });
  });

  it('migrates configured Google accounts from v3 calendar preferences without tokens', async () => {
    const migrationDatabaseName = `${databaseName}-accounts`;

    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(migrationDatabaseName, 3);
      request.onupgradeneeded = () => {
        const database = request.result;
        database.createObjectStore('events', { keyPath: 'id' });
        database.createObjectStore('categories', { keyPath: 'id' });
        const sources = database.createObjectStore('calendarSources', { keyPath: 'id' });
        sources.put({
          id: 'google:reader:primary',
          provider: 'google',
          accountId: 'reader@example.com',
          accountEmail: 'reader@example.com',
          calendarId: 'primary',
          name: 'Personal',
          calendarColor: '#4285F4',
          visible: true,
          primary: true
        });
        sources.put({ id: 'local:birthday', provider: 'local', categoryId: 'birthday', visible: false });
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    const migratedAccounts = await new Promise<unknown[]>((resolve, reject) => {
      const request = indexedDB.open(migrationDatabaseName, 4);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('googleAccounts', { keyPath: 'accountId' });
        migrateGoogleAccountsFromCalendarSources(request.transaction!);
      };
      request.onsuccess = () => {
        const database = request.result;
        const getRequest = database.transaction('googleAccounts', 'readonly')
          .objectStore('googleAccounts').getAll();
        getRequest.onsuccess = () => {
          database.close();
          resolve(getRequest.result);
        };
        getRequest.onerror = () => reject(getRequest.error);
      };
      request.onerror = () => reject(request.error);
    });

    expect(migratedAccounts).toEqual([{ accountId: 'reader@example.com', email: 'reader@example.com' }]);
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(migrationDatabaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
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

  it('persists local visibility and Google calendar settings without resetting visibility on refresh', async () => {
    const localPreference = {
      id: 'local:birthday',
      provider: 'local' as const,
      categoryId: 'birthday',
      visible: false
    };
    sourcePreferenceIds.push(localPreference.id);
    await storage.saveCalendarSourcePreference(localPreference);

    const accountId = 'reader@example.com';
    googleAccountIds.push(accountId);
    await storage.saveGoogleAccountConfig({ accountId, email: accountId, name: 'Cuenta de lectura' });
    const googleCalendar = {
      calendarId: 'birthday-calendar',
      name: 'Cumpleaños',
      calendarColor: '#9C27B0',
      visible: true,
      primary: false,
      timeZone: 'Europe/Madrid'
    };
    const [savedCalendar] = await storage.saveGoogleCalendarsForAccount(
      accountId,
      accountId,
      [googleCalendar]
    );
    sourcePreferenceIds.push(savedCalendar.id);
    await storage.saveCalendarSourcePreference({ ...savedCalendar, visible: false });

    const [refreshedCalendar] = await storage.saveGoogleCalendarsForAccount(
      accountId,
      accountId,
      [{ ...googleCalendar, name: 'Cumpleaños actualizado', calendarColor: '#E53935', visible: true }]
    );

    expect(refreshedCalendar.name).toBe('Cumpleaños actualizado');
    expect(refreshedCalendar.calendarColor).toBe('#E53935');
    expect(refreshedCalendar.visible).toBeFalse();

    const reopenedStorage = new CalendarStorageService();
    const preferences = await reopenedStorage.getCalendarSourcePreferences();
    expect(await reopenedStorage.getGoogleAccountConfigs()).toContain(jasmine.objectContaining({
      accountId,
      email: accountId,
      name: 'Cuenta de lectura'
    }));
    expect(preferences).toContain(jasmine.objectContaining(localPreference));
    expect(preferences).toContain(jasmine.objectContaining({
      id: savedCalendar.id,
      provider: 'google',
      accountId,
      calendarId: googleCalendar.calendarId,
      visible: false,
      calendarColor: '#E53935'
    }));
  });
});