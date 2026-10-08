import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import cookieParser from 'cookie-parser';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import type { AuthenticationMiddleware } from '../middleware/authentication-middleware.js';
import type { ErrorResponder } from '../middleware/error-responder.js';
import type { OriginGuard } from '../middleware/origin-guard.js';
import type { RateLimits } from '../middleware/rate-limits.js';
import { API_PATH_PREFIXES, authRoutes, conversationRoutes, draftRoutes, googleRoutes, sheetRoutes, type ApiControllers } from '../routes/api-routes.js';

const JSON_BODY_LIMIT = '256kb';

export interface HttpApplicationDependencies {
  controllers: ApiControllers;
  authentication: AuthenticationMiddleware;
  originGuard: OriginGuard;
  rateLimits: RateLimits;
  errors: ErrorResponder;
  trustProxy: boolean;
  frontendDistDirectory: string | null;
}

export class HttpApplicationFactory {
  create(dependencies: HttpApplicationDependencies): Express {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', dependencies.trustProxy);
    app.use(helmet({ contentSecurityPolicy: this.contentSecurityPolicy() }));
    app.use(express.json({ limit: JSON_BODY_LIMIT }));
    app.use(cookieParser());
    app.use(dependencies.originGuard.verify);
    app.use([...API_PATH_PREFIXES], this.disableCaching);
    app.get('/health', (_request, response) => {
      response.json({ status: 'ok' });
    });
    this.mountApi(app, dependencies);
    this.mountFrontend(app, dependencies.frontendDistDirectory);
    app.use(dependencies.errors.notFound);
    app.use(dependencies.errors.handle);
    return app;
  }

  private mountApi(app: Express, dependencies: HttpApplicationDependencies): void {
    const { controllers, authentication, rateLimits } = dependencies;
    app.use(googleRoutes(controllers.googleOAuth, controllers.googleIntegration, authentication, rateLimits));
    app.use(authRoutes(controllers.auth, authentication, rateLimits));
    app.use(conversationRoutes(controllers.conversations, authentication, rateLimits));
    app.use(draftRoutes(controllers.drafts, authentication));
    app.use(sheetRoutes(controllers.sheets, authentication, rateLimits));
  }

  private mountFrontend(app: Express, directory: string | null): void {
    if (!directory || !existsSync(join(directory, 'index.html'))) {
      return;
    }
    const root = resolve(directory);
    app.use(express.static(root, { index: false, maxAge: '1h' }));
    app.use((request: Request, response: Response, next: NextFunction) => {
      const isApiPath = API_PATH_PREFIXES.some((prefix) => request.path === prefix || request.path.startsWith(`${prefix}/`));
      if (request.method !== 'GET' || isApiPath || !request.accepts('html')) {
        next();
        return;
      }
      response.sendFile(join(root, 'index.html'));
    });
  }

  private readonly disableCaching = (_request: Request, response: Response, next: NextFunction): void => {
    response.set('Cache-Control', 'no-store');
    next();
  };

  private contentSecurityPolicy() {
    return {
      directives: {
        defaultSrc: ["'self'"],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        formAction: ["'self'", 'https://accounts.google.com'],
      },
    };
  }
}
