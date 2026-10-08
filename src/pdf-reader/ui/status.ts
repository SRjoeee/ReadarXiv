// The reader's states (the reader's design, §8) as what the capsule, the progress line and the card show: one anatomy,
// an icon, one sentence, at most one action. Reading shows nothing; a translation on screen is never covered by a
// failure's card. A capsule's sentence is its words in parts (capsule-words.ts): a count drawn in cells of its own, a
// language's own name drawn in that language
import { toBcp47 } from '@/config/languages'
import type { ProviderErrorKind } from '@/providers/types'
import { O, R, S, reasonText } from '@/ui/strings'
import type { ReaderState } from '../controller'
import { type CapsuleWords, plain, withCount, withPart } from './capsule-words'
import { ownName } from './languages'

export type Capsule =
  /** the paper cannot be had as a bilingual PDF: said, with its HTML version (`href`) offered where there is one; not
   *  closable */
  | { kind: 'unavailable'; words: CapsuleWords; href?: string }
  /** the translation shown in part (S-R-19): said, with the HTML version offered where there is one; closable */
  | { kind: 'partial'; words: CapsuleWords; href?: string }
  /** passages that failed (S-P-60): with its retry (S-P-61) only where the run stopped for a reason a retry mends
   *  (`failure`); the passages the typesetting left in the original fail the same way again, until a new version (I-5
   *  of 2026-10-04) */
  | { kind: 'notice'; words: CapsuleWords; action: 'retry' | null }
  | { kind: 'unsupported'; words: CapsuleWords; action: 'language' }
  | { kind: 'narrow'; words: CapsuleWords }
  /** the settings could not be read, or did not answer in time, and the defaults are in use (S-R-21): said for as long
   *  as it is so, with the way to the settings page; not closable */
  | { kind: 'unreadable'; words: CapsuleWords }
  /** a write of the settings that storage refused (S-R-22): the settings page's one sentence for a failed save, until it
   *  is closed, or a later write lands; closable */
  | { kind: 'saveFailed'; words: CapsuleWords }
/** `arxiv`: a link to arXiv, for an address that names no paper (S-R-20) */
export interface Card { reason: string; action: 'retry' | 'settings' | 'arxiv' }

/** the reasons a key settles: the settings are where it is fixed (the popup's rule) */
const KEYS: ReadonlySet<ProviderErrorKind> = new Set(['no-key', 'auth'])

/** a translation under way: the progress line shows it, and no capsule does (the maintainer, 2026-09-25) */
const running = (state: ReaderState) => state.phase === 'translating' || state.phase === 'retranslating'

/**
 * What the reader has done with the notices this visit (StatusCapsule keeps it). The two closable notices are closed
 * apart: one stood before the other, so a close of the partial one that also closed the count of failed passages kept
 * the count from ever being told (Devin on #314). `refusalsSeen`: the refused writes closed
 */
export interface Seen { partialClosed: boolean; noticeClosed: boolean; narrowShown: boolean; refusalsSeen: number }

export function capsuleOf(state: ReaderState, seen: Seen): Capsule | null {
  // what the reader just did or cannot do, over a load too (its controls are in reach then), but not beside a failure's
  // card, which is the pane's whole answer: the unreadable settings first, since they are why a write is refused. They
  // are true of an address with no paper too, whose controls they explain, and stand beside its card
  if (state.phase !== 'failed') {
    if (state.settingsUnreadable) return { kind: 'unreadable', words: plain(R.status.unreadable) }
    if (state.refusals > Math.max(seen.refusalsSeen, state.mended)) return { kind: 'saveFailed', words: plain(O.saveFailed) }
  }
  // no paper: its card says that much, and nothing about a paper is true of it
  if (state.noPaper || state.phase === 'failed' || state.phase === 'loading') return null
  // before anything else: it says why the translated displays are greyed (the maintainer, 2026-09-26)
  if (!state.available) return state.htmlVersion ? { kind: 'unavailable', words: plain(R.status.noPdf), href: state.htmlVersion } : { kind: 'unavailable', words: plain(R.status.noPdf) }
  if (!state.languageSupported && state.settings) {
    // the language named by its own name, and drawn in its own language: the name a part with the target's tag as its
    // `lang` (Devin on #313)
    const code = state.settings.targetLanguage, name = ownName(code)
    return { kind: 'unsupported', words: withPart(R.status.unsupported(name), { text: name, lang: toBcp47(code) }), action: 'language' }
  }
  // before the notice of passages that failed: the passages left in the original are more than those
  if (!running(state) && state.partial && !seen.partialClosed) return state.htmlVersion ? { kind: 'partial', words: plain(R.status.partial), href: state.htmlVersion } : { kind: 'partial', words: plain(R.status.partial) }
  // the paragraphs that failed are told once the run has ended, with its retry where a stop is there to resume
  if (!running(state) && state.failedUnits > 0 && !seen.noticeClosed) return { kind: 'notice', words: withCount(S.failed.text(state.failedUnits), state.failedUnits), action: state.failure ? 'retry' : null }
  if (state.narrow && state.display === 'bilingual' && !seen.narrowShown) return { kind: 'narrow', words: plain(R.status.narrow) }
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
  if (state.noPaper) return { reason: R.status.noPaper, action: 'arxiv' }
  if (state.phase !== 'failed' || state.failure === 'aborted') return null
  const kind = state.failure ?? 'unknown'
  // the chain's own words for a rate limit promise a retry by itself; a stopped run here waits for the reader's
  return { reason: kind === 'rate-limit' ? R.status.rateLimited : reasonText(kind), action: KEYS.has(kind) ? 'settings' : 'retry' }
}
