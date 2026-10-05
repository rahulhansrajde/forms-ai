import type { Request, Response } from 'express';
import type {
  AuthenticationResult,
  ChangePasswordUseCase,
  GetCurrentUserUseCase,
  LogInUseCase,
  LogOutUseCase,
  SignUpUseCase,
  UpdateProfileUseCase,
} from '../../application/use-cases/auth/auth-use-cases.js';
import type { SessionCookie } from '../http/cookies.js';
import { principalOf } from '../http/principal.js';
import {
  changePasswordBodySchema,
  logInBodySchema,
  signUpBodySchema,
  updateProfileBodySchema,
} from '../validators/request-schemas.js';
import type { RequestValidator } from '../validators/request-validator.js';

export interface AuthUseCases {
  signUp: SignUpUseCase;
  logIn: LogInUseCase;
  logOut: LogOutUseCase;
  currentUser: GetCurrentUserUseCase;
  updateProfile: UpdateProfileUseCase;
  changePassword: ChangePasswordUseCase;
}

export class AuthController {
  constructor(
    private readonly useCases: AuthUseCases,
    private readonly validator: RequestValidator,
    private readonly sessionCookie: SessionCookie,
  ) {}

  readonly signUp = async (request: Request, response: Response): Promise<void> => {
    const result = await this.useCases.signUp.execute(this.validator.body(signUpBodySchema, request.body));
    this.respondAuthenticated(response, 201, result);
  };

  readonly logIn = async (request: Request, response: Response): Promise<void> => {
    const result = await this.useCases.logIn.execute(this.validator.body(logInBodySchema, request.body));
    this.respondAuthenticated(response, 200, result);
  };

  readonly logOut = async (request: Request, response: Response): Promise<void> => {
    await this.useCases.logOut.execute(this.sessionCookie.read(request));
    this.sessionCookie.clear(response);
    response.status(204).end();
  };

  readonly me = async (_request: Request, response: Response): Promise<void> => {
    response.json({ user: await this.useCases.currentUser.execute(principalOf(response).userId) });
  };

  readonly updateProfile = async (request: Request, response: Response): Promise<void> => {
    const body = this.validator.body(updateProfileBodySchema, request.body);
    response.json({ user: await this.useCases.updateProfile.execute(principalOf(response).userId, body) });
  };

  readonly changePassword = async (request: Request, response: Response): Promise<void> => {
    const body = this.validator.body(changePasswordBodySchema, request.body);
    await this.useCases.changePassword.execute(principalOf(response), body);
    response.status(204).end();
  };

  private respondAuthenticated(response: Response, status: number, result: AuthenticationResult): void {
    this.sessionCookie.write(response, result.session);
    response.status(status).json({ user: result.user });
  }
}
