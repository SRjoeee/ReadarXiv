// The reader's states (the reader's design, §8) as what the capsule, the progress line and the card show: one anatomy,
// an icon, one sentence, at most one action. Reading shows nothing; a translation on screen is never covered by a
// failure's card
import type { ProviderErrorKind } from '@/providers/types'
import { R, S, languageName, reasonText } from '@/ui/strings'
import type { ReaderState } from '../controller'

export type Capsule =
  /** the paper cannot be had as a bilingual PDF: said, with its HTML version (`href`) offered where there is one; not
   *  closable */
  | { kind: 'unavailable'; text: string; href?: string }
  | { kind: 'notice'; text: string; action: 'retry' }
  | { kind: 'unsupported'; text: string; action: 'language' }
  | { kind: 'narrow'; text: string }
export interface Card { reason: string; action: 'retry' | 'settings' }

/** the reasons a key settles: the settings are where it is fixed (the popup's rule) */
const KEYS: ReadonlySet<ProviderErrorKind> = new Set(['no-key', 'auth'])

/** a translation under way: the progress line shows it, and no capsule does (the maintainer, 2026-09-25) */
const running = (state: ReaderState) => state.phase === 'translating' || state.phase === 'retranslating'

export function capsuleOf(state: ReaderState, seen: { closed: boolean; narrowShown: boolean }): Capsule | null {
  if (state.phase === 'failed' || state.phase === 'loading') return null
  // before anything else: it says why the translated displays are greyed (the maintainer, 2026-09-26)
  if (!state.available) return state.htmlVersion ? { kind: 'unavailable', text: R.status.noPdf, href: state.htmlVersion } : { kind: 'unavailable', text: R.status.noPdf }
  if (!state.languageSupported && state.settings) return { kind: 'unsupported', text: R.status.unsupported(languageName(state.settings.targetLanguage)), action: 'language' }
  // the paragraphs that failed are told once the run has ended, with its retry
  if (!running(state) && state.failedUnits > 0 && !seen.closed) return { kind: 'notice', text: S.failed.text(state.failedUnits), action: 'retry' }
  if (state.narrow && state.display === 'bilingual' && !seen.narrowShown) return { kind: 'narrow', text: R.status.narrow }
  return null
}

/** what is under way, said to screen readers in the status region: the progress line is decorative, and no capsule shows it */
export function spokenOf(state: ReaderState): string {
  return state.phase === 'loading' ? R.status.loading : state.phase === 'translating' ? R.status.translating : state.phase === 'retranslating' ? R.status.again : ''
}

/**
 * The progress line under the toolbar, all that shows a load or a translation under way (the maintainer, 2026-09-25):
 * the PDF's download while the reader loads, the share of paragraphs translated while a translation runs. A stage is a
 * line of its own: the translation's starts afresh rather than the download's shrinking back
 */
export interface Line { on: boolean; stage: 'load' | 'run'; value: number }
export function lineOf(state: ReaderState): Line {
  if (state.phase === 'loading') return { on: true, stage: 'load', value: state.loaded }
  return { on: running(state), stage: 'run', value: state.progress }
}

export function cardOf(state: ReaderState): Card | null {
  if (state.phase !== 'failed' || state.failure === 'aborted') return null
  const kind = state.failure ?? 'unknown'
  // the chain's own words for a rate limit promise a retry by itself; a stopped run here waits for the reader's
  return { reason: kind === 'rate-limit' ? R.status.rateLimited : reasonText(kind), action: KEYS.has(kind) ? 'settings' : 'retry' }
}
