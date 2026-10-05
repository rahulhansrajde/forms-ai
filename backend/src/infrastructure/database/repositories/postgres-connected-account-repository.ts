import { GOOGLE_PROVIDER, GoogleAccountConnection } from '../../../domain/entities/google-account-connection.js';
import type { ConnectedAccountRepository } from '../../../domain/interfaces/repositories.js';
import type { TokenEncryptionService } from '../../../domain/interfaces/security.js';
import type { Database } from '../connection/database.js';

interface ConnectedAccountRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  provider_account_id: string;
  provider_account_email: string;
  scopes: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string | null;
  token_expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export class PostgresConnectedAccountRepository implements ConnectedAccountRepository {
  constructor(
    private readonly database: Database,
    private readonly encryption: TokenEncryptionService,
  ) {}

  async findGoogleConnection(userId: string): Promise<GoogleAccountConnection | null> {
    const rows = await this.database.query<ConnectedAccountRow>(
      `SELECT id, user_id, provider_account_id, provider_account_email, scopes, access_token_encrypted,
              refresh_token_encrypted, token_expires_at, created_at, updated_at
       FROM connected_accounts WHERE user_id = $1 AND provider = $2`,
      [userId, GOOGLE_PROVIDER],
    );
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async saveGoogleConnection(connection: GoogleAccountConnection): Promise<void> {
    const credentials = connection.credentials;
    await this.database.query(
      `INSERT INTO connected_accounts (
         id, user_id, provider, provider_account_id, provider_account_email, scopes,
         access_token_encrypted, refresh_token_encrypted, token_expires_at, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id, provider) DO UPDATE SET
         provider_account_id = EXCLUDED.provider_account_id,
         provider_account_email = EXCLUDED.provider_account_email,
         scopes = EXCLUDED.scopes,
         access_token_encrypted = EXCLUDED.access_token_encrypted,
         refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
         token_expires_at = EXCLUDED.token_expires_at,
         updated_at = EXCLUDED.updated_at`,
      [
        connection.id,
        connection.userId,
        GOOGLE_PROVIDER,
        connection.providerAccountId,
        connection.email,
        connection.scopes.join(' '),
        this.encryption.encrypt(credentials.accessToken),
        credentials.refreshToken === null ? null : this.encryption.encrypt(credentials.refreshToken),
        credentials.expiresAt,
        connection.createdAt,
        connection.updatedAt,
      ],
    );
  }

  async deleteGoogleConnection(userId: string): Promise<void> {
    await this.database.query('DELETE FROM connected_accounts WHERE user_id = $1 AND provider = $2', [
      userId,
      GOOGLE_PROVIDER,
    ]);
  }

  private toEntity(row: ConnectedAccountRow): GoogleAccountConnection {
    return GoogleAccountConnection.restore({
      id: row.id,
      userId: row.user_id,
      providerAccountId: row.provider_account_id,
      email: row.provider_account_email,
      scopes: row.scopes.split(' ').filter((scope) => scope.length > 0),
      credentials: {
        accessToken: this.encryption.decrypt(row.access_token_encrypted),
        refreshToken: row.refresh_token_encrypted === null ? null : this.encryption.decrypt(row.refresh_token_encrypted),
        expiresAt: row.token_expires_at,
      },
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
