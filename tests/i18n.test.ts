import { describe, expect, it } from 'vitest'
import en from '../src/i18n/en.json'
import hi from '../src/i18n/hi.json'
import ml from '../src/i18n/ml.json'

type Dict = Record<string, string>

const DICTS: Record<string, Dict> = { en, hi, ml }
const LANGS = Object.keys(DICTS)

describe('i18n', () => {
  const expected = Object.keys(en).sort()

  it('has the app title', () => {
    expect(en['app.title']).toBe('Turant')
  })

  it('defines the same keys in every language', () => {
    for (const lang of LANGS) {
      expect(Object.keys(DICTS[lang]).sort(), lang).toEqual(expected)
    }
  })

  it('has no empty strings', () => {
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(DICTS[lang])) {
        expect(value.trim(), `${lang}:${key}`).not.toBe('')
      }
    }
  })
})