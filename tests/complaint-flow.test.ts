// @vitest-environment happy-dom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

/**
 * Drives the real complaint screens. fetch is replaced with a fake, so no
 * network is used; the tests also check it is called only for an IFSC.
 */

const fetchMock = vi.fn()

beforeAll(async () => {
  document.body.innerHTML = '<main id="app"></main>'
  window.scrollTo = () => {}
  vi.stubGlobal('fetch', fetchMock)
  await import('../src/main')
})

afterEach(() => {
  fetchMock.mockReset()
})

function go(hash: string): void {
  window.location.hash = hash
  window.dispatchEvent(new Event('hashchange'))
}

function field(name: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const control = document.querySelector<HTMLInputElement>(`#complaint-${name}`)
  if (!control) throw new Error(`no field ${name}`)
  return control
}

function type(name: string, value: string): void {
  const control = field(name)
  control.value = value
  control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input'))
}

/** Submit the form; re-render only if it navigated, as a browser would. */
function submit(): void {
  const before = window.location.hash
  document
    .querySelector('form.complaint-form')
    ?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
  if (window.location.hash !== before) window.dispatchEvent(new Event('hashchange'))
}

const MALAYALAM = 'എന്റെ കാർഡ് നഷ്ടപ്പെട്ടു.\nആരോ ₹5,000 എടുത്തു.'

function fillRequired(): void {
  type('name', 'Anitha Menon')
  type('last4', '4321')
  type('incidentDate', '2026-10-20')
  type('amount', '5000')
  type('ownWords', MALAYALAM)
}

describe('Write complaint button', () => {
  it('is on every action card', () => {
    for (const id of ['sbi-debit', 'hdfc-upi', 'icici-debit', 'any-money']) {
      go(`#/action/${id}`)
      const link = document.querySelector<HTMLAnchorElement>(`a[href="#/complaint/${id}"]`)
      expect(link?.textContent, id).toBe('Write complaint')
    }
  })
})

describe('complaint form', () => {
  it('shows the safety line and has no field for OTP, PIN, CVV or a full number', () => {
    go('#/complaint/sbi-debit')
    expect(document.querySelector('.safety')?.textContent).toBe(
      'Turant never asks for OTP, PIN, CVV or your full account number.',
    )
    const form = document.querySelector('form.complaint-form')
    const safety = document.querySelector('.safety')
    expect(
      safety && form && safety.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    const labels = [...document.querySelectorAll('form label')].map((l) => l.textContent ?? '')
    for (const label of labels) expect(label).not.toMatch(/OTP|PIN|CVV|full (card|account)/i)
    expect((field('last4') as HTMLInputElement).maxLength).toBe(4)
  })

  it('prefills the bank from the card the user came from', () => {
    go('#/complaint/sbi-debit')
    expect(document.querySelector('#complaint-bank')).toBeNull()
    expect(document.querySelector('.complaint-form .fixed-value')?.textContent).toBe('SBI')
  })

  it('asks for the bank from Money stolen', () => {
    go('#/complaint/any-money')
    const select = field('bank') as HTMLSelectElement
    expect([...select.options].map((option) => option.value)).toEqual([
      '',
      'sbi',
      'hdfc',
      'icici',
      'axis',
      'pnb',
    ])
  })

  it('shows editable branch fields when there is no IFSC', () => {
    go('#/complaint/sbi-debit')
    expect(document.querySelector('#complaint-branch')).not.toBeNull()
    expect(document.querySelector('#complaint-address')).not.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('marks missing fields and stays on the form', () => {
    go('#/complaint/sbi-debit')
    submit()
    expect(window.location.hash).toBe('#/complaint/sbi-debit')
    expect(field('name').getAttribute('aria-invalid')).toBe('true')
    expect(document.querySelector('.form-error')?.textContent).not.toBe('')
  })

  it('keeps what was typed when the language changes', () => {
    go('#/complaint/sbi-debit')
    type('name', 'Ravi')
    const hindi = [...document.querySelectorAll<HTMLButtonElement>('.langs button')].find(
      (button) => button.textContent === 'हिंदी',
    )
    hindi?.click()
    expect(field('name').value).toBe('Ravi')
    const english = [...document.querySelectorAll<HTMLButtonElement>('.langs button')].find(
      (button) => button.textContent === 'English',
    )
    english?.click()
  })

  it('forgets everything once the user leaves the flow', () => {
    go('#/complaint/sbi-debit')
    type('name', 'Someone')
    go('#/action/sbi-debit')
    go('#/complaint/sbi-debit')
    expect(field('name').value).toBe('')
  })
})

describe('IFSC lookup', () => {
  it('fills branch and address from ifsc.razorpay.com', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ BANK: 'Example Bank', BRANCH: 'MAIN ROAD', ADDRESS: '1 MAIN ROAD, SOMETOWN' }),
    })
    go('#/complaint/sbi-debit')
    type('ifsc', 'abcd0123456')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe('https://ifsc.razorpay.com/ABCD0123456')
    await vi.waitFor(() => {
      expect(document.querySelector('.branch-found')?.textContent).toContain('MAIN ROAD')
    })
    expect(document.querySelector('.branch-found')?.textContent).toContain('1 MAIN ROAD, SOMETOWN')
  })

  it('falls back to editable fields when the lookup fails', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    go('#/action/sbi-debit')
    go('#/complaint/sbi-debit')
    type('ifsc', 'ABCD0123456')
    await vi.waitFor(() => {
      expect(document.querySelector('#complaint-branch')).not.toBeNull()
    })
    expect(document.querySelector('.branch-box .field-error')?.textContent).toContain(
      'Could not find this branch',
    )
  })

  it('does not look up an IFSC that does not match the format', () => {
    go('#/action/sbi-debit')
    go('#/complaint/sbi-debit')
    type('ifsc', 'ABCD1123456')
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('letter screen', () => {
  function makeLetter(): void {
    go('#/action/sbi-debit')
    go('#/complaint/sbi-debit')
    fillRequired()
    type('branch', 'Kakkanad')
    type('address', 'Civil Station Road, Ernakulam')
    type('branchEmail', 'branch@example.com')
    submit()
  }

  it('shows the letter with the user’s Malayalam words exactly', () => {
    makeLetter()
    expect(window.location.hash).toBe('#/complaint/sbi-debit/letter')
    const letter = document.querySelector('article.letter')
    expect(letter?.querySelector('.letter-own')?.textContent).toBe(MALAYALAM)
    expect(letter?.textContent).toContain('ending 4321')
    expect(letter?.textContent).toContain('Yours faithfully,')
    expect(letter?.querySelector('.sign-box')?.textContent).toBe('Signature')
  })

  it('emails without the card digits, to the pasted address', () => {
    makeLetter()
    const email = [...document.querySelectorAll<HTMLAnchorElement>('.letter-actions a')].find(
      (link) => link.textContent === 'Email it',
    )
    const href = email?.getAttribute('href') ?? ''
    expect(href.startsWith('mailto:branch@example.com?subject=')).toBe(true)
    expect(href).not.toContain('4321')
    expect(decodeURIComponent(href)).toContain('ending ____')
    expect(decodeURIComponent(href)).toContain('എന്റെ കാർഡ്')
  })

  it('shows the print tip and calls window.print', () => {
    makeLetter()
    expect(document.querySelector('.print-tip')?.textContent).toBe(
      'Print 2 copies. Give one to the branch and get the other stamped as proof.',
    )
    const print = vi.fn()
    window.print = print
    ;[...document.querySelectorAll<HTMLButtonElement>('.letter-actions button')]
      .find((button) => button.textContent === 'Print it')
      ?.click()
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('shows the branch address and a Google Maps link', () => {
    makeLetter()
    const visit = [...document.querySelectorAll<HTMLButtonElement>('.letter-actions button')].find(
      (button) => button.textContent === 'Take it to the branch',
    )
    const directions = document.querySelector<HTMLElement>('#branch-directions')
    expect(directions?.hidden).toBe(true)
    visit?.click()
    expect(directions?.hidden).toBe(false)
    expect(directions?.textContent).toContain('Civil Station Road, Ernakulam')
    expect(directions?.querySelector('a')?.getAttribute('href')).toBe(
      'https://www.google.com/maps/search/?api=1&query=' +
        encodeURIComponent('Kakkanad, Civil Station Road, Ernakulam'),
    )
  })

  it('never puts card digits in the page URL', () => {
    makeLetter()
    expect(window.location.href).not.toContain('4321')
  })

  it('sends the user back to the form when there is no draft', () => {
    go('#/')
    go('#/complaint/sbi-debit/letter')
    expect(document.querySelector('form.complaint-form')).not.toBeNull()
    expect(document.querySelector('article.letter')).toBeNull()
  })
})
