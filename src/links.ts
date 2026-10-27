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
