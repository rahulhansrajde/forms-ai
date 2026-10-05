import type {
  ChangePasswordRequest,
  LogInRequest,
  SignUpRequest,
  UpdateProfileRequest,
  UserView,
} from '@forms-ai/contracts';
import { User } from '../../../domain/entities/user.js';
import type { UserRepository } from '../../../domain/interfaces/repositories.js';
import type { PasswordHasher } from '../../../domain/interfaces/security.js';
import type { Clock, IdentifierGenerator } from '../../../domain/interfaces/system.js';
import type { PasswordPolicy } from '../../../domain/services/password-policy.js';
import { EmailAddress } from '../../../domain/value-objects/email-address.js';
import { PersonName } from '../../../domain/value-objects/person-name.js';
import { AuthenticationError } from '../../../shared/errors/application-errors.js';
import { toUserView } from '../../dto/view-mappers.js';
import type { PasswordAuthenticationService } from '../../services/auth/password-authentication-service.js';
import type { AuthenticatedPrincipal, IssuedSession, SessionService } from '../../services/auth/session-service.js';

export interface AuthenticationResult {
  user: UserView;
  session: IssuedSession;
}

export class SignUpUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly passwordPolicy: PasswordPolicy,
    private readonly sessions: SessionService,
    private readonly identifiers: IdentifierGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(request: SignUpRequest): Promise<AuthenticationResult> {
    const name = PersonName.parse(request.firstName, request.lastName);
    const email = EmailAddress.parse(request.email);
    this.passwordPolicy.assertAcceptable(request.password);
    this.passwordPolicy.assertConfirmed(request.password, request.confirmPassword);
    const user = User.register(
      this.identifiers.generate(),
      name,
      email,
      await this.hasher.hash(request.password),
      this.clock.now(),
    );
    await this.users.insert(user);
    return { user: toUserView(user), session: await this.sessions.start(user.id) };
  }
}

export class LogInUseCase {
  constructor(
    private readonly authentication: PasswordAuthenticationService,
    private readonly sessions: SessionService,
  ) {}

  async execute(request: LogInRequest): Promise<AuthenticationResult> {
    const user = await this.authentication.authenticate(request.email, request.password);
    return { user: toUserView(user), session: await this.sessions.start(user.id) };
  }
}

export class LogOutUseCase {
  constructor(private readonly sessions: SessionService) {}

  async execute(sessionToken: string | null): Promise<void> {
    if (sessionToken) {
      await this.sessions.end(sessionToken);
    }
  }
}

export class GetCurrentUserUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string): Promise<UserView> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new AuthenticationError();
    }
    return toUserView(user);
  }
}

export class UpdateProfileUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, request: UpdateProfileRequest): Promise<UserView> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new AuthenticationError();
    }
    const renamed = user.rename(PersonName.parse(request.firstName, request.lastName), this.clock.now());
    await this.users.update(renamed);
    return toUserView(renamed);
  }
}

export class ChangePasswordUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly authentication: PasswordAuthenticationService,
    private readonly hasher: PasswordHasher,
    private readonly passwordPolicy: PasswordPolicy,
    private readonly sessions: SessionService,
    private readonly clock: Clock,
  ) {}

  async execute(principal: AuthenticatedPrincipal, request: ChangePasswordRequest): Promise<void> {
    const user = await this.users.findById(principal.userId);
    if (!user) {
      throw new AuthenticationError();
    }
    await this.authentication.assertPasswordMatches(user, request.currentPassword);
    this.passwordPolicy.assertAcceptable(request.newPassword, 'newPassword');
    this.passwordPolicy.assertConfirmed(request.newPassword, request.confirmPassword);
    await this.users.update(user.withPasswordHash(await this.hasher.hash(request.newPassword), this.clock.now()));
    await this.sessions.endOtherSessions(principal);
  }
}
