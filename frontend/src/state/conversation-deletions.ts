import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '../services/api-client';
import type { ConversationService } from '../services/forms-ai-services';

export const DELETION_GRACE_MS = 5000;

export type DeletionPhase = 'counting' | 'deleting';

export interface PendingDeletion {
  deadline: number;
  phase: DeletionPhase;
}

export interface ConversationDeletions {
  pending: ReadonlyMap<string, PendingDeletion>;
  deleted: ReadonlySet<string>;
  schedule(conversationId: string): void;
  undo(conversationId: string): void;
}

interface DeletionCallbacks {
  onDeleted(conversationId: string): void;
  onFailed(): void;
}

function withEntry(current: ReadonlyMap<string, PendingDeletion>, id: string, entry: PendingDeletion): Map<string, PendingDeletion> {
  return new Map(current).set(id, entry);
}

function withoutEntry(current: ReadonlyMap<string, PendingDeletion>, id: string): Map<string, PendingDeletion> {
  const next = new Map(current);
  next.delete(id);
  return next;
}

export function useConversationDeletions(service: ConversationService, callbacks: DeletionCallbacks): ConversationDeletions {
  const [pending, setPending] = useState<ReadonlyMap<string, PendingDeletion>>(() => new Map());
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(() => new Set());
  const phases = useRef(new Map<string, DeletionPhase>());
  const timers = useRef(new Map<string, number>());
  const latestCallbacks = useRef(callbacks);

  useLayoutEffect(() => {
    latestCallbacks.current = callbacks;
  });

  const finish = useCallback((id: string) => {
    phases.current.delete(id);
    setPending((current) => withoutEntry(current, id));
  }, []);

  const markDeleted = useCallback((id: string) => {
    setDeleted((current) => new Set(current).add(id));
    latestCallbacks.current.onDeleted(id);
  }, []);

  const commit = useCallback(
    (id: string, deadline: number) => {
      timers.current.delete(id);
      if (phases.current.get(id) !== 'counting') {
        return;
      }
      phases.current.set(id, 'deleting');
      setPending((current) => withEntry(current, id, { deadline, phase: 'deleting' }));
      service
        .delete(id)
        .then(() => markDeleted(id))
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 404) {
            markDeleted(id);
          } else {
            latestCallbacks.current.onFailed();
          }
        })
        .finally(() => finish(id));
    },
    [finish, markDeleted, service],
  );

  const schedule = useCallback(
    (id: string) => {
      if (phases.current.has(id)) {
        return;
      }
      const deadline = Date.now() + DELETION_GRACE_MS;
      phases.current.set(id, 'counting');
      setPending((current) => withEntry(current, id, { deadline, phase: 'counting' }));
      timers.current.set(
        id,
        window.setTimeout(() => commit(id, deadline), DELETION_GRACE_MS),
      );
    },
    [commit],
  );

  const undo = useCallback(
    (id: string) => {
      if (phases.current.get(id) !== 'counting') {
        return;
      }
      window.clearTimeout(timers.current.get(id));
      timers.current.delete(id);
      finish(id);
    },
    [finish],
  );

  useEffect(() => {
    const scheduled = timers.current;
    return () => {
      scheduled.forEach((timer) => window.clearTimeout(timer));
      scheduled.clear();
    };
  }, []);

  return useMemo(() => ({ pending, deleted, schedule, undo }), [deleted, pending, schedule, undo]);
}
