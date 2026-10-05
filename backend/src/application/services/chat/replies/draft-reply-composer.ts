import { countQuestions, type FormSchema } from '@forms-ai/contracts';
import { pluralize, quoted } from './text-formatting.js';

const PREVIEW_HINT = 'Your draft has been updated. Show Preview to review it.';

export class DraftReplyComposer {
  created(schema: FormSchema): string {
    return [
      `I've created a draft for ${quoted(schema.title)} with ${this.describeSize(schema)}.`,
      'Show Preview to review and edit it. Nothing is published yet: when it looks right, use Create GForm in the preview to create the actual Google Form.',
    ].join('\n\n');
  }

  regenerated(schema: FormSchema, versionNumber: number): string {
    return [
      `I've regenerated ${quoted(schema.title)} as version ${versionNumber} with ${this.describeSize(schema)}.`,
      `The previous version is still in the version history. ${PREVIEW_HINT}`,
    ].join('\n\n');
  }

  modified(changes: readonly string[], versionNumber: number): string {
    return [`Here's what I changed:`, changes.map((change) => `- ${change}`).join('\n'), `${PREVIEW_HINT} (version ${versionNumber})`].join(
      '\n\n',
    );
  }

  unchanged(): string {
    return "Your draft already matches that, so I didn't create a new version.";
  }

  suggestionsAdded(titles: readonly string[], schema: FormSchema, createdDraft: boolean): string {
    const added = titles.map((title) => `- ${title}`).join('\n');
    if (createdDraft) {
      return [
        `I've created a draft for ${quoted(schema.title)} with your questions plus these suggestions:`,
        added,
        'Show Preview to review it. Use Create GForm in the preview when you are ready to publish.',
      ].join('\n\n');
    }
    return [`I've added ${pluralize(titles.length, 'question')} to your form:`, added, PREVIEW_HINT].join('\n\n');
  }

  publishFromChat(hasDraft: boolean): string {
    if (!hasDraft) {
      return "There's no draft to publish yet. Describe the form you need, and once the draft looks right you can publish it with the Create GForm button in the preview.";
    }
    return "I can't create Google Forms from chat. Open Show Preview, review the draft, and click Create GForm. That button is the only way a real Google Form gets created.";
  }

  private describeSize(schema: FormSchema): string {
    const questions = pluralize(countQuestions(schema), 'question');
    return schema.sections.length > 1 ? `${questions} across ${pluralize(schema.sections.length, 'section')}` : questions;
  }
}
