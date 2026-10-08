import { READ_SHEET_OPERATIONS, type SheetOperation, type SheetPlanKind } from '@forms-ai/contracts';
import type { AIConversationContext, AIProvider } from '../../../domain/interfaces/ai-provider.js';
import { sheetPlanOutputSchema } from '../../../domain/services/sheet-operation-definitions.js';
import { AIOutputRejectedError } from '../../../shared/errors/application-errors.js';
import type { AIOutputValidator } from '../ai/ai-output-validator.js';

export type SheetPlan = { kind: 'ready'; summary: string; operations: SheetOperation[] } | { kind: 'clarify'; question: string };

const DEFAULT_QUESTION = 'Could you describe the Google Sheets change a little more precisely? Mentioning tab, column or range names helps.';

export class SheetPlanningService {
  constructor(
    private readonly ai: AIProvider,
    private readonly validator: AIOutputValidator,
  ) {}

  async plan(kind: SheetPlanKind, instruction: string, context: AIConversationContext): Promise<SheetPlan> {
    const output = this.validator.parse(sheetPlanOutputSchema, await this.ai.planSheetAction({ instruction, kind, context }), 'Google Sheets plan');
    const operations = output.operations as SheetOperation[];
    if (operations.length === 0) {
      return { kind: 'clarify', question: output.clarificationQuestion ?? DEFAULT_QUESTION };
    }
    this.assertAllowed(kind, operations);
    return { kind: 'ready', summary: output.summary, operations };
  }

  private assertAllowed(kind: SheetPlanKind, operations: readonly SheetOperation[]): void {
    const creations = operations.filter((operation) => operation.type === 'CREATE_SPREADSHEET');
    const reads = operations.filter((operation) => READ_SHEET_OPERATIONS.includes(operation.type));
    const problems: string[] = [];
    if (kind === 'CREATE' && (creations.length !== 1 || operations[0]?.type !== 'CREATE_SPREADSHEET' || reads.length > 0)) {
      problems.push('a new spreadsheet plan must start with exactly one CREATE_SPREADSHEET and contain no reads');
    }
    if (kind === 'MODIFY' && (creations.length > 0 || reads.length > 0)) {
      problems.push('a change plan cannot create or read spreadsheets');
    }
    if (kind === 'READ' && reads.length !== operations.length) {
      problems.push('a read plan can only read');
    }
    const creation = creations[0];
    if (creation?.type === 'CREATE_SPREADSHEET') {
      const titles = creation.tabs.map((tab) => tab.title.toLowerCase());
      if (new Set(titles).size !== titles.length) {
        problems.push('tab titles must be unique');
      }
    }
    if (problems.length > 0) {
      throw new AIOutputRejectedError('The Google Sheets plan could not be used.', { problems });
    }
  }
}
