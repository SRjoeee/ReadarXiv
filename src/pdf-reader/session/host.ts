// The extension's host of the reading view (docs/PDF-READER.md §11.7): the engine's createReaderView given what the
// extension has — the reader page's two panes, its PDF.js build, the reader's words from the locale packs, the look from its
// settings, a new tab for a link out of the paper — and arXiv's PDF by an opener over PDF.js's own loader (its first page
// before the whole file). The view's events go to the controller (controller.ts fromView), and the controller's commands
// come back as a Session.
//
// The development entry `?layer=1` (main.tsx) runs the reader on this host: the original on both panes, as the reader shows
// a paper before its translation, and the layer's side over the layer API's transport (layerTransport: its objects by
// digest, the base checked against the original shown, the composed document over the original's bytes and the tails),
// made on the harness's word (`__reader.openSide`) and told by it: the run that tells it the layer and the rows, the faces
// and the hyphenation are the extension's run's (PR 5); the extension's own session (session.mjs) stays the reader until then.
// Nothing here writes the settings: the view takes no preference, and the reader's switches write through the settings
// surface once the extension runs on the view (Task 12, with Task 7 Step 5's rows).
import { appearanceRule } from '@/core/renderer/style-preset'
import { lookOf } from '@/config/appearance'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import { readConfig, watchConfig } from '@/config/storage'
import { R } from '@/ui/strings'
import { CTAG5 } from '../engine/layer.mjs'
import type { FaceSlice } from '../engine/layer-proto/fonts.mjs'
import { createLayerSide, createReaderView, type DocumentTask, type LayerSide, type LayerSideOptions, type ReaderHost, type ReaderView, type ViewPrefs } from '../engine/view.mjs'
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
const isDisplay = (d: string | null): d is EngineDisplay => d === 'original' || d === 'bilingual' || d === 'translation'
export function displayFrom(params: URLSearchParams, config: Config): EngineDisplay {
  const named = params.get('mode')
  return isDisplay(named) ? named : displayOf(config)
}

/** the paper's title where its PDF's metadata has none: the abstract page's citation_title, one request to arXiv made only
 *  then (the extension may read arxiv.org); '' where it cannot be had */
export async function abstractTitle(paper: string): Promise<string> {
  if (!paper) return ''
  try {
    const res = await fetch(`https://arxiv.org/abs/${paper}`, { credentials: 'omit' })
    if (!res.ok) return ''
    return new DOMParser().parseFromString(await res.text(), 'text/html').querySelector('meta[name="citation_title"]')?.getAttribute('content')?.trim() ?? ''
  } catch {
    return ''
  }
}

/** whether a link out of the paper may be opened: a web page or a mail address, never a script, data, or a page of the
 *  browser's or the extension's (a PDF's link, and the layer's, name what they like) */
export function outward(url: string): boolean {
  try { return ['http:', 'https:', 'mailto:'].includes(new URL(url).protocol) } catch { return false }
}

/** the reader page's host of the view, over the panes the page drew; `config` the settings as the page read them, `watch`
 *  how their changes are heard and `read` how they are read (the extension's storage); `late` told of settings that came
 *  after the view opened: a first read given up on, once it lands, and every change made elsewhere */
export function readerHost(host: SessionHost, config: Config, paper: string, watch: typeof watchConfig = watchConfig, read: typeof readConfig = readConfig, late: (config: Config) => void = () => {}): ReaderHost & { stop(): void } {
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
  let stopped = false, heard = false
  /** settings that came: shown, told to the controller (the page draws its look of its state: App.tsx's theme, dimmed
   *  pages and panes swapped) with whether they could be read, and to the view */
  const landed = (next: Config, why: unknown) => {
    latest = next
    showLook()
    host.emit({ type: 'settings', config: next, pack: null })
    host.emit({ type: 'notice', why })
    const p = prefs()
    for (const l of listeners) l(p)
  }
  // a change the storage holds is valid by then (watchConfig parses it): the settings are readable again
  const unwatch = watch(next => { heard = true; landed(next, null); late(next) })
  // the page's own first read given up on (no answer in its time, ui/first-read.ts), the defaults standing in: read again,
  // and the late answer followed as a change of the settings, unless a change came first
  if (host.reading == null) void read().then(r => { if (!stopped && !heard) { landed(r.config, r.fallbackReason); late(r.config) } }, () => {})
  return {
    panes: { left: host.left, right: host.right },
    pdfjs: { lib: pdfjsLib, viewer: { EventBus, PDFViewer, PDFPageView, PDFLinkService, LinkTarget }, assets: ASSETS },
    words: { pageName: (side, n) => R.pageName(side === 'left' ? 'original' : 'translation', n), sideName: side => R.display[side === 'left' ? 'original' : 'translation'] },
    prefs: { get: prefs, subscribe: l => { listeners.add(l); return () => { listeners.delete(l) } } },
    links: { openExternal: url => { if (outward(url)) globalThis.open(url, '_blank', 'noopener') } },
    titleFallback: () => abstractTitle(paper),
    emit: event => { const e = fromView(event, paper); if (e) host.emit(e) },
    stop() { stopped = true; unwatch(); listeners.clear(); sheet?.remove() },
  }
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('')
/** an object's name: its whole digest, 64 lower-case hex digits */
const DIGEST = /^[0-9a-f]{64}$/
/** how far an answer's length may pass its ref's bytes (an encoded answer's own length) before it is refused unread */
const OBJECT_MARGIN = 1024
/**
 * The layer's transport for the view's layer side, over the layer API at `api` (an origin): each object by its whole digest
 * (`/api/v1/layer/<id>v<n>/<CTAG5>/o/<sha256>`, immutable; the side's readers check the digest); the base, the bytes the left
 * holds digested against the head's (a mismatch is no layer here: fetching our copy and showing it is the extension's run's);
 * the composed document, PDF.js over the original's bytes followed by the tails told, with the side's options
 */
export function layerTransport(view: ReaderView, api: string, paper: { id: string; version: number }): Pick<LayerSideOptions, 'fetchObject' | 'bind' | 'composed'> {
  const at = `${api}/api/v1/layer/${paper.id.replace('/', '_')}v${paper.version}/${CTAG5}/o/`
  return {
    async fetchObject(ref, signal) {
      // a digest in the path, nothing else; no more read than the ref's bytes (and a margin for an encoded answer's length):
      // the side's readers refuse any object not exactly those bytes, so the rest is never kept
      if (!DIGEST.test(ref.sha256) || !Number.isSafeInteger(ref.bytes) || ref.bytes < 0) throw new TypeError(`the layer's object: not a ref (${String(ref.sha256).slice(0, 80)})`)
      const r = await fetch(`${at}${ref.sha256}`, { signal, credentials: 'omit' })
      if (!r.ok) throw new Error(`the layer's object ${ref.sha256}: ${r.status}`)
      const cap = ref.bytes + OBJECT_MARGIN, past = (n: number) => new Error(`the layer's object ${ref.sha256}: ${n} bytes or more, past its ref's ${ref.bytes}`)
      const length = Number(r.headers.get('content-length'))
      if (length > cap) { void r.body?.cancel().catch(() => {}); throw past(length) }
      if (!r.body) { const b = new Uint8Array(await r.arrayBuffer()); if (b.length > cap) throw past(b.length); return b }
      const reader = r.body.getReader(), chunks: Uint8Array[] = []
      let n = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        n += value.length
        if (n > cap) { void reader.cancel().catch(() => {}); throw past(n) }
        chunks.push(value)
      }
      const out = new Uint8Array(n)
      let k = 0
      for (const c of chunks) { out.set(c, k); k += c.length }
      return out
    },
    async bind(base) {
      const data = await view.originalData()
      if (!data || data.length !== base.bytes) return false
      return hex(await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>)) === base.sha256
    },
    composed(tail, options) {
      let inner: { destroy(): Promise<void> } | null = null, gone = false
      const promise = (async () => {
        const source = await view.originalData()
        if (!source) throw new Error('no original to compose the layer\'s document over')
        if (gone) throw new Error('the composed document was let go')
        const data = new Uint8Array(source.length + (tail?.length ?? 0))
        data.set(source)
        if (tail) data.set(tail, source.length)
        const task = pdfjsLib.getDocument({ ...options, data })
        inner = task
        return task.promise
      })()
      return { promise, onProgress: null, destroy: async () => { gone = true; await inner?.destroy() } } as unknown as DocumentTask
    },
  }
}

/**
 * The reading view opened in the reader page's panes, on arXiv's PDF of the address's paper, and the controller's Session
 * over it. A retry opens the original again; the download gives the original's bytes, read through its document
 */
export function openView(host: SessionHost, io: { watch?: typeof watchConfig; read?: typeof readConfig } = {}): Session {
  const params = host.params, paper = params.get('paper') ?? ''
  const config = host.reading?.config ?? DEFAULT_CONFIG
  /** what the reader chose here: settings that come later do not undo it */
  const chosen = { display: false, sync: false }
  // settings that came after the view opened (a first read given up on, a change made elsewhere): their display (where the
  // address names none) and their sync, unless the reader chose them here
  const late = (next: Config) => {
    if (paper && !chosen.display && !isDisplay(params.get('mode'))) view.setDisplay(displayFrom(params, next))
    if (!chosen.sync) view.setSync(next.pdfReader.sync)
  }
  const vh = readerHost(host, config, paper, io.watch, io.read, late)
  const view: ReaderView = createReaderView(vh)
  const pdf = readerAddresses(params, paper).pdf
  const original = (options: Readonly<Record<string, unknown>>) => pdfjsLib.getDocument({ ...options, url: pdf }) as unknown as DocumentTask
  // the harness's layer side (the development entry's: the run that tells it is the extension's, PR 5): over the layer API at
  // `api`, its faces the slices given for every face, its hyphenation the API host's
  const reader: { ready: boolean; view: ReaderView; probe(): object; side: LayerSide | null; openSide(o: { api: string; paper: { id: string; version: number }; target: string; faces?: FaceSlice[] | null }): boolean } = {
    ready: false, view, probe: () => view.probe(), side: null,
    openSide(o) {
      reader.side?.dispose()
      reader.side = createLayerSide(view, { paper: o.paper, target: o.target, faceSources: async () => o.faces ?? null, hyphUrl: lang => `${o.api}/hyph/${lang}.json`, ...layerTransport(view, o.api, o.paper) })
      return true
    },
  }
  ;(window as unknown as { __reader: object }).__reader = reader
  const show = () => { if (paper) void view.showOriginal(original).then(r => { if (r === 'opened') reader.ready = true }) }
  view.setDisplay(paper ? displayFrom(params, config) : 'original')
  view.setSync(config.pdfReader.sync)
  show()
  addEventListener('pagehide', () => { view.dispose(); vh.stop() }, { once: true })
  return {
    setDisplay: d => { chosen.display = true; view.setDisplay(d) },
    setSyncMode: m => { chosen.sync = true; view.setSync(m !== 'off') },
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
