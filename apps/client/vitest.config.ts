import { defineConfig } from 'vitest/config';

// Unit tests for the client's pure modules (the Playwright specs in e2e/ run separately, with `pnpm e2e`).
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
