import { computed, Injectable, inject, signal } from '@angular/core';
import { CalendarSourcePreference, GoogleCalendarConfig } from '../models/external-calendar.model';
import { EventCategory } from '../models/event-category.model';
import { GoogleCalendarAccountConfig, GoogleCalendarAccountView } from '../models/google-account.model';
import { CalendarStorageService } from './calendar-storage.service';

export function googleCalendarPreferenceId(accountId: string, calendarId: string): string {
  return `google:${encodeURIComponent(accountId)}:${encodeURIComponent(calendarId)}`;
}

@Injectable({ providedIn: 'root' })
export class CalendarSourceService {
  private readonly storage = inject(CalendarStorageService);
  private initialization?: Promise<void>;

  readonly preferences = signal<CalendarSourcePreference[]>([]);
  readonly googleAccounts = signal<GoogleCalendarAccountConfig[]>([]);
  readonly googleCalendars = computed(() => this.preferences()
    .filter((preference): preference is GoogleCalendarConfig => preference.provider === 'google')
    .sort((first, second) => first.accountEmail.localeCompare(second.accountEmail)
      || first.name.localeCompare(second.name)));

  getGoogleAccountViews(connectedAccountIds: readonly string[]): GoogleCalendarAccountView[] {
    const calendarsByAccount = new Map<string, GoogleCalendarConfig[]>();

    for (const calendar of this.googleCalendars()) {
      const calendars = calendarsByAccount.get(calendar.accountId) ?? [];
      calendars.push(calendar);
      calendarsByAccount.set(calendar.accountId, calendars);
    }

    const accountConfigs = new Map(this.googleAccounts().map((account) => [account.accountId, account]));
    for (const [accountId, calendars] of calendarsByAccount) {
      if (!accountConfigs.has(accountId)) {
        accountConfigs.set(accountId, { accountId, email: calendars[0].accountEmail });
      }
    }

    return [...accountConfigs.values()].map((account) => ({
      ...account,
      configured: true,
      connected: connectedAccountIds.includes(account.accountId),
      calendars: calendarsByAccount.get(account.accountId) ?? []
    }));
  }

  getLocalCalendarViews(categories: readonly EventCategory[]): { category: EventCategory; visible: boolean }[] {
    return categories.map((category) => ({
      category,
      visible: this.isLocalCalendarVisible(category.id)
    }));
  }

  initialize(): Promise<void> {
    this.initialization ??= Promise.all([
      this.storage.getCalendarSourcePreferences(),
      this.storage.getGoogleAccountConfigs()
    ]).then(([preferences, accounts]) => {
      this.preferences.set(preferences);
      this.googleAccounts.set(accounts);
    });
    return this.initialization;
  }

  isLocalCalendarVisible(categoryId: string | undefined): boolean {
    if (!categoryId) {
      return true;
    }

    const preference = this.preferences().find((item) =>
      item.provider === 'local' && item.categoryId === categoryId
    );
    return preference?.visible ?? true;
  }

  async setLocalCalendarVisibility(categoryId: string, visible: boolean): Promise<void> {
    await this.initialize();
    const preference = {
      id: `local:${encodeURIComponent(categoryId)}`,
      provider: 'local' as const,
      categoryId,
      visible
    };
    await this.savePreference(preference);
  }

  async setGoogleCalendarVisibility(id: string, visible: boolean): Promise<void> {
    await this.initialize();
    const preference = this.googleCalendars().find((calendar) => calendar.id === id);
    if (!preference || preference.visible === visible) {
      return;
    }

    await this.savePreference({ ...preference, visible });
  }

  async saveGoogleCalendars(
    accountId: string,
    accountEmail: string,
    calendars: Omit<GoogleCalendarConfig, 'id' | 'provider' | 'accountId' | 'accountEmail'>[]
  ): Promise<void> {
    await this.initialize();
    const saved = await this.storage.saveGoogleCalendarsForAccount(accountId, accountEmail, calendars);
    this.preferences.update((preferences) => [
      ...preferences.filter((preference) => preference.provider !== 'google' || preference.accountId !== accountId),
      ...saved
    ]);
  }

  async saveGoogleAccount(account: GoogleCalendarAccountConfig): Promise<void> {
    await this.initialize();
    const saved = await this.storage.saveGoogleAccountConfig(account);
    this.googleAccounts.update((accounts) => [
      ...accounts.filter((item) => item.accountId !== saved.accountId),
      saved
    ]);
  }

  async disconnectGoogleAccount(accountId: string): Promise<void> {
    await this.initialize();
    await Promise.all([
      this.storage.deleteGoogleCalendarsForAccount(accountId),
      this.storage.deleteGoogleAccountConfig(accountId)
    ]);
    this.preferences.update((preferences) => preferences.filter((preference) =>
      preference.provider !== 'google' || preference.accountId !== accountId
    ));
    this.googleAccounts.update((accounts) => accounts.filter((account) => account.accountId !== accountId));
  }

  private async savePreference(preference: CalendarSourcePreference): Promise<void> {
    const saved = await this.storage.saveCalendarSourcePreference(preference);
    this.preferences.update((preferences) => {
      const existingIndex = preferences.findIndex((item) => item.id === saved.id);
      if (existingIndex === -1) {
        return [...preferences, saved];
      }

      return preferences.map((item) => item.id === saved.id ? saved : item);
    });
  }
}