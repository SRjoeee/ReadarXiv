// The extension's PDF reader, its session (docs/PDF-READER.md §11.7; the shared reader view's contract §4.3): the engine's
// one reading view given what the extension has — the reader page's two panes, its PDF.js build, the reader's words from the
// locale packs, the look from its settings, a new tab for a link out of the paper — and arXiv's PDF by an opener over PDF.js's
// own loader, shown at the open, always. The paper's layer is the extension's run's (run.ts): our server's objects, the
// extension's own translation. The view's and the run's events go to the controller (controller.ts reduce), and its commands
// come back as a Session.
//
// The settings are the extension's (the reader's design, §9.1), through the settings surface as the popup and the settings page
// have them (shared/surface-config.ts): a display or a sync the reader chooses here is written back, a write storage refuses is
// told (S-R-22), and settings that land from elsewhere are followed (settings.ts followOf): their display and sync unless the
// reader chose them here, a new target language once a translation has started in place (the run's retarget: the left, both
// documents and the reading place kept), a run that stopped short run again once the services change. What is not seen takes no resources (DESIGN §10): the run starts once a translated
// display is shown in a visible tab.
import { appearanceRule } from '@/core/renderer/style-preset'
import { htmlVersionOf, viewerUrlOf } from '@/core/pdf/entry'
import { lookOf } from '@/config/appearance'
import { toBcp47 } from '@/config/languages'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import { createLayerStore, type LayerStore } from '@/cache/layer-store'
import { createSurfaceConfig, type Landing } from '@/shared/surface-config'
import { firstReadTime } from '@/ui/first-read'
import { localeStale } from '@/ui/locale-stale'
import { R } from '@/ui/strings'
import { createReaderView, type DocumentTask, type ReaderView, type ViewPrefs } from '../engine/view.mjs'
import { paperOf, READER_API, readerAddresses } from '../addresses'
import { fromView, type Session } from '../controller'
import { ASSETS, EventBus, LinkTarget, PDFLinkService, PDFPageView, PDFViewer, pdfjsLib, TextLayerBuilder } from '../pdfjs'
import { displayOf, firstConfig, followOf, sameClasses, withDisplay } from '../settings'
import { linkNameOf } from '../ui/link-names'
import { shownAgain, whenVisible } from '../visible'
import type { EngineDisplay, SessionHost, SyncMode } from './events'
import { abstractPage, ownVersion } from './paper'
import { type Run, startRun } from './run'
import { openEngine } from './translate.mjs'

const DISPLAYS: readonly EngineDisplay[] = ['original', 'bilingual', 'translation']
const SYNCS: readonly SyncMode[] = ['off', 'current', 'same', 'pointer', 'matched']
const isDisplay = (d: string | null): d is EngineDisplay => DISPLAYS.includes(d as EngineDisplay)

/** the look the view reads, of the extension's settings: the panes swapped, the pages dimmed, the theme (the system's
 *  where it is the system's), the highlight */
export function prefsOf(config: Config, systemDark: boolean): ViewPrefs {
  return {
    swapped: config.pdfReader.swapped, dimPages: config.pdfReader.dimPages,
    theme: config.theme === 'system' ? (systemDark ? 'dark' : 'light') : config.theme,
    highlight: config.reading.sentenceHighlight,
  }
}
/** the display a reader opens in: the one the address names (a probe's page), else, asked to translate (#readarxiv), the
 *  translated display the settings name, else the settings' */
export function displayFrom(params: URLSearchParams, config: Config): EngineDisplay {
  const named = params.get('mode')
  if (isDisplay(named)) return named
  if (params.get('ask') === 'translate') return config.mode === 'only' ? 'translation' : 'bilingual'
  return displayOf(config)
}

/** whether a link out of the paper may be opened: a web page or a mail address, never a script, data, or a page of the
 *  browser's or the extension's (a PDF's link, and the layer's, name what they like) */
export function outward(url: string): boolean {
  try { return ['http:', 'https:', 'mailto:'].includes(new URL(url).protocol) } catch { return false }
}

/** the parts of a reader a test replaces */
export interface ReaderIo {
  store?: LayerStore | null
  engine?: typeof openEngine
  fetch?: typeof fetch
  api?: string
  /** the settings' surface (the extension's storage, shared/surface-config.ts), made by default with these deps */
  surface?: (deps: Parameters<typeof createSurfaceConfig>[0]) => Pick<ReturnType<typeof createSurfaceConfig>, 'start' | 'state' | 'subscribe' | 'patch'>
  view?: typeof createReaderView
  run?: typeof startRun
}

/**
 * The reader opened in the page's panes, on arXiv's PDF of the address's paper, and the controller's Session over it.
 * `host.reading`, the page's own first read of the settings, is started on at once (settings.ts firstConfig)
 */
export async function openReader(host: SessionHost, io: ReaderIo = {}): Promise<Session> {
  const params = host.params, paper = paperOf(params)
  const addresses = readerAddresses(params, paper, io.api ?? READER_API)
  const abstract = abstractPage(paper, io.fetch)

  // ---------------------------------------------------------------- the settings
  let config: Config = host.reading?.config ?? DEFAULT_CONFIG
  /** this page's writes of the settings, one after another; one that storage refuses is told, what the reader chose stays */
  let writes: Promise<unknown> = Promise.resolve()
  const save = (change: (c: Config) => Config) => {
    writes = writes.then(() => surface.patch(change)).then(() => host.emit({ type: 'saved' }), (e: unknown) => {
      console.warn('[settings]', (e as Error)?.message ?? e)
      host.emit({ type: 'refused' })
    })
  }
  const dark = globalThis.matchMedia?.('(prefers-color-scheme: dark)')
  const lookers = new Set<(p: ViewPrefs) => void>()
  let sheet: HTMLStyleElement | null = null
  /** the settings shown: the look sheet (written when it changed), the controller told, the view's look */
  const show = () => {
    const text = appearanceRule(lookOf(config))
    sheet ??= Object.assign(document.createElement('style'), { id: 'axt-look' })
    if (!sheet.isConnected) document.head.append(sheet)
    if (sheet.textContent !== text) sheet.textContent = text
    host.emit({ type: 'settings', config, pack: surface.state().pack ?? null })
    host.emit({ type: 'notice', why: surface.state().fallbackReason ?? provisional?.why ?? null })
    const p = prefsOf(config, !!dark?.matches)
    for (const l of [...lookers]) l(p)
  }
  const surface = (io.surface ?? createSurfaceConfig)({ localeStale, reload: () => location.reload(), onLanded: (next, from) => landed(next, from) })
  let provisional: { why: unknown } | null = null
  ;({ config, provisional } = await firstConfig(surface, host.reading, host.reading === undefined ? firstReadTime() : Promise.resolve()))

  // ---------------------------------------------------------------- the view
  /** the display shown (the view's own events), and the page of the pane read (the batches' order) */
  let mode: EngineDisplay = paper ? displayFrom(params, config) : 'original', readingPage: number | null = null
  const view: ReaderView = (io.view ?? createReaderView)({
    panes: { left: host.left, right: host.right },
    pdfjs: { lib: pdfjsLib, viewer: { EventBus, PDFViewer, PDFPageView, PDFLinkService, LinkTarget, TextLayerBuilder }, assets: ASSETS },
    words: { pageName: (side, n) => R.pageName(side === 'left' ? 'original' : 'translation', n), sideName: side => R.display[side === 'left' ? 'original' : 'translation'], linkName: linkNameOf },
    prefs: { get: () => prefsOf(config, !!dark?.matches), subscribe: l => { lookers.add(l); return () => { lookers.delete(l) } } },
    links: { openExternal: url => { if (outward(url)) globalThis.open(url, '_blank', 'noopener,noreferrer') } },
    titleFallback: async () => (await abstract()).title,
    emit: e => {
      if (e.type === 'display') mode = e.display
      if (e.type === 'page' && (e.side === 'right' ? mode !== 'original' : mode === 'original')) readingPage = e.page
      const s = fromView(e, paper)
      if (s) host.emit(s)
    },
  })
  show()
  /** what the reader chose here: settings that come later do not undo it */
  const chosen = { display: false, sync: false }
  view.setDisplay(paper ? displayFrom(params, config) : 'original')
  const addressSync = SYNCS.includes(params.get('sync') as SyncMode)
  view.setSync(addressSync ? params.get('sync') !== 'off' : config.pdfReader.sync)

  // ---------------------------------------------------------------- arXiv's PDF, at the open, always
  const original = (options: Readonly<Record<string, unknown>>) => pdfjsLib.getDocument({ ...options, url: addresses.pdf }) as unknown as DocumentTask
  type Shown = 'opened' | 'superseded' | 'failed'
  const shown: { opened: Promise<Shown> } = { opened: Promise.resolve('failed') }
  const showOriginal = (): Promise<Shown> => (shown.opened = paper ? view.showOriginal(original) : Promise.resolve('failed'))
  if (paper) void showOriginal()
  // asked to translate (#readarxiv on the PDF address, the reader's design, §2): an original left on is let go, so that the
  // next PDF opens as this one does
  if (paper && params.get('ask') === 'translate' && config.pdfReader.original) save(c => ({ ...c, pdfReader: { ...c.pdfReader, original: false } }))

  // ---------------------------------------------------------------- the layer's run
  const store = io.store === undefined ? createLayerStore() : io.store
  let run: Run | null = null, prepareAsked = false, translating = false, held = !paper
  /** why the original is held: the paper's own (no paper, none to be had), or the target language's (another target mends it) */
  let heldFor: 'paper' | 'target' | null = held ? 'paper' : null
  // the harness's hooks (the browser checks, the lab's probes): the view, the run and its side, bounded probes alone
  const reader = { ready: false, view, store, get run() { return run }, probe: () => view.probe(), side: () => run?.side ?? null }
  ;(window as unknown as { __reader: object }).__reader = reader
  /** the paper's HTML version on arXiv (one request a visit, however often the bilingual version cannot be had), or null */
  let htmlAsked: Promise<string | null> | null = null
  const htmlVersion = () => (htmlAsked ??= htmlVersionOf(paper, io.fetch ?? fetch).catch(() => null))
  /** the paper version: its own, else the latest the abstract page lists; null where it cannot be had */
  const version = async () => ownVersion(paper) ?? (async () => { const v = (await abstract()).version; return v ? { id: paper, version: v } : null })()
  async function begin() {
    if (run || held || !paper) return
    translating = true
    const p = await version()
    if (run) return
    if (!p) {
      // no version to ask our server for: arXiv's page could not be read, so the bilingual version cannot be had now
      host.emit({ type: 'html', url: await htmlVersion() })
      host.emit({ type: 'unavailable', why: 'unreachable', retryAt: null })
      return
    }
    run = (io.run ?? startRun)(view, p, {
      api: addresses.api, ...(io.fetch ? { fetch: io.fetch } : {}), store,
      engine: () => (io.engine ?? openEngine)({ paper }),
      openPdf: (data, options) => pdfjsLib.getDocument({ ...options, data }) as unknown as DocumentTask,
      pdfjs: pdfjsLib,
      hidden: { now: () => document.visibilityState === 'hidden', shown: signal => shownAgain(document, signal) },
      readingPage: () => readingPage,
      // (what to translate: the content classes shown translated, the reader's own setting)
      classes: () => config.pdfReader.classes,
      mayPrepare: () => { if (prepareAsked) return false; prepareAsked = true; return true },
      prepareUnsent: () => { prepareAsked = false },
      emit(e) {
        if (e.type === 'unavailable') {
          // the paper's own, or its language's: the translated displays greyed, the original shown for this visit
          if (e.why !== 'refused' && e.why !== 'unreachable') { held = true; heldFor = e.why === 'target' ? 'target' : 'paper'; view.setDisplay('original') }
          void htmlVersion().then(url => host.emit({ type: 'html', url }))
        }
        if (e.type === 'fail') { host.emit({ type: 'fail', event: 'service', text: `Cannot translate ${paper} (${e.kind})`, kind: e.kind }); return }
        if (e.type === 'layer') { host.emit({ type: 'coming' }); return }
        if (e.type === 'prepared') { host.emit({ type: 'prepared' }); return }
        if (e.type === 'original') return
        host.emit(e)
      },
    })
  }
  /** the run started once a translated display is shown, in a visible tab */
  const wantTranslation = () => { if (mode !== 'original') whenVisible(() => void begin(), document, () => mode !== 'original') }
  wantTranslation()

  // ---------------------------------------------------------------- the settings that land
  function landed(next: Config, from: Landing) {
    if (from === 'first') { if (!provisional) return; from = 'elsewhere' }
    // the settings the page started on given up on (a first read late, the defaults standing in): what the reader chose
    // meanwhile stands over them; any later landing is followed by settings.ts's rule alone
    const late = provisional !== null
    provisional = null
    const prev = config
    config = next
    show()
    if (from === 'refused') return
    // (a run that stopped short: the service failed, or units were lost to it)
    const at = run?.probe(), stopped = at?.state === 'failed' || at?.rowsState === 'failed' || (at?.rowsState === 'translated' && Number(at.lost) > 0)
    const follow = followOf(prev, next, from, { translating, held, stopped, addressDisplay: isDisplay(params.get('mode')), addressSync, display: mode, syncMode: view.probe().sync ? 'same' : 'off' })
    // another target, in place: a hold for the language before is lifted (the translated display shown again), one for the paper's
    // own reason stays (no language mends it); the run told once this page's writes are in, so that the service it opens again is
    // the new target's
    if (follow.retarget && heldFor !== 'paper') {
      // (the language's notice and the greyed switch go with the hold: the layer is coming again, as an open tells it)
      if (held) { held = false; heldFor = null; host.emit({ type: 'coming' }); mode = displayFrom(params, config); view.setDisplay(mode) }
      const to = toBcp47(next.targetLanguage)
      void writes.then(() => run?.retarget(to))
    }
    if (follow.retry) void writes.then(() => run?.retry())
    if (follow.display && !(late && chosen.display)) { view.setDisplay(follow.display); mode = follow.display; wantTranslation() }
    if (follow.sync && !(late && chosen.sync)) view.setSync(follow.sync !== 'off')
    // the content classes shown translated or not as "What to translate" lands, from here or elsewhere (the reading options, the
    // settings page): in place, nothing fetched or translated again
    if (!sameClasses(next.pdfReader.classes, prev.pdfReader.classes)) run?.setClasses(next.pdfReader.classes)
  }

  // ---------------------------------------------------------------- the page's end
  void shown.opened.then(r => { if (r === 'opened') reader.ready = true })
  addEventListener('pagehide', () => { run?.dispose(); view.dispose(); sheet?.remove() }, { once: true })

  return {
    setDisplay(d) {
      if (!isDisplay(d) || held && d !== 'original') return
      chosen.display = true
      mode = d
      view.setDisplay(d)
      save(c => withDisplay(c, d))
      wantTranslation()
    },
    setSyncMode(m) {
      if (!SYNCS.includes(m)) return
      chosen.sync = true
      view.setSync(m !== 'off')
      if (m === 'same' || m === 'off') save(c => ({ ...c, pdfReader: { ...c.pdfReader, sync: m === 'same' } }))
    },
    zoomBy: f => view.zoomBy(f),
    zoomTo: z => view.zoomTo(z),
    goToPage: (side, n) => view.goToPage(side, n),
    goToUnit: id => view.goToUnit(id),
    lead: side => view.lead(side),
    pinch: (side, f, origin) => view.pinch(side, f, origin),
    setNarrow: on => view.setNarrow(on),
    patchSettings: change => save(change),
    // the original again where it did not open; else the run again: the translation's missing rows, or the whole run where it
    // found no layer
    retry() {
      void shown.opened.then(r => {
        if (r !== 'opened') { void showOriginal().then(s => { if (s === 'opened') reader.ready = true }) }
        if (run) run.retry()
        else wantTranslation()
      })
    },
    // (the translation's file is Task 20's)
    pdfBytes: async () => null,
    // (the browser's own viewer asked by the address: the PDF page lays no reader over the new tab)
    openOriginal: () => { if (paper) globalThis.open(viewerUrlOf(addresses.pdf), '_blank', 'noopener,noreferrer') },
  }
}
