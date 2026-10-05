import type { DraftView, PublicationView } from '@forms-ai/contracts';
import { useState } from 'react';
import type { GoogleConnection } from '../../hooks/use-google-connection';
import { ApiError } from '../../services/api-client';
import { useServices } from '../../state/services-context';
import { errorMessage } from '../../utils/error-messages';
import { Button, ButtonLink } from '../ui/button';
import { Icon } from '../ui/icon';
import { Modal } from '../ui/modal';
import styles from './publish-bar.module.css';

type PublishPhase = 'idle' | 'confirming' | 'publishing' | 'needs-connection';

interface PublishBarProps {
  draft: DraftView;
  conversationId: string;
  google: GoogleConnection;
  busy: boolean;
  onPublication(publication: PublicationView): void;
  onStaleDraft(): void;
}

function publicationFromError(error: unknown): PublicationView | null {
  const publication = error instanceof ApiError ? error.details?.publication : null;
  return publication && typeof publication === 'object' ? (publication as PublicationView) : null;
}

export function PublishBar({ draft, conversationId, google, busy, onPublication, onStaleDraft }: PublishBarProps) {
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
      onPublication(await googleService.publish(draft.id, draft.currentVersion.id));
      setPhase('idle');
    } catch (caught) {
      handleFailure(caught);
    }
  };

  const handleFailure = (caught: unknown) => {
    const failedPublication = publicationFromError(caught);
    if (failedPublication) {
      onPublication(failedPublication);
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
      {publication?.status === 'SUCCEEDED' && publication.responderUrl && publication.editUrl ? (
        <div className={styles.success} role="status">
          <p className={styles.successTitle}>
            <Icon name="check" size={18} />
            {publishedCurrent ? 'Google Form created successfully' : 'An earlier version was published'}
          </p>
          <div className={styles.links}>
            <ButtonLink href={publication.responderUrl} target="_blank" rel="noopener noreferrer" variant="secondary" size="sm" icon={<Icon name="external" size={16} />}>
              Open form
            </ButtonLink>
            <ButtonLink href={publication.editUrl} target="_blank" rel="noopener noreferrer" variant="secondary" size="sm" icon={<Icon name="external" size={16} />}>
              Open editor
            </ButtonLink>
          </div>
        </div>
      ) : null}
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
      {!publishedCurrent && phase !== 'needs-connection' ? (
        <>
          <Button block loading={phase === 'publishing'} disabled={busy} onClick={requestPublish}>
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
