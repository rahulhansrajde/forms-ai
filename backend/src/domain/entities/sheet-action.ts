import {
  DESTRUCTIVE_SHEET_OPERATIONS,
  type LinkExistingSpreadsheetOperation,
  type SheetActionKind,
  type SheetActionStatus,
  type SheetOperation,
  type SheetTableView,
} from '@forms-ai/contracts';

export interface SheetActionResult {
  table: SheetTableView | null;
}

export interface SheetActionProps {
  id: string;
  userId: string;
  conversationId: string;
  spreadsheetId: string | null;
  kind: SheetActionKind;
  summary: string;
  operations: SheetOperation[];
  status: SheetActionStatus;
  result: SheetActionResult | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class SheetAction {
  private constructor(private readonly props: SheetActionProps) {}

  static prepare(
    props: Pick<SheetActionProps, 'id' | 'userId' | 'conversationId' | 'spreadsheetId' | 'kind' | 'summary' | 'operations'>,
    at: Date,
  ): SheetAction {
    return new SheetAction({ ...props, status: 'PENDING', result: null, error: null, createdAt: at, updatedAt: at });
  }

  static restore(props: SheetActionProps): SheetAction {
    return new SheetAction({ ...props });
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get conversationId(): string {
    return this.props.conversationId;
  }

  get spreadsheetId(): string | null {
    return this.props.spreadsheetId;
  }

  get kind(): SheetActionKind {
    return this.props.kind;
  }

  get summary(): string {
    return this.props.summary;
  }

  get operations(): SheetOperation[] {
    return [...this.props.operations];
  }

  get status(): SheetActionStatus {
    return this.props.status;
  }

  get result(): SheetActionResult | null {
    return this.props.result;
  }

  get error(): string | null {
    return this.props.error;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isDestructive(): boolean {
    return this.props.operations.some((operation) => DESTRUCTIVE_SHEET_OPERATIONS.includes(operation.type));
  }

  isComplete(): boolean {
    return this.props.status === 'SUCCEEDED';
  }

  plannedTitle(): string | null {
    const creation = this.props.operations.find((operation) => operation.type === 'CREATE_SPREADSHEET');
    if (creation?.type === 'CREATE_SPREADSHEET') {
      return creation.title;
    }
    return this.linkTarget()?.title ?? null;
  }

  linkTarget(): LinkExistingSpreadsheetOperation | null {
    const link = this.props.operations.find((operation) => operation.type === 'LINK_EXISTING_SPREADSHEET');
    return link?.type === 'LINK_EXISTING_SPREADSHEET' ? link : null;
  }

  wantsSummary(): boolean {
    return this.props.operations.some((operation) => operation.type === 'READ_RANGE' && operation.summarize === true);
  }

  attachSpreadsheet(spreadsheetId: string, at: Date): SheetAction {
    return new SheetAction({ ...this.props, spreadsheetId, updatedAt: at });
  }

  succeed(result: SheetActionResult, at: Date): SheetAction {
    return new SheetAction({ ...this.props, status: 'SUCCEEDED', result, error: null, updatedAt: at });
  }

  fail(error: string, at: Date): SheetAction {
    return new SheetAction({ ...this.props, status: 'FAILED', error, updatedAt: at });
  }
}
