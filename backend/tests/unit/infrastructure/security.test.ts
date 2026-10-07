import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ConfigurationLoader } from '../../../src/infrastructure/configuration/app-config.js';
import { JsonConsoleLogger } from '../../../src/infrastructure/logging/json-console-logger.js';
import { AesGcmTokenEncryptionService } from '../../../src/infrastructure/security/aes-gcm-token-encryption-service.js';
import { ScryptPasswordHasher } from '../../../src/infrastructure/security/scrypt-password-hasher.js';

describe('ScryptPasswordHasher', () => {
  it('hashes with a random salt and verifies in constant time', async () => {
    const hasher = new ScryptPasswordHasher({ N: 1024, r: 8, p: 1 });
    const first = await hasher.hash('Secret123');
    const second = await hasher.hash('Secret123');
    expect(first).not.toBe(second);
    expect(await hasher.verify('Secret123', first)).toBe(true);
    expect(await hasher.verify('Secret124', first)).toBe(false);
    expect(await hasher.verify('Secret123', 'plaintext')).toBe(false);
  });
});

describe('AesGcmTokenEncryptionService', () => {
  const key = randomBytes(32).toString('base64');

  it('round-trips tokens and detects tampering', () => {
    const service = new AesGcmTokenEncryptionService(key);
    const encrypted = service.encrypt('ya29.token');
    expect(encrypted).not.toContain('ya29');
    expect(service.decrypt(encrypted)).toBe('ya29.token');
    const parts = encrypted.split(':');
    parts[3] = Buffer.from('forged').toString('base64');
    expect(() => service.decrypt(parts.join(':'))).toThrow();
    expect(() => new AesGcmTokenEncryptionService(key).decrypt('nonsense')).toThrow();
  });

  it('rejects keys of the wrong size', () => {
    expect(() => new AesGcmTokenEncryptionService(randomBytes(16).toString('base64'))).toThrow('32-byte');
  });
});

describe('ConfigurationLoader', () => {
  it('requires secrets from the environment and derives safe defaults', () => {
    expect(() => new ConfigurationLoader().load({})).toThrow('DATABASE_URL');
    const config = new ConfigurationLoader().load({ DATABASE_URL: 'pglite://memory', TOKEN_ENCRYPTION_KEY: 'k' });
    expect(config).toMatchObject({ port: 5000, frontendOrigin: 'http://localhost:3000', secureCookies: false });
    expect(config.google).toMatchObject({ configured: false, redirectUri: 'http://localhost:5000/auth/google/callback' });
    expect(config.ai.provider).toBe('rule-based');
    expect(new ConfigurationLoader().load({ DATABASE_URL: 'x', TOKEN_ENCRYPTION_KEY: 'k', NODE_ENV: 'production' }).secureCookies).toBe(true);
  });

  it('selects Bedrock with the default region and model when a key is present', () => {
    const config = new ConfigurationLoader().load({ DATABASE_URL: 'x', TOKEN_ENCRYPTION_KEY: 'k', BEDROCK_API_KEY: 'placeholder' });
    expect(config.ai).toMatchObject({ provider: 'bedrock', bedrockRegion: 'ap-south-1', bedrockModels: ['zai.glm-5'] });
    const custom = new ConfigurationLoader().load({
      DATABASE_URL: 'x',
      TOKEN_ENCRYPTION_KEY: 'k',
      BEDROCK_REGION: 'us-east-1',
      BEDROCK_MODELS: ' a , b ,',
    });
    expect(custom.ai).toMatchObject({ provider: 'rule-based', bedrockRegion: 'us-east-1', bedrockModels: ['a', 'b'] });
    expect(() => new ConfigurationLoader().load({ DATABASE_URL: 'x', TOKEN_ENCRYPTION_KEY: 'k', BEDROCK_REGION: 'evil.example.com/x' })).toThrow(
      'BEDROCK_REGION',
    );
  });
});

describe('JsonConsoleLogger', () => {
  it('redacts secrets from metadata', () => {
    const written: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
      written.push(chunk);
      return true;
    }) as typeof process.stdout.write;
    try {
      new JsonConsoleLogger().info('event', { accessToken: 'ya29', nested: { password: 'p', safe: 'ok' }, apiKey: 'AQ.secret' });
    } finally {
      process.stdout.write = original;
    }
    expect(written.join('')).not.toMatch(/ya29|"p"|AQ\.secret/);
    expect(written.join('')).toContain('"safe":"ok"');
  });
});
