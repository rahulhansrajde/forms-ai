import type { FormVersionSummary, FormVersionView, PublishResult } from '@forms-ai/contracts';
import { useEffect, useState } from 'react';
import type { DraftWorkspace } from '../../hooks/use-draft-workspace';
import { useGoogleConnection } from '../../hooks/use-google-connection';
import { useServices } from '../../state/services-context';
import { useToast } from '../../state/toast-context';
import { errorMessage } from '../../utils/error-messages';
import { Button } from '../ui/button';
import { Drawer } from '../ui/drawer';
import { IconButton } from '../ui/icon-button';
import { LoadingState } from '../ui/states';
import styles from './artifact-panel.module.css';
import { FormEditor } from './form-editor';
import { FormReadOnly } from './form-read-only';
import { PublishBar } from './publish-bar';
import { VersionPicker } from './version-picker';

interface ArtifactPanelProps {
  open: boolean;
  modal: boolean;
  conversationId: string | null;
  workspace: DraftWorkspace;
  onPublished(result: PublishResult): void;
  onClose(): void;
}

export function ArtifactPanel({ open, modal, conversationId, workspace, onPublished, onClose }: ArtifactPanelProps) {
  const { drafts } = useServices();
  const { notify } = useToast();
  const google = useGoogleConnection();
  const [viewing, setViewing] = useState<FormVersionView | null>(null);
  const { draft, status, saving, load } = workspace;

  useEffect(() => {
    if (open) {
      load();
    }
  }, [load, open]);

  const currentVersionId = draft?.currentVersion.id ?? null;
  const [trackedVersionId, setTrackedVersionId] = useState(currentVersionId);
  if (trackedVersionId !== currentVersionId) {
    setTrackedVersionId(currentVersionId);
    setViewing(null);
  }

  const selectVersion = async (summary: FormVersionSummary) => {
    if (!draft || summary.id === draft.currentVersion.id) {
      setViewing(null);
      return;
    }
    try {
      setViewing(await drafts.version(draft.id, summary.id));
    } catch (error) {
      notify(errorMessage(error));
    }
  };

  return (
    <Drawer open={open} side="right" modal={modal} label="Form draft preview" onClose={onClose} className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <h2 className={styles.title}>Form draft</h2>
          <span className={styles.saveState} aria-live="polite">
            {saving ? 'Saving…' : draft ? 'All changes saved' : ''}
          </span>
        </div>
        <div className={styles.headerActions}>
          {draft ? (
            <VersionPicker
              draftId={draft.id}
              currentVersionId={draft.currentVersion.id}
              currentVersionNumber={draft.currentVersion.versionNumber}
              viewingVersionNumber={viewing?.versionNumber ?? draft.currentVersion.versionNumber}
              onSelect={(version) => void selectVersion(version)}
            />
          ) : null}
          <IconButton icon="close" label="Close preview" onClick={onClose} />
        </div>
      </header>
      <div className={styles.body}>
        {status === 'loading' || (status === 'idle' && !draft) ? <LoadingState label="Loading draft…" /> : null}
        {status === 'error' && !draft ? <p className={styles.notice}>The draft could not be loaded. Close and reopen the preview to try again.</p> : null}
        {draft && viewing ? (
          <div className={styles.history}>
            <div className={styles.historyBanner}>
              <span>
                Viewing version {viewing.versionNumber}. The latest is version {draft.currentVersion.versionNumber}.
              </span>
              <div className={styles.historyActions}>
                <Button size="sm" variant="secondary" onClick={() => setViewing(null)}>
                  Back to latest
                </Button>
                <Button size="sm" onClick={() => void workspace.restore(viewing.id)}>
                  Restore this version
                </Button>
              </div>
            </div>
            <FormReadOnly schema={viewing.schema} />
          </div>
        ) : null}
        {draft && !viewing ? <FormEditor schema={draft.currentVersion.schema} disabled={false} onCommit={workspace.commit} /> : null}
      </div>
      {draft && conversationId ? (
        <footer className={styles.footer}>
          <PublishBar
            draft={draft}
            conversationId={conversationId}
            google={google}
            busy={saving || viewing !== null}
            onPublished={onPublished}
            onStaleDraft={workspace.reload}
          />
        </footer>
      ) : null}
    </Drawer>
  );
}
