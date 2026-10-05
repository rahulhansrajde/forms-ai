import type { MessageView } from '@forms-ai/contracts';
import { useCallback, useEffect, useState } from 'react';
import { useServices } from '../state/services-context';
import { errorMessage } from '../utils/error-messages';

export type MessagesStatus = 'empty' | 'loading' | 'ready' | 'error';

interface MessagesState {
  conversationId: string | null;
  messages: MessageView[];
  olderCursor: string | null;
  status: MessagesStatus;
  error: string | null;
  activeDraftId: string | null;
}

export interface ConversationMessages extends MessagesState {
  loadingOlder: boolean;
  loadOlder(): Promise<void>;
  append(messages: MessageView[]): void;
  adopt(conversationId: string): void;
  setActiveDraftId(draftId: string): void;
  retry(): void;
}

function initialState(conversationId: string | null): MessagesState {
  return {
    conversationId,
    messages: [],
    olderCursor: null,
    status: conversationId ? 'loading' : 'empty',
    error: null,
    activeDraftId: null,
  };
}

export function useConversationMessages(conversationId: string | null): ConversationMessages {
  const { conversations } = useServices();
  const [state, setState] = useState<MessagesState>(() => initialState(conversationId));
  const [trackedId, setTrackedId] = useState(conversationId);
  const [loadingOlder, setLoadingOlder] = useState(false);

  if (trackedId !== conversationId) {
    setTrackedId(conversationId);
    if (state.conversationId !== conversationId) {
      setState(initialState(conversationId));
    }
  }

  const loadingId = state.status === 'loading' ? state.conversationId : null;

  useEffect(() => {
    if (!loadingId) {
      return;
    }
    let active = true;
    Promise.all([conversations.get(loadingId), conversations.messages(loadingId, null)])
      .then(([detail, page]) => {
        if (active) {
          setState((current) =>
            current.conversationId === loadingId
              ? {
                  conversationId: loadingId,
                  messages: page.items,
                  olderCursor: page.nextCursor,
                  status: 'ready',
                  error: null,
                  activeDraftId: detail.activeDraftId,
                }
              : current,
          );
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setState((current) => (current.conversationId === loadingId ? { ...current, status: 'error', error: errorMessage(error) } : current));
        }
      });
    return () => {
      active = false;
    };
  }, [conversations, loadingId]);

  const loadOlder = useCallback(async () => {
    const { conversationId: id, olderCursor } = state;
    if (!id || !olderCursor || loadingOlder) {
      return;
    }
    setLoadingOlder(true);
    try {
      const page = await conversations.messages(id, olderCursor);
      setState((current) =>
        current.conversationId === id ? { ...current, messages: [...page.items, ...current.messages], olderCursor: page.nextCursor } : current,
      );
    } finally {
      setLoadingOlder(false);
    }
  }, [conversations, loadingOlder, state]);

  const append = useCallback((messages: MessageView[]) => {
    setState((current) => ({ ...current, status: 'ready', messages: [...current.messages, ...messages] }));
  }, []);

  const adopt = useCallback((id: string) => {
    setState((current) => ({ ...current, conversationId: id, status: 'ready' }));
  }, []);

  const setActiveDraftId = useCallback((draftId: string) => {
    setState((current) => ({ ...current, activeDraftId: draftId }));
  }, []);

  const retry = useCallback(() => {
    setState((current) => (current.conversationId ? { ...current, status: 'loading', error: null } : current));
  }, []);

  return { ...state, loadingOlder, loadOlder, append, adopt, setActiveDraftId, retry };
}
