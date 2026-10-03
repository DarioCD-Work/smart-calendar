import { Injectable, inject, signal } from '@angular/core';
import { CalendarEvent, CalendarEventDraft } from '../models/calendar-event.model';
import { EventCategory } from '../models/event-category.model';
import { CalendarStorageService } from './calendar-storage.service';

@Injectable({ providedIn: 'root' })
export class CalendarEventService {
  private readonly storage = inject(CalendarStorageService);
  private initialization?: Promise<void>;

  readonly events = signal<CalendarEvent[]>([]);
  readonly categories = signal<EventCategory[]>([]);

  initialize(): Promise<void> {
    this.initialization ??= this.loadInitialData();
    return this.initialization;
  }

  async createEvent(draft: CalendarEventDraft): Promise<CalendarEvent> {
    await this.initialize();
    const event = await this.storage.createEvent(draft);
    this.events.update((events) => [...events, event]);
    return event;
  }

  async updateEvent(event: CalendarEvent): Promise<CalendarEvent> {
    await this.initialize();
    const updatedEvent = await this.storage.updateEvent(event);
    this.events.update((events) => events.map((item) => item.id === updatedEvent.id ? updatedEvent : item));
    return updatedEvent;
  }

  async deleteEvent(id: string): Promise<void> {
    await this.initialize();
    await this.storage.deleteEvent(id);
    this.events.update((events) => events.filter((event) => event.id !== id));
  }

  async createCategory(category: Omit<EventCategory, 'id'>): Promise<EventCategory> {
    await this.initialize();
    const createdCategory = await this.storage.createCategory(category);
    this.categories.update((categories) => [...categories, createdCategory]);
    return createdCategory;
  }

  async updateCategory(category: EventCategory): Promise<EventCategory> {
    await this.initialize();
    const updatedCategory = await this.storage.updateCategory(category);
    this.categories.update((categories) => categories.map((item) => item.id === category.id ? updatedCategory : item));
    return updatedCategory;
  }

  async deleteCategory(id: string): Promise<void> {
    await this.initialize();
    await this.storage.deleteCategory(id);
    this.categories.update((categories) => categories.filter((category) => category.id !== id));
  }

  private async loadInitialData(): Promise<void> {
    const [events, categories] = await Promise.all([
      this.storage.getEvents(),
      this.storage.getCategories()
    ]);

    this.events.set(events);
    this.categories.set(categories);
  }
}