// The extension's host of the reading view (docs/PDF-READER.md §11.7): the engine's createReaderView given what the
// extension has — the reader page's two panes, its PDF.js build, the reader's words from the locale packs, the look from its
// settings, a new tab for a link out of the paper — and arXiv's PDF by an opener over PDF.js's own loader (its first page
// before the whole file). The view's events go to the controller (controller.ts fromView), and the controller's commands
// come back as a Session.
//
// The development entry `?layer=1` (main.tsx) runs the reader on this host: the original on both panes, as the reader shows
// a paper before its translation. The layer's side (its bundle from the layer API, the rows, the add-on's composed
// document) joins it with the layer side's PR; the extension's own session (session.mjs) stays the reader until then.
// Nothing here writes the settings: the view takes no preference, and the reader's switches write through the settings
// surface once the extension runs on the view (Task 12, with Task 7 Step 5's rows).
import { appearanceRule } from '@/core/renderer/style-preset'
import { lookOf } from '@/config/appearance'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import { watchConfig } from '@/config/storage'
import { R } from '@/ui/strings'
import { createReaderView, type DocumentTask, type ReaderHost, type ReaderView, type ViewPrefs } from '../engine/view.mjs'
import { readerAddresses } from '../addresses.mjs'
import { fromView, type Session } from '../controller'
import { ASSETS, EventBus, LinkTarget, PDFLinkService, PDFPageView, PDFViewer, pdfjsLib } from '../pdfjs'
import { displayOf } from '../settings'
import type { EngineDisplay, SessionHost } from './session.mjs'

/** the look the view reads, of the extension's settings: the panes swapped, the pages dimmed, the theme (the system's
 *  where it is the system's), the highlight */
export function prefsOf(config: Config, systemDark: boolean): ViewPrefs {
  return {
    swapped: config.pdfReader.swapped, dimPages: config.pdfReader.dimPages,
    theme: config.theme === 'system' ? (systemDark ? 'dark' : 'light') : config.theme,
    highlight: config.reading.sentenceHighlight,
  }
}
/** the display a reader opens in: the one the address names (a probe's page), else the settings' */
export function displayFrom(params: URLSearchParams, config: Config): EngineDisplay {
  const named = params.get('mode')
  return named === 'original' || named === 'bilingual' || named === 'translation' ? named : displayOf(config)
}

/** the reader page's host of the view, over the panes the page drew; `config` the settings as the page read them */
export function readerHost(host: SessionHost, config: Config, paper: string): ReaderHost & { stop(): void } {
  let latest = config
  const dark = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
  const listeners = new Set<(p: ViewPrefs) => void>()
  const prefs = () => prefsOf(latest, !!dark?.matches)
  // the highlight's colour and strength, the look sheet's variables (--axt-hl-color, --axt-hl-mix), written when they change
  let sheet: HTMLStyleElement | null = null
  const showLook = () => {
    const text = appearanceRule(lookOf(latest))
    sheet ??= Object.assign(document.createElement('style'), { id: 'axt-look' })
    if (!sheet.isConnected) document.head.append(sheet)
    if (sheet.textContent !== text) sheet.textContent = text
  }
  showLook()
  const unwatch = watchConfig(next => {
    latest = next
    showLook()
    const p = prefs()
    for (const l of listeners) l(p)
  })
  return {
    panes: { left: host.left, right: host.right },
    pdfjs: { lib: pdfjsLib, viewer: { EventBus, PDFViewer, PDFPageView, PDFLinkService, LinkTarget }, assets: ASSETS },
    words: { pageName: (side, n) => R.pageName(side === 'left' ? 'original' : 'translation', n), sideName: side => R.display[side === 'left' ? 'original' : 'translation'] },
    prefs: { get: prefs, subscribe: l => { listeners.add(l); return () => { listeners.delete(l) } } },
    links: { openExternal: url => { globalThis.open(url, '_blank', 'noopener') } },
    emit: event => { const e = fromView(event, paper); if (e) host.emit(e) },
    stop() { unwatch(); listeners.clear(); sheet?.remove() },
  }
}

/**
 * The reading view opened in the reader page's panes, on arXiv's PDF of the address's paper, and the controller's Session
 * over it. A retry opens the original again; the download gives the original's bytes, read through its document
 */
export function openView(host: SessionHost): Session {
  const params = host.params, paper = params.get('paper') ?? ''
  const config = host.reading?.config ?? DEFAULT_CONFIG
  const vh = readerHost(host, config, paper)
  const view: ReaderView = createReaderView(vh)
  const pdf = readerAddresses(params, paper).pdf
  const original = (options: Readonly<Record<string, unknown>>) => pdfjsLib.getDocument({ ...options, url: pdf }) as unknown as DocumentTask
  const reader = { ready: false, view, probe: () => view.probe() }
  ;(window as unknown as { __reader: object }).__reader = reader
  const show = () => { if (paper) void view.showOriginal(original).then(r => { if (r === 'opened') reader.ready = true }) }
  view.setDisplay(paper ? displayFrom(params, config) : 'original')
  view.setSync(config.pdfReader.sync)
  show()
  addEventListener('pagehide', () => { view.dispose(); vh.stop() }, { once: true })
  return {
    setDisplay: d => view.setDisplay(d),
    setSyncMode: m => view.setSync(m !== 'off'),
    // the compositor's follower is the browser's to have; figure text is a question of the layer's units (PR 5)
    setCompositor: () => {},
    setFigures: () => {},
    zoomBy: f => view.zoomBy(f),
    zoomTo: z => view.zoomTo(z),
    goToPage: (side, n) => view.goToPage(side, n),
    goToUnit: id => view.goToUnit(id),
    lead: side => view.lead(side),
    pinch: (side, f, origin) => view.pinch(side, f, origin),
    setNarrow: on => view.setNarrow(on),
    patchSettings: () => {},
    retry: show,
    pdfBytes: async which => (which === 'original' ? ((await view.originalData()) ?? null) : null),
  }
}
