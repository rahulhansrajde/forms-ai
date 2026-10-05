import type { CookieOptions, Request, Response } from 'express';
import type { IssuedSession } from '../../application/services/auth/session-service.js';

const SESSION_COOKIE = 'forms_ai_session';
const OAUTH_STATE_COOKIE = 'forms_ai_google_oauth';
const OAUTH_STATE_LIFETIME_MS = 10 * 60 * 1000;
const OAUTH_STATE_PATH = '/auth/google';

export interface OAuthStateCookieValue {
  state: string;
  returnTo: string;
}

function readCookie(request: Request, name: string): string | null {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export class SessionCookie {
  constructor(private readonly secure: boolean) {}

  read(request: Request): string | null {
    return readCookie(request, SESSION_COOKIE);
  }

  write(response: Response, session: IssuedSession): void {
    response.cookie(SESSION_COOKIE, session.token, { ...this.baseOptions(), expires: session.expiresAt });
  }

  clear(response: Response): void {
    response.clearCookie(SESSION_COOKIE, this.baseOptions());
  }

  private baseOptions(): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: this.secure, path: '/' };
  }
}

export class OAuthStateCookie {
  constructor(private readonly secure: boolean) {}

  read(request: Request): OAuthStateCookieValue | null {
    const raw = readCookie(request, OAUTH_STATE_COOKIE);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Partial<OAuthStateCookieValue>;
      return typeof parsed.state === 'string' && typeof parsed.returnTo === 'string'
        ? { state: parsed.state, returnTo: parsed.returnTo }
        : null;
    } catch {
      return null;
    }
  }

  write(response: Response, value: OAuthStateCookieValue): void {
    response.cookie(OAUTH_STATE_COOKIE, Buffer.from(JSON.stringify(value), 'utf8').toString('base64url'), {
      ...this.baseOptions(),
      maxAge: OAUTH_STATE_LIFETIME_MS,
    });
  }

  clear(response: Response): void {
    response.clearCookie(OAUTH_STATE_COOKIE, this.baseOptions());
  }

  private baseOptions(): CookieOptions {
    return { httpOnly: true, sameSite: 'lax', secure: this.secure, path: OAUTH_STATE_PATH };
  }
}
