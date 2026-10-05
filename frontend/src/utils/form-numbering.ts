import type { FormSchema } from '@forms-ai/contracts';

export function firstQuestionNumbers(schema: FormSchema): number[] {
  const numbers: number[] = [];
  let next = 1;
  for (const section of schema.sections) {
    numbers.push(next);
    next += section.questions.length;
  }
  return numbers;
}
