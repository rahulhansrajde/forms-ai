import { GoogleAccountConnection } from '../../../domain/entities/google-account-connection.js';
import type { OAuthGateway } from '../../../domain/interfaces/google.js';
import type { ConnectedAccountRepository } from '../../../domain/interfaces/repositories.js';
import type { RandomTokenGenerator } from '../../../domain/interfaces/security.js';
import type { Clock, IdentifierGenerator } from '../../../domain/interfaces/system.js';
import { GoogleOAuthError } from '../../../shared/errors/application-errors.js';

export interface AuthorizationRequest {
  state: string;
  url: string;
}

export class GoogleOAuthService {
  constructor(
    private readonly gateway: OAuthGateway,
    private readonly connections: ConnectedAccountRepository,
    private readonly stateTokens: RandomTokenGenerator,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
  ) {}

  createAuthorizationRequest(): AuthorizationRequest {
    const state = this.stateTokens.generate();
    return { state, url: this.gateway.buildAuthorizationUrl(state) };
  }

  async connect(userId: string, authorizationCode: string): Promise<GoogleAccountConnection> {
    const grant = await this.gateway.exchangeAuthorizationCode(authorizationCode);
    const identity = await this.gateway.fetchIdentity(grant.accessToken);
    const now = this.clock.now();
    const candidate = GoogleAccountConnection.establish(
      {
        id: this.identifiers.generate(),
        userId,
        providerAccountId: identity.accountId,
        email: identity.email,
        scopes: grant.scopes,
        credentials: {
          accessToken: grant.accessToken,
          refreshToken: grant.refreshToken,
          expiresAt: new Date(now.getTime() + grant.expiresInSeconds * 1000),
        },
      },
      now,
    );
    if (!candidate.canManageForms()) {
      throw new GoogleOAuthError('GOOGLE_OAUTH_FAILED', 'Google Forms access was not granted. Please allow access to continue.');
    }
    const existing = await this.connections.findGoogleConnection(userId);
    const connection = existing ? existing.reconnect(candidate, now) : candidate;
    await this.connections.saveGoogleConnection(connection);
    return connection;
  }
}
