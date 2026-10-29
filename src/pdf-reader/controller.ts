// The one boundary between the reader's engine and its interface (the reader's design, §11.3): the session's events
// folded into a state the interface subscribes to, and the interface's commands passed on to the session. pdfslick's
// per-viewer store, adopted: the engine's events drive the store, and nothing reads the viewers back. The session is the
// reading view the engine holds for both readers (§11.7) and the extension's run of a paper on its layer (session/host.ts,
// session/run.ts), whose events fromView and the run turn into the ones below
import { toBcp47 } from '@/config/languages'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { ConfigReading } from '@/config/storage'
import type { PackState } from '@/shared/pack'
import { paperOf } from './addresses'
import type { OutlineEntry } from './engine/view/outline'
import type { ViewEvent } from './engine/view.mjs'
import { PROVIDER_ERROR_KINDS, type ProviderErrorKind } from '@/providers/types'
import { type EngineDisplay, LASTING, type SessionEvent, type SessionHost, type SyncMode, type Unavailable } from './session/events'

export type Display = EngineDisplay
export type Side = 'left' | 'right'
/** loading the original; the paper's layer being prepared; the translation under way; reading; or the reader cannot go on */
export type Phase = 'loading' | 'preparing' | 'translating' | 'ready' | 'failed'

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
  preparing: { position: number | null; progress: number | null } | null
  /** the translation has begun this visit: a prepare still under way after it is no longer the phase (its polls would
   *  take the phase back from the translation, and the line and the status region with it) */
  begun: boolean
  /** the translation done before a page of the layer is laid where the translation shows (the web's `laying`, swaps.ts): the
   *  right pane is the original's yet, so its end is held (the phase translating, the line on) until a page is laid, the layer
   *  is refused, or the original alone is shown */
  laying: boolean
  /** the layer's pages laid, of the paper's */
  layer: { laid: number; total: number }
  /** no bilingual version for now (refused, unreachable: passing), or for this paper or language; null while there may be */
  unavailable: { why: Unavailable; retryAt: number | null } | null
  /** 0–1, the share of the paper's paragraphs translated */
  progress: number
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
  languageSupported: boolean
  /** what can be downloaded: nothing yet, the original, or the translation (Task 20 fills it) */
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
  /** the extension's settings as they last landed; null before the first read */
  settings: Config | null
  /** the paper: its id from the address, its title once known ('' until then, or when there is none) */
  paper: { id: string; title: string }
  /** the address names no paper (a hand-typed one): known from the address, before any session: nothing to load, and
   *  the card says it cannot be found (S-R-20) */
  noPaper: boolean
  /** the window too narrow for two sides: side by side shows the translation alone (setNarrow) */
  narrow: boolean
  /** the contents (outline.ts) */
  outline: OutlineEntry[]
  /** the heading being read: the last one above the reading line on the side read; null before the first */
  currentHeading: number | null
  /** the offline service's language pack, as the settings' surface knows it */
  pack: PackState | null
  /** the zoom last chosen from the menu; null after a step or a pinch */
  zoom: 'page-width' | 'page-fit' | 'page-actual' | number | null
  /** the sides scroll together, as the reader applies it — not the stored setting, which a refused write or an address may not match */
  sync: boolean
}

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
  loaded: 0,
  failedUnits: 0,
  failure: null,
  failures: { pdf: null, service: null },
  languageSupported: true,
  download: 'none',
  scale: 1,
  sides: { left: { page: 1, pages: 0 }, right: { page: 1, pages: 0 } },
  settingsUnreadable: false,
  refusals: 0,
  mended: 0,
  settings: null,
  paper: { id: '', title: '' },
  noPaper: false,
  narrow: false,
  sync: true,
  outline: [],
  currentHeading: null,
  pack: null,
  zoom: 'page-width',
}

/** the session's commands the controller passes on */
export interface Session {
  setDisplay(mode: EngineDisplay): void
  setSyncMode(mode: SyncMode): void
  zoomBy(factor: number): void
  zoomTo(value: number | 'page-width' | 'page-fit' | 'page-actual'): void
  goToPage(side: Side, page: number): void
  patchSettings(change: (latest: Config) => Config): void
  /** the translation's bytes, to save (Task 20 fills it); null while there are none */
  pdfBytes(which: 'translation'): Promise<Uint8Array | null>
  /** arXiv's own PDF of the paper opened by the browser, in a tab of its own: the browser streams it and saves it. Never read
   *  through the reader (the whole file, for every reader, in case one asks to save it) */
  openOriginal(): void
  goToUnit(id: number): void
  lead(which: Side): void
  retry(): void
  setNarrow(on: boolean): void
  pinch(which: Side, factor: number, origin: [number, number]): void
}

/** the engine's error kinds are the chain's (translate.mjs); anything else, a crash included, is the popup's unknown */
const kindOf = (kind: string | undefined): ProviderErrorKind => (PROVIDER_ERROR_KINDS as readonly string[]).includes(kind ?? '') ? (kind as ProviderErrorKind) : 'unknown'
/** the layer has drawn something: a failure then leaves the pages laid readable, its card not over them */
const drawn = (state: ReaderState) => state.layer.laid > 0
/** the original could not be opened: its card stands, whatever the run does meanwhile (its rows wait for the original),
 *  until the original opens */
const noOriginal = (state: ReaderState) => state.failures.pdf !== null
/** the failures given, with the one shown derived from them */
const withFailures = (state: ReaderState, failures: ReaderState['failures']): ReaderState => ({ ...state, failures, failure: failures.pdf ?? failures.service })

/**
 * One event folded into the state; the same object when nothing changed, so that no listener hears of it. The phase moves
 * at named steps only (the design, §8): loading until the original is on screen, preparing while our server makes the paper's
 * layer, translating from the run's first batch until its end, reading after. A failure over pages laid leaves them readable:
 * reading, the failure kept; one with nothing laid is the card's
 */
export function reduce(state: ReaderState, event: SessionEvent): ReaderState {
  switch (event.type) {
    case 'display':
      // an address with no paper has no translated display to be had: the original stays selected, whatever the saved
      // settings ask for (the radio of a display out of reach was left selected, and its pane hidden)
      if (state.noPaper || event.mode === state.display) return state
      // the original alone shown: nothing waits on a page of the layer
      if (state.laying && event.mode === 'original') return { ...state, display: event.mode, laying: false, phase: state.phase === 'translating' ? 'ready' : state.phase }
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
      return now.page === event.page && now.pages === event.pages ? state : { ...state, sides: { ...state.sides, [event.side]: { page: event.page, pages: event.pages } } }
    }
    case 'notice':
      return (event.why != null) === state.settingsUnreadable ? state : { ...state, settingsUnreadable: event.why != null }
    // the session tells of unreadable settings before the refusal that follows from them: that one is the notice's
    case 'refused':
      return state.settingsUnreadable ? state : { ...state, refusals: state.refusals + 1 }
    case 'heading':
      return event.id === state.currentHeading ? state : { ...state, currentHeading: event.id }
    case 'outline':
      return { ...state, outline: event.entries }
    case 'paper':
      return { ...state, paper: { id: event.id, title: event.title } }
    case 'sync':
      return event.on === state.sync ? state : { ...state, sync: event.on }
    case 'html':
      return event.url === state.htmlVersion ? state : { ...state, htmlVersion: event.url }
    case 'settings':
      return event.config === state.settings && event.pack === state.pack ? state : { ...state, settings: event.config, pack: event.pack }
    // a write of this page that went through: storage takes a write, so a refusal before it is told no more. Only that
    // proves it: the settings shown again (a language pack that came, a read, another tab's change) prove nothing
    case 'saved':
      return state.mended === state.refusals ? state : { ...state, mended: state.refusals }
    // the original on screen, in every display: readable, a failure of its open before it mended (a retry that opened)
    // (a failure the open mends is the original's own fetch failure alone: a service's, a key missing, stays with its card)
    case 'opened': {
      const mends = state.failures.pdf !== null
      const next = withFailures(state, { ...state.failures, pdf: null })
      // a service's failure left with nothing laid keeps its card
      const failed = next.failures.service !== null && !drawn(next) && state.phase === 'failed'
      return { ...next, phase: state.phase === 'loading' || (mends && !failed) ? 'ready' : state.phase, download: state.download === 'none' ? 'original' : state.download }
    }
    case 'fail': {
      const kind = kindOf(event.kind)
      const failures = event.event === 'fetch failed' ? { ...state.failures, pdf: kind } : { ...state.failures, service: kind }
      return { ...withFailures(state, failures), phase: drawn(state) ? 'ready' : 'failed' }
    }
    case 'preparing': {
      const preparing = { position: event.position, progress: event.progress }
      // the phase only before the translation has begun, and over the original on screen (loading stays loading)
      const phase = !state.begun && (state.phase === 'ready' || state.phase === 'preparing') ? 'preparing' : state.phase
      return { ...state, preparing, unavailable: null, phase }
    }
    case 'prepared':
      return state.preparing === null && state.phase !== 'preparing' ? state : { ...state, preparing: null, phase: state.phase === 'preparing' ? 'ready' : state.phase }
    case 'coming':
      return state.unavailable === null && state.available ? state : { ...state, unavailable: null, available: true, languageSupported: true }
    case 'layer': {
      const layer = event.laid === state.layer.laid && event.total === state.layer.total ? state.layer : { laid: event.laid, total: event.total }
      // the layer refused for the visit: no bilingual version now, the original stays
      // (a lasting word the run told already stands: a layer that draws nothing is the paper's, and its side's own refusal at the
      // base does not make it a moment's)
      if (event.state === 'refused') return { ...state, layer, preparing: null, laying: false, unavailable: state.unavailable && LASTING.has(state.unavailable.why) ? state.unavailable : { why: 'unreachable', retryAt: null }, phase: state.phase === 'failed' ? 'failed' : 'ready' }
      // a page laid where the translation shows: the end held is told
      if (state.laying && layer.laid > 0) return { ...state, layer, laying: false, phase: state.phase === 'translating' ? 'ready' : state.phase }
      return layer === state.layer ? state : { ...state, layer }
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
function reduceRun(state: ReaderState, event: Extract<SessionEvent, { type: 'translating' | 'translated' | 'unavailable' }>, held: boolean): ReaderState {
  const next = reduceRunFree(state, event)
  // (the PDF's slot is no run event's: it stands, and the phase with it)
  return held ? { ...withFailures(next, { ...next.failures, pdf: state.failures.pdf }), phase: 'failed' } : next
}
function reduceRunFree(state: ReaderState, event: Extract<SessionEvent, { type: 'translating' | 'translated' | 'unavailable' }>): ReaderState {
  switch (event.type) {
    case 'translating': {
      const progress = event.total ? Math.min(1, event.got / event.total) : 0
      return { ...withFailures(state, { ...state.failures, service: null }), phase: 'translating', begun: true, laying: false, progress, failedUnits: event.lost }
    }
    case 'translated': {
      const progress = event.total ? Math.min(1, event.got / event.total) : 1
      // stopped short with nothing laid: the card, with the service's reason; with pages laid, the notice and its retry
      if (event.stopped && !drawn(state)) return { ...withFailures(state, { ...state.failures, service: event.stopped }), phase: 'failed', begun: true, progress, failedUnits: event.lost }
      // done with nothing laid where the translation shows: the end held until a page is (laying)
      if (!event.stopped && !drawn(state) && state.display !== 'original') return { ...withFailures(state, { ...state.failures, service: null }), phase: 'translating', begun: true, laying: true, progress, failedUnits: event.lost }
      return { ...withFailures(state, { ...state.failures, service: event.stopped }), phase: 'ready', begun: true, laying: false, progress, failedUnits: event.lost }
    }
    case 'unavailable': {
      const lasting = LASTING.has(event.why)
      return {
        ...state, preparing: null, unavailable: { why: event.why, retryAt: event.retryAt },
        // the paper's own: its translated displays greyed; a language the layer does not set: the language's notice
        available: lasting && event.why !== 'target' ? false : state.available,
        languageSupported: event.why === 'target' ? false : state.languageSupported,
        phase: state.phase === 'failed' ? 'failed' : 'ready',
      }
    }
  }
}

/** the reading view's event as the session's (the reader's design, §11.7): what the interface's state is folded from. The
 *  original opened is `opened` (ready in every display), a PDF that could not be opened its fetch failure; the paper's id is
 *  the address's. None for what the interface does not hold (the original dropped) */
export function fromView(event: ViewEvent, paper: string): SessionEvent | null {
  switch (event.type) {
    case 'loading': return event
    case 'opened': return { type: 'opened' }
    case 'failed': return { type: 'fail', event: 'fetch failed', text: `Could not fetch ${paper}'s PDF (${event.error})`, kind: 'network' }
    case 'paper': return { type: 'paper', id: paper, title: event.title }
    case 'page': return { type: 'page', side: event.side, page: event.page, pages: event.pages }
    case 'scale': return { type: 'scale', scale: event.scale, zoom: event.zoom }
    case 'display': return { type: 'display', mode: event.display }
    case 'sync': return { type: 'sync', on: event.on }
    case 'outline': return event
    case 'heading': return event
    case 'layer': return { type: 'layer', state: event.state, laid: event.laid, total: event.total }
    default: return null
  }
}

/** a download's file name (the reader's design, §6.1): the paper's id, the translation's with its language; the slash of
 *  an old-style id (hep-th/9711200) made safe */
export function fileName(id: string, which: 'translation' | 'original', lang: string): string {
  return `${id.replace(/\//g, '_')}${which === 'translation' ? `.${lang}` : ''}.pdf`
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
  goToPage(side: Side, page: number): void
  /** a change of the extension's settings, on top of what storage holds when its turn comes */
  patchSettings(change: (latest: Config) => Config): void
  /** a pinch over a side: both sides zoom together about the pointer, one call a frame (ui/pinch.ts) */
  pinch(side: Side, factor: number, origin: [number, number]): void
  /** translate again what is missing (Part 3: the page starts again; Part 4 in place) */
  retry(): void
  /** the window too narrow for two sides, or wide enough again: told once per change */
  setNarrow(on: boolean): void
  /** a side made the leading one, as a press in its pane makes it (a press on its scroll indicator) */
  lead(side: Side): void
  /** both sides shown taken to a heading from the contents */
  goToHeading(id: number): void
  /** a side's PDF saved as a file, named by the paper (fileName) */
  download(which: 'translation' | 'original'): Promise<void>
}

/** what an address with no paper starts from: nothing is loading, and no translated display can be had */
const NO_PAPER: Partial<ReaderState> = { noPaper: true, phase: 'ready', available: false }

/**
 * `reading`: the page's own first read of the settings (main.tsx, ui/first-read.ts), made before the first paint and not
 * waiting for the session, which is a heavy module that reads them again: the chrome is drawn with what storage holds
 * from its first frame. A read that did not answer in the time the page gave it (`null`) paints the defaults, and so does
 * one whose value cannot be read (its `fallbackReason`): both said to be unreadable (S-R-21). The session is handed it
 * (`SessionHost.reading`): one that did not answer is not waited on again, the PDF opens on the defaults, and the
 * session shows the settings as they come. Without `reading` nothing is known until the session says
 */
export function createController({ open, params, reading }: { open: (host: SessionHost) => Promise<Session>; params: URLSearchParams; reading?: ConfigReading | null }): ReaderController {
  const id = paperOf(params)
  let state: ReaderState = {
    ...INITIAL,
    paper: { id, title: '' },
    ...(id ? {} : NO_PAPER),
    ...(reading === undefined ? {} : { settings: reading?.config ?? DEFAULT_CONFIG, settingsUnreadable: !reading || reading.fallbackReason !== null }),
  }
  const listeners = new Set<() => void>()
  let session: Promise<Session> | null = null
  const emit = (event: SessionEvent) => {
    const next = reduce(state, event)
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }
  /**
   * A command: carried out once the session is open, in the order given (a click while the paper opens is not lost);
   * one given before `attach` has no session to wait for and is dropped, as is one for a session that could not open
   */
  const later = (act: (s: Session) => void) => void session?.then(act, () => {})
  /** a change of the state that is the controller's own (the zoom chosen), not the session's; none, when nothing in it
   *  differs (a pinch's every step sets no zoom: the final review) */
  const set = (patch: Partial<ReaderState>) => {
    if ((Object.keys(patch) as (keyof ReaderState)[]).every(k => Object.is(state[k], patch[k]))) return
    state = { ...state, ...patch }
    for (const listener of listeners) listener()
  }
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    attach(panes) {
      // a session that cannot be opened (its module not loaded) is a failure the interface shows, as a crash is
      session ??= open({ ...panes, params, emit, ...(reading === undefined ? {} : { reading }) }).catch((e: unknown) => {
        emit({ type: 'fail', event: 'crashed', text: String((e as Error)?.message ?? e) })
        throw e
      })
      return session
    },
    setDisplay: display => later(s => s.setDisplay(display)),
    // the interface's switch is the owner's design or nothing (exp-freeze-2026-10-07:experiments/pdf-bilingual/REPORT.md, sixteenth addendum): top alignment, or off
    setSync: on => later(s => s.setSyncMode(on ? 'same' : 'off')),
    zoomBy: factor => { set({ zoom: null }); later(s => s.zoomBy(factor)) },
    zoomTo: value => { set({ zoom: value }); later(s => s.zoomTo(value)) },
    goToPage: (side, page) => later(s => s.goToPage(side, page)),
    patchSettings: change => later(s => s.patchSettings(change)),
    goToHeading: id => later(s => s.goToUnit(id)),
    lead: side => later(s => s.lead(side)),
    // a session that could not open is retried as the page first was: loaded again (PDF-READER §11.3)
    retry: () => void session?.then(s => s.retry(), () => location.reload()),
    pinch: (side, factor, origin) => { set({ zoom: null }); later(s => s.pinch(side, factor, origin)) },
    setNarrow(on) {
      if (state.narrow === on) return
      set({ narrow: on })
      later(s => s.setNarrow(on))
    },
    async download(which) {
      const s = await session
      // the original: arXiv's, the browser's own download, nothing of it read here
      if (which === 'original') { s?.openOriginal(); return }
      const bytes = await s?.pdfBytes(which)
      if (!bytes) return
      const lang = state.settings ? toBcp47(state.settings.targetLanguage) : ''
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })), download: fileName(state.paper.id, which, lang) })
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    },
  }
}
