import type { SheetActionKind, SheetActionStatus, SheetActionStep, SheetOperation } from '@forms-ai/contracts';
import { SheetAction, type SheetActionResult } from '../../../domain/entities/sheet-action.js';
import type { SheetActionRepository } from '../../../domain/interfaces/repositories.js';
import type { Database } from '../connection/database.js';

interface SheetActionRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  conversation_id: string;
  spreadsheet_id: string | null;
  kind: SheetActionKind;
  summary: string;
  operations: SheetOperation[];
  status: SheetActionStatus;
  result: SheetActionResult | null;
  error: string | null;
  steps: SheetActionStep[] | null;
  created_at: Date;
  updated_at: Date;
}

const SHEET_ACTION_COLUMNS = 'id, user_id, conversation_id, spreadsheet_id, kind, summary, operations, status, result, error, steps, created_at, updated_at';

export class PostgresSheetActionRepository implements SheetActionRepository {
  constructor(private readonly database: Database) {}

  async insert(action: SheetAction): Promise<void> {
    await this.database.query(`INSERT INTO sheet_actions (${SHEET_ACTION_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`, [
      action.id,
      action.userId,
      action.conversationId,
      action.spreadsheetId,
      action.kind,
      action.summary,
      JSON.stringify(action.operations),
      action.status,
      action.result === null ? null : JSON.stringify(action.result),
      action.error,
      action.steps === null ? null : JSON.stringify(action.steps),
      action.createdAt,
      action.updatedAt,
    ]);
  }

  async update(action: SheetAction): Promise<void> {
    await this.database.query('UPDATE sheet_actions SET spreadsheet_id = $2, status = $3, result = $4, error = $5, updated_at = $6 WHERE id = $1', [
      action.id,
      action.spreadsheetId,
      action.status,
      action.result === null ? null : JSON.stringify(action.result),
      action.error,
      action.updatedAt,
    ]);
  }

  async findOwned(id: string, userId: string): Promise<SheetAction | null> {
    const rows = await this.database.query<SheetActionRow>(`SELECT ${SHEET_ACTION_COLUMNS} FROM sheet_actions WHERE id = $1 AND user_id = $2`, [id, userId]);
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async findByIds(ids: readonly string[]): Promise<SheetAction[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.database.query<SheetActionRow>(`SELECT ${SHEET_ACTION_COLUMNS} FROM sheet_actions WHERE id = ANY($1::uuid[])`, [ids]);
    return rows.map((row) => this.toEntity(row));
  }

  async claimForExecution(id: string, userId: string, at: Date, staleBefore: Date): Promise<SheetAction | null> {
    const rows = await this.database.query<SheetActionRow>(
      `UPDATE sheet_actions SET status = 'RUNNING', error = NULL, updated_at = $3
       WHERE id = $1 AND user_id = $2 AND (status IN ('PENDING', 'FAILED') OR (status = 'RUNNING' AND updated_at < $4))
       RETURNING ${SHEET_ACTION_COLUMNS}`,
      [id, userId, at, staleBefore],
    );
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  private toEntity(row: SheetActionRow): SheetAction {
    return SheetAction.restore({
      id: row.id,
      userId: row.user_id,
      conversationId: row.conversation_id,
      spreadsheetId: row.spreadsheet_id,
      kind: row.kind,
      summary: row.summary,
      operations: row.operations,
      status: row.status,
      result: row.result,
      error: row.error,
      steps: row.steps,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
