import type { DraftView, FormOperation, PublicationView } from '@forms-ai/contracts';
import { useCallback, useRef, useState } from 'react';
import { ApiError } from '../services/api-client';
import { useServices } from '../state/services-context';
import { useToast } from '../state/toast-context';
import { errorMessage } from '../utils/error-messages';

export type DraftStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface DraftWorkspace {
  draft: DraftView | null;
  status: DraftStatus;
  saving: boolean;
  load(): void;
  reload(): Promise<void>;
  receive(draft: DraftView): void;
  commit(operations: FormOperation[]): void;
  restore(versionId: string): Promise<void>;
  recordPublication(publication: PublicationView): void;
}

export function useDraftWorkspace(draftId: string | null): DraftWorkspace {
  const { drafts } = useServices();
  const { notify } = useToast();
  const [draft, setDraft] = useState<DraftView | null>(null);
  const [status, setStatus] = useState<DraftStatus>('idle');
  const [pendingCommits, setPendingCommits] = useState(0);
  const [trackedDraftId, setTrackedDraftId] = useState(draftId);
  const latest = useRef<DraftView | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());

  if (trackedDraftId !== draftId) {
    setTrackedDraftId(draftId);
    if (draft && draft.id !== draftId) {
      setDraft(null);
      setStatus('idle');
    }
  }

  const adopt = useCallback((view: DraftView) => {
    latest.current = view;
    setDraft(view);
    setStatus('ready');
  }, []);

  const reload = useCallback(async () => {
    if (!draftId) {
      return;
    }
    try {
      adopt(await drafts.get(draftId));
    } catch (error) {
      setStatus('error');
      notify(errorMessage(error));
    }
  }, [adopt, draftId, drafts, notify]);

  const load = useCallback(() => {
    if (!draftId || (draft?.id === draftId && status === 'ready')) {
      return;
    }
    setStatus('loading');
    void reload();
  }, [draft, draftId, reload, status]);

  const runCommit = useCallback(
    async (operations: FormOperation[]) => {
      const base = latest.current;
      if (!base) {
        return;
      }
      try {
        adopt(await drafts.applyOperations(base.id, base.currentVersion.id, operations));
      } catch (error) {
        notify(
          error instanceof ApiError && error.code === 'VERSION_CONFLICT'
            ? 'Your draft changed in the meantime, so the latest version was loaded.'
            : errorMessage(error),
        );
        await reload();
      }
    },
    [adopt, drafts, notify, reload],
  );

  const commit = useCallback(
    (operations: FormOperation[]) => {
      if (operations.length === 0) {
        return;
      }
      setPendingCommits((count) => count + 1);
      queue.current = queue.current.then(() => runCommit(operations)).finally(() => setPendingCommits((count) => count - 1));
    },
    [runCommit],
  );

  const restore = useCallback(
    async (versionId: string) => {
      const base = latest.current;
      if (!base) {
        return;
      }
      try {
        adopt(await drafts.restore(base.id, base.currentVersion.id, versionId));
        notify('Version restored as the latest version.');
      } catch (error) {
        notify(errorMessage(error));
        await reload();
      }
    },
    [adopt, drafts, notify, reload],
  );

  const recordPublication = useCallback(
    (publication: PublicationView) => {
      const current = latest.current;
      if (current) {
        adopt({ ...current, publication, status: publication.status === 'SUCCEEDED' ? 'PUBLISHED' : current.status });
      }
    },
    [adopt],
  );

  return { draft, status, saving: pendingCommits > 0, load, reload, receive: adopt, commit, restore, recordPublication };
}
