/**
 * The browser's own speech recognition (Web Speech API). Chrome and Edge send
 * the audio to the browser vendor's speech service; Safari uses Apple's.
 * Turant itself never receives the audio or the text over the network.
 *
 * Only the small, typed surface Turant uses is declared here, because the
 * TypeScript DOM library does not ship SpeechRecognition types.
 */

export type SpeechLang = 'en' | 'hi' | 'ml'

/** BCP 47 tags for the Indian variants of each language. */
export const SPEECH_LOCALES: Record<SpeechLang, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  ml: 'ml-IN',
}

export interface SpeechAlternative {
  readonly transcript: string
}

export interface SpeechResult {
  readonly isFinal: boolean
  readonly length: number
  readonly [index: number]: SpeechAlternative
}

export interface SpeechResultEvent {
  readonly resultIndex: number
  readonly results: { readonly length: number; readonly [index: number]: SpeechResult }
}

export interface SpeechErrorEvent {
  readonly error: string
}

export interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: ((event: SpeechErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

export type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

/** The standard or the WebKit-prefixed constructor, or undefined (Firefox). */
export function getSpeechRecognition(
  scope: object = typeof window === 'undefined' ? {} : window,
): SpeechRecognitionConstructor | undefined {
  const w = scope as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  const SR = w.SpeechRecognition || w.webkitSpeechRecognition
  return typeof SR === 'function' ? SR : undefined
}

/** The final text in a result event, trimmed. */
export function transcriptOf(event: SpeechResultEvent): string {
  const parts: string[] = []
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i]
    const text = result?.isFinal !== false ? result?.[0]?.transcript.trim() : ''
    if (text) parts.push(text)
  }
  return parts.join(' ')
}

/**
 * i18n key for a SpeechRecognition error code. Codes without their own
 * message use 'voice.errOther', which shows the code itself.
 */
export function speechErrorKey(code: string): string {
  switch (code) {
    case 'not-allowed':
      return 'voice.errNotAllowed'
    case 'network':
      return 'voice.errNetwork'
    case 'no-speech':
      return 'voice.errNoSpeech'
    case 'language-not-supported':
      return 'voice.errLanguage'
    default:
      return 'voice.errOther'
  }
}
