import {
  GoogleCalendarAuthService,
  GoogleTokenResponse
} from './google-calendar-auth.service';

interface FakeTokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
  error_callback: (error: { type?: string; message?: string }) => void;
}

describe('GoogleCalendarAuthService', () => {
  const browserWindow = window as unknown as { google?: unknown };
  let originalGoogle: unknown;

  beforeEach(() => {
    originalGoogle = browserWindow.google;
  });

  afterEach(() => {
    if (originalGoogle === undefined) {
      delete browserWindow.google;
    } else {
      browserWindow.google = originalGoogle;
    }
  });

  it('requests a prompt none token for a remembered account using login_hint', async () => {
    let tokenOptions: { prompt?: string; login_hint?: string } | undefined;
    browserWindow.google = {
      accounts: {
        oauth2: {
          initTokenClient: (config: FakeTokenClientConfig) => ({
            requestAccessToken: (options: { prompt?: string; login_hint?: string }) => {
              tokenOptions = options;
              config.callback({ access_token: 'memory-token', expires_in: 3600 });
            }
          })
        }
      }
    };

    const auth = new GoogleCalendarAuthService();
    const response = await auth.requestAccessToken('reader@example.com', 'none');
    auth.storeAccessToken('account-id', response);

    expect(tokenOptions).toEqual({ prompt: 'none', login_hint: 'reader@example.com' });
    expect(auth.getAccessToken('account-id')).toBe('memory-token');
  });

  it('leaves a remembered account unauthorized when silent OAuth requires interaction', async () => {
    browserWindow.google = {
      accounts: {
        oauth2: {
          initTokenClient: (config: FakeTokenClientConfig) => ({
            requestAccessToken: () => config.callback({ error: 'login_required' })
          })
        }
      }
    };

    const auth = new GoogleCalendarAuthService();
    await expectAsync(auth.requestAccessToken('reader@example.com', 'none'))
      .toBeRejectedWithError('login_required');

    expect(auth.hasAccessToken('account-id')).toBeFalse();
    expect(auth.activeAccountIds()).toEqual([]);
  });
});