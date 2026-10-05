export const DEFAULT_CONVERSATION_TITLE = 'New chat';

export interface ConversationProps {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export class Conversation {
  private constructor(private readonly props: ConversationProps) {}

  static start(id: string, userId: string, title: string, at: Date): Conversation {
    return new Conversation({ id, userId, title, createdAt: at, updatedAt: at });
  }

  static restore(props: ConversationProps): Conversation {
    return new Conversation({ ...props });
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get title(): string {
    return this.props.title;
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

  hasDefaultTitle(): boolean {
    return this.props.title === DEFAULT_CONVERSATION_TITLE;
  }

  retitle(title: string, at: Date): Conversation {
    return new Conversation({ ...this.props, title, updatedAt: at });
  }

  touch(at: Date): Conversation {
    return new Conversation({ ...this.props, updatedAt: at });
  }
}
