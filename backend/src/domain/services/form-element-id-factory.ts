import type { IdentifierGenerator } from '../interfaces/system.js';

export class FormElementIdFactory {
  constructor(private readonly identifiers: IdentifierGenerator) {}

  nextSectionId(): string {
    return `section_${this.shortIdentifier()}`;
  }

  nextQuestionId(): string {
    return `question_${this.shortIdentifier()}`;
  }

  private shortIdentifier(): string {
    return this.identifiers.generate().replace(/-/g, '');
  }
}
