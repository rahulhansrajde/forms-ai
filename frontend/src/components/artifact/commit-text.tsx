import { useState, type KeyboardEvent } from 'react';
import { TextAreaField, TextField } from '../ui/fields';

interface CommitTextProps {
  label: string;
  value: string;
  onCommit(value: string): void;
  multiline?: boolean;
  required?: boolean;
  hideLabel?: boolean;
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  className?: string;
}

export function CommitText({
  label,
  value,
  onCommit,
  multiline = false,
  required = false,
  hideLabel = false,
  placeholder,
  maxLength,
  disabled,
  className,
}: CommitTextProps) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const [syncedValue, setSyncedValue] = useState(value);
  const [error, setError] = useState<string | null>(null);

  if (value !== syncedValue) {
    setSyncedValue(value);
    if (!focused) {
      setText(value);
    }
  }

  const commit = () => {
    setFocused(false);
    const next = multiline ? text.trim() : text.replace(/\s+/g, ' ').trim();
    if (required && next.length === 0) {
      setError(`${label} cannot be empty.`);
      setText(value);
      return;
    }
    setError(null);
    setText(next);
    if (next !== value) {
      onCommit(next);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      setText(value);
      setError(null);
      event.currentTarget.blur();
    } else if (event.key === 'Enter' && !multiline && !event.nativeEvent.isComposing) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  const shared = {
    label,
    hideLabel,
    placeholder,
    maxLength,
    disabled,
    className,
    error,
    value: text,
    onFocus: () => setFocused(true),
    onBlur: commit,
    onKeyDown: handleKeyDown,
  };

  return multiline ? (
    <TextAreaField {...shared} rows={2} onChange={(event) => setText(event.target.value)} />
  ) : (
    <TextField {...shared} onChange={(event) => setText(event.target.value)} />
  );
}
