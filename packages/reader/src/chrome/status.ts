// The reader's states (the reader's design, §8) as what the capsule, the progress line and the card show: one anatomy,
// an icon, one sentence, at most one action. Reading shows nothing; a translation on screen is never covered by a
// failure's card. A capsule's sentence is its words in parts (capsule-words.ts): a count drawn in cells of its own, a
// language's own name drawn in that language. Every sentence is the catalogue's, or the host's for its state where it gives
// one (parts.tsx StateWords: the website's own)
import { O, type ProviderErrorKind, R, S } from '@readarxiv/ui'
import { LASTING, type ReaderState } from './model.ts'
import { type CapsuleWords, plain, withCount, withPart } from './capsule-words.ts'
import type { Languages, Parts, StateWords } from './parts.tsx'

export type Capsule =
  /** the paper cannot be had as a bilingual PDF: said, with its HTML version (`href`) offered where there is one; not
   *  closable. `label`: the link's words where the host gives its own (StateWords `useHtml`) */
  | { kind: 'unavailable'; words: CapsuleWords; href?: string; label?: string }
  /** the bilingual version cannot be had right now (our server out of reach, S-R-24; or at its limit, a 429, S-R-26: its own
   *  words): said, with its retry and the HTML version offered where there is one; passing, not remembered; not closable.
   *  `wait`: its retry withheld until its time (a host's rule, parts.tsx `retry`: the website's) */
  | { kind: 'notNow'; words: CapsuleWords; href?: string; label?: string; wait?: true }
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
  /** a host's passing words (ReaderController.toast: the website's "copied"), in its words and sign, for their time */
  | { kind: 'toast'; words: CapsuleWords; icon: 'check' | 'info' }
  /** a run under way, in the host's words where it gives them (the website's): with the spinner, its count a part of its own;
   *  none where the host words none (the progress line alone shows it, the maintainer's of 2026-09-25). `show`: the chip that
   *  shows the translation (StateWords `showTranslation`), where it is not on screen and some of it is there */
  | { kind: 'progress'; stage: Stage; words: CapsuleWords; show?: true }
/** where a run under way stands, as a host's words say it */
export type Stage = 'queued' | 'preparing' | 'translating' | 'reconnecting'
/** `arxiv`: a link to arXiv, for an address that names no paper (S-R-20) */
export interface Card {
  reason: string
  action: 'retry' | 'settings' | 'arxiv'
}

/** the reasons a key settles: the settings are where it is fixed (the popup's rule) */
const KEYS: ReadonlySet<ProviderErrorKind> = new Set(['no-key', 'auth'])

/** a translation or a prepare under way: the progress line shows it, and no capsule does (the maintainer, 2026-09-25) */
const running = (state: ReaderState) => state.phase === 'translating' || state.phase === 'preparing'

/** What the reader has done with the notices this visit (StatusCapsule keeps it). `refusalsSeen`: the refused writes closed */
export interface Seen {
  noticeClosed: boolean
  narrowShown: boolean
  refusalsSeen: number
}

/** a run under way and where it stands: our server's document not heard for now; the paper's layer being made while its
 *  prepare lasts (its place in the queue where our server names one), the rows its units start meanwhile counted under it,
 *  as the website says it; else the paragraphs translated. Null where none is under way */
export function stageOf(state: ReaderState): Stage | null {
  if (!running(state)) return null
  if (state.reconnecting) return 'reconnecting'
  if (state.preparing) return state.preparing.position != null ? 'queued' : 'preparing'
  return 'translating'
}
/** some of the translation is there to be read: a page laid, or the layer's pages known and rows of them in (the website's
 *  "drawn": the layer's first rows taken this visit) */
export const translationThere = (state: ReaderState): boolean =>
  state.layer.laid > 0 || (state.layer.total > 0 && state.translated.got > 0)
/** a run's stage in the host's words, or null where it gives none; `chip`: the chip that shows the translation beside them */
function stageWords(stage: Stage, state: ReaderState, words: StateWords, chip: boolean): CapsuleWords | null {
  if (stage === 'queued') return words.queued ? plain(words.queued(state.preparing?.position ?? 0)) : null
  if (stage === 'translating') {
    const { got, total } = state.translated
    return words.translating ? withCount(words.translating(got, total, chip), got) : null
  }
  const w = words[stage]
  return w ? plain(w) : null
}

/** the link beside a bilingual version not to be had: arXiv's HTML version, or where the host says (its address and words), or
 *  none where it offers none */
function htmlLink(html: string | null, words: StateWords): { href: string; label?: string } | null {
  if (!html) return null
  if (!words.useHtml) return { href: html }
  const own = words.useHtml(html)
  return own ? { href: own.href, label: own.label } : null
}

export function capsuleOf(
  state: ReaderState,
  seen: Seen,
  languages: Pick<Languages, 'name' | 'tag'>,
  words: StateWords = {},
  rules: Rules = {},
): Capsule | null {
  // a host's passing words first, over whatever else stands, for their time: what the reader just did (the website's)
  if (state.toast) return { kind: 'toast', words: plain(state.toast.words), icon: state.toast.icon }
  // what the reader just did or cannot do, over a load too (its controls are in reach then), but not beside a failure's
  // card, which is the pane's whole answer: the unreadable settings first, since they are why a write is refused. They
  // are true of an address with no paper too, whose controls they explain, and stand beside its card
  if (state.phase !== 'failed') {
    if (state.settingsUnreadable) return { kind: 'unreadable', words: plain(words.unreadable ?? R.status.unreadable) }
    if (state.refusals > Math.max(seen.refusalsSeen, state.mended))
      return { kind: 'saveFailed', words: plain(words.saveFailed ?? O.saveFailed) }
  }
  // no paper: its card says that much, and nothing about a paper is true of it
  if (state.noPaper || state.phase === 'failed' || state.phase === 'loading') return null
  // before anything else: it says why the translated displays are greyed (the maintainer, 2026-09-26)
  if (!state.available) {
    const said = plain(
      (state.unavailable?.why === 'too-large' ? words.tooLarge : undefined) ?? words.noPdf ?? R.status.noPdf,
    )
    const html = htmlLink(state.htmlVersion, words)
    return html ? { kind: 'unavailable', words: said, ...html } : { kind: 'unavailable', words: said }
  }
  if (!state.languageSupported && state.prefs) {
    // the language named by its own name, and drawn in its own language: the name a part with the target's tag as its
    // `lang`
    const code = state.prefs.target,
      name = languages.name(code)
    return {
      kind: 'unsupported',
      words: withPart((words.unsupported ?? R.status.unsupported)(name), { text: name, lang: languages.tag(code) }),
      action: 'language',
    }
  }
  // a run under way, where the host words it (the website's stage and count); else the progress line alone shows it
  const stage = stageOf(state)
  // (the translation not on screen and some of it there: the host's chip shows it)
  const show = !!words.showTranslation && state.display === 'original' && translationThere(state)
  const said = stage && stageWords(stage, state, words, show)
  if (stage && said)
    return show ? { kind: 'progress', stage, words: said, show } : { kind: 'progress', stage, words: said }
  // the bilingual version not to be had now: the original stays readable, and a retry is offered with the HTML version
  // (the layer-only plan's "Offline, drafted")
  const why = state.unavailable?.why
  // (a 429 is our server's limit, said as such: past the run's few waits it asks no more by itself, and the reader's retry is
  // what asks again, #88 E5; busy, its capacity, said as the limit unless the host words it)
  if (!running(state) && (why === 'refused' || why === 'busy' || why === 'unreachable')) {
    const at = state.unavailable?.retryAt ?? null
    const text =
      why === 'unreachable'
        ? (words.notNow?.(at) ?? R.status.notNow)
        : ((why === 'busy' ? words.busy?.(at) : undefined) ?? words.limited?.(at) ?? R.status.limited)
    const notNow = plain(text)
    // (its retry offered at once, or at its time where the host's rule says so: a retry before it asks nothing)
    const wait = withheld(state, rules) ? { wait: true as const } : {}
    const html = htmlLink(state.htmlVersion, words)
    return html ? { kind: 'notNow', words: notNow, ...html, ...wait } : { kind: 'notNow', words: notNow, ...wait }
  }
  // the paragraphs that failed are told once the run has ended, with its retry where a stop is there to resume
  if (!running(state) && state.failedUnits > 0 && !seen.noticeClosed)
    return {
      kind: 'notice',
      words: withCount((words.failedPassages ?? S.failed.text)(state.failedUnits), state.failedUnits),
      action: state.failure && !withheld(state, rules) ? 'retry' : null,
    }
  if (state.narrow && state.display === 'bilingual' && !seen.narrowShown)
    return { kind: 'narrow', words: plain(words.narrow ?? R.status.narrow) }
  return null
}

/** what is under way, said to screen readers in the status region: the progress line is decorative, and no capsule shows it
 *  (where a host's words show it, the capsule says them itself) */
export function spokenOf(state: ReaderState): string {
  return state.phase === 'loading'
    ? R.status.loading
    : state.phase === 'preparing'
      ? R.status.preparing
      : state.phase === 'translating'
        ? R.status.translating
        : ''
}

/**
 * The progress line under the toolbar, all that shows a load or a translation under way (the maintainer, 2026-09-25):
 * one line over the whole process, which never starts again (the maintainer asked why it ran twice, 2026-10-02;
 * ProgressLine holds the longest it reached) — the PDF's download its first stretch when a translation follows it (all of
 * it when the original alone is shown), then, where the paper's layer is being prepared, half the rest as its prepare
 * comes along, then the paragraphs translated to the end
 */
export interface Line {
  on: boolean
  value: number
}
/** the line's share for the download where a translation follows it, and the prepare's of the rest */
const DOWNLOAD = 0.15,
  PREPARE = 0.5
export function lineOf(state: ReaderState): Line {
  if (state.phase === 'loading')
    return { on: true, value: state.loaded * (state.display === 'original' ? 1 : DOWNLOAD) }
  if (state.phase === 'preparing')
    return { on: true, value: DOWNLOAD + (1 - DOWNLOAD) * PREPARE * (state.preparing?.progress ?? 0) }
  return { on: running(state), value: DOWNLOAD + (1 - DOWNLOAD) * state.progress }
}

/** a refusal for now with nothing of the translation laid: the bilingual version not to be had now, and none of it on screen */
export const refusedNow = (state: ReaderState): boolean =>
  state.available && state.unavailable !== null && !LASTING.has(state.unavailable.why) && state.layer.laid === 0
/**
 * The original held on screen by the host's rules (parts.tsx; ReaderController `hold`): a refusal for now with nothing laid,
 * where `refusal` is `original`; in a narrow window where `narrow` is `shown`, until the reader chooses a display, while the
 * paper is made (prepared, or translated after a prepare this visit) or refused for now with nothing laid (the website's
 * displayFor). Neither rule given (the extension's): never
 */
export function heldOf(state: ReaderState, rules: Pick<Parts, 'narrow' | 'refusal'>): boolean {
  if (state.noPaper) return false
  if (rules.refusal === 'original' && refusedNow(state)) return true
  if (rules.narrow !== 'shown' || !state.narrow || state.chose) return false
  return (
    state.preparing !== null ||
    state.phase === 'preparing' ||
    (state.made && state.phase === 'translating') ||
    refusedNow(state)
  )
}

/** the original's pane's card, where the original could not be read and the host draws its loss there (StateWords
 *  `openOriginal`: the website's): its words, and arXiv's PDF of the version as its link; null otherwise */
export interface OriginalCard {
  reason: string
  href: string
  label: string
}
export function originalCardOf(
  state: ReaderState,
  reason: (kind: ProviderErrorKind) => string,
  words: StateWords = {},
): OriginalCard | null {
  if (state.noPaper || state.failures.pdf === null || !words.openOriginal || !state.paper.id) return null
  return {
    reason: words.originalLost ?? reason(state.failures.pdf),
    href: `https://arxiv.org/pdf/${state.paper.id}`,
    label: words.openOriginal,
  }
}

/** a capsule's or a card's sign (parts.tsx `signs`): the information sign, a run's spinner, a toast's check; a clock for a wait
 *  (a retry's time to come), the alert for a failure, the file for the original that could not be shown */
export type Sign = 'info' | 'check' | 'spinner' | 'clock' | 'alert' | 'file'
/** what a capsule or a card is drawn with: its sign, and its tone where the host's rule gives one (`alert`: the sign in the
 *  danger's red; `wait`: a card's sign in quiet ink) */
export interface Look {
  sign: Sign
  tone?: 'alert' | 'wait'
}
/** the failures that are a wait, not a fault: our server or the service out of reach for now, a limit */
const WAITS: ReadonlySet<ProviderErrorKind> = new Set(['network', 'timeout', 'rate-limit'])

/** the time a retry is due where one is still to come at `now`: a refusal's for now (its `retryAt`), else the run's failure's
 *  (a rows' wait); null where none is named, or it has come */
export function dueAt(state: ReaderState, now: number): number | null {
  const u = state.unavailable
  const at = u && !LASTING.has(u.why) ? u.retryAt : state.failureAt
  return at !== null && at > now ? at : null
}
/** the time a retry of the card's failure is due where one is still to come (a rows' wait; not the original's, whose own retry
 *  is at once); null where none */
export function cardDueAt(state: ReaderState, now: number): number | null {
  const at = state.failures.pdf === null ? state.failureAt : null
  return at !== null && at > now ? at : null
}
/** the host's rules a state is drawn by beside its words (parts.tsx), and the time it is drawn at */
export interface Rules {
  retry?: Parts['retry']
  now?: number
}
/** a retry withheld for now: the host's rule offers it at its time (`when-due`), and that time is still to come */
const withheld = (state: ReaderState, rules: Rules) =>
  rules.retry === 'when-due' && dueAt(state, rules.now ?? Date.now()) !== null

/** how a capsule is drawn: by the host's rule for the signs (parts.tsx `signs`) */
export function capsuleLook(c: Capsule, state: ReaderState, signs: Parts['signs'], now: number): Look {
  if (c.kind === 'progress') return { sign: 'spinner' }
  if (c.kind === 'toast') return { sign: c.icon }
  if (signs !== 'by-state') return { sign: 'info' }
  // (a refusal for now: the clock while its time is to come; a run stopped by a fault, not a wait: the alert)
  if (c.kind === 'notNow') return { sign: dueAt(state, now) !== null ? 'clock' : 'info' }
  if (c.kind === 'notice' && c.action === 'retry' && state.failure && !WAITS.has(state.failure))
    return { sign: 'alert', tone: 'alert' }
  return { sign: 'info' }
}

/** how a card is drawn: by the host's rule for the signs; an address that names no paper keeps the alert */
export function cardLook(card: Card, state: ReaderState, signs: Parts['signs']): Look {
  if (signs !== 'by-state' || card.action === 'arxiv') return { sign: 'alert' }
  return state.failure && WAITS.has(state.failure) ? { sign: 'clock', tone: 'wait' } : { sign: 'alert', tone: 'alert' }
}

/** `reason`: a failure's sentence, the host's (it knows whether the translator in use has a key); `words`, the host's for the
 *  card's states, over it */
export function cardOf(
  state: ReaderState,
  reason: (kind: ProviderErrorKind) => string,
  words: StateWords = {},
): Card | null {
  if (state.noPaper) return { reason: words.noPaper ?? R.status.noPaper, action: 'arxiv' }
  if (state.phase !== 'failed' || state.failure === 'aborted') return null
  // (the original not read, where the host draws it on the original's pane: this pane's card is the service's alone)
  if (state.failures.pdf !== null && words.openOriginal && state.failures.service === null) return null
  const kind = (words.openOriginal ? state.failures.service : state.failure) ?? 'unknown'
  // (the original not read: its own words where the host gives them, else the network's, as the failure it is told as)
  if (state.failures.pdf !== null && words.originalLost && !words.openOriginal)
    return { reason: words.originalLost, action: 'retry' }
  // the chain's own words for a rate limit promise a retry by itself; a stopped run here waits for the reader's. A key's reason
  // is the key's only where the service chosen carries one (the host's reason)
  return {
    reason: words.failed?.(kind) ?? (kind === 'rate-limit' ? R.status.rateLimited : reason(kind)),
    action: KEYS.has(kind) ? 'settings' : 'retry',
  }
}
