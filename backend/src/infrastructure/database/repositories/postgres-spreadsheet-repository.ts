import type { SpreadsheetOrigin } from '@forms-ai/contracts';
import { Spreadsheet, type SpreadsheetTab } from '../../../domain/entities/spreadsheet.js';
import type { SpreadsheetRepository } from '../../../domain/interfaces/repositories.js';
import type { Database } from '../connection/database.js';

interface SpreadsheetRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  conversation_id: string;
  google_spreadsheet_id: string;
  url: string;
  title: string;
  tabs: SpreadsheetTab[];
  origin: SpreadsheetOrigin;
  activated_at: Date;
  created_at: Date;
  updated_at: Date;
}

const SPREADSHEET_COLUMNS = 'id, user_id, conversation_id, google_spreadsheet_id, url, title, tabs, origin, activated_at, created_at, updated_at';

export class PostgresSpreadsheetRepository implements SpreadsheetRepository {
  constructor(private readonly database: Database) {}

  async insert(spreadsheet: Spreadsheet): Promise<void> {
    await this.database.query(`INSERT INTO spreadsheets (${SPREADSHEET_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`, [
      spreadsheet.id,
      spreadsheet.userId,
      spreadsheet.conversationId,
      spreadsheet.googleSpreadsheetId,
      spreadsheet.url,
      spreadsheet.title,
      JSON.stringify(spreadsheet.tabs),
      spreadsheet.origin,
      spreadsheet.activatedAt,
      spreadsheet.createdAt,
      spreadsheet.updatedAt,
    ]);
  }

  async update(spreadsheet: Spreadsheet): Promise<void> {
    await this.database.query('UPDATE spreadsheets SET url = $2, title = $3, tabs = $4, activated_at = $5, updated_at = $6 WHERE id = $1', [
      spreadsheet.id,
      spreadsheet.url,
      spreadsheet.title,
      JSON.stringify(spreadsheet.tabs),
      spreadsheet.activatedAt,
      spreadsheet.updatedAt,
    ]);
  }

  async findOwned(id: string, userId: string): Promise<Spreadsheet | null> {
    const rows = await this.database.query<SpreadsheetRow>(`SELECT ${SPREADSHEET_COLUMNS} FROM spreadsheets WHERE id = $1 AND user_id = $2`, [id, userId]);
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async findByIds(ids: readonly string[]): Promise<Spreadsheet[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.database.query<SpreadsheetRow>(`SELECT ${SPREADSHEET_COLUMNS} FROM spreadsheets WHERE id = ANY($1::uuid[])`, [ids]);
    return rows.map((row) => this.toEntity(row));
  }

  async findActiveByConversation(conversationId: string): Promise<Spreadsheet | null> {
    const rows = await this.database.query<SpreadsheetRow>(
      `SELECT ${SPREADSHEET_COLUMNS} FROM spreadsheets WHERE conversation_id = $1 ORDER BY activated_at DESC, created_at DESC, id DESC LIMIT 1`,
      [conversationId],
    );
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async listByConversation(conversationId: string): Promise<Spreadsheet[]> {
    const rows = await this.database.query<SpreadsheetRow>(
      `SELECT ${SPREADSHEET_COLUMNS} FROM spreadsheets WHERE conversation_id = $1 ORDER BY activated_at DESC, created_at DESC, id DESC`,
      [conversationId],
    );
    return rows.map((row) => this.toEntity(row));
  }

  async findInConversation(conversationId: string, googleSpreadsheetId: string): Promise<Spreadsheet | null> {
    const rows = await this.database.query<SpreadsheetRow>(
      `SELECT ${SPREADSHEET_COLUMNS} FROM spreadsheets WHERE conversation_id = $1 AND google_spreadsheet_id = $2`,
      [conversationId, googleSpreadsheetId],
    );
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  private toEntity(row: SpreadsheetRow): Spreadsheet {
    return Spreadsheet.restore({
      id: row.id,
      userId: row.user_id,
      conversationId: row.conversation_id,
      googleSpreadsheetId: row.google_spreadsheet_id,
      url: row.url,
      title: row.title,
      tabs: row.tabs,
      origin: row.origin,
      activatedAt: row.activated_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
