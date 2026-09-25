// The reader's states (the reader's design, §8) as what the capsule, the progress line and the card show: one anatomy,
// an icon, one sentence, at most one action. Reading shows nothing; a translation on screen is never covered by a
// failure's card
import type { ProviderErrorKind } from '@/providers/types'
import { R, S, languageName, reasonText } from '@/ui/strings'
import type { ReaderState } from '../controller'

export type Capsule =
  | { kind: 'progress'; text: string }
  | { kind: 'notice'; text: string; action: 'retry' }
  | { kind: 'unsupported'; text: string; action: 'language' }
  | { kind: 'narrow'; text: string }
export interface Card { reason: string; action: 'retry' | 'settings' }

/** the reasons a key settles: the settings are where it is fixed (the popup's rule) */
const KEYS: ReadonlySet<ProviderErrorKind> = new Set(['no-key', 'auth'])

export function capsuleOf(state: ReaderState, seen: { closed: boolean; narrowShown: boolean }): Capsule | null {
  if (state.phase === 'failed') return null
  if (state.phase === 'loading') return { kind: 'progress', text: R.status.loading }
  if (state.phase === 'translating') return { kind: 'progress', text: R.status.translating }
  if (state.phase === 'retranslating') return { kind: 'progress', text: R.status.again }
  if (!state.languageSupported && state.settings) return { kind: 'unsupported', text: R.status.unsupported(languageName(state.settings.targetLanguage)), action: 'language' }
  if (state.failedUnits > 0 && !seen.closed) return { kind: 'notice', text: S.failed.text(state.failedUnits), action: 'retry' }
  if (state.narrow && state.display === 'bilingual' && !seen.narrowShown) return { kind: 'narrow', text: R.status.narrow }
  return null
}

/**
 * The progress line under the toolbar (the maintainer, 2026-09-25: the capsule says what is under way, the line how far
 * it has come): the PDF's download while the reader loads, the share of paragraphs translated while a translation runs.
 * A stage is a line of its own: the translation's starts afresh rather than the download's shrinking back
 */
export interface Line { on: boolean; stage: 'load' | 'run'; value: number }
export function lineOf(state: ReaderState): Line {
  if (state.phase === 'loading') return { on: true, stage: 'load', value: state.loaded }
  const running = state.phase === 'translating' || state.phase === 'retranslating'
  return { on: running, stage: 'run', value: state.progress }
}

export function cardOf(state: ReaderState): Card | null {
  if (state.phase !== 'failed' || state.failure === 'aborted') return null
  const kind = state.failure ?? 'unknown'
  return { reason: reasonText(kind), action: KEYS.has(kind) ? 'settings' : 'retry' }
}
