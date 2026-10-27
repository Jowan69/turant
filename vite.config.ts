import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

interface VercelConfig {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}

/**
 * The security headers from vercel.json (Content-Security-Policy and others),
 * so `vite preview` checks the built app against the same rules as production.
 */
function securityHeaders(): Record<string, string> {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig
  return Object.fromEntries(config.headers.flatMap((rule) => rule.headers.map((h) => [h.key, h.value])))
}

// Relative base so the built app can be served from any folder or sub-path.
export default defineConfig({
  base: './',
  // Not the dev server: Vite's hot reload injects inline styles that the CSP blocks.
  preview: { headers: securityHeaders() },
  build: {
    target: 'es2022',
    outDir: 'dist',
    // No preload polyfill: it carries a network call, and the app keeps only
    // the IFSC lookup (checked by scripts/validate.mjs).
    modulePreload: { polyfill: false },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
})
