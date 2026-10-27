// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * Drives the real click handler and rendering code with a fake
 * SpeechRecognition. No microphone and no browser speech service are used:
 * this isolates transcript processing and navigation from live recognition.
 */

interface FakeResultEvent {
  resultIndex: number
  results: ArrayLike<ArrayLike<{ transcript: string }>>
}

class FakeSpeechRecognition {
  static instances: FakeSpeechRecognition[] = []

  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 1
  onstart: (() => void) | null = null
  onresult: ((event: FakeResultEvent) => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  started = false

  constructor() {
    FakeSpeechRecognition.instances.push(this)
  }

  start(): void {
    this.started = true
    this.onstart?.()
  }

  stop(): void {
    this.onend?.()
  }

  abort(): void {
    this.onend?.()
  }
}

const CASES = [
  {
    lang: 'ml',
    recognitionLang: 'ml-IN',
    phrase: 'എന്റെ എസ്ബിഐ കാർഡ് നഷ്ടപ്പെട്ടു',
    actionId: 'sbi-debit',
  },
  {
    lang: 'hi',
    recognitionLang: 'hi-IN',
    phrase: 'मेरा HDFC कार्ड खो गया',
    actionId: 'hdfc-debit',
  },
  {
    lang: 'en',
    recognitionLang: 'en-IN',
    phrase: 'my axis card is stolen',
    actionId: 'axis-debit',
  },
] as const

beforeAll(async () => {
  document.body.innerHTML = '<main id="app"></main>'
  window.scrollTo = () => {}
  window.SpeechRecognition = FakeSpeechRecognition
  window.webkitSpeechRecognition = FakeSpeechRecognition
  await import('../src/main')
})

/** Render the home screen again between cases. */
function home(): void {
  window.location.hash = '#/'
  window.dispatchEvent(new Event('hashchange'))
}

function lastRecognition(): FakeSpeechRecognition {
  const instance = FakeSpeechRecognition.instances.at(-1)
  if (!instance) throw new Error('no recognition was created')
  return instance
}

describe('voice pipeline with mock transcripts', () => {
  it.each(CASES)(
    '$lang phrase navigates to $actionId',
    ({ lang, recognitionLang, phrase, actionId }) => {
      home()

      const chip = document.querySelector<HTMLButtonElement>(
        `.voice-langs button[data-lang="${lang}"]`,
      )
      expect(chip, 'spoken-language chip').not.toBeNull()
      chip?.click()

      const mic = document.querySelector<HTMLButtonElement>('.mic-button')
      expect(mic, 'microphone button').not.toBeNull()
      mic?.click()

      const recognition = lastRecognition()
      expect(recognition.started).toBe(true)
      expect(recognition.lang).toBe(recognitionLang)

      recognition.onresult?.({ resultIndex: 0, results: [[{ transcript: phrase }]] })
      window.dispatchEvent(new Event('hashchange'))

      expect(window.location.hash).toBe(`#/action/${actionId}`)
      expect(document.querySelector('h1')?.textContent).toBe('Debit card lost')
    },
  )

  it('defaults the spoken language to the UI language', () => {
    home()

    const english = [...document.querySelectorAll<HTMLButtonElement>('.langs button')].find(
      (button) => button.textContent === 'English',
    )
    english?.click()

    const pressed = [
      ...document.querySelectorAll<HTMLButtonElement>('.voice-langs button'),
    ].filter((chip) => chip.getAttribute('aria-pressed') === 'true')

    expect(pressed.map((chip) => chip.dataset.lang)).toEqual(['en'])
  })

  it('shows a translated message when the microphone is blocked', () => {
    home()

    document.querySelector<HTMLButtonElement>('.mic-button')?.click()
    lastRecognition().onerror?.({ error: 'not-allowed' })

    expect(document.querySelector('.voice-status')?.textContent).toContain(
      'Microphone access is blocked',
    )
  })

  it('shows a message when no speech was heard', () => {
    home()

    document.querySelector<HTMLButtonElement>('.mic-button')?.click()
    lastRecognition().onerror?.({ error: 'no-speech' })

    expect(document.querySelector('.voice-status')?.textContent).toContain('did not hear anything')
  })
})
