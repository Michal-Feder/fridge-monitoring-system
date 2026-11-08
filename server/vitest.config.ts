import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Stage A has no tests yet; later stages must keep this green, not empty.
    passWithNoTests: true,
  },
});
