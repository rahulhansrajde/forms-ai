import type { SpreadsheetOrigin } from '@forms-ai/contracts';

export interface SpreadsheetTab {
  sheetId: number;
  title: string;
  rowCount: number;
  columnCount: number;
  headers: string[];
}

export interface SpreadsheetProps {
  id: string;
  userId: string;
  conversationId: string;
  googleSpreadsheetId: string;
  url: string;
  title: string;
  tabs: SpreadsheetTab[];
  origin: SpreadsheetOrigin;
  activatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

type NewSpreadsheet = Omit<SpreadsheetProps, 'origin' | 'activatedAt' | 'createdAt' | 'updatedAt'>;

export class Spreadsheet {
  private constructor(private readonly props: SpreadsheetProps) {}

  static register(props: NewSpreadsheet, at: Date): Spreadsheet {
    return Spreadsheet.open(props, 'CREATED_BY_FORMS_AI', at);
  }

  static link(props: NewSpreadsheet, at: Date): Spreadsheet {
    return Spreadsheet.open(props, 'LINKED_EXISTING', at);
  }

  static restore(props: SpreadsheetProps): Spreadsheet {
    return new Spreadsheet({ ...props, tabs: props.tabs.map((tab) => ({ ...tab })) });
  }

  private static open(props: NewSpreadsheet, origin: SpreadsheetOrigin, at: Date): Spreadsheet {
    return new Spreadsheet({ ...props, tabs: props.tabs.map((tab) => ({ ...tab })), origin, activatedAt: at, createdAt: at, updatedAt: at });
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

  get googleSpreadsheetId(): string {
    return this.props.googleSpreadsheetId;
  }

  get url(): string {
    return this.props.url;
  }

  get title(): string {
    return this.props.title;
  }

  get tabs(): SpreadsheetTab[] {
    return this.props.tabs.map((tab) => ({ ...tab, headers: [...tab.headers] }));
  }

  get origin(): SpreadsheetOrigin {
    return this.props.origin;
  }

  get activatedAt(): Date {
    return this.props.activatedAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  synchronize(title: string, url: string, tabs: SpreadsheetTab[], at: Date): Spreadsheet {
    return new Spreadsheet({ ...this.props, title, url, tabs: tabs.map((tab) => ({ ...tab })), updatedAt: at });
  }

  activate(at: Date): Spreadsheet {
    return new Spreadsheet({ ...this.props, activatedAt: at, updatedAt: at });
  }
}
