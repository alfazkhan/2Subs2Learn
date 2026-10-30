import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      '~': fileURLToPath(new URL('./', import.meta.url)),
      '#imports': fileURLToPath(new URL('./src/test/wxt-imports.ts', import.meta.url)),
    },
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    css: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
    },
    include: [
      'src/**/*.{test,spec}.{js,mjs,cjs,ts,mts}',
      'test/**/*.{test,spec}.{js,mjs,cjs,ts,mts}'
    ],
  },
});