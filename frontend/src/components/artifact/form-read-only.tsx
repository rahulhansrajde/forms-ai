import { QUESTION_TYPE_LABELS, type FormQuestion, type FormSchema } from '@forms-ai/contracts';
import { firstQuestionNumbers } from '../../utils/form-numbering';
import styles from './form-read-only.module.css';

function QuestionSummary({ question, number }: { question: FormQuestion; number: number }) {
  return (
    <li className={styles.question}>
      <div className={styles.questionTitle}>
        <span>
          {number}. {question.title}
        </span>
        {question.required ? <span className={styles.required}>Required</span> : null}
      </div>
      <span className={styles.meta}>{QUESTION_TYPE_LABELS[question.type]}</span>
      {question.description ? <p className={styles.description}>{question.description}</p> : null}
      {question.options ? (
        <ul className={styles.options}>
          {question.options.map((option) => (
            <li key={option}>{option}</li>
          ))}
        </ul>
      ) : null}
      {question.scale ? (
        <p className={styles.meta}>
          {question.scale.min} {question.scale.minLabel} to {question.scale.max} {question.scale.maxLabel}
        </p>
      ) : null}
    </li>
  );
}

export function FormReadOnly({ schema }: { schema: FormSchema }) {
  const firstNumbers = firstQuestionNumbers(schema);
  return (
    <div className={styles.form}>
      <h3 className={styles.title}>{schema.title}</h3>
      {schema.description ? <p className={styles.description}>{schema.description}</p> : null}
      {schema.sections.map((section, sectionIndex) => (
        <section key={section.id} className={styles.section} aria-label={section.title || 'Section'}>
          {section.title ? <h4 className={styles.sectionTitle}>{section.title}</h4> : null}
          <ol className={styles.questions}>
            {section.questions.map((question, questionIndex) => (
              <QuestionSummary key={question.id} question={question} number={(firstNumbers[sectionIndex] ?? 1) + questionIndex} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
