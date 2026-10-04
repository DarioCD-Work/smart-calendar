import { Injectable, OnDestroy, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WallClockService implements OnDestroy {
  readonly now = signal(Date.now());
  private readonly update = () => this.now.set(Date.now());
  private readonly timer = setInterval(this.update, 60_000);

  constructor() {
    document.addEventListener('visibilitychange', this.update);
    window.addEventListener('pageshow', this.update);
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.update);
    window.removeEventListener('pageshow', this.update);
  }
}