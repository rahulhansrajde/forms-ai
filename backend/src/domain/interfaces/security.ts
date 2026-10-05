export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, passwordHash: string): Promise<boolean>;
}

export interface TokenEncryptionService {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

export interface RandomTokenGenerator {
  generate(): string;
}

export interface TokenDigester {
  digest(token: string): string;
}
