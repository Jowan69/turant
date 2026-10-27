/**
 * Speech transcript -> one of the actions Turant already ships.
 * Kept free of DOM and window access so the routing layer can be tested on its
 * own, separately from the microphone and the speech-recognition API.
 */

import { matchIntent, type BankId, type Problem } from './match'

export interface VoiceRouteAction {
  id: string
  bank: string
  problem: Problem
}

export type SpeechRoute =
  | { kind: 'action'; id: string }
  | { kind: 'bank'; bank: BankId }
  | { kind: 'none' }

/**
 * Resolve a transcript to an action that exists in `actions`, a bank screen
 * when only the bank was heard, or nothing. It never invents an id: an action
 * route is only returned when the id is present in the supplied data.
 */
export function resolveSpeechRoute(
  transcript: string,
  actions: readonly VoiceRouteAction[],
): SpeechRoute {
  const match = matchIntent(transcript)
  if (!match) return { kind: 'none' }

  if (match.problem === 'money_taken') {
    const stolen =
      actions.find((action) => action.id === 'any-money') ??
      actions.find((action) => action.problem === 'money_taken')
    if (stolen) return { kind: 'action', id: stolen.id }
  }

  if (!match.bank) return { kind: 'none' }

  if (match.problem) {
    const action = actions.find(
      (entry) => entry.bank === match.bank && entry.problem === match.problem,
    )
    if (action) return { kind: 'action', id: action.id }
  }

  return { kind: 'bank', bank: match.bank }
}
