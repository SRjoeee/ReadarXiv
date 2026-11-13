// openReader (interfaces/host DECISION: A's host, B's session): a reader in `root` for one paper, over a host that gives the
// network, where arXiv's bytes are read first, the preferences, and optionally the rows made here. Everything else is the
// reader's own and the same in both hosts: the byte store, PDF.js and its workers, the v2 client, the objects, composing, the
// highlight. A reader owns all it makes (no state outside a reader): its marks are on `root`, its sheets and faces in it, its
// timers on its clock; `close()` lets everything go and empties `root`.
//
// The session is the machine (session/machine.ts), run by the runtime; each resource's handler here makes the real thing: the
// original (its ranged source, its document, the panes), the link (the follow), the open, the layer's code (its chunk, imported
// after the left's first page or 1.5 s), the composed document (the add-on by ranges over the same store, its groups, composing
// switched on), the rows (the server's objects, or the host's translate), the timers. The first range of the original is asked
// before openReader returns.
import { BOUNDS, type Head, type Part, read, type Row, type Unit, type Units } from '@readarxiv/format'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { composedSource } from './bytes/composed.ts'
import { openRanged } from './bytes/ranged.ts'
import { type Fetch, type OriginalSource, rangeSource } from './bytes/source.ts'
import { CHUNK, chunkStore } from './bytes/store.ts'
import type { Composer, RowsSource } from './compose/composer.ts'
import type { FaceTable } from './compose/faces.ts'
import type { Highlight } from './compose/highlight.ts'
import type { Lay } from './compose/page.ts'
import { CATALOGUE_WORDS, type Words } from './compose/words.ts'
import { createPanes, type Display, type Panes, type Side, type Zoom } from './panes/panes.ts'
import { type Kit, loadKit, type PdfBuild } from './pdfjs/kit.ts'
import { follow, objectStore, open, Refused, segOf } from './session/client.ts'
import { type Contents, createContents, type OutlineEntry, type Rect } from './session/contents.ts'
import {
  againOf,
  type Doc,
  dirOf,
  displayOf,
  type Effect,
  init,
  type LayerWhy,
  lookSaid,
  type ObjectAt,
  type OriginalWhy,
  type PaperRef,
  type Prefs,
  type Ref,
  type RowsStop,
  type RowsWhy,
  type State,
  targetOf,
  translationShown,
  wanted,
} from './session/machine.ts'
import { abstractPage, htmlVersionOf, originalPdfOf, TRANSLATE_HASH, titleOf, VIEWER_HASH } from './session/paper.ts'
import {
  anchorOf,
  contextOf,
  keep,
  missingOf,
  type PaperContext,
  ranked,
  shownAsOriginal,
  stopOf,
  toldWait,
} from './session/rows.ts'
import { createRuntime, type Handlers, type Runtime } from './session/runtime.ts'
import { ownedClock } from './stack/clock.ts'
import { createScheduler } from './stack/scheduler.ts'
import { bandPaint, DEFAULTS } from './prefs.ts'
import { TYPESET_TARGETS } from './compose/targets.ts'
import { addSheets } from './styles.ts'

export { DEFAULTS }
export type { OutlineEntry, PaperContext }

/** a translation result as the host's translate yields it (packages/translate's Result: format's Row) */
export type Result = Row

/**
 * The host's store of the preferences. A read, and each landing a watch tells, is one of three: the values stored; nothing
 * stored (the host's defaults, given as values); or `null`, stored and unreadable (the values in use stay, the settings said
 * unreadable until a readable landing: S-R-21)
 */
export interface PrefStore {
  read(): Promise<Prefs | null>
  write(patch: Partial<Prefs>): Promise<void>
  watch(listener: (p: Prefs | null) => void): () => void
}
export interface Host {
  fetch: Fetch
  original(ref: string): string
  prefs: PrefStore
  /** rows made here: one Result per unit, as each settles, the units in the order they are wanted (the page in view's first, then
   *  ahead before behind); a later call (the units a new reading place waits on) goes first. `context`: the paper's title and
   *  abstract, for a translator whose replies depend on them */
  translate?(
    units: readonly Unit[],
    target: string,
    o: { signal: AbortSignal; context?: PaperContext },
  ): AsyncIterable<Result>
}

export type Command =
  | { do: 'set'; prefs: Partial<Prefs> }
  | { do: 'zoom'; to: Zoom }
  | { do: 'zoomBy'; factor: number }
  | { do: 'pinch'; side: Side; factor: number; at: [number, number] }
  | { do: 'page'; side: Side; page: number }
  | { do: 'unit'; id: number }
  /** a contents entry (its `id`) gone to on both sides, a line of room above its heading; else its page */
  | { do: 'heading'; id: number }
  | { do: 'lead'; side: Side }
  | { do: 'narrow'; on: boolean }
  | { do: 'retry' }
  /** the original held on screen for now, whatever display is chosen, or let go (a host's rule: the website's narrow window
   *  while the paper is made, a refusal for now with nothing laid): never written, and not a choice, so the run the display
   *  chosen engages goes on; the reader's own choice of a display ends it */
  | { do: 'hold'; on: boolean }
  /** arXiv's own PDF opened by the browser in a tab of its own, for it to stream and save (`paper.pdf`): never read through
   *  the reader */
  | { do: 'original' }

export interface ReaderState {
  /** `title`: the PDF's own, else arXiv's abstract page's ('' until known, never put back); `html`: arXiv's HTML version with
   *  the hash that translates it, once the bilingual version cannot be had (null: none, or not asked); `pdf`: arXiv's PDF */
  paper: { id: string; version: number | null; title: string; html: string | null; pdf: string }
  prefs: Prefs
  settings: { s: 'reading' | 'landed' | 'unreadable'; refused: number }
  /** `self` (here and on a refusal and a failed run): the session asks again by itself, at its time or once the network is back,
   *  none of the reader's doing, so no retry is offered for it (machine.ts againOf, PDF-READER §8.1) */
  original:
    | { s: 'opening'; loaded: number; total: number }
    | { s: 'open'; pages: number; ours: boolean }
    | { s: 'failed'; why: OriginalWhy; self?: true }
  layer:
    | { s: 'none' }
    /** `stage`: the prepare's as our server's record names it, null before the first (the progress line's place: status.ts) */
    | { s: 'preparing'; stage: string | null }
    /** `stopped`: our server's look stopped, or paused from one of the session's own asks to the next, while the view lacks what
     *  its work would bring (rows.ts toldWait): its cause, our server's time, whether the session asks again by itself (the
     *  network's is `network`) */
    | {
        s: 'ready'
        laid: number
        total: number
        asOriginal: number
        stopped?: { why: LayerWhy; retryAt: number | null; self?: true }
      }
    | { s: 'refused'; why: LayerWhy; retryAt: number | null; self?: true }
  /** the rows of the target. Their counts are the view's, one statement (session/rows.ts viewOf): the units of the layer shown
   *  that the toggles show translated (`total`), those with a translation held (`got`), those with a row that is none (`lost`);
   *  0 of 0 before any layer's units are read; while a new layer's are not, the count of the layer before. `waits`: one of them
   *  still to come from a run under way, or from our server's work for the view (its prepare running, a need asked: rows.ts
   *  runOf), rows ended meanwhile told as arriving (none for rows read of a run done with nothing more to come, a run that
   *  restates rows held, or one on units of a layer not shown yet) */
  rows: { target: string; from: 'server' | 'here' } & (
    | { s: 'none' }
    | { s: 'arriving'; got: number; total: number; lost: number; waits: boolean }
    /** `stopped`: why the units lost got no translation (the service's word: the run stopped short), null where none was */
    | { s: 'complete'; got: number; total: number; lost: number; stopped: RowsStop | null }
    /** `retryAt`: when a retry is due, where the translator named a wait (a retry before it asks nothing) */
    | { s: 'failed'; why: RowsWhy; got: number; total: number; lost: number; retryAt?: number | null; self?: true }
  )
  view: {
    display: Display
    sync: { on: boolean; available: boolean }
    scale: number
    zoom: Zoom | null
    narrow: boolean
    sides: Record<Side, { page: number; pages: number }>
    /** the contents: the paper's headings, their levels, pages and titles (translated once their rows are in) */
    outline: readonly OutlineEntry[]
    /** the contents entry being read: the last heading at or above the reading line of the pane read; null before the first */
    heading: number | null
  }
  /** our server's document followed, its stream lost while the browser is online and asked again, nothing heard since (the
   *  website says "reconnecting") */
  reconnecting: boolean
  /** the network failed (the browser offline, or an ask's fetch rejected, and nothing heard since) while the view waits on our
   *  server for a translation it counts: told whatever is on screen, the session asking again by itself once it is back
   *  (machine.ts linkSaid, PDF-READER §8.1). A view that waits for nothing is told nothing */
  network: boolean
  /** `lost`: a face the translation is set in could not be had (an answer no ask would mend, or a failure met twice), its
   *  passages drawn in their fallback until the page is loaded again (a host may say so: the website's faces-lost); null
   *  while none is */
  faces: 'lost' | null
  crashed: boolean
}
export interface Reader {
  state(): ReaderState
  subscribe(listener: () => void): () => void
  do(c: Command): void
  probe(): Readonly<Record<string, number | string | boolean | null>>
  close(): void
}

/** what lays a page: the reader's own typesetter where a host gives none (lane L3's layPage over the rule set's rules, the
 *  served faces and the reader's Metrics: compose/typeset.ts, served.ts); a host's own where it gives one (the e2e's fixture
 *  lay), with the faces its pages name. Given an engine without `lay`, nothing is laid and every page stays arXiv's */
export interface Engine {
  lay?: (parts: (n: number) => Promise<Part | null>, pages: number) => Promise<Lay> | Lay
  faces?: FaceTable
  /** what a page not laid is drawn from (way a: the original document; way b: the composed one) */
  unlaid?: 'original' | 'composed'
  /** the target languages the typesetter sets (BCP 47); another holds the original for the visit (rows failed `target`) until
   *  a language it sets is chosen. None: every target */
  targets?: readonly string[]
}

const PAPER = /^((?:[a-z-]+(?:\.[A-Z]{2})?\/\d{7})|(?:\d{4}\.\d{4,5}))(?:v(\d+))?$/
/** the wash's two variables, which the reader writes on its root for the band chosen (prefs.ts bandPaint) */
const BAND_VARS = ['--axt-hl-color', '--axt-hl-mix'] as const
/** how long a new reading place stands before its units are asked first (a scroll's pages passed over ask nothing) */
const NEAR_MS = 150

export function openReader(
  root: HTMLElement,
  o: {
    host: Host
    paper: string
    visit?: Partial<Pick<Prefs, 'display' | 'target' | 'sync'>>
    engine?: Engine
    words?: Words
    /** the two panes' elements, where the host's chrome renders them (its scrollers): drawn into, never removed; none: the
     *  reader makes `div.axt-pane.left` and `.right` under `root` */
    panes?: { left: HTMLElement; right: HTMLElement }
    /** the PDF.js build the host serves this browser (its modules and its worker: `LEGACY` of `@readarxiv/reader/pdfjs-legacy`
     *  below the modern build's floor, builds.ts `buildFor`); none: the modern build. The choice is the host's */
    pdfjs?: PdfBuild
  },
): Reader {
  const words = (): Words => o.words ?? CATALOGUE_WORDS
  const m = PAPER.exec(o.paper)
  if (!m) throw new TypeError(`not an arXiv paper: ${o.paper}`)
  const paper: PaperRef = { id: m[1] as string, version: m[2] ? Number(m[2]) : null }
  const ref = `${paper.id}${paper.version ? `v${paper.version}` : ''}`
  const host = o.host
  const clock = ownedClock()
  const store = chunkStore()
  const scheduler = createScheduler()
  const listeners = new Set<() => void>()
  let closed = false
  /**
   * The follows' wakes (design-performance-2026-11-13 Q9): a follow that settles (the last document says nothing runs) waits for
   * one instead of asking again a minute later, 60 asks an hour a settled tab. The wake is the session's own word: an object
   * answered `gone` (the paper's objects replaced) asks the document again, once a catalog. The page shown again, the network
   * back, the back-forward cache and a new target need none: the session ends the follow and starts another, which asks at
   * once (machine.ts, the link). A wake given while no follow waits (its stream still read) is kept for its next wait
   */
  const wakes = new Set<{ due: boolean; go: (() => void) | null }>()
  const woken = new Set<string>()
  const wakeFollows = () => {
    for (const w of wakes) {
      const go = w.go
      w.go = null
      if (go) go()
      else w.due = true
    }
  }
  /**
   * An object of the layer of catalog `digest` answered gone, its head or a part read as its page comes near: the paper's
   * objects replaced (PDF-READER §11.5). The layer let go (machine.ts `object.refused`: no live follow is needed for the
   * document to be asked again, the extension's being none once its layer is final) and the follow that waits woken, once a
   * catalog: a document that still names the same catalog makes no loop of asks
   */
  const layerGone = (digest: string) => {
    rt.input({ i: 'object.refused', digest, why: 'gone' })
    if (woken.has(digest)) return
    woken.add(digest)
    wakeFollows()
  }
  /** when each first moment came, ms from the open (the probe's: the harness's order checks and timings) */
  const t0 = performance.now()
  const moments: Record<string, number> = {}
  const mark = (k: string) => {
    if (!(k in moments)) moments[k] = Math.round(performance.now() - t0)
  }
  // ---- the root: its marks, its sheets, its two panes (the host's, where it gives them: what was in them and in the root
  // before stays, and close takes away only what the reader put there)
  root.classList.add('axt-reader')
  const given = o.panes ?? null
  const left = given?.left ?? document.createElement('div'),
    right = given?.right ?? document.createElement('div')
  const had = new Map<HTMLElement, Set<Element>>(
    [root, left, right].map((el) => [el, new Set(el.children)] as [HTMLElement, Set<Element>]),
  )
  if (!given) {
    left.className = 'axt-pane left'
    right.className = 'axt-pane right'
    root.append(left, right)
  }
  // ---- PDF.js, the panes, composing: made once the kit is in (the original's first range does not wait for it)
  const kitReady = loadKit(o.pdfjs ?? {})
  let syncAvailable = false
  /** a face lost this visit (faces.ts `lost`): kept, as its passages stay in their fallback */
  let facesLost = false
  let kit: Kit | null = null,
    panes: Panes | null = null,
    composer: Composer | null = null,
    highlight: Highlight | null = null
  /** the served faces and the reader's Metrics over them, the reader's own typesetter's (no engine of the host's), with the code */
  let served: import('./compose/served.ts').Served | null = null
  /** the typesetter's chunk, asked with the code; the target its first reads were asked ahead for (warmSoon) */
  let typesetCode: Promise<typeof import('./compose/typeset.ts')> | null = null
  let warmed = ''
  const ready = kitReady.then((k) => {
    // (a reader closed while PDF.js was loading makes nothing: no sheet, no pane, no mark on a root it has given back; its kit
    // let go. Everything below waits on `ready` and finds no panes, or its released ticket)
    if (closed) {
      k.destroy()
      return k
    }
    kit = k
    addSheets(root, k.sheet)
    panes = createPanes({
      root,
      left,
      right,
      kit: k,
      scheduler,
      clock,
      pageName: (s, n) => words().pageName(s === 'left' ? 'original' : 'translation', n),
      openExternal: (url) => openExternal(url),
    })
    panes.on('drawn', (e) => {
      if (e.side === 'left' && e.page === 1) {
        mark('leftDrawn')
        rt.input({ i: 'panes.drawn' })
      }
      if (e.side === 'right' && e.page === 1) mark('rightDrawn')
    })
    for (const k2 of ['page', 'scale', 'sync', 'display'] as const) panes.on(k2, () => tellSoon())
    // (whether the sides can scroll together: the original open and its pages laid out on both, as the panes tell it)
    panes.on('sync', (e) => {
      syncAvailable = e.available
    })
    // (the heading being read follows the scroll of either pane; the rows made here, the reading place)
    panes.on('scrolled', () => headingSoon())
    panes.on('page', () => {
      headingSoon()
      nearSoon()
    })
    return k
  })
  const openExternal = (url: string) => {
    if (!/^(https?|mailto):/.test(url)) return
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  // ---- the rows of the target followed, kept by unit id (content-addressed: no ticket)
  let rows = new Map<string, Row>()
  let rowsTarget = ''
  let rowsDone = false
  /** the units the paper keeps as they are (format's Unit.kept), once the head's units are read: never translated, so no page
   *  waits for a row of theirs */
  let keptIds: ReadonlySet<string> = new Set()
  const rowsListeners = new Set<() => void>()
  const rowsSource = (): RowsSource => ({
    target: rowsTarget,
    get: (id) => rows.get(id),
    get done() {
      return rowsDone
    },
    kept: (id) => keptIds.has(id),
    on(f) {
      rowsListeners.add(f)
      return () => rowsListeners.delete(f)
    },
  })
  const rowsIn = (rs: readonly Row[]) => {
    for (const r of rs) keep(rows, r)
    if (contents?.take(rs)) outlineSoon()
    for (const f of [...rowsListeners]) f()
    // (the view's count is of the rows held: told anew)
    if (rs.length) tellSoon()
  }
  // ---- the head, the parts, the units: objects by digest, each fetched once while wanted (a failure forgotten), held to it
  let head: Head | null = null
  const objects = objectStore({ fetch: host.fetch })
  const objectOf = (r: Ref) => objects.of(r)
  const catalogOf = (): Ref | null => (rt.state.layer.s === 'ready' ? rt.state.layer.catalog : null)
  /** an object whose length the head does not state (a part, by its digest alone): read within its kind's bound, held to its
   *  digest */
  const byDigest = (path: string, sha256: string): Promise<Uint8Array> =>
    objects.ofDigest(path, sha256, BOUNDS.part.bytes)
  /** the parts of one layer (its catalog, the head read from it): page n's, or null where the head names none. One function a
   *  layer, kept while its catalog is the layer's: the composer reads a layer's parts once, and anew for another (Layer.part is
   *  the layer). One function for every layer laid a newer catalog's composed document with the parts of the head before it,
   *  whose members its groups lack, each page then settled as arXiv's for good (staging, 2026-11-08: 1706.03762v7 once its
   *  catalog moved, laid 0 and two pages arXiv's for 18 minutes) */
  let layerParts: { catalog: string; part: (n: number) => Promise<Part | null> } | null = null
  const partsOf = (c: Ref, h: Head) => {
    if (layerParts?.catalog !== c.sha256)
      layerParts = {
        catalog: c.sha256,
        part: async (n) => {
          const d = h.parts[n - 1]
          if (!d) return null
          const bytes = await byDigest(`${dirOf(c)}/${d}`, d).catch((e: unknown) => {
            if (e instanceof Refused && e.why === 'gone') layerGone(c.sha256)
            throw e
          })
          const part = read('part', bytes, d) as Part
          // (the contents' headings placed by the part's members: the contents of this head's alone)
          if (head === h && contents?.place(part.flows.flat())) outlineSoon()
          return part
        },
      }
    return layerParts.part
  }
  /** the parts of the layer now, where its head is read */
  const partOf = (n: number): Promise<Part | null> => {
    const l = rt.state.layer
    return l.s === 'ready' && l.head ? partsOf(l.catalog, l.head)(n) : Promise.resolve(null)
  }
  /** the layer's units, read once a head: the objects its head names, in its order (machine.ts layerUnitsOf), each by its digest
   *  within the Units bound, as the parts are read. The one place the contents' headings, the view's count, the kept units, the
   *  rows made here and their context read units from: never the document's list, which on the website names the source's units
   *  too (the contents listed every heading twice) */
  let unitsHeld: { key: string; units: Promise<Unit[]> } | null = null
  /** the units last read: the view's count reads them (stateOf), the layer shown's once read, the layer's before it meanwhile */
  let unitsRead: readonly Unit[] | null = null
  const unitsOf = (list: readonly ObjectAt[]): Promise<Unit[]> => {
    const key = list.map((r) => r.sha256).join()
    if (unitsHeld?.key !== key) {
      const p = Promise.all(
        list.map(
          async (u) =>
            (read('units', await objects.ofDigest(u.path, u.sha256, BOUNDS.units.bytes), u.sha256) as Units).units,
        ),
      ).then((l) => l.flat())
      unitsHeld = { key, units: p }
      // (the kept units known: a page that waited for theirs alone is laid now)
      p.then(
        (units) => {
          if (closed || unitsHeld?.units !== p) return
          keptIds = new Set(units.filter((u) => u.kept).map((u) => u.id))
          if (keptIds.size) for (const f of [...rowsListeners]) f()
          unitsRead = units
          tellSoon()
        },
        () => {},
      )
      p.catch(() => {
        if (unitsHeld?.units === p) unitsHeld = null
      })
    }
    return unitsHeld.units
  }
  // ---- the contents and the heading being read: told at the head's units and after each change, once a frame
  let contents: Contents | null = null,
    contentsOf = ''
  let outline: readonly OutlineEntry[] = []
  let heading: number | null = null
  let outlineFrame = 0,
    headingFrame = 0
  function outlineSoon() {
    if (outlineFrame || closed || !contents) return
    outlineFrame = clock.frame(() => {
      outlineFrame = 0
      if (!contents) return
      outline = contents.entries()
      tellSoon()
      headingSoon()
    })
  }
  /** the side the reader reads: the one shown (the translation's in its own display, or where the bilingual display shows it
   *  alone in a narrow window) */
  const sideRead = (): Side =>
    displayOf(rt.state) === 'translation' ||
    (displayOf(rt.state) === 'bilingual' && root.hasAttribute('data-axt-narrow'))
      ? 'right'
      : 'left'
  /** how far down its page a rectangle's top is, as a share of the page's height on the side read */
  const topOf = (r: Rect): number | null => {
    const side = sideRead()
    const box = panes?.boxOf(side, r[0], [r[1], r[2], r[3], r[4]]),
      h = panes?.pageElement(side, r[0])?.offsetHeight
    return box && h ? box.top / h : null
  }
  function headingSoon() {
    if (headingFrame || closed || !contents) return
    headingFrame = clock.frame(() => {
      headingFrame = 0
      if (!contents || !panes) return
      const at = panes.reading()
      const id = at ? contents.headingAt(at.page, at.at, topOf) : null
      if (id === heading) return
      heading = id
      tellSoon()
    })
  }
  /** the contents of a head made once its units are in (those it names, `units`), the original's own outline matched for the
   *  headings it does not place */
  function contentsFor(h: Head, units: readonly ObjectAt[]) {
    const key = units.map((u) => u.path).join()
    if (contentsOf === key) return
    contentsOf = key
    void unitsOf(units).then(
      (units) => {
        if (closed || contentsOf !== key) return
        const c = createContents(units, h)
        contents = c
        c.take([...rows.values()])
        const doc = original?.doc
        if (doc) void c.outline(doc as never).then((m) => m && contents === c && outlineSoon())
        outlineSoon()
      },
      () => {
        if (contentsOf === key) contentsOf = ''
      },
    )
  }
  /** a contents entry gone to: its first rectangle where a part places it (the part of its page read where it is not yet), a
   *  line of room above it on the side read, the other following; else the page the contents give it */
  async function goToHeading(id: number) {
    const c = contents
    if (!c || !panes) return
    let r = c.firstRect(id)
    const page = c.pageOf(id)
    if (!r && page) {
      await partOf(page).catch(() => null)
      r = c.firstRect(id)
    }
    if (closed || !panes) return
    if (r) panes.goToRect(r)
    else if (page) panes.goToPage(sideRead(), page)
  }
  // ---- the rows made here under way, and the reading place they are asked by
  let making: { units: readonly Unit[]; signal: AbortSignal; asked: Set<string>; run(want: Unit[]): void } | null = null
  let nearPage = 0,
    nearTimer = 0
  /** the units the page read and the next wait on (their laid pages' closures), and the reading place as an index of `units` */
  function nearOf(units: readonly Unit[]) {
    const page = panes?.reading()?.page ?? 1
    const ids = new Set<string>()
    for (const n of [page, page + 1]) for (const id of composer?.page(n)?.wait.rows ?? []) ids.add(id)
    return { page, ids, anchor: anchorOf(units, ids, page, head?.paper.pages ?? 1) }
  }
  /** a new reading place while rows are made here: its units still missing asked again in a call of their own, which the
   *  translator answers first (the units that page waits on, else two pages' worth from the place on) */
  function nearSoon() {
    if (!making || nearTimer || closed) return
    nearTimer = clock.later(() => {
      nearTimer = 0
      const m = making
      if (!m || m.signal.aborted) return
      const near = nearOf(m.units)
      if (near.page === nearPage) return
      nearPage = near.page
      const todo = missingOf(m.units, rows).filter((u) => !m.asked.has(u.id))
      let want = todo.filter((u) => near.ids.has(u.id))
      if (!want.length) {
        const span = Math.max(1, Math.ceil((2 * m.units.length) / Math.max(1, head?.paper.pages ?? 1)))
        want = ranked(todo, near.ids, near.anchor).slice(0, span)
      }
      if (!want.length) return
      for (const u of want) m.asked.add(u.id)
      m.run(want)
    }, NEAR_MS)
  }
  /** the pages near the view the layer shows as arXiv's by the rule (none of theirs laid: no part, or laid with nothing of its
   *  own), told to the host as settled, never as laid; once a page a composed document and target */
  const asOriginal = new Set<number>()
  function asOriginalNow(): number {
    const h = head
    if (!h || !panes || rt.state.layer.s !== 'ready' || !composed) return asOriginal.size
    for (let n = 1; n <= h.paper.pages; n++) {
      if (asOriginal.has(n) || !panes.right.near(n)) continue
      if (shownAsOriginal(h.parts[n - 1], composer?.page(n) ?? null)) asOriginal.add(n)
    }
    return asOriginal.size
  }
  // ---- the original's document, the composed one
  let original: { source: OriginalSource; doc: PDFDocumentProxy | null } | null = null
  /** the composed document open, with its groups and its own lay: the engine's, made over its parts once its head is read (none
   *  lays nothing). A generation: published whole, by the ticket that made it while it lives, and read only through it */
  let composed: {
    doc: PDFDocumentProxy
    groups: import('./compose/groups.ts').Groups
    lay: Lay
    /** its layer's parts (partsOf) */
    part: (n: number) => Promise<Part | null>
  } | null = null
  const none: Lay = (part) => ({ page: part.page, wait: { rows: [], faces: [] }, members: [], links: [] })
  /** the reader's own typesetter's lay, where the host gives no engine: the rules of the target the rows are of and of the toggles
   *  at each call, the served Metrics (compose/typeset.ts) */
  const typesetOf = async (): Promise<Lay> => {
    const s = served
    if (!s) return none
    const { pastFootOf, typesetLay } = await import('./compose/typeset.ts')
    // (the borrow past TeX's bottom as the website's address sets it for the visit, the owner's switch: PDF-READER §18.37)
    const pastFoot = pastFootOf(typeof location === 'undefined' ? null : location)
    return typesetLay({
      served: s,
      target: () => rowsTarget || targetOf(rt.state),
      classes: () => rt.state.prefs.value.classes,
      ...(pastFoot !== undefined ? { pastFoot } : {}),
    })
  }
  /** the paper's title: its PDF's Info Title (arXiv's margin stamp is none), else the abstract page's (one request a visit,
   *  asked again by the next open where it could not be read); the first known stays */
  const abstract = abstractPage(host.fetch, ref)
  async function titleFrom(doc: PDFDocumentProxy, signal: AbortSignal) {
    if (rt.state.title) return
    const meta = await doc.getMetadata().catch(() => null)
    let title = titleOf(meta?.info)
    if (!title) title = await abstract()
    if (!signal.aborted && title) rt.input({ i: 'paper.title', title })
  }

  const handlers: Handlers = {
    original(spec, t, emit, signal) {
      const url = spec.pin
        ? `/api/v2/o/arxiv/${segOf(paper, paper.version ?? head?.paper.version ?? 1)}.pdf`
        : host.original(ref)
      let opened = false,
        told1 = -2,
        told2 = -1
      const source = rangeSource({
        fetch: host.fetch,
        url,
        own: url.startsWith('/'),
        store,
        signal,
        keepReading: () => opened,
        // (the bytes come in as the progress line shows them: told by hundredths of the file, once its length is known)
        onProgress: (loaded) => {
          const total = source.bound?.total ?? 0
          const at = total ? Math.floor((100 * loaded) / total) : -1
          if (at === told1 && total === told2) return
          told1 = at
          told2 = total
          emit({ i: 'original.progress', t, loaded, total })
        },
        refused: (e) =>
          emit(
            e.kind === 'digest'
              ? { i: 'original.mismatch', t }
              : {
                  i: 'original.failed',
                  t,
                  // (no such file at its address: the paper is not there, a host's own page to show; ReaderState says it)
                  why: e.kind === 'missing' ? 'not-found' : e.kind === 'bytes' ? 'unreadable' : 'network',
                },
          ),
      })
      original = { source, doc: null }
      // (the first range out at once, before PDF.js is in: the open's first read takes it from the store)
      source.read(0, CHUNK).catch(() => {})
      let task: ReturnType<typeof openRanged> | null = null
      void ready.then(async (k) => {
        if (signal.aborted) return
        task = openRanged(k.lib as never, source, { options: k.options('original') })
        try {
          const doc = await task.promise
          if (signal.aborted) return
          opened = true
          if (original?.source === source) original.doc = doc
          if (head) void source.prove(head.original.chunks)
          mark('originalOpen')
          emit({ i: 'original.opened', t, pages: doc.numPages, bytes: source.bound?.total ?? 0 })
          void titleFrom(doc, signal)
          if (contents) void contents.outline(doc as never).then((m) => m && outlineSoon())
          await panes?.open(doc)
          composer?.setDocuments({ original: doc, composed: composed?.doc ?? null, groups: composed?.groups ?? null })
        } catch (e) {
          if (!signal.aborted)
            emit({
              i: 'original.failed',
              t,
              why: (e as Error)?.name === 'InvalidPDFException' ? 'unreadable' : 'network',
            })
        }
      })
      return async () => {
        source.abort()
        if (original?.source === source) original = null
        panes?.drop()
        await task?.destroy()
        kit?.release('original')
      }
    },
    link(spec, t, emit, signal) {
      const w: { due: boolean; go: (() => void) | null } = { due: false, go: null }
      wakes.add(w)
      signal.addEventListener('abort', () => wakes.delete(w), { once: true })
      follow({
        fetch: host.fetch,
        paper,
        target: spec.target,
        signal,
        wake: () => {
          if (!w.due) return new Promise<void>((go) => (w.go = go))
          w.due = false
          return Promise.resolve()
        },
        onDoc: (doc) => emit({ i: 'paper', t, doc }),
        onQuiet: () => emit({ i: 'link.quiet', t }),
      }).catch((e) => {
        if (signal.aborted) return
        emit({
          i: 'follow.lost',
          t,
          why: e instanceof Refused ? e.why : 'network',
          afterMs: e instanceof Refused ? e.afterMs : null,
          doc: e instanceof Refused ? e.doc : null,
        })
      })
      return undefined
    },
    open(spec, t, emit, signal) {
      open({ fetch: host.fetch, paper, target: spec.target, signal }).then(
        (a) => emit({ i: 'open.answered', t, doc: a.doc, ...(a.refused ? { refused: a.refused } : {}) }),
        (e) => {
          if (!signal.aborted) emit({ i: 'open.failed', t, why: e instanceof Refused ? e.why : 'network' })
        },
      )
      return undefined
    },
    html(_spec, t, emit) {
      // our server's word first, where it gives one (L5's PaperDoc: after a prepare that cannot be made), before any ask of
      // arXiv's (one a host's network may not make, and a failed ask offers the version)
      const said = rt.state.doc?.prepare.html
      const asked =
        typeof said === 'boolean'
          ? Promise.resolve(said ? `https://arxiv.org/html/${ref}${TRANSLATE_HASH}` : null)
          : htmlVersionOf(host.fetch, ref)
      void asked.then((url) => emit({ i: 'html.answered', t, url }))
      return undefined
    },
    code(_spec, t, emit, signal) {
      // the layer's code: composing and the highlight, a chunk of its own (imported after the left's page 1, or 1.5 s); the
      // reader's own typesetter and its served faces with it, where the host gives no engine. What the composed document's open
      // reads is asked with it, the code's load waiting for none of it: its groups, and the typesetter, whose patterns, faces'
      // index and CJK tables are asked once a translation is to be shown (warmSoon; staging, 2026-11-08: three round trips in a
      // row before composedOpen)
      let faces: import('./compose/faces.ts').Faces | null = null
      void import('./compose/groups.ts').catch(() => {})
      typesetCode = o.engine ? null : import('./compose/typeset.ts')
      typesetCode?.catch(() => {})
      Promise.all([
        import('./compose/composer.ts'),
        import('./compose/faces.ts'),
        import('./compose/highlight.ts'),
        ready,
        o.engine ? null : import('./compose/served.ts'),
      ]).then(
        async ([C, F, H, k, S]) => {
          if (signal.aborted || !panes) return
          const lost = () => {
            if (facesLost) return
            facesLost = true
            tellSoon()
          }
          if (S) {
            served = S.createServed({ fetch: host.fetch, root, lost })
            faces = served.faces
            warmSoon(rt.state)
          } else faces = F.createFaces({ table: o.engine?.faces ?? {}, fetch: host.fetch, root, lost })
          // (the lay itself is made once the head is read: the composed document's open, whose own it is)
          const lay: Lay = (part, rs) => (composed?.lay ?? none)(part, rs)
          composer = C.createComposer({
            stack: panes.right,
            kit: k,
            faces,
            lay,
            unlaid: o.engine?.unlaid ?? 'original',
            lang: () => targetOf(rt.state),
            links: {
              open: openExternal,
              follow: (d, how) => void panes?.follow(d, how),
              unnamed: (to) => words().linkName(to),
            },
            clock,
            root,
            original: (n, settled) => panes?.originalOf(n, settled) ?? null,
            settle: (fn) => panes?.settle(fn),
            aheadGo: () => panes?.letAheadGo(),
            leftDrawing: (n) => panes?.leftDrawing(n) ?? false,
            classes: rt.state.prefs.value.classes,
          })
          composer.on('laid', () => mark('firstLaid'))
          composer.on('laid', () =>
            rt.input({ i: 'panes.laid', laid: composer?.probe().laidPages as number, total: head?.paper.pages ?? 0 }),
          )
          highlight = H.createHighlight({ panes, composer, clock, on: rt.state.prefs.value.highlight.on })
          composer.setDocuments({ original: original?.doc ?? null, composed: null, groups: null })
          mark('code')
          emit({ i: 'code.loaded', t })
        },
        () => emit({ i: 'code.failed', t }),
      )
      return () => {
        composer?.dispose()
        highlight?.dispose()
        // (the faces out of the document with the code that added them: faces.ts's promise)
        faces?.dispose()
        composer = null
        highlight = null
        faces = null
        served = null
        typesetCode = null
        warmed = ''
      }
    },
    composed(spec, t, emit, signal) {
      const h = spec.head
      const c = catalogOf()
      if (!h.addOn || !c || !original) {
        emit({ i: 'composed.failed', t })
        return undefined
      }
      // (a range refused, of the add-on or of the original under it: the composed document let go, its pages arXiv's, never a
      // page waiting for ever on a range PDF.js will not get)
      const failed = () => {
        if (!signal.aborted) emit({ i: 'composed.failed', t })
      }
      const addOn = rangeSource({
        fetch: host.fetch,
        url: `/api/v2/o/${dirOf(c)}/${h.addOn.digest}`,
        own: true,
        bound: { total: h.addOn.bytes, etag: null },
        signal,
        refused: failed,
      })
      const src = composedSource(original.source, h.original.bytes, addOn, h.addOn.bytes)
      let task: ReturnType<typeof openRanged> | null = null
      /** this ticket's generation, once published */
      let mine: typeof composed = null
      void ready.then(async (k) => {
        // (let go before this turn: no document opened, no worker asked of the kit after its release)
        if (signal.aborted) return
        task = openRanged(k.lib as never, src, { options: k.options('composed'), refused: failed })
        try {
          const doc = await task.promise
          const { groupsOf } = await import('./compose/groups.ts')
          const groups = groupsOf(doc)
          await groups.ready
          // (the lay held here until the ticket is known to live: one made for a document let go, which may come after a
          // newer catalog's, never reaches the composer)
          const part = partsOf(c, h)
          const lay = o.engine ? (o.engine.lay ? await o.engine.lay(part, h.paper.pages) : none) : await typesetOf()
          if (signal.aborted) return
          mine = { doc, groups, lay, part }
          composed = mine
          asOriginal.clear()
          composer?.setDocuments({ original: original?.doc ?? null, composed: doc, groups })
          composer?.setLayer({ part, pages: h.paper.pages }, rowsSource())
          mark('composedOpen')
          emit({ i: 'composed.opened', t })
        } catch {
          if (!signal.aborted) emit({ i: 'composed.failed', t })
        }
      })
      return async () => {
        src.abort()
        // (its own generation taken back; never another ticket's)
        if (composed === mine) {
          composed = null
          composer?.setDocuments({ original: original?.doc ?? null, composed: null, groups: null })
        }
        await task?.destroy()
        kit?.release('composed')
      }
    },
    rows(spec, t, emit, signal) {
      // a retry of the same target keeps every row held, its pages kept, and asks for the missing alone; another target lets the
      // rows before go (the contents' titles with them) and lays the pages again as its rows come
      if (spec.target !== rowsTarget) {
        rows = new Map()
        rowsTarget = spec.target
        asOriginal.clear()
        if (contents?.clearTexts()) outlineSoon()
        rowsDone = false
        composer?.setLayer(composed ? { part: composed.part, pages: head?.paper.pages ?? 0 } : null, rowsSource())
      } else if (rowsDone) {
        // (the same target's rows taken again after their end: a retry, a run our server started again, machine.ts rowsOfDoc. The
        // rows go on, and the pages stand: the composer lays a page again where a row its lay read lands otherwise than it saw
        // it, composer.ts `moved`; a run that restates the rows held lays nothing)
        rowsDone = false
      }
      void (async () => {
        try {
          if (spec.from === 'here' && host.translate) {
            const translate = host.translate.bind(host)
            // the layer's units, those its head names (machine.ts unitsOf: each once), those the paper keeps as they are aside,
            // translated here: the page in view's first, then ahead before behind; a new reading place's asked again first
            // (nearSoon), the paper's title and abstract the context
            const all = await unitsOf(spec.units)
            if (signal.aborted) return
            const units = all.filter((u) => !u.kept)
            const context = contextOf(all, rt.state.title)
            const pending: Row[] = []
            let flushing = 0
            const flush = () => {
              clock.clear(flushing)
              flushing = 0
              if (signal.aborted) return
              if (pending.length) rowsIn(pending.splice(0))
            }
            const take = (r: Row) => {
              pending.push(r)
              if (pending.length >= 16) flush()
              else if (!flushing) flushing = clock.later(flush, 0)
            }
            const nearAc = new AbortController()
            signal.addEventListener('abort', () => nearAc.abort(signal.reason), { once: true })
            const near = nearOf(units)
            nearPage = near.page
            making = {
              units,
              signal: nearAc.signal,
              asked: new Set(),
              run: (want) =>
                void (async () => {
                  try {
                    for await (const r of translate(want, spec.target, { signal: nearAc.signal, context })) {
                      if (nearAc.signal.aborted) return
                      take(r)
                    }
                  } catch {
                    // (a near call's failure is the first call's to tell: it asks for every unit too)
                  }
                })(),
            }
            const order = ranked(missingOf(units, rows), near.ids, near.anchor)
            try {
              for await (const r of translate(order, spec.target, { signal, context })) {
                if (signal.aborted) return
                take(r)
              }
            } finally {
              nearAc.abort()
              if (making?.signal === nearAc.signal) making = null
            }
            if (signal.aborted) return
            flush()
            rowsDone = true
            rowsIn([])
            emit({ i: 'rows.end', t, stopped: stopOf(units, rows) })
            return
          }
          // the server's rows: every ref the documents name for the target, each once, until its run is done or failed (a run
          // not started, `none`, is no end: the prepare's units or the open start it, machine.ts needsOf; one started again after
          // an end is the machine's to take again, rowsOfDoc)
          const read1 = new Set<string>()
          for (;;) {
            const d = rt.state.doc as Doc | null
            const tg = d?.targets[spec.target]
            for (const r of tg?.rows ?? []) {
              if (read1.has(r.sha256)) continue
              read1.add(r.sha256)
              const o2 = JSON.parse(new TextDecoder().decode(await objectOf(r))) as { rows?: Row[] }
              rowsIn(o2.rows ?? [])
            }
            if (
              tg &&
              (tg.state === 'done' || tg.state === 'failed') &&
              (tg.rows ?? []).every((r) => read1.has(r.sha256))
            ) {
              rowsDone = true
              rowsIn([])
              // (a run failed: our server's time for the next, as its document names it, the retry's)
              emit(
                tg.state === 'failed'
                  ? { i: 'rows.failed', t, why: { kind: 'server', retryAt: tg.retryAt ?? null } }
                  : { i: 'rows.end', t },
              )
              return
            }
            await new Promise<void>((resolve, reject) => {
              const off = rt.subscribe(() => {
                off()
                resolve()
              })
              signal.addEventListener(
                'abort',
                () => {
                  off()
                  reject(signal.reason)
                },
                { once: true },
              )
            })
          }
        } catch (e) {
          // (these rows will not come: a page another target still shows goes back to the original's, layer-side.mjs dropOthers)
          if (!signal.aborted) {
            rowsDone = true
            rowsIn([])
          }
          if (!signal.aborted)
            emit({
              i: 'rows.failed',
              t,
              why:
                (e as { why?: string })?.why === 'unconfigured'
                  ? { kind: 'unconfigured', code: 'no-key' }
                  : { kind: 'unavailable' },
            })
        }
      })()
      return undefined
    },
    timer(spec, t, emit) {
      const id = clock.later(() => emit({ i: 'time', t, now: Date.now() }), Math.max(0, spec.at - Date.now()))
      return () => clock.clear(id)
    },
  }
  const effect = (e: Effect) => {
    if (e.e === 'prefs.write') host.prefs.write(e.patch).catch(() => rt.input({ i: 'prefs.refused' }))
  }
  let crashed = false
  let told: ReaderState | null = null,
    tellFrame = 0
  const rt: Runtime = createRuntime({
    state: init({
      paper,
      here: !!host.translate,
      defaults: DEFAULTS,
      visit: o.visit,
      targets: o.engine ? (o.engine.targets ?? null) : TYPESET_TARGETS,
      now: Date.now(),
      visible: document.visibilityState !== 'hidden',
      online: navigator.onLine !== false,
    }),
    handlers,
    effect,
    crash: (e) => {
      crashed = true
      console.error('[reader] the session crashed:', e)
      tellSoon()
    },
  })
  // ---- the objects wanted (the head), and the view following the state
  const fetching = new Set<string>()
  /** what laying the target reads first, asked ahead (warmTypeset) once a composed translation is to be shown (the display
   *  shows it, the reader sets the target: translationShown), once a target; a visit that shows the original asks none of it */
  function warmSoon(s: State) {
    const sv = served,
      code = typesetCode
    if (!sv || !code || !translationShown(s)) return
    const target = targetOf(s)
    if (warmed === target) return
    warmed = target
    void code.then(
      (TS) => {
        if (!closed && served === sv) TS.warmTypeset(sv, target)
      },
      () => {},
    )
  }
  const onState = (s: State) => {
    warmSoon(s)
    // (the layer's units, once its head is read, those it names: the contents' headings, the view's count, and the rows made here
    // read them from the same objects)
    if (s.layer.s === 'ready' && s.layer.head && wanted(s).length) contentsFor(s.layer.head, wanted(s))
    for (const r of wanted(s)) {
      if (s.layer.s !== 'ready' || r.sha256 !== s.layer.catalog.sha256 || fetching.has(r.sha256)) continue
      fetching.add(r.sha256)
      objectOf(s.layer.catalog).then(
        (b) => {
          head = read('head', b, r.sha256) as Head
          if (original?.doc) void original.source.prove(head.original.chunks)
          rt.input({ i: 'head', digest: r.sha256, head })
        },
        (e) => {
          const why = e instanceof Refused ? (e.why as 'gone' | 'bad' | 'network') : 'network'
          // (the paper's objects replaced: the document asked again, once a catalog)
          if (why === 'gone') layerGone(r.sha256)
          else rt.input({ i: 'object.refused', digest: r.sha256, why })
        },
      )
    }
    void ready.then(() => {
      // (the display shown: the one chosen, the original where it is held for the visit)
      panes?.setDisplay(displayOf(s))
      panes?.setSync(s.visit.sync ?? s.prefs.value.sync)
      // (side by side swapped, marked on the root with the display, where the sheets read it: the chrome's and the reader's own)
      panes?.setSwapped(s.prefs.value.swapped)
      composer?.setShown(displayOf(s) !== 'original')
      // (what to translate, shown or hidden in place; the highlight's switch; no layer for the paper: every page the original's)
      composer?.setClasses(s.prefs.value.classes)
      highlight?.setOn(s.prefs.value.highlight.on)
      panes?.noLayer(s.layer.s === 'refused')
    })
    paintBand(s.prefs.value)
    tellSoon()
  }
  /** the band chosen painted (prefs.ts bandPaint): its colour and strength on the root, where the sheet's bands read them on
   *  every pane and page; written where they changed, taken away at the close */
  let painted = ''
  function paintBand(p: Prefs) {
    const paint = bandPaint(p)
    const said = paint ? JSON.stringify(paint) : ''
    if (said === painted || closed) return
    painted = said
    for (const k of BAND_VARS) {
      const v = paint?.[k]
      if (v) root.style.setProperty(k, v)
      else root.style.removeProperty(k)
    }
  }
  const unstate = rt.subscribe(onState)
  onState(rt.state)
  // ---- the preferences and the document's visibility
  host.prefs.read().then(
    (p) => rt.input({ i: 'prefs.read', value: p }),
    () => {},
  )
  const unwatch = host.prefs.watch((p) => rt.input({ i: 'prefs.landed', value: p }))
  const onVisible = () => rt.input({ i: 'env.visible', on: document.visibilityState !== 'hidden' })
  const onOnline = () => rt.input({ i: 'env.online', on: true }),
    onOffline = () => rt.input({ i: 'env.online', on: false })
  // (the page put away into the back-forward cache, and shown from it again: the session put away meanwhile, our server neither
  // followed nor asked, no timer live, and followed anew on return, the panes as they were (today's web session/job.ts putAway,
  // shown). A pagehide that is not persisted is the host's to close the reader on)
  const onHide = (e: PageTransitionEvent) => {
    if (e.persisted) rt.input({ i: 'env.away', on: true })
  }
  const onShow = (e: PageTransitionEvent) => {
    if (e.persisted) rt.input({ i: 'env.away', on: false })
  }
  document.addEventListener('visibilitychange', onVisible)
  addEventListener('online', onOnline)
  addEventListener('offline', onOffline)
  addEventListener('pagehide', onHide)
  addEventListener('pageshow', onShow)
  // ---- what the host reads
  function tellSoon() {
    told = null
    if (tellFrame || closed) return
    tellFrame = clock.later(() => {
      tellFrame = 0
      for (const f of [...listeners]) f()
    }, 0)
  }
  function stateOf(): ReaderState {
    if (told) return told
    const s = rt.state
    // (what the view shown has of the translation and waits for: the layer's units read (while a new layer's are not, those last
    // read, of the layer whose pages are on screen), counted by the rows held, as the run they come from stands and the system
    // still works for it, and our server's look over it: rows.ts toldWait)
    const wait = toldWait(s, {
      units: s.layer.s === 'ready' ? unitsRead : null,
      classes: s.prefs.value.classes,
      // (the rows held are the target's once its rows are taken: another's before that)
      held: rowsTarget === s.rows.target ? rows : new Map(),
      shown: s.layer.s === 'ready',
      laid: s.panes.laid > 0,
    })
    const p = panes as Panes | null
    const look = lookSaid(s)
    const again = againOf(s)
    const self = (on: boolean) => (on ? { self: true as const } : {})
    told = {
      paper: {
        id: paper.id,
        version: paper.version ?? s.doc?.version ?? head?.paper.version ?? null,
        title: s.title,
        html: s.html.s === 'unknown' ? null : (s.html.url ?? null),
        pdf: originalPdfOf(ref),
      },
      prefs: s.prefs.value,
      settings: { s: s.prefs.s, refused: s.prefs.refused },
      original:
        s.original.s === 'open'
          ? { s: 'open', pages: s.original.pages, ours: s.original.pin }
          : s.original.s === 'failed'
            ? { s: 'failed', why: s.original.why, ...self(again.original) }
            : { s: 'opening', loaded: s.original.loaded, total: s.original.total },
      // (the look stopped, or paused from one of the session's asks to the next, with no layer to show: a 429's wait, the network or
      // our server out of reach, as a passing refusal (lookSaid); over a layer shown, its `stopped` where the view lacks what the
      // work would bring; a prepare under way keeps its units, and rows made from them go on)
      layer:
        s.layer.s === 'ready'
          ? {
              s: 'ready',
              laid: s.panes.laid,
              total: head?.paper.pages ?? 0,
              asOriginal: asOriginalNow(),
              ...(wait.stopped
                ? { stopped: { why: wait.stopped.why, retryAt: wait.stopped.retryAt, ...self(wait.stopped.self) } }
                : {}),
            }
          : s.layer.s === 'refused'
            ? { s: 'refused', why: s.layer.why, retryAt: s.layer.retryAt, ...self(again.layer) }
            : look
              ? { s: 'refused', why: look.why, retryAt: look.retryAt, ...self(look.self) }
              : s.layer.s === 'preparing'
                ? { s: 'preparing', stage: s.layer.stage }
                : { s: 'none' },
      // (a failed run the session asks again at once, and rows ended while more comes for the view, are the run the reader waits
      // for: told as arriving, rows.ts rowsTold)
      rows: wait.rows,
      view: {
        display: displayOf(s),
        sync: { on: s.visit.sync ?? s.prefs.value.sync, available: !!p?.doc && syncAvailable },
        scale: p?.scale ?? 1,
        zoom: p?.zoom ?? null,
        narrow: root.hasAttribute('data-axt-narrow'),
        sides: {
          left: { page: p?.pageOf('left') ?? 0, pages: p?.right.pages ?? 0 },
          right: { page: p?.pageOf('right') ?? 0, pages: p?.right.pages ?? 0 },
        },
        outline,
        heading,
      },
      reconnecting: wait.reconnecting,
      network: wait.network,
      faces: facesLost ? 'lost' : null,
      crashed,
    }
    return told
  }
  const held: Command[] = []
  const reader: Reader = {
    state: stateOf,
    subscribe(f) {
      listeners.add(f)
      return () => listeners.delete(f)
    },
    do(c) {
      if (closed) return
      if (c.do === 'set') {
        rt.input({ i: 'cmd.set', prefs: c.prefs })
        return
      }
      if (c.do === 'retry') {
        rt.input({ i: 'cmd.retry' })
        return
      }
      if (c.do === 'hold') {
        rt.input({ i: 'cmd.hold', on: c.on })
        return
      }
      if (c.do === 'original') {
        // (the browser's own viewer of arXiv's file, in a tab of its own: no opener, no referrer)
        window.open(`${originalPdfOf(ref)}${VIEWER_HASH}`, '_blank', 'noopener,noreferrer')
        return
      }
      // (a command on the panes before they exist waits for them, in order; never dropped)
      if (!panes) {
        held.push(c)
        void ready.then(() => {
          const run = held.splice(0)
          for (const x of run) reader.do(x)
        })
        return
      }
      const p = panes
      if (c.do === 'zoom') p.zoomTo(c.to)
      else if (c.do === 'zoomBy') p.zoomBy(c.factor)
      else if (c.do === 'pinch') p.pinch(c.side, c.factor, c.at)
      else if (c.do === 'page') p.goToPage(c.side, c.page)
      else if (c.do === 'lead') p.lead(c.side)
      else if (c.do === 'narrow') p.setNarrow(c.on)
      else if (c.do === 'unit') {
        const l = composer?.member(c.id)?.lines[0]
        if (l) p.goToRect([l[0], l[2], l[6], l[3], l[5]])
      } else if (c.do === 'heading') void goToHeading(c.id)
    },
    probe() {
      const s = rt.state
      return {
        original: s.original.s,
        layer: s.layer.s,
        link: s.link.s,
        rows: s.rows.s,
        live: rt.live.size,
        inputs: rt.counts.inputs,
        dropped: rt.counts.dropped,
        workers: kit?.workers ?? 0,
        storeBytes: store.bytes,
        clockDue: clock.due,
        laidPages: (composer?.probe().laidPages as number) ?? 0,
        lays: (composer?.probe().lays as number) ?? 0,
        lit: highlight?.lit?.id ?? null,
        crashed,
        // (the moments, ms from the open; the open itself, ms from performance's origin, to place them on the page's clock)
        'at.open': Math.round(t0),
        ...Object.fromEntries(Object.entries(moments).map(([k, v]) => [`at.${k}`, v])),
      }
    },
    close() {
      if (closed) return
      closed = true
      unstate()
      unwatch()
      document.removeEventListener('visibilitychange', onVisible)
      removeEventListener('online', onOnline)
      removeEventListener('offline', onOffline)
      removeEventListener('pagehide', onHide)
      removeEventListener('pageshow', onShow)
      void rt.dispose().then(() => {
        panes?.dispose()
        scheduler.dispose()
        kit?.destroy()
        clock.dispose()
        // (what the reader put in the root and the panes taken away; what the host had there stays)
        for (const [el, kept] of had) for (const c of [...el.children]) if (!kept.has(c)) c.remove()
        root.classList.remove('axt-reader')
        for (const a of ['data-axt-pdf-mode', 'data-axt-narrow', 'data-axt-swapped']) root.removeAttribute(a)
        for (const k of BAND_VARS) root.style.removeProperty(k)
      })
      listeners.clear()
    },
  }
  return reader
}
