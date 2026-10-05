export interface SessionProps {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

export class Session {
  private constructor(private readonly props: SessionProps) {}

  static start(id: string, userId: string, tokenHash: string, at: Date, lifetimeMs: number): Session {
    return new Session({ id, userId, tokenHash, createdAt: at, expiresAt: new Date(at.getTime() + lifetimeMs) });
  }

  static restore(props: SessionProps): Session {
    return new Session({ ...props });
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get tokenHash(): string {
    return this.props.tokenHash;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  isExpiredAt(moment: Date): boolean {
    return this.props.expiresAt.getTime() <= moment.getTime();
  }
}
