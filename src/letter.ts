/**
 * The complaint letter, always in English so any branch can read it. The
 * user's own words are kept exactly as typed, in any language.
 *
 * buildLetter is pure: today's date is passed in, nothing is read from the
 * DOM, the clock or storage, so the same fields always give the same letter.
 */

export interface LetterFields {
  /** The date printed on the letter. Passed in to keep the function pure. */
  today: Date
  name: string
  mobile?: string
  /** Full bank name for the address block. */
  bankName: string
  branch?: string
  address?: string
  /** Only the last 4 digits are ever used, whatever is passed. Empty leaves a blank. */
  last4: string
  /** Date of the incident as yyyy-mm-dd (from <input type="date">). */
  incidentDate: string
  /** Amount in rupees, digits with an optional decimal part. */
  amount: string
  reference?: string
  /** National cybercrime helpline (1930) complaint number. */
  cyberComplaint?: string
  /** What happened, in the user's own words and language. */
  ownWords: string
}

export interface LetterParts {
  date: string
  /** "To," then one address line per entry. */
  to: string[]
  subject: string
  salutation: string
  paragraphs: string[]
  ownWordsHeading: string
  /** Exactly as typed. Empty when the user wrote nothing. */
  ownWords: string
  closing: string
  /** Name, then "Mobile: …" when given. */
  signOff: string[]
  footer: string
}

export interface Letter {
  subject: string
  bodyText: string
  parts: LetterParts
}

/** Labels for the print-only signature and bank-receipt boxes. Letter text, so English. */
export const PRINT_LABELS = {
  signature: 'Signature',
  name: 'Name: ______________________________',
  date: 'Date: ______________________________',
  bankUse: 'For bank use only',
  receivedBy: 'Received by: ______________________',
  bankSignature: 'Signature: ______________________',
  bankDate: 'Date: ______________________',
  stamp: 'Branch stamp',
} as const

export const LETTER_FOOTER =
  'If the bank does not reply within 30 days, or the reply is unsatisfactory, complain to the RBI Ombudsman at https://cms.rbi.org.in'

/** Printed where a value is missing, so it can be written in by hand. */
const BLANK = '____'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** Single-line fields: trim and collapse any run of whitespace, newlines included. */
function line(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

/** "27 October 2026". */
export function formatDate(date: Date): string {
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** "2026-10-20" -> "20 October 2026". Anything else is kept as typed. */
export function formatIsoDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return line(value)
  const month = MONTHS[Number(match[2]) - 1]
  if (!month) return line(value)
  return `${Number(match[3])} ${month} ${match[1]}`
}

/** "125000" -> "1,25,000" (Indian grouping). Non-numeric input is kept as typed. */
export function formatRupees(value: string): string {
  const cleaned = value.replace(/[,\s]/g, '')
  const match = /^(\d+)(\.\d{1,2})?$/.exec(cleaned)
  if (!match) return line(value)

  const whole = match[1].replace(/^0+(?=\d)/, '')
  const lastThree = whole.slice(-3)
  const rest = whole.slice(0, -3)
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+$)/g, ',')},${lastThree}` : lastThree
  return grouped + (match[2] ?? '')
}

/** Never more than 4 digits, taken from the end, whatever was passed in. */
export function lastFourDigits(value: string): string {
  return value.replace(/[^0-9]/g, '').slice(-4)
}

export function buildLetter(fields: LetterFields): Letter {
  const last4 = lastFourDigits(fields.last4) || BLANK
  const incident = formatIsoDate(fields.incidentDate) || BLANK
  const amount = formatRupees(fields.amount) || BLANK
  const reference = line(fields.reference)
  const cyber = line(fields.cyberComplaint)
  const name = line(fields.name)
  const mobile = line(fields.mobile)

  const to = [
    'The Branch Manager',
    line(fields.bankName),
    line(fields.branch),
    line(fields.address),
  ].filter((entry) => entry !== '')

  const subject = `Complaint about unauthorised transaction / lost card on ${incident}`

  const paragraphs = [
    `I am writing to report an unauthorised transaction on, or the loss of, my card or account ending ${last4}. ` +
      `This happened on ${incident}. The amount involved is Rs. ${amount}.`,
  ]
  if (reference) paragraphs.push(`The transaction or UPI reference number is ${reference}.`)
  paragraphs.push('The card has been blocked to stop any further misuse.')
  if (cyber) {
    paragraphs.push(
      `I have also reported this on the cybercrime helpline 1930. The complaint number is ${cyber}.`,
    )
  }
  paragraphs.push(
    'I request you to investigate this, reverse the unauthorised debit to my account, and reply to me in writing.',
  )

  // Kept byte for byte: no trimming, no normalisation, any script.
  const ownWords = fields.ownWords.trim() === '' ? '' : fields.ownWords

  const signOff = [name || BLANK]
  if (mobile) signOff.push(`Mobile: ${mobile}`)

  const parts: LetterParts = {
    date: `Date: ${formatDate(fields.today)}`,
    to,
    subject: `Subject: ${subject}`,
    salutation: 'Dear Sir or Madam,',
    paragraphs,
    ownWordsHeading: 'In my own words:',
    ownWords,
    closing: 'Yours faithfully,',
    signOff,
    footer: LETTER_FOOTER,
  }

  const sections = [
    parts.date,
    ['To,', ...parts.to].join('\n'),
    parts.subject,
    parts.salutation,
    ...parts.paragraphs,
  ]
  if (ownWords) sections.push(`${parts.ownWordsHeading}\n${ownWords}`)
  sections.push([parts.closing, ...parts.signOff].join('\n'), parts.footer)

  return { subject, bodyText: sections.join('\n\n'), parts }
}
