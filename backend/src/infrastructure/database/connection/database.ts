import type { TransactionRunner } from '../../../domain/interfaces/system.js';

export type DatabaseRow = Record<string, unknown>;

export interface Database extends TransactionRunner {
  query<T extends DatabaseRow = DatabaseRow>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  executeScript(sql: string): Promise<void>;
  close(): Promise<void>;
}
