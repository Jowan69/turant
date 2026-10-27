import { describe, expect, it } from 'vitest'
import {
  buildMailtoUri,
  buildMapsUri,
  buildSmsUri,
  buildTelUri,
  fillTemplate,
  isEmailAddress,
} from '../src/links'

describe('fillTemplate', () => {
  it('fills the last four digits', () => {
    expect(fillTemplate('BLOCK{last4}', { last4: '1234' })).toBe('BLOCK1234')
  })

  it('keeps only digits from what the user typed', () => {
    expect(fillTemplate('BLOCK DC {last4}', { last4: ' 1a2-3 4 ' })).toBe('BLOCK DC 1234')
  })

  it('fills a full card number without separators', () => {
    expect(fillTemplate('HOT {card}', { card: '4111 1111 1111 1111' })).toBe(
      'HOT 4111111111111111',
    )
  })

  it('leaves a template without placeholders unchanged', () => {
    expect(fillTemplate('BLOCK UPI')).toBe('BLOCK UPI')
  })

  it('inserts nothing for a value the user did not type', () => {
    expect(fillTemplate('HOT {card}', { last4: '1234' })).toBe('HOT ')
  })
})

describe('buildSmsUri', () => {
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36'

  it('uses ?body= on Android', () => {
    expect(buildSmsUri('567676', 'BLOCK1234', android)).toBe('sms:567676?body=BLOCK1234')
  })

  it('percent-encodes the body', () => {
    expect(buildSmsUri('7308080808', 'BLOCK DC 1234', android)).toBe(
      'sms:7308080808?body=BLOCK%20DC%201234',
    )
  })

  it('uses &body= on iPhone, iPad and iPod', () => {
    const body = encodeURIComponent('BLOCK CC 9876')
    expect(buildSmsUri('7308080808', 'BLOCK CC 9876', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe(
      `sms:7308080808&body=${body}`,
    )
    expect(buildSmsUri('7308080808', 'BLOCK CC 9876', 'Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe(
      `sms:7308080808&body=${body}`,
    )
    expect(buildSmsUri('7308080808', 'BLOCK CC 9876', 'Mozilla/5.0 (iPod touch)')).toBe(
      `sms:7308080808&body=${body}`,
    )
  })
})

describe('buildTelUri', () => {
  it('builds a tel link', () => {
    expect(buildTelUri('1930')).toBe('tel:1930')
  })

  it('keeps a +91 number as supplied by the data', () => {
    expect(buildTelUri('+912267987700')).toBe('tel:+912267987700')
  })
})

describe('buildMailtoUri', () => {
  it('puts the address before ? and encodes subject and body', () => {
    expect(buildMailtoUri('branch@example.com', 'Card lost', 'Line one\nLine two')).toBe(
      'mailto:branch@example.com?subject=Card%20lost&body=Line%20one%0D%0ALine%20two',
    )
  })

  it('leaves the To: line empty when no address is given', () => {
    expect(buildMailtoUri('', 'S', 'B')).toBe('mailto:?subject=S&body=B')
  })

  it('drops an address that could break the link', () => {
    expect(buildMailtoUri('a@b.com?bcc=x@y.com', 'S', 'B')).toBe('mailto:?subject=S&body=B')
    expect(isEmailAddress('not an email')).toBe(false)
    expect(isEmailAddress(' branch@example.co.in ')).toBe(true)
  })

  it('keeps Malayalam and & safe inside the body', () => {
    const body = 'കാർഡ് & പണം'
    const uri = buildMailtoUri('', 'S', body)
    expect(decodeURIComponent(uri.split('&body=')[1])).toBe(body)
  })
})

describe('buildMapsUri', () => {
  it('builds a Google Maps search with the encoded query', () => {
    expect(buildMapsUri('Main Road, Sometown & Co')).toBe(
      'https://www.google.com/maps/search/?api=1&query=Main%20Road%2C%20Sometown%20%26%20Co',
    )
  })
})
