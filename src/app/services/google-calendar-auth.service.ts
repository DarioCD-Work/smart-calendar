import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';

const googleIdentityScriptUrl = 'https://accounts.google.com/gsi/client';

export const googleCalendarScopes = [
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly'
] as const;

export interface GoogleTokenResponse {
  access_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GoogleTokenClient {
  requestAccessToken(options?: { prompt?: string; login_hint?: string }): void;
}

interface GoogleTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
  error_callback: (error: { type?: string; message?: string }) => void;
}

interface GoogleIdentityServices {
  accounts: {
    oauth2: {
      initTokenClient(config: GoogleTokenClientConfig): GoogleTokenClient;
    };
  };
}

interface AccessTokenSession {
  accessToken: string;
  expiresAt: number;
}

@Injectable({ providedIn: 'root' })
export class GoogleCalendarAuthService {
  private readonly clientId = environment.googleCalendar.clientId.trim();
  private scriptPromise?: Promise<GoogleIdentityServices>;
  private readonly tokenSessions = new Map<string, AccessTokenSession>();

  readonly activeAccountIds = signal<string[]>([]);

  get isConfigured(): boolean {
    return this.clientId.length > 0;
  }

  async loadLibrary(): Promise<void> {
    if (!this.isConfigured) {
      return;
    }

    await this.loadGoogleIdentityServices();
  }

  async requestAccessToken(
    loginHint?: string,
    prompt: 'select_account' | 'none' = 'select_account'
  ): Promise<GoogleTokenResponse> {
    if (!this.isConfigured) {
      throw new Error('Configura el Client ID de Google para conectar calendarios.');
    }

    const identity = await this.loadGoogleIdentityServices();

    return new Promise<GoogleTokenResponse>((resolve, reject) => {
      const tokenClient = identity.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: googleCalendarScopes.join(' '),
        callback: (response) => {
          if (response.error || !response.access_token) {
            reject(new Error(response.error_description ?? response.error ?? 'Google no concedió acceso.'));
            return;
          }

          resolve(response);
        },
        error_callback: (error) => reject(new Error(error.message ?? error.type ?? 'No se pudo abrir OAuth de Google.'))
      });

      tokenClient.requestAccessToken({
        prompt,
        ...(loginHint ? { login_hint: loginHint } : {})
      });
    });
  }

  storeAccessToken(accountId: string, response: GoogleTokenResponse): void {
    if (!response.access_token) {
      throw new Error('Google devolvió una respuesta sin access token.');
    }

    this.tokenSessions.set(accountId, {
      accessToken: response.access_token,
      expiresAt: Date.now() + Math.max(60, response.expires_in ?? 3600) * 1000
    });
    this.activeAccountIds.update((accounts) => accounts.includes(accountId) ? accounts : [...accounts, accountId]);
  }

  getAccessToken(accountId: string): string | null {
    const session = this.tokenSessions.get(accountId);

    if (!session || session.expiresAt <= Date.now() + 30_000) {
      this.forgetAccount(accountId);
      return null;
    }

    return session.accessToken;
  }

  hasAccessToken(accountId: string): boolean {
    return this.getAccessToken(accountId) !== null;
  }

  forgetAccount(accountId: string): void {
    this.tokenSessions.delete(accountId);
    this.activeAccountIds.update((accounts) => accounts.filter((id) => id !== accountId));
  }

  private loadGoogleIdentityServices(): Promise<GoogleIdentityServices> {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return Promise.reject(new Error('Google OAuth solo está disponible en el navegador.'));
    }

    const currentApi = (window as Window & { google?: GoogleIdentityServices }).google;
    if (currentApi) {
      return Promise.resolve(currentApi);
    }

    this.scriptPromise ??= new Promise<GoogleIdentityServices>((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>('script[data-google-identity-services]');
      const script = existingScript ?? document.createElement('script');

      const onLoad = () => {
        const identity = (window as Window & { google?: GoogleIdentityServices }).google;
        if (identity) {
          resolve(identity);
        } else {
          reject(new Error('La biblioteca de Google Identity no se inicializó.'));
        }
      };

      script.addEventListener('load', onLoad, { once: true });
      script.addEventListener('error', () => reject(new Error('No se pudo cargar Google Identity Services.')), { once: true });

      if (!existingScript) {
        script.src = googleIdentityScriptUrl;
        script.async = true;
        script.defer = true;
        script.dataset['googleIdentityServices'] = 'true';
        document.head.appendChild(script);
      }
    });

    return this.scriptPromise;
  }
}