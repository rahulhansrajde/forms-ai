import type { QuestionInput } from '@forms-ai/contracts';
import {
  SuggestionSet,
  type SuggestedQuestion,
  type SuggestionSetStatus,
} from '../../../domain/entities/suggestion-set.js';
import type { SuggestionSetRepository } from '../../../domain/interfaces/repositories.js';
import type { Database } from '../connection/database.js';

interface SuggestionSetRow extends Record<string, unknown> {
  id: string;
  conversation_id: string;
  draft_id: string | null;
  status: SuggestionSetStatus;
  form_title: string;
  base_questions: QuestionInput[];
  suggestions: SuggestedQuestion[];
  created_at: Date;
  updated_at: Date;
}

const SUGGESTION_SET_COLUMNS =
  'id, conversation_id, draft_id, status, form_title, base_questions, suggestions, created_at, updated_at';

export class PostgresSuggestionSetRepository implements SuggestionSetRepository {
  constructor(private readonly database: Database) {}

  async insert(suggestionSet: SuggestionSet): Promise<void> {
    await this.database.query(
      `INSERT INTO suggestion_sets (${SUGGESTION_SET_COLUMNS})
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
      [
        suggestionSet.id,
        suggestionSet.conversationId,
        suggestionSet.draftId,
        suggestionSet.status,
        suggestionSet.formTitle,
        JSON.stringify(suggestionSet.baseQuestions),
        JSON.stringify(suggestionSet.suggestions),
        suggestionSet.createdAt,
        suggestionSet.updatedAt,
      ],
    );
  }

  async update(suggestionSet: SuggestionSet): Promise<void> {
    await this.database.query('UPDATE suggestion_sets SET status = $2, draft_id = $3, updated_at = $4 WHERE id = $1', [
      suggestionSet.id,
      suggestionSet.status,
      suggestionSet.draftId,
      suggestionSet.updatedAt,
    ]);
  }

  async findLatestOpen(conversationId: string): Promise<SuggestionSet | null> {
    const rows = await this.database.query<SuggestionSetRow>(
      `SELECT ${SUGGESTION_SET_COLUMNS} FROM suggestion_sets
       WHERE conversation_id = $1 AND status IN ('PENDING', 'CONFIRMATION_REQUESTED')
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [conversationId],
    );
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async supersedeOpen(conversationId: string, at: Date): Promise<void> {
    await this.database.query(
      `UPDATE suggestion_sets SET status = 'SUPERSEDED', updated_at = $2
       WHERE conversation_id = $1 AND status IN ('PENDING', 'CONFIRMATION_REQUESTED')`,
      [conversationId, at],
    );
  }

  private toEntity(row: SuggestionSetRow): SuggestionSet {
    return SuggestionSet.restore({
      id: row.id,
      conversationId: row.conversation_id,
      draftId: row.draft_id,
      status: row.status,
      formTitle: row.form_title,
      baseQuestions: row.base_questions,
      suggestions: row.suggestions,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
