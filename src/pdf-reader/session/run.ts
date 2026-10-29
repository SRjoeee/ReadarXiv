// The extension's run of a paper on the layer (Stage 5 Task 9; the shared reader view's contract §1.3 and §4.3): the reading
// view's one layer side, told what our server has of the paper's layer and fed the extension's own translation of its units.
//
// 1. The service that translates is asked first (the background's chain, translate.mjs openEngine): its target is the layer's
//    (a language the layer does not set is said so, and nothing is asked of our server), its failure the card's.
// 2. The layer is looked at (server.ts lookLayer): a catalog is told whole, with its end; each 202 is the paper's prepare under
//    way, its objects made so far told, asked again once its wait has passed (never sooner); a 404 `not-prepared` asks the
//    prepare, once a visit; another 404 is why there is none; a 429 waits its time and asks again, REFUSED_ASKS times in a row at
//    most, then waits for the reader's retry; our server out of reach
//    (twice) opens a paper whose catalog this machine holds from it, else says the bilingual version cannot be had now.
// 3. The side fetches each object through this run: this machine's store first (layer-store.ts, every object checked against
//    its digest there), then our server, each object kept once read.
// 4. The base (bind): only a layer over our own compile draws (base.ts layerDraws: the head's base says `ours`); a head over arXiv's
//    PDF, whatever it says (the why our compile was refused, or none, every head of BUNDLE 7), is no layer: the original staying,
//    nothing translated (translate). Our base page is not arXiv's bytes by design, and the box that made it has already proved
//    that its pages, their boxes and the lines it carries are arXiv's (the head's `check`). The run takes that check (bindOurs)
//    and compares nothing of the tab's bytes at bind. In the background it hashes the tab's PDF once its bytes are all in against
//    the head's `orig`, the arXiv PDF the check ran over (proveTab): the same, nothing more; other (arXiv replaced its file, the tab
//    is another's), our copy of that PDF is shown on the left in its place (showOurs: the store's whole copy first, else our copy
//    read whole and checked against orig's digest) and the pages are laid again over it, or, none to be had, the layer is let go.
// 5. The composed document: our base page by ranges at its digest's address, every answer held to its length and to the tag of
//    the first answer (ranges.ts openRanged); under a delta the original's bytes by ranges, then the delta in memory.
// 6. The rows: runRows over the index (the engine's one translation run without compiles), the units nearest the reading place
//    first (the page in view's closure, from the side's rowsFor), each batch's rows taken as they come, then the end. A retry
//    is again(), every row held taken again at once, and the run again: the background's cache answers what was translated.
// 7. Another target language (retarget), in place: the layer is the paper's, whatever the language (its catalog, head, base and
//    original are not looked at again), so the side lays the new target over the same composed document (side.retarget) while
//    the attempt before is let go at once and the service is opened again for the new target; its rows are taken as they come.
//    A page keeps the target before until the new one's commits; once the new target's rows will not come (the service failed,
//    or stopped short) those pages show the original (side.dropOthers). A language the layer does not set is said so, and the
//    original shown.
//
// Only the paper's id and version reach our server (server.ts); nothing of a translation, a setting or a key does.
import { ABSTRACT_MAX_CHARS } from '@/core/extractor/context'
import type { ProviderErrorKind } from '@/providers/types'
import type { LayerStore } from '@/cache/layer-store'
import { checkDelta, DELTA_MAX_BYTES, readCatalog, type ReadCatalog, type ReadHead, type Ref, type Row, runRows, toTranslate, unitOf } from '../engine/layer.mjs'
import { TARGETS } from '../engine/rules.mjs'
import { createLayerSide, type DocumentTask, type LayerSide, type LayerSideOptions, type ReaderView } from '../engine/view.mjs'
import { servedFaces } from './faces'
import type { Unavailable } from './events'
import { layerDraws } from './base'
import { type Bound, lengthBound, openRanged, type RangedPdfJs } from './ranges'
import { askPrepare, basePath, DELTA_MS, fetchObject, fetchOriginal, LayerUnreachable, lookLayer, originalPath, type Paper, paperSegment, sha256Of } from './server'

/** what the run tells the reader's controller */
export type RunEvent =
  /** the paper's layer is being prepared: its place in the queue and how far it has come, each null while not known */
  | { type: 'preparing'; position: number | null; progress: number | null }
  /** the layer is coming: a catalog, or a prepare's first objects (any `unavailable` before it no longer holds) */
  | { type: 'layer' }
  /** the layer's catalog: the prepare, where there was one, is over (told after `layer`) */
  | { type: 'prepared' }
  /** the translation under way: the units with rows, of those the target translates, and those lost to the service */
  | { type: 'translating'; got: number; total: number; lost: number }
  /** the translation done for this attempt: `stopped`, why it stopped short (the service's error kind), or null */
  | { type: 'translated'; got: number; total: number; lost: number; stopped: ProviderErrorKind | null }
  /** no layer for now (`refused`, `unreachable`: passing; `retryAt` when our server named a time) or for this paper
   *  (`no-source`, `no-pdf`, `cannot-prepare`, `unknown-versions`), or for this language (`target`) */
  | { type: 'unavailable'; why: Unavailable; retryAt: number | null }
  /** the service cannot translate: its error kind */
  | { type: 'fail'; kind: ProviderErrorKind }
  /** the original shown is our copy, arXiv's bytes not being the layer's (never told for a layer over our base page: the left
   *  is the tab's own PDF there, and `ours` keeps this meaning) */
  | { type: 'original'; ours: boolean }

/** the service the run translates with, as translate.mjs openEngine gives it */
export interface RunEngine {
  lang: string
  format: string
  /** its scope withdrawn: no batch goes out after it (translate.mjs openEngine's close) */
  close?(): unknown
  translate(texts: string[], context?: { paperTitle?: string; abstract?: string }, cuts?: (number[] | undefined)[]): Promise<({ text: string; by: string | null } | null)[]>
}
export interface RunHost {
  /** our server's origin (the build's READER_API) */
  api: string
  fetch?: typeof fetch
  store: LayerStore | null
  /** the service that translates for this paper; rejects with an error of a `kind` where it cannot */
  engine(): Promise<RunEngine>
  /** a PDF.js document over bytes, with the options given (the extension's PDF.js) */
  openPdf(data: Uint8Array, options: Readonly<Record<string, unknown>>): DocumentTask
  /** the extension's PDF.js, for the composed document over our base page read by ranges (ranges.ts); none: no layer is drawn */
  pdfjs?: RangedPdfJs
  /** the page the reader is reading (the pane read), for the order of the batches; null before any */
  readingPage(): number | null
  /** whether the prepare may be asked: true once a visit */
  mayPrepare(): boolean
  /** the prepare asked never reached our server (the network, a 5xx twice): the visit's one prepare given back, so that a
   *  retry asks it again rather than taking the paper for one that cannot be had */
  prepareUnsent?(): void
  emit(e: RunEvent): void
  /** the faces' sources (servedFaces over `api` by default) */
  faces?: LayerSideOptions['faceSources']
  /** whether the reader's tab is hidden now, and its showing again: a hidden tab polls our server for nothing (the
   *  extension's loading rule, DESIGN §10); none: always shown */
  hidden?: { now(): boolean; shown(signal: AbortSignal): Promise<void> }
  createSide?: typeof createLayerSide
  /** the reader's "What to translate" (`pdfReader.classes`: which content classes are shown translated, the layer's `classes`);
   *  none: the engine's defaults (rules/content-classes.mjs TOGGLE_DEFAULTS) */
  classes?(): NonNullable<LayerSideOptions['classes']>
}
export interface Run {
  /** the run again in place: the translation's missing rows, or the whole run where it found no layer */
  retry(): void
  /** the translation in another target language (`to`, the layer's code: a BCP 47 tag), in place (§7 above): nothing where it is
   *  the run's own target */
  retarget(to: string): void
  /** the content classes shown translated (`classes`, the reader's "What to translate"), in place: the layer opened again with its
   *  rows held, nothing fetched or translated again; the same classes again change nothing */
  setClasses(classes: NonNullable<LayerSideOptions['classes']>): void
  dispose(): void
  readonly side: LayerSide | null
  probe(): Readonly<Record<string, number | string | boolean | null>>
}

/** a 202's or a 429's wait, never sooner than our server asks: at least a second, at most ten minutes */
export const WAIT_MIN = 1000, WAIT_MAX = 600_000
/** a prepare polled for this long (the tab shown) is asked of every POLL_SLOW_MS at most, whatever its 202s say: staging's
 *  prepares took about 45 s (lab/pdf/records/layer-extension.md), so a first page is never later for it */
export const POLL_SLOW_AFTER_MS = 120_000, POLL_SLOW_MS = 5000
/** a prepare polled for this long (the tab shown) is given up: the bilingual version not to be had now, a retry asks again */
export const PREPARE_DEADLINE_MS = 600_000
/** how many times in a row a 429 is waited out and asked again by the run itself; the next 429 stops the look, said as our
 *  server's limit, and a retry asks at once. A visitor's limit lasts up to a day and our server names its end, but a tab left
 *  open asked again every ten minutes at most for as long as it stayed open (#88 E5) */
export const REFUSED_ASKS = 3
const waitOf = (ms: number) => Math.min(WAIT_MAX, Math.max(WAIT_MIN, Number.isFinite(ms) ? ms : WAIT_MIN))
const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError'
const kindOf = (e: unknown): ProviderErrorKind => ((e as { kind?: ProviderErrorKind })?.kind ?? 'unknown')

/** the paper's title and abstract for an LLM's prompt, as the HTML page sends them (src/core/extractor/context.ts's cut) */
export function contextOf(index: Parameters<typeof unitOf>[0]): { paperTitle?: string; abstract?: string } {
  let title: string | undefined
  const abstract: string[] = []
  for (let id = 0; id < index.units.length; id++) {
    if (!index.units[id]) continue
    const u = unitOf(index, [id, [], 'none', null, null]) as { kind: string; src: string; title?: boolean } | null
    if (!u) continue
    if (u.title && title === undefined) title = u.src
    if (u.kind === 'abstract') abstract.push(u.src)
  }
  const a = abstract.join(' ')
  const clip = (s: string) => (s.length <= ABSTRACT_MAX_CHARS ? s : `${s.slice(0, ABSTRACT_MAX_CHARS).replace(/\s+\S*$/, '')}...`)
  return { ...(title ? { paperTitle: title } : {}), ...(a ? { abstract: clip(a) } : {}) }
}

/** the run of `paper` over `view`, started at once; the view's original is the host's to show (at the open, always) */
export function startRun(view: ReaderView, paper: Paper, host: RunHost): Run {
  const seg = paperSegment(paper), f = host.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
  const ac = new AbortController()
  /** each beginning's own: a retry of a run that found no layer begins again, and what the one before still does is let go */
  let gen = 0, begun = new AbortController()
  let disposed = false, side: LayerSide | null = null, engine: RunEngine | null = null, target: string | null = null
  /** the rows of the visit, latest per unit; the attempt's abort; how far the translation is */
  const rows = new Map<number, Row>()
  let attempt: AbortController | null = null, total = 0, lost = 0, looks = 0, prepares = 0, ours = false
  /** the arXiv PDF the left shows, once known: the tab\'s own proven to be the PDF a head\'s check ran over, or our copy of it shown in
   *  its place. Every head\'s `orig` is compared with it (a retry may bring a head over another), which `begin()` does not reset: the
   *  left stays through a retry. null: not known yet (the tab\'s bytes not all in) */
  let leftShows: { bytes: number; sha256: string } | null = null
  /** the head cannot draw (layerDraws), decided at the head: the look stops and nothing is said after the lasting word that would make
   *  the host restore availability (`layer` is `coming`, `prepared` clears the wait); `begin()` resets it for a retry */
  let terminal = false
  /** how long the prepare has been polled for, the tab shown (its deadline's); until when a limit's wait runs (a retry waits
   *  it out) */
  let preparedFor = 0, refusedUntil = 0
  /** the 429s in a row of this beginning's look (REFUSED_ASKS) */
  let refusals = 0
  /** where the run is: its service and its look at the layer (`state`), and its translation of the layer's units (`rowsState`) */
  let state: 'engine' | 'looking' | 'open' | 'unavailable' | 'failed' = 'engine'
  let rowsState: 'idle' | 'translating' | 'translated' | 'failed' = 'idle'
  const emit = (e: RunEvent) => { if (!disposed && !(terminal && (e.type === 'layer' || e.type === 'preparing' || e.type === 'prepared'))) host.emit(e) }
  const sleep = (ms: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(Object.assign(new Error('the run is let go'), { name: 'AbortError' }))
    const t = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('the run is let go'), { name: 'AbortError' })) }, { once: true })
  })
  const unavailable = (why: Unavailable, retryAt: number | null = null) => {
    state = 'unavailable'
    refusedUntil = why === 'refused' && retryAt !== null ? retryAt : 0
    emit({ type: 'unavailable', why, retryAt })
  }
  /** the wait before the next look at a prepare under way: our server's, never sooner, and POLL_SLOW_MS at least once it has
   *  gone on a while; then, where the tab is hidden, until it is shown (that time no part of the deadline) */
  async function paced(asked: number, signal: AbortSignal) {
    const wait = Math.max(waitOf(asked), preparedFor >= POLL_SLOW_AFTER_MS ? POLL_SLOW_MS : 0)
    await sleep(wait, signal)
    preparedFor += wait
    if (host.hidden?.now()) await host.hidden.shown(signal)
  }
  /** a limit's wait, then the tab shown */
  async function waited(asked: number, signal: AbortSignal) {
    await sleep(waitOf(asked), signal)
    if (host.hidden?.now()) await host.hidden.shown(signal)
  }
  /** a 429: said, then waited out before the look asks again (true), or, past REFUSED_ASKS in a row, the look stopped (false), its
   *  word left for a retry, which asks at once: no wait is under way (refusedUntil 0). False too where the wait was let go */
  async function refusedAgain(asked: number, signal: AbortSignal): Promise<boolean> {
    if (++refusals > REFUSED_ASKS) {
      unavailable('refused')
      return false
    }
    unavailable('refused', Date.now() + waitOf(asked))
    try { await waited(asked, signal) } catch { return false }
    state = 'looking'
    return true
  }

  // ---------------------------------------------------------------- the side's transport
  /** the original the layer's answers name it bound to (server.ts boundOf): the catalog's, else the first object's */
  let tag: string | null = null
  /** what the composed document is read over, by ranges at `url`, held to the head's length and the first answer's tag (ranges.ts):
   *  our base page (a base of ours held whole), or the original (a delta: `prefix` the delta object, after the original's last
   *  byte); null before bind has taken the head's base */
  let basis: { bound: Bound; url: string; prefix?: Uint8Array } | null = null
  /** a document over a copy by ranges: the composed one (a range that fails twice leaves its page the original's, the side's stall) */
  const ranged = (b: { bound: Bound; url: string; prefix?: Uint8Array }, o: Readonly<Record<string, unknown>>) =>
    // (a delta is the original\'s successor in the composed document: in memory, after its last byte)
    openRanged(host.pdfjs as RangedPdfJs, b.url, { bound: b.bound, tail: b.prefix ?? null, options: o, fetch: f, signal: begun.signal, refused: e => console.warn('[reader]', e.message) })
  /** the left's bytes, once they are all in as its document loads them of itself (originalData's own read would ask arXiv
   *  for every byte its stream is still bringing: the rest of the file twice), the arXiv PDF the head's check ran over or not */
  const proof = async (orig: { bytes: number; sha256: string }): Promise<'same' | 'other'> => {
    if (!(await Promise.resolve(view.originalLoaded()).then(() => true, () => false))) return 'other'
    const data = await Promise.resolve(view.originalData()).catch(() => null)
    return data && data.length === orig.bytes && (await sha256Of(data)) === orig.sha256 ? 'same' : 'other'
  }
  /** the tab's PDF is not the arXiv PDF the head's check ran over: our copy of that PDF on the left in its place, this machine's
   *  whole copy first, else our copy read whole and checked against orig's digest. False where none can be shown: no layer, the
   *  original staying */
  async function showOurs(orig: { bytes: number; sha256: string }): Promise<boolean> {
    let copy: Uint8Array | undefined = await host.store?.object(orig.sha256)
    if (copy?.length !== orig.bytes) copy = undefined
    if (!copy) {
      try {
        copy = await fetchOriginal(host.api, paper, orig, { fetch: f, signal: begun.signal })
      } catch (e) {
        if (!isAbort(e)) console.warn('[reader] our copy of the original:', (e as Error)?.message ?? e)
        return false
      }
      void host.store?.putObject(seg, orig.sha256, copy)
    }
    if (disposed) return false
    const bytes = copy
    const shown = await view.showOriginal(o => host.openPdf(bytes.slice(), o))
    if (shown !== 'opened' || disposed) return false
    ours = true
    leftShows = orig
    emit({ type: 'original', ours: true })
    return true
  }
  /** the head the side has read, from its index; null before it, or where there is none */
  async function headOf(): Promise<ReadHead | null> {
    const index = (await Promise.resolve(side?.index()).catch(() => null)) as { head?: ReadHead } | null | undefined
    return index?.head ?? null
  }
  /** the arXiv PDF a head of ours keeps beside its base (`orig`: bytes and digest; the engine's reader requires it); null where the
   *  head names none */
  function origOf(head: ReadHead | null): { bytes: number; sha256: string } | null {
    const orig = head?.orig
    return orig && Number.isSafeInteger(orig.bytes) && (orig.bytes as number) > 0 && typeof orig.sha256 === 'string' && /^[0-9a-f]{64}$/.test(orig.sha256) ? { bytes: orig.bytes as number, sha256: orig.sha256 } : null
  }
  /**
   * The base of a layer over our own compile (the head's `base.source` `ours`: the layer route, design §3.2). The box proved it
   * before the head was committed: our base page has arXiv's page count and every page's box, and carries the lines it was
   * checked on; the head names that check (`check`), and `orig`, the arXiv PDF it ran over. The run takes the check for what it
   * says, while the left stays the tab's own PDF, whose pages and boxes are the places the layer is laid in; and it proves in the
   * background that the tab's PDF is `orig` (proveTab), or, where the left is known to show another PDF (our copy of an earlier
   * head's orig, or the tab proven to be it: a retry may bring a head over another), shows the newly named original first. A check
   * that does not say pages and boxes alike (a delta's pages [M, N], M at most N: the pages past M are the original's), a head with
   * no `orig`, a digest or a length no address is made of, or no PDF.js to read by ranges: no layer, the original staying.
   *
   * Held whole (`kind` 'full'), the layer is drawn over our base page read by ranges at its digest's address, every answer held to
   * its length and the first one's tag. Held as a delta over arXiv's PDF (`kind` 'delta'), one document: the ORIGINAL's bytes read
   * by ranges from our server's copy (the same bytes the tab shows, once proven), held to orig's length and the tag the layer's
   * answers name, then the delta object (a bundle object, fetched by its digest and held to checkDelta) in memory
   */
  async function bindOurs(base: { bytes: number; sha256: string; check?: unknown; kind?: unknown }): Promise<boolean> {
    const delta = base.kind === 'delta'
    const check = base.check as { pages?: unknown; boxes?: unknown } | null | undefined
    const pages = check?.pages
    const proved = typeof check === 'object' && check !== null && check.boxes === 'equal' && Array.isArray(pages) && pages.length === 2 && Number.isSafeInteger(pages[0]) && Number.isSafeInteger(pages[1]) && (delta ? (pages[0] as number) >= 1 && (pages[0] as number) <= (pages[1] as number) : pages[0] === pages[1])
    const head = await headOf()
    const orig = origOf(head)
    // (a delta's bound is made after its object is read: that answer may be the first to name the original's tag)
    const bound = delta ? lengthBound(orig?.bytes) : lengthBound(base.bytes)
    if (!proved || !bound || !orig || !host.pdfjs || !head) return false
    let next: { bound: Bound; url: string; prefix?: Uint8Array }
    if (delta) {
      // (the delta is held to its head before it is used: its length and digest, its section over the head's orig, its startxref)
      if (!Number.isSafeInteger(base.bytes) || base.bytes < 1 || base.bytes > DELTA_MAX_BYTES) return false
      let bytes: Uint8Array
      try {
        bytes = await objectBytes({ sha256: base.sha256, bytes: base.bytes }, begun.signal, DELTA_MS)
      } catch (e) {
        if (!isAbort(e)) console.warn('[reader] the layer\'s delta:', (e as Error)?.message ?? e)
        return false
      }
      const why = await checkDelta(head, bytes)
      if (why !== null) { console.warn('[reader] the layer\'s delta is refused:', why); return false }
      if (disposed) return false
      next = { bound: { total: orig.bytes, etag: tag }, url: originalPath(host.api, paper), prefix: bytes }
    } else {
      let url: string
      try {
        url = basePath(host.api, paper, base.sha256)
      } catch {
        return false
      }
      next = { bound, url }
    }
    // what the left shows against what this head's check ran over: the same, nothing to prove or fetch; known to be another (a retry
    // brought a head over another PDF than the one our copy or the proven tab was), the newly named original is shown BEFORE the
    // layer is used, never this layer over the old PDF (none to be had: no layer); not known yet, proved in the background
    if (leftShows && leftShows.bytes === orig.bytes && leftShows.sha256 === orig.sha256) {
      // (the left is the PDF the check ran over)
    } else if (leftShows) {
      if (!(await showOurs(orig))) return false
    } else void proveTab(orig, gen)
    basis = next
    return true
  }
  /** the tab's PDF hashed once its bytes are all in, against the arXiv PDF the head's check ran over: the same, the layer stays;
   *  other, our copy of that PDF is shown on the left and the pages laid again over it (they were copied from the left's pages),
   *  or, none to be had, the layer is let go and the bilingual version is not to be had now */
  async function proveTab(orig: { bytes: number; sha256: string }, my: number) {
    const proven = await proof(orig)
    // (a run begun again meanwhile checks its own base)
    if (disposed || my !== gen) return
    if (proven === 'same') { leftShows = orig; return }
    console.warn("[reader] the PDF in this tab is not the one the layer's base was checked against: our copy of that PDF is shown in its place")
    const s = side
    if (await showOurs(orig)) {
      if (disposed || s !== side || !s) return
      s.again()
      if (rows.size) s.take([...rows.values()])
      void translate()
      return
    }
    if (disposed || s !== side) return
    attempt?.abort()
    side?.dispose()
    side = null
    unavailable('unreachable')
  }
  /** an object of the layer by its ref: this machine's store first, then our server (`ms` how long its ask may take), each kept once
   *  read; the layer's objects are of one original, so one whose answer names another is no object of this layer */
  async function objectBytes(ref: Pick<Ref, 'sha256' | 'bytes'>, signal: AbortSignal, ms?: number): Promise<Uint8Array> {
    const kept = await host.store?.object(ref.sha256)
    if (kept && kept.length === ref.bytes) return kept
    const got = await fetchObject(host.api, paper, ref, { fetch: f, signal, ...(ms ? { ms } : {}) })
    if (got.bound !== null) {
      tag ??= got.bound
      if (got.bound !== tag) throw new Error(`the layer's object ${ref.sha256} is bound to the original ${got.bound}, not ${tag}`)
    }
    void host.store?.putObject(seg, ref.sha256, got.bytes)
    return got.bytes
  }
  const options = (): Pick<LayerSideOptions, 'fetchObject' | 'bind' | 'composed'> => ({
    fetchObject: (ref: Ref, signal: AbortSignal) => objectBytes(ref, signal),
    /**
     * Only a layer over our own compile draws (base.ts layerDraws): any other head — arXiv's PDF with the why our compile was
     * refused, or with none, every head of BUNDLE 7 — is no layer, the original staying; a head of ours is bound by its check
     * (bindOurs)
     */
    async bind(base) {
      if (!layerDraws(base)) return false
      return bindOurs(base as typeof base & { check?: unknown })
    },
    composed(_tail, o) {
      if (!basis) throw new Error('no base page the layer is bound to')
      return ranged(basis, o)
    },
  })

  // ---------------------------------------------------------------- the look at the layer
  /** a catalog told whole to the side, with its end */
  const tellCatalog = (c: ReadCatalog) => side?.tell({ units: c.units, head: c.head, parts: c.parts, end: c.end })
  async function look(my: number, signal: AbortSignal) {
    state = 'looking'
    const gone = () => disposed || my !== gen || !side || terminal
    for (;;) {
      if (gone()) return
      looks++
      let a: Awaited<ReturnType<typeof lookLayer>>
      try {
        a = await lookLayer(host.api, paper, { fetch: f, signal })
      } catch (e) {
        if (gone() || isAbort(e)) return
        // our server out of reach: a catalog this machine holds of the paper opens it on the layer (decision 7)
        const kept = await host.store?.catalog(seg)
        const catalog = kept ? await readCatalog(kept, { paper }).catch(() => null) : null
        if (catalog && !gone()) { void host.store?.opened(seg); state = 'open'; emit({ type: 'layer' }); emit({ type: 'prepared' }); tellCatalog(catalog); return }
        console.warn('[reader] the layer is not to be had now:', (e as Error)?.message ?? e)
        return unavailable('unreachable')
      }
      if (gone()) return
      // (an answer that moves the paper on ends a run of 429s; a 404 between a refused prepare and the next does not)
      if (a.kind === 'catalog' || a.kind === 'preparing') refusals = 0
      switch (a.kind) {
        case 'catalog':
          tag ??= a.bound
          void host.store?.putCatalog(seg, a.bytes)
          void host.store?.opened(seg)
          state = 'open'
          emit({ type: 'layer' })
          emit({ type: 'prepared' })
          tellCatalog(a.catalog)
          return
        case 'preparing':
          // a prepare past its deadline: given up for now, said so (a retry asks again)
          if (preparedFor >= PREPARE_DEADLINE_MS) { console.warn('[reader] the prepare did not end in time'); return unavailable('unreachable') }
          emit({ type: 'preparing', position: a.preparing.position, progress: a.preparing.progress })
          if (a.preparing.layer) { emit({ type: 'layer' }); side?.tell(a.preparing.layer) }
          try { await paced(a.preparing.retryAfterMs, signal) } catch { return }
          continue
        case 'refused':
          if (!(await refusedAgain(a.retryAfterMs, signal))) return
          continue
        case 'none':
          if (a.why !== 'not-prepared') return unavailable(a.why)
          // none made yet: the prepare asked, once a visit; a prepare that ended with none is a paper that cannot be had
          if (!host.mayPrepare()) return unavailable('cannot-prepare')
          prepares++
          try {
            const p = await askPrepare(host.api, paper, { fetch: f, signal })
            if (gone()) return
            if (p.kind === 'none') return unavailable(p.why === 'not-prepared' ? 'cannot-prepare' : p.why)
            // a prepare refused (429) was not taken: the visit's one prepare given back, so that the look after the wait asks it
            // again rather than take the paper for one that cannot be had (the rule of a prepare that never reached our server)
            if (p.kind === 'refused') { host.prepareUnsent?.(); if (!(await refusedAgain(p.retryAfterMs, signal))) return; continue }
            if (p.kind === 'preparing') { emit({ type: 'preparing', position: p.preparing.position, progress: p.preparing.progress }); await paced(p.preparing.retryAfterMs, signal) }
          } catch (e) {
            if (gone() || isAbort(e)) return
            if (e instanceof LayerUnreachable) { host.prepareUnsent?.(); return unavailable('unreachable') }
            throw e
          }
          continue
      }
    }
  }

  // ---------------------------------------------------------------- the translation
  /** how far each unit is from the reading place: the units the page in view waits for first, then ahead before behind */
  let near = { page: -1, ids: new Set<number>(), anchor: 0 }
  const rank = (id: number) => {
    const p = host.readingPage() ?? 1
    if (near.page !== p && side) {
      const ids = new Set([...side.rowsFor(p), ...side.rowsFor(p + 1)])
      const pages = view.probe().pages as number || 1
      near = { page: p, ids, anchor: ids.size ? Math.min(...ids) : Math.floor(((p - 1) / pages) * (lastIndex?.units.length ?? 0)) }
    }
    if (near.ids.has(id)) return 0
    const d = id - near.anchor
    return d >= 0 ? 1 + d : 1 - 2 * d
  }
  let lastIndex: Parameters<typeof unitOf>[0] | null = null
  /** the units of the target with translated text (a row neither lost nor `none`) */
  const translatedUnits = () => { let n = 0; for (const r of rows.values()) if (r[2] === 'whole' || r[2] === 'partial') n++; return n }
  const counts = () => {
    let got = 0, gone = 0
    for (const r of rows.values()) { if (r[2] === 'lost') gone++; else got++ }
    return { got, lost: gone }
  }
  /** each translate()'s turn: of two waiting on the index (a retarget's and the one before it), the later alone sends anything */
  let translating = 0
  async function translate() {
    const s = side, mine = ++translating
    if (!s) return
    const index = await s.index()
    if (disposed || !index || !engine || !target || s !== side || mine !== translating) return
    // a head whose layer draws nothing (base.ts layerDraws) is decided here, at the head, before bind has run and before a single
    // unit goes to the user's service: nothing is translated for a paper whose pages the layer will not draw, and the lasting
    // word is told (the controller keeps it over the side's own refusal at bind)
    const headBase = (index as { head?: { base?: unknown } }).head?.base
    if (!layerDraws(headBase)) {
      terminal = true
      attempt?.abort()
      return unavailable('cannot-prepare')
    }
    lastIndex = index
    const a = new AbortController()
    attempt?.abort()
    attempt = a
    total = toTranslate(index, target).length
    rowsState = 'translating'
    const context = contextOf(index)
    const e = engine
    emit({ type: 'translating', got: counts().got, total, lost: 0 })
    let result: Awaited<ReturnType<typeof runRows>>
    try {
      result = await runRows(index, {
        lang: target,
        // (nothing sent once the attempt is let go: a retarget's, a retry's or the page's end)
        send: (texts, cuts) => (a.signal.aborted ? Promise.reject(Object.assign(new Error('the attempt is let go'), { name: 'AbortError' })) : e.translate(texts, context, cuts)),
        format: e.format as 'markers' | 'tags' | 'runs',
        rank,
        onRows(batch) {
          if (a.signal.aborted || disposed || s !== side) return
          for (const r of batch) rows.set(r[0], r)
          s.take(batch)
          const c = counts()
          emit({ type: 'translating', got: c.got, total, lost: c.lost })
        },
        signal: a.signal,
      })
    } catch (err) {
      if (a.signal.aborted || disposed) return
      // a failure that is no error of the service's: the scope let go, and a retry opens the service again; the pages still
      // showing another target's layer show the original (its rows will not come)
      rowsState = 'failed'
      void engine?.close?.()
      engine = null
      if (s === side) s.dropOthers()
      return emit({ type: 'fail', kind: kindOf(err) })
    }
    if (a.signal.aborted || disposed || s !== side) return
    lost = result.lost
    rowsState = result.stopped && result.stopped !== 'aborted' ? 'failed' : 'translated'
    // the end told, the pages laid with what they hold; but a stop with no unit translated has nothing to lay (its pages would be
    // drawn as the original's, our page in place of arXiv's): no end, they stay the original's page, the pages still showing another
    // target's layer among them. A stop that ends this way ends the run as any stop does: the service's own bounds (each batch's
    // timeout and the queue's whole budget, translate-service.ts) end a service that never answers, and a later target, a retry
    // or the page's end aborts the attempt before
    if (rowsState !== 'failed' || translatedUnits() > 0) s.end()
    else s.dropOthers()
    const c = counts()
    emit({ type: 'translated', got: c.got, total, lost: result.lost, stopped: result.stopped && result.stopped !== 'aborted' ? (result.stopped as ProviderErrorKind) : null })
  }

  // ---------------------------------------------------------------- the run
  /** the translation again on the side there is: the door opened again over the latest document, every row held taken */
  function again() {
    if (!side) return
    side.again()
    if (rows.size) side.take([...rows.values()])
    void translate()
  }
  /** a new engine for the beginning `my`, the one before closed; the translation again with it (`retargeted`: the side has opened
   *  its door again already, so the run alone). A target that changed meanwhile (the settings landed again) is the side's next
   *  target (retargeted) */
  let renewing = 0
  async function renewed(my: number, retargeted = false) {
    const mine = ++renewing
    const was = engine
    engine = null
    rowsState = 'idle'
    void was?.close?.()
    let e: RunEngine
    try {
      e = await host.engine()
    } catch (err) {
      if (disposed || my !== gen || mine !== renewing) return
      rowsState = 'failed'
      // (the pages still showing another target's layer show the original: this target's rows will not come)
      side?.dropOthers()
      return emit({ type: 'fail', kind: kindOf(err) })
    }
    if (disposed || my !== gen || mine !== renewing) { void e.close?.(); return }
    if (e.lang !== target) {
      void e.close?.()
      return retarget(e.lang)
    }
    engine = e
    if (retargeted) void translate()
    else again()
  }
  /** the run in target `to`, in place: the attempt under way let go at once (none of its rows reaches the side after), the rows
   *  of the target before let go, the side laying `to` over the same document, then the service opened again for it. A run with
   *  no side to lay over (none made yet: no service, a language the layer does not set; or one whose side refused its layer) is
   *  begun again; a language the layer does not set is said so, the side let go and the original shown */
  function retarget(to: string) {
    if (disposed || to === target) return
    attempt?.abort()
    attempt = null
    rows.clear()
    lost = 0
    target = to
    near = { page: -1, ids: new Set<number>(), anchor: 0 }
    if (!(TARGETS as readonly string[]).includes(to)) {
      // (a service still opening, for a beginning or a renewal, is closed when it comes, never applied: the beginning let go)
      gen++
      renewing++
      begun.abort()
      rowsState = 'idle'
      void engine?.close?.()
      engine = null
      side?.dispose()
      side = null
      return unavailable('target')
    }
    // (a limit's wait under way keeps its look, which resumes once the wait has passed: the side is retargeted in place)
    const waiting = state === 'unavailable' && refusedUntil > Date.now()
    if (!side || (state === 'unavailable' && !waiting) || state === 'failed' || (side.probe() as { state?: string }).state === 'refused') {
      void engine?.close?.()
      side?.dispose()
      side = null
      engine = null
      void begin().catch(() => {})
      return
    }
    side.retarget(to)
    // (the line told as an open tells it: once the index is read, translate())
    void renewed(gen, true)
  }
  async function begin() {
    const my = ++gen
    begun.abort()
    begun = new AbortController()
    const signal = begun.signal
    ac.signal.addEventListener('abort', () => begun.abort(), { once: true })
    state = 'engine'
    preparedFor = 0
    refusals = 0
    // the original each beginning's layer is bound to, heard anew (a retry may find the layer made again over another)
    tag = null
    basis = null
    terminal = false
    let opened: RunEngine
    try {
      opened = await host.engine()
    } catch (e) {
      if (disposed || my !== gen) return
      state = 'failed'
      return emit({ type: 'fail', kind: kindOf(e) })
    }
    // an engine that comes after its beginning was let go (a retry, the page's close) is closed, never kept: its scope
    // would stay bound to the background for the page's life
    if (disposed || my !== gen) { void opened.close?.(); return }
    engine = opened
    target = engine.lang
    if (!(TARGETS as readonly string[]).includes(target)) return unavailable('target')
    const make = host.createSide ?? createLayerSide
    side = make(view, {
      paper, target, faceSources: host.faces ?? servedFaces(host.api, f), hyphUrl: lang => `${host.api}/hyph/${lang}.json`, ...options(),
      // (the reader's toggles, "What to translate": every class is translated whatever they are, and they show or hide it)
      ...(host.classes ? { classes: { ...host.classes() } } : {}),
      // (a late chunk read, the bitmap figures' labels told after the parts: its units translated too, the rows held given again)
      onIndex: () => { void translate() },
    })
    void translate()
    await look(my, signal)
  }
  void begin().catch(e => { if (!disposed && !isAbort(e)) { console.error('[reader] the run:', e); state = 'failed'; emit({ type: 'fail', kind: 'unknown' }) } })

  return {
    get side() { return side },
    retry() {
      if (disposed) return
      // a limit's wait under way: the look asks again once it has passed, never sooner
      if (state === 'unavailable' && refusedUntil > Date.now()) return
      // a run that found no layer, or no service, or whose side refused its layer (its base, an object: a refused side
      // takes no again()): begun again, a new side with its own look and bind
      if (!side || !engine || state === 'unavailable' || (side.probe() as { state?: string }).state === 'refused') {
        void engine?.close?.()
        side?.dispose()
        side = null
        engine = null
        void begin().catch(() => {})
        return
      }
      // the service stopped short (a key refused, the network): opened again, so that its scope binds the chain the
      // settings make now (the settings' landing retries so: a key set, a service changed), the old one closed
      if (rowsState === 'failed') { void renewed(gen); return }
      // the translation again: the door opened again over the latest document, every row held taken at once
      again()
    },
    retarget: to => retarget(to),
    setClasses: classes => { if (!disposed) side?.setClasses({ ...classes }) },
    dispose() {
      if (disposed) return
      disposed = true
      ac.abort()
      attempt?.abort()
      side?.dispose()
      side = null
      void engine?.close?.()
    },
    probe: () => ({ state, rowsState, target, looks, prepares, rows: rows.size, total, lost, ours, basis: basis ? 'ranged' : 'none', bound: tag !== null }),
  }
}
