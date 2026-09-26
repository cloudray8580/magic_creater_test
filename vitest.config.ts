import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    maxWorkers: 2,
    testTimeout: 15000,
    coverage: {
      provider: 'v8',
      include: ['src/server/**/*.ts', 'src/shared/**/*.ts'],
      reporter: ['text', 'json-summary', 'json', 'lcov'],
      thresholds: { lines: 70, statements: 70, functions: 70, branches: 70 },
    },
  },
});
