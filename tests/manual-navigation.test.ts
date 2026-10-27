// @vitest-environment happy-dom
import { beforeAll, describe, expect, it } from 'vitest'
import actionsData from '../data/actions.json'

/**
 * Regression cover for the screens a user reaches by tapping, not speaking:
 * bank tiles, problem buttons and the SMS and call actions. Every expectation
 * is read from data/actions.json, so the tests follow the data.
 */

interface ActionEntry {
  id: string
  bank: string
  problem: string
  channel: 'sms' | 'call'
  to: string
  sms_template: string | null
  needs: 'last4' | 'full_card' | 'none'
}

const actions = actionsData as unknown as ActionEntry[]

beforeAll(async () => {
  document.body.innerHTML = '<main id="app"></main>'
  window.scrollTo = () => {}
  await import('../src/main')
})

function go(hash: string): void {
  window.location.hash = hash
  window.dispatchEvent(new Event('hashchange'))
}

/** Follow a link the way a tap would, after checking it is on screen. */
function follow(selector: string): void {
  const link = document.querySelector<HTMLAnchorElement>(selector)
  expect(link, selector).not.toBeNull()
  go(link?.getAttribute('href') ?? '')
}

function typeDigits(value: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>('#card-digits')
  if (!input) throw new Error('no card-digits field')
  input.value = value
  input.dispatchEvent(new Event('input'))
  return input
}

const banks = [...new Set(actions.map((a) => a.bank).filter((bank) => bank !== 'any'))]

describe('manual navigation', () => {
  it.each(banks)('home tile -> %s -> each problem opens an existing action', (bank) => {
    go('#/')
    follow(`a.tile[href="#/bank/${bank}"]`)
    expect(window.location.hash).toBe(`#/bank/${bank}`)

    const links = [...document.querySelectorAll<HTMLAnchorElement>('a.problem-button')]
    const problems = new Set(actions.filter((a) => a.bank === bank).map((a) => a.problem))
    expect(links).toHaveLength(problems.size)

    for (const link of links) {
      const id = link.getAttribute('href')?.replace('#/action/', '') ?? ''
      const action = actions.find((entry) => entry.id === id)
      expect(action, id).toBeDefined()
      expect(action?.bank).toBe(bank)
    }
  })

  it('home tile -> SBI -> Debit card lost reaches the same action voice uses', () => {
    go('#/')
    follow('a.tile[href="#/bank/sbi"]')
    follow('a.problem-button[href="#/action/sbi-debit"]')
    expect(window.location.hash).toBe('#/action/sbi-debit')
    expect(document.querySelector('h1')?.textContent).toBe('Debit card lost')
  })

  it('the stolen-money tile opens the money_taken action', () => {
    const money = actions.find((a) => a.problem === 'money_taken')
    go('#/')
    follow(`a.tile.danger[href="#/action/${money?.id}"]`)
    expect(window.location.hash).toBe(`#/action/${money?.id}`)
  })

  it('back link on an action returns to its bank', () => {
    go('#/action/axis-debit')
    expect(document.querySelector<HTMLAnchorElement>('a.back')?.getAttribute('href')).toBe(
      '#/bank/axis',
    )
  })
})

describe('SMS actions', () => {
  const smsActions = actions.filter((a) => a.channel === 'sms' && a.needs === 'last4')

  it.each(smsActions.map((a) => a.id))('%s offers no link until 4 digits are typed', (id) => {
    go(`#/action/${id}`)
    const send = document.querySelector<HTMLAnchorElement>('a.action-button')
    expect(send?.hasAttribute('href')).toBe(false)
    expect(send?.getAttribute('aria-disabled')).toBe('true')

    typeDigits('12')
    expect(send?.hasAttribute('href')).toBe(false)
  })

  it.each(smsActions.map((a) => a.id))(
    '%s opens sms: to the number in the data with the filled template',
    (id) => {
      const action = actions.find((a) => a.id === id)
      if (!action?.sms_template) throw new Error(`${id} has no template`)

      go(`#/action/${id}`)
      typeDigits('1234')

      const href = document.querySelector<HTMLAnchorElement>('a.action-button')?.href ?? ''
      expect(href.startsWith(`sms:${action.to}`)).toBe(true)
      expect(decodeURIComponent(href)).toContain(action.sms_template.replace('{last4}', '1234'))
      // Digits go only into the sms: link, never into the page URL.
      expect(window.location.href).not.toContain('1234')
    },
  )

  it('drops non-digits from the card field', () => {
    go('#/action/sbi-debit')
    expect(typeDigits('12a3').value).toBe('123')
  })
})

describe('call actions', () => {
  const callActions = actions.filter((a) => a.channel === 'call')

  it.each(callActions.map((a) => a.id))('%s dials the number in the data', (id) => {
    const action = actions.find((a) => a.id === id)
    go(`#/action/${id}`)
    const call = document.querySelector<HTMLAnchorElement>(`a[href="tel:${action?.to}"]`)
    expect(call?.textContent).toBe('Call now')
  })
})
