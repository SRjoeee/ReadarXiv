// The one boundary between the reader and its chrome (the reader's design, §11.3): the session's events folded into a state
// the chrome subscribes to, and the chrome's commands passed on to the session. pdfslick's per-viewer store, adopted: the
// session's events drive the store, and nothing reads the viewers back. Either session feeds it: the extension's run of a
// paper on its layer (its own events) or the reader's (openReader's state, told as these events); the chrome is the same.
import { type ProviderErrorKind, R } from '@readarxiv/ui'
import type { Prefs, PrefsPatch } from '../prefs.ts'
import { GOES_ON as GOES_ON_STOPS, LASTING as PAPERS } from '../session/machine.ts'
import { LAYER_WHY } from './events.ts'

type EngineDisplay = 'original' | 'translation' | 'bilingual'
/** why there is no bilingual version: for now (`refused`, a limit, its time given; `unreachable`, our server out of reach), or
 *  for this paper (`no-source`, `no-pdf`, `cannot-prepare`, `unknown-versions`: our server cannot make one for this version of
 *  the reader), or for this language (`target`) */
export type Unavailable =
  | 'no-source'
  /** no PDF of the paper to be had: the v1 layer API's word, which the extension's v1 session tells this chrome as it is
   *  (src/pdf-reader/session/server.ts LAYER_WHYS, host/today.ts); our server's v2 says none such */
  | 'no-pdf'
  | 'cannot-prepare'
  /** the paper too large for our server to prepare (a host may say it in words of its own; else as `cannot-prepare`) */
  | 'too-large'
  | 'unknown-versions'
  /** at a limit: the visitor's share of new papers (a 429's quota) */
  | 'refused'
  /** our server busy (a 429 of capacity: a host may say it in words of its own; else as `refused`) */
  | 'busy'
  /** the visitor's rate of asks (a 429 our server words so) */
  | 'rate'
  /** the network itself failed, or the browser is offline */
  | 'network'
  /** our server out of reach or at fault */
  | 'unreachable'
  | 'target'
/** the unavailable states that are the paper's or the language's, not a moment's: the session's lasting refusals as the chrome
 *  says them (one table, session/machine.ts LASTING), a language the typesetter does not set, and the v1 session's `no-pdf`
 *  (the v1 layer API's word, which no session of this package says) */
export const LASTING: ReadonlySet<Unavailable> = new Set<Unavailable>(
  [...PAPERS].map((why) => LAYER_WHY[why]).concat('target', 'no-pdf'),
)
/** the refusals for now that the session goes on from by itself (our server at capacity, the visitor's rate, the network): the
 *  session's one table (session/machine.ts GOES_ON), as the chrome says them */
export const GOES_ON: ReadonlySet<Unavailable> = new Set<Unavailable>([...GOES_ON_STOPS].map((why) => LAYER_WHY[why]))
/** the sync as the chrome names it to a session: together, or off */
type SyncMode = 'same' | 'off'
/** a heading of the contents: its id (its unit's), its title (translated where its row is in), the original's, its level, its page,
 *  its number as its part states it (null: none set, or none read yet; absent from a session that states none: the extension's
 *  older session numbers no entry) */
export interface OutlineEntry {
  id: number
  title: string
  original: string
  level: 1 | 2 | 3
  page: number | null
  number?: string | null
}
/** a host's passing words in the capsule's place (the website's share menu's "copied", its word for a crash with something on
 *  screen): its own words and sign, shown for `ms` (TOAST_MS by default) */
export interface Toast {
  words: string
  /** the check for something done (a link copied), else the information sign */
  icon?: 'check' | 'info'
  ms?: number
}
/** how long a toast stands when its host names no time, ms (the website's TOAST_MS); unmeasured */
export const TOAST_MS = 3000
/** how long the chrome's notice of a face lost stays, ms (S-R-28): how long a notice stays, the value the website gives its two
 *  "lost" notices, judged on the site; a reading time chosen, which nothing was weighed to give */
export const FACES_LOST_MS = 8000
export type SessionEvent =
  /** a write of the settings by this page that went through: a refusal before it is mended */
  | { type: 'saved' }
  /** why the settings could not be read, or null when they could */
  | { type: 'notice'; why: unknown }
  /** a write of the settings that storage refused or could not make, after the notice of settings that cannot be read when that is why */
  | { type: 'refused' }
  /** the contents: the paper's headings */
  | { type: 'outline'; entries: OutlineEntry[] }
  /** the paper's id and its title for the toolbar, '' until known or when there is none */
  | { type: 'paper'; id: string; title: string }
  /** the panes scroll together, as the reader applies it; `available`: whether they can (both sides' pages laid out), none
   *  where the session does not say (the extension's v1 session: as if they could) */
  | { type: 'sync'; on: boolean; available?: boolean }
  /** the visitor's preferences, each time they land (the one model, prefs.ts) */
  | { type: 'prefs'; prefs: Prefs }
  | { type: 'display'; mode: EngineDisplay }
  /** `zoom`: the fit or the scale applied, null after a step or a pinch */
  | { type: 'scale'; scale: number; zoom?: number | 'page-width' | 'page-fit' | 'page-actual' | null }
  /** the paper's PDF coming in, in bytes: the progress line while the reader loads */
  | { type: 'loading'; loaded: number; total: number }
  | { type: 'page'; side: 'left' | 'right'; page: number; pages: number }
  /** the original on screen: its pages laid out, in every display */
  | { type: 'opened' }
  /** the paper's HTML version with its translating hash, once the bilingual version cannot be had; null where arXiv has none */
  | { type: 'html'; url: string | null }
  /** the reader cannot go on: the original could not be fetched, the service cannot translate, or a crash; the chain's error
   *  kind where it is the service's */
  | {
      type: 'fail'
      event: 'fetch failed' | 'service' | 'crashed'
      text: string
      kind?: ProviderErrorKind
      /** the session asks again by itself (the original, opened again a second on): no retry offered (PDF-READER §8.1) */
      self?: true
    }
  /** the paper's layer being prepared: told at each of our server's answers while it lasts */
  | { type: 'preparing'; progress: number | null }
  /** the layer is coming: a catalog, or a prepare's first objects */
  | { type: 'coming' }
  /** the layer's catalog: the paper's prepare, where there was one, is over */
  | { type: 'prepared' }
  /** the layer's side: opening, open, or refused (no layer for the visit), its pages laid, and (none where absent) the pages
   *  asked near the view it shows as arXiv's by the rule, never laid */
  | { type: 'layer'; state: 'opening' | 'open' | 'refused'; laid: number; total: number; original?: number }
  /** the translation under way, and its end for the attempt (`stopped`: why it stopped short) */
  | { type: 'translating'; got: number; total: number; lost: number }
  /** `retryAt`: when a retry of a run stopped short is due, where the service named a time (none: at once); `self`: the session
   *  asks the run again by itself (at that time): no retry offered (PDF-READER §8.1) */
  | {
      type: 'translated'
      got: number
      total: number
      lost: number
      stopped: ProviderErrorKind | null
      retryAt?: number | null
      self?: true
    }
  /** no bilingual version for now, or for this paper or language; `self`: the session asks again by itself (at its time, or
   *  once the network is back): no retry offered (PDF-READER §8.1). None where a session does not say (the extension's v1
   *  session): a retry offered */
  | { type: 'unavailable'; why: Unavailable; retryAt: number | null; self?: true }
  /** our server's document followed: its stream lost and asked again, nothing heard since (or heard again); `network`: the
   *  network failed while the run is waited for (none where a session does not say: the extension's v1 session) */
  | { type: 'link'; reconnecting: boolean; network?: boolean }
  /** a face the translation is set in could not be had this visit (the reader's `faces`), its passages drawn in their fallback
   *  until the page is loaded again: the chrome's own toast says so (S-R-28), in the catalogue's one sentence, for every host */
  | { type: 'faces' }
  /** a jump to go back from, or none any more (the capsule 回到原处 stands while there is) */
  | { type: 'back'; on: boolean }
/** what a session is given: the panes it draws into, and where it tells its events */
export interface SessionHost {
  left: HTMLElement
  right: HTMLElement
  emit(event: SessionEvent): void
}

export type Display = EngineDisplay
export type Side = 'left' | 'right'
/** loading the original; the paper's layer being prepared; the translation under way; reading; or the reader cannot go on */
type Phase = 'loading' | 'preparing' | 'translating' | 'ready' | 'failed'

export interface ReaderState {
  display: Display
  /** false: the paper, or its language, cannot be had as a bilingual PDF (the design, §8): the two translated displays greyed,
   *  the original shown */
  available: boolean
  /** where the reader can read the paper translated instead, when the bilingual version cannot be had: its HTML version */
  htmlVersion: string | null
  phase: Phase
  /** the paper's layer being prepared: its place in the queue and how far it has come, each null while not known; a state
   *  of its own beside the phase, from the prepare's first answer to the layer's catalog (`prepared`) */
  preparing: { progress: number | null } | null
  /** the translation has begun this visit: a prepare still under way after it is no longer the phase (its polls would
   *  take the phase back from the translation, and the line and the status region with it) */
  begun: boolean
  /** the translation done before a page of the layer is laid where the translation shows (the website's laying state): the
   *  right pane is the original's yet, so its end is held (the phase translating, the line on) until a page is laid or shown as
   *  arXiv's by the rule (the layer's `original`: nothing to lay there), the layer is refused, or the original alone is shown */
  laying: boolean
  /** the layer's pages laid, of the paper's; `original`, the pages asked near the view that the layer shows as arXiv's by the rule
   *  (none laid there: a page no part lays a line on), none where absent */
  layer: { laid: number; total: number; original?: number }
  /** no bilingual version for now (refused, unreachable: passing), or for this paper or language; null while there may be */
  unavailable: { why: Unavailable; retryAt: number | null; self?: true } | null
  /** 0–1, the share of the paper's paragraphs translated */
  progress: number
  /** a run's rows coming in: from its first batch to its end (or a refusal), whatever the phase, which the original's failure
   *  holds meanwhile (the capsule beside the original's own card tells the run: status.ts stageOf) */
  rowsComing: boolean
  /** the paragraphs translated of the paper's, as the run last told them (a host's words count them) */
  translated: { got: number; total: number }
  /** our server's document followed, its stream lost and asked again: the run under way not heard for now */
  reconnecting: boolean
  /** the network failed while the run under way is waited for (the browser offline, or a fetch rejected): the run cannot go on
   *  until it is back, which the session waits for by itself (PDF-READER §8.1) */
  network: boolean
  /** 0–1, the share of the paper's PDF downloaded, in hundredths; 0 while its size is unknown */
  loaded: number
  /** the paragraphs the service failed on: the notice's {n} */
  failedUnits: number
  /** why the last run could not translate, as the chain's error kind (the popup's REASON); null otherwise */
  failure: ProviderErrorKind | null
  /** the failures by origin, each set and cleared by its own events alone: the original's own fetch (`pdf`: its open
   *  mends it) and the service's, or the session's (`service`: a run under way mends it). Both may say `network`, and both
   *  may fail during the start, so one slot cannot hold them. `failure` is the one shown: the PDF's first (nothing reads
   *  without the original), then the service's */
  failures: { pdf: ProviderErrorKind | null; service: ProviderErrorKind | null }
  /** for each failure, whether the session asks again by itself (the original opened again, the run asked again at its time):
   *  no retry is offered for it (PDF-READER §8.1: an action is offered only where the system will not take it by itself) */
  selfAsks: { pdf: boolean; service: boolean }
  /** when a retry of the run's failure is due, where the service named a time (a rows' wait); null: none named */
  failureAt: number | null
  languageSupported: boolean
  /** what can be downloaded: nothing yet, the original, or the translation (no host makes its PDF yet: open.ts) */
  download: 'none' | 'original' | 'translation'
  scale: number
  sides: Record<Side, { page: number; pages: number }>
  /** the extension's settings could not be read, or did not answer in the time the page gave them (first-read.ts), and
   *  their defaults are in use: what writes them is out of reach (S-R-21) */
  settingsUnreadable: boolean
  /** the writes of the settings that storage refused, counted: each is told until it is closed or mended (S-R-22). Not
   *  those refused for the settings being unreadable, which `settingsUnreadable` says */
  refusals: number
  /** the refusals there were when a write of this page last went through: it proves storage takes a write, so a refusal
   *  before it is told no more (a retry that succeeds leaves no stale "couldn't save") */
  mended: number
  /** the visitor's preferences as they last landed; null before the first read */
  prefs: Prefs | null
  /** the paper: its id from the address, its title once known ('' until then, or when there is none) */
  paper: { id: string; title: string }
  /** the address names no paper (a hand-typed one): known from the address, before any session: nothing to load, and
   *  the card says it cannot be found (S-R-20) */
  noPaper: boolean
  /** the window too narrow for two sides: side by side shows the translation alone (setNarrow) */
  narrow: boolean
  /** the contents (outline.ts) */
  outline: OutlineEntry[]
  /** the zoom last chosen from the menu; null after a step or a pinch */
  zoom: 'page-width' | 'page-fit' | 'page-actual' | number | null
  /** the sides scroll together, as the reader applies it — not the stored setting, which a refused write or an address may not match */
  sync: boolean
  /** the sides can scroll together (both sides' pages laid out), as the session says; true where it says nothing */
  syncAvailable: boolean
  /** a host's passing words shown now (ReaderController.toast); null while none stands */
  toast: { words: string; icon: 'check' | 'info' } | null
  /** the reader chose a display this visit (the switch, a chip that shows the translation): a host's hold for the narrow
   *  window is theirs to end (parts.tsx `narrow`) */
  chose: boolean
  /** the paper's layer was made during this visit (a prepare told): its run is the making's */
  made: boolean
  /** a PDF download being made in the page (export/): its file and how far it has come, a whole percent; null while none is.
   *  One at a time (the other download greyed) */
  exporting: { form: ExportForm; percent: number } | null
  /** the PDF download that failed (its retry offered in the capsule until it is closed or tried again); null while none did */
  exportFailed: ExportForm | null
  /** a jump inside the paper to go back from: the capsule 回到原处 stands (BackCapsule.tsx, S-R-29) */
  back: boolean
}
/** the files the reader makes (UI.md S-R-09): the translation's, the side-by-side's */
export type ExportForm = 'translation' | 'side-by-side'

export const INITIAL: ReaderState = {
  display: 'original',
  available: true,
  htmlVersion: null,
  phase: 'loading',
  preparing: null,
  begun: false,
  laying: false,
  layer: { laid: 0, total: 0 },
  unavailable: null,
  progress: 0,
  rowsComing: false,
  translated: { got: 0, total: 0 },
  reconnecting: false,
  network: false,
  loaded: 0,
  failedUnits: 0,
  failure: null,
  failures: { pdf: null, service: null },
  selfAsks: { pdf: false, service: false },
  failureAt: null,
  languageSupported: true,
  download: 'none',
  scale: 1,
  sides: { left: { page: 1, pages: 0 }, right: { page: 1, pages: 0 } },
  settingsUnreadable: false,
  refusals: 0,
  mended: 0,
  prefs: null,
  paper: { id: '', title: '' },
  noPaper: false,
  narrow: false,
  sync: true,
  syncAvailable: true,
  outline: [],
  zoom: 'page-width',
  toast: null,
  chose: false,
  made: false,
  exporting: null,
  exportFailed: null,
  back: false,
}

/** the session's commands the controller passes on */
export interface Session {
  setDisplay(mode: EngineDisplay): void
  setSyncMode(mode: SyncMode): void
  zoomBy(factor: number): void
  zoomTo(value: number | 'page-width' | 'page-fit' | 'page-actual'): void
  /** a page gone to; `jump`: a page typed, one of the reader's jumps, with its way back (the arrows' page is none) */
  goToPage(side: Side, page: number, o?: { jump?: boolean }): void
  /** one jump back (the capsule's press); a session of before has none */
  back?(): void
  /** a patch of the preferences, on top of what the store holds when its turn comes */
  setPrefs(patch: PrefsPatch): void
  /** the translation's bytes, to save; null while there are none (a session of before the PDF download: the website's until its
   *  pin takes exportPdf; `exportPdf`, where there is one, is asked instead) */
  pdfBytes(which: 'translation'): Promise<Uint8Array | null>
  /** a file of `form` made in the page, its parts in order (the PDF download, PDF-READER §11.12): `progress` told the share
   *  made (0–1), `signal` the reader's cancel; it rejects where it cannot be made (an AbortError where cancelled) */
  exportPdf?(form: ExportForm, o: { signal: AbortSignal; progress: (share: number) => void }): Promise<Uint8Array[]>
  /** arXiv's own PDF of the paper opened by the browser, in a tab of its own: the browser streams it and saves it. Never read
   *  through the reader (the whole file, for every reader, in case one asks to save it) */
  openOriginal(): void
  /** a contents entry gone to; `focus`: its page given the focus where the reader holds a target for it */
  goToUnit(id: number, o?: { focus?: boolean }): void
  lead(which: Side): void
  retry(): void
  setNarrow(on: boolean): void
  pinch(which: Side, factor: number, origin: [number, number]): void
  /** the original held on screen for now, whatever display is chosen, or let go (a host's rule, parts.tsx `narrow` and
   *  `refusal`): never written; the reader's own choice of a display ends it. A session that has none holds nothing (the
   *  extension's, whose rules ask for none) */
  hold?(on: boolean): void
}

/** the engine's error kinds are the translate chain's; anything else, a crash included, is the popup's unknown */
const ERROR_KINDS: readonly ProviderErrorKind[] = [
  'no-key',
  'network',
  'rate-limit',
  'auth',
  'bad-request',
  'invalid-response',
  'timeout',
  'aborted',
  'unknown',
]
const kindOf = (kind: string | undefined): ProviderErrorKind =>
  (ERROR_KINDS as readonly string[]).includes(kind ?? '') ? (kind as ProviderErrorKind) : 'unknown'
/** the layer has drawn something: a failure then leaves the pages laid readable, its card not over them */
const drawn = (state: ReaderState) => state.layer.laid > 0
/** a page of the layer settled where the translation shows: laid, or shown as arXiv's by the rule (the side's `original`), where
 *  nothing is to be laid: the end held for a page (laying) waits for neither. Not `drawn`: no translation is on such a page, so a
 *  run stopped short over it still shows its card */
const settled = (layer: ReaderState['layer']) => layer.laid > 0 || (layer.original ?? 0) > 0
/** the phase once no bilingual version is to be had (the side's refusal, the run's `unavailable`): reading, but a failure stays
 *  failed and a load stays a load: the run starts beside the original's download, and our server's answer can come before the
 *  original is on screen, which `opened` alone tells (the design, §8: loading until then) */
const afterRefusal = (phase: Phase): Phase => (phase === 'failed' || phase === 'loading' ? phase : 'ready')
/** the original could not be opened: its card stands, whatever the run does meanwhile (its rows wait for the original),
 *  until the original opens */
const noOriginal = (state: ReaderState) => state.failures.pdf !== null
/** the failures given, with the one shown derived from them */
const withFailures = (state: ReaderState, failures: ReaderState['failures']): ReaderState => ({
  ...state,
  failures,
  failure: failures.pdf ?? failures.service,
})

/**
 * One event folded into the state; the same object when nothing changed, so that no listener hears of it. The phase moves
 * at named steps only (the design, §8): loading until the original is on screen, preparing while our server makes the paper's
 * layer, translating from the run's first batch until its end, reading after. A failure over pages laid leaves them readable:
 * reading, the failure kept; one with nothing laid is the card's
 */
export function reduce(state: ReaderState, event: SessionEvent): ReaderState {
  switch (event.type) {
    case 'back':
      return state.back === event.on ? state : { ...state, back: event.on }
    case 'display':
      // an address with no paper has no translated display to be had: the original stays selected, whatever the saved
      // settings ask for (the radio of a display out of reach was left selected, and its pane hidden)
      if (state.noPaper || event.mode === state.display) return state
      // the original alone shown: nothing waits on a page of the layer
      if (state.laying && event.mode === 'original')
        return {
          ...state,
          display: event.mode,
          laying: false,
          phase: state.phase === 'translating' ? 'ready' : state.phase,
        }
      return { ...state, display: event.mode }
    case 'scale': {
      // the zoom the engine applied, where it says (the reading view: a fit, a scale, or none after a step or a pinch)
      const zoom = event.zoom === undefined ? state.zoom : event.zoom
      return event.scale === state.scale && zoom === state.zoom ? state : { ...state, scale: event.scale, zoom }
    }
    case 'loading': {
      const loaded = event.total > 0 ? Math.round(Math.min(1, event.loaded / event.total) * 100) / 100 : 0
      return loaded === state.loaded ? state : { ...state, loaded }
    }
    case 'page': {
      const now = state.sides[event.side]
      return now.page === event.page && now.pages === event.pages
        ? state
        : { ...state, sides: { ...state.sides, [event.side]: { page: event.page, pages: event.pages } } }
    }
    case 'notice':
      return (event.why != null) === state.settingsUnreadable
        ? state
        : { ...state, settingsUnreadable: event.why != null }
    // the session tells of unreadable settings before the refusal that follows from them: that one is the notice's
    case 'refused':
      return state.settingsUnreadable ? state : { ...state, refusals: state.refusals + 1 }
    case 'outline':
      return { ...state, outline: event.entries }
    case 'paper':
      return { ...state, paper: { id: event.id, title: event.title } }
    case 'sync': {
      const available = event.available ?? true
      return event.on === state.sync && available === state.syncAvailable
        ? state
        : { ...state, sync: event.on, syncAvailable: available }
    }
    case 'html':
      return event.url === state.htmlVersion ? state : { ...state, htmlVersion: event.url }
    case 'prefs':
      return event.prefs === state.prefs ? state : { ...state, prefs: event.prefs }
    // a write of this page that went through: storage takes a write, so a refusal before it is told no more. Only that
    // proves it: the settings shown again (a language pack that came, a read, another tab's change) prove nothing
    case 'saved':
      return state.mended === state.refusals ? state : { ...state, mended: state.refusals }
    // the original on screen, in every display: readable, a failure of its open before it mended (a retry that opened)
    // (a failure the open mends is the original's own fetch failure alone: a service's, a key missing, stays with its card)
    case 'opened': {
      const mends = state.failures.pdf !== null
      const next = {
        ...withFailures(state, { ...state.failures, pdf: null }),
        selfAsks: { ...state.selfAsks, pdf: false },
      }
      // a service's failure left with nothing laid keeps its card
      const failed = next.failures.service !== null && !drawn(next) && state.phase === 'failed'
      // (a prepare told while the original loaded, the translation not begun: its phase now, the original on screen; the
      // website's page told it again after the open)
      const ready = state.preparing !== null && !state.begun ? 'preparing' : 'ready'
      return {
        ...next,
        phase: state.phase === 'loading' || (mends && !failed) ? ready : state.phase,
        download: state.download === 'none' ? 'original' : state.download,
      }
    }
    case 'fail': {
      const kind = kindOf(event.kind)
      const pdf = event.event === 'fetch failed'
      const failures = pdf ? { ...state.failures, pdf: kind } : { ...state.failures, service: kind }
      const selfAsks = pdf ? { ...state.selfAsks, pdf: !!event.self } : { ...state.selfAsks, service: !!event.self }
      return { ...withFailures(state, failures), selfAsks, phase: drawn(state) ? 'ready' : 'failed' }
    }
    case 'preparing': {
      const preparing = { progress: event.progress }
      // the phase only before the translation has begun, and over the original on screen (loading stays loading)
      const phase = !state.begun && (state.phase === 'ready' || state.phase === 'preparing') ? 'preparing' : state.phase
      return { ...state, preparing, unavailable: null, phase, made: true }
    }
    case 'prepared':
      return state.preparing === null && state.phase !== 'preparing'
        ? state
        : { ...state, preparing: null, phase: state.phase === 'preparing' ? 'ready' : state.phase }
    case 'coming':
      return state.unavailable === null && state.available
        ? state
        : { ...state, unavailable: null, available: true, languageSupported: true }
    case 'layer': {
      const original = event.original ?? 0
      const layer =
        event.laid === state.layer.laid && event.total === state.layer.total && original === (state.layer.original ?? 0)
          ? state.layer
          : { laid: event.laid, total: event.total, ...(original ? { original } : {}) }
      // the layer refused for the visit: no bilingual version now, the original stays
      // (a lasting word the run told already stands: a layer that draws nothing is the paper's, and its side's own refusal at the
      // base does not make it a moment's)
      if (event.state === 'refused')
        return {
          ...state,
          layer,
          preparing: null,
          laying: false,
          unavailable:
            state.unavailable && LASTING.has(state.unavailable.why)
              ? state.unavailable
              : { why: 'unreachable', retryAt: null },
          phase: afterRefusal(state.phase),
        }
      // a page laid where the translation shows, or one shown as arXiv's by the rule: the end held is told
      if (state.laying && settled(layer))
        return { ...state, layer, laying: false, phase: state.phase === 'translating' ? 'ready' : state.phase }
      return layer === state.layer ? state : { ...state, layer }
    }
    case 'link': {
      const network = !!event.network
      return event.reconnecting === state.reconnecting && network === state.network
        ? state
        : { ...state, reconnecting: event.reconnecting, network }
    }
    case 'translating':
    case 'translated':
    case 'unavailable':
      if (noOriginal(state)) return reduceRun({ ...state, phase: 'ready' }, event, true)
      return reduceRun(state, event, false)
    default:
      return state
  }
}

/** the run's own events: the translation and the layer's availability. `held`: the original's failure stands over them (its
 *  phase and its reason kept) */
function reduceRun(
  state: ReaderState,
  event: Extract<SessionEvent, { type: 'translating' | 'translated' | 'unavailable' }>,
  held: boolean,
): ReaderState {
  const next = reduceRunFree(state, event)
  // (the PDF's slot is no run event's: it stands, and the phase with it)
  return held ? { ...withFailures(next, { ...next.failures, pdf: state.failures.pdf }), phase: 'failed' } : next
}
function reduceRunFree(
  state: ReaderState,
  event: Extract<SessionEvent, { type: 'translating' | 'translated' | 'unavailable' }>,
): ReaderState {
  switch (event.type) {
    case 'translating': {
      const progress = event.total ? Math.min(1, event.got / event.total) : 0
      return {
        ...withFailures(state, { ...state.failures, service: null }),
        selfAsks: { ...state.selfAsks, service: false },
        phase: 'translating',
        begun: true,
        laying: false,
        progress,
        rowsComing: true,
        translated: countOf(state, event),
        failedUnits: event.lost,
        failureAt: null,
        // (a translation coming in again, another target's or a retry's: its files wait for its end)
        download: state.download === 'translation' ? 'original' : state.download,
      }
    }
    case 'translated': {
      const progress = event.total ? Math.min(1, event.got / event.total) : 1
      const counted = {
        ...state,
        rowsComing: false,
        translated: countOf(state, event),
        failureAt: event.stopped ? (event.retryAt ?? null) : null,
        selfAsks: { ...state.selfAsks, service: !!event.stopped && !!event.self },
      }
      // stopped short with nothing laid: the card, with the service's reason; with pages laid, the notice and its retry
      if (event.stopped && !drawn(state))
        return {
          ...withFailures(counted, { ...state.failures, service: event.stopped }),
          phase: 'failed',
          begun: true,
          progress,
          failedUnits: event.lost,
        }
      // done with nothing laid where the translation shows: the end held until a page is, or one is shown as arXiv's by the rule
      // (laying)
      if (!event.stopped && !settled(state.layer) && state.display !== 'original')
        return {
          ...withFailures(counted, { ...state.failures, service: null }),
          phase: 'translating',
          begun: true,
          laying: true,
          progress,
          failedUnits: event.lost,
          // (the translation final, its first page not laid yet: its files can be made, every page laid for them)
          download: 'translation' as const,
        }
      return {
        ...withFailures(counted, { ...state.failures, service: event.stopped }),
        phase: 'ready',
        begun: true,
        laying: false,
        progress,
        failedUnits: event.lost,
        // (the final translation on screen: its files can be made, S-R-09; a run stopped short has none)
        ...(event.stopped ? {} : { download: 'translation' as const }),
      }
    }
    case 'unavailable': {
      const lasting = LASTING.has(event.why)
      // (a wait the session goes on from by itself, as it says (`self`): the run it pauses stays the phase, its prepare's place
      // and its rows' coming with it, so that its line goes on and nothing reads as done between the session's own asks: one
      // wait, PDF-READER §8.1)
      const paused = GOES_ON.has(event.why) && !!event.self
      return {
        ...state,
        preparing: paused ? state.preparing : null,
        rowsComing: paused ? state.rowsComing : false,
        unavailable: { why: event.why, retryAt: event.retryAt, ...(event.self ? { self: true as const } : {}) },
        // the paper's own: its translated displays greyed; a language the layer does not set: the language's notice
        available: lasting && event.why !== 'target' ? false : state.available,
        languageSupported: event.why === 'target' ? false : state.languageSupported,
        phase: paused ? state.phase : afterRefusal(state.phase),
      }
    }
  }
}

/** the run's count, the same object while it is the same */
const countOf = (state: ReaderState, e: { got: number; total: number }): ReaderState['translated'] =>
  state.translated.got === e.got && state.translated.total === e.total
    ? state.translated
    : { got: e.got, total: e.total }

/** a download's file name (the reader's design, §6.1): the paper's id, the translation's with its language; the slash of
 *  an old-style id (hep-th/9711200) made safe */
export function fileName(id: string, which: ExportForm | 'original', lang: string): string {
  const safe = id.replace(/\//g, '_')
  if (which === 'original') return `${safe}.pdf`
  return which === 'translation' ? `${safe}.${lang}.pdf` : `${safe}.${lang}.side-by-side.pdf`
}

export interface ReaderController {
  getState(): ReaderState
  subscribe(listener: () => void): () => void
  /** the panes drawn: the session opened in them, once however often this is called */
  attach(panes: { left: HTMLElement; right: HTMLElement }): Promise<Session>
  setDisplay(display: Display): void
  setSync(on: boolean): void
  zoomBy(factor: number): void
  zoomTo(value: number | 'page-width' | 'page-fit' | 'page-actual'): void
  /** a page gone to; `jump`: a page typed in the pill, one of the reader's jumps (the arrows' page is none) */
  goToPage(side: Side, page: number, o?: { jump?: boolean }): void
  /** one jump back: the capsule's press */
  back(): void
  /** a patch of the preferences, on top of what the store holds when its turn comes */
  setPrefs(patch: PrefsPatch): void
  /** a pinch over a side: both sides zoom together about the pointer, one call a frame (ui/pinch.ts) */
  pinch(side: Side, factor: number, origin: [number, number]): void
  /** translate again what is missing, in place: the rows held stay, the missing alone are asked (reader.ts `rows`) */
  retry(): void
  /** the window too narrow for two sides, or wide enough again: told once per change */
  setNarrow(on: boolean): void
  /** a side made the leading one, as a press in its pane makes it (a press on its scroll indicator) */
  lead(side: Side): void
  /** both sides shown taken to a heading from the contents; `focus`: the focus taken to its page where the reader holds a
   *  target for it (the contents laid over the document, closed by the jump) */
  goToHeading(id: number, o?: { focus?: boolean }): void
  /** a side's PDF saved as a file, named by the paper (fileName): the original arXiv's (opened by the browser), the translation's
   *  and the side-by-side's made in the page, one at a time (a press while one is made does nothing), its share in the
   *  capsule with its cancel, its failure there with its retry, its end the browser's save and the capsule's word */
  download(which: ExportForm | 'original'): Promise<void>
  /** the PDF download being made let go: nothing saved, nothing said */
  cancelExport(): void
  /** the PDF download that failed made again */
  retryExport(): void
  /** the failed PDF download's word closed */
  closeExportFailure(): void
  /** a host's passing words in the capsule's place, over whatever it shows, for their time; words said again start their time
   *  again, and a toast replaced before its time comes back after the one that replaced it for the time it has left (the
   *  website's "copied" over its word for a crash) */
  toast(t: Toast): void
  /** the original held on screen for now, or let go (Session `hold`): the chrome's, by its host's rules (App.tsx) */
  hold(on: boolean): void
}

/** what an address with no paper starts from: nothing is loading, and no translated display can be had */
const NO_PAPER: Partial<ReaderState> = { noPaper: true, phase: 'ready', available: false }

/**
 * `paper`: the address's paper, '' when it names none (S-R-20: nothing to load, the card says so). `first`: the page's own
 * first read of the preferences, made before the first paint and not waiting for the session: the chrome is drawn with what
 * the store holds from its first frame. A read that did not answer in the time the page gave it (`prefs` null) paints the
 * defaults (`DEFAULTS`), and so does one whose value cannot be read: both said to be unreadable (S-R-21). Without `first`
 * nothing is known until the session says
 */
export function createController({
  open,
  paper,
  first,
  defaults,
}: {
  open: (host: SessionHost) => Promise<Session>
  paper: string
  first?: { prefs: Prefs | null; unreadable: boolean }
  defaults: Prefs
}): ReaderController {
  const id = paper
  let state: ReaderState = {
    ...INITIAL,
    paper: { id, title: '' },
    ...(id ? {} : NO_PAPER),
    ...(first === undefined
      ? {}
      : { prefs: first.prefs ?? defaults, settingsUnreadable: !first.prefs || first.unreadable }),
  }
  const listeners = new Set<() => void>()
  let session: Promise<Session> | null = null
  /** whether the session makes the PDF download's files (its exportPdf: a session of before, the rollback build's or a host not
   *  wired, has none), known once it is open; and the download the session's events give, which the state shows gated by it:
   *  the files are never offered where nothing makes them (#685) */
  let exportable = false
  let told: ReaderState['download'] = state.download
  const gated = (d: ReaderState['download']) => (d === 'translation' && !exportable ? 'original' : d)
  const emit = (event: SessionEvent) => {
    // (a face lost: the chrome's own words in the toast's place, as a host's are shown, nothing of the state's; S-R-28)
    if (event.type === 'faces') return toast({ words: R.status.facesLost, icon: 'info', ms: FACES_LOST_MS })
    const base = state.download === told ? state : { ...state, download: told }
    const folded = reduce(base, event)
    if (folded === base) return
    told = folded.download
    const next = folded.download === gated(told) ? folded : { ...folded, download: gated(told) }
    state = next
    for (const listener of listeners) listener()
  }
  /**
   * A command: carried out once the session is open, in the order given (a click while the paper opens is not lost);
   * one given before `attach` has no session to wait for and is dropped, as is one for a session that could not open
   */
  const later = (act: (s: Session) => void) => void session?.then(act, () => {})
  /** a change of the state that is the controller's own (the zoom chosen), not the session's; none, when nothing in it
   *  differs (a pinch's every step sets no zoom) */
  const set = (patch: Partial<ReaderState>) => {
    if ((Object.keys(patch) as (keyof ReaderState)[]).every((k) => Object.is(state[k], patch[k]))) return
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }
  /** the host's toasts standing, each until its end, the last shown; the timer to the shown one's end */
  let toasts: { t: Toast; until: number }[] = []
  let toastTimer: ReturnType<typeof setTimeout> | undefined
  const showToast = () => {
    clearTimeout(toastTimer)
    const now = Date.now()
    toasts = toasts.filter((x) => x.until > now)
    const top = toasts.at(-1)
    if (!top) {
      set({ toast: null })
      return
    }
    const icon = top.t.icon ?? 'info'
    if (state.toast?.words !== top.t.words || state.toast.icon !== icon) set({ toast: { words: top.t.words, icon } })
    toastTimer = setTimeout(showToast, top.until - now)
  }
  const toast = (t: Toast) => {
    if (!t.words) return
    toasts = toasts.filter((x) => x.t.words !== t.words)
    toasts.push({ t, until: Date.now() + (t.ms ?? TOAST_MS) })
    showToast()
  }
  /** the PDF download being made: its cancel; and its work, which a cancel does not end at once (a slice's fetch, its decoding):
   *  the next file waits for it, so that no two run (#685) */
  let exportAc: AbortController | null = null
  let working: Promise<unknown> | null = null
  const controller: ReaderController = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    attach(panes) {
      // a session that cannot be opened (its module not loaded) is a failure the interface shows, as a crash is
      session ??= open({ ...panes, emit }).then(
        (s) => {
          exportable = !!s.exportPdf
          set({ download: gated(told) })
          return s
        },
        (e: unknown) => {
          emit({ type: 'fail', event: 'crashed', text: String((e as Error)?.message ?? e) })
          throw e
        },
      )
      return session
    },
    // (the reader's own choice: a host's hold for the narrow window is theirs to end)
    setDisplay: (display) => {
      set({ chose: true })
      later((s) => s.setDisplay(display))
    },
    hold: (on) => later((s) => s.hold?.(on)),
    // the interface's switch has one mode (PDF-READER §3, sync scrolling): top alignment, or off
    setSync: (on) => later((s) => s.setSyncMode(on ? 'same' : 'off')),
    zoomBy: (factor) => {
      set({ zoom: null })
      later((s) => s.zoomBy(factor))
    },
    zoomTo: (value) => {
      set({ zoom: value })
      later((s) => s.zoomTo(value))
    },
    goToPage: (side, page, o) =>
      later((s) => (o?.jump ? s.goToPage(side, page, { jump: true }) : s.goToPage(side, page))),
    back: () => later((s) => s.back?.()),
    setPrefs: (patch) => later((s) => s.setPrefs(patch)),
    goToHeading: (id, o) => later((s) => s.goToUnit(id, o)),
    lead: (side) => later((s) => s.lead(side)),
    // a session that could not open is retried as the page first was: loaded again (PDF-READER §11.3)
    retry: () =>
      void session?.then(
        (s) => s.retry(),
        () => location.reload(),
      ),
    pinch: (side, factor, origin) => {
      set({ zoom: null })
      later((s) => s.pinch(side, factor, origin))
    },
    setNarrow(on) {
      if (state.narrow === on) return
      set({ narrow: on })
      later((s) => s.setNarrow(on))
    },
    toast,
    async download(which) {
      const s = await session
      // the original: arXiv's, the browser's own download, nothing of it read here
      if (which === 'original') {
        s?.openOriginal()
        return
      }
      if (!s || state.exporting) return
      const lang = state.prefs?.target ?? ''
      const save = (parts: Uint8Array[]) => {
        const a = Object.assign(document.createElement('a'), {
          href: URL.createObjectURL(new Blob(parts as BlobPart[], { type: 'application/pdf' })),
          download: fileName(state.paper.id, which, lang),
        })
        a.click()
        setTimeout(() => URL.revokeObjectURL(a.href), 1000)
      }
      // (a session of before the PDF download: the translation's bytes where it has them, as it gave them)
      if (!s.exportPdf) {
        if (which !== 'translation') return
        const bytes = await s.pdfBytes(which)
        if (bytes) save([bytes])
        return
      }
      const ac = new AbortController()
      exportAc = ac
      set({ exporting: { form: which, percent: 0 }, exportFailed: null })
      try {
        while (working) await working.catch(() => {})
        if (ac.signal.aborted) return
        const made = s.exportPdf(which, {
          signal: ac.signal,
          progress: (share) => {
            const percent = Math.max(0, Math.min(99, Math.floor(share * 100)))
            if (exportAc === ac && state.exporting && percent > state.exporting.percent)
              set({ exporting: { form: which, percent } })
          },
        })
        working = made
        void made.then(
          () => {
            if (working === made) working = null
          },
          () => {
            if (working === made) working = null
          },
        )
        const parts = await made
        if (ac.signal.aborted) return
        save(parts)
        exportAc = null
        set({ exporting: null })
        toast({ words: R.export.done(which === 'translation' ? 'translation' : 'sideBySide'), icon: 'check' })
      } catch (e) {
        if (exportAc !== ac) return
        exportAc = null
        if (ac.signal.aborted) {
          set({ exporting: null })
          return
        }
        console.warn('[reader] the PDF download failed:', e)
        set({ exporting: null, exportFailed: which })
      }
    },
    cancelExport() {
      exportAc?.abort()
      exportAc = null
      set({ exporting: null })
    },
    retryExport() {
      const form = state.exportFailed
      if (!form) return
      set({ exportFailed: null })
      void controller.download(form)
    },
    closeExportFailure() {
      set({ exportFailed: null })
    },
  }
  return controller
}
