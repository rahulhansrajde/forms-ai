import type { GoogleAccountConnection } from '../../../domain/entities/google-account-connection.js';
import type { OAuthGateway } from '../../../domain/interfaces/google.js';
import type { ConnectedAccountRepository } from '../../../domain/interfaces/repositories.js';
import type { Clock } from '../../../domain/interfaces/system.js';
import { GoogleOAuthError } from '../../../shared/errors/application-errors.js';

export class GoogleCredentialService {
  constructor(
    private readonly gateway: OAuthGateway,
    private readonly connections: ConnectedAccountRepository,
    private readonly clock: Clock,
  ) {}

  async requireConnection(userId: string): Promise<GoogleAccountConnection> {
    const connection = await this.connections.findGoogleConnection(userId);
    if (!connection) {
      throw new GoogleOAuthError('GOOGLE_NOT_CONNECTED', 'Connect your Google account to continue.');
    }
    return connection;
  }

  async accessTokenFor(userId: string): Promise<string> {
    const connection = await this.requireConnection(userId);
    if (connection.hasUsableAccessToken(this.clock.now())) {
      return connection.credentials.accessToken;
    }
    return this.refresh(connection);
  }

  private async refresh(connection: GoogleAccountConnection): Promise<string> {
    const refreshToken = connection.credentials.refreshToken;
    if (refreshToken === null) {
      throw this.reconnectRequired();
    }
    try {
      const grant = await this.gateway.refreshAccessToken(refreshToken);
      const now = this.clock.now();
      const refreshed = connection.withRefreshedAccessToken(
        grant.accessToken,
        new Date(now.getTime() + grant.expiresInSeconds * 1000),
        now,
      );
      await this.connections.saveGoogleConnection(refreshed);
      return grant.accessToken;
    } catch (error) {
      if (error instanceof GoogleOAuthError && error.code === 'GOOGLE_RECONNECT_REQUIRED') {
        await this.connections.deleteGoogleConnection(connection.userId);
      }
      throw error;
    }
  }

  private reconnectRequired(): GoogleOAuthError {
    return new GoogleOAuthError('GOOGLE_RECONNECT_REQUIRED', 'Your Google connection has expired. Please reconnect Google.');
  }
}
