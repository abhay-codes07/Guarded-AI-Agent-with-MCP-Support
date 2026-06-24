import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@gaa/shared': r('./packages/shared/src/index.ts'),
      '@gaa/policy-engine': r('./packages/policy-engine/src/index.ts'),
    },
  },
  test: {
    include: ['packages/**/test/**/*.test.ts'],
    environment: 'node',
  },
});
