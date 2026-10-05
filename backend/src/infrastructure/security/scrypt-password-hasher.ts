import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { PasswordHasher } from '../../domain/interfaces/security.js';

const ALGORITHM = 'scrypt';
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const DEFAULT_COST: ScryptOptions = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export class ScryptPasswordHasher implements PasswordHasher {
  constructor(private readonly cost: ScryptOptions = DEFAULT_COST) {}

  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const derived = await this.derive(password, salt, this.cost);
    return [ALGORITHM, this.cost.N, this.cost.r, this.cost.p, salt.toString('base64'), derived.toString('base64')].join('$');
  }

  async verify(password: string, passwordHash: string): Promise<boolean> {
    const parts = passwordHash.split('$');
    if (parts.length !== 6 || parts[0] !== ALGORITHM) {
      return false;
    }
    const [, n, r, p, saltEncoded, hashEncoded] = parts as [string, string, string, string, string, string];
    const expected = Buffer.from(hashEncoded, 'base64');
    const derived = await this.derive(password, Buffer.from(saltEncoded, 'base64'), {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: DEFAULT_COST.maxmem,
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  }

  private derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      });
    });
  }
}
