import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '../src/services/api-client';
import { formatConversationTime, groupConversations } from '../src/utils/conversation-groups';
import { firstQuestionNumbers } from '../src/utils/form-numbering';
import { offersPreview } from '../src/utils/intent-presentation';
import { HERO_PHRASES, RandomPhrasePicker } from '../src/utils/random-phrase-picker';
import { SCHEMA } from './support/fake-services';

describe('RandomPhrasePicker', () => {
  it('never shows the same phrase twice in a row', () => {
    const picker = new RandomPhrasePicker(HERO_PHRASES);
    let previous = picker.next();
    for (let index = 0; index < 500; index += 1) {
      const next = picker.next();
      expect(next).not.toBe(previous);
      expect(HERO_PHRASES).toContain(next);
      previous = next;
    }
  });

  it('picks randomly rather than in a fixed sequence', () => {
    const sequence = (seed: number[]) => {
      const values = [...seed];
      const picker = new RandomPhrasePicker(HERO_PHRASES, () => values.shift() ?? 0);
      return [picker.next(), picker.next(), picker.next()];
    };
    expect(sequence([0, 0, 0])).not.toEqual(sequence([0.9, 0.5, 0.1]));
  });

  it('even a constant random source cannot repeat a phrase', () => {
    const picker = new RandomPhrasePicker(['a', 'b'], () => 0);
    expect([picker.next(), picker.next(), picker.next()]).toEqual(['a', 'b', 'a']);
  });
});

describe('conversation grouping', () => {
  const now = new Date(2026, 4, 20, 15, 0, 0);
  const at = (days: number, hours = 12) => new Date(2026, 4, 20 - days, hours, 0, 0).toISOString();

  it('groups metadata into Today, Yesterday, Previous 7 Days and Older', () => {
    const groups = groupConversations(
      [
        { id: 'a', title: 'A', updatedAt: at(0) },
        { id: 'b', title: 'B', updatedAt: at(1) },
        { id: 'c', title: 'C', updatedAt: at(6) },
        { id: 'd', title: 'D', updatedAt: at(30) },
        { id: 'e', title: 'E', updatedAt: at(0, 1) },
      ],
      now,
    );
    expect(groups.map((group) => [group.label, group.conversations.map((conversation) => conversation.id)])).toEqual([
      ['Today', ['a', 'e']],
      ['Yesterday', ['b']],
      ['Previous 7 Days', ['c']],
      ['Older', ['d']],
    ]);
  });

  it('shows times for recent conversations and dates for older ones', () => {
    expect(formatConversationTime(at(0), now)).toMatch(/\d/);
    expect(formatConversationTime(at(30), now)).toMatch(/Apr|20|4/);
  });
});

describe('presentation helpers', () => {
  it('offers a preview only for draft-related replies', () => {
    expect(offersPreview('CREATE_FORM')).toBe(true);
    expect(offersPreview('CREATE_GOOGLE_FORM')).toBe(true);
    expect(offersPreview('SUGGEST_QUESTIONS')).toBe(false);
    expect(offersPreview(null)).toBe(false);
  });

  it('numbers questions continuously across sections', () => {
    expect(firstQuestionNumbers({ ...SCHEMA, sections: [SCHEMA.sections[0]!, { ...SCHEMA.sections[0]!, id: 's2' }] })).toEqual([1, 3]);
  });
});

describe('ApiClient', () => {
  it('maps error bodies to typed errors and announces expired sessions', async () => {
    const client = new ApiClient();
    const expired = vi.fn();
    client.onSessionExpired(expired);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ error: { code: 'AUTHENTICATION_REQUIRED', message: 'Log in' } }), { status: 401 })),
    );
    await expect(client.get('/auth/me')).rejects.toMatchObject({ status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'Log in' });
    expect(expired).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('reports network failures without leaking details', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))));
    const error = await new ApiClient().post('/auth/login', {}).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('NETWORK_UNAVAILABLE');
    vi.unstubAllGlobals();
  });

  it('sends JSON with same-origin credentials and encodes query parameters', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await new ApiClient().get('/conversations', { cursor: 'a b', limit: null });
    expect(fetchMock).toHaveBeenCalledWith('/conversations?cursor=a+b', expect.objectContaining({ credentials: 'same-origin', method: 'GET' }));
    vi.unstubAllGlobals();
  });
});
