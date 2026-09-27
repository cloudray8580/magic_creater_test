import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import react from '@vitejs/plugin-react';
export default defineConfig({
  test: {
    maxWorkers: 2,
    testTimeout: 15000,
    projects: [
      { test: { name: 'node-unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' } },
      {
        plugins: [react()],
        optimizeDeps: { include: ['react', 'react-dom/client', 'phaser'] },
        test: {
          name: 'browser-unit',
          include: ['tests/browser/**/*.test.ts'],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      reporter: ['text', 'json-summary', 'json', 'lcov'],
      // Gates below aggregate the original server/shared scope and all changed source.
      // Including existing client files in reports must not redefine the baseline gate.
    },
  },
});
