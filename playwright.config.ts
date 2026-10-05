import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@responsive/ },
  ],
  webServer: [
    {
      command: 'npx tsx tests/e2e/support/e2e-server.ts',
      url: 'http://localhost:5000/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npm run build -w shared && npm run build -w frontend && npm run preview -w frontend',
      url: 'http://localhost:3000',
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
