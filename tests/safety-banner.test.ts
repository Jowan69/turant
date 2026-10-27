// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest'
import en from '../src/i18n/en.json'
import hi from '../src/i18n/hi.json'
import ml from '../src/i18n/ml.json'

beforeAll(async () => {
  document.body.innerHTML = '<main id="app"></main>'
  window.scrollTo = () => {}
  await import('../src/main')
})

function go(hash: string): void {
  window.location.hash = hash
  window.dispatchEvent(new Event('hashchange'))
}

const SCREENS = ['#/', '#/bank/sbi', '#/action/sbi-debit', '#/complaint/sbi-debit', '#/letter/sbi-debit', '#/nowhere']
const LANGS = [
  ['English', en],
  ['हिंदी', hi],
  ['മലയാളം', ml],
] as const

describe('safety banner', () => {
  it.each(LANGS)('shows on every screen in %s', (name, dict) => {
    go('#/')
    const button = [...document.querySelectorAll<HTMLButtonElement>('.langs button')].find(
      (b) => b.textContent === name,
    )
    expect(button, name).toBeDefined()
    button?.click()

    for (const screen of SCREENS) {
      go(screen)
      const banners = document.querySelectorAll('#app > .safety-banner')
      expect(banners, screen).toHaveLength(1)
      expect(banners[0]?.textContent, screen).toBe(dict['app.safetyBanner'])
    }
  })
})
