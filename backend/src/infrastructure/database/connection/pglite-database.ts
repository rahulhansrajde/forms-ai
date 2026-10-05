import { mkdir } from 'node:fs/promises';
import { PGlite, type Transaction } from '@electric-sql/pglite';
import type { DatabaseRow } from './database.js';
import { AmbientTransactionDatabase } from './ambient-transaction-database.js';

type PGliteExecutor = PGlite | Transaction;

export class PGliteDatabase extends AmbientTransactionDatabase<PGliteExecutor> {
  private constructor(private readonly instance: PGlite) {
    super();
  }

  static async open(dataDirectory: string | null): Promise<PGliteDatabase> {
    if (dataDirectory) {
      await mkdir(dataDirectory, { recursive: true });
    }
    const instance = dataDirectory ? new PGlite(dataDirectory) : new PGlite();
    await instance.waitReady;
    return new PGliteDatabase(instance);
  }

  async close(): Promise<void> {
    await this.instance.close();
  }

  protected rootExecutor(): PGliteExecutor {
    return this.instance;
  }

  protected async execute<T extends DatabaseRow>(
    executor: PGliteExecutor,
    sql: string,
    params: readonly unknown[],
  ): Promise<T[]> {
    const result = await executor.query<T>(sql, [...params]);
    return result.rows;
  }

  protected async executeMultiStatement(executor: PGliteExecutor, sql: string): Promise<void> {
    await executor.exec(sql);
  }

  protected async withTransaction<T>(work: (executor: PGliteExecutor) => Promise<T>): Promise<T> {
    return this.instance.transaction((transaction) => work(transaction));
  }
}
