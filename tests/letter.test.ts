import { describe, expect, it } from 'vitest'
import {
  buildLetter,
  formatIsoDate,
  formatRupees,
  LETTER_FOOTER,
  type LetterFields,
} from '../src/letter'

const TODAY = new Date(2026, 9, 27) // 27 October 2026, local time

const FULL: LetterFields = {
  today: TODAY,
  name: 'Anitha Menon',
  mobile: '9800000000',
  bankName: 'State Bank of India',
  branch: 'Kakkanad',
  address: 'Civil Station Road, Kakkanad, Ernakulam, Kerala',
  last4: '4321',
  incidentDate: '2026-10-20',
  amount: '125000',
  reference: 'UPI 612345678901',
  cyberComplaint: '31510250012345',
  ownWords: 'Someone used my card at a shop I have never visited.',
}

/** Every run of `size` consecutive digits in `digits`. */
function windows(digits: string, size: number): string[] {
  const out: string[] = []
  for (let i = 0; i + size <= digits.length; i += 1) out.push(digits.slice(i, i + size))
  return out
}

describe('buildLetter with all fields', () => {
  const letter = buildLetter(FULL)
  const { bodyText, parts } = letter

  it('dates the letter today', () => {
    expect(parts.date).toBe('Date: 27 October 2026')
    expect(bodyText.startsWith('Date: 27 October 2026\n\n')).toBe(true)
  })

  it('addresses the branch manager with bank, branch and address', () => {
    expect(parts.to).toEqual([
      'The Branch Manager',
      'State Bank of India',
      'Kakkanad',
      'Civil Station Road, Kakkanad, Ernakulam, Kerala',
    ])
    expect(bodyText).toContain(
      'To,\nThe Branch Manager\nState Bank of India\nKakkanad\nCivil Station Road, Kakkanad, Ernakulam, Kerala',
    )
  })

  it('has the subject with the incident date', () => {
    expect(letter.subject).toBe(
      'Complaint about unauthorised transaction / lost card on 20 October 2026',
    )
    expect(bodyText).toContain(`Subject: ${letter.subject}`)
  })

  it('states the facts from the fields', () => {
    expect(bodyText).toContain('card or account ending 4321')
    expect(bodyText).toContain('This happened on 20 October 2026')
    expect(bodyText).toContain('Rs. 1,25,000')
    expect(bodyText).toContain('UPI 612345678901')
    expect(bodyText).toContain('The card has been blocked')
    expect(bodyText).toContain('1930')
    expect(bodyText).toContain('31510250012345')
    expect(bodyText).toContain('investigate')
    expect(bodyText).toContain('reverse the unauthorised debit')
    expect(bodyText).toContain('reply to me in writing')
  })

  it("quotes the user's words under 'In my own words:'", () => {
    expect(bodyText).toContain(`In my own words:\n${FULL.ownWords}`)
  })

  it('closes with Yours faithfully, name and mobile, then the RBI footer', () => {
    expect(bodyText).toContain('Yours faithfully,\nAnitha Menon\nMobile: 9800000000')
    expect(bodyText.endsWith(LETTER_FOOTER)).toBe(true)
    expect(LETTER_FOOTER).toBe(
      'If the bank does not reply within 30 days, or the reply is unsatisfactory, complain to the RBI Ombudsman at https://cms.rbi.org.in',
    )
  })

  it('keeps the sections in letter order', () => {
    const order = [
      'Date:',
      'To,',
      'Subject:',
      'Dear Sir or Madam,',
      'ending 4321',
      'blocked',
      'In my own words:',
      'Yours faithfully,',
      'RBI Ombudsman',
    ].map((marker) => bodyText.indexOf(marker))
    expect(order.every((index) => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('is pure: same fields, same letter', () => {
    expect(buildLetter(FULL)).toEqual(letter)
  })
})

describe('buildLetter with optional fields missing', () => {
  const minimal: LetterFields = {
    today: TODAY,
    name: 'Ravi Kumar',
    bankName: 'HDFC',
    last4: '9876',
    incidentDate: '2026-10-01',
    amount: '5000',
    ownWords: 'My card was stolen on the bus.',
  }
  const { bodyText, parts } = buildLetter(minimal)

  it('leaves out branch and address lines', () => {
    expect(parts.to).toEqual(['The Branch Manager', 'HDFC'])
  })

  it('leaves out the reference, the 1930 line and the mobile', () => {
    expect(bodyText).not.toContain('reference number')
    expect(bodyText).not.toContain('1930')
    expect(bodyText).not.toContain('Mobile:')
    expect(bodyText).not.toContain('undefined')
    expect(bodyText).not.toContain('null')
  })

  it('still states the facts and asks for action', () => {
    expect(bodyText).toContain('ending 9876')
    expect(bodyText).toContain('Rs. 5,000')
    expect(bodyText).toContain('The card has been blocked')
    expect(bodyText).toContain('reply to me in writing')
    expect(bodyText).toContain('Yours faithfully,\nRavi Kumar')
  })

  it('omits the own-words block when nothing was written', () => {
    const letter = buildLetter({ ...minimal, ownWords: '   ' })
    expect(letter.bodyText).not.toContain('In my own words:')
    expect(letter.parts.ownWords).toBe('')
  })

  it('leaves a blank for missing card digits', () => {
    expect(buildLetter({ ...minimal, last4: '' }).bodyText).toContain('ending ____')
  })
})

describe('the user’s own words', () => {
  it('keeps Malayalam text exactly as typed', () => {
    const malayalam =
      'എന്റെ എസ്ബിഐ കാർഡ് നഷ്ടപ്പെട്ടു.\nഅക്കൗണ്ടിൽ നിന്ന് ₹5,000 പോയി.  ആരോ ഉപയോഗിച്ചു!'
    const { bodyText, parts } = buildLetter({ ...FULL, ownWords: malayalam })
    expect(parts.ownWords).toBe(malayalam)
    expect(bodyText).toContain(`In my own words:\n${malayalam}\n\nYours faithfully,`)
  })

  it('keeps the same text in decomposed (NFD) form without normalising it', () => {
    const nfd = 'കാർഡ് നഷ്ടപ്പെട്ടു'.normalize('NFD')
    expect(buildLetter({ ...FULL, ownWords: nfd }).parts.ownWords).toBe(nfd)
  })

  it('keeps Hindi text exactly as typed', () => {
    const hindi = 'मेरा कार्ड खो गया और ₹2,000 कट गए।'
    expect(buildLetter({ ...FULL, ownWords: hindi }).bodyText).toContain(hindi)
  })
})

describe('card digits', () => {
  const fullCard = '4111111111111111'
  const mixedCard = '5274 9312 0846 7735'

  // None of these share a 5-digit run with the other numbers in FULL.
  it.each([fullCard, mixedCard, '6029384756102938', '9876'])(
    'never puts more than 4 consecutive digits of last4=%s into the output',
    (typed) => {
      const letter = buildLetter({ ...FULL, last4: typed })
      const output = [letter.subject, letter.bodyText, JSON.stringify(letter.parts)].join('\n')
      const digits = typed.replace(/[^0-9]/g, '')
      for (const run of windows(digits, 5)) {
        expect(output, run).not.toContain(run)
      }
    },
  )

  it('uses the last 4 digits when more are typed', () => {
    expect(buildLetter({ ...FULL, last4: mixedCard }).bodyText).toContain('ending 7735')
  })

  it('never places the 4 digits next to another digit', () => {
    const { bodyText } = buildLetter({ ...FULL, last4: fullCard })
    expect(bodyText).toMatch(/ending 1111(?!\d)/)
    expect(bodyText).not.toMatch(/\d1111|1111\d/)
  })
})

describe('formatting helpers', () => {
  it('formats rupees with Indian grouping', () => {
    expect(formatRupees('5000')).toBe('5,000')
    expect(formatRupees('125000')).toBe('1,25,000')
    expect(formatRupees('12345678.5')).toBe('1,23,45,678.5')
    expect(formatRupees('999')).toBe('999')
  })

  it('formats ISO dates in words', () => {
    expect(formatIsoDate('2026-01-05')).toBe('5 January 2026')
    expect(formatIsoDate('yesterday')).toBe('yesterday')
  })
})
