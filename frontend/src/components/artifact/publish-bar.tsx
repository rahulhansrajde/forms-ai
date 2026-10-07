import type { DraftView, MessageView, PublicationView, PublishResult } from '@forms-ai/contracts';
import { useState } from 'react';
import type { GoogleConnection } from '../../hooks/use-google-connection';
import { ApiError } from '../../services/api-client';
import { useServices } from '../../state/services-context';
import { errorMessage } from '../../utils/error-messages';
import { Button, ButtonLink } from '../ui/button';
import { Modal } from '../ui/modal';
import styles from './publish-bar.module.css';

type PublishPhase = 'idle' | 'confirming' | 'publishing' | 'needs-connection';

interface PublishBarProps {
  draft: DraftView;
  conversationId: string;
  google: GoogleConnection;
  busy: boolean;
  onPublished(result: PublishResult): void;
  onStaleDraft(): void;
}

function resultFromError(error: unknown): PublishResult | null {
  const details = error instanceof ApiError ? error.details : null;
  const publication = details?.publication;
  if (!publication || typeof publication !== 'object') {
    return null;
  }
  const message = details?.message;
  return { publication: publication as PublicationView, message: message && typeof message === 'object' ? (message as MessageView) : null };
}

export function PublishBar({ draft, conversationId, google, busy, onPublished, onStaleDraft }: PublishBarProps) {
  const { google: googleService } = useServices();
  const [phase, setPhase] = useState<PublishPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const publication = draft.publication;
  const publishedCurrent = publication?.status === 'SUCCEEDED' && publication.versionId === draft.currentVersion.id;
  const connectPath = google.authorizationPath(`/chat/${conversationId}`);

  const requestPublish = () => {
    setError(null);
    setPhase(google.connection?.connected === false ? 'needs-connection' : 'confirming');
  };

  const publish = async () => {
    setPhase('publishing');
    try {
      onPublished(await googleService.publish(draft.id, draft.currentVersion.id));
      setPhase('idle');
    } catch (caught) {
      handleFailure(caught);
    }
  };

  const handleFailure = (caught: unknown) => {
    const failed = resultFromError(caught);
    if (failed) {
      onPublished(failed);
    }
    if (caught instanceof ApiError && (caught.code === 'GOOGLE_NOT_CONNECTED' || caught.code === 'GOOGLE_RECONNECT_REQUIRED')) {
      google.markDisconnected();
      setError(caught.message);
      setPhase('needs-connection');
      return;
    }
    if (caught instanceof ApiError && caught.code === 'VERSION_CONFLICT') {
      onStaleDraft();
    }
    setError(errorMessage(caught));
    setPhase('idle');
  };

  return (
    <div className={styles.bar}>
      {publication?.status === 'FAILED' && !error ? (
        <p className={styles.failure} role="alert">
          The last attempt failed{publication.error ? `: ${publication.error}` : '.'} Your draft is safe.
        </p>
      ) : null}
      {error ? (
        <p className={styles.failure} role="alert">
          {error}
        </p>
      ) : null}
      {phase === 'needs-connection' ? (
        <div className={styles.connect}>
          <p>Connect your Google account so Forms AI can create this form in Google Forms.</p>
          <ButtonLink href={connectPath} block>
            Connect Google Forms
          </ButtonLink>
        </div>
      ) : null}
      {publishedCurrent ? <p className={styles.hint}>Version {draft.currentVersion.versionNumber} is in Google Forms. Edit the draft to create a new version.</p> : null}
      {!publishedCurrent && phase !== 'needs-connection' ? (
        <>
          <Button block loading={phase === 'publishing'} disabled={busy || phase === 'publishing'} onClick={requestPublish}>
            {phase === 'publishing' ? 'Creating Google Form…' : publication?.status === 'FAILED' ? 'Retry Create GForm' : 'Create GForm'}
          </Button>
          <p className={styles.hint}>Creates a real Google Form from version {draft.currentVersion.versionNumber} in your Google account.</p>
        </>
      ) : null}
      <Modal
        open={phase === 'confirming'}
        title="Create a Google Form?"
        onClose={() => setPhase('idle')}
        actions={
          <>
            <Button variant="secondary" onClick={() => setPhase('idle')}>
              Cancel
            </Button>
            <Button onClick={() => void publish()}>Create GForm</Button>
          </>
        }
      >
        <p>
          This creates an actual Google Form named “{draft.currentVersion.schema.title}” in your connected Google account
          {google.connection?.email ? ` (${google.connection.email})` : ''}, using version {draft.currentVersion.versionNumber} of this draft.
        </p>
        <p className={styles.modalNote}>Your draft stays here, and you can keep editing it afterwards.</p>
      </Modal>
    </div>
  );
}
