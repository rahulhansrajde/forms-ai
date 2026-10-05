import type { DraftStatus } from '@forms-ai/contracts';
import type { FormVersion } from './form-version.js';

export interface FormDraftProps {
  id: string;
  userId: string;
  conversationId: string;
  title: string;
  currentVersionId: string | null;
  status: DraftStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class FormDraft {
  private constructor(private readonly props: FormDraftProps) {}

  static open(id: string, userId: string, conversationId: string, title: string, at: Date): FormDraft {
    return new FormDraft({
      id,
      userId,
      conversationId,
      title,
      currentVersionId: null,
      status: 'DRAFT',
      createdAt: at,
      updatedAt: at,
    });
  }

  static restore(props: FormDraftProps): FormDraft {
    return new FormDraft({ ...props });
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get conversationId(): string {
    return this.props.conversationId;
  }

  get title(): string {
    return this.props.title;
  }

  get currentVersionId(): string | null {
    return this.props.currentVersionId;
  }

  get status(): DraftStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isOwnedBy(userId: string): boolean {
    return this.props.userId === userId;
  }

  isCurrentVersion(versionId: string): boolean {
    return this.props.currentVersionId === versionId;
  }

  adoptVersion(version: FormVersion, at: Date): FormDraft {
    return new FormDraft({
      ...this.props,
      currentVersionId: version.id,
      title: version.schema.title,
      updatedAt: at,
    });
  }

  markPublished(at: Date): FormDraft {
    return new FormDraft({ ...this.props, status: 'PUBLISHED', updatedAt: at });
  }
}
