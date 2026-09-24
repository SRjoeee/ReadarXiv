// The one boundary between the reader's engine and its interface (the reader's design, §11.3): the session's events
// folded into a state the interface subscribes to, and the interface's commands passed on to the session. pdfslick's
// per-viewer store, adopted: the engine's events drive the store, and nothing reads the viewers back
import type { EngineDisplay, SessionEvent, SessionHost } from './engine/session.mjs'
import type * as SessionModule from './engine/session.mjs'

export type Display = EngineDisplay
export type Side = 'left' | 'right'
export type Phase = 'loading' | 'translating' | 'retranslating' | 'ready' | 'failed'

export interface ReaderState {
  display: Display
  /** false: the paper cannot be had as a bilingual PDF (the design, §8): the two translated displays greyed, the original shown */
  available: boolean
  phase: Phase
  /** 0–1, the share of the paper's paragraphs translated */
  progress: number
  /** the paragraphs the service failed on: the notice's {n} */
  failedUnits: number
  /** why nothing could be translated, as the chain's error kind (the popup's REASON); null otherwise */
  failure: string | null
  languageSupported: boolean
  /** the final translation is on screen: the translation's PDF can be downloaded */
  finalReady: boolean
  scale: number
  sides: Record<Side, { page: number; pages: number }>
  /** the extension's settings could not be read, and their defaults are in use */
  settingsUnreadable: boolean
}

export const INITIAL: ReaderState = {
  display: 'original',
  available: true,
  phase: 'loading',
  progress: 0,
  failedUnits: 0,
  failure: null,
  languageSupported: true,
  finalReady: false,
  scale: 1,
  sides: { left: { page: 1, pages: 0 }, right: { page: 1, pages: 0 } },
  settingsUnreadable: false,
}

/** the session's commands the controller passes on */
export type Session = Pick<typeof SessionModule, 'setDisplay' | 'setSyncMode' | 'setCompositor' | 'setFigures' | 'zoomBy' | 'zoomTo' | 'goToPage'>

/** the runs that end without a translation because of the paper, or of the language: not failures a reader can retry */
const CANNOT_BE_HAD = new Set(['no source'])
const NOT_SUPPORTED = new Set(['not verified'])
/** the steps of a run that mean a translation is being made (live.mjs and session.mjs note) */
const MAKING = new Set(['digest', 'source', 'anchored', 'translated', 'preview', 'shown preview', 'final'])

/** one event folded into the state; the same object when nothing changed, so that no listener hears of it */
export function reduce(state: ReaderState, event: SessionEvent): ReaderState {
  switch (event.type) {
    case 'display':
      return event.mode === state.display ? state : { ...state, display: event.mode }
    case 'scale':
      return event.scale === state.scale ? state : { ...state, scale: event.scale }
    case 'page':
      return { ...state, sides: { ...state.sides, [event.side]: { page: event.page, pages: event.pages } } }
    case 'notice':
      return (event.why != null) === state.settingsUnreadable ? state : { ...state, settingsUnreadable: event.why != null }
    case 'fail':
      if (CANNOT_BE_HAD.has(event.event)) return { ...state, available: false, phase: 'ready' }
      if (NOT_SUPPORTED.has(event.event)) return { ...state, languageSupported: false, phase: 'ready' }
      return { ...state, phase: 'failed', failure: event.kind ?? 'unknown' }
    case 'note': {
      const progress = event.total ? Math.min(1, event.got / event.total) : state.progress
      if (event.event === 'opened') return state.display === 'original' ? { ...state, phase: 'ready' } : state
      if (event.event === 'cache current') return { ...state, phase: 'ready', finalReady: true, progress: 1 }
      if (event.event === 'shown cached') return { ...state, finalReady: true }
      if (event.event === 'shown final') return { ...state, finalReady: true, progress: 1 }
      if (event.event === 'done') return { ...state, phase: state.phase === 'failed' ? 'failed' : 'ready', failedUnits: event.lost }
      if (MAKING.has(event.event)) return { ...state, phase: event.again ? 'retranslating' : 'translating', progress, failedUnits: event.lost }
      return state
    }
    default:
      return state
  }
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
}

export function createController({ open, params }: { open: (host: SessionHost) => Promise<Session>; params: URLSearchParams }): ReaderController {
  let state = INITIAL
  const listeners = new Set<() => void>()
  let session: Promise<Session> | null = null
  const emit = (event: SessionEvent) => {
    const next = reduce(state, event)
    if (next === state) return
    state = next
    for (const listener of listeners) listener()
  }
  /** a command: carried out once the session is open, in the order given (a click while the paper opens is not lost) */
  const later = (act: (s: Session) => void) => void session?.then(act)
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    attach(panes) {
      session ??= open({ ...panes, params, emit })
      return session
    },
    setDisplay: display => later(s => s.setDisplay(display)),
    // the interface's switch is the owner's design or nothing (REPORT, sixteenth addendum): top alignment, or off
    setSync: on => later(s => s.setSyncMode(on ? 'same' : 'off')),
    setFigures: on => later(s => s.setFigures(on)),
    zoomBy: factor => later(s => s.zoomBy(factor)),
    zoomTo: value => later(s => s.zoomTo(value)),
    goToPage: (side, page) => later(s => s.goToPage(side, page)),
  }
}
