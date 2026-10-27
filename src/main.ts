import actionsData from '../data/actions.json'
import grievanceData from '../data/grievance.json'
import en from './i18n/en.json'
import hi from './i18n/hi.json'
import ml from './i18n/ml.json'
import { isIfsc, lookupIfsc, normaliseIfsc } from './ifsc'
import { buildLetter, PRINT_LABELS, type Letter } from './letter'
import {
  buildMailtoUri,
  buildMapsUri,
  buildSmsUri,
  buildTelUri,
  fillTemplate,
  isEmailAddress,
} from './links'
import { type BankId, type Problem } from './match'
import {
  getSpeechRecognition,
  SPEECH_LOCALES,
  speechErrorKey,
  transcriptOf,
  type SpeechRecognitionLike,
} from './speech'
import { resolveSpeechRoute } from './voice'

/** Languages Turant supports. Every UI string lives in src/i18n/<lang>.json. */
export type Lang = 'en' | 'hi' | 'ml'

export const LANGS: readonly Lang[] = ['en', 'hi', 'ml']

/** Endonyms: language names are shown in their own script, so they are not translated. */
const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  hi: 'हिंदी',
  ml: 'മലയാളം',
}

const STRINGS: Record<Lang, Record<string, string>> = { en, hi, ml }

/** Look up a UI string, falling back to English and then to the key itself. */
export function t(lang: Lang, key: string): string {
  return STRINGS[lang][key] ?? STRINGS.en[key] ?? key
}

type AnyBank = BankId | 'any'
type Channel = 'sms' | 'call'
type Needs = 'last4' | 'full_card' | 'none'

interface Action {
  id: string
  bank: AnyBank
  problem: Problem
  channel: Channel
  to: string
  sms_template: string | null
  needs: Needs
  find_on_page: string
  source_url: string
  verified_by: string
  verified_on: string
  note_en: string
}

/** data/actions.json is imported here so Vite inlines it at build time. */
const actions = actionsData as unknown as Action[]

const BANK_IDS: readonly BankId[] = ['sbi', 'hdfc', 'icici', 'axis', 'pnb']

/** User-supplied URL shown next to the stolen-money action. */
const CYBERCRIME_URL = 'https://cybercrime.gov.in'

type IconName = 'bank' | 'house' | 'card' | 'diamond' | 'shield' | 'alert' | 'mic'

const ICON_PATHS: Record<IconName, readonly string[]> = {
  bank: [
    'M6 20 L24 8 L42 20 Z',
    'M9 21 V39',
    'M17 21 V39',
    'M31 21 V39',
    'M39 21 V39',
    'M6 43 H42',
  ],
  house: ['M6 23 L24 7 L42 23', 'M11 23 V42 H37 V23', 'M20 42 V31 H28 V42'],
  card: ['M6 14 H42 V35 H6 Z', 'M6 21 H42', 'M11 28 H19'],
  diamond: ['M24 6 L42 24 L24 42 L6 24 Z', 'M24 17 L31 24 L24 31 L17 24 Z'],
  shield: [
    'M24 6 L40 12 V24 C40 34 33 40 24 44 C15 40 8 34 8 24 V12 Z',
    'M17 24 L22 29 L31 18',
  ],
  alert: ['M24 7 L44 41 H4 Z', 'M24 18 V29', 'M24 35 V36'],
  mic: [
    'M24 5 C20.7 5 18 7.7 18 11 V24 C18 27.3 20.7 30 24 30 C27.3 30 30 27.3 30 24 V11 C30 7.7 27.3 5 24 5 Z',
    'M11 22 V24 C11 31.2 16.8 37 24 37 C31.2 37 37 31.2 37 24 V22',
    'M24 37 V44',
    'M16 44 H32',
  ],
}

const BANK_TILES: readonly { id: BankId; icon: IconName }[] = [
  { id: 'sbi', icon: 'bank' },
  { id: 'hdfc', icon: 'house' },
  { id: 'icici', icon: 'card' },
  { id: 'axis', icon: 'diamond' },
  { id: 'pnb', icon: 'shield' },
]

function isLang(value: string | null): value is Lang {
  return value === 'en' || value === 'hi' || value === 'ml'
}

function isBankId(value: string): value is BankId {
  return (BANK_IDS as readonly string[]).includes(value)
}

/** The only thing Turant stores: the language the user chose. */
const LANG_STORAGE_KEY = 'turant.lang'

function readStoredLang(): Lang | null {
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY)
    return isLang(stored) ? stored : null
  } catch {
    // Storage can be blocked (private mode, embedded browser): fall back below.
    return null
  }
}

function storeLang(value: Lang): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, value)
  } catch {
    // The switch still works for this visit when storage is unavailable.
  }
}

/** Prefer an explicit ?lang= (links and tests), then the stored choice, then the device. */
function detectLang(): Lang {
  const requested = new URLSearchParams(window.location.search).get('lang')
  if (isLang(requested)) return requested

  const stored = readStoredLang()
  if (stored) return stored

  const device = navigator.language.toLowerCase()
  if (device.startsWith('hi')) return 'hi'
  if (device.startsWith('ml')) return 'ml'
  return 'en'
}

let lang: Lang = detectLang()

/**
 * Language the microphone listens in. It follows the UI language until the
 * user picks a different spoken language, so a user can keep the interface in
 * English and still speak Hindi or Malayalam.
 */
let voiceLang: Lang = lang

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** Simple line icons drawn in code: no logos, no icon library. */
function makeIcon(name: IconName): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 48 48')
  svg.setAttribute('class', 'icon')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2.5')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('focusable', 'false')

  for (const d of ICON_PATHS[name]) {
    const path = document.createElementNS(ns, 'path')
    path.setAttribute('d', d)
    svg.append(path)
  }
  return svg
}

type Route =
  | { name: 'home' }
  | { name: 'bank'; bank: BankId }
  | { name: 'action'; id: string }
  | { name: 'complaint'; id: string }
  | { name: 'letter'; id: string }

function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '')
  const [kind, value, sub] = path.split('/')

  if (kind === 'bank' && value && isBankId(value)) return { name: 'bank', bank: value }
  if (kind === 'action' && value) return { name: 'action', id: value }
  if (kind === 'complaint' && value) {
    return sub === 'letter' ? { name: 'letter', id: value } : { name: 'complaint', id: value }
  }
  return { name: 'home' }
}

function backLink(href: string): HTMLAnchorElement {
  const link = el('a', 'back', t(lang, 'nav.back'))
  link.href = href
  return link
}

function renderLanguageSwitch(): HTMLElement {
  const section = el('section', 'lang-section')
  section.append(el('h2', 'lang-label', t(lang, 'app.langLabel')))

  const buttons = el('div', 'langs')
  for (const id of LANGS) {
    const button = el('button', undefined, LANG_NAMES[id])
    button.type = 'button'
    button.setAttribute('aria-pressed', String(id === lang))
    button.addEventListener('click', () => {
      lang = id
      voiceLang = id
      storeLang(id)
      render()
    })
    buttons.append(button)
  }
  section.append(buttons)
  return section
}

/** The tile for stolen money opens the matching entry directly. */
function moneyStolenAction(): Action | undefined {
  return actions.find((action) => action.id === 'any-money') ??
    actions.find((action) => action.problem === 'money_taken')
}

/* Voice input uses the browser's own SpeechRecognition (src/speech.ts). Each
   tap creates a new recognition and calls start() straight from the click
   handler, with nothing awaited first: browsers only open the microphone
   from a user gesture. Tap again while listening to stop early. */

type MicPhase = 'idle' | 'listening'

interface VoiceSession {
  cancel(): void
}

/** Only one recognition runs at a time; a new render cancels it. */
let activeVoice: VoiceSession | null = null

function stopActiveVoice(): void {
  const active = activeVoice
  activeVoice = null
  active?.cancel()
}

/**
 * What the speech service heard, shown on the screen voice opened so a wrong
 * screen can be told apart from a wrong transcript. Digits are masked: card
 * numbers never stay on screen. Dropped when the user moves on.
 */
let heard: { text: string; hash: string } | null = null

function maskDigits(text: string): string {
  return text.replace(/\p{Nd}/gu, '•')
}

function heardLine(text: string, tag: 'p' | 'span' = 'p'): HTMLElement {
  const line = el(tag, 'heard')
  line.append(el('span', 'heard-label', `${t(lang, 'voice.heard')} `), el('q', undefined, text))
  return line
}

/** Route speech only to ids that already exist in data/actions.json. */
function routeFromSpeech(transcript: string, status: HTMLElement): void {
  const route = resolveSpeechRoute(transcript, actions)
  const shown = maskDigits(transcript)

  if (route.kind === 'action' || route.kind === 'bank') {
    const target = route.kind === 'action' ? `#/action/${route.id}` : `#/bank/${route.bank}`
    heard = { text: shown, hash: target }
    window.location.hash = target
    return
  }

  status.replaceChildren(heardLine(shown, 'span'), t(lang, 'voice.pleaseTapBank'))
}

/** Why voice cannot be offered on this page, as an i18n key, or null if it can. */
function voiceBlocker(): string | null {
  // Browsers only give the microphone to https:// pages (and localhost).
  if (window.isSecureContext === false) return 'voice.needsHttps'
  if (!getSpeechRecognition()) return 'voice.unsupported'
  return null
}

/** A SpeechRecognition error code as a message in the current language. */
function speechErrorMessage(code: string): string {
  return t(lang, speechErrorKey(code)).replace('{code}', code)
}

interface MicOptions {
  /** Language the user speaks, read when the mic is tapped. */
  speechLang: () => Lang
  onTranscript: (transcript: string) => void
}

/**
 * Wire a mic button and its status line to speech recognition. Shared by the
 * home screen (routing by voice) and the complaint form (dictation). Returns
 * a function that cancels this mic's recognition, if one is running.
 */
function attachMic(
  button: HTMLButtonElement,
  label: HTMLElement,
  status: HTMLElement,
  options: MicOptions,
): () => void {
  let phase: MicPhase = 'idle'
  let session: VoiceSession | null = null
  let recognition: SpeechRecognitionLike | null = null

  const setPhase = (next: MicPhase, message = ''): void => {
    phase = next
    const listening = next === 'listening'
    button.setAttribute('aria-pressed', String(listening))
    button.classList.toggle('is-recording', listening)
    label.textContent = t(lang, listening ? 'voice.listening' : 'voice.mic')
    status.textContent = message
  }

  button.addEventListener('click', () => {
    if (phase === 'listening') {
      // Stop early; whatever was heard still arrives before onend.
      try {
        recognition?.stop()
      } catch {
        // Already ended.
      }
      return
    }

    stopActiveVoice()
    const SR = getSpeechRecognition()
    if (!SR) {
      setPhase('idle', t(lang, 'voice.unsupported'))
      return
    }

    // A new instance on every tap: a reused one can be stuck in a bad state.
    const rec = new SR()
    rec.lang = SPEECH_LOCALES[options.speechLang()]
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.continuous = false

    let done = false
    let transcript = ''
    let errorText = ''

    const release = (): void => {
      done = true
      if (activeVoice === own) activeVoice = null
      if (session === own) session = null
      if (recognition === rec) recognition = null
    }

    const own: VoiceSession = {
      cancel: () => {
        const mine = session === own
        release()
        try {
          rec.abort()
        } catch {
          // Already ended.
        }
        if (mine) setPhase('idle')
      },
    }

    rec.onresult = (event) => {
      if (done) return
      const text = transcriptOf(event)
      if (text) transcript = transcript ? `${transcript} ${text}` : text
    }
    rec.onerror = (event) => {
      if (done) return
      errorText = speechErrorMessage(event.error)
      status.textContent = errorText
    }
    rec.onend = () => {
      if (done) return
      release()
      if (transcript) {
        setPhase('idle')
        options.onTranscript(transcript)
        return
      }
      setPhase('idle', errorText || t(lang, 'voice.errNoSpeech'))
    }

    activeVoice = own
    session = own
    recognition = rec
    try {
      rec.start()
    } catch (error) {
      release()
      const code = error instanceof Error && error.name ? error.name : 'start-failed'
      setPhase('idle', speechErrorMessage(code))
      return
    }
    setPhase('listening')
  })

  setPhase('idle')
  return () => {
    if (session && activeVoice === session) stopActiveVoice()
  }
}

/** Tells the user where their voice goes before they tap the mic. */
function privacyNote(): HTMLElement {
  return el('p', 'voice-privacy', t(lang, 'voice.privacy'))
}

function renderVoice(): HTMLElement | null {
  const section = el('section', 'voice')

  const blocked = voiceBlocker()
  if (blocked) {
    section.append(el('p', 'voice-status', t(lang, blocked)))
    return section
  }

  const button = el('button', 'mic-button')
  button.type = 'button'
  const label = el('span', 'mic-label')
  button.append(makeIcon('mic'), label)

  const status = el('p', 'voice-status')
  status.setAttribute('aria-live', 'polite')

  const cancel = attachMic(button, label, status, {
    speechLang: () => voiceLang,
    onTranscript: (transcript) => routeFromSpeech(transcript, status),
  })

  /* The recognizer is told which language is being spoken, and that is not
     always the UI language: the interface can stay in English while the user
     speaks Malayalam or Hindi. */
  const langSection = el('div', 'voice-lang-section')
  langSection.append(el('p', 'voice-lang-label', t(lang, 'voice.speakIn')))

  const langChoices = el('div', 'voice-langs')
  langChoices.setAttribute('role', 'group')
  langChoices.setAttribute('aria-label', t(lang, 'voice.speakIn'))

  const chips: HTMLButtonElement[] = []
  for (const id of LANGS) {
    const chip = el('button', undefined, LANG_NAMES[id])
    chip.type = 'button'
    chip.dataset.lang = id
    chip.setAttribute('aria-pressed', String(id === voiceLang))
    chip.addEventListener('click', () => {
      voiceLang = id
      for (const other of chips) {
        other.setAttribute('aria-pressed', String(other.dataset.lang === voiceLang))
      }
      // Listening in the old language is stopped and its result dropped.
      cancel()
    })
    chips.push(chip)
    langChoices.append(chip)
  }
  langSection.append(langChoices)

  section.append(button, status, privacyNote(), langSection)
  return section
}

function renderHome(app: HTMLElement): void {
  app.append(el('h1', undefined, t(lang, 'app.title')))
  app.append(el('p', 'tagline', t(lang, 'app.tagline')))

  const voice = renderVoice()
  if (voice) app.append(voice)

  const section = el('section', 'bank-picker')
  section.append(el('h2', 'section-label', t(lang, 'home.pickBank')))

  const tiles = el('nav', 'tiles')
  tiles.setAttribute('aria-label', t(lang, 'home.pickBank'))

  for (const bank of BANK_TILES) {
    const tile = el('a', 'tile')
    tile.href = `#/bank/${bank.id}`
    tile.append(makeIcon(bank.icon), el('span', 'tile-label', t(lang, `bank.${bank.id}`)))
    tiles.append(tile)
  }

  const stolen = moneyStolenAction()
  if (stolen) {
    const tile = el('a', 'tile danger')
    tile.href = `#/action/${stolen.id}`
    tile.append(makeIcon('alert'), el('span', 'tile-label', t(lang, 'home.moneyStolen')))
    tiles.append(tile)
  }

  section.append(tiles)
  app.append(section)
}

/** Problems the chosen bank actually has in data/actions.json, in data order. */
function problemsForBank(bank: BankId): Problem[] {
  const seen = new Set<Problem>()
  const problems: Problem[] = []

  for (const action of actions) {
    if (action.bank !== bank || seen.has(action.problem)) continue
    seen.add(action.problem)
    problems.push(action.problem)
  }
  return problems
}

function renderBank(app: HTMLElement, bank: BankId): void {
  app.append(backLink('#/'))
  app.append(el('h1', undefined, t(lang, `bank.${bank}`)))
  app.append(el('h2', 'section-label', t(lang, 'bank.problemsHeading')))

  const problems = problemsForBank(bank)
  if (problems.length === 0) {
    app.append(el('p', 'empty', t(lang, 'bank.empty')))
    return
  }

  const choices = el('nav', 'choices')
  choices.setAttribute('aria-label', t(lang, 'bank.problemsHeading'))

  for (const problem of problems) {
    const action = actions.find((entry) => entry.bank === bank && entry.problem === problem)
    if (!action) continue

    const link = el('a', 'problem-button', t(lang, `problem.${problem}`))
    link.href = `#/action/${action.id}`
    choices.append(link)
  }
  app.append(choices)
}

function renderAction(app: HTMLElement, id: string): void {
  const action = actions.find((entry) => entry.id === id)
  if (!action) {
    app.append(backLink('#/'))
    app.append(el('h1', undefined, t(lang, 'action.notFound')))
    return
  }

  app.append(backLink(action.bank === 'any' ? '#/' : `#/bank/${action.bank}`))
  app.append(el('h1', undefined, t(lang, `problem.${action.problem}`)))
  if (action.bank !== 'any') {
    app.append(el('p', 'subtitle', t(lang, `bank.${action.bank}`)))
  }

  const card = el('section', 'action-card')
  const preview = el('p', 'action-text')
  preview.setAttribute('aria-live', 'polite')

  /** Only ever held in this closure: never storage, the hash, or the console. */
  let typed = ''

  if (action.channel === 'sms') {
    const template = action.sms_template ?? ''
    const needs = action.needs

    const body = (): string =>
      fillTemplate(
        template,
        needs === 'last4' ? { last4: typed } : needs === 'full_card' ? { card: typed } : {},
      )

    const isComplete = (): boolean => {
      if (needs === 'last4') return typed.length === 4
      // Card numbers run 12 to 19 digits; the input caps the raw value at 19 characters.
      if (needs === 'full_card') return typed.length >= 12
      return true
    }

    const send = el('a', 'action-button', t(lang, 'action.openSms'))
    send.setAttribute('role', 'button')

    const refresh = (): void => {
      if (isComplete()) {
        send.href = buildSmsUri(action.to, body(), navigator.userAgent)
        send.removeAttribute('aria-disabled')
        send.classList.remove('is-disabled')
        send.tabIndex = 0
        preview.textContent = body()
      } else {
        send.removeAttribute('href')
        send.setAttribute('aria-disabled', 'true')
        send.classList.add('is-disabled')
        send.tabIndex = -1
        preview.textContent = template
      }
    }

    if (needs !== 'none') {
      const label = el(
        'label',
        'field-label',
        t(lang, needs === 'last4' ? 'action.last4Label' : 'action.cardLabel'),
      )
      label.htmlFor = 'card-digits'

      const input = el('input', 'digits')
      input.id = 'card-digits'
      input.type = 'text'
      input.inputMode = 'numeric'
      input.autocomplete = 'off'
      input.maxLength = needs === 'last4' ? 4 : 19
      input.pattern = '[0-9]*'
      input.addEventListener('input', () => {
        const digits = input.value.replace(/[^0-9]/g, '')
        if (input.value !== digits) input.value = digits
        typed = digits
        refresh()
      })

      card.append(label, input)
    }

    card.append(send, preview)
    refresh()
  } else {
    const call = el('a', 'action-button', t(lang, 'action.callNow'))
    call.href = buildTelUri(action.to)
    preview.textContent = action.to
    card.append(call, preview)
  }

  if (action.note_en.trim() !== '') {
    card.append(el('p', 'note', action.note_en))
  }

  if (action.problem === 'money_taken') {
    const cyber = el('a', 'action-button secondary', t(lang, 'action.cybercrime'))
    cyber.href = CYBERCRIME_URL
    card.append(cyber)
  }

  const complaint = el('a', 'action-button secondary', t(lang, 'action.writeComplaint'))
  complaint.href = `#/complaint/${action.id}`
  card.append(complaint)

  const source = el('p', 'source')
  const sourceLink = el('a', undefined, t(lang, 'action.officialSource'))
  sourceLink.href = action.source_url
  sourceLink.target = '_blank'
  sourceLink.rel = 'noopener noreferrer'
  source.append(
    sourceLink,
    el('span', 'verified', `${t(lang, 'action.verified')} ${action.verified_on}`),
  )
  card.append(source)

  // A bank can offer more than one channel for the same problem (e.g. PNB debit).
  const siblings = actions.filter(
    (entry) =>
      entry.id !== action.id && entry.bank === action.bank && entry.problem === action.problem,
  )
  if (siblings.length > 0) {
    const other = el('div', 'other-ways')
    other.append(el('h2', 'section-label', t(lang, 'action.otherWays')))

    for (const sibling of siblings) {
      const link = el(
        'a',
        'problem-button',
        `${t(lang, `problem.${sibling.problem}`)} — ${t(lang, `channel.${sibling.channel}`)}`,
      )
      link.href = `#/action/${sibling.id}`
      other.append(link)
    }
    card.append(other)
  }

  card.append(el('p', 'check-line', t(lang, 'action.checkLine')))
  app.append(card)
}

/* Complaint flow. The draft is held in this module only: never storage, the
   URL or the console. It is dropped as soon as the user leaves the flow. */

type DraftField =
  | 'name'
  | 'mobile'
  | 'ifsc'
  | 'branch'
  | 'address'
  | 'last4'
  | 'incidentDate'
  | 'amount'
  | 'reference'
  | 'cyberComplaint'
  | 'branchEmail'
  | 'ownWords'

interface ComplaintDraft extends Record<DraftField, string> {
  /** The action the user came from. */
  origin: string
  bank: BankId | ''
  /** State of the branch lookup for the IFSC in `lookedUp`. */
  lookup: 'idle' | 'loading' | 'found' | 'failed'
  lookedUp: string
  /** Full bank name returned by the IFSC lookup. */
  lookupBank: string
}

let draft: ComplaintDraft | null = null
let lookupController: AbortController | null = null
/** Redraws the branch fields of the form on screen, if it is showing. */
let refreshBranch: (() => void) | null = null

const LOOKUP_TIMEOUT_MS = 10_000

function abortLookup(): void {
  lookupController?.abort()
  lookupController = null
}

function clearDraft(): void {
  abortLookup()
  draft = null
}

function newDraft(origin: string, bank: BankId | ''): ComplaintDraft {
  return {
    origin,
    bank,
    name: '',
    mobile: '',
    ifsc: '',
    branch: '',
    address: '',
    last4: '',
    incidentDate: '',
    amount: '',
    reference: '',
    cyberComplaint: '',
    branchEmail: '',
    ownWords: '',
    lookup: 'idle',
    lookedUp: '',
    lookupBank: '',
  }
}

interface GrievanceBank {
  id: string
  name: string
}

const grievanceBanks = (grievanceData as unknown as { banks: GrievanceBank[] }).banks

/** IFSC lookup first, then data/grievance.json, then the English label. Never invented. */
function bankFullName(d: ComplaintDraft): string {
  if (d.lookup === 'found' && d.lookupBank) return d.lookupBank
  if (!d.bank) return ''
  return grievanceBanks.find((entry) => entry.id === d.bank)?.name ?? t('en', `bank.${d.bank}`)
}

function todayIso(): string {
  const now = new Date()
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

type DraftErrors = Partial<Record<DraftField | 'bank', string>>

function draftErrors(d: ComplaintDraft): DraftErrors {
  const errors: DraftErrors = {}
  if (d.name.trim() === '') errors.name = 'complaint.required'
  if (!d.bank) errors.bank = 'complaint.required'
  if (!/^\d{4}$/.test(d.last4)) errors.last4 = 'complaint.last4Invalid'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.incidentDate)) errors.incidentDate = 'complaint.required'
  if (!/^\d+(\.\d{1,2})?$/.test(d.amount) || Number(d.amount) <= 0) {
    errors.amount = 'complaint.required'
  }
  if (d.branchEmail.trim() !== '' && !isEmailAddress(d.branchEmail)) {
    errors.branchEmail = 'complaint.emailInvalid'
  }
  if (d.ownWords.trim() === '') errors.ownWords = 'complaint.required'
  return errors
}

interface FieldSpec {
  key: DraftField
  labelKey: string
  optional?: boolean
  hintKey?: string
  type?: string
  inputMode?: string
  maxLength?: number
  /** Cleans what was typed, e.g. digits only. */
  filter?: (value: string) => string
}

interface FieldParts {
  wrap: HTMLElement
  control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  error: HTMLElement
}

function fieldLabel(id: string, labelKey: string, optional = false): HTMLLabelElement {
  const label = el('label', 'field-label', t(lang, labelKey))
  label.htmlFor = id
  if (optional) label.append(el('span', 'optional', ` (${t(lang, 'complaint.optional')})`))
  return label
}

/** Label, optional hint, the control, and an error line, wired for screen readers. */
function wrapField(
  control: FieldParts['control'],
  labelKey: string,
  optional?: boolean,
  hintKey?: string,
): FieldParts {
  const wrap = el('div', 'field')
  const error = el('p', 'field-error')
  error.id = `${control.id}-error`
  const describedBy = [error.id]

  wrap.append(fieldLabel(control.id, labelKey, optional))
  if (hintKey) {
    const hint = el('p', 'field-hint', t(lang, hintKey))
    hint.id = `${control.id}-hint`
    describedBy.unshift(hint.id)
    wrap.append(hint)
  }
  control.setAttribute('aria-describedby', describedBy.join(' '))
  wrap.append(control, error)
  return { wrap, control, error }
}

function textField(d: ComplaintDraft, spec: FieldSpec): FieldParts {
  const input = el('input', 'text-input')
  input.id = `complaint-${spec.key}`
  input.name = spec.key
  input.type = spec.type ?? 'text'
  input.autocomplete = 'off'
  if (spec.inputMode) input.inputMode = spec.inputMode
  if (spec.maxLength) input.maxLength = spec.maxLength
  input.value = d[spec.key]
  input.addEventListener('input', () => {
    const cleaned = spec.filter ? spec.filter(input.value) : input.value
    if (cleaned !== input.value) input.value = cleaned
    d[spec.key] = cleaned
  })
  return wrapField(input, spec.labelKey, spec.optional, spec.hintKey)
}

function textArea(d: ComplaintDraft, key: DraftField, labelKey: string, rows: number): FieldParts {
  const area = el('textarea', 'text-input')
  area.id = `complaint-${key}`
  area.name = key
  area.rows = rows
  area.autocomplete = 'off'
  area.value = d[key]
  area.addEventListener('input', () => {
    d[key] = area.value
  })
  return wrapField(area, labelKey)
}

const digitsOnly = (value: string): string => value.replace(/[^0-9]/g, '')

/** Rupees: digits and at most one decimal point with two decimals. */
function amountFilter(value: string): string {
  const [whole = '', ...rest] = value.replace(/[^0-9.]/g, '').split('.')
  return rest.length === 0 ? whole : `${whole}.${rest.join('').slice(0, 2)}`
}

function startLookup(d: ComplaintDraft, ifsc: string): void {
  abortLookup()
  const controller = new AbortController()
  lookupController = controller
  d.lookup = 'loading'
  d.lookedUp = ifsc
  const timer = window.setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS)

  void lookupIfsc(ifsc, controller.signal).then((info) => {
    window.clearTimeout(timer)
    if (lookupController !== controller || draft !== d) return
    lookupController = null
    if (info) {
      d.lookup = 'found'
      d.branch = info.branch
      d.address = info.address
      d.lookupBank = info.bank
    } else {
      d.lookup = 'failed'
    }
    refreshBranch?.()
  })
}

function renderComplaint(app: HTMLElement, id: string): void {
  const action = actions.find((entry) => entry.id === id)
  if (!action) {
    app.append(backLink('#/'))
    app.append(el('h1', undefined, t(lang, 'action.notFound')))
    return
  }

  if (!draft) draft = newDraft(id, action.bank === 'any' ? '' : action.bank)
  const d = draft

  app.append(backLink(`#/action/${id}`))
  app.append(el('h1', undefined, t(lang, 'complaint.title')))
  // Shown above the form. The form has no field for any of these, and never will.
  app.append(el('p', 'safety', t(lang, 'complaint.safety')))
  app.append(el('p', 'subtitle', t(lang, 'complaint.intro')))

  const form = el('form', 'complaint-form')
  form.noValidate = true
  form.autocomplete = 'off'
  const fields = new Map<DraftField | 'bank', FieldParts>()
  const add = (key: DraftField | 'bank', parts: FieldParts): void => {
    fields.set(key, parts)
    form.append(parts.wrap)
  }

  add('name', textField(d, { key: 'name', labelKey: 'complaint.name', maxLength: 100 }))
  add(
    'mobile',
    textField(d, {
      key: 'mobile',
      labelKey: 'complaint.mobile',
      optional: true,
      type: 'tel',
      inputMode: 'tel',
      maxLength: 16,
      filter: (value) => value.replace(/[^0-9+ ]/g, ''),
    }),
  )

  // Bank: fixed when the user came from a bank's card, otherwise chosen here.
  if (action.bank !== 'any') {
    const fixed = el('div', 'field')
    fixed.append(
      el('p', 'field-label', t(lang, 'complaint.bank')),
      el('p', 'fixed-value', t(lang, `bank.${action.bank}`)),
    )
    form.append(fixed)
  } else {
    const select = el('select', 'text-input')
    select.id = 'complaint-bank'
    select.name = 'bank'
    const placeholder = el('option', undefined, t(lang, 'complaint.chooseBank'))
    placeholder.value = ''
    select.append(placeholder)
    for (const bank of BANK_IDS) {
      const option = el('option', undefined, t(lang, `bank.${bank}`))
      option.value = bank
      select.append(option)
    }
    select.value = d.bank
    select.addEventListener('change', () => {
      d.bank = isBankId(select.value) ? select.value : ''
    })
    add('bank', wrapField(select, 'complaint.bank'))
  }

  // IFSC, then the branch it finds (or editable branch fields).
  const ifsc = textField(d, {
    key: 'ifsc',
    labelKey: 'complaint.ifsc',
    optional: true,
    hintKey: 'complaint.ifscHint',
    maxLength: 11,
  })
  const ifscInput = ifsc.control as HTMLInputElement
  ifscInput.autocapitalize = 'characters'
  ifscInput.spellcheck = false
  form.append(ifsc.wrap)

  const branchBox = el('div', 'branch-box')
  branchBox.setAttribute('aria-live', 'polite')
  form.append(branchBox)

  const drawBranch = (): void => {
    branchBox.replaceChildren()
    if (d.lookup === 'loading') {
      branchBox.append(el('p', 'field-hint', t(lang, 'complaint.ifscLooking')))
      return
    }
    if (d.lookup === 'found') {
      const found = el('div', 'branch-found')
      found.append(
        el('p', 'field-label', t(lang, 'complaint.ifscFound')),
        el('p', 'fixed-value', d.branch),
        el('p', 'branch-address', d.address),
      )
      branchBox.append(found)
      return
    }
    if (d.lookup === 'failed') {
      branchBox.append(el('p', 'field-error', t(lang, 'complaint.ifscFailed')))
    }
    const branch = textField(d, {
      key: 'branch',
      labelKey: 'complaint.branchName',
      optional: true,
      maxLength: 100,
    })
    const address = textArea(d, 'address', 'complaint.branchAddress', 3)
    address.wrap.querySelector('.field-label')?.append(
      el('span', 'optional', ` (${t(lang, 'complaint.optional')})`),
    )
    branchBox.append(branch.wrap, address.wrap)
  }
  refreshBranch = drawBranch
  drawBranch()

  ifscInput.addEventListener('input', () => {
    const value = normaliseIfsc(ifscInput.value).slice(0, 11)
    if (ifscInput.value !== value) ifscInput.value = value
    d.ifsc = value
    ifsc.error.textContent = ''
    if (value === d.lookedUp) return

    // A different IFSC: forget what the previous lookup filled in.
    abortLookup()
    if (d.lookup === 'found') {
      d.branch = ''
      d.address = ''
      d.lookupBank = ''
    }
    d.lookup = 'idle'
    d.lookedUp = ''
    if (isIfsc(value)) startLookup(d, value)
    drawBranch()
  })
  ifscInput.addEventListener('change', () => {
    const value = ifscInput.value
    ifsc.error.textContent = value !== '' && !isIfsc(value) ? t(lang, 'complaint.ifscInvalid') : ''
  })

  add(
    'last4',
    textField(d, {
      key: 'last4',
      labelKey: 'complaint.last4',
      inputMode: 'numeric',
      maxLength: 4,
      filter: (value) => digitsOnly(value).slice(0, 4),
    }),
  )
  const date = textField(d, { key: 'incidentDate', labelKey: 'complaint.incidentDate', type: 'date' })
  ;(date.control as HTMLInputElement).max = todayIso()
  add('incidentDate', date)
  add(
    'amount',
    textField(d, {
      key: 'amount',
      labelKey: 'complaint.amount',
      inputMode: 'decimal',
      maxLength: 15,
      filter: amountFilter,
    }),
  )
  add(
    'reference',
    textField(d, { key: 'reference', labelKey: 'complaint.reference', optional: true, maxLength: 40 }),
  )
  add(
    'cyberComplaint',
    textField(d, {
      key: 'cyberComplaint',
      labelKey: 'complaint.cyberComplaint',
      optional: true,
      maxLength: 40,
    }),
  )
  add(
    'branchEmail',
    textField(d, {
      key: 'branchEmail',
      labelKey: 'complaint.branchEmail',
      optional: true,
      hintKey: 'complaint.branchEmailHint',
      type: 'email',
      inputMode: 'email',
      maxLength: 120,
    }),
  )

  // What happened, typed or spoken in the current language.
  const words = textArea(d, 'ownWords', 'complaint.ownWords', 6)
  const hint = el('p', 'field-hint', t(lang, 'complaint.ownWordsHint'))
  hint.id = 'complaint-ownWords-hint'
  words.control.setAttribute('aria-describedby', `${hint.id} ${words.error.id}`)
  words.control.before(hint)

  const voiceBlocked = voiceBlocker()
  if (voiceBlocked === 'voice.needsHttps') {
    words.error.before(el('p', 'voice-status', t(lang, voiceBlocked)))
  } else if (!voiceBlocked) {
    // Without speech recognition (e.g. Firefox) the field is simply typed in.
    const mic = el('button', 'dictate-button')
    mic.type = 'button'
    const micLabel = el('span')
    mic.append(makeIcon('mic'), micLabel)
    const status = el('p', 'voice-status')
    status.setAttribute('aria-live', 'polite')
    const area = words.control as HTMLTextAreaElement
    attachMic(mic, micLabel, status, {
      speechLang: () => lang,
      onTranscript: (transcript) => {
        const spoken = transcript.trim()
        if (!spoken) return
        d.ownWords = d.ownWords.trim() === '' ? spoken : `${d.ownWords.replace(/\s+$/, '')} ${spoken}`
        area.value = d.ownWords
      },
    })
    words.error.before(mic, status, privacyNote())
  }
  add('ownWords', words)

  const summary = el('p', 'form-error')
  summary.setAttribute('role', 'alert')
  const submit = el('button', 'action-button', t(lang, 'complaint.makeLetter'))
  submit.type = 'submit'
  form.append(summary, submit)

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    const errors = draftErrors(d)
    let first: FieldParts | undefined
    for (const [key, parts] of fields) {
      const message = errors[key]
      parts.error.textContent = message ? t(lang, message) : ''
      if (message) {
        parts.control.setAttribute('aria-invalid', 'true')
        first ??= parts
      } else {
        parts.control.removeAttribute('aria-invalid')
      }
    }
    if (first) {
      summary.textContent = t(lang, 'complaint.fixErrors')
      first.control.focus()
      return
    }
    summary.textContent = ''
    window.location.hash = `#/complaint/${id}/letter`
  })

  app.append(form)
}

/** The letter as on paper. The print stylesheet shows only this element. */
function renderLetterSheet(letter: Letter): HTMLElement {
  const { parts } = letter
  const sheet = el('article', 'letter')
  sheet.lang = 'en'

  sheet.append(el('p', 'letter-date', parts.date))
  sheet.append(el('p', 'letter-lines', ['To,', ...parts.to].join('\n')))
  sheet.append(el('p', 'letter-subject', parts.subject))
  sheet.append(el('p', undefined, parts.salutation))
  for (const paragraph of parts.paragraphs) sheet.append(el('p', undefined, paragraph))

  if (parts.ownWords) {
    sheet.append(el('p', 'letter-own-heading', parts.ownWordsHeading))
    const own = el('p', 'letter-own', parts.ownWords)
    // The user's words may be Hindi or Malayalam: let the browser pick the script direction and font.
    own.lang = ''
    own.dir = 'auto'
    sheet.append(own)
  }

  sheet.append(el('p', 'letter-lines', [parts.closing, ...parts.signOff].join('\n')))

  const sign = el('div', 'print-only sign-block')
  sign.append(
    el('div', 'sign-box', PRINT_LABELS.signature),
    el('p', 'sign-line', PRINT_LABELS.name),
    el('p', 'sign-line', PRINT_LABELS.date),
  )
  const bankBox = el('div', 'bank-box')
  bankBox.append(
    el('p', 'bank-box-title', `${PRINT_LABELS.bankUse} —`),
    el('p', 'sign-line', PRINT_LABELS.receivedBy),
    el('p', 'sign-line', PRINT_LABELS.bankSignature),
    el('p', 'sign-line', PRINT_LABELS.bankDate),
    el('p', 'stamp', PRINT_LABELS.stamp),
  )
  sign.append(bankBox)
  sheet.append(sign)

  sheet.append(el('p', 'letter-footer', parts.footer))
  return sheet
}

function renderLetter(app: HTMLElement, id: string): void {
  const d = draft
  if (!d || Object.keys(draftErrors(d)).length > 0) {
    // Nothing to show yet (e.g. a reload cleared the draft): back to the form.
    window.history.replaceState(null, '', `#/complaint/${id}`)
    renderComplaint(app, id)
    return
  }

  const fields = {
    today: new Date(),
    name: d.name,
    mobile: d.mobile,
    bankName: bankFullName(d),
    branch: d.branch,
    address: d.address,
    last4: d.last4,
    incidentDate: d.incidentDate,
    amount: d.amount,
    reference: d.reference,
    cyberComplaint: d.cyberComplaint,
    ownWords: d.ownWords,
  }
  const letter = buildLetter(fields)
  // AGENTS.md: no card or account digits in any URL except sms:, so the
  // emailed copy leaves them blank for the user to type in their mail app.
  const emailLetter = buildLetter({ ...fields, last4: '' })

  app.append(backLink(`#/complaint/${id}`))
  app.append(el('h1', undefined, t(lang, 'letter.title')))

  const panel = el('section', 'letter-actions')
  panel.append(el('p', 'print-tip', t(lang, 'letter.printTip')))

  const email = el('a', 'action-button', t(lang, 'letter.email'))
  email.href = buildMailtoUri(d.branchEmail, emailLetter.subject, emailLetter.bodyText)
  panel.append(email, el('p', 'note', t(lang, 'letter.emailNote')))

  const print = el('button', 'action-button', t(lang, 'letter.print'))
  print.type = 'button'
  print.addEventListener('click', () => window.print())
  panel.append(print)

  const visit = el('button', 'action-button secondary', t(lang, 'letter.visit'))
  visit.type = 'button'
  visit.setAttribute('aria-expanded', 'false')
  visit.setAttribute('aria-controls', 'branch-directions')
  const directions = el('div', 'branch-directions')
  directions.id = 'branch-directions'
  directions.hidden = true

  const place = [d.branch.trim(), d.address.trim()].filter((part) => part !== '')
  if (place.length > 0) {
    const where = el('p', 'branch-where')
    if (d.branch.trim()) where.append(el('strong', undefined, d.branch.trim()))
    if (d.address.trim()) {
      if (d.branch.trim()) where.append(el('br'))
      where.append(d.address.trim())
    }
    const maps = el('a', 'action-button secondary', t(lang, 'letter.openMaps'))
    maps.href = buildMapsUri(place.join(', '))
    maps.target = '_blank'
    maps.rel = 'noopener noreferrer'
    directions.append(where, maps)
  } else {
    directions.append(el('p', 'note', t(lang, 'letter.noBranch')))
  }

  visit.addEventListener('click', () => {
    directions.hidden = !directions.hidden
    visit.setAttribute('aria-expanded', String(!directions.hidden))
  })
  panel.append(visit, directions)
  app.append(panel)

  app.append(el('h2', 'section-label letter-heading', t(lang, 'letter.preview')))
  app.append(renderLetterSheet(letter))
}

function render(): void {
  const app = document.querySelector<HTMLElement>('#app')
  if (!app) return

  stopActiveVoice()
  const route = parseRoute(window.location.hash)
  if (heard && heard.hash !== window.location.hash) heard = null

  // The complaint draft lives only while the user is inside the flow.
  const inFlow = route.name === 'complaint' || route.name === 'letter'
  if (!inFlow || draft?.origin !== route.id) clearDraft()
  refreshBranch = null

  document.documentElement.lang = lang
  app.replaceChildren()
  app.append(renderLanguageSwitch())
  app.append(el('p', 'safety-banner', t(lang, 'app.safetyBanner')))
  if (heard) app.append(heardLine(heard.text))

  if (route.name === 'bank') renderBank(app, route.bank)
  else if (route.name === 'action') renderAction(app, route.id)
  else if (route.name === 'complaint') renderComplaint(app, route.id)
  else if (route.name === 'letter') renderLetter(app, route.id)
  else renderHome(app)

  app.append(el('p', 'disclaimer', t(lang, 'app.disclaimer')))
  window.scrollTo(0, 0)
}

window.addEventListener('hashchange', render)
render()
