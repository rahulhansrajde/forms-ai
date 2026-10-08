import type { RecordRequest } from '../services/record-request-parser.js';

export interface RememberedRecord {
  tab: string;
  column: string;
  value: string;
  label: string;
  row: number;
  identifiers: Record<string, string>;
}

export interface PendingRecordRequest {
  request: RecordRequest;
  label: string;
  verifyName: boolean;
}

export interface SheetRecordContextProps {
  conversationId: string;
  userId: string;
  spreadsheetId: string;
  subject: RememberedRecord | null;
  pending: PendingRecordRequest | null;
  updatedAt: Date;
}

export class SheetRecordContext {
  private constructor(private readonly props: SheetRecordContextProps) {}

  static start(conversationId: string, userId: string, spreadsheetId: string, at: Date): SheetRecordContext {
    return new SheetRecordContext({ conversationId, userId, spreadsheetId, subject: null, pending: null, updatedAt: at });
  }

  static restore(props: SheetRecordContextProps): SheetRecordContext {
    return new SheetRecordContext({ ...props });
  }

  get conversationId(): string {
    return this.props.conversationId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get spreadsheetId(): string {
    return this.props.spreadsheetId;
  }

  get subject(): RememberedRecord | null {
    return this.props.subject;
  }

  get pending(): PendingRecordRequest | null {
    return this.props.pending;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  appliesTo(spreadsheetId: string): boolean {
    return this.props.spreadsheetId === spreadsheetId;
  }

  remember(subject: RememberedRecord, at: Date): SheetRecordContext {
    return new SheetRecordContext({ ...this.props, subject, pending: null, updatedAt: at });
  }

  awaitIdentifier(pending: PendingRecordRequest, at: Date): SheetRecordContext {
    return new SheetRecordContext({ ...this.props, pending, updatedAt: at });
  }
}
