import { describe, expect, it } from 'vitest'
import actionsData from '../data/actions.json'
import { resolveSpeechRoute, type VoiceRouteAction } from '../src/voice'

const actions = actionsData as unknown as VoiceRouteAction[]

/** The three phrases from the bug report, exactly as they are spoken. */
const REPORTED = [
  {
    language: 'Malayalam',
    phrase: 'എന്റെ എസ്ബിഐ കാർഡ് നഷ്ടപ്പെട്ടു',
    actionId: 'sbi-debit',
  },
  {
    language: 'Hindi',
    phrase: 'मेरा HDFC कार्ड खो गया',
    actionId: 'hdfc-debit',
  },
  {
    language: 'English',
    phrase: 'my axis card is stolen',
    actionId: 'axis-debit',
  },
] as const

describe('spoken phrase -> existing action', () => {
  it.each(REPORTED)('$language: $phrase', ({ phrase, actionId }) => {
    expect(resolveSpeechRoute(phrase, actions)).toEqual({ kind: 'action', id: actionId })
  })

  it("routes each phrase to an id that exists in data/actions.json", () => {
    for (const testCase of REPORTED) {
      const route = resolveSpeechRoute(testCase.phrase, actions)
      expect(route).toEqual({ kind: 'action', id: testCase.actionId })
      expect(actions.map((action) => action.id)).toContain(testCase.actionId)
    }
  })

  it('routes each phrase to the expected debit-card action', () => {
    for (const { actionId } of REPORTED) {
      const action = actions.find((entry) => entry.id === actionId)
      expect(action?.problem, actionId).toBe('debit_lost')
      expect(action?.bank, actionId).not.toBe('any')
    }
  })
})

describe('resolveSpeechRoute fallbacks', () => {
  it('opens the bank screen when only the bank was heard', () => {
    expect(resolveSpeechRoute('SBI', actions)).toEqual({ kind: 'bank', bank: 'sbi' })
  })

  it('asks for the bank when only the problem was heard', () => {
    expect(resolveSpeechRoute('my card is lost', actions)).toEqual({ kind: 'none' })
  })

  it('returns none for speech with no bank and no problem', () => {
    expect(resolveSpeechRoute('what is the weather today', actions)).toEqual({ kind: 'none' })
  })

  it('never returns an action id that is absent from the data', () => {
    const emptied: VoiceRouteAction[] = []
    expect(resolveSpeechRoute('my axis card is stolen', emptied)).toEqual({
      kind: 'bank',
      bank: 'axis',
    })
  })
})
