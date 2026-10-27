import { describe, expect, it, vi } from 'vitest'
import { ifscLookupUrl, isIfsc, lookupIfsc, normaliseIfsc } from '../src/ifsc'

/** A fake fetch: no network is used in these tests. */
function fakeFetch(ok: boolean, body: unknown) {
  return vi.fn(async (_url: string, _init?: { signal?: AbortSignal }) => ({
    ok,
    json: async () => body,
  }))
}

describe('IFSC format', () => {
  it.each(['ABCD0123456', 'ABCD0XYZ123'])('accepts %s', (code) => {
    expect(isIfsc(code)).toBe(true)
  })

  it.each(['', 'abcd0123456', 'ABCD1123456', 'ABC00123456', 'ABCD012345', 'ABCD01234567'])(
    'rejects %s',
    (code) => {
      expect(isIfsc(code)).toBe(false)
    },
  )

  it('normalises case and spaces', () => {
    expect(normaliseIfsc(' abcd 0123 456 ')).toBe('ABCD0123456')
  })

  it('builds the lookup URL from the IFSC only', () => {
    expect(ifscLookupUrl('ABCD0123456')).toBe('https://ifsc.razorpay.com/ABCD0123456')
  })
})

describe('lookupIfsc', () => {
  it('returns branch and address from BRANCH and ADDRESS', async () => {
    const fetchFn = fakeFetch(true, {
      BANK: 'Example Bank',
      BRANCH: 'MAIN ROAD',
      ADDRESS: '1 MAIN ROAD,  SOMETOWN',
    })
    await expect(lookupIfsc('ABCD0123456', undefined, fetchFn)).resolves.toEqual({
      bank: 'Example Bank',
      branch: 'MAIN ROAD',
      address: '1 MAIN ROAD, SOMETOWN',
    })
    expect(fetchFn).toHaveBeenCalledWith('https://ifsc.razorpay.com/ABCD0123456', {
      signal: undefined,
    })
  })

  it('does not call the network for an invalid IFSC', async () => {
    const fetchFn = fakeFetch(true, {})
    await expect(lookupIfsc('NOT-AN-IFSC', undefined, fetchFn)).resolves.toBeNull()
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('returns null when not found', async () => {
    await expect(lookupIfsc('ABCD0123456', undefined, fakeFetch(false, 'Not Found'))).resolves.toBeNull()
  })

  it('returns null when BRANCH or ADDRESS is missing', async () => {
    await expect(
      lookupIfsc('ABCD0123456', undefined, fakeFetch(true, { BRANCH: 'X' })),
    ).resolves.toBeNull()
  })

  it('returns null on a network error or abort', async () => {
    const failing = vi.fn(async () => {
      throw new Error('offline')
    })
    await expect(lookupIfsc('ABCD0123456', undefined, failing)).resolves.toBeNull()
  })
})
