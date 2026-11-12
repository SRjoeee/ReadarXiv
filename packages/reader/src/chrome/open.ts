// A reader made into the chrome's session, for every host that mounts the chrome over the reader package (the extension's
// page and the website's: interfaces/host DECISION, the review of 2026-11-12's S3): `openReader` on the page's <body> with the
// host's Host, its state told to the chrome as the chrome's events (eventsOf) at each change, the chrome's commands the
// reader's. A host gives only what differs: its Host, its paper (now, or once the panes are there), the address's visit, the
// typesetter's seam and the PDF.js build where it has its own, the events it tells otherwise (`tell`), what it watches of the
// reader (`watch`), whether the chrome may hold the original by its rules (`hold`), and what goes with the reader at the page's
// end (`closed`).
//
// The page's end: the reader is closed only on a `pagehide` that is not persisted. A page put away in the back-forward cache
// keeps its reader as it is; the reader puts its session away on the persisted `pagehide` and resumes by itself on the
// persisted `pageshow` (reader.ts `env.away`): a page the browser may restore is never closed for good (the coordinator's
// ruling of 2026-11-13, the website's rule before it).
import { openReader, type Engine, type Host, type Reader, type ReaderState } from '../reader.ts'
import type { PdfBuild } from '../pdfjs/kit.ts'
import type { Prefs, PrefsPatch } from '../prefs.ts'
import { eventsOf } from './events.ts'
import type { Session, SessionEvent, SessionHost } from './model.ts'

export interface ChromeOpen {
  host: Host
  /** the paper with its version where known (`2401.01234v2`), or a promise of it, asked once the panes are there */
  paper: string | (() => Promise<string>)
  /** the address's, for this visit: shown, never written */
  visit?: Partial<Pick<Prefs, 'display' | 'target' | 'sync'>>
  /** the typesetter's seam (a test's lay); none: the reader's own */
  engine?: Engine
  /** the PDF.js build this browser reads with; none: the modern */
  pdfjs?: PdfBuild
  /** the events the chrome is told at a change, from those the reader's state gives (eventsOf): a host's own words for some */
  tell?: (events: readonly SessionEvent[], state: ReaderState, before: ReaderState | null) => SessionEvent[]
  /** the reader once open, and each state it comes to */
  watch?: (reader: Reader, state: ReaderState) => void
  /** the chrome may hold the original on screen by the host's rules (Session `hold`); none: the session holds nothing */
  hold?: boolean
  /** told once the reader is closed at the page's end */
  closed?: () => void
}

/** the chrome's `open` over the reader package */
export function openSession(o: ChromeOpen): (chrome: SessionHost) => Promise<Session> {
  return async (chrome) => {
    const paper = typeof o.paper === 'string' ? o.paper : await o.paper()
    // (the reader's marks and sheets on the page's body: its root's own placement rule on the chrome's document area left the
    // panes no height)
    const reader: Reader = openReader(document.body, {
      host: o.host,
      paper,
      ...(o.visit ? { visit: o.visit } : {}),
      ...(o.engine ? { engine: o.engine } : {}),
      ...(o.pdfjs ? { pdfjs: o.pdfjs } : {}),
      panes: { left: chrome.left, right: chrome.right },
    })
    let told: ReaderState | null = null
    const tell = () => {
      const s = reader.state()
      const events = eventsOf(told, s)
      for (const e of o.tell ? o.tell(events, s, told) : events) chrome.emit(e)
      told = s
      o.watch?.(reader, s)
    }
    reader.subscribe(tell)
    tell()
    const end = (e: Event) => {
      if ((e as PageTransitionEvent).persisted) return
      removeEventListener('pagehide', end)
      reader.close()
      o.closed?.()
    }
    addEventListener('pagehide', end)
    // (the probes' contract: bounded counts and moments, never a page's text; beside what the chrome's parts put there)
    const probes = globalThis as { __reader?: object }
    probes.__reader ??= {}
    Object.assign(probes.__reader, { probe: () => reader.probe(), reader })
    const set = (prefs: PrefsPatch) => {
      const now = reader.state().prefs
      reader.do({
        do: 'set',
        prefs: {
          ...(prefs as Partial<Prefs>),
          ...(prefs.classes ? { classes: { ...now.classes, ...prefs.classes } } : {}),
          ...(prefs.highlight ? { highlight: { ...now.highlight, ...prefs.highlight } } : {}),
        },
      })
    }
    return {
      setDisplay: (display) => set({ display }),
      setSyncMode: (m) => set({ sync: m === 'same' }),
      zoomBy: (factor) => reader.do({ do: 'zoomBy', factor }),
      zoomTo: (to) => reader.do({ do: 'zoom', to }),
      goToPage: (side, page) => reader.do({ do: 'page', side, page }),
      setPrefs: set,
      // (no translation's PDF yet: its download greyed in both hosts, as today's)
      pdfBytes: async () => null,
      // arXiv's own PDF, opened by the browser in a tab of its own: never read through the reader
      openOriginal: () => reader.do({ do: 'original' }),
      goToUnit: (id) => reader.do({ do: 'heading', id }),
      lead: (side) => reader.do({ do: 'lead', side }),
      retry: () => reader.do({ do: 'retry' }),
      setNarrow: (on) => reader.do({ do: 'narrow', on }),
      pinch: (side, factor, at) => reader.do({ do: 'pinch', side, factor, at }),
      ...(o.hold ? { hold: (on: boolean) => reader.do({ do: 'hold', on }) } : {}),
    }
  }
}
