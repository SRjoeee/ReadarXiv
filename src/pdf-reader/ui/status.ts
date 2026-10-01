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
 * one line over the whole process, which never starts again (the maintainer asked why it ran twice, 2026-10-02) — the
 * PDF's download its first stretch when a translation follows it (all of it when the original alone is shown), then
 * the paragraphs translated, then the typesetting the final waits for, which moves with each compile that ends — half
 * the rest at each, since how many are left is not known (the marked original, a measure, a strategy failed), the end
 * only with the final on screen. That last stretch is half the run's: with a service that answers in seconds, the
 * compiles are most of the wait, and the line stood at 0.87 for 60–90 % of the process while they ran (the F2
 * review's M1)
 */
export interface Line { on: boolean; value: number }
/** the line's share for the download where a translation follows it, and the typesetting's of the run's */
const DOWNLOAD = 0.15, FINAL = 0.5
export function lineOf(state: ReaderState): Line {
  if (state.phase === 'loading') return { on: true, value: state.loaded * (state.display === 'original' ? 1 : DOWNLOAD) }
  const typeset = state.finishing < 0 ? 0 : 1 - 2 ** -state.finishing
  const run = state.shown === 'final' ? 1 : (1 - FINAL) * state.progress + FINAL * typeset
  return { on: running(state), value: DOWNLOAD + (1 - DOWNLOAD) * run }
}

export function cardOf(state: ReaderState): Card | null {
  if (state.phase !== 'failed' || state.failure === 'aborted') return null
  const kind = state.failure ?? 'unknown'
  // the chain's own words for a rate limit promise a retry by itself; a stopped run here waits for the reader's
  return { reason: kind === 'rate-limit' ? R.status.rateLimited : reasonText(kind), action: KEYS.has(kind) ? 'settings' : 'retry' }
}
