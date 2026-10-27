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

/*
 * Keywords are written the way people say them and the way speech recognition
 * writes them back: Latin acronyms ("SBI"), the same acronym in Devanagari or
 * Malayalam script, and full names. Each is normalised (below) before use.
 */
const BANKS: readonly KeywordGroup<BankId>[] = [
  {
    value: 'sbi',
    keywords: [
      'sbi',
      'एसबीआई',
      'एसबीआइ',
      'എസ്ബിഐ',
      'state bank',
      'स्टेट बैंक',
      'സ്റ്റേറ്റ് ബാങ്ക്',
    ],
  },
  { value: 'hdfc', keywords: ['hdfc', 'एचडीएफसी', 'എച്ച്ഡിഎഫ്സി'] },
  { value: 'icici', keywords: ['icici', 'आईसीआईसीआई', 'आइसीआइसीआइ', 'ഐസിഐസിഐ'] },
  {
    value: 'axis',
    // "access bank" is how English recognisers often write "Axis Bank".
    keywords: ['axis', 'access bank', 'एक्सिस', 'ऐक्सिस', 'ആക്സിസ്'],
  },
  {
    value: 'pnb',
    keywords: [
      'pnb',
      'पीएनबी',
      'പിഎൻബി',
      'punjab national',
      'पंजाब नेशनल',
      'पंजाब नैशनल',
      'പഞ്ചാബ് നാഷണൽ',
    ],
  },
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
    keywords: [
      // English: lost, stolen (also "stole"), missing, misplaced, theft, block.
      'lost',
      'stole',
      'missing',
      'misplaced',
      'theft',
      'block',
      // Hindi: खो गया / खोया, गुम, गायब, चोरी, चुरा लिया, ब्लॉक.
      'खो',
      'गुम',
      'गायब',
      'चोरी',
      'चुरा',
      'ब्लॉक',
      // Malayalam stems: നഷ്ടപ്പെട്ടു / നഷ്ടപ്പെട്ട, നഷ്ടമായി, കളഞ്ഞുപോയി,
      // കാണാതായി / കാണാനില്ല, മോഷ്ടിച്ചു / മോഷ്ടിക്കപ്പെട്ടു, മോഷണം, കളവുപോയി, ബ്ലോക്ക്.
      'നഷ്ടപ്പെ',
      'നഷ്ടമായ',
      'കളഞ്ഞ',
      'കാണാതാ',
      'കാണാനില്ല',
      'മോഷ്ടി',
      'മോഷണ',
      'കളവ',
      'ബ്ലോക്ക്',
    ],
  },
]

/** Malayalam chillu letters, written either atomically or as consonant + virama (+ ZWJ). */
const CHILLU: Readonly<Record<string, string>> = {
  '\u0d7a': '\u0d23\u0d4d', // ൺ
  '\u0d7b': '\u0d28\u0d4d', // ൻ
  '\u0d7c': '\u0d30\u0d4d', // ർ
  '\u0d7d': '\u0d32\u0d4d', // ൽ
  '\u0d7e': '\u0d33\u0d4d', // ൾ
  '\u0d7f': '\u0d15\u0d4d', // ൿ
}

/**
 * NFC first so the same Malayalam or Devanagari text compares equal however it
 * was typed. Recognisers also inject zero-width joiners into Indic words,
 * write a Devanagari nukta (फ़ for फ) or not, and pick either chillu form.
 * Keywords and transcripts both go through this.
 */
function normalise(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u200b-\u200f\u2060\ufeff]/g, '')
    .replace(/\u093c/g, '')
    .replace(/[\u0d7a-\u0d7f]/g, (chillu) => CHILLU[chillu] ?? chillu)
}

/** Keyword lists with every keyword normalised once. */
function prepare<T>(groups: readonly KeywordGroup<T>[]): readonly KeywordGroup<T>[] {
  return groups.map((group) => ({ value: group.value, keywords: group.keywords.map(normalise) }))
}

const BANK_KEYWORDS = prepare(BANKS)
const PROBLEM_KEYWORDS = prepare(PROBLEMS)

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
  const bank = find(normalised, BANK_KEYWORDS)
  const problem = find(normalised, PROBLEM_KEYWORDS)
  if (bank === null && problem === null) return null
  return { bank, problem }
}
