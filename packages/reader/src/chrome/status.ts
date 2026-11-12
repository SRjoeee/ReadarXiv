// The reader's states (the reader's design, §8) as what the capsule, the progress line and the card show: one anatomy,
// an icon, one sentence, at most one action. Reading shows nothing; a translation on screen is never covered by a
// failure's card. A capsule's sentence is its words in parts (capsule-words.ts): a count drawn in cells of its own, a
// language's own name drawn in that language. Every sentence is the catalogue's, or the host's for its state where it gives
// one (parts.tsx StateWords: the website's own)
import { O, type ProviderErrorKind, R, S } from '@readarxiv/ui'
import { GOES_ON as GOES_ON_WHY, LASTING, type ReaderState, type Unavailable } from './model.ts'
import { type CapsuleWords, plain, withCount, withPart } from './capsule-words.ts'
import { ARXIV_ORIGIN, linkable } from './links.ts'
import type { Languages, Parts, StateWords } from './parts.tsx'

export type Capsule =
  /** the paper cannot be had as a bilingual PDF: said, with its HTML version (`href`) offered where there is one; not
   *  closable. `label`: the link's words where the host gives its own (StateWords `htmlLink`) */
  | { kind: 'unavailable'; words: CapsuleWords; href?: string; label?: string }
  /** the bilingual version cannot be had right now (our server out of reach, S-R-24; or at its limit, a 429, S-R-26: its own
   *  words): said, with its retry and the HTML version offered where there is one; passing, not remembered; not closable.
   *  `wait`: its retry withheld until its time (a host's rule, parts.tsx `retry`: the website's). `self`: the session asks again
   *  by itself (at its time, or once the network is back): no retry offered at all (PDF-READER §8.1) */
  | { kind: 'notNow'; words: CapsuleWords; href?: string; label?: string; wait?: true; self?: true }
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
/** what the reader waits for while a run is under way, as a host's words say it: its turn at our server, the translation (the
 *  paper's first making included: what the reader waits for is its translation, never the making), our server heard again */
export type Stage = 'queued' | 'translating' | 'reconnecting'
/** why the bilingual version is not to be had now, the causes told apart (PDF-READER §8): the visitor's new papers spent
 *  (`quota`), our server at capacity (`busy`), the visitor's rate of asks (`rate`), the network itself (`network`), our server
 *  out of reach or at fault (`server`) */
export type Cause = 'quota' | 'busy' | 'rate' | 'network' | 'server'
/** the cause of a refusal for now, or null where none stands: the one place a refusal's cause is named, which every state that
 *  tells one reads (the capsule's words here, a run's stage) */
export function causeOf(state: ReaderState): Cause | null {
  // (the network down while a run is waited for, whatever is on screen: the run's own word for it)
  if (state.network) return 'network'
  return causeFor(state.unavailable?.why)
}
/** a refusal for now's cause, by the chrome's word for it */
function causeFor(why: Unavailable | undefined): Cause | null {
  switch (why) {
    case 'refused':
      return 'quota'
    case 'busy':
      return 'busy'
    case 'rate':
      return 'rate'
    case 'network':
      return 'network'
    case 'unreachable':
      return 'server'
    default:
      return null
  }
}
/** `arxiv`: a link to arXiv, for an address that names no paper (S-R-20); null: none, the session asking again by itself for
 *  what failed (PDF-READER §8.1) */
export interface Card {
  reason: string
  action: 'retry' | 'settings' | 'arxiv' | null
}

/** the reasons a key settles: the settings are where it is fixed (the popup's rule) */
const KEYS: ReadonlySet<ProviderErrorKind> = new Set(['no-key', 'auth'])

/** a translation or a prepare under way: the progress line shows it, and no capsule does (the maintainer, 2026-09-25) */
const running = (state: ReaderState) => state.phase === 'translating' || state.phase === 'preparing'

/** What the reader has done with the notices this visit (StatusCapsule keeps it). `refusalsSeen`: the refused writes closed */
export interface Seen {
  /** the passages that had failed when the reader closed their notice (0: not closed): closed for the visit unless more fail */
  noticeClosed: number
  narrowShown: boolean
  refusalsSeen: number
}

/** the original's failure is the phase, its own card standing apart (StateWords `openOriginal`: the website's) and no failure of
 *  the service's beside it: the translation's state is told in the capsule beside that card, as the website's page tells it */
const originalApart = (state: ReaderState, words: StateWords): boolean =>
  state.phase === 'failed' && !!words.openOriginal && state.failures.pdf !== null && state.failures.service === null
/** a run under way and what the reader waits for: its turn, our server at capacity (`causeOf` busy: the reader asks again by
 *  itself at our server's time); our server's document heard again; else the translation, the paper's layer being made included (the first time anyone opens it: the
 *  website says the time a first one takes, `first`). Null where none is under way, and where nothing a run brings is
 *  waited for: the end held for the layer's first page (`laying`) translates nothing, a stored translation's first page is a
 *  load, which the progress line and the page's marks show as they show the original's (PDF-READER §6.6). A run under the
 *  original's failure (the phase held by it) by its own marks: a prepare told, rows coming */
export function stageOf(state: ReaderState): Stage | null {
  const apart =
    state.phase === 'failed' && state.failures.pdf !== null && (state.preparing !== null || state.rowsComing)
  // (our server at capacity: the paper waits its turn, asked again by itself; the coordinator's decision 5, 2026-11-11)
  if (causeOf(state) === 'busy') return 'queued'
  if (!running(state) && !apart) return null
  if (state.reconnecting) return 'reconnecting'
  // (the first making's end held is still its wait: the early units' rows ended while the layer is made, or the layer landed and
  // its count is not known yet)
  if (state.laying && !firstOf(state)) return null
  return 'translating'
}
/** some of the translation is there to be read: a page laid, or the layer's pages known and rows of them in (the website's
 *  "drawn": the layer's first rows taken this visit) */
export const translationThere = (state: ReaderState): boolean =>
  state.layer.laid > 0 || (state.layer.total > 0 && state.translated.got > 0)
/** neither side has anything to show: the original could not be read, nothing of the translation is there, and none is to be
 *  had now (its layer refused, for now or for the paper): the website's `originalLost && layer === 'unavailable'` (its
 *  reader/Toolbar.tsx), whose bar is then its page's for a paper arXiv does not have (parts.tsx `bar`) */
export const nothingShown = (state: ReaderState): boolean =>
  state.failures.pdf !== null && !translationThere(state) && (!state.available || state.unavailable !== null)
/** the paper's first making: its layer being made (no layer to show yet, the first time anyone opens it), or made this visit and
 *  the count of its translation not known yet (the layer's units not read): one wait, the translation's, from the open until the
 *  count shows (the coordinator's decision 1, 2026-11-11) */
export const firstOf = (state: ReaderState): boolean =>
  state.preparing !== null || (state.made && state.translated.total <= 0)
/** a run's stage in the host's words, or null where it gives none; `chip`: the chip that shows the translation beside them */
function stageWords(stage: Stage, state: ReaderState, words: StateWords, chip: boolean): CapsuleWords | null {
  if (stage === 'queued') return words.queued ? plain(words.queued) : null
  if (stage === 'translating') {
    if (!words.translating) return null
    const { got, total } = state.translated
    // (the first making's words hold no count: their figures are the time a first one takes)
    const first = firstOf(state)
    const text = words.translating(got, total, chip, first)
    return first ? plain(text) : withCount(text, got)
  }
  return words.reconnecting ? plain(words.reconnecting) : null
}

/** the link beside a bilingual version not to be had: arXiv's HTML version, or where the host says (its address and words), or
 *  none where it offers none; drawn only to arXiv's, the page's own origin or one the host names (chrome/links.ts), so that an
 *  address a host forwards from elsewhere (a script's, a foreign one) draws none */
function linkOf(
  html: string | null,
  words: StateWords,
  origins: readonly string[] = [],
): { href: string; label?: string } | null {
  if (!html) return null
  const own = words.htmlLink ? words.htmlLink(html) : { href: html }
  const href = own && linkable(own.href, origins)
  if (!own || !href) return null
  return 'label' in own ? { href, label: own.label } : { href }
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
  // no paper: its card says that much, and nothing about a paper is true of it. A failure's card is the pane's whole answer, but
  // the original's own card standing apart: the translation's state is told beside it (L11 third round, gap 5)
  if (state.noPaper || (state.phase === 'failed' && !originalApart(state, words)) || state.phase === 'loading')
    return null
  // before anything else: it says why the translated displays are greyed (the maintainer, 2026-09-26)
  if (!state.available) {
    const said = plain(
      (state.unavailable?.why === 'too-large' ? words.tooLarge : undefined) ?? words.noPdf ?? R.status.noPdf,
    )
    const html = linkOf(state.htmlVersion, words, rules.origins)
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
  // a wait the session goes on from by itself, said over the run it pauses (the coordinator's R7, 2026-11-12): the network down
  // while a run is waited for, over the count, which cannot move until it is back (the session asks again by itself then: no
  // retry), and the count again once it is (PDF-READER §8.1); the visitor's rate likewise; our server at capacity is the queue, a
  // run's stage where the host words it (stageOf)
  const paused = running(state) && goesOnNow(state) && causeOf(state) !== 'busy'
  if (state.network || paused)
    return {
      kind: 'notNow',
      words: plain(causeOf(state) === 'rate' ? (words.rate ?? R.status.limited) : (words.network ?? R.status.notNow)),
      self: true,
    }
  // a run under way, where the host words it (the website's stage and count); else the progress line alone shows it
  const stage = stageOf(state)
  // (the translation not on screen and some of it there: the host's chip shows it)
  const show = !!words.showTranslation && state.display === 'original' && translationThere(state)
  const said = stage && stageWords(stage, state, words, show)
  if (stage && said)
    return show ? { kind: 'progress', stage, words: said, show } : { kind: 'progress', stage, words: said }
  // the bilingual version not to be had now: the original stays readable, and a retry is offered with the HTML version
  // (the layer-only plan's "Offline, drafted"), each cause in its own words
  const cause = causeOf(state)
  // (a 429 of the visitor's new papers is our server's limit, said as such with its time: past the run's few waits it asks no
  // more by itself, and the reader's retry is what asks again, #88 E5; busy, its capacity, the queue where the host words it
  // (stageOf), else said as the limit; the rate of asks and the network, which the reader waits out by itself, with no time)
  // (a run paused by a cause the session goes on from: its refusal's words where the host words no stage for it, the extension's)
  if ((!running(state) || goesOnNow(state)) && cause) {
    // (the time is said while it is to come, and while the session will ask by itself at it, until that ask begins: never the bare
    // sentence between the instant and the ask; one the reader is to retry at drops once it has come. The chrome decides, the
    // host's words say the time they are given)
    const due = state.unavailable?.retryAt ?? null
    const at = due !== null && (state.unavailable?.self || due > (rules.now ?? Date.now())) ? due : null
    const text =
      cause === 'server'
        ? (words.notNow?.(at) ?? R.status.notNow)
        : cause === 'network'
          ? (words.network ?? R.status.notNow)
          : cause === 'rate'
            ? (words.rate ?? R.status.limited)
            : (words.limited?.(at) ?? R.status.limited)
    const notNow = plain(text)
    // (no retry where the session asks again by itself; else offered at once, or at its time where the host's rule says so: a
    // retry before it asks nothing)
    const wait = state.unavailable?.self
      ? { self: true as const }
      : withheld(state, rules)
        ? { wait: true as const }
        : {}
    const html = linkOf(state.htmlVersion, words, rules.origins)
    return html ? { kind: 'notNow', words: notNow, ...html, ...wait } : { kind: 'notNow', words: notNow, ...wait }
  }
  // the paragraphs that failed are told once the run has ended, with its retry where a stop is there to resume
  if (!running(state) && state.failedUnits > seen.noticeClosed)
    return {
      kind: 'notice',
      words: withCount((words.failedPassages ?? S.failed.text)(state.failedUnits), state.failedUnits),
      action: state.failure && !state.selfAsks.service && !withheld(state, rules) ? 'retry' : null,
    }
  if (state.narrow && state.display === 'bilingual' && !seen.narrowShown)
    return { kind: 'narrow', words: plain(words.narrow ?? R.status.narrow) }
  return null
}

/** whether a capsule offers a retry now: a refusal for now neither withheld until its time nor asked again by the session itself,
 *  failed passages whose retry is offered (StatusCapsule draws the chip by this alone) */
export const retryOffered = (c: Capsule): boolean =>
  (c.kind === 'notNow' && !c.wait && !c.self) || (c.kind === 'notice' && c.action === 'retry')

/** what is under way, said to screen readers in the status region: the progress line is decorative, and no capsule shows it
 *  (where a host's words show it, the capsule says them itself). The end held for the layer's first page (`laying`: the
 *  translation there, a stored one read or a run's last rows in, the page being laid) is a load, never "translating" (the
 *  coordinator's R2 of 2026-11-12: the words say what is in flight); the first making's end held is its wait still (firstOf) */
export function spokenOf(state: ReaderState): string {
  return state.phase === 'loading' || (state.phase === 'translating' && state.laying && !firstOf(state))
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
 * it when the original alone is shown), then, where the paper's layer is being prepared, half the rest by the prepare's
 * stage, then the paragraphs translated to the end, from where the prepare left it (the coordinator's decision 4, 2026-11-11)
 */
export interface Line {
  on: boolean
  value: number
}
/** the line's share for the download where a translation follows it, and the prepare's of the rest */
const DOWNLOAD = 0.15,
  PREPARE = 0.5
/** where the prepare's stretch ends, and the translation that follows it in the same process starts */
const PREPARED = DOWNLOAD + (1 - DOWNLOAD) * PREPARE
/** `held`: the original held on screen by the host's rules (heldOf): while the paper is made the line is the original's load, whole
 *  once it is read, as the website's page draws it there (its phase still the original's loading in the original's display, the
 *  maintainer's ruling that nothing a website reader sees changes at the cut-over: L11 third round, gap 3). `prepared`: this
 *  process of the line had the paper's first making (ProgressLine): the translation takes what remains after the prepare's
 *  stretch, never a share of the whole that leaves the line standing still; a process without one keeps the download's base */
export function lineOf(state: ReaderState, held = false, prepared = false): Line {
  if (held && running(state)) return { on: true, value: state.loaded }
  if (state.phase === 'loading')
    return { on: true, value: state.loaded * (state.display === 'original' ? 1 : DOWNLOAD) }
  // (the prepare by its stage; its early units' run ended meanwhile, the end held, is the prepare's still)
  if (state.phase === 'preparing' || (state.laying && state.preparing))
    return { on: running(state), value: DOWNLOAD + (PREPARED - DOWNLOAD) * (state.preparing?.progress ?? 0) }
  // (the layer of the first making landed and the count of its translation not known yet: the prepare's end)
  if (running(state) && firstOf(state)) return { on: true, value: PREPARED }
  const base = prepared ? PREPARED : DOWNLOAD
  return { on: running(state), value: base + (1 - base) * state.progress }
}

/** the causes the session goes on from by itself with no period to end and nothing of the reader's: our server at capacity (the
 *  queue), the visitor's rate of asks (a minute at most), the network (asked again once it is back): the session's one table
 *  (session/machine.ts GOES_ON), as the chrome names its causes */
const GOES_ON: ReadonlySet<Cause> = new Set<Cause>([...GOES_ON_WHY].map(causeFor).filter((c): c is Cause => c !== null))
/** a wait the session goes on from by itself (GOES_ON): a wait, as the first-time wait is, never a refusal; the display the reader
 *  chose is kept through it (the coordinator, 2026-11-12) */
export const goesOnNow = (state: ReaderState): boolean => {
  const cause = causeOf(state)
  return cause !== null && GOES_ON.has(cause)
}
/** a refusal for now with nothing of the translation laid: the bilingual version not to be had now, and none of it on screen.
 *  A wait the session goes on from by itself is none (goesOnNow): the reader asked for the translation and it comes with nothing
 *  of theirs to do; the limit of new papers (a period's end) and our server's fault with its time are */
export const refusedNow = (state: ReaderState): boolean => notNowBare(state) && !goesOnNow(state)
/** the bilingual version not to be had now, whatever the cause, with nothing of it laid */
const notNowBare = (state: ReaderState): boolean =>
  state.available && state.unavailable !== null && !LASTING.has(state.unavailable.why) && state.layer.laid === 0
/**
 * The original held on screen by the host's rules (parts.tsx; ReaderController `hold`): a refusal for now with nothing laid,
 * where `refusal` is `original`: the limit of new papers, our server's fault with its time; never a wait the session goes on from
 * by itself (the queue, the rate, the network: the display the reader chose stands, as in the first-time wait). In a narrow
 * window where `narrow` is `shown`, until the reader chooses a display, while the paper is made (prepared, or translated after a
 * prepare this visit) or not to be had now, whatever the cause, with nothing laid (the website's displayFor). Neither rule given
 * (the extension's): never
 */
export function heldOf(state: ReaderState, rules: Pick<Parts, 'narrow' | 'refusal'>): boolean {
  if (state.noPaper) return false
  if (rules.refusal === 'original' && refusedNow(state)) return true
  if (rules.narrow !== 'shown' || !state.narrow || state.chose) return false
  return (
    state.preparing !== null ||
    state.phase === 'preparing' ||
    (state.made && state.phase === 'translating') ||
    notNowBare(state)
  )
}

/** the original's pane's card, where the original could not be read and the host draws its loss there (StateWords
 *  `openOriginal`: the website's): its words, and arXiv's PDF of the version as its link; null otherwise */
export interface OriginalCard {
  reason: string
  href: string
  label: string
}
/** the pane the lost original's card stands in: the original's where it is shown (its own display, side by side in a wide
 *  window), else the translation's, the one shown, so that it is in reach in every view (the package's translation is
 *  composed over the original's bytes: with the original lost the translation's pane has nothing else to show) */
export const originalCardSide = (state: ReaderState): 'left' | 'right' =>
  state.display === 'original' || (state.display === 'bilingual' && !state.narrow) ? 'left' : 'right'
export function originalCardOf(
  state: ReaderState,
  reason: (kind: ProviderErrorKind) => string,
  words: StateWords = {},
): OriginalCard | null {
  if (state.noPaper || state.failures.pdf === null || !words.openOriginal || !state.paper.id) return null
  // (the paper's id is a document's: its link checked as every other the chrome draws)
  const href = linkable(`${ARXIV_ORIGIN}/pdf/${state.paper.id}`)
  return href ? { reason: words.originalLost ?? reason(state.failures.pdf), href, label: words.openOriginal } : null
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
/** the failures that are a wait, not a fault: our server or the service out of reach for now (the one such kind the website's
 *  run reaches the chrome as: events.ts kindOf; the extension's today session says `timeout` and `rate-limit` too, its chain's
 *  kinds as they are, but its parts draw no sign by state) */
const WAITS: ReadonlySet<ProviderErrorKind> = new Set(['network'])

/** the time a retry is due where one is still to come at `now`: a refusal's for now (its `retryAt`), else the run's failure's
 *  (a rows' wait); null where none is named, or it has come */
export function dueAt(state: ReaderState, now: number): number | null {
  const u = state.unavailable
  const at = u && !LASTING.has(u.why) ? u.retryAt : state.failureAt
  return at !== null && at > now ? at : null
}
/** the time a retry of the translation's card is due where one is still to come: that of the failure it shows, the service's
 *  (a rows' wait) where it shows the service's (no original lost, or one the host draws apart: `openOriginal`); none where it
 *  shows the original's, whose retry asks it again at once */
export function cardDueAt(state: ReaderState, now: number, words: StateWords = {}): number | null {
  const service = state.failures.pdf === null || (!!words.openOriginal && state.failures.service !== null)
  const at = service ? state.failureAt : null
  return at !== null && at > now ? at : null
}
/** the host's rules a state is drawn by beside its words (parts.tsx), and the time it is drawn at */
export interface Rules {
  retry?: Parts['retry']
  now?: number
  /** the origins the host's links may lead to besides arXiv's and the page's own (parts.tsx `linkOrigins`) */
  origins?: Parts['linkOrigins']
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
  // (the original not read, where the host draws its own card for it: this pane's card is the service's alone, and none where
  // the original's card stands here, its pane not shown)
  if (
    state.failures.pdf !== null &&
    words.openOriginal &&
    (state.failures.service === null || originalCardSide(state) === 'right')
  )
    return null
  const kind = (words.openOriginal ? state.failures.service : state.failure) ?? 'unknown'
  // (the original not read: its own words where the host gives them, else the network's, as the failure it is told as)
  if (state.failures.pdf !== null && words.originalLost && !words.openOriginal)
    return { reason: words.originalLost, action: state.selfAsks.pdf ? null : 'retry' }
  // the chain's own words for a rate limit promise a retry by itself; a stopped run here waits for the reader's (the extension's
  // today session says `rate-limit`, its chain's kind as it is). A key's reason is the key's only where the service chosen
  // carries one (the host's reason). No retry where the session asks again by itself for the failure the card shows
  const self = words.openOriginal || state.failures.pdf === null ? state.selfAsks.service : state.selfAsks.pdf
  return {
    reason: words.failed?.(kind) ?? (kind === 'rate-limit' ? R.status.rateLimited : reason(kind)),
    action: KEYS.has(kind) ? 'settings' : self ? null : 'retry',
  }
}
