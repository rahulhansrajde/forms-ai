import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Logger } from '../../../domain/interfaces/system.js';
import type { Database } from '../connection/database.js';

const MIGRATION_FILE_PATTERN = /^\d{3}_[a-z0-9_]+\.sql$/;
const MIGRATION_LOCK_KEY = 7_420_310;

export class MigrationRunner {
  constructor(
    private readonly database: Database,
    private readonly migrationsDirectory: string,
    private readonly logger: Logger,
  ) {}

  async migrate(): Promise<string[]> {
    const available = await this.availableMigrations();
    return this.database.runInTransaction(async () => {
      await this.database.query('SELECT pg_advisory_xact_lock($1)', [MIGRATION_LOCK_KEY]);
      await this.ensureLedger();
      const applied = await this.appliedMigrations();
      const pending = available.filter((name) => !applied.has(name));
      for (const name of pending) {
        await this.applyMigration(name);
      }
      return pending;
    });
  }

  private async ensureLedger(): Promise<void> {
    await this.database.executeScript(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
    );
  }

  private async appliedMigrations(): Promise<Set<string>> {
    const rows = await this.database.query<{ name: string }>('SELECT name FROM schema_migrations');
    return new Set(rows.map((row) => row.name));
  }

  private async availableMigrations(): Promise<string[]> {
    const files = await readdir(this.migrationsDirectory);
    return files.filter((file) => MIGRATION_FILE_PATTERN.test(file)).sort();
  }

  private async applyMigration(name: string): Promise<void> {
    const script = await readFile(join(this.migrationsDirectory, name), 'utf8');
    await this.database.executeScript(script);
    await this.database.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
    this.logger.info('Applied database migration', { migration: name });
  }
}
