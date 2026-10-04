import { Injectable } from '@angular/core';
import { CalendarEvent, CalendarEventDraft } from '../models/calendar-event.model';
import { EventCategory } from '../models/event-category.model';
import { CalendarSourcePreference, GoogleCalendarConfig } from '../models/external-calendar.model';
import { GoogleCalendarAccountConfig } from '../models/google-account.model';
import { GoogleEventFilter } from '../models/google-event-filter.model';
import { CalendarViewMode, isCalendarViewMode } from '../models/calendar-view-mode.model';
import { compareCalendarDates } from './calendar-date.service';
import { SmartCalendarBackupData } from '../models/smart-calendar-backup.model';

const databaseName = 'smart-calendar';
const databaseVersion = 6;
const eventStoreName = 'events';
const categoryStoreName = 'categories';
const calendarSourceStoreName = 'calendarSources';
const googleAccountStoreName = 'googleAccounts';
const googleEventFilterStoreName = 'googleEventFilters';
const appPreferenceStoreName = 'appPreferences';
const backupStoreNames = [eventStoreName, categoryStoreName, calendarSourceStoreName,
  googleAccountStoreName, googleEventFilterStoreName, appPreferenceStoreName] as const;

const defaultCategories: EventCategory[] = [
  { id: 'personal', name: 'Personal', color: '#397b5a' },
  { id: 'work', name: 'Trabajo', color: '#3f6c9c' },
  { id: 'training', name: 'Entrenamiento', color: '#c16c37' },
  { id: 'birthday', name: 'Cumpleaños', color: '#ba5664' },
  { id: 'appointments', name: 'Citas', color: '#6d7851' },
  { id: 'other', name: 'Otros', color: '#687975' }
];

export function migrateLegacyCalendarEvents(transaction: IDBTransaction): void {
  const cursorRequest = transaction.objectStore(eventStoreName).openCursor();

  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;

    if (!cursor) {
      return;
    }

    const storedEvent = cursor.value as Partial<CalendarEvent> & { id: string; date?: string };

    if (storedEvent.date) {
      const { date, ...eventWithoutLegacyDate } = storedEvent;
      cursor.update({
        ...eventWithoutLegacyDate,
        startDate: storedEvent.startDate ?? date,
        endDate: storedEvent.endDate ?? date
      });
    }

    cursor.continue();
  };
}

export function migrateGoogleAccountsFromCalendarSources(transaction: IDBTransaction): void {
  const cursorRequest = transaction.objectStore(calendarSourceStoreName).openCursor();

  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) {
      return;
    }

    const preference = cursor.value as CalendarSourcePreference;
    if (preference.provider === 'google') {
      transaction.objectStore(googleAccountStoreName).put({
        accountId: preference.accountId,
        email: preference.accountEmail
      } satisfies GoogleCalendarAccountConfig);
    }

    cursor.continue();
  };
}

@Injectable({ providedIn: 'root' })
export class CalendarStorageService {
  private databasePromise?: Promise<IDBDatabase>;

  async getEvents(): Promise<CalendarEvent[]> {
    return this.getAll<CalendarEvent>(eventStoreName);
  }

  async readBackupData(): Promise<SmartCalendarBackupData> {
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([...backupStoreNames], 'readonly');
      const records: Record<string, unknown[]> = {};
      for (const name of backupStoreNames) {
        const request = transaction.objectStore(name).getAll();
        request.onsuccess = () => { records[name] = request.result; };
      }
      transaction.oncomplete = () => resolve(records as unknown as SmartCalendarBackupData);
      transaction.onabort = () => reject(transaction.error ?? new Error('No se pudo leer la copia.'));
    });
  }

  async replaceBackupData(data: SmartCalendarBackupData): Promise<void> {
    const database = await this.openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction([...backupStoreNames], 'readwrite');
      let failure: unknown;
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('No se pudo restaurar la copia.'));
      try {
        for (const name of backupStoreNames) {
          const store = transaction.objectStore(name);
          store.clear();
          for (const record of data[name]) store.add(record);
        }
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    });
  }

  async getAppPreference<T>(key: string): Promise<T | undefined> {
    const preference = await this.performRequest<{ key: string; value: T } | undefined>(
      appPreferenceStoreName, 'readonly', (store) => store.get(key)
    );
    return preference?.value;
  }

  async saveAppPreference<T>(key: string, value: T): Promise<void> {
    await this.performRequest(appPreferenceStoreName, 'readwrite', (store) => store.put({ key, value }));
  }

  async getCalendarViewMode(): Promise<CalendarViewMode> {
    const preference = await this.performRequest<{ key: string; value: unknown } | undefined>(
      appPreferenceStoreName, 'readonly', (store) => store.get('calendarViewMode')
    );
    return isCalendarViewMode(preference?.value) ? preference.value : 'month';
  }

  async saveCalendarViewMode(viewMode: CalendarViewMode): Promise<void> {
    await this.performRequest(appPreferenceStoreName, 'readwrite', (store) =>
      store.put({ key: 'calendarViewMode', value: viewMode })
    );
  }

  async createEvent(draft: CalendarEventDraft): Promise<CalendarEvent> {
    this.validateDateRange(draft.startDate, draft.endDate, draft.recurrence?.endDate);
    const now = new Date().toISOString();
    const event: CalendarEvent = {
      ...draft,
      id: this.createId(),
      createdAt: now,
      updatedAt: now
    };

    await this.performRequest(eventStoreName, 'readwrite', (store) => store.add(event));
    return event;
  }

  async updateEvent(event: CalendarEvent): Promise<CalendarEvent> {
    this.validateDateRange(event.startDate, event.endDate, event.recurrence?.endDate);
    const updatedEvent = { ...event, updatedAt: new Date().toISOString() };
    await this.performRequest(eventStoreName, 'readwrite', (store) => store.put(updatedEvent));
    return updatedEvent;
  }

  async deleteEvent(id: string): Promise<void> {
    await this.performRequest(eventStoreName, 'readwrite', (store) => store.delete(id));
  }

  async getCategories(): Promise<EventCategory[]> {
    const categories = await this.getAll<EventCategory>(categoryStoreName);

    if (categories.length > 0) {
      return categories;
    }

    await this.seedDefaultCategories();
    return this.getAll<EventCategory>(categoryStoreName);
  }

  async createCategory(category: Omit<EventCategory, 'id'>): Promise<EventCategory> {
    const createdCategory = { ...category, id: this.createId() };
    await this.performRequest(categoryStoreName, 'readwrite', (store) => store.add(createdCategory));
    return createdCategory;
  }

  async updateCategory(category: EventCategory): Promise<EventCategory> {
    await this.performRequest(categoryStoreName, 'readwrite', (store) => store.put(category));
    return category;
  }

  async deleteCategory(id: string): Promise<void> {
    await this.performRequest(categoryStoreName, 'readwrite', (store) => store.delete(id));
  }

  async getCalendarSourcePreferences(): Promise<CalendarSourcePreference[]> {
    return this.getAll<CalendarSourcePreference>(calendarSourceStoreName);
  }

  async saveCalendarSourcePreference(preference: CalendarSourcePreference): Promise<CalendarSourcePreference> {
    await this.performRequest(calendarSourceStoreName, 'readwrite', (store) => store.put(preference));
    return preference;
  }

  async deleteCalendarSourcePreference(id: string): Promise<void> {
    await this.performRequest(calendarSourceStoreName, 'readwrite', (store) => store.delete(id));
  }

  async getGoogleAccountConfigs(): Promise<GoogleCalendarAccountConfig[]> {
    return this.getAll<GoogleCalendarAccountConfig>(googleAccountStoreName);
  }

  async getGoogleEventFilters(): Promise<GoogleEventFilter[]> {
    return this.getAll<GoogleEventFilter>(googleEventFilterStoreName);
  }

  async saveGoogleEventFilter(filter: GoogleEventFilter): Promise<void> {
    await this.performRequest(googleEventFilterStoreName, 'readwrite', (store) => store.put(filter));
  }

  async deleteGoogleEventFilter(id: string): Promise<void> {
    await this.performRequest(googleEventFilterStoreName, 'readwrite', (store) => store.delete(id));
  }

  async saveGoogleAccountConfig(account: GoogleCalendarAccountConfig): Promise<GoogleCalendarAccountConfig> {
    await this.performRequest(googleAccountStoreName, 'readwrite', (store) => store.put(account));
    return account;
  }

  async deleteGoogleAccountConfig(accountId: string): Promise<void> {
    await this.performRequest(googleAccountStoreName, 'readwrite', (store) => store.delete(accountId));
  }

  async saveGoogleCalendarsForAccount(
    accountId: string,
    accountEmail: string,
    calendars: Omit<GoogleCalendarConfig, 'id' | 'provider' | 'accountId' | 'accountEmail'>[]
  ): Promise<GoogleCalendarConfig[]> {
    const existing = await this.getCalendarSourcePreferences();
    const existingGoogleCalendars = existing.filter((item): item is GoogleCalendarConfig =>
      item.provider === 'google' && item.accountId === accountId
    );
    const existingByCalendarId = new Map(existingGoogleCalendars.map((calendar) => [calendar.calendarId, calendar]));
    const nextCalendars = calendars.map((calendar) => {
      const previous = existingByCalendarId.get(calendar.calendarId);

      return {
        ...calendar,
        id: this.googleCalendarPreferenceId(accountId, calendar.calendarId),
        provider: 'google' as const,
        accountId,
        accountEmail,
        visible: previous?.visible ?? calendar.visible ?? true
      };
    });
    const nextIds = new Set(nextCalendars.map((calendar) => calendar.id));

    await new Promise<void>(async (resolve, reject) => {
      try {
        const database = await this.openDatabase();
        const transaction = database.transaction(calendarSourceStoreName, 'readwrite');
        const store = transaction.objectStore(calendarSourceStoreName);

        for (const calendar of existingGoogleCalendars) {
          if (!nextIds.has(calendar.id)) {
            store.delete(calendar.id);
          }
        }

        for (const calendar of nextCalendars) {
          store.put(calendar);
        }

        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error ?? new Error('No se pudieron guardar los calendarios Google.'));
        transaction.onerror = () => reject(transaction.error ?? new Error('Falló el guardado de los calendarios Google.'));
      } catch (error) {
        reject(error);
      }
    });

    return nextCalendars;
  }

  async deleteGoogleCalendarsForAccount(accountId: string): Promise<void> {
    const preferences = await this.getCalendarSourcePreferences();
    const ids = preferences
      .filter((preference) => preference.provider === 'google' && preference.accountId === accountId)
      .map((preference) => preference.id);

    await new Promise<void>(async (resolve, reject) => {
      try {
        const database = await this.openDatabase();
        const transaction = database.transaction(calendarSourceStoreName, 'readwrite');
        const store = transaction.objectStore(calendarSourceStoreName);
        ids.forEach((id) => store.delete(id));
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error ?? new Error('No se pudo desconectar la cuenta Google.'));
        transaction.onerror = () => reject(transaction.error ?? new Error('Falló la desconexión de la cuenta Google.'));
      } catch (error) {
        reject(error);
      }
    });
  }

  private getAll<T>(storeName: string): Promise<T[]> {
    return this.performRequest<T[]>(storeName, 'readonly', (store) => store.getAll());
  }

  private async performRequest<T>(
    storeName: string,
    mode: IDBTransactionMode,
    createRequest: (store: IDBObjectStore) => IDBRequest<T>
  ): Promise<T> {
    const database = await this.openDatabase();

    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const request = createRequest(transaction.objectStore(storeName));
      let result: T;

      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => reject(request.error ?? new Error('No se pudo acceder a IndexedDB.'));
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error ?? new Error('La transacción de IndexedDB fue cancelada.'));
      transaction.onerror = () => reject(transaction.error ?? new Error('Falló una transacción de IndexedDB.'));
    });
  }

  private async seedDefaultCategories(): Promise<void> {
    const database = await this.openDatabase();

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(categoryStoreName, 'readwrite');
      const store = transaction.objectStore(categoryStoreName);

      for (const category of defaultCategories) {
        store.put(category);
      }

      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('No se pudieron inicializar las categorías.'));
      transaction.onerror = () => reject(transaction.error ?? new Error('Falló la inicialización de categorías.'));
    });
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(new Error('Este navegador no permite almacenamiento IndexedDB.'));
    }

    this.databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(databaseName, databaseVersion);

      request.onupgradeneeded = (event) => {
        const database = request.result;

        if (!database.objectStoreNames.contains(eventStoreName)) {
          database.createObjectStore(eventStoreName, { keyPath: 'id' });
        }

        if (!database.objectStoreNames.contains(categoryStoreName)) {
          const categoryStore = database.createObjectStore(categoryStoreName, { keyPath: 'id' });
          for (const category of defaultCategories) {
            categoryStore.put(category);
          }
        }

        if (!database.objectStoreNames.contains(calendarSourceStoreName)) {
          database.createObjectStore(calendarSourceStoreName, { keyPath: 'id' });
        }

        if (!database.objectStoreNames.contains(googleAccountStoreName)) {
          database.createObjectStore(googleAccountStoreName, { keyPath: 'accountId' });
        }

        if (!database.objectStoreNames.contains(googleEventFilterStoreName)) {
          database.createObjectStore(googleEventFilterStoreName, { keyPath: 'id' });
        }

        if (!database.objectStoreNames.contains(appPreferenceStoreName)) {
          database.createObjectStore(appPreferenceStoreName, { keyPath: 'key' });
        }

        if (event.oldVersion < 2 && database.objectStoreNames.contains(eventStoreName)) {
          migrateLegacyCalendarEvents(request.transaction!);
        }

        if (event.oldVersion < 4 && database.objectStoreNames.contains(calendarSourceStoreName)) {
          migrateGoogleAccountsFromCalendarSources(request.transaction!);
        }
      };

      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB.'));
      request.onblocked = () => reject(new Error('IndexedDB está bloqueado por otra pestaña.'));
    });

    return this.databasePromise;
  }

  private createId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private googleCalendarPreferenceId(accountId: string, calendarId: string): string {
    return `google:${encodeURIComponent(accountId)}:${encodeURIComponent(calendarId)}`;
  }

  private validateDateRange(startDate: string, endDate: string, recurrenceEndDate?: string): void {
    if (compareCalendarDates(endDate, startDate) < 0) {
      throw new Error('La fecha de finalización no puede ser anterior a la fecha de inicio.');
    }

    if (recurrenceEndDate && compareCalendarDates(recurrenceEndDate, startDate) < 0) {
      throw new Error('La recurrencia no puede finalizar antes de que comience el evento.');
    }
  }
}