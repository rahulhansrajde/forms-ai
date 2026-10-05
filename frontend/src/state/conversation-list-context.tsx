import type { ConversationSummary } from '@forms-ai/contracts';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useServices } from './services-context';

type ListStatus = 'idle' | 'loading' | 'ready' | 'error';

interface ConversationListContextValue {
  conversations: ConversationSummary[];
  status: ListStatus;
  hasMore: boolean;
  ensureLoaded(): void;
  loadMore(): void;
  upsert(conversation: ConversationSummary): void;
}

const ConversationListContext = createContext<ConversationListContextValue | null>(null);

export function ConversationListProvider({ children }: { children: ReactNode }) {
  const { conversations: service } = useServices();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [status, setStatus] = useState<ListStatus>('idle');
  const [cursor, setCursor] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetchPage = useCallback(
    (pageCursor: string | null) => {
      if (inFlight.current) {
        return;
      }
      inFlight.current = true;
      setStatus('loading');
      service
        .list(pageCursor)
        .then((page) => {
          setConversations((current) => mergeConversations(current, page.items));
          setCursor(page.nextCursor);
          setStatus('ready');
        })
        .catch(() => setStatus('error'))
        .finally(() => {
          inFlight.current = false;
        });
    },
    [service],
  );

  const ensureLoaded = useCallback(() => {
    if (status === 'idle' || status === 'error') {
      fetchPage(null);
    }
  }, [fetchPage, status]);

  const loadMore = useCallback(() => {
    if (cursor !== null && status === 'ready') {
      fetchPage(cursor);
    }
  }, [cursor, fetchPage, status]);

  const upsert = useCallback((conversation: ConversationSummary) => {
    setConversations((current) => [conversation, ...current.filter((existing) => existing.id !== conversation.id)]);
  }, []);

  const value = useMemo(
    () => ({ conversations, status, hasMore: cursor !== null, ensureLoaded, loadMore, upsert }),
    [conversations, status, cursor, ensureLoaded, loadMore, upsert],
  );
  return <ConversationListContext.Provider value={value}>{children}</ConversationListContext.Provider>;
}

function mergeConversations(known: ConversationSummary[], page: ConversationSummary[]): ConversationSummary[] {
  const merged = new Map<string, ConversationSummary>();
  for (const conversation of [...known, ...page]) {
    const existing = merged.get(conversation.id);
    if (!existing || existing.updatedAt < conversation.updatedAt) {
      merged.set(conversation.id, conversation);
    }
  }
  return [...merged.values()].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
}

export function useConversationList(): ConversationListContextValue {
  const list = useContext(ConversationListContext);
  if (!list) {
    throw new Error('useConversationList must be used inside ConversationListProvider');
  }
  return list;
}
