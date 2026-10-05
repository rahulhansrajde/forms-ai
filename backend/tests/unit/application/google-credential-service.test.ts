import { describe, expect, it } from 'vitest';
import { GoogleCredentialService } from '../../../src/application/services/google/google-credential-service.js';
import { SessionService } from '../../../src/application/services/auth/session-service.js';
import { GoogleAccountConnection } from '../../../src/domain/entities/google-account-connection.js';
import type { Session } from '../../../src/domain/entities/session.js';
import type { ConnectedAccountRepository, SessionRepository } from '../../../src/domain/interfaces/repositories.js';
import type { Clock } from '../../../src/domain/interfaces/system.js';
import { CryptoRandomTokenGenerator, Sha256TokenDigester } from '../../../src/infrastructure/security/opaque-token-services.js';
import { GoogleOAuthError } from '../../../src/shared/errors/application-errors.js';
import { SequentialIdentifiers } from '../../support/domain-fixtures.js';
import { FakeOAuthGateway } from '../../support/fakes.js';

class AdjustableClock implements Clock {
  constructor(public current: Date) {}

  now(): Date {
    return new Date(this.current);
  }
}

class InMemoryConnections implements ConnectedAccountRepository {
  connection: GoogleAccountConnection | null = null;

  async findGoogleConnection(): Promise<GoogleAccountConnection | null> {
    return this.connection;
  }

  async saveGoogleConnection(connection: GoogleAccountConnection): Promise<void> {
    this.connection = connection;
  }

  async deleteGoogleConnection(): Promise<void> {
    this.connection = null;
  }
}

function connection(expiresAt: Date, refreshToken: string | null): GoogleAccountConnection {
  return GoogleAccountConnection.establish(
    {
      id: 'connection',
      userId: 'user',
      providerAccountId: 'account',
      email: 'a@gmail.com',
      scopes: ['https://www.googleapis.com/auth/forms.body'],
      credentials: { accessToken: 'stored-access', refreshToken, expiresAt },
    },
    new Date('2026-01-01T00:00:00Z'),
  );
}

describe('GoogleCredentialService', () => {
  const clock = new AdjustableClock(new Date('2026-01-01T00:00:00Z'));

  it('reuses a valid access token without refreshing', async () => {
    const repository = new InMemoryConnections();
    repository.connection = connection(new Date('2026-01-01T01:00:00Z'), 'refresh');
    const gateway = new FakeOAuthGateway();
    expect(await new GoogleCredentialService(gateway, repository, clock).accessTokenFor('user')).toBe('stored-access');
    expect(gateway.refreshedTokens).toEqual([]);
  });

  it('refreshes an expired access token and persists it', async () => {
    const repository = new InMemoryConnections();
    repository.connection = connection(new Date('2025-12-31T23:00:00Z'), 'refresh');
    const gateway = new FakeOAuthGateway();
    const token = await new GoogleCredentialService(gateway, repository, clock).accessTokenFor('user');
    expect(token).not.toBe('stored-access');
    expect(gateway.refreshedTokens).toEqual(['refresh']);
    expect(repository.connection?.credentials.accessToken).toBe(token);
    expect(repository.connection?.credentials.refreshToken).toBe('refresh');
  });

  it('requires reconnection when no refresh token exists', async () => {
    const repository = new InMemoryConnections();
    repository.connection = connection(new Date('2025-12-31T23:00:00Z'), null);
    await expect(new GoogleCredentialService(new FakeOAuthGateway(), repository, clock).accessTokenFor('user')).rejects.toMatchObject({
      code: 'GOOGLE_RECONNECT_REQUIRED',
    });
  });

  it('drops a revoked connection', async () => {
    const repository = new InMemoryConnections();
    repository.connection = connection(new Date('2025-12-31T23:00:00Z'), 'refresh');
    const gateway = new FakeOAuthGateway();
    gateway.refreshFailure = new GoogleOAuthError('GOOGLE_RECONNECT_REQUIRED', 'expired');
    await expect(new GoogleCredentialService(gateway, repository, clock).accessTokenFor('user')).rejects.toBeInstanceOf(GoogleOAuthError);
    expect(repository.connection).toBeNull();
  });

  it('reports a missing connection', async () => {
    await expect(new GoogleCredentialService(new FakeOAuthGateway(), new InMemoryConnections(), clock).accessTokenFor('user')).rejects.toMatchObject({
      code: 'GOOGLE_NOT_CONNECTED',
    });
  });
});

class InMemorySessions implements SessionRepository {
  readonly sessions = new Map<string, Session>();

  async insert(session: Session): Promise<void> {
    this.sessions.set(session.tokenHash, session);
  }

  async findByTokenHash(tokenHash: string): Promise<Session | null> {
    return this.sessions.get(tokenHash) ?? null;
  }

  async deleteById(id: string): Promise<void> {
    for (const [hash, session] of this.sessions) {
      if (session.id === id) {
        this.sessions.delete(hash);
      }
    }
  }

  async deleteOtherSessions(): Promise<void> {}
}

describe('SessionService', () => {
  it('stores only a digest of the session token and expires sessions', async () => {
    const clock = new AdjustableClock(new Date('2026-01-01T00:00:00Z'));
    const repository = new InMemorySessions();
    const service = new SessionService(
      repository,
      new CryptoRandomTokenGenerator(),
      new Sha256TokenDigester(),
      new SequentialIdentifiers(),
      clock,
      60_000,
    );
    const issued = await service.start('user');
    expect([...repository.sessions.keys()]).not.toContain(issued.token);
    expect(await service.resolve(issued.token)).toMatchObject({ userId: 'user' });
    expect(await service.resolve('unknown-token')).toBeNull();

    clock.current = new Date('2026-01-01T00:01:00Z');
    expect(await service.resolve(issued.token)).toBeNull();
    expect(repository.sessions.size).toBe(0);
  });
});
