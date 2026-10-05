import { describe, expect, it } from 'vitest';
import type { ChatTurnContext } from '../../../src/application/services/chat/chat-turn-context.js';
import { replyOnly, type IntentHandler } from '../../../src/application/services/chat/handlers/intent-handler.js';
import { IntentDispatcher } from '../../../src/application/services/chat/intent-dispatcher.js';
import { OperationSummarizer } from '../../../src/application/services/chat/replies/operation-summarizer.js';
import { ConversationTitlePolicy } from '../../../src/application/services/chat/conversation-title-policy.js';
import { ClarificationMessages } from '../../../src/application/services/intent/clarification-messages.js';
import { KeysetCursorCodec } from '../../../src/application/services/pagination/keyset-cursor-codec.js';
import { pageFromOverfetch } from '../../../src/application/services/pagination/overfetch-page.js';
import {
  AIOutputRejectedError,
  AIProviderError,
  DatabaseError,
  ValidationError,
} from '../../../src/shared/errors/application-errors.js';
import { SilentLogger } from '../../support/fakes.js';
import { sampleForm } from '../../support/domain-fixtures.js';

class ThrowingHandler implements IntentHandler {
  readonly intent = 'CREATE_FORM';

  constructor(private readonly error: Error) {}

  async handle(): Promise<never> {
    throw this.error;
  }
}

const decision = { intent: 'CREATE_FORM' as const, clarification: null, acceptAllSuggestions: false, requestsSuggestionConfirmation: false };
const emptyContext = {} as ChatTurnContext;

describe('IntentDispatcher', () => {
  const dispatcherFor = (handler: IntentHandler) => new IntentDispatcher([handler], new ClarificationMessages(), new SilentLogger());

  it('routes to the handler registered for the intent', async () => {
    const handler: IntentHandler = { intent: 'CREATE_FORM', handle: async () => replyOnly('CREATE_FORM', 'done') };
    expect(await dispatcherFor(handler).dispatch('x', decision, emptyContext)).toMatchObject({ reply: 'done' });
  });

  it('falls back to a clarification for unsupported intents', async () => {
    const handler: IntentHandler = { intent: 'NORMAL_CHAT', handle: async () => replyOnly('NORMAL_CHAT', 'never') };
    expect((await dispatcherFor(handler).dispatch('x', decision, emptyContext)).intent).toBe('CLARIFICATION_REQUIRED');
  });

  it('turns rejected AI output into a safe clarification', async () => {
    const outcome = await dispatcherFor(new ThrowingHandler(new AIOutputRejectedError('bad'))).dispatch('x', decision, emptyContext);
    expect(outcome).toMatchObject({ intent: 'CLARIFICATION_REQUIRED', changedDraft: null });
  });

  it('reports AI outages without changing anything', async () => {
    const outcome = await dispatcherFor(new ThrowingHandler(new AIProviderError('down'))).dispatch('x', decision, emptyContext);
    expect(outcome).toMatchObject({ intent: 'NORMAL_CHAT', changedDraft: null });
  });

  it('explains domain validation failures', async () => {
    const outcome = await dispatcherFor(new ThrowingHandler(new ValidationError('Too many questions.'))).dispatch('x', decision, emptyContext);
    expect(outcome.reply).toContain('Too many questions.');
  });

  it('propagates infrastructure failures', async () => {
    await expect(
      dispatcherFor(new ThrowingHandler(new DatabaseError('db down'))).dispatch('x', decision, emptyContext),
    ).rejects.toBeInstanceOf(DatabaseError);
  });
});

describe('OperationSummarizer', () => {
  it('describes changes using the titles from the previous version', () => {
    const lines = new OperationSummarizer().describe(
      [
        { type: 'REMOVE_QUESTION', questionId: 'question_3' },
        { type: 'UPDATE_QUESTION', questionId: 'question_2', changes: { required: true } },
        { type: 'UPDATE_QUESTION', questionId: 'question_5', changes: { type: 'CHECKBOXES' } },
        { type: 'ADD_QUESTION', question: { type: 'DATE', title: 'Start Date' } },
      ],
      sampleForm(),
    );
    expect(lines).toEqual([
      'Removed “Phone Number”',
      'Made “Email Address” required',
      'Changed “Team Size” to checkboxes',
      'Added “Start Date”',
    ]);
  });
});

describe('pagination helpers', () => {
  it('round-trips keyset cursors and rejects tampering', () => {
    const codec = new KeysetCursorCodec();
    const cursor = { timestamp: new Date('2026-01-01T00:00:00.123Z'), id: '6f1c2f0a-6b7e-4c8e-9a43-0e5f8d2b1c3a' };
    expect(codec.decode(codec.encode(cursor))).toEqual(cursor);
    expect(codec.decode(null)).toBeNull();
    expect(() => codec.decode('bad')).toThrow(ValidationError);
    expect(() => codec.decode(Buffer.from('{"t":"x","i":"1"}').toString('base64url'))).toThrow(ValidationError);
  });

  it('detects whether another page exists', () => {
    expect(pageFromOverfetch([1, 2, 3], 2, String)).toEqual({ items: [1, 2], nextCursor: '2' });
    expect(pageFromOverfetch([1, 2], 2, String)).toEqual({ items: [1, 2], nextCursor: null });
  });
});

describe('ConversationTitlePolicy', () => {
  const policy = new ConversationTitlePolicy();

  it('derives a compact title from the first line of a message', () => {
    expect(policy.deriveFromMessage('\n  Create a   feedback form \nwith extras')).toBe('Create a feedback form');
    expect(policy.deriveFromMessage('x'.repeat(100)).length).toBeLessThanOrEqual(60);
    expect(policy.normalizeRequested(undefined)).toBe('New chat');
  });
});
