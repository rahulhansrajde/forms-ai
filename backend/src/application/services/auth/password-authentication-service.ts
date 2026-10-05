import type { User } from '../../../domain/entities/user.js';
import type { UserRepository } from '../../../domain/interfaces/repositories.js';
import type { PasswordHasher } from '../../../domain/interfaces/security.js';
import { EmailAddress } from '../../../domain/value-objects/email-address.js';
import { AuthenticationError, ValidationError } from '../../../shared/errors/application-errors.js';

const INVALID_CREDENTIALS_MESSAGE = 'Email or password is incorrect.';

export class PasswordAuthenticationService {
  private decoyHash: Promise<string> | null = null;

  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async authenticate(email: string, password: string): Promise<User> {
    const user = await this.findByEmail(email);
    if (!user) {
      await this.hasher.verify(password, await this.decoy());
      throw this.invalidCredentials();
    }
    if (!(await this.hasher.verify(password, user.passwordHash))) {
      throw this.invalidCredentials();
    }
    return user;
  }

  async assertPasswordMatches(user: User, password: string): Promise<void> {
    if (!(await this.hasher.verify(password, user.passwordHash))) {
      throw new ValidationError('Current password is incorrect.', { field: 'currentPassword' });
    }
  }

  private async findByEmail(email: string): Promise<User | null> {
    try {
      return await this.users.findByEmail(EmailAddress.parse(email).value);
    } catch (error) {
      if (error instanceof ValidationError) {
        return null;
      }
      throw error;
    }
  }

  private decoy(): Promise<string> {
    this.decoyHash ??= this.hasher.hash('forms-ai-decoy-password');
    return this.decoyHash;
  }

  private invalidCredentials(): AuthenticationError {
    return new AuthenticationError('INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE);
  }
}
