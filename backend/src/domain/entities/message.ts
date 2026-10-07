import type { ChatIntent, MessageRole } from '@forms-ai/contracts';

export interface PublishedFormReference {
  createdFormId: string;
  title: string;
  versionNumber: number;
  responderUrl: string;
  editUrl: string;
}

export interface MessageProps {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  intent: ChatIntent | null;
  publishedForm: PublishedFormReference | null;
  createdAt: Date;
}

export class Message {
  private constructor(private readonly props: MessageProps) {}

  static fromUser(id: string, conversationId: string, content: string, at: Date): Message {
    return new Message({ id, conversationId, role: 'USER', content, intent: null, publishedForm: null, createdAt: at });
  }

  static fromAssistant(id: string, conversationId: string, content: string, intent: ChatIntent, at: Date): Message {
    return new Message({ id, conversationId, role: 'ASSISTANT', content, intent, publishedForm: null, createdAt: at });
  }

  static publicationNotice(
    id: string,
    conversationId: string,
    content: string,
    publishedForm: PublishedFormReference | null,
    at: Date,
  ): Message {
    return new Message({ id, conversationId, role: 'ASSISTANT', content, intent: null, publishedForm, createdAt: at });
  }

  static restore(props: MessageProps): Message {
    return new Message({ ...props });
  }

  get id(): string {
    return this.props.id;
  }

  get conversationId(): string {
    return this.props.conversationId;
  }

  get role(): MessageRole {
    return this.props.role;
  }

  get content(): string {
    return this.props.content;
  }

  get intent(): ChatIntent | null {
    return this.props.intent;
  }

  get publishedForm(): PublishedFormReference | null {
    return this.props.publishedForm;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  classify(intent: ChatIntent): Message {
    return new Message({ ...this.props, intent });
  }
}
