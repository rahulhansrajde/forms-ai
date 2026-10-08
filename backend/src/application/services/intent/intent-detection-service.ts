import type { AIProvider } from '../../../domain/interfaces/ai-provider.js';
import type { RecordRequestParser } from '../../../domain/services/record-request-parser.js';
import type { SpreadsheetReferenceParser } from '../../../domain/services/spreadsheet-reference-parser.js';
import { intentClassificationOutputSchema } from '../ai/ai-output-schemas.js';
import type { AIOutputValidator } from '../ai/ai-output-validator.js';
import type { ChatTurnContext, IntentDecision } from '../chat/chat-turn-context.js';
import type { AffirmationDetector } from './affirmation-detector.js';
import type { ClarificationMessages } from './clarification-messages.js';
import type { IntentStatePolicy } from './intent-state-policy.js';

export class IntentDetectionService {
  constructor(
    private readonly ai: AIProvider,
    private readonly outputValidator: AIOutputValidator,
    private readonly affirmations: AffirmationDetector,
    private readonly policy: IntentStatePolicy,
    private readonly clarifications: ClarificationMessages,
    private readonly references: SpreadsheetReferenceParser,
    private readonly records: RecordRequestParser,
  ) {}

  async detect(message: string, context: ChatTurnContext): Promise<IntentDecision> {
    if (this.references.parse(message).kind !== 'NONE') {
      return this.decided('LINK_SHEET');
    }
    if (this.isRecordRequest(message, context)) {
      return this.decided('MODIFY_SHEET');
    }
    if (context.openSuggestions?.isAwaitingConfirmation() && this.affirmations.isBareAffirmation(message)) {
      return this.acceptAll();
    }
    if (this.affirmations.isBareAffirmation(message)) {
      return this.clarifyAffirmation(context);
    }
    return this.policy.reconcile(await this.classify(message, context), context);
  }

  private async classify(message: string, context: ChatTurnContext): Promise<IntentDecision> {
    const output = this.outputValidator.parse(
      intentClassificationOutputSchema,
      await this.ai.classifyIntent(message, context.ai),
      'intent classification',
    );
    return {
      intent: output.intent,
      clarification: output.clarificationQuestion ?? null,
      acceptAllSuggestions: false,
      requestsSuggestionConfirmation: false,
    };
  }

  private isRecordRequest(message: string, context: ChatTurnContext): boolean {
    const spreadsheet = context.spreadsheet;
    if (!spreadsheet) {
      return false;
    }
    const headers = [...new Set(spreadsheet.tabs.flatMap((tab) => tab.headers))];
    return this.records.isRecordRequest(message, headers, {
      hasSubject: Boolean(context.sheetRecords?.subject),
      hasPending: Boolean(context.sheetRecords?.pending),
      hasDraft: context.draft !== null,
    });
  }

  private decided(intent: IntentDecision['intent']): IntentDecision {
    return { intent, clarification: null, acceptAllSuggestions: false, requestsSuggestionConfirmation: false };
  }

  private clarifyAffirmation(context: ChatTurnContext): IntentDecision {
    if (context.openSuggestions) {
      return this.policy.clarify(this.clarifications.confirmSuggestions(context.openSuggestions), true);
    }
    return this.policy.clarify(
      context.draft ? this.clarifications.affirmationWithDraft() : this.clarifications.affirmationWithoutDraft(),
    );
  }

  private acceptAll(): IntentDecision {
    return {
      intent: 'ACCEPT_SUGGESTIONS',
      clarification: null,
      acceptAllSuggestions: true,
      requestsSuggestionConfirmation: false,
    };
  }
}
