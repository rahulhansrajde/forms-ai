import { describe, expect, it } from 'vitest';
import { GoogleAccountConnection } from '../../../src/domain/entities/google-account-connection.js';
import { Session } from '../../../src/domain/entities/session.js';
import { SuggestionSet } from '../../../src/domain/entities/suggestion-set.js';
import { PasswordPolicy } from '../../../src/domain/services/password-policy.js';
import { EmailAddress } from '../../../src/domain/value-objects/email-address.js';
import { PersonName } from '../../../src/domain/value-objects/person-name.js';
import { ValidationError } from '../../../src/shared/errors/application-errors.js';

describe('value objects and policies', () => {
  it('normalizes and validates email addresses', () => {
    expect(EmailAddress.parse('  Ada@Example.COM ').value).toBe('ada@example.com');
    expect(() => EmailAddress.parse('not-an-email')).toThrow(ValidationError);
  });

  it('normalizes person names', () => {
    const name = PersonName.parse('  Ada   Augusta ', ' King ');
    expect(name).toMatchObject({ firstName: 'Ada Augusta', lastName: 'King' });
    expect(() => PersonName.parse('', 'King')).toThrow('First name is required.');
  });

  it('enforces password strength and confirmation', () => {
    const policy = new PasswordPolicy();
    expect(() => policy.assertAcceptable('Secret123')).not.toThrow();
    expect(() => policy.assertAcceptable('short1')).toThrow(ValidationError);
    expect(() => policy.assertAcceptable('lettersonly')).toThrow(ValidationError);
    expect(() => policy.assertConfirmed('Secret123', 'Secret124')).toThrow('Passwords do not match.');
  });
});

describe('Session', () => {
  it('expires after its lifetime', () => {
    const started = new Date('2026-01-01T00:00:00Z');
    const session = Session.start('id', 'user', 'hash', started, 1000);
    expect(session.isExpiredAt(new Date('2026-01-01T00:00:00.999Z'))).toBe(false);
    expect(session.isExpiredAt(new Date('2026-01-01T00:00:01Z'))).toBe(true);
  });
});

describe('GoogleAccountConnection', () => {
  const base = GoogleAccountConnection.establish(
    {
      id: 'connection',
      userId: 'user',
      providerAccountId: 'account',
      email: 'a@gmail.com',
      scopes: ['https://www.googleapis.com/auth/forms.body'],
      credentials: { accessToken: 'access', refreshToken: 'refresh', expiresAt: new Date('2026-01-01T01:00:00Z') },
    },
    new Date('2026-01-01T00:00:00Z'),
  );

  it('treats tokens close to expiry as unusable', () => {
    expect(base.hasUsableAccessToken(new Date('2026-01-01T00:58:00Z'))).toBe(true);
    expect(base.hasUsableAccessToken(new Date('2026-01-01T00:59:30Z'))).toBe(false);
    expect(base.canManageForms()).toBe(true);
  });

  it('keeps the existing refresh token when a reconnect does not return one', () => {
    const next = GoogleAccountConnection.establish(
      {
        id: 'other',
        userId: 'user',
        providerAccountId: 'account',
        email: 'a@gmail.com',
        scopes: [],
        credentials: { accessToken: 'new-access', refreshToken: null, expiresAt: new Date('2026-01-02T00:00:00Z') },
      },
      new Date('2026-01-02T00:00:00Z'),
    );
    const merged = base.reconnect(next, new Date('2026-01-02T00:00:00Z'));
    expect(merged.id).toBe('connection');
    expect(merged.credentials).toMatchObject({ accessToken: 'new-access', refreshToken: 'refresh' });
  });
});

describe('SuggestionSet', () => {
  it('moves through confirmation and acceptance states', () => {
    const now = new Date();
    const set = SuggestionSet.propose(
      {
        id: 'set',
        conversationId: 'conversation',
        draftId: null,
        formTitle: 'Form',
        baseQuestions: [],
        suggestions: [
          { id: 'suggestion_1', question: { type: 'SHORT_ANSWER', title: 'A' } },
          { id: 'suggestion_2', question: { type: 'SHORT_ANSWER', title: 'B' } },
        ],
      },
      now,
    );
    expect(set.isOpen()).toBe(true);
    const confirming = set.requestConfirmation(now);
    expect(confirming.isAwaitingConfirmation()).toBe(true);
    expect(confirming.selectByIds(['suggestion_2', 'unknown']).map((suggestion) => suggestion.id)).toEqual(['suggestion_2']);
    expect(confirming.accept(now).isOpen()).toBe(false);
  });
});
