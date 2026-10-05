import { Session } from '../../../domain/entities/session.js';
import type { SessionRepository } from '../../../domain/interfaces/repositories.js';
import type { RandomTokenGenerator, TokenDigester } from '../../../domain/interfaces/security.js';
import type { Clock, IdentifierGenerator } from '../../../domain/interfaces/system.js';

export interface IssuedSession {
  token: string;
  expiresAt: Date;
}

export interface AuthenticatedPrincipal {
  userId: string;
  sessionId: string;
}

export class SessionService {
  constructor(
    private readonly sessions: SessionRepository,
    private readonly tokens: RandomTokenGenerator,
    private readonly digester: TokenDigester,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
    private readonly lifetimeMs: number,
  ) {}

  async start(userId: string): Promise<IssuedSession> {
    const token = this.tokens.generate();
    const session = Session.start(
      this.identifiers.generate(),
      userId,
      this.digester.digest(token),
      this.clock.now(),
      this.lifetimeMs,
    );
    await this.sessions.insert(session);
    return { token, expiresAt: session.expiresAt };
  }

  async resolve(token: string): Promise<AuthenticatedPrincipal | null> {
    const session = await this.sessions.findByTokenHash(this.digester.digest(token));
    if (!session) {
      return null;
    }
    if (session.isExpiredAt(this.clock.now())) {
      await this.sessions.deleteById(session.id);
      return null;
    }
    return { userId: session.userId, sessionId: session.id };
  }

  async end(token: string): Promise<void> {
    const session = await this.sessions.findByTokenHash(this.digester.digest(token));
    if (session) {
      await this.sessions.deleteById(session.id);
    }
  }

  async endOtherSessions(principal: AuthenticatedPrincipal): Promise<void> {
    await this.sessions.deleteOtherSessions(principal.userId, principal.sessionId);
  }
}
