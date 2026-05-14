import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@lib': resolve(__dirname, 'lib') },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html'],
      reportsDirectory: './coverage',
      include: ['lib/**/*.js', 'babylon/**/*.ts'],
      exclude: ['babylon/main.ts']
    }
  }
});
