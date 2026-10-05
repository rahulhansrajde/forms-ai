import { AsyncLocalStorage } from 'node:async_hooks';
import type { Database, DatabaseRow } from './database.js';
import { DatabaseErrorTranslator } from './database-error-translator.js';

export abstract class AmbientTransactionDatabase<TExecutor> implements Database {
  private readonly ambientExecutor = new AsyncLocalStorage<TExecutor>();
  private readonly errorTranslator = new DatabaseErrorTranslator();

  async query<T extends DatabaseRow = DatabaseRow>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    try {
      return await this.execute<T>(this.currentExecutor(), sql, params);
    } catch (error) {
      throw this.errorTranslator.translate(error);
    }
  }

  async executeScript(sql: string): Promise<void> {
    try {
      await this.executeMultiStatement(this.currentExecutor(), sql);
    } catch (error) {
      throw this.errorTranslator.translate(error);
    }
  }

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.ambientExecutor.getStore() !== undefined) {
      return work();
    }
    return this.withTransaction((executor) => this.ambientExecutor.run(executor, work));
  }

  abstract close(): Promise<void>;

  protected abstract rootExecutor(): TExecutor;

  protected abstract execute<T extends DatabaseRow>(
    executor: TExecutor,
    sql: string,
    params: readonly unknown[],
  ): Promise<T[]>;

  protected abstract executeMultiStatement(executor: TExecutor, sql: string): Promise<void>;

  protected abstract withTransaction<T>(work: (executor: TExecutor) => Promise<T>): Promise<T>;

  private currentExecutor(): TExecutor {
    return this.ambientExecutor.getStore() ?? this.rootExecutor();
  }
}
