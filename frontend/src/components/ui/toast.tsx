import { IconButton } from './icon-button';
import styles from './toast.module.css';

export interface ToastMessage {
  id: number;
  message: string;
}

export function ToastViewport({ toasts, onDismiss }: { toasts: readonly ToastMessage[]; onDismiss(id: number): void }) {
  return (
    <div className={styles.viewport} role="status" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={styles.toast}>
          <span>{toast.message}</span>
          <IconButton icon="close" label="Dismiss notification" tooltip={false} iconSize={16} className={styles.dismiss} onClick={() => onDismiss(toast.id)} />
        </div>
      ))}
    </div>
  );
}
