import actionsData from '../data/actions.json'
import en from './i18n/en.json'
import hi from './i18n/hi.json'
import ml from './i18n/ml.json'
import { buildSmsUri, buildTelUri, fillTemplate } from './links'

/** Languages Turant supports. Every UI string lives in src/i18n/<lang>.json. */
export type Lang = 'en' | 'hi' | 'ml'

export const LANGS: readonly Lang[] = ['en', 'hi', 'ml']

/** Endonyms: language names are shown in their own script, so they are not translated. */
const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  hi: 'हिन्दी',
  ml: 'മലയാളം',
}

const STRINGS: Record<Lang, Record<string, string>> = { en, hi, ml }

/** Look up a UI string, falling back to English and then to the key itself. */
export function t(lang: Lang, key: string): string {
  return STRINGS[lang][key] ?? STRINGS.en[key] ?? key
}

type BankId = 'sbi' | 'hdfc' | 'icici' | 'axis' | 'pnb'
type AnyBank = BankId | 'any'
type Problem = 'debit_lost' | 'credit_lost' | 'upi_misuse' | 'money_taken'
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

type IconName = 'bank' | 'house' | 'card' | 'diamond' | 'shield' | 'alert'

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

/** Prefer an explicit ?lang=, then the device language, then English. */
function detectLang(): Lang {
  const requested = new URLSearchParams(window.location.search).get('lang')
  if (isLang(requested)) return requested

  const device = navigator.language.toLowerCase()
  if (device.startsWith('hi')) return 'hi'
  if (device.startsWith('ml')) return 'ml'
  return 'en'
}

let lang: Lang = detectLang()

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

function parseRoute(hash: string): Route {
  const path = hash.replace(/^#\/?/, '')
  const [kind, value] = path.split('/')

  if (kind === 'bank' && value && isBankId(value)) return { name: 'bank', bank: value }
  if (kind === 'action' && value) return { name: 'action', id: value }
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

function renderHome(app: HTMLElement): void {
  app.append(el('h1', undefined, t(lang, 'app.title')))
  app.append(el('p', 'tagline', t(lang, 'app.tagline')))
  app.append(renderLanguageSwitch())

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

function render(): void {
  const app = document.querySelector<HTMLElement>('#app')
  if (!app) return

  document.documentElement.lang = lang
  app.replaceChildren()

  const route = parseRoute(window.location.hash)
  if (route.name === 'bank') renderBank(app, route.bank)
  else if (route.name === 'action') renderAction(app, route.id)
  else renderHome(app)

  app.append(el('p', 'disclaimer', t(lang, 'app.disclaimer')))
  window.scrollTo(0, 0)
}

window.addEventListener('hashchange', render)
render()
