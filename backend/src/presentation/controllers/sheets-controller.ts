import type { Request, Response } from 'express';
import type { ExecuteSheetActionUseCase } from '../../application/use-cases/sheets/execute-sheet-action-use-case.js';
import { principalOf } from '../http/principal.js';
import { executeSheetActionBodySchema, sheetActionParamsSchema } from '../validators/request-schemas.js';
import type { RequestValidator } from '../validators/request-validator.js';

export interface SheetsUseCases {
  execute: ExecuteSheetActionUseCase;
}

export class SheetsController {
  constructor(
    private readonly useCases: SheetsUseCases,
    private readonly validator: RequestValidator,
  ) {}

  readonly execute = async (request: Request, response: Response): Promise<void> => {
    const { actionId } = this.validator.params(sheetActionParamsSchema, request.params);
    const body = this.validator.body(executeSheetActionBodySchema, request.body);
    response.json(await this.useCases.execute.execute(principalOf(response).userId, actionId, body.confirmDestructive ?? false));
  };
}
