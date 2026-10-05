import type { GoogleConnectionView } from '@forms-ai/contracts';
import type { OAuthGateway } from '../../../domain/interfaces/google.js';
import type { ConnectedAccountRepository } from '../../../domain/interfaces/repositories.js';
import type { TokenDigester } from '../../../domain/interfaces/security.js';
import type { Logger } from '../../../domain/interfaces/system.js';
import { GoogleOAuthError } from '../../../shared/errors/application-errors.js';
import { toGoogleConnectionView } from '../../dto/view-mappers.js';
import type { AuthorizationRequest, GoogleOAuthService } from '../../services/google/google-oauth-service.js';

export interface GoogleAuthorizationCallback {
  code: string;
  state: string;
  expectedState: string | null;
}

export class StartGoogleAuthorizationUseCase {
  constructor(private readonly oauth: GoogleOAuthService) {}

  execute(): AuthorizationRequest {
    return this.oauth.createAuthorizationRequest();
  }
}

export class ConnectGoogleAccountUseCase {
  constructor(
    private readonly oauth: GoogleOAuthService,
    private readonly digester: TokenDigester,
  ) {}

  async execute(userId: string, callback: GoogleAuthorizationCallback): Promise<GoogleConnectionView> {
    if (!callback.expectedState || this.digester.digest(callback.state) !== this.digester.digest(callback.expectedState)) {
      throw new GoogleOAuthError('GOOGLE_OAUTH_FAILED', 'The Google authorization request could not be verified. Please try again.');
    }
    return toGoogleConnectionView(await this.oauth.connect(userId, callback.code));
  }
}

export class GetGoogleConnectionStatusUseCase {
  constructor(private readonly connections: ConnectedAccountRepository) {}

  async execute(userId: string): Promise<GoogleConnectionView> {
    return toGoogleConnectionView(await this.connections.findGoogleConnection(userId));
  }
}

export class DisconnectGoogleAccountUseCase {
  constructor(
    private readonly connections: ConnectedAccountRepository,
    private readonly gateway: OAuthGateway,
    private readonly logger: Logger,
  ) {}

  async execute(userId: string): Promise<void> {
    const connection = await this.connections.findGoogleConnection(userId);
    if (!connection) {
      return;
    }
    await this.connections.deleteGoogleConnection(userId);
    const credentials = connection.credentials;
    try {
      await this.gateway.revokeToken(credentials.refreshToken ?? credentials.accessToken);
    } catch (error) {
      this.logger.warn('Google token revocation failed after disconnect', { userId, error });
    }
  }
}
