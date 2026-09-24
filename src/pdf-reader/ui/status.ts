// The reader's states (the reader's design, §8) as what the capsule and the card show: one anatomy, an icon, one
// sentence, at most one action. Reading shows nothing; a translation on screen is never covered by a failure's card
import type { ProviderErrorKind } from '@/providers/types'
import { R, S, languageName, reasonText } from '@/ui/strings'
import type { ReaderState } from '../controller'

export type Capsule =
  | { kind: 'progress'; text: string; progress: number }
  | { kind: 'notice'; text: string; action: 'retry' }
  | { kind: 'unsupported'; text: string; action: 'language' }
  | { kind: 'narrow'; text: string }
export interface Card { reason: string; action: 'retry' | 'settings' }

/** the reasons a key settles: the settings are where it is fixed (the popup's rule) */
const KEYS: ReadonlySet<ProviderErrorKind> = new Set(['no-key', 'auth'])

export function capsuleOf(state: ReaderState, seen: { closed: boolean; narrowShown: boolean }): Capsule | null {
  if (state.phase === 'failed') return null
  if (state.phase === 'loading') return { kind: 'progress', text: R.status.loading, progress: state.progress }
  if (state.phase === 'translating') return { kind: 'progress', text: R.status.translating, progress: state.progress }
  if (state.phase === 'retranslating') return { kind: 'progress', text: R.status.again, progress: state.progress }
  if (!state.languageSupported && state.settings) return { kind: 'unsupported', text: R.status.unsupported(languageName(state.settings.targetLanguage)), action: 'language' }
  if (state.failedUnits > 0 && !seen.closed) return { kind: 'notice', text: S.failed.text(state.failedUnits), action: 'retry' }
  if (state.narrow && state.display === 'bilingual' && !seen.narrowShown) return { kind: 'narrow', text: R.status.narrow }
  return null
}

export function cardOf(state: ReaderState): Card | null {
  if (state.phase !== 'failed' || state.failure === 'aborted') return null
  const kind = state.failure ?? 'unknown'
  return { reason: reasonText(kind), action: KEYS.has(kind) ? 'settings' : 'retry' }
}
