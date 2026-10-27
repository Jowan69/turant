import { describe, expect, it } from 'vitest'
import { matchIntent, type IntentMatch } from '../src/match'

interface Case {
  phrase: string
  expected: IntentMatch | null
}

/** 10 English phrases. */
const ENGLISH: Case[] = [
  {
    phrase: 'My SBI debit card is lost',
    expected: { bank: 'sbi', problem: 'debit_lost' },
  },
  {
    phrase: 'SBI card stolen',
    expected: { bank: 'sbi', problem: 'debit_lost' },
  },
  {
    phrase: 'HDFC credit card lost',
    expected: { bank: 'hdfc', problem: 'credit_lost' },
  },
  {
    phrase: 'ICICI UPI is misused',
    expected: { bank: 'icici', problem: 'upi_misuse' },
  },
  {
    phrase: 'Axis bank card blocked',
    expected: { bank: 'axis', problem: 'debit_lost' },
  },
  {
    phrase: 'Punjab National Bank card is lost',
    expected: { bank: 'pnb', problem: 'debit_lost' },
  },
  {
    phrase: 'State Bank of India credit card stolen',
    expected: { bank: 'sbi', problem: 'credit_lost' },
  },
  {
    phrase: 'HDFC money stolen',
    expected: { bank: 'hdfc', problem: 'money_taken' },
  },
  {
    phrase: 'SBI',
    expected: { bank: 'sbi', problem: null },
  },
  {
    phrase: 'What is the weather today?',
    expected: null,
  },
]

/** 10 Hindi phrases. */
const HINDI: Case[] = [
  {
    phrase: 'मेरा एसबीआई डेबिट कार्ड खो गया',
    expected: { bank: 'sbi', problem: 'debit_lost' },
  },
  {
    phrase: 'एचडीएफसी क्रेडिट कार्ड चोरी हो गया',
    expected: { bank: 'hdfc', problem: 'credit_lost' },
  },
  {
    phrase: 'आईसीआईसीआई यूपीआई ब्लॉक करो',
    expected: { bank: 'icici', problem: 'upi_misuse' },
  },
  {
    phrase: 'एक्सिस कार्ड ब्लॉक करो',
    expected: { bank: 'axis', problem: 'debit_lost' },
  },
  {
    phrase: 'पीएनबी डेबिट कार्ड चोरी हो गया',
    expected: { bank: 'pnb', problem: 'debit_lost' },
  },
  {
    phrase: 'स्टेट बैंक का क्रेडिट कार्ड खो गया',
    expected: { bank: 'sbi', problem: 'credit_lost' },
  },
  {
    phrase: 'एसबीआई',
    expected: { bank: 'sbi', problem: null },
  },
  {
    phrase: 'मेरे पैसे चोरी हो गए',
    expected: { bank: null, problem: 'money_taken' },
  },
  {
    phrase: 'आज मौसम कैसा है?',
    expected: null,
  },
  {
    phrase: 'पंजाब नेशनल बैंक का कार्ड खो गया',
    expected: { bank: 'pnb', problem: 'debit_lost' },
  },
]

/** 10 Malayalam phrases. */
const MALAYALAM: Case[] = [
  {
    phrase: 'എന്റെ എസ്ബിഐ ഡെബിറ്റ് കാർഡ് നഷ്ടപ്പെട്ടു',
    expected: { bank: 'sbi', problem: 'debit_lost' },
  },
  {
    phrase: 'എച്ച്ഡിഎഫ്സി ക്രെഡിറ്റ് കാർഡ് മോഷ്ടിച്ചു',
    expected: { bank: 'hdfc', problem: 'credit_lost' },
  },
  {
    phrase: 'ഐസിഐസിഐ യുപിഐ ബ്ലോക്ക് ചെയ്യണം',
    expected: { bank: 'icici', problem: 'upi_misuse' },
  },
  {
    phrase: 'ആക്സിസ് കാർഡ് ബ്ലോക്ക് ചെയ്യണം',
    expected: { bank: 'axis', problem: 'debit_lost' },
  },
  {
    phrase: 'പിഎൻബി കാർഡ് നഷ്ടപ്പെട്ടു',
    expected: { bank: 'pnb', problem: 'debit_lost' },
  },
  {
    phrase: 'സ്റ്റേറ്റ് ബാങ്ക് ക്രെഡിറ്റ് കാർഡ് നഷ്ടപ്പെട്ടു',
    expected: { bank: 'sbi', problem: 'credit_lost' },
  },
  {
    phrase: 'എസ്ബിഐ',
    expected: { bank: 'sbi', problem: null },
  },
  {
    phrase: 'എന്റെ പണം മോഷ്ടിച്ചു',
    expected: { bank: null, problem: 'money_taken' },
  },
  {
    phrase: 'ഇന്ന് കാലാവസ്ഥ എങ്ങനെയുണ്ട്?',
    expected: null,
  },
  {
    phrase: 'എന്റെ കാർഡ് ബ്ലോക്ക് ചെയ്യണം',
    expected: { bank: null, problem: 'debit_lost' },
  },
]

const CASES: Case[] = [...ENGLISH, ...HINDI, ...MALAYALAM]

describe('matchIntent', () => {
  it('covers 10 phrases in each language', () => {
    expect(ENGLISH).toHaveLength(10)
    expect(HINDI).toHaveLength(10)
    expect(MALAYALAM).toHaveLength(10)
  })

  it('returns null for exactly 3 of the 30 phrases', () => {
    expect(CASES.filter((testCase) => testCase.expected === null)).toHaveLength(3)
  })

  it.each(CASES)('$phrase', ({ phrase, expected }) => {
    expect(matchIntent(phrase)).toEqual(expected)
  })
})

describe('transcript normalisation', () => {
  it('matches a letter-spaced English bank acronym', () => {
    expect(matchIntent('my S B I card is stolen')).toEqual({
      bank: 'sbi',
      problem: 'debit_lost',
    })
  })

  it('matches a letter-spaced Hindi bank acronym', () => {
    expect(matchIntent('मेरा एच डी एफ सी कार्ड खो गया')).toEqual({
      bank: 'hdfc',
      problem: 'debit_lost',
    })
  })

  it('matches a letter-spaced Malayalam bank acronym', () => {
    expect(matchIntent('എന്റെ എസ് ബി ഐ കാർഡ് നഷ്ടപ്പെട്ടു')).toEqual({
      bank: 'sbi',
      problem: 'debit_lost',
    })
  })

  it('ignores zero-width characters injected by a recogniser', () => {
    expect(matchIntent('എന്റെ എസ്\u200dബി\u200dഐ കാർഡ് നഷ്ടപ്പെട്ടു')).toEqual({
      bank: 'sbi',
      problem: 'debit_lost',
    })
  })

  it('does not find a bank name inside an unrelated word', () => {
    expect(matchIntent('tax is due')).toBeNull()
  })
})
