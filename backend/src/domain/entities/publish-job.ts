import type { PublishJobStatus, PublishStep } from '@forms-ai/contracts';

export interface PublishJobProps {
  id: string;
  draftId: string;
  versionId: string;
  status: PublishJobStatus;
  currentStep: PublishStep;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class PublishJob {
  private constructor(private readonly props: PublishJobProps) {}

  static start(id: string, draftId: string, versionId: string, at: Date): PublishJob {
    return new PublishJob({
      id,
      draftId,
      versionId,
      status: 'RUNNING',
      currentStep: 'LOAD_DRAFT',
      error: null,
      createdAt: at,
      updatedAt: at,
    });
  }

  static restore(props: PublishJobProps): PublishJob {
    return new PublishJob({ ...props });
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

  get status(): PublishJobStatus {
    return this.props.status;
  }

  get currentStep(): PublishStep {
    return this.props.currentStep;
  }

  get error(): string | null {
    return this.props.error;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  isRunning(): boolean {
    return this.props.status === 'RUNNING';
  }

  advanceTo(step: PublishStep, at: Date): PublishJob {
    return new PublishJob({ ...this.props, currentStep: step, updatedAt: at });
  }

  succeed(at: Date): PublishJob {
    return new PublishJob({ ...this.props, status: 'SUCCEEDED', currentStep: 'COMPLETED', error: null, updatedAt: at });
  }

  fail(error: string, at: Date): PublishJob {
    return new PublishJob({ ...this.props, status: 'FAILED', error, updatedAt: at });
  }
}
