// The one boundary between the reader's engine and its interface (the reader's design, §11.3): the session's events
// folded into a state the interface subscribes to, and the interface's commands passed on to the session. pdfslick's
// per-viewer store, adopted: the engine's events drive the store, and nothing reads the viewers back
import { toBcp47 } from '@/config/languages'
import type { Config } from '@/config/schema'
import type { PackState } from '@/shared/pack'
import type { OutlineEntry } from './outline'
import { PROVIDER_ERROR_KINDS, type ProviderErrorKind } from '@/providers/types'
import type { EngineDisplay, SessionEvent, SessionHost } from './engine/session.mjs'
import type * as SessionModule from './engine/session.mjs'

export type Display = EngineDisplay
export type Side = 'left' | 'right'
export type Phase = 'loading' | 'translating' | 'retranslating' | 'ready' | 'failed'
/** what the translation's side shows: nothing yet, this machine's copy, a draft being typeset, or the final */
export type Shown = 'none' | 'copy' | 'preview' | 'final'

export interface ReaderState {
  display: Display
  /** false: the paper cannot be had as a bilingual PDF (the design, §8): the two translated displays greyed, the original shown */
  available: boolean
  phase: Phase
  /** 0–1, the share of the paper's paragraphs translated */
  progress: number
  /** 0–1, the share of the paper's PDF downloaded, in hundredths; 0 while its size is unknown */
  loaded: number
  /** the paragraphs the service failed on: the notice's {n} */
  failedUnits: number
  /** why the last run could not translate, as the chain's error kind (the popup's REASON); null otherwise */
  failure: ProviderErrorKind | null
  languageSupported: boolean
  shown: Shown
  /** a final translation is on screen, this machine's copy or the run's: the translation's PDF can be downloaded */
  finalReady: boolean
  scale: number
  sides: Record<Side, { page: number; pages: number }>
  /** the extension's settings could not be read, and their defaults are in use */
  settingsUnreadable: boolean
  /** the extension's settings as they last landed; null before the first read */
  settings: Config | null
  /** the paper: its id from the address, its title once known ('' until then, or when there is none) */
  paper: { id: string; title: string }
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
  phase: 'loading',
  progress: 0,
  loaded: 0,
  failedUnits: 0,
  failure: null,
  languageSupported: true,
  shown: 'none',
  finalReady: false,
  scale: 1,
  sides: { left: { page: 1, pages: 0 }, right: { page: 1, pages: 0 } },
  settingsUnreadable: false,
  settings: null,
  paper: { id: '', title: '' },
  narrow: false,
  sync: true,
  outline: [],
  currentHeading: null,
  pack: null,
  zoom: 'page-width',
}

/** the session's commands the controller passes on */
export type Session = Pick<typeof SessionModule, 'setDisplay' | 'setSyncMode' | 'setCompositor' | 'setFigures' | 'zoomBy' | 'zoomTo' | 'goToPage' | 'patchSettings' | 'pdfBytes' | 'goToUnit' | 'lead' | 'retry' | 'setNarrow' | 'pinch'>

/** the runs that end without a translation because of the paper, or of the language: not failures a reader can retry */
const CANNOT_BE_HAD = new Set(['no source'])
const NOT_SUPPORTED = new Set(['not verified'])
/** what each step of a run puts on the translation's side (session.mjs note) */
const SHOWS: Record<string, Shown> = { 'shown cached': 'copy', 'cache unusable': 'none', 'shown preview': 'preview', 'shown final': 'final' }
const making = (phase: Phase) => phase === 'translating' || phase === 'retranslating'
/** the engine's error kinds are the chain's (engine.mjs); anything else, a crash included, is the popup's unknown */
const kindOf = (kind: string | undefined): ProviderErrorKind => (PROVIDER_ERROR_KINDS as readonly string[]).includes(kind ?? '') ? (kind as ProviderErrorKind) : 'unknown'

/**
 * One event folded into the state; the same object when nothing changed, so that no listener hears of it. The phase
 * moves at named steps only (the design, §8): loading until the cache is answered, reading once a translation is on
 * screen, translating from the session's decision to translate (`translating`, again when a copy is being replaced)
 * until the run ends. A failure over a translation on screen leaves it readable: reading, the failure kept
 */
export function reduce(state: ReaderState, event: SessionEvent): ReaderState {
  switch (event.type) {
    case 'display':
      return event.mode === state.display ? state : { ...state, display: event.mode }
    case 'scale':
      return event.scale === state.scale ? state : { ...state, scale: event.scale }
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
    case 'heading':
      return event.id === state.currentHeading ? state : { ...state, currentHeading: event.id }
    case 'outline':
      return { ...state, outline: event.entries }
    case 'paper':
      return { ...state, paper: { id: event.id, title: event.title } }
    case 'sync':
      return event.on === state.sync ? state : { ...state, sync: event.on }
    case 'settings':
      return event.config === state.settings && event.pack === state.pack ? state : { ...state, settings: event.config, pack: event.pack }
    case 'fail':
      if (CANNOT_BE_HAD.has(event.event)) return { ...state, available: false, phase: 'ready' }
      if (NOT_SUPPORTED.has(event.event)) return { ...state, languageSupported: false, phase: 'ready' }
      return { ...state, phase: state.shown === 'none' ? 'failed' : 'ready', failure: kindOf(event.kind) }
    case 'note': {
      const shown = SHOWS[event.event] ?? state.shown
      const next = shown === state.shown ? state : { ...state, shown, finalReady: shown === 'copy' || shown === 'final' }
      switch (event.event) {
        case 'opened':
          return state.display === 'original' && state.phase === 'loading' ? { ...next, phase: 'ready' } : next
        case 'digest':
          return shown === 'none' && state.phase === 'ready' ? { ...next, phase: 'loading' } : next
        case 'shown cached':
          return state.phase === 'loading' ? { ...next, phase: 'ready' } : next
        case 'cache current':
          return { ...next, phase: 'ready', progress: 1 }
        case 'translating':
          return { ...next, phase: event.again ? 'retranslating' : 'translating', failure: null, progress: event.total ? event.got / event.total : 0, failedUnits: event.lost }
        case 'done':
          return { ...next, phase: state.phase === 'failed' ? 'failed' : 'ready', failedUnits: event.lost, ...(shown === 'final' ? { progress: 1 } : {}) }
      }
      if (!making(state.phase)) return next
      const progress = event.total ? Math.min(1, event.got / event.total) : state.progress
      return progress === state.progress && event.lost === state.failedUnits && next === state ? state : { ...next, progress, failedUnits: event.lost }
    }
    default:
      return state
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
  setFigures(on: boolean): void
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

export function createController({ open, params }: { open: (host: SessionHost) => Promise<Session>; params: URLSearchParams }): ReaderController {
  let state: ReaderState = { ...INITIAL, paper: { id: params.get('paper') ?? '', title: '' } }
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
      session ??= open({ ...panes, params, emit }).catch((e: unknown) => {
        emit({ type: 'fail', event: 'crashed', text: String((e as Error)?.message ?? e) })
        throw e
      })
      return session
    },
    setDisplay: display => later(s => s.setDisplay(display)),
    // the interface's switch is the owner's design or nothing (REPORT, sixteenth addendum): top alignment, or off
    setSync: on => later(s => s.setSyncMode(on ? 'same' : 'off')),
    setFigures: on => later(s => s.setFigures(on)),
    zoomBy: factor => { set({ zoom: null }); later(s => s.zoomBy(factor)) },
    zoomTo: value => { set({ zoom: value }); later(s => s.zoomTo(value)) },
    goToPage: (side, page) => later(s => s.goToPage(side, page)),
    patchSettings: change => later(s => s.patchSettings(change)),
    goToHeading: id => later(s => s.goToUnit(id)),
    lead: side => later(s => s.lead(side)),
    // a session that could not open is retried as the page first was: loaded again (Codex on #301)
    retry: () => void session?.then(s => s.retry(), () => location.reload()),
    pinch: (side, factor, origin) => { set({ zoom: null }); later(s => s.pinch(side, factor, origin)) },
    setNarrow(on) {
      if (state.narrow === on) return
      set({ narrow: on })
      later(s => s.setNarrow(on))
    },
    async download(which) {
      const s = await session
      const bytes = await s?.pdfBytes(which)
      if (!bytes) return
      const lang = state.settings ? toBcp47(state.settings.targetLanguage) : ''
      const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' })), download: fileName(state.paper.id, which, lang) })
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    },
  }
}
