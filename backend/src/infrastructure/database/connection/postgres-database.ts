import pg from 'pg';
import type { DatabaseRow } from './database.js';
import { AmbientTransactionDatabase } from './ambient-transaction-database.js';

type PostgresExecutor = pg.Pool | pg.PoolClient;

export interface PostgresDatabaseOptions {
  connectionString: string;
  maxConnections: number;
  ssl: boolean;
}

export class PostgresDatabase extends AmbientTransactionDatabase<PostgresExecutor> {
  private readonly pool: pg.Pool;

  constructor(options: PostgresDatabaseOptions) {
    super();
    this.pool = new pg.Pool({
      connectionString: options.connectionString,
      max: options.maxConnections,
      ssl: options.ssl ? { rejectUnauthorized: true } : undefined,
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  protected rootExecutor(): PostgresExecutor {
    return this.pool;
  }

  protected async execute<T extends DatabaseRow>(
    executor: PostgresExecutor,
    sql: string,
    params: readonly unknown[],
  ): Promise<T[]> {
    const result = await executor.query<T>(sql, [...params]);
    return result.rows;
  }

  protected async executeMultiStatement(executor: PostgresExecutor, sql: string): Promise<void> {
    await executor.query(sql);
  }

  protected async withTransaction<T>(work: (executor: PostgresExecutor) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
