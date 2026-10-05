import type { CreatedFormStatus } from '@forms-ai/contracts';

export interface CreatedGoogleFormProps {
  id: string;
  draftId: string;
  versionId: string;
  googleFormId: string;
  responderUrl: string | null;
  editUrl: string | null;
  status: CreatedFormStatus;
  createdAt: Date;
  updatedAt: Date;
}

export class CreatedGoogleForm {
  private constructor(private readonly props: CreatedGoogleFormProps) {}

  static begin(id: string, draftId: string, versionId: string, googleFormId: string, at: Date): CreatedGoogleForm {
    return new CreatedGoogleForm({
      id,
      draftId,
      versionId,
      googleFormId,
      responderUrl: null,
      editUrl: null,
      status: 'CREATING',
      createdAt: at,
      updatedAt: at,
    });
  }

  static restore(props: CreatedGoogleFormProps): CreatedGoogleForm {
    return new CreatedGoogleForm({ ...props });
  }

  get id(): string {
    return this.props.id;
  }

  get draftId(): string {
    return this.props.draftId;
  }

  get versionId(): string {
    return this.props.versionId;
  }

  get googleFormId(): string {
    return this.props.googleFormId;
  }

  get responderUrl(): string | null {
    return this.props.responderUrl;
  }

  get editUrl(): string | null {
    return this.props.editUrl;
  }

  get status(): CreatedFormStatus {
    return this.props.status;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isComplete(): boolean {
    return this.props.status === 'CREATED';
  }

  complete(responderUrl: string, editUrl: string, at: Date): CreatedGoogleForm {
    return new CreatedGoogleForm({ ...this.props, responderUrl, editUrl, status: 'CREATED', updatedAt: at });
  }
}
