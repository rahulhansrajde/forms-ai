import {
  FORM_LIMITS,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
  isChoiceQuestionType,
  type FormOperation,
  type FormQuestion,
  type QuestionChanges,
  type QuestionType,
} from '@forms-ai/contracts';
import { SelectField } from '../ui/fields';
import { IconButton } from '../ui/icon-button';
import { Switch } from '../ui/switch';
import { OptionsEditor, ScaleEditor } from './choice-editors';
import { CommitText } from './commit-text';
import styles from './form-editor.module.css';

const TYPE_OPTIONS = QUESTION_TYPES.map((type) => ({ value: type, label: QUESTION_TYPE_LABELS[type] }));

interface QuestionEditorProps {
  question: FormQuestion;
  number: number;
  index: number;
  sectionId: string;
  isLast: boolean;
  disabled: boolean;
  onCommit(operations: FormOperation[]): void;
}

export function QuestionEditor({ question, number, index, sectionId, isLast, disabled, onCommit }: QuestionEditorProps) {
  const change = (changes: QuestionChanges) => onCommit([{ type: 'UPDATE_QUESTION', questionId: question.id, changes }]);
  const move = (offset: number) =>
    onCommit([{ type: 'REORDER_QUESTION', questionId: question.id, sectionId, index: Math.max(index + offset, 0) }]);

  return (
    <article className={styles.question} aria-label={`Question ${number}: ${question.title}`}>
      <div className={styles.questionMain}>
        <span className={styles.questionNumber} aria-hidden="true">
          {number}
        </span>
        <CommitText
          label={`Question ${number} title`}
          hideLabel
          value={question.title}
          required
          maxLength={FORM_LIMITS.titleMaxLength}
          disabled={disabled}
          className={styles.questionTitle}
          onCommit={(title) => change({ title })}
        />
        <SelectField
          label="Question type"
          hideLabel
          value={question.type}
          options={TYPE_OPTIONS}
          disabled={disabled}
          onChange={(event) => change({ type: event.target.value as QuestionType })}
        />
      </div>
      <CommitText
        label="Description (optional)"
        hideLabel
        placeholder="Description (optional)"
        value={question.description}
        multiline
        maxLength={FORM_LIMITS.descriptionMaxLength}
        disabled={disabled}
        onCommit={(description) => change({ description })}
      />
      {isChoiceQuestionType(question.type) ? (
        <OptionsEditor questionTitle={question.title} options={question.options ?? []} disabled={disabled} onCommit={(options) => change({ options })} />
      ) : null}
      {question.type === 'LINEAR_SCALE' && question.scale ? (
        <ScaleEditor scale={question.scale} disabled={disabled} onCommit={(scale) => change({ scale })} />
      ) : null}
      <footer className={styles.questionFooter}>
        <Switch label="Required" checked={question.required} disabled={disabled} onChange={(required) => change({ required })} />
        <div className={styles.toolbar}>
          <IconButton icon="arrowUp" label="Move question up" disabled={disabled || index === 0} onClick={() => move(-1)} />
          <IconButton icon="arrowDown" label="Move question down" disabled={disabled || isLast} onClick={() => move(1)} />
          <IconButton
            icon="trash"
            label="Delete question"
            disabled={disabled}
            onClick={() => onCommit([{ type: 'REMOVE_QUESTION', questionId: question.id }])}
          />
        </div>
      </footer>
    </article>
  );
}
