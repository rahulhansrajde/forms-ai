import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/support/global-setup.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
