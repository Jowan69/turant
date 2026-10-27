// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import actionsData from '../data/actions.json'
import en from '../src/i18n/en.json'
import ml from '../src/i18n/ml.json'

/**
 * Drives the real mic button and router in src/main.ts with a fake
 * SpeechRecognition. No microphone, speech service or internet is used.
 */

const strings = en as Record<string, string>

class FakeRecognition {
  static instances: FakeRecognition[] = []
  /** Set to make the next start() throw, like a browser refusing to start. */
  static startError: Error | null = null

  lang = ''
  interimResults = true
  maxAlternatives = 5
  continuous = true
  onresult: ((event: unknown) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null

  started = false
  stopped = false
  aborted = false

  constructor() {
    FakeRecognition.instances.push(this)
  }

  start(): void {
    const error = FakeRecognition.startError
    FakeRecognition.startError = null
    if (error) throw error
    this.started = true
  }

  stop(): void {
    this.stopped = true
  }

  abort(): void {
    this.aborted = true
  }

  /** The browser heard `text`, then ended, as Chrome does with continuous = false. */
  hear(text: string): void {
    this.onresult?.({
      resultIndex: 0,
      results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: text, confidence: 0.9 } } },
    })
    this.onend?.()
  }

  /** The browser reported an error, then ended. */
  fail(code: string): void {
    this.onerror?.({ error: code })
    this.onend?.()
  }
}

function setSecure(secure: boolean): void {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: secure })
}

beforeAll(async () => {
  document.body.innerHTML = '<main id="app"></main>'
  window.scrollTo = () => {}
  setSecure(true)
  vi.stubGlobal('SpeechRecognition', FakeRecognition)
  await import('../src/main')
})

afterEach(() => {
  FakeRecognition.instances = []
  FakeRecognition.startError = null
  setSecure(true)
  vi.stubGlobal('SpeechRecognition', FakeRecognition)
  vi.stubGlobal('webkitSpeechRecognition', undefined)
})

const CASES = [
  {
    lang: 'ml',
    locale: 'ml-IN',
    language: 'Malayalam',
    phrase: 'എന്റെ എസ്ബിഐ കാർഡ് നഷ്ടപ്പെട്ടു',
    actionId: 'sbi-debit',
    bank: 'sbi',
  },
  {
    lang: 'hi',
    locale: 'hi-IN',
    language: 'Hindi',
    phrase: 'मेरा HDFC कार्ड खो गया',
    actionId: 'hdfc-debit',
    bank: 'hdfc',
  },
  {
    lang: 'en',
    locale: 'en-IN',
    language: 'English',
    phrase: 'my axis card is stolen',
    actionId: 'axis-debit',
    bank: 'axis',
  },
] as const

/**
 * Navigate and wait for the render. happy-dom fires hashchange one tick after
 * the hash changes, so the test waits for it rather than racing it.
 */
async function go(hash: string): Promise<void> {
  if (window.location.hash === hash) {
    window.dispatchEvent(new Event('hashchange'))
    return
  }
  const changed = new Promise((resolve) => window.addEventListener('hashchange', resolve, { once: true }))
  window.location.hash = hash
  await changed
}

/** Render the home screen again between cases. */
async function home(): Promise<void> {
  await go('#/')
}

function micButton(): HTMLButtonElement {
  const mic = document.querySelector<HTMLButtonElement>('.mic-button')
  if (!mic) throw new Error('no microphone button')
  return mic
}

function status(): string {
  return document.querySelector('.voice-status')?.textContent ?? ''
}

function chooseSpokenLanguage(lang: string): void {
  const chip = document.querySelector<HTMLButtonElement>(`.voice-langs button[data-lang="${lang}"]`)
  if (!chip) throw new Error(`no spoken-language chip for ${lang}`)
  chip.click()
}

function chooseUiLanguage(name: string): void {
  const button = [...document.querySelectorAll<HTMLButtonElement>('.langs button')].find(
    (entry) => entry.textContent === name,
  )
  if (!button) throw new Error(`no UI language button for ${name}`)
  button.click()
}

/** Tap the mic. start() runs inside the click handler, so it has started on return. */
function tap(button: HTMLButtonElement = micButton()): FakeRecognition {
  button.click()
  const recognition = FakeRecognition.instances.at(-1)
  if (!recognition) throw new Error('no recognition was created')
  return recognition
}

/** Wait for voice to send the router to `hash`, and for that screen to render. */
async function landsOn(hash: string): Promise<void> {
  await vi.waitFor(() => expect(window.location.hash).toBe(hash))
  // happy-dom's hashchange was queued when the hash changed; let it run first.
  await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('spoken phrase -> speech recognition -> action screen', () => {
  it.each(CASES)(
    '$language: "$phrase" opens $actionId',
    async ({ lang, locale, phrase, actionId, bank }) => {
      await home()
      chooseSpokenLanguage(lang)

      const recognition = tap()
      // Started synchronously inside the click, with the requested settings.
      expect(recognition.started).toBe(true)
      expect(recognition.lang).toBe(locale)
      expect(recognition.interimResults).toBe(false)
      expect(recognition.maxAlternatives).toBe(1)
      expect(recognition.continuous).toBe(false)
      expect(micButton().textContent).toBe(strings['voice.listening'])
      expect(micButton().getAttribute('aria-pressed')).toBe('true')

      recognition.hear(phrase)

      await landsOn(`#/action/${actionId}`)
      expect(document.querySelector('h1')?.textContent).toBe('Debit card lost')
      expect(document.querySelector('.subtitle')?.textContent).toBe(strings[`bank.${bank}`])

      // The transcript is on screen, so a wrong screen can be told apart from a wrong transcript.
      expect(document.querySelector('.heard')?.textContent).toBe(`${strings['voice.heard']} ${phrase}`)
    },
  )

  it('creates a new recognition on every tap', async () => {
    await home()
    const first = tap()
    first.fail('no-speech')
    const second = tap()
    expect(second).not.toBe(first)
    expect(FakeRecognition.instances).toHaveLength(2)
    expect(second.started).toBe(true)
  })

  it('follows the UI language switch', async () => {
    await home()
    chooseUiLanguage('മലയാളം')
    expect(tap().lang).toBe('ml-IN')
    expect(micButton().textContent).toBe((ml as Record<string, string>)['voice.listening'])
    chooseUiLanguage('English')
  })

  it('uses the webkit-prefixed constructor when the standard one is missing', async () => {
    vi.stubGlobal('SpeechRecognition', undefined)
    vi.stubGlobal('webkitSpeechRecognition', FakeRecognition)
    await home()
    expect(tap().started).toBe(true)
  })

  it('drops the transcript line once the user moves on', async () => {
    await home()
    tap().hear('my axis card is stolen')
    await landsOn('#/action/axis-debit')
    expect(document.querySelector('.heard')).not.toBeNull()

    await go('#/bank/axis')
    expect(document.querySelector('.heard')).toBeNull()
  })

  it('opens the bank screen when only the bank was heard', async () => {
    await home()
    tap().hear('SBI')
    await landsOn('#/bank/sbi')
    expect(document.querySelector('h1')?.textContent).toBe(strings['bank.sbi'])
  })

  it('shows what was heard and stays home when no bank was named', async () => {
    await home()
    tap().hear('what is the weather today')

    expect(status()).toContain('what is the weather today')
    expect(status()).toContain(strings['voice.pleaseTapBank'])
    expect(window.location.hash).toBe('#/')
    expect(micButton().getAttribute('aria-pressed')).toBe('false')
    expect(micButton().textContent).toBe(strings['voice.mic'])
  })

  it('masks digits in the transcript it shows', async () => {
    await home()
    tap().hear('card 4321 weather')
    expect(status()).toContain('card •••• weather')
    expect(document.querySelector('#app')?.textContent).not.toContain('4321')
  })

  it('defaults the spoken language to the UI language', async () => {
    await home()
    chooseUiLanguage('English')

    const pressed = [...document.querySelectorAll<HTMLButtonElement>('.voice-langs button')].filter(
      (chip) => chip.getAttribute('aria-pressed') === 'true',
    )
    expect(pressed.map((chip) => chip.dataset.lang)).toEqual(['en'])
  })

  it('tells the user where their voice goes', async () => {
    await home()
    expect(document.querySelector('.voice .voice-privacy')?.textContent).toBe(strings['voice.privacy'])
  })
})

describe('errors', () => {
  it.each([
    ['not-allowed', 'voice.errNotAllowed'],
    ['network', 'voice.errNetwork'],
    ['no-speech', 'voice.errNoSpeech'],
    ['language-not-supported', 'voice.errLanguage'],
  ])('"%s" shows its own message and resets the button', async (code, key) => {
    await home()
    tap().fail(code)

    expect(status()).toBe(strings[key])
    expect(window.location.hash).toBe('#/')
    expect(micButton().getAttribute('aria-pressed')).toBe('false')
    expect(micButton().textContent).toBe(strings['voice.mic'])
  })

  it('any other error shows its code', async () => {
    await home()
    tap().fail('audio-capture')
    expect(status()).toBe(strings['voice.errOther'].replace('{code}', 'audio-capture'))
    expect(status()).toContain('audio-capture')
  })

  it('shows the message in the current language', async () => {
    await home()
    chooseUiLanguage('മലയാളം')
    tap().fail('not-allowed')
    expect(status()).toBe((ml as Record<string, string>)['voice.errNotAllowed'])
    chooseUiLanguage('English')
  })

  it('shows the error while the recognition is still ending', async () => {
    await home()
    const recognition = tap()
    recognition.onerror?.({ error: 'network' })
    expect(status()).toBe(strings['voice.errNetwork'])
    recognition.onend?.()
    expect(status()).toBe(strings['voice.errNetwork'])
    expect(micButton().getAttribute('aria-pressed')).toBe('false')
  })

  it('ending with no result and no error says nothing was heard', async () => {
    await home()
    tap().onend?.()
    expect(status()).toBe(strings['voice.errNoSpeech'])
    expect(micButton().getAttribute('aria-pressed')).toBe('false')
  })

  it('a start() that throws shows the error and leaves the button usable', async () => {
    await home()
    FakeRecognition.startError = new DOMException('already started', 'InvalidStateError')
    tap()
    expect(status()).toBe(strings['voice.errOther'].replace('{code}', 'InvalidStateError'))
    expect(micButton().getAttribute('aria-pressed')).toBe('false')

    expect(tap().started).toBe(true)
  })
})

describe('when voice cannot work', () => {
  it('on http:// hides the mic and points to the https version', async () => {
    setSecure(false)
    await home()
    expect(document.querySelector('.mic-button')).toBeNull()
    expect(status()).toBe(strings['voice.needsHttps'])

    await go('#/complaint/sbi-debit')
    expect(document.querySelector('.dictate-button')).toBeNull()
    expect(document.querySelector('.complaint-form .voice-status')?.textContent).toBe(strings['voice.needsHttps'])
  })

  it('without SpeechRecognition (e.g. Firefox) hides the mic and says so', async () => {
    vi.stubGlobal('SpeechRecognition', undefined)
    await home()
    expect(document.querySelector('.mic-button')).toBeNull()
    expect(status()).toBe(strings['voice.unsupported'])

    // The complaint form just keeps its text box.
    await go('#/complaint/sbi-debit')
    expect(document.querySelector('.dictate-button')).toBeNull()
    expect(document.querySelector('#complaint-ownWords')).not.toBeNull()
  })
})

describe('one recognition at a time', () => {
  it('tapping while listening stops it, and what was heard still counts', async () => {
    await home()
    const recognition = tap()
    micButton().click()
    expect(recognition.stopped).toBe(true)
    expect(FakeRecognition.instances).toHaveLength(1)

    recognition.hear('my axis card is stolen')
    await landsOn('#/action/axis-debit')
  })

  it('changing the spoken language while listening aborts and drops the result', async () => {
    await home()
    const recognition = tap()
    chooseSpokenLanguage('hi')

    expect(recognition.aborted).toBe(true)
    expect(micButton().getAttribute('aria-pressed')).toBe('false')
    recognition.hear('my axis card is stolen')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(window.location.hash).toBe('#/')
    chooseSpokenLanguage('en')
  })

  it('leaving the screen while listening aborts and ignores a late result', async () => {
    await home()
    const recognition = tap()
    await go('#/bank/pnb')
    expect(recognition.aborted).toBe(true)

    recognition.hear('my axis card is stolen')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(window.location.hash).toBe('#/bank/pnb')
  })
})

describe('voice navigation lands on the existing action screen', () => {
  it.each(CASES)('$actionId screen matches its entry in data/actions.json', async ({ lang, phrase, actionId }) => {
    const action = actionsData.find((entry) => entry.id === actionId)
    if (!action) throw new Error(`${actionId} is missing from data/actions.json`)

    await home()
    chooseSpokenLanguage(lang)
    tap().hear(phrase)
    await landsOn(`#/action/${action.id}`)

    expect(document.querySelector('.subtitle')?.textContent).toBe(strings[`bank.${action.bank}`])
    expect(document.querySelector(`a[href="#/complaint/${action.id}"]`)).not.toBeNull()
    if (action.channel === 'call') {
      expect(document.querySelector(`a[href="tel:${action.to}"]`)).not.toBeNull()
    } else {
      // SMS actions wait for the card digits before they offer a link.
      expect(document.querySelector('#card-digits')).not.toBeNull()
      expect(document.querySelector('.action-text')?.textContent).toBe(action.sms_template)
    }
  })
})

describe('complaint dictation', () => {
  function dictateButton(): HTMLButtonElement {
    const mic = document.querySelector<HTMLButtonElement>('.dictate-button')
    if (!mic) throw new Error('no dictation button')
    return mic
  }

  it('adds the transcript to "what happened", in the UI language', async () => {
    await go('#/complaint/sbi-debit')
    expect(document.querySelector('.complaint-form .voice-privacy')).not.toBeNull()

    const recognition = tap(dictateButton())
    expect(recognition.lang).toBe('en-IN')
    recognition.hear('Someone took my card at the bus stand.')

    expect(document.querySelector<HTMLTextAreaElement>('#complaint-ownWords')?.value).toBe(
      'Someone took my card at the bus stand.',
    )
    expect(window.location.hash).toBe('#/complaint/sbi-debit')
  })

  it('shows errors and keeps typing possible', async () => {
    await go('#/complaint/sbi-debit')
    tap(dictateButton()).fail('network')

    expect(document.querySelector('.complaint-form .voice-status')?.textContent).toBe(
      strings['voice.errNetwork'],
    )
    const area = document.querySelector<HTMLTextAreaElement>('#complaint-ownWords')
    expect(area?.disabled).toBe(false)
  })
})
