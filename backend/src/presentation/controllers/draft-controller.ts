import type { CreateDraftVersionRequest } from '@forms-ai/contracts';
import type { Request, Response } from 'express';
import type {
  CreateDraftVersionUseCase,
  GetDraftUseCase,
  GetDraftVersionUseCase,
  ListDraftVersionsUseCase,
} from '../../application/use-cases/drafts/draft-use-cases.js';
import { principalOf } from '../http/principal.js';
import {
  createDraftVersionBodySchema,
  draftParamsSchema,
  draftVersionParamsSchema,
  versionPageQuerySchema,
} from '../validators/request-schemas.js';
import type { RequestValidator } from '../validators/request-validator.js';

export interface DraftUseCases {
  get: GetDraftUseCase;
  listVersions: ListDraftVersionsUseCase;
  getVersion: GetDraftVersionUseCase;
  createVersion: CreateDraftVersionUseCase;
}

export class DraftController {
  constructor(
    private readonly useCases: DraftUseCases,
    private readonly validator: RequestValidator,
  ) {}

  readonly get = async (request: Request, response: Response): Promise<void> => {
    const { draftId } = this.validator.params(draftParamsSchema, request.params);
    response.json({ draft: await this.useCases.get.execute(principalOf(response).userId, draftId) });
  };

  readonly listVersions = async (request: Request, response: Response): Promise<void> => {
    const { draftId } = this.validator.params(draftParamsSchema, request.params);
    const query = this.validator.query(versionPageQuerySchema, request.query);
    response.json(
      await this.useCases.listVersions.execute(principalOf(response).userId, draftId, query.limit, query.cursor ?? null),
    );
  };

  readonly getVersion = async (request: Request, response: Response): Promise<void> => {
    const { draftId, versionId } = this.validator.params(draftVersionParamsSchema, request.params);
    response.json({ version: await this.useCases.getVersion.execute(principalOf(response).userId, draftId, versionId) });
  };

  readonly createVersion = async (request: Request, response: Response): Promise<void> => {
    const { draftId } = this.validator.params(draftParamsSchema, request.params);
    const body = this.validator.body(createDraftVersionBodySchema, request.body) as CreateDraftVersionRequest;
    response.status(201).json({ draft: await this.useCases.createVersion.execute(principalOf(response).userId, draftId, body) });
  };
}
