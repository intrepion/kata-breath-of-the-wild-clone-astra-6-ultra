import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: { groups: [{ name: 'three', test: /node_modules\/three/ }] },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  test: { include: ['src/**/*.test.ts'] },
});
