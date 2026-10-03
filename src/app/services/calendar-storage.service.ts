import { Injectable } from '@angular/core';
import { CalendarEvent, CalendarEventDraft } from '../models/calendar-event.model';
import { EventCategory } from '../models/event-category.model';
import { compareCalendarDates } from './calendar-date.service';

const databaseName = 'smart-calendar';
const databaseVersion = 2;
const eventStoreName = 'events';
const categoryStoreName = 'categories';

const defaultCategories: EventCategory[] = [
  { id: 'personal', name: 'Personal', color: '#397b5a' },
  { id: 'work', name: 'Trabajo', color: '#3f6c9c' },
  { id: 'training', name: 'Entrenamiento', color: '#c16c37' },
  { id: 'birthday', name: 'Cumpleaños', color: '#ba5664' },
  { id: 'appointments', name: 'Citas', color: '#6d7851' },
  { id: 'other', name: 'Otros', color: '#687975' }
];

@Injectable({ providedIn: 'root' })
export class CalendarStorageService {
  private databasePromise?: Promise<IDBDatabase>;

  async getEvents(): Promise<CalendarEvent[]> {
    return this.getAll<CalendarEvent>(eventStoreName);
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

        if (event.oldVersion < 2 && database.objectStoreNames.contains(eventStoreName)) {
          const cursorRequest = request.transaction!.objectStore(eventStoreName).openCursor();

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

  private validateDateRange(startDate: string, endDate: string, recurrenceEndDate?: string): void {
    if (compareCalendarDates(endDate, startDate) < 0) {
      throw new Error('La fecha de finalización no puede ser anterior a la fecha de inicio.');
    }

    if (recurrenceEndDate && compareCalendarDates(recurrenceEndDate, startDate) < 0) {
      throw new Error('La recurrencia no puede finalizar antes de que comience el evento.');
    }
  }
}