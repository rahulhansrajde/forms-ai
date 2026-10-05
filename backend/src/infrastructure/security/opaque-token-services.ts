import { createHash, randomBytes } from 'node:crypto';
import type { RandomTokenGenerator, TokenDigester } from '../../domain/interfaces/security.js';

const TOKEN_BYTES = 32;

export class CryptoRandomTokenGenerator implements RandomTokenGenerator {
  generate(): string {
    return randomBytes(TOKEN_BYTES).toString('base64url');
  }
}

export class Sha256TokenDigester implements TokenDigester {
  digest(token: string): string {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }
}
