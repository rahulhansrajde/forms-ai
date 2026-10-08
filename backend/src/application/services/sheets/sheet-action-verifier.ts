import type { SheetOperation } from '@forms-ai/contracts';
import type { SpreadsheetTab } from '../../../domain/entities/spreadsheet.js';
import type { SheetsGateway } from '../../../domain/interfaces/sheets.js';
import { GoogleSheetsError } from '../../../shared/errors/application-errors.js';
import type { InspectedSpreadsheet } from './spreadsheet-inspector.js';

export interface WrittenRange {
  range: string;
  values: string[][];
}

function sameTitle(first: string, second: string): boolean {
  return first.toLowerCase() === second.toLowerCase();
}

function trimmed(rows: readonly string[][]): string[][] {
  const withoutTrailingCells = rows.map((row) => {
    const copy = [...row];
    while (copy.length > 0 && copy[copy.length - 1] === '') {
      copy.pop();
    }
    return copy;
  });
  while (withoutTrailingCells.length > 0 && withoutTrailingCells[withoutTrailingCells.length - 1]!.length === 0) {
    withoutTrailingCells.pop();
  }
  return withoutTrailingCells;
}

type Concern = 'TITLE' | 'TABS' | 'CONTENT';

interface Finding {
  concern: Concern;
  problem: string;
}

const CONTENT_CHANGES: readonly Concern[] = ['CONTENT'];

const SUPERSEDES: Partial<Record<SheetOperation['type'], readonly Concern[]>> = {
  UPDATE_SPREADSHEET_TITLE: ['TITLE'],
  RENAME_SHEET: ['TABS', 'CONTENT'],
  DELETE_SHEET_TAB: ['TABS', 'CONTENT'],
  WRITE_RANGE: CONTENT_CHANGES,
  UPDATE_RANGE: CONTENT_CHANGES,
  CLEAR_RANGE: CONTENT_CHANGES,
  INSERT_ROWS: CONTENT_CHANGES,
  INSERT_COLUMNS: CONTENT_CHANGES,
  DELETE_ROWS: CONTENT_CHANGES,
  DELETE_COLUMNS: CONTENT_CHANGES,
  SET_HEADER_ROW: CONTENT_CHANGES,
  SET_FORMULA: CONTENT_CHANGES,
};

export class SheetActionVerifier {
  constructor(private readonly gateway: SheetsGateway) {}

  async verify(
    accessToken: string,
    spreadsheetId: string,
    operations: readonly SheetOperation[],
    inspected: InspectedSpreadsheet,
    writes: readonly WrittenRange[],
  ): Promise<void> {
    const problems = operations.flatMap((operation, index) => {
      const superseded = new Set(operations.slice(index + 1).flatMap((later) => SUPERSEDES[later.type] ?? []));
      return this.check(operation, inspected)
        .filter((finding) => !superseded.has(finding.concern))
        .map((finding) => finding.problem);
    });
    problems.push(...(await this.checkWrites(accessToken, spreadsheetId, writes)));
    if (problems.length > 0) {
      throw new GoogleSheetsError(`Google Sheets did not confirm every change: ${problems.slice(0, 3).join('; ')}.`, { problems });
    }
  }

  private check(operation: SheetOperation, inspected: InspectedSpreadsheet): Finding[] {
    const { snapshot, tabs } = inspected;
    switch (operation.type) {
      case 'CREATE_SPREADSHEET':
        return [
          ...(snapshot.title === operation.title ? [] : [{ concern: 'TITLE' as const, problem: 'the spreadsheet title is different' }]),
          ...operation.tabs.flatMap((blueprint): Finding[] => {
            const tab = tabs.find((candidate) => candidate.title === blueprint.title);
            if (!tab) {
              return [{ concern: 'TABS', problem: `the tab “${blueprint.title}” is missing` }];
            }
            return blueprint.headers && !this.sameHeaders(tab, blueprint.headers)
              ? [{ concern: 'CONTENT', problem: `the headers of “${blueprint.title}” are different` }]
              : [];
          }),
        ];
      case 'UPDATE_SPREADSHEET_TITLE':
        return snapshot.title === operation.title ? [] : [{ concern: 'TITLE', problem: 'the spreadsheet title was not changed' }];
      case 'ADD_SHEET':
        return tabs.some((tab) => sameTitle(tab.title, operation.title)) ? [] : [{ concern: 'TABS', problem: `the tab “${operation.title}” was not added` }];
      case 'RENAME_SHEET':
        return tabs.some((tab) => tab.title === operation.newTitle) ? [] : [{ concern: 'TABS', problem: `the tab was not renamed to “${operation.newTitle}”` }];
      case 'DELETE_SHEET_TAB':
        return tabs.some((tab) => sameTitle(tab.title, operation.sheet)) ? [{ concern: 'TABS', problem: `the tab “${operation.sheet}” still exists` }] : [];
      case 'SET_HEADER_ROW': {
        const tab = operation.sheet === undefined ? tabs[0] : tabs.find((candidate) => sameTitle(candidate.title, operation.sheet!));
        return tab && this.sameHeaders(tab, operation.headers) ? [] : [{ concern: 'CONTENT', problem: 'the header row is different' }];
      }
      default:
        return [];
    }
  }

  private sameHeaders(tab: SpreadsheetTab, headers: readonly string[]): boolean {
    return JSON.stringify(trimmed([tab.headers])) === JSON.stringify(trimmed([headers.map((header) => header.trim())]));
  }

  private async checkWrites(accessToken: string, spreadsheetId: string, writes: readonly WrittenRange[]): Promise<string[]> {
    if (writes.length === 0) {
      return [];
    }
    const actual = await this.gateway.readRanges(
      accessToken,
      spreadsheetId,
      writes.map((write) => write.range),
    );
    return writes.flatMap((write, index) =>
      JSON.stringify(trimmed(actual[index] ?? [])) === JSON.stringify(trimmed(write.values)) ? [] : [`the values in ${write.range} are different`],
    );
  }
}
