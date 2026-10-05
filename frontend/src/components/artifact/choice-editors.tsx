import { FORM_LIMITS, type LinearScale } from '@forms-ai/contracts';
import { Button } from '../ui/button';
import { SelectField } from '../ui/fields';
import { Icon } from '../ui/icon';
import { IconButton } from '../ui/icon-button';
import { CommitText } from './commit-text';
import styles from './form-editor.module.css';

function nextOptionLabel(options: readonly string[]): string {
  const taken = new Set(options.map((option) => option.toLowerCase()));
  let number = options.length + 1;
  while (taken.has(`option ${number}`)) {
    number += 1;
  }
  return `Option ${number}`;
}

interface OptionsEditorProps {
  questionTitle: string;
  options: readonly string[];
  disabled: boolean;
  onCommit(options: string[]): void;
}

export function OptionsEditor({ questionTitle, options, disabled, onCommit }: OptionsEditorProps) {
  const replace = (index: number, value: string) => {
    const next = [...options];
    if (value.length === 0) {
      next.splice(index, 1);
    } else {
      next[index] = value;
    }
    if (next.length > 0) {
      onCommit(next);
    }
  };

  return (
    <fieldset className={styles.options} disabled={disabled}>
      <legend className="visually-hidden">Options for {questionTitle}</legend>
      <ul className={styles.optionList}>
        {options.map((option, index) => (
          <li key={`${index}-${option}`} className={styles.optionRow}>
            <span className={styles.optionMarker} aria-hidden="true" />
            <CommitText label={`Option ${index + 1}`} hideLabel value={option} onCommit={(value) => replace(index, value)} maxLength={FORM_LIMITS.optionMaxLength} />
            <IconButton
              icon="close"
              label={`Remove option ${option}`}
              iconSize={16}
              disabled={options.length <= 1}
              onClick={() => onCommit(options.filter((_option, position) => position !== index))}
            />
          </li>
        ))}
      </ul>
      <Button
        variant="ghost"
        size="sm"
        icon={<Icon name="plus" size={16} />}
        disabled={options.length >= FORM_LIMITS.maxOptions}
        onClick={() => onCommit([...options, nextOptionLabel(options)])}
      >
        Add option
      </Button>
    </fieldset>
  );
}

const SCALE_UPPER_BOUNDS = Array.from({ length: FORM_LIMITS.scaleMaxUpperBound - 1 }, (_value, index) => index + 2);

interface ScaleEditorProps {
  scale: LinearScale;
  disabled: boolean;
  onCommit(scale: LinearScale): void;
}

export function ScaleEditor({ scale, disabled, onCommit }: ScaleEditorProps) {
  return (
    <fieldset className={styles.scale} disabled={disabled}>
      <legend className="visually-hidden">Scale range</legend>
      <div className={styles.scaleRange}>
        <SelectField
          label="From"
          value={String(scale.min)}
          options={[
            { value: '0', label: '0' },
            { value: '1', label: '1' },
          ]}
          onChange={(event) => onCommit({ ...scale, min: event.target.value === '0' ? 0 : 1 })}
        />
        <SelectField
          label="To"
          value={String(scale.max)}
          options={SCALE_UPPER_BOUNDS.map((bound) => ({ value: String(bound), label: String(bound) }))}
          onChange={(event) => onCommit({ ...scale, max: Number(event.target.value) })}
        />
      </div>
      <div className={styles.scaleRange}>
        <CommitText label="Low label (optional)" value={scale.minLabel} onCommit={(minLabel) => onCommit({ ...scale, minLabel })} maxLength={FORM_LIMITS.scaleLabelMaxLength} />
        <CommitText label="High label (optional)" value={scale.maxLabel} onCommit={(maxLabel) => onCommit({ ...scale, maxLabel })} maxLength={FORM_LIMITS.scaleLabelMaxLength} />
      </div>
    </fieldset>
  );
}
