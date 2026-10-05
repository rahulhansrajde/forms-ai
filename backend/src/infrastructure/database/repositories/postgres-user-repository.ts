import { User } from '../../../domain/entities/user.js';
import type { UserRepository } from '../../../domain/interfaces/repositories.js';
import { ConflictError } from '../../../shared/errors/application-errors.js';
import type { Database } from '../connection/database.js';
import { UniqueConstraintViolation } from '../connection/database-error-translator.js';

interface UserRow extends Record<string, unknown> {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}

const USER_COLUMNS = 'id, first_name, last_name, email, password_hash, created_at, updated_at';

export class PostgresUserRepository implements UserRepository {
  constructor(private readonly database: Database) {}

  async insert(user: User): Promise<void> {
    try {
      await this.database.query(
        `INSERT INTO users (${USER_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [user.id, user.firstName, user.lastName, user.email, user.passwordHash, user.createdAt, user.updatedAt],
      );
    } catch (error) {
      if (error instanceof UniqueConstraintViolation) {
        throw new ConflictError('EMAIL_ALREADY_REGISTERED', 'An account with this email already exists.');
      }
      throw error;
    }
  }

  async update(user: User): Promise<void> {
    await this.database.query(
      'UPDATE users SET first_name = $2, last_name = $3, password_hash = $4, updated_at = $5 WHERE id = $1',
      [user.id, user.firstName, user.lastName, user.passwordHash, user.updatedAt],
    );
  }

  async findById(id: string): Promise<User | null> {
    const rows = await this.database.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await this.database.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [email]);
    return rows[0] ? this.toEntity(rows[0]) : null;
  }

  private toEntity(row: UserRow): User {
    return User.restore({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      email: row.email,
      passwordHash: row.password_hash,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
}
