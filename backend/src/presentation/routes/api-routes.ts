import { Router } from 'express';
import type { AuthController } from '../controllers/auth-controller.js';
import type { ConversationController } from '../controllers/conversation-controller.js';
import type { DraftController } from '../controllers/draft-controller.js';
import type { GoogleIntegrationController, GoogleOAuthController } from '../controllers/google-controllers.js';
import type { SheetsController } from '../controllers/sheets-controller.js';
import type { AuthenticationMiddleware } from '../middleware/authentication-middleware.js';
import type { RateLimits } from '../middleware/rate-limits.js';

export const API_PATH_PREFIXES = ['/auth', '/conversations', '/drafts', '/integrations', '/google-forms', '/sheets'] as const;

export interface ApiControllers {
  auth: AuthController;
  conversations: ConversationController;
  drafts: DraftController;
  googleOAuth: GoogleOAuthController;
  googleIntegration: GoogleIntegrationController;
  sheets: SheetsController;
}

export function sheetRoutes(controller: SheetsController, authentication: AuthenticationMiddleware, limits: RateLimits): Router {
  const router = Router();
  router.post('/sheets/actions/:actionId/execute', authentication.requireUser, limits.sheets, controller.execute);
  return router;
}

export function authRoutes(controller: AuthController, authentication: AuthenticationMiddleware, limits: RateLimits): Router {
  const router = Router();
  router.post('/auth/signup', limits.authentication, controller.signUp);
  router.post('/auth/login', limits.authentication, controller.logIn);
  router.post('/auth/logout', controller.logOut);
  router.get('/auth/me', authentication.requireUser, controller.me);
  router.patch('/auth/me', authentication.requireUser, controller.updateProfile);
  router.post('/auth/password', authentication.requireUser, limits.authentication, controller.changePassword);
  return router;
}

export function conversationRoutes(
  controller: ConversationController,
  authentication: AuthenticationMiddleware,
  limits: RateLimits,
): Router {
  const router = Router();
  router.use('/conversations', authentication.requireUser);
  router.post('/conversations', controller.create);
  router.get('/conversations', controller.list);
  router.get('/conversations/:conversationId', controller.get);
  router.delete('/conversations/:conversationId', controller.delete);
  router.get('/conversations/:conversationId/messages', controller.messages);
  router.post('/conversations/:conversationId/messages', limits.chat, controller.sendMessage);
  return router;
}

export function draftRoutes(controller: DraftController, authentication: AuthenticationMiddleware): Router {
  const router = Router();
  router.use('/drafts', authentication.requireUser);
  router.get('/drafts/:draftId', controller.get);
  router.get('/drafts/:draftId/versions', controller.listVersions);
  router.get('/drafts/:draftId/versions/:versionId', controller.getVersion);
  router.post('/drafts/:draftId/versions', controller.createVersion);
  return router;
}

export function googleRoutes(
  oauth: GoogleOAuthController,
  integration: GoogleIntegrationController,
  authentication: AuthenticationMiddleware,
  limits: RateLimits,
): Router {
  const router = Router();
  router.get('/auth/google', authentication.requireUserOrRedirect, oauth.start);
  router.get('/auth/google/callback', authentication.requireUserOrRedirect, oauth.callback);
  router.get('/integrations/google/status', authentication.requireUser, integration.status);
  router.delete('/integrations/google', authentication.requireUser, integration.disconnect);
  router.post('/google-forms/publish', authentication.requireUser, limits.publishing, integration.publish);
  return router;
}
