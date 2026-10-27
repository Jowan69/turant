import en from './i18n/en.json'
import hi from './i18n/hi.json'
import ml from './i18n/ml.json'

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

function isLang(value: string | null): value is Lang {
  return value === 'en' || value === 'hi' || value === 'ml'
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

function render(): void {
  const app = document.querySelector<HTMLElement>('#app')
  if (!app) return

  document.documentElement.lang = lang
  app.replaceChildren()

  app.append(el('h1', undefined, t(lang, 'app.title')))
  app.append(el('p', 'tagline', t(lang, 'app.tagline')))

  const langSection = el('section')
  langSection.append(el('h2', 'lang-label', t(lang, 'app.langLabel')))

  const langButtons = el('div', 'langs')
  for (const id of LANGS) {
    const button = el('button', undefined, LANG_NAMES[id])
    button.type = 'button'
    button.setAttribute('aria-pressed', String(id === lang))
    button.addEventListener('click', () => {
      lang = id
      render()
    })
    langButtons.append(button)
  }
  langSection.append(langButtons)
  app.append(langSection)

  const status = el('section', 'status')
  status.append(el('h2', undefined, t(lang, 'status.noData')))
  status.append(el('p', undefined, t(lang, 'status.noDataDetail')))
  app.append(status)

  app.append(el('p', 'disclaimer', t(lang, 'app.disclaimer')))
}

render()