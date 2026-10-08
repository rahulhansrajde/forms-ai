import type { FormSchema } from '@forms-ai/contracts';
import { describe, expect, it } from 'vitest';
import { AIOutputSanitizer } from '../../../src/application/services/ai/ai-output-sanitizer.js';
import { AIOutputValidator } from '../../../src/application/services/ai/ai-output-validator.js';
import type { ChatTurnContext } from '../../../src/application/services/chat/chat-turn-context.js';
import { AffirmationDetector } from '../../../src/application/services/intent/affirmation-detector.js';
import { ClarificationMessages } from '../../../src/application/services/intent/clarification-messages.js';
import { IntentDetectionService } from '../../../src/application/services/intent/intent-detection-service.js';
import { IntentStatePolicy } from '../../../src/application/services/intent/intent-state-policy.js';
import { Conversation } from '../../../src/domain/entities/conversation.js';
import { FormDraft } from '../../../src/domain/entities/form-draft.js';
import { FormVersion } from '../../../src/domain/entities/form-version.js';
import { SuggestionSet } from '../../../src/domain/entities/suggestion-set.js';
import { SpreadsheetReferenceParser } from '../../../src/domain/services/spreadsheet-reference-parser.js';
import type { AIProvider } from '../../../src/domain/interfaces/ai-provider.js';
import { AIOutputRejectedError } from '../../../src/shared/errors/application-errors.js';
import { sampleForm } from '../../support/domain-fixtures.js';

class ScriptedAI implements AIProvider {
  calls = 0;

  constructor(private readonly classification: unknown) {}

  async classifyIntent(): Promise<unknown> {
    this.calls += 1;
    return this.classification;
  }

  async generateForm(): Promise<unknown> {
    return null;
  }

  async planFormOperations(): Promise<unknown> {
    return null;
  }

  async suggestQuestions(): Promise<unknown> {
    return null;
  }

  async selectSuggestions(): Promise<unknown> {
    return null;
  }

  async planSheetAction(): Promise<unknown> {
    return null;
  }

  async summarizeSheetData(): Promise<string> {
    return '';
  }

  async reply(): Promise<string> {
    return '';
  }
}

const NOW = new Date('2026-01-01T00:00:00Z');

function context(options: { form?: FormSchema; suggestions?: 'pending' | 'confirming' } = {}): ChatTurnContext {
  const conversation = Conversation.start('conversation', 'user', 'New chat', NOW);
  const draft = options.form ? FormDraft.open('draft', 'user', 'conversation', options.form.title, NOW) : null;
  const version = options.form
    ? FormVersion.create({ id: 'version', draftId: 'draft', versionNumber: 1, schema: options.form, source: 'AI', createdAt: NOW })
    : null;
  const pending = options.suggestions
    ? SuggestionSet.propose(
        {
          id: 'set',
          conversationId: 'conversation',
          draftId: null,
          formTitle: 'Form',
          baseQuestions: [],
          suggestions: [{ id: 'suggestion_1', question: { type: 'SHORT_ANSWER', title: 'College Name' } }],
        },
        NOW,
      )
    : null;
  const openSuggestions = options.suggestions === 'confirming' ? pending?.requestConfirmation(NOW) ?? null : pending;
  return {
    userId: 'user',
    conversation,
    draft,
    currentVersion: version,
    openSuggestions,
    spreadsheet: null,
    ai: { recentTurns: [], currentForm: options.form ?? null, openSuggestions: openSuggestions?.suggestions ?? [] },
  };
}

function detector(ai: AIProvider): IntentDetectionService {
  const clarifications = new ClarificationMessages();
  return new IntentDetectionService(
    ai,
    new AIOutputValidator(new AIOutputSanitizer()),
    new AffirmationDetector(),
    new IntentStatePolicy(clarifications),
    clarifications,
    new SpreadsheetReferenceParser(),
  );
}

describe('IntentDetectionService', () => {
  it('passes through valid classifications', async () => {
    const decision = await detector(new ScriptedAI({ intent: 'CREATE_FORM' })).detect('Create a form', context());
    expect(decision).toMatchObject({ intent: 'CREATE_FORM', acceptAllSuggestions: false });
  });

  it('never treats a bare "okay" as acceptance and does not consult the AI', async () => {
    const ai = new ScriptedAI({ intent: 'ACCEPT_SUGGESTIONS' });
    const decision = await detector(ai).detect('Okay!', context({ suggestions: 'pending' }));
    expect(decision.intent).toBe('CLARIFICATION_REQUIRED');
    expect(decision.requestsSuggestionConfirmation).toBe(true);
    expect(decision.clarification).toContain('add all 1 suggested question');
    expect(ai.calls).toBe(0);
  });

  it('accepts all suggestions when the user confirms an explicit confirmation question', async () => {
    const decision = await detector(new ScriptedAI({ intent: 'NORMAL_CHAT' })).detect('yes', context({ suggestions: 'confirming' }));
    expect(decision).toMatchObject({ intent: 'ACCEPT_SUGGESTIONS', acceptAllSuggestions: true });
  });

  it('asks what to do on a bare acknowledgement without pending suggestions', async () => {
    const withDraft = await detector(new ScriptedAI({ intent: 'NORMAL_CHAT' })).detect('sure', context({ form: sampleForm() }));
    expect(withDraft.intent).toBe('CLARIFICATION_REQUIRED');
    const withoutDraft = await detector(new ScriptedAI({ intent: 'NORMAL_CHAT' })).detect('ok', context());
    expect(withoutDraft.clarification).toContain('What would you like to create?');
  });

  it('downgrades draft changes when no draft exists', async () => {
    const decision = await detector(new ScriptedAI({ intent: 'MODIFY_FORM' })).detect('Remove phone', context());
    expect(decision.intent).toBe('CLARIFICATION_REQUIRED');
    const regenerate = await detector(new ScriptedAI({ intent: 'REGENERATE_FORM' })).detect('Regenerate', context());
    expect(regenerate.intent).toBe('CLARIFICATION_REQUIRED');
  });

  it('downgrades acceptance when nothing was suggested', async () => {
    const decision = await detector(new ScriptedAI({ intent: 'ACCEPT_SUGGESTIONS' })).detect('add those', context({ form: sampleForm() }));
    expect(decision.intent).toBe('CLARIFICATION_REQUIRED');
  });

  it('supplies a clarification question when the AI omits one', async () => {
    const decision = await detector(new ScriptedAI({ intent: 'CLARIFICATION_REQUIRED' })).detect('hmm', context());
    expect(decision.clarification).toEqual(expect.any(String));
  });

  it.each([[{ intent: 'DELETE_EVERYTHING' }], [null], ['CREATE_FORM'], [{ intent: 'CREATE_FORM', clarificationQuestion: 42 }]])(
    'fails safely on unknown AI output %#',
    async (output) => {
      await expect(detector(new ScriptedAI(output)).detect('Create a form', context())).rejects.toBeInstanceOf(AIOutputRejectedError);
    },
  );
});

describe('IntentDetectionService and Google Sheets links', () => {
  it('routes any Google Sheets link to linking without consulting the AI', async () => {
    const ai = new ScriptedAI({ intent: 'CREATE_FORM' });
    const decision = await detector(ai).detect('Use this https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit', context());
    expect(decision.intent).toBe('LINK_SHEET');
    expect(ai.calls).toBe(0);
  });

  it('also routes malformed sheet links to linking so the user gets a clear reason', async () => {
    const ai = new ScriptedAI({ intent: 'NORMAL_CHAT' });
    expect((await detector(ai).detect('https://docs.google.com/spreadsheets/d/oops/edit', context())).intent).toBe('LINK_SHEET');
  });
});
