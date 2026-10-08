import type { SheetTableView } from '@forms-ai/contracts';
import type { AIProvider } from '../../../domain/interfaces/ai-provider.js';
import type { Logger } from '../../../domain/interfaces/system.js';

const MAX_SUMMARY_LENGTH = 1500;

export class SheetDataSummarizer {
  constructor(
    private readonly ai: AIProvider,
    private readonly logger: Logger,
  ) {}

  async summarize(instruction: string, spreadsheetTitle: string, table: SheetTableView): Promise<string | null> {
    if (table.values.length === 0) {
      return null;
    }
    try {
      const summary = (await this.ai.summarizeSheetData({ instruction, spreadsheetTitle, table })).trim();
      return summary.length > 0 ? summary.slice(0, MAX_SUMMARY_LENGTH) : null;
    } catch (error) {
      this.logger.warn('Google Sheets summary failed', { reason: error instanceof Error ? error.name : 'unknown' });
      return null;
    }
  }
}
