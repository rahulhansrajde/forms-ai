import react from '@vitejs/plugin-react';
import type { ProxyOptions } from 'vite';
import { defineConfig } from 'vitest/config';

const apiTarget = process.env.FORMS_AI_API_URL ?? 'http://localhost:5000';
const apiPrefixes = ['/auth', '/conversations', '/drafts', '/integrations', '/google-forms', '/health'];

const proxy: Record<string, ProxyOptions> = Object.fromEntries(
  apiPrefixes.map((prefix) => [prefix, { target: apiTarget, changeOrigin: false, xfwd: true }]),
);

export default defineConfig({
  plugins: [react()],
  server: { port: 3000, strictPort: true, proxy },
  preview: { port: 3000, strictPort: true, proxy },
  build: { outDir: 'dist', sourcemap: false },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    css: false,
  },
});
