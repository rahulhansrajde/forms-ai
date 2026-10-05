import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { TokenEncryptionService } from '../../domain/interfaces/security.js';

const CIPHER = 'aes-256-gcm';
const FORMAT_VERSION = 'v1';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export class AesGcmTokenEncryptionService implements TokenEncryptionService {
  private readonly key: Buffer;

  constructor(base64Key: string) {
    const key = Buffer.from(base64Key, 'base64');
    if (key.length !== KEY_LENGTH) {
      throw new Error('TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
    }
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(CIPHER, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [FORMAT_VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join(':');
  }

  decrypt(ciphertext: string): string {
    const [version, iv, tag, payload] = ciphertext.split(':');
    if (version !== FORMAT_VERSION || !iv || !tag || payload === undefined) {
      throw new Error('Encrypted token has an unsupported format.');
    }
    const decipher = createDecipheriv(CIPHER, this.key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(payload, 'base64')), decipher.final()]).toString('utf8');
  }
}
