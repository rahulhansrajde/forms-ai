import { FORM_LIMITS, type FormOperation, type FormSchema, type FormSection } from '@forms-ai/contracts';
import { firstQuestionNumbers } from '../../utils/form-numbering';
import { Button } from '../ui/button';
import { Icon } from '../ui/icon';
import { IconButton } from '../ui/icon-button';
import { CommitText } from './commit-text';
import styles from './form-editor.module.css';
import { QuestionEditor } from './question-editor';

interface FormEditorProps {
  schema: FormSchema;
  disabled: boolean;
  onCommit(operations: FormOperation[]): void;
}

export function FormEditor({ schema, disabled, onCommit }: FormEditorProps) {
  const showSections = schema.sections.length > 1;
  const firstNumbers = firstQuestionNumbers(schema);

  return (
    <div className={styles.editor}>
      <div className={styles.formHeader}>
        <CommitText
          label="Form title"
          value={schema.title}
          required
          maxLength={FORM_LIMITS.titleMaxLength}
          disabled={disabled}
          className={styles.formTitle}
          onCommit={(title) => onCommit([{ type: 'UPDATE_TITLE', title }])}
        />
        <CommitText
          label="Form description"
          value={schema.description}
          multiline
          placeholder="Add a description"
          maxLength={FORM_LIMITS.descriptionMaxLength}
          disabled={disabled}
          onCommit={(description) => onCommit([{ type: 'UPDATE_DESCRIPTION', description }])}
        />
      </div>
      {schema.sections.map((section, index) => (
        <SectionEditor
          key={section.id}
          section={section}
          index={index}
          sectionCount={schema.sections.length}
          firstQuestionNumber={firstNumbers[index] ?? 1}
          showChrome={showSections}
          disabled={disabled}
          onCommit={onCommit}
        />
      ))}
      <Button
        variant="secondary"
        block
        icon={<Icon name="plus" size={18} />}
        disabled={disabled || schema.sections.length >= FORM_LIMITS.maxSections}
        onClick={() => onCommit([{ type: 'ADD_SECTION', title: 'New section' }])}
      >
        Add section
      </Button>
    </div>
  );
}

interface SectionEditorProps {
  section: FormSection;
  index: number;
  sectionCount: number;
  firstQuestionNumber: number;
  showChrome: boolean;
  disabled: boolean;
  onCommit(operations: FormOperation[]): void;
}

function SectionEditor({ section, index, sectionCount, firstQuestionNumber, showChrome, disabled, onCommit }: SectionEditorProps) {
  const label = section.title || `Section ${index + 1}`;
  return (
    <section className={showChrome ? styles.section : styles.plainSection} aria-label={label}>
      {showChrome ? (
        <div className={styles.sectionHeader}>
          <div className={styles.sectionHeading}>
            <span className={styles.sectionBadge}>
              Section {index + 1} of {sectionCount}
            </span>
            <div className={styles.toolbar}>
              <IconButton
                icon="arrowUp"
                label="Move section up"
                disabled={disabled || index === 0}
                onClick={() => onCommit([{ type: 'REORDER_SECTION', sectionId: section.id, index: index - 1 }])}
              />
              <IconButton
                icon="arrowDown"
                label="Move section down"
                disabled={disabled || index === sectionCount - 1}
                onClick={() => onCommit([{ type: 'REORDER_SECTION', sectionId: section.id, index: index + 1 }])}
              />
              <IconButton
                icon="trash"
                label="Delete section and its questions"
                disabled={disabled}
                onClick={() => onCommit([{ type: 'REMOVE_SECTION', sectionId: section.id }])}
              />
            </div>
          </div>
          <CommitText
            label="Section title"
            hideLabel
            placeholder="Untitled section"
            value={section.title}
            maxLength={FORM_LIMITS.titleMaxLength}
            disabled={disabled}
            onCommit={(title) => onCommit([{ type: 'UPDATE_SECTION', sectionId: section.id, title }])}
          />
          <CommitText
            label="Section description"
            hideLabel
            placeholder="Section description (optional)"
            value={section.description}
            multiline
            maxLength={FORM_LIMITS.descriptionMaxLength}
            disabled={disabled}
            onCommit={(description) => onCommit([{ type: 'UPDATE_SECTION', sectionId: section.id, description }])}
          />
        </div>
      ) : null}
      <div className={styles.questions}>
        {section.questions.length === 0 ? <p className={styles.emptySection}>No questions in this section yet.</p> : null}
        {section.questions.map((question, questionIndex) => (
          <QuestionEditor
            key={question.id}
            question={question}
            number={firstQuestionNumber + questionIndex}
            index={questionIndex}
            sectionId={section.id}
            isLast={questionIndex === section.questions.length - 1}
            disabled={disabled}
            onCommit={onCommit}
          />
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        icon={<Icon name="plus" size={16} />}
        disabled={disabled}
        onClick={() =>
          onCommit([{ type: 'ADD_QUESTION', sectionId: section.id, question: { type: 'SHORT_ANSWER', title: 'Untitled question' } }])
        }
      >
        Add question
      </Button>
    </section>
  );
}
