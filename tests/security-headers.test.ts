import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface VercelConfig {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as VercelConfig
const headers = Object.fromEntries(vercel.headers[0]?.headers.map((h) => [h.key, h.value]) ?? [])

describe('security headers', () => {
  it('vercel.json sends them on every route', () => {
    expect(vercel.headers).toHaveLength(1)
    expect(vercel.headers[0]?.source).toBe('/(.*)')
  })

  it('the CSP allows only own files, the IFSC lookup and no framing', () => {
    const csp = headers['Content-Security-Policy']
    expect(csp).toBe(
      "default-src 'self'; connect-src 'self' https://ifsc.razorpay.com; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    )
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval/)
  })

  it('sends the other headers', () => {
    expect(headers).toMatchObject({
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Permissions-Policy': 'camera=(), geolocation=(), microphone=(self)',
    })
  })
})
