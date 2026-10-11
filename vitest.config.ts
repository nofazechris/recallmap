import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    env: {
      PGLITE_DIR: 'memory',
      AUTH_SECRET: 'test-secret-test-secret-test-secret',
      LOCAL_STORAGE_DIR: '.data/test-uploads',
      NODE_ENV: 'test',
    },
    fileParallelism: false,
  },
});
