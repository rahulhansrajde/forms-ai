import type { ReactNode } from 'react';
import { Logo } from './logo';
import { Spinner } from './spinner';
import styles from './states.module.css';

export function LoadingState({ label = 'Loading…', fullscreen = false }: { label?: string; fullscreen?: boolean }) {
  return (
    <div className={fullscreen ? `${styles.loading} ${styles.fullscreen}` : styles.loading} role="status" aria-live="polite">
      {fullscreen ? <Logo size={56} /> : null}
      <span className={styles.loadingRow}>
        <Spinner size={16} />
        <span>{label}</span>
      </span>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  showLogo?: boolean;
}

export function EmptyState({ title, description, action, showLogo = true }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {showLogo ? <Logo size={48} decorative /> : null}
      <h2 className={styles.title}>{title}</h2>
      {description ? <p className={styles.description}>{description}</p> : null}
      {action}
    </div>
  );
}

export function InlineError({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className={styles.inlineError} role="alert">
      <span>{message}</span>
      {action}
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
  return (
    <span className={styles.avatar} aria-hidden="true">
      {initials || '?'}
    </span>
  );
}
