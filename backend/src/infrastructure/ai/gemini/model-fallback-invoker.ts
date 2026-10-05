import type { Logger } from '../../../domain/interfaces/system.js';
import { AIProviderError } from '../../../shared/errors/application-errors.js';
import { GeminiRequestError } from './gemini-client.js';

const UNAVAILABLE_MODEL_COOLDOWN_MS = 10 * 60 * 1000;

export class ModelFallbackInvoker {
  private readonly unavailableUntil = new Map<string, number>();

  constructor(
    private readonly models: readonly string[],
    private readonly logger: Logger,
    private readonly now: () => number = Date.now,
  ) {
    if (models.length === 0) {
      throw new Error('At least one Gemini model must be configured.');
    }
  }

  async invoke<T>(operation: string, attempt: (model: string) => Promise<T>): Promise<T> {
    for (const model of this.candidates()) {
      try {
        return await attempt(model);
      } catch (error) {
        if (!(error instanceof GeminiRequestError)) {
          throw error;
        }
        this.recordFailure(operation, model, error);
      }
    }
    throw new AIProviderError('The AI service is unavailable right now.');
  }

  private recordFailure(operation: string, model: string, error: GeminiRequestError): void {
    const diagnostics = { operation, model, status: error.status, reason: error.reason };
    if (error.kind === 'permanent') {
      this.logger.error('Gemini rejected the request', diagnostics);
      throw new AIProviderError('The AI service rejected the request.', undefined, { cause: error });
    }
    if (error.kind === 'model-unavailable') {
      this.unavailableUntil.set(model, this.now() + UNAVAILABLE_MODEL_COOLDOWN_MS);
    }
    this.logger.warn('Gemini model failed, trying the next model', { ...diagnostics, kind: error.kind });
  }

  private candidates(): string[] {
    const moment = this.now();
    const available = this.models.filter((model) => (this.unavailableUntil.get(model) ?? 0) <= moment);
    return available.length > 0 ? available : [...this.models];
  }
}
