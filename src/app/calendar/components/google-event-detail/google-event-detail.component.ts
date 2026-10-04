import { Component, computed, input, signal } from '@angular/core';
import { CalendarDisplayOccurrence } from '../../../models/calendar-display-event.model';
import { parseCalendarDate } from '../../../services/calendar-date.service';
import { descriptionParagraphs, safeExternalUrl } from './google-event-detail.utils';

@Component({
  selector: 'app-google-event-detail',
  templateUrl: './google-event-detail.component.html',
  styleUrl: './google-event-detail.component.css'
})
export class GoogleEventDetailComponent {
  readonly occurrence = input.required<CalendarDisplayOccurrence>();
  private readonly failedImages = signal<ReadonlySet<string>>(new Set());

  readonly event = computed(() => this.occurrence().event);
  readonly paragraphs = computed(() => descriptionParagraphs(this.event().description));
  readonly location = computed(() => this.event().location?.trim() ?? '');
  readonly mapsUrl = computed(() => this.location()
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(this.location())}`
    : undefined);
  readonly calendarUrl = computed(() => safeExternalUrl(this.event().htmlLink));
  readonly accountEmail = computed(() => this.event().accountEmail?.trim() ?? '');
  readonly calendarName = computed(() => {
    const name = this.event().calendarName?.trim() ?? '';
    return name.toLowerCase() === this.accountEmail().toLowerCase() ? '' : name;
  });
  readonly attachments = computed(() => (this.event().attachments ?? []).flatMap((attachment) => {
    const url = safeExternalUrl(attachment.fileUrl);
    if (!url) {
      return [];
    }
    return [{
      url,
      title: attachment.title?.trim() || 'Adjunto',
      image: /^image\/(png|jpeg|gif|webp|avif|bmp)$/i.test(attachment.mimeType ?? '')
        && url.startsWith('https:') && !this.failedImages().has(url)
    }];
  }));

  formatDate(date: string): string {
    const label = new Intl.DateTimeFormat('es-ES', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(parseCalendarDate(date));
    return label.charAt(0).toLocaleUpperCase('es-ES') + label.slice(1);
  }

  imageFailed(url: string): void {
    this.failedImages.update((failed) => new Set([...failed, url]));
  }
}