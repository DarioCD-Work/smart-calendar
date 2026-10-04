import { DatePipe } from '@angular/common';
import { Component, computed, inject, Input, OnChanges, OnDestroy, signal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { SmartCalendarBackup } from '../../../models/smart-calendar-backup.model';
import { BackupService } from '../../../services/backup.service';

@Component({
  selector: 'app-backup-settings',
  imports: [ButtonModule, DatePipe, DialogModule, MessageModule],
  templateUrl: './backup-settings.component.html',
  styleUrl: './backup-settings.component.css'
})
export class BackupSettingsComponent implements OnChanges, OnDestroy {
  private readonly backup = inject(BackupService);
  @Input() visible = false;
  readonly busy = signal(false);
  readonly pending = signal<SmartCalendarBackup | null>(null);
  readonly message = signal<string | null>(null);
  readonly severity = signal<'success' | 'error'>('success');
  readonly exportedAt = signal<string | null>(null);
  readonly preparedFile = signal<File | null>(null);
  readonly shareAvailable = computed(() => {
    const file = this.preparedFile();
    return Boolean(file && navigator.canShare?.({ files: [file] }));
  });
  private readSequence = 0;
  private reloadTimer?: ReturnType<typeof setTimeout>;

  async export(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set(null);
    try {
      const { backup, file } = await this.backup.exportBackup();
      this.preparedFile.set(file);
      this.backup.download(file);
      this.exportedAt.set(backup.exportedAt);
      this.feedback('Copia de seguridad creada.', 'success');
    } catch {
      this.feedback('No se pudo crear la copia de seguridad.', 'error');
    } finally {
      this.busy.set(false);
    }
  }

  async savePreparedFile(): Promise<void> {
    const file = this.preparedFile();
    if (!file || this.busy()) return;
    this.busy.set(true);
    try {
      if (await this.backup.saveFile(file)) this.feedback('Copia de seguridad creada.', 'success');
    } catch {
      this.feedback('No se pudo guardar el archivo.', 'error');
    } finally {
      this.busy.set(false);
    }
  }

  async import(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || this.busy()) return;
    const sequence = ++this.readSequence;
    this.busy.set(true);
    this.message.set(null);
    try {
      const backup = await this.backup.readBackupFile(file);
      if (sequence === this.readSequence && this.visible) this.pending.set(backup);
    } catch {
      if (sequence === this.readSequence) {
        this.feedback('No es una copia de seguridad válida de Smart Calendar.', 'error');
      }
    } finally {
      if (sequence === this.readSequence) this.busy.set(false);
    }
  }

  cancel(): void {
    if (!this.busy()) this.pending.set(null);
  }

  async restore(): Promise<void> {
    const backup = this.pending();
    if (!backup || this.busy()) return;
    this.busy.set(true);
    this.message.set(null);
    try {
      await this.backup.restoreBackup(backup);
      this.feedback('Copia restaurada correctamente.', 'success');
      this.reloadTimer = setTimeout(() => window.location.reload(), 1200);
    } catch {
      this.feedback('No se pudo restaurar la copia. Tus datos actuales no se han modificado.', 'error');
      this.busy.set(false);
    }
  }

  private feedback(message: string, severity: 'success' | 'error'): void {
    this.message.set(message);
    this.severity.set(severity);
  }

  ngOnChanges(): void {
    if (!this.visible && this.reloadTimer === undefined) {
      this.readSequence += 1;
      this.pending.set(null);
      this.busy.set(false);
    }
  }

  ngOnDestroy(): void {
    this.readSequence += 1;
    if (this.reloadTimer !== undefined) clearTimeout(this.reloadTimer);
  }
}