import { useEffect, useState } from 'react';
import { DELETION_GRACE_MS, type PendingDeletion } from '../../state/conversation-deletions';
import { Spinner } from '../ui/spinner';
import styles from './deletion-countdown.module.css';

const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const TICK_MS = 200;

interface DeletionCountdownProps {
  title: string;
  deletion: PendingDeletion;
  onUndo(): void;
}

function useRemainingMs(deadline: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return Math.max(0, deadline - now);
}

export function DeletionCountdown({ title, deletion, onUndo }: DeletionCountdownProps) {
  const remaining = useRemainingMs(deletion.deadline);
  const seconds = Math.ceil(remaining / 1000);
  const deleting = deletion.phase === 'deleting';

  return (
    <div className={styles.row}>
      <span className={styles.title}>{title}</span>
      <span className="visually-hidden" role="status">
        {deleting ? `Deleting “${title}”.` : `“${title}” will be deleted in ${Math.ceil(DELETION_GRACE_MS / 1000)} seconds. Press Undo to keep it.`}
      </span>
      {deleting ? (
        <span className={styles.deleting} aria-hidden="true">
          <Spinner size={14} />
          Deleting…
        </span>
      ) : (
        <>
          <span className={styles.timer} aria-hidden="true">
            <svg className={styles.ring} viewBox="0 0 24 24">
              <circle className={styles.track} cx="12" cy="12" r={RADIUS} />
              <circle
                className={styles.progress}
                cx="12"
                cy="12"
                r={RADIUS}
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={CIRCUMFERENCE * (1 - remaining / DELETION_GRACE_MS)}
              />
            </svg>
            <span className={styles.seconds}>{seconds}</span>
          </span>
          <button type="button" className={styles.undo} onClick={onUndo} autoFocus aria-label={`Undo deleting “${title}”`}>
            Undo
          </button>
        </>
      )}
    </div>
  );
}
