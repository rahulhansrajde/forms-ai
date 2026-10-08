import type { ExecuteSheetActionResult, MessageView, SheetActionKind, SheetActionView } from '@forms-ai/contracts';
import { useState } from 'react';
import { ApiError } from '../../services/api-client';
import { useServices } from '../../state/services-context';
import { errorMessage } from '../../utils/error-messages';
import { Button, ButtonLink } from '../ui/button';
import { Icon } from '../ui/icon';
import { Modal } from '../ui/modal';
import styles from './sheet-action-card.module.css';
import { SheetTable } from './sheet-table';

interface KindPresentation {
  heading(action: SheetActionView): string;
  action: string;
  running: string;
  done: string;
}

function isKnownSheet(action: SheetActionView): boolean {
  return action.tabs.length > 0 || action.status === 'SUCCEEDED';
}

const PRESENTATION: Readonly<Record<SheetActionKind, KindPresentation>> = {
  CREATE: {
    heading: (action) => `New Google Sheet “${action.spreadsheetTitle}”`,
    action: 'Create Google Sheet',
    running: 'Creating Google Sheet…',
    done: 'Created in Google Sheets',
  },
  MODIFY: { heading: (action) => `Changes to “${action.spreadsheetTitle}”`, action: 'Apply changes', running: 'Applying changes…', done: 'Changes applied' },
  READ: { heading: (action) => `Read from “${action.spreadsheetTitle}”`, action: 'Read sheet', running: 'Reading sheet…', done: 'Data read' },
  LINK: {
    heading: (action) => (isKnownSheet(action) ? 'Google Sheet found' : 'Connect a Google Sheet'),
    action: 'Connect Google Sheet',
    running: 'Connecting Google Sheet…',
    done: 'Connected to this chat',
  },
};

type Problem = { kind: 'connect' | 'sheets-access'; message: string } | { kind: 'error'; message: string };

function resultFromError(error: unknown): ExecuteSheetActionResult | null {
  const details = error instanceof ApiError ? error.details : undefined;
  const action = details?.action;
  if (!action || typeof action !== 'object') {
    return null;
  }
  const message = details?.message;
  return { action: action as SheetActionView, message: message && typeof message === 'object' ? (message as MessageView) : null };
}

interface SheetActionCardProps {
  action: SheetActionView;
  conversationId: string | null;
  onResult(result: ExecuteSheetActionResult): void;
}

export function SheetActionCard({ action, conversationId, onResult }: SheetActionCardProps) {
  const { sheets, google } = useServices();
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const presentation = PRESENTATION[action.kind];
  const done = action.status === 'SUCCEEDED';
  const reconnectPath = google.authorizationPath(conversationId ? `/chat/${conversationId}` : '/chat');

  const execute = async (confirmDestructive: boolean) => {
    setConfirming(false);
    setRunning(true);
    setProblem(null);
    try {
      onResult(await sheets.execute(action.id, confirmDestructive));
    } catch (caught) {
      handleFailure(caught);
    } finally {
      setRunning(false);
    }
  };

  const handleFailure = (caught: unknown) => {
    const failed = resultFromError(caught);
    if (failed) {
      onResult(failed);
    }
    if (caught instanceof ApiError && caught.code === 'CONFIRMATION_REQUIRED') {
      setConfirming(true);
      return;
    }
    if (caught instanceof ApiError && (caught.code === 'GOOGLE_NOT_CONNECTED' || caught.code === 'GOOGLE_RECONNECT_REQUIRED')) {
      setProblem({ kind: 'connect', message: caught.message });
      return;
    }
    if (caught instanceof ApiError && caught.code === 'GOOGLE_SHEETS_ACCESS_REQUIRED') {
      setProblem({ kind: 'sheets-access', message: caught.message });
      return;
    }
    if (!failed) {
      setProblem({ kind: 'error', message: errorMessage(caught) });
    }
  };

  const start = () => {
    if (action.destructive) {
      setConfirming(true);
      return;
    }
    void execute(false);
  };

  return (
    <section className={styles.card} aria-label={presentation.heading(action)}>
      <header className={styles.header}>
        <span className={styles.badge}>
          <Icon name="table" size={16} />
          Google Sheets
        </span>
        {action.destructive ? (
          <span className={styles.warning}>
            <Icon name="alert" size={14} />
            Removes data
          </span>
        ) : null}
      </header>
      <h3 className={styles.title}>{presentation.heading(action)}</h3>
      {action.kind === 'LINK' ? (
        <LinkDetails action={action} />
      ) : action.steps.length > 0 ? (
        <ol className={styles.steps}>
          {action.steps.map((step, index) => (
            <li key={index}>
              <span>{step.text}</span>
              {step.note ? <span className={styles.stepNote}>{step.note}</span> : null}
              {step.change ? (
                <span className={styles.change}>
                  <span className="visually-hidden">from </span>
                  <span className={styles.from}>{step.change.from || 'empty'}</span>
                  <span aria-hidden="true"> → </span>
                  <span className="visually-hidden"> to </span>
                  <span className={styles.to}>{step.change.to}</span>
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
      {action.status === 'FAILED' && action.error && !problem ? (
        <p className={styles.failure} role="alert">
          The last attempt failed: {action.error}
        </p>
      ) : null}
      {action.status === 'RUNNING' && !running ? <p className={styles.hint}>This action is still running in Google Sheets.</p> : null}
      {problem ? <ProblemNotice problem={problem} reconnectPath={reconnectPath} /> : null}
      {done ? (
        <p className={styles.done}>
          <Icon name="check" size={16} />
          <span>{presentation.done}</span>
        </p>
      ) : (
        <div className={styles.actions}>
          <Button size="sm" loading={running} disabled={running} onClick={start} className={action.kind === 'LINK' ? styles.emphasis : undefined}>
            {running ? presentation.running : action.status === 'FAILED' ? `Try again: ${presentation.action}` : presentation.action}
          </Button>
          {action.kind === 'CREATE' && action.status === 'PENDING' ? <span className={styles.hint}>Nothing is created until you click.</span> : null}
          {action.kind === 'LINK' && action.status === 'PENDING' ? <span className={styles.hint}>Connecting does not change the spreadsheet.</span> : null}
        </div>
      )}
      <Modal
        open={confirming}
        title="Remove data from Google Sheets?"
        onClose={() => setConfirming(false)}
        actions={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button onClick={() => void execute(true)}>Yes, apply changes</Button>
          </>
        }
      >
        <p>These changes to “{action.spreadsheetTitle}” remove data:</p>
        <ul className={styles.modalSteps}>
          {action.steps.map((step, index) => (
            <li key={index}>
              {step.text}
              {step.note ? <span className={styles.stepNote}>{step.note}</span> : null}
            </li>
          ))}
        </ul>
        <p className={styles.hint}>You can bring earlier data back from File › Version history in Google Sheets.</p>
      </Modal>
    </section>
  );
}

function LinkDetails({ action }: { action: SheetActionView }) {
  if (!isKnownSheet(action)) {
    return <p className={styles.hint}>Forms AI will check that your Google account can open this spreadsheet before connecting it.</p>;
  }
  return (
    <dl className={styles.details}>
      <div>
        <dt>Spreadsheet Name</dt>
        <dd>{action.spreadsheetTitle}</dd>
      </div>
      <div>
        <dt>Tabs</dt>
        <dd>{action.tabs.join(', ')}</dd>
      </div>
    </dl>
  );
}

function ProblemNotice({ problem, reconnectPath }: { problem: Problem; reconnectPath: string }) {
  if (problem.kind === 'error') {
    return (
      <p className={styles.failure} role="alert">
        {problem.message}
      </p>
    );
  }
  return (
    <div className={styles.notice} role="alert">
      <p>
        {problem.kind === 'connect'
          ? 'Connect your Google account so Forms AI can work with Google Sheets for you.'
          : 'Your Google connection does not include Google Sheets yet. Allow access once and try again.'}
      </p>
      <ButtonLink href={reconnectPath} size="sm" variant="secondary">
        {problem.kind === 'connect' ? 'Connect Google' : 'Allow Google Sheets'}
      </ButtonLink>
    </div>
  );
}

interface SheetResultMessageProps {
  content: string;
  action: SheetActionView;
}

export function SheetResultMessage({ content, action }: SheetResultMessageProps) {
  const [headline = '', ...paragraphs] = content.split(/\n{2,}/);
  return (
    <section className={styles.card} aria-label={`Google Sheets result for “${action.spreadsheetTitle}”`}>
      <p className={styles.headline}>
        <Icon name="check" size={18} />
        <span>{headline}</span>
      </p>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className={styles.body}>
          {paragraph}
        </p>
      ))}
      {action.table ? <SheetTable table={action.table} /> : null}
      {action.spreadsheetUrl ? (
        <div className={styles.actions}>
          <ButtonLink
            href={action.spreadsheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            size="sm"
            className={styles.openSheet}
            icon={<Icon name="external" size={16} />}
          >
            Open sheet
          </ButtonLink>
          <span className={styles.hint}>“{action.spreadsheetTitle}”</span>
        </div>
      ) : null}
    </section>
  );
}
