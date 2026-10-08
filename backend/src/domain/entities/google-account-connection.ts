export const GOOGLE_PROVIDER = 'GOOGLE';

export const GOOGLE_FORMS_SCOPE = 'https://www.googleapis.com/auth/forms.body';
export const GOOGLE_SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

export interface GoogleCredentials {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}

export interface GoogleAccountConnectionProps {
  id: string;
  userId: string;
  providerAccountId: string;
  email: string;
  scopes: string[];
  credentials: GoogleCredentials;
  createdAt: Date;
  updatedAt: Date;
}

const ACCESS_TOKEN_EXPIRY_SKEW_MS = 60_000;

export class GoogleAccountConnection {
  private constructor(private readonly props: GoogleAccountConnectionProps) {}

  static restore(props: GoogleAccountConnectionProps): GoogleAccountConnection {
    return new GoogleAccountConnection({ ...props, credentials: { ...props.credentials } });
  }

  static establish(props: Omit<GoogleAccountConnectionProps, 'createdAt' | 'updatedAt'>, at: Date): GoogleAccountConnection {
    return new GoogleAccountConnection({ ...props, createdAt: at, updatedAt: at });
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get providerAccountId(): string {
    return this.props.providerAccountId;
  }

  get email(): string {
    return this.props.email;
  }

  get scopes(): string[] {
    return [...this.props.scopes];
  }

  get credentials(): GoogleCredentials {
    return { ...this.props.credentials };
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  canManageForms(): boolean {
    return this.props.scopes.includes(GOOGLE_FORMS_SCOPE);
  }

  canManageSheets(): boolean {
    return this.props.scopes.includes(GOOGLE_SHEETS_SCOPE);
  }

  hasUsableAccessToken(moment: Date): boolean {
    return this.props.credentials.expiresAt.getTime() - ACCESS_TOKEN_EXPIRY_SKEW_MS > moment.getTime();
  }

  canRefresh(): boolean {
    return this.props.credentials.refreshToken !== null;
  }

  withRefreshedAccessToken(accessToken: string, expiresAt: Date, at: Date): GoogleAccountConnection {
    return new GoogleAccountConnection({
      ...this.props,
      credentials: { ...this.props.credentials, accessToken, expiresAt },
      updatedAt: at,
    });
  }

  reconnect(next: GoogleAccountConnection, at: Date): GoogleAccountConnection {
    return new GoogleAccountConnection({
      ...next.props,
      id: this.props.id,
      credentials: {
        ...next.props.credentials,
        refreshToken: next.props.credentials.refreshToken ?? this.props.credentials.refreshToken,
      },
      createdAt: this.props.createdAt,
      updatedAt: at,
    });
  }
}
