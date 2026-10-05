import type { EmailAddress } from '../value-objects/email-address.js';
import type { PersonName } from '../value-objects/person-name.js';

export interface UserProps {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export class User {
  private constructor(private readonly props: UserProps) {}

  static register(id: string, name: PersonName, email: EmailAddress, passwordHash: string, at: Date): User {
    return new User({
      id,
      firstName: name.firstName,
      lastName: name.lastName,
      email: email.value,
      passwordHash,
      createdAt: at,
      updatedAt: at,
    });
  }

  static restore(props: UserProps): User {
    return new User({ ...props });
  }

  get id(): string {
    return this.props.id;
  }

  get firstName(): string {
    return this.props.firstName;
  }

  get lastName(): string {
    return this.props.lastName;
  }

  get email(): string {
    return this.props.email;
  }

  get passwordHash(): string {
    return this.props.passwordHash;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  rename(name: PersonName, at: Date): User {
    return new User({ ...this.props, firstName: name.firstName, lastName: name.lastName, updatedAt: at });
  }

  withPasswordHash(passwordHash: string, at: Date): User {
    return new User({ ...this.props, passwordHash, updatedAt: at });
  }
}
