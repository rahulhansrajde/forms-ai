import { fileURLToPath } from 'node:url';
import type { Express } from 'express';
import type { AIProvider } from '../domain/interfaces/ai-provider.js';
import type { GoogleFormsGateway, OAuthGateway } from '../domain/interfaces/google.js';
import type { Clock, Logger } from '../domain/interfaces/system.js';
import type { AppConfig } from '../infrastructure/configuration/app-config.js';
import type { Database } from '../infrastructure/database/connection/database.js';
import { DatabaseFactory } from '../infrastructure/database/connection/database-factory.js';
import { MigrationRunner } from '../infrastructure/database/migrations/migration-runner.js';
import { JsonConsoleLogger } from '../infrastructure/logging/json-console-logger.js';
import { MonotonicSystemClock } from '../infrastructure/system/system-services.js';
import { ApplicationModules } from './application-modules.js';
import { InfrastructureModules } from './infrastructure-modules.js';
import { PresentationModules } from './presentation-modules.js';

export interface ContainerOverrides {
  database?: Database;
  aiProvider?: AIProvider;
  oauthGateway?: OAuthGateway;
  formsGateway?: GoogleFormsGateway;
  logger?: Logger;
  clock?: Clock;
}

const MIGRATIONS_DIRECTORY = new URL('../infrastructure/database/migrations/', import.meta.url);

export class ApplicationContainer {
  private constructor(
    readonly config: AppConfig,
    readonly database: Database,
    readonly logger: Logger,
    readonly app: Express,
  ) {}

  static async create(config: AppConfig, overrides: ContainerOverrides = {}): Promise<ApplicationContainer> {
    const logger = overrides.logger ?? new JsonConsoleLogger();
    const database = overrides.database ?? (await new DatabaseFactory().create(config.database));
    const infrastructure = new InfrastructureModules(config, database, logger, overrides.clock ?? new MonotonicSystemClock(), overrides);
    const application = new ApplicationModules(config, infrastructure);
    const presentation = new PresentationModules(config, application, logger);
    return new ApplicationContainer(config, database, logger, presentation.createApp());
  }

  async migrate(): Promise<string[]> {
    return new MigrationRunner(this.database, fileURLToPath(MIGRATIONS_DIRECTORY), this.logger).migrate();
  }

  async close(): Promise<void> {
    await this.database.close();
  }
}
