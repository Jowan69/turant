/** Values typed by the user. Anything that is not a digit is discarded. */
export interface TemplateValues {
  last4?: string
  card?: string
}

function digitsOnly(value: string | undefined): string {
  return (value ?? '').replace(/[^0-9]/g, '')
}

/** Fill {last4} and {card} in an SMS template with digits the user typed. */
export function fillTemplate(template: string, values: TemplateValues = {}): string {
  return template
    .replace(/\{last4\}/g, digitsOnly(values.last4))
    .replace(/\{card\}/g, digitsOnly(values.card))
}

/**
 * iOS wants `sms:<to>&body=...`; everyone else wants `sms:<to>?body=...`.
 * The body is percent-encoded either way.
 */
export function buildSmsUri(to: string, body: string, userAgent: string): string {
  const encoded = encodeURIComponent(body)
  if (/iPhone|iPad|iPod/.test(userAgent)) return `sms:${to}&body=${encoded}`
  return `sms:${to}?body=${encoded}`
}

/** Dial a number; the user still has to press Call. */
export function buildTelUri(to: string): string {
  return `tel:${to}`
}

const EMAIL_PATTERN = /^[^\s@?&#,;:<>"]+@[^\s@?&#,;:<>"]+\.[^\s@?&#,;:<>".]{2,}$/

/** A plain address the user pasted, safe to put before `?` in a mailto: link. */
export function isEmailAddress(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim())
}

/**
 * Opens the user's own mail app with the letter filled in; the user presses
 * Send. An invalid or empty address leaves the To: line blank. Line breaks
 * become CRLF as RFC 6068 asks.
 */
export function buildMailtoUri(to: string, subject: string, body: string): string {
  const address = isEmailAddress(to) ? to.trim() : ''
  const encodedBody = encodeURIComponent(body.replace(/\r?\n/g, '\r\n'))
  return `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodedBody}`
}

/** A Google Maps search for the branch. Only the branch name and address go in. */
export function buildMapsUri(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}
