/**
 * Turns what the user said into one of the entries Turant already has.
 * Nothing here reads digits or invents a bank: it only picks from these lists,
 * and src/main.ts routes only to ids present in data/actions.json.
 */

export type BankId = 'sbi' | 'hdfc' | 'icici' | 'axis' | 'pnb'

export type Problem = 'debit_lost' | 'credit_lost' | 'upi_misuse' | 'money_taken'

export interface IntentMatch {
  /** The bank named in the speech, or null when only the problem was heard. */
  bank: BankId | null
  /** The problem named in the speech, or null when only the bank was heard. */
  problem: Problem | null
}

interface KeywordGroup<T> {
  value: T
  keywords: readonly string[]
}

const BANKS: readonly KeywordGroup<BankId>[] = [
  {
    value: 'sbi',
    keywords: ['sbi', 'एसबीआई', 'എസ്ബിഐ', 'state bank', 'स्टेट बैंक', 'സ്റ്റേറ്റ് ബാങ്ക്'],
  },
  { value: 'hdfc', keywords: ['hdfc', 'एचडीएफसी', 'എച്ച്ഡിഎഫ്സി'] },
  { value: 'icici', keywords: ['icici', 'आईसीआईसीआई', 'ഐസിഐസിഐ'] },
  { value: 'axis', keywords: ['axis', 'एक्सिस', 'ആക്സിസ്'] },
  { value: 'pnb', keywords: ['pnb', 'पीएनबी', 'പിഎൻബി', 'punjab national', 'पंजाब नेशनल'] },
]

/** Checked in this order, so "credit card lost" is a credit card and fraud wins over UPI. */
const PROBLEMS: readonly KeywordGroup<Problem>[] = [
  {
    value: 'money_taken',
    keywords: ['money', 'fraud', 'पैसे', 'धोखा', 'ठगी', 'പണം', 'തട്ടിപ്പ്'],
  },
  { value: 'upi_misuse', keywords: ['upi', 'यूपीआई', 'യുപിഐ'] },
  { value: 'credit_lost', keywords: ['credit', 'क्रेडिट', 'ക്രെഡിറ്റ്'] },
  {
    value: 'debit_lost',
    keywords: ['lost', 'stolen', 'block', 'खो', 'चोरी', 'ब्लॉक', 'നഷ്ടപ്പെട്ടു', 'മോഷ്ടിച്ചു', 'ബ്ലോക്ക്'],
  },
]

/**
 * NFC first so the same Malayalam or Devanagari text compares equal however it
 * was typed. Speech engines also inject zero-width joiners into Indic words.
 */
function normalise(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
}

const LOOSE_SEPARATOR = '[\\s\\p{P}\\p{Cf}]*'
const loosePatterns = new Map<string, RegExp>()

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Recognisers often spell bank names out letter by letter: "S B I",
 * "एच डी एफ सी", "എസ് ബി ഐ". A single-word keyword may therefore have
 * separators between its characters. Requiring a letter boundary on both ends
 * keeps the loose match from firing inside another word ("tax is" is not Axis).
 */
function loosePattern(keyword: string): RegExp {
  let pattern = loosePatterns.get(keyword)
  if (!pattern) {
    const parts = Array.from(keyword).map(escapeRegExp)
    pattern = new RegExp(
      `(?<![\\p{L}\\p{N}])${parts.join(LOOSE_SEPARATOR)}(?![\\p{L}\\p{N}])`,
      'u',
    )
    loosePatterns.set(keyword, pattern)
  }
  return pattern
}

function matches(text: string, keyword: string): boolean {
  if (text.includes(keyword)) return true
  if (keyword.includes(' ')) return false
  return loosePattern(keyword).test(text)
}

function find<T>(text: string, groups: readonly KeywordGroup<T>[]): T | null {
  for (const group of groups) {
    if (group.keywords.some((keyword) => matches(text, keyword))) return group.value
  }
  return null
}

/** The first matching bank and problem, each independent. Null when neither is heard. */
export function matchIntent(text: string): IntentMatch | null {
  const normalised = normalise(text)
  const bank = find(normalised, BANKS)
  const problem = find(normalised, PROBLEMS)
  if (bank === null && problem === null) return null
  return { bank, problem }
}
