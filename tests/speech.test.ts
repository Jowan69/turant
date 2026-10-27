import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  getSpeechRecognition,
  SPEECH_LOCALES,
  speechErrorKey,
  transcriptOf,
} from '../src/speech'

describe('getSpeechRecognition()', () => {
  class Standard {}
  class Prefixed {}

  it('prefers the standard constructor', () => {
    expect(getSpeechRecognition({ SpeechRecognition: Standard, webkitSpeechRecognition: Prefixed })).toBe(Standard)
  })

  it('falls back to the webkit prefix', () => {
    expect(getSpeechRecognition({ webkitSpeechRecognition: Prefixed })).toBe(Prefixed)
  })

  it('returns undefined when neither exists', () => {
    expect(getSpeechRecognition({})).toBeUndefined()
  })
})

describe('SPEECH_LOCALES', () => {
  it('uses the Indian variant of each language', () => {
    expect(SPEECH_LOCALES).toEqual({ en: 'en-IN', hi: 'hi-IN', ml: 'ml-IN' })
  })
})

describe('speechErrorKey()', () => {
  it.each([
    ['not-allowed', 'voice.errNotAllowed'],
    ['network', 'voice.errNetwork'],
    ['no-speech', 'voice.errNoSpeech'],
    ['language-not-supported', 'voice.errLanguage'],
    ['audio-capture', 'voice.errOther'],
    ['service-not-allowed', 'voice.errOther'],
  ])('%s -> %s', (code, key) => {
    expect(speechErrorKey(code)).toBe(key)
  })
})

describe('transcriptOf()', () => {
  it('joins the final results from resultIndex on', () => {
    const event = {
      resultIndex: 1,
      results: {
        length: 3,
        0: { isFinal: true, length: 1, 0: { transcript: 'old' } },
        1: { isFinal: true, length: 1, 0: { transcript: ' my sbi card ' } },
        2: { isFinal: true, length: 1, 0: { transcript: 'is lost' } },
      },
    }
    expect(transcriptOf(event)).toBe('my sbi card is lost')
  })

  it('skips interim results', () => {
    const event = {
      resultIndex: 0,
      results: { length: 1, 0: { isFinal: false, length: 1, 0: { transcript: 'maybe' } } },
    }
    expect(transcriptOf(event)).toBe('')
  })
})

describe('microphone permission headers', () => {
  it('vercel.json lets the page use its own microphone', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      headers: { source: string; headers: { key: string; value: string }[] }[]
    }
    const policies = config.headers.flatMap((rule) =>
      rule.headers.filter((header) => header.key.toLowerCase() === 'permissions-policy'),
    )
    expect(policies).toHaveLength(1)
    expect(policies[0]?.value).toMatch(/(^|,\s*)microphone=\(self\)/)
  })

  it('index.html does not override it', () => {
    const html = readFileSync('index.html', 'utf8')
    expect(html).not.toMatch(/permissions-policy|feature-policy|allow=/i)
  })
})
