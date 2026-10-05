import type { FormSchema, VersionSource } from '@forms-ai/contracts';

export interface FormVersionProps {
  id: string;
  draftId: string;
  versionNumber: number;
  schema: FormSchema;
  source: VersionSource;
  createdAt: Date;
}

export class FormVersion {
  private constructor(private readonly props: FormVersionProps) {}

  static create(props: FormVersionProps): FormVersion {
    return new FormVersion({ ...props, schema: structuredClone(props.schema) });
  }

  static restore(props: FormVersionProps): FormVersion {
    return new FormVersion({ ...props });
  }

  get id(): string {
    return this.props.id;
  }

  get draftId(): string {
    return this.props.draftId;
  }

  get versionNumber(): number {
    return this.props.versionNumber;
  }

  get schema(): FormSchema {
    return structuredClone(this.props.schema);
  }

  get source(): VersionSource {
    return this.props.source;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
