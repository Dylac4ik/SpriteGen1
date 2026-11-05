import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@backend': resolve(__dirname, 'src/backend'),
      '@renderer': resolve(__dirname, 'src/renderer/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/core/**/*.test.ts', 'tests/backend/**/*.test.ts', 'tests/main/**/*.test.ts', 'tests/renderer/**/*.test.ts', 'tests/mobile/**/*.test.ts'],
  },
});
