import { useId } from 'react';
import styles from './switch.module.css';

interface SwitchProps {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
  description?: string;
  disabled?: boolean;
}

export function Switch({ label, checked, onChange, description, disabled = false }: SwitchProps) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <div className={styles.row}>
      <div className={styles.text}>
        <span id={labelId} className={styles.label}>
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className={styles.description}>
            {description}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-describedby={description ? descriptionId : undefined}
        disabled={disabled}
        className={styles.track}
        onClick={() => onChange(!checked)}
      >
        <span className={styles.thumb} />
      </button>
    </div>
  );
}
