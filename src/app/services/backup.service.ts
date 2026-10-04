import { inject, Injectable } from '@angular/core';
import { SmartCalendarBackup, backupPreferenceKeys } from '../models/smart-calendar-backup.model';
import { CalendarStorageService } from './calendar-storage.service';
import { isCalendarViewMode } from '../models/calendar-view-mode.model';
import { formatCalendarDate } from './calendar-date.service';
import { GoogleCalendarService } from './google-calendar.service';
import { WeatherService } from './weather.service';

type RecordValue = Record<string, unknown>;
const invalidMessage = 'No es una copia de seguridad válida de Smart Calendar.';
const eventFields = ['id', 'title', 'startDate', 'endDate', 'startTime', 'endTime', 'allDay', 'categoryId', 'notes', 'recurrence', 'createdAt', 'updatedAt'];
const recurrenceFields = ['frequency', 'interval', 'daysOfWeek', 'endDate'];
const categoryFields = ['id', 'name', 'color'];
const localSourceFields = ['id', 'provider', 'categoryId', 'visible'];
const googleSourceFields = ['id', 'provider', 'accountId', 'accountEmail', 'calendarId', 'name', 'calendarColor', 'visible', 'primary', 'timeZone'];
const accountFields = ['accountId', 'email', 'name', 'picture'];
const filterFields = ['id', 'accountId', 'calendarId', 'type', 'value', 'enabled'];
const locationFields = ['name', 'latitude', 'longitude', 'timezone'];

function invalid(): never {
  throw new Error(invalidMessage);
}

function record(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  return value as RecordValue;
}

function fields(value: unknown, allowed: readonly string[]): RecordValue {
  const item = record(value);
  if (Object.keys(item).some(key => !allowed.includes(key))) invalid();
  return item;
}

function pick(value: unknown, allowed: readonly string[]): RecordValue {
  const item = record(value);
  return Object.fromEntries(allowed.filter(key => item[key] !== undefined).map(key => [key, item[key]]));
}

function text(value: unknown, allowEmpty = false): value is string {
  return typeof value === 'string' && (allowEmpty || Boolean(value.trim()));
}

function optionalText(item: RecordValue, key: string, allowEmpty = false): void {
  if (item[key] !== undefined && !text(item[key], allowEmpty)) invalid();
}

function date(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && date(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}

function time(value: unknown): boolean {
  return value === undefined || (typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value));
}

function color(value: unknown): boolean {
  return typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
}

function array(value: unknown, key: string): RecordValue[] {
  if (!Array.isArray(value)) invalid();
  const items = value.map(record);
  const keys = items.map(item => item[key]);
  if (keys.some(value => !text(value)) || new Set(keys).size !== keys.length) invalid();
  return items;
}

function validLocation(value: unknown): void {
  if (value === null) return;
  const item = fields(value, locationFields);
  if (!text(item['name']) || typeof item['latitude'] !== 'number' || !Number.isFinite(item['latitude'])
    || Math.abs(item['latitude']) > 90 || typeof item['longitude'] !== 'number'
    || !Number.isFinite(item['longitude']) || Math.abs(item['longitude']) > 180) invalid();
  optionalText(item, 'timezone');
  if (item['timezone'] !== undefined) {
    try { new Intl.DateTimeFormat('en', { timeZone: item['timezone'] as string }); } catch { invalid(); }
  }
}

@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly storage = inject(CalendarStorageService);
  private readonly google = inject(GoogleCalendarService);
  private readonly weather = inject(WeatherService);

  async exportBackup(): Promise<{ backup: SmartCalendarBackup; file: File }> {
    const stored = await this.storage.readBackupData();
    const backup = this.validateBackup({
      format: 'smart-calendar-backup', version: 1, exportedAt: new Date().toISOString(),
      data: {
        events: stored.events.map(event => {
          const item = pick(event, eventFields);
          if (item['recurrence'] !== undefined) item['recurrence'] = pick(item['recurrence'], recurrenceFields);
          return item;
        }),
        categories: stored.categories.map(category => pick(category, categoryFields)),
        calendarSources: stored.calendarSources.map(source => pick(source,
          source.provider === 'local' ? localSourceFields : googleSourceFields)),
        googleAccounts: stored.googleAccounts.map(account => pick(account, accountFields)),
        googleEventFilters: stored.googleEventFilters.map(filter => pick(filter, filterFields)),
        appPreferences: stored.appPreferences.filter(preference =>
          backupPreferenceKeys.some(key => key === preference.key)).map(preference => ({
            key: preference.key,
            value: preference.key === 'weatherLocation' && preference.value !== null
              ? pick(preference.value, locationFields) : preference.value
          }))
      }
    });
    const filename = `smart-calendar-backup-${formatCalendarDate(new Date())}.json`;
    const file = new File([JSON.stringify(backup, null, 2)], filename, { type: 'application/json' });
    return { backup, file };
  }

  async readBackupFile(file: File): Promise<SmartCalendarBackup> {
    if (!/\.json$/i.test(file.name)) invalid();
    try {
      return this.validateBackup(JSON.parse(await file.text()));
    } catch {
      invalid();
    }
  }

  validateBackup(value: unknown): SmartCalendarBackup {
    const backup = fields(value, ['format', 'version', 'exportedAt', 'data']);
    if (backup['format'] !== 'smart-calendar-backup' || !timestamp(backup['exportedAt'])) invalid();
    switch (backup['version']) {
      case 1: return this.validateV1(backup);
      default: invalid();
    }
  }

  private validateV1(backup: RecordValue): SmartCalendarBackup {
    const data = fields(backup['data'], ['events', 'categories', 'calendarSources', 'googleAccounts', 'googleEventFilters', 'appPreferences']);
    const events = array(data['events'], 'id');
    for (const event of events) {
      fields(event, eventFields);
      if (!text(event['title']) || !date(event['startDate']) || !date(event['endDate'])
        || event['endDate'] < event['startDate'] || typeof event['allDay'] !== 'boolean'
        || !time(event['startTime']) || !time(event['endTime'])
        || !timestamp(event['createdAt']) || !timestamp(event['updatedAt'])) invalid();
      optionalText(event, 'categoryId');
      optionalText(event, 'notes', true);
      if (event['recurrence'] !== undefined) {
        const rule = fields(event['recurrence'], recurrenceFields);
        if (!['daily', 'weekly', 'yearly'].includes(rule['frequency'] as string)
          || !Number.isSafeInteger(rule['interval']) || (rule['interval'] as number) < 1) invalid();
        if (rule['endDate'] !== undefined && (!date(rule['endDate']) || rule['endDate'] < event['startDate'])) invalid();
        if (rule['daysOfWeek'] !== undefined && (!Array.isArray(rule['daysOfWeek'])
          || rule['daysOfWeek'].some(day => !Number.isInteger(day) || day < 0 || day > 6))) invalid();
      }
    }
    const categories = array(data['categories'], 'id');
    for (const category of categories) {
      fields(category, categoryFields);
      if (!text(category['name']) || !color(category['color'])) invalid();
    }
    const sources = array(data['calendarSources'], 'id');
    const sourceKeys = new Set<string>();
    for (const source of sources) {
      if (typeof source['visible'] !== 'boolean') invalid();
      let key: string;
      if (source['provider'] === 'local') {
        fields(source, localSourceFields);
        if (!text(source['categoryId'])) invalid();
        key = JSON.stringify(['local', source['categoryId']]);
      } else if (source['provider'] === 'google') {
        fields(source, googleSourceFields);
        if (!['accountId', 'accountEmail', 'calendarId', 'name'].every(key => text(source[key]))
          || typeof source['primary'] !== 'boolean') invalid();
        if (source['calendarColor'] !== undefined && !color(source['calendarColor'])) invalid();
        optionalText(source, 'timeZone');
        key = JSON.stringify(['google', source['accountId'], source['calendarId']]);
      } else invalid();
      if (sourceKeys.has(key)) invalid();
      sourceKeys.add(key);
    }
    const accounts = array(data['googleAccounts'], 'accountId');
    for (const account of accounts) {
      fields(account, accountFields);
      if (!text(account['email'])) invalid();
      optionalText(account, 'name', true);
      optionalText(account, 'picture', true);
    }
    const filters = array(data['googleEventFilters'], 'id');
    for (const filter of filters) {
      fields(filter, filterFields);
      if (!text(filter['accountId']) || filter['type'] !== 'title-exact' || !text(filter['value'])
        || typeof filter['enabled'] !== 'boolean') invalid();
      optionalText(filter, 'calendarId');
    }
    const preferences = array(data['appPreferences'], 'key');
    for (const preference of preferences) {
      fields(preference, ['key', 'value']);
      switch (preference['key']) {
        case 'calendarViewMode': if (!isCalendarViewMode(preference['value'])) invalid(); break;
        case 'weatherEnabled': if (typeof preference['value'] !== 'boolean') invalid(); break;
        case 'weatherLocation': validLocation(preference['value']); break;
        default: invalid();
      }
    }
    return structuredClone(backup) as unknown as SmartCalendarBackup;
  }

  async restoreBackup(value: unknown): Promise<void> {
    const backup = this.validateBackup(value);
    this.google.stopAutomaticSync();
    this.weather.stop();
    try {
      await this.storage.replaceBackupData(backup.data);
    } catch (error) {
      this.google.startAutomaticSync();
      void this.weather.start();
      throw error;
    }
  }

  download(file: File): void {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    anchor.style.display = 'none';
    document.body.append(anchor);
    try { anchor.click(); } finally {
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  }

  async saveFile(file: File): Promise<boolean> {
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Copia de Smart Calendar' });
        return true;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return false;
      }
    }
    this.download(file);
    return true;
  }
}