/**
 * Branch lookup by IFSC. This is the only network call in Turant
 * (scripts/validate.mjs fails if any other file makes one). It sends only the
 * IFSC the user typed, never card or account digits.
 */

export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/

/** Upper-case and drop spaces, so "sbin 000 1234" can still match. */
export function normaliseIfsc(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

export function isIfsc(value: string): boolean {
  return IFSC_PATTERN.test(value)
}

export function ifscLookupUrl(ifsc: string): string {
  return `https://ifsc.razorpay.com/${encodeURIComponent(ifsc)}`
}

export interface BranchInfo {
  /** Full bank name, when the service returns one. */
  bank: string
  branch: string
  address: string
}

type FetchLike = (url: string, init?: { signal?: AbortSignal }) => Promise<{
  ok: boolean
  json(): Promise<unknown>
}>

function text(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
}

/**
 * Returns the branch name and address, or null on any error: bad IFSC, not
 * found, network failure, abort, or a response without BRANCH and ADDRESS.
 */
export async function lookupIfsc(
  ifsc: string,
  signal?: AbortSignal,
  fetchFn: FetchLike = (url, init) => fetch(url, init),
): Promise<BranchInfo | null> {
  if (!isIfsc(ifsc)) return null
  try {
    const response = await fetchFn(ifscLookupUrl(ifsc), { signal })
    if (!response.ok) return null
    const data = (await response.json()) as Record<string, unknown> | null
    const branch = text(data?.BRANCH)
    const address = text(data?.ADDRESS)
    if (!branch || !address) return null
    return { bank: text(data?.BANK), branch, address }
  } catch {
    return null
  }
}
