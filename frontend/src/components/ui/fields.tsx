import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import styles from './fields.module.css';

interface FieldFrameProps {
  id: string;
  label: string;
  hideLabel?: boolean;
  error?: string | null;
  hint?: string;
  children: ReactNode;
}

function FieldFrame({ id, label, hideLabel = false, error, hint, children }: FieldFrameProps) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={hideLabel ? 'visually-hidden' : styles.label}>
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string | null, hint?: string): string | undefined {
  if (error) {
    return `${id}-error`;
  }
  return hint ? `${id}-hint` : undefined;
}

interface SharedFieldProps {
  label: string;
  hideLabel?: boolean;
  error?: string | null;
  hint?: string;
}

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & SharedFieldProps;

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hideLabel, error, hint, className, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldFrame id={fieldId} label={label} hideLabel={hideLabel} error={error} hint={hint}>
      <input
        {...rest}
        ref={ref}
        id={fieldId}
        className={[styles.control, className ?? ''].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
      />
    </FieldFrame>
  );
});

type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & SharedFieldProps;

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(function TextAreaField(
  { label, hideLabel, error, hint, className, id, ...rest },
  ref,
) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldFrame id={fieldId} label={label} hideLabel={hideLabel} error={error} hint={hint}>
      <textarea
        {...rest}
        ref={ref}
        id={fieldId}
        className={[styles.control, styles.textarea, className ?? ''].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
      />
    </FieldFrame>
  );
});

interface SelectOption {
  value: string;
  label: string;
}

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & SharedFieldProps & { options: readonly SelectOption[] };

export function SelectField({ label, hideLabel, error, hint, options, className, id, ...rest }: SelectFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldFrame id={fieldId} label={label} hideLabel={hideLabel} error={error} hint={hint}>
      <select
        {...rest}
        id={fieldId}
        className={[styles.control, styles.select, className ?? ''].filter(Boolean).join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, error, hint)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}
