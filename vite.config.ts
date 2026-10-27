import { defineConfig } from 'vitest/config'

// Relative base so the built app can be served from any static folder or sub-path.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})