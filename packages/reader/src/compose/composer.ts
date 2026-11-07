// Composing the right pane (design §4.5 "composing a page"; interfaces/page design-a §2.2, §2.3): what each slot of the right
// stack shows, from the documents open and the pages laid. Today's layer side (src/pdf-reader/engine/view/layer-side.mjs at
// baf2083e0, docs/PDF-READER.md §11.8) carried over the stack: each behaviour with the reason it was found.
//
// - A page not laid is arXiv's: the panes' original content (the left's own drawing while the page waits for its layer, its own
//   page view once it stays the original's, the skeleton with no original), or, by the reader's choice (`unlaid: 'composed'`),
//   the composed document's page with every group on.
// - A laid page is the composed document's page drawn by the same page view with its laid units' groups off (`laid`), under an
//   overlay of the translations (the SVG painter), the elements' and labels' crops, our text layer and our links; a unit of the
//   page that is not laid keeps its groups on and stays arXiv's. It is drawn beside the page shown and swapped in once drawn, in
//   one task (the stack's swap), with its size and the pane's scroll unchanged; its crops drawn again after a zoom.
// - **Laying, one page at a time.** The near pages are laid the page in the middle of the view first (then the pages after it
//   at an equal distance); from a page's commit until it is in place no other page is laid, HOLD_MS at most, so that the page
//   the reader waits on is shown first (layer-side.mjs `hold`). A page commits when nothing it waits for is missing: its rows,
//   or its faces (asked in one wave for the near pages, the middle page first, each page laid again once its own are in; a page
//   still waiting for rows asks meanwhile those of the rows it has). Committed is final: a late row changes nothing on screen
//   until the language, the toggles or the paper change.
// - **What stays the original's.** A page with no part (no layout), a page laid with nothing hidden, a page whose part or lay
//   or drawing failed (asked again on a zoom, coming near or the next scroll), a page whose drawing is not in place PAGE_MS after
//   its commit (one warning; asked again on the next scroll), and a member whose groups the composed document does not hold.
//   The panes are told (`settle`), so that such a page is drawn by its own page view, its text layer and links its own.
// - **Another target, the toggles, again** (a generation): every page laid again from the same parts and the same composed
//   document; a near laid page keeps its drawing (the target before's) until the new one's commits, muted meanwhile (nothing of
//   it lit or hit); one the new generation lays with nothing, or fails, the original's; the drawings kept off the view, the
//   generation before's, let go. The left pane is not touched.
// - **Translating marks** on near pages not laid (marks.ts).
// - **The pages ahead**: once the rows have ended, the AHEAD_PAGES pages past the near ones the way the reader moves, laid and
//   drawn into drawings kept off the view at background priority while the view's own pages hold nothing, so that the reader
//   reaching one finds it put back at once.
import type { Part, Placed, Row } from '@readarxiv/format'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { ClassName } from '../prefs.ts'
import type { Kit } from '../pdfjs/kit.ts'
import type { Clock } from '../stack/clock.ts'
import type { PageContent, SlotAt, Stack } from '../stack/stack.ts'
import { kindShown, sameClasses } from './classes.ts'
import type { Faces } from './faces.ts'
import type { Groups } from './groups.ts'
import { bordersOf, type LinkHooks, linkLayer } from './links.ts'
import { createMarks, type MarkBox } from './marks.ts'
import { committed, type Lay, type Laid, type Page, type Rows } from './page.ts'
import { cropsFor, svgOf, turned, uprightOf } from './paint.ts'
import { canvasMeasure, laidText, releaseText, type TextContent, textContentOf, textLayerOf } from './text.ts'

/** the laid pages a reader keeps, at most (a page's Page is some kilobytes; past it the least recently shown is let go) */
export const PAGES_KEPT = 600
/** how long a page's drawing, once committed, may take to be put in place before its slot shows the original's page
 *  (layer-side.mjs PAGE_MS) */
export const PAGE_MS = 30_000
/** the longest a page's commit holds the laying of the next (reader.mjs HOLD_MS) */
export const HOLD_MS = 2000
/** how many pages past the near ones are laid ahead, the way the reader moves (layer-side.mjs AHEAD_PAGES) */
export const AHEAD_PAGES = 2
/** how long the near pages stay where they are before a window ahead is begun (layer-side.mjs AHEAD_SETTLE_MS) */
export const AHEAD_SETTLE_MS = 150

export interface Layer {
  /** page n's part, or null: nothing to lay there (the page is A) */
  part(n: number): Promise<Part | null>
  readonly pages: number
}
export interface RowsSource extends Rows {
  readonly target: string
  /** told each time a row (or the end) arrives */
  on(f: () => void): () => void
}

export interface ComposerEvents {
  /** page n committed (its translation shown) or let go back to arXiv's */
  laid: { n: number; page: Page | null }
  /** the first page laid of a layer and target */
  first: { n: number }
}

export interface Composer {
  /** the documents the right draws: the original (until the composed opens, and under `unlaid: 'original'` for pages not
   *  laid), the composed one with its groups */
  setDocuments(d: { original: PDFDocumentProxy | null; composed: PDFDocumentProxy | null; groups: Groups | null }): void
  /** the layer (its parts) and the rows of the target shown: pages near laid now. Another target over the same layer is laid
   *  in place (the pages before kept until their new commits) */
  setLayer(layer: Layer | null, rows: RowsSource | null): void
  /** what the reader translates ("What to translate"): shown or hidden in place, nothing fetched or translated again */
  setClasses(classes: Readonly<Record<ClassName, boolean>> | null): void
  /** whether the right shows translations (the display) */
  setShown(on: boolean): void
  /** page n's committed Page, or null */
  laid(n: number): Page | null
  /** the Page laid for page n now (committed or waiting), or null */
  page(n: number): Page | null
  /** whether page n shows a drawing of another generation (another target's, the toggles' before), nothing of it lit or hit */
  muted(n: number): boolean
  /** whether page n stays the original's for now */
  settled(n: number): boolean
  /** every member of the layer laid so far, by ord (the parts' Placed) */
  member(ord: number): Placed | null
  on<K extends keyof ComposerEvents>(type: K, f: (e: ComposerEvents[K]) => void): () => void
  probe(): Record<string, number | string>
  /** the last overlays' timings (ms) */
  timings(): readonly { n: number; svgMs: number; cropsMs: number; textMs: number; overlayMs: number }[]
  dispose(): void
}

export interface ComposerOptions {
  stack: Stack
  kit: Kit
  faces: Faces
  lay: Lay
  unlaid: 'original' | 'composed'
  /** the target's language tag for the text layer */
  lang(): string
  links: LinkHooks
  /** the reader's clock (default the browser's timers) */
  clock?: Clock
  /** the reader's root (the marks read the sheet's paddings there) */
  root?: HTMLElement
  /** what the right shows of a page not laid (the panes' originalOf); default its own page view of the original */
  original?(n: number, settled: boolean): PageContent | null
  /** the panes told which pages stay the original's */
  settle?(fn: ((n: number) => boolean) | null): void
  /** the pages ahead of the view let go (the layer's first page in place, a near page settled as the original's) */
  aheadGo?(): void
  /** whether the left pane is drawing page n (the pages ahead wait for the view's own pages) */
  leftDrawing?(n: number): boolean
  /** the reader's "What to translate" at the start (none: the defaults) */
  classes?: Readonly<Record<ClassName, boolean>> | null
  /** the pages laid ahead past the near ones (a host's own; 0 lays none) */
  ahead?: number
  warn?(what: string, e: unknown): void
}

interface Commit {
  page: Page
  tick: number
  gen: number
  /** shown in its slot (its drawing put in place) */
  shown: boolean
}
interface PageRec {
  failed: boolean
  stalled: boolean
  /** laid with nothing of its own, or no part: the original's by the rule */
  nothing: boolean
  /** the stall clock, from the commit to the drawing in place */
  clock: number
}

const browserTimers: Clock = {
  now: () => performance.now(),
  later: (f, ms) => setTimeout(f, ms) as unknown as number,
  clear: (id) => clearTimeout(id),
  frame: (f) => requestAnimationFrame(() => f()),
  cancel: (id) => cancelAnimationFrame(id),
}
const keyOf = (c: Commit) => `laid:${c.tick}`

export function createComposer(o: ComposerOptions): Composer {
  const { stack, faces } = o
  const clock = o.clock ?? browserTimers
  const aheadPages = typeof o.ahead === 'number' && o.ahead >= 0 ? Math.floor(o.ahead) : AHEAD_PAGES
  let original: PDFDocumentProxy | null = null,
    composed: PDFDocumentProxy | null = null,
    groups: Groups | null = null
  let layer: Layer | null = null,
    rows: RowsSource | null = null,
    unrows: (() => void) | null = null
  let classes: Readonly<Record<ClassName, boolean>> | null = o.classes ?? null
  let shown = true,
    gen = 0,
    disposed = false
  /** the parts read (a promise each, by page), the Page of each page laid this generation, the committed ones */
  const parts = new Map<number, Promise<Part | null>>()
  const pages = new Map<number, Page>()
  const commits = new Map<number, Commit>()
  const members = new Map<number, Placed>()
  /** each unit's kind, by its id (the toggles read it) */
  const kindOf = new Map<string, string>()
  const recs = new Map<number, PageRec>()
  const rec = (n: number): PageRec => {
    let P = recs.get(n)
    if (!P) {
      P = { failed: false, stalled: false, nothing: false, clock: 0 }
      recs.set(n, P)
    }
    return P
  }
  /** A's text content of each page of the composed document (the same for every target) */
  const texts = new Map<number, Promise<TextContent>>()
  let tick = 0,
    firstTold = false
  const counts = { lays: 0, commits: 0, uncommits: 0, overlays: 0, stalls: 0, failures: 0, ahead: 0, aheadKept: 0 }
  const timings: { n: number; svgMs: number; cropsMs: number; textMs: number; overlayMs: number }[] = []
  const measure = canvasMeasure()
  const listeners = new Map<keyof ComposerEvents, Set<(e: unknown) => void>>()
  const tell = <K extends keyof ComposerEvents>(type: K, e: ComposerEvents[K]) => {
    for (const f of [...(listeners.get(type) ?? [])]) {
      try {
        f(e)
      } catch (err) {
        o.warn?.(`a ${type} listener`, err)
      }
    }
  }
  const warned = new Set<string>()
  const warnOnce = (what: string, e: unknown) => {
    if (warned.has(what)) return
    warned.add(what)
    o.warn?.(what, e)
  }
  const marks = createMarks({ root: o.root ?? document.documentElement, clock })

  // ---------------------------------------------------------------- the rows a lay reads: a unit of a kind the toggles hide
  // reads as no translation (it stays the original's), whatever was translated
  const rowsView: Rows = {
    get(id) {
      const k = kindOf.get(id)
      if (k !== undefined && !kindShown(k, classes)) return { id, ok: false, why: { kind: 'refused' } } as Row
      return rows?.get(id)
    },
    get done() {
      return rows?.done ?? false
    },
    kept: (id) => rows?.kept?.(id) ?? false,
  }
  /** the rows as if they had ended: what a page waiting for rows reads to ask the faces of the rows in (never committed) */
  const endedView: Rows = { get: (id) => rowsView.get(id), done: true, kept: rowsView.kept }

  // ---------------------------------------------------------------- what a slot shows
  const originalOf = (n: number, isSettled: boolean): PageContent | null => {
    if (o.unlaid === 'composed' && composed && groups)
      return { key: 'composed', doc: composed, config: groups.allOn, own: true, over: null }
    const c = o.original?.(n, isSettled)
    if (c !== undefined) return c
    const doc = original ?? composed
    if (!doc) return null
    return { key: 'original', doc, config: doc === composed && groups ? groups.allOn : null, own: true, over: null }
  }
  stack.contentOf = (n) => {
    const c = commits.get(n)
    if (c && composed && groups && shown) {
      const doc = composed,
        g = groups,
        page = c.page
      return {
        key: keyOf(c),
        doc,
        config: g.laid,
        own: false,
        over: (at) => overlay(n, page, doc, g, at),
        again: (el, at) => cropsAgain(page, doc, g, el, at),
        free: releaseText,
      }
    }
    return originalOf(n, settledOriginal(n))
  }
  /** whether page n stays the original's for now: it failed, stalled, has no part or was laid with nothing */
  function settledOriginal(n: number): boolean {
    if (disposed) return true
    const P = recs.get(n)
    return !!(P && (P.failed || P.stalled || P.nothing))
  }
  o.settle?.((n) => settledOriginal(n))
  /** page n settled as the original's (a failure, a stall, the rule): its slot drawn by its own page view; the pages ahead
   *  wait for it no more where it is near */
  function settledNow(n: number) {
    marks.unmark(n)
    if (stack.near(n)) o.aheadGo?.()
    stack.refresh(n)
  }

  /** the overlay of a committed page over its page view: made in the drawing's turn, before the swap */
  async function overlay(n: number, page: Page, doc: PDFDocumentProxy, g: Groups, at: SlotAt) {
    counts.overlays++
    const t0 = performance.now()
    // (each face with the texts it draws: a served face's slices are those texts')
    const drawn = new Map<string, string>()
    for (const m of page.members)
      for (const [, , , items] of m.lines)
        for (const it of items) if ('face' in it) drawn.set(it.face, (drawn.get(it.face) ?? '') + it.s)
    await faces.ready([...drawn])
    const el = document.createElement('div')
    el.className = 'axt-over'
    // (the frame is the page's own, unturned: rawDims; a turned page's drawing is made in it and turned with the page, the text
    // layer by PDF.js as it turns its own)
    const raw = (at.viewport as unknown as { rawDims: { pageWidth: number; pageHeight: number } }).rawDims
    el.style.setProperty('--axt-frame-w', `calc(var(--total-scale-factor) * ${raw.pageWidth}px)`)
    el.style.setProperty('--axt-frame-h', `calc(var(--total-scale-factor) * ${raw.pageHeight}px)`)
    const up = uprightOf(at.viewport)
    el.append(turned(svgOf(page, at.viewport, faces), at.viewport))
    const tSvg = performance.now()
    const pdfPage = await doc.getPage(n)
    const out = (at.view as unknown as { outputScale?: { sx: number; sy: number } }).outputScale ?? { sx: 1, sy: 1 }
    const crops = await cropsFor(page, pdfPage, up, g.crops, out, at.signal)
    if (crops) el.append(turned(crops, at.viewport))
    const tCrops = performance.now()
    const text = texts.get(n) ?? textContentOf(pdfPage)
    texts.set(n, text)
    const laid = laidText(await text, page, members, faces, measure)
    el.append(await textLayerOf(o.kit, laid.content, at.viewport, o.lang(), laid.translated))
    const links = linkLayer(page, up, o.links, laid.content, page.links.length ? await bordersOf(pdfPage) : [])
    if (links) el.append(turned(links, at.viewport))
    const tEnd = performance.now()
    timings.push({ n, svgMs: tSvg - t0, cropsMs: tCrops - tSvg, textMs: tEnd - tCrops, overlayMs: tEnd - t0 })
    if (timings.length > 64) timings.shift()
    return el
  }
  /** a laid page's crops drawn again at its page view's new resolution (a zoom): kept where it is at the resolution a crop
   *  render now would be at */
  async function cropsAgain(page: Page, doc: PDFDocumentProxy, g: Groups, el: HTMLElement, at: SlotAt) {
    const was = el.querySelector<HTMLCanvasElement>(':scope > canvas.axt-crops')
    if (!was) return
    const out = (at.view as unknown as { outputScale?: { sx: number; sy: number } }).outputScale ?? { sx: 1, sy: 1 }
    const up = uprightOf(at.viewport)
    const w = Math.max(1, Math.floor(up.width * out.sx))
    if (was.width === w) return
    const next = await cropsFor(page, await doc.getPage(at.n), up, g.crops, out, at.signal)
    if (!next || at.signal.aborted || was.parentNode !== el) return
    was.replaceWith(turned(next, at.viewport))
    was.width = 0
    was.height = 0
  }

  // ---------------------------------------------------------------- laying, one page at a time
  const queue = new Set<number>()
  let pumping = false,
    pumpQueued = false
  /** the commit holding the next lay (until its drawing is in place, HOLD_MS at most) */
  let holding: { n: number; key: string; timer: number } | null = null
  /** the faces the pages laid this round wait for, asked in one wave once the round is laid */
  const wave = new Map<number, readonly (readonly [string, string])[]>()
  function partFor(n: number): Promise<Part | null> {
    let p = parts.get(n)
    if (!p && layer) {
      const l = layer
      p = l.part(n).then((part) => {
        if (part && layer === l)
          for (const f of part.flows)
            for (const m of f)
              if (!members.has(m.ord)) {
                members.set(m.ord, m)
                if (typeof m.text === 'string') kindOf.set(m.text, m.kind)
              }
        return part
      })
      // (a part that cannot be read is asked again on a zoom, coming near or the next scroll)
      p.catch(() => {
        if (parts.get(n) === p) parts.delete(n)
      })
      parts.set(n, p)
    }
    return p ?? Promise.resolve(null)
  }
  function askLay(n: number) {
    if (disposed || !layer || !rows || !composed) return
    const c = commits.get(n)
    if (c && c.gen === gen) return
    void partFor(n).catch(() => {})
    queue.add(n)
    // (a page of the view asked: the pages ahead give the line, the thread and the hold up to it, begun again once the view's
    // pages are in place)
    if (stack.near(n)) stopAhead()
    if (pumpQueued) return
    pumpQueued = true
    queueMicrotask(() => {
      pumpQueued = false
      void pump()
    })
  }
  /** the next page to lay: the nearest the middle of the view, the page after it first at an equal distance */
  function pick(): number {
    const c = stack.centre()
    let best = 0,
      far = Number.POSITIVE_INFINITY
    for (const n of queue) {
      const d = c ? Math.abs(n - c) * 2 + (n < c ? 1 : 0) : n
      if (d < far) {
        far = d
        best = n
      }
    }
    return best
  }
  async function pump() {
    if (pumping || disposed) return
    pumping = true
    try {
      while (queue.size && !holding && !disposed) {
        const n = pick()
        queue.delete(n)
        if (!stack.near(n)) continue
        await layNow(n)
      }
    } finally {
      pumping = false
    }
    if (!holding && !queue.size) flushWave()
    aheadSoon()
  }
  /** page n laid in this generation, committed where nothing is waited for */
  async function layNow(n: number) {
    const mine = gen
    if (!layer || !rows || !composed || !groups) return
    const c = commits.get(n)
    if (c && c.gen === gen) return
    const P = rec(n)
    let part: Part | null
    try {
      part = await partFor(n)
    } catch (e) {
      if (mine !== gen || disposed) return
      warnOnce('a page of the layer', e)
      failed(n)
      return
    }
    if (mine !== gen || disposed) return
    if (!part) {
      // (no part: the page is arXiv's, as the owner decided; a page the generation before laid goes back to it)
      P.nothing = true
      if (commits.has(n)) uncommit(n)
      settledNow(n)
      return
    }
    counts.lays++
    let page: Page
    try {
      page = held(o.lay(part, rowsView))
    } catch (e) {
      warnOnce('a page laid', e)
      failed(n)
      return
    }
    pages.set(n, page)
    if (page.wait.faces.length) {
      wave.set(n, page.wait.faces)
      return
    }
    if (!committed(page)) {
      early(n, part)
      markSoon()
      return
    }
    // (a page that hides nothing is never put in place: arXiv's page stays, never the composed page in its place)
    if (!page.members.some((m) => m.state === 'laid' && m.off)) {
      P.nothing = true
      if (commits.has(n)) uncommit(n)
      settledNow(n)
      return
    }
    commit(n, page)
  }
  /** the page with every member whose groups the composed document does not hold made the original's (its ink would stay
   *  under its translation) */
  function held(page: Page): Page {
    const g = groups
    if (!g?.size) return page
    let changed = false
    const out = page.members.map((m): Laid => {
      if (m.state !== 'laid' || !m.off || g.holds(m.ord, page.page, m.off)) return m
      changed = true
      return { ...m, state: 'unwrapped', off: 0, lines: [], lit: { left: m.lit.left, right: m.lit.left, own: [] } }
    })
    return changed ? { ...page, members: out } : page
  }
  /** the rows page n still waited for when the faces of its rows in were last asked (`early`) */
  const earlyLeft = new Map<number, number>()
  /** a near page waiting for rows: the faces of the rows it has asked meanwhile, as it would wait for them were the rows ended
   *  (that lay is never committed), so that its slices come while the rest of its rows do, not after its last one (staging,
   *  2026-11-08: 2611.07042v1's page 1 had 32 of its 39 rows at 27 s and its last at 44.5 s, and only then asked its 49 slices,
   *  2.5 MB, in 16 s). Asked again only once more of its rows are in */
  function early(n: number, part: Part) {
    const left = pages.get(n)?.wait.rows.length ?? 0
    if (!left || rows?.done || (earlyLeft.get(n) ?? Number.POSITIVE_INFINITY) <= left) return
    earlyLeft.set(n, left)
    let want: Page['wait']['faces']
    try {
      want = o.lay(part, endedView).wait.faces
    } catch {
      return
    }
    if (want.length) wave.set(n, want)
  }
  /** the faces the round's pages wait for, asked in one wave in the view's order (the page in the middle first), each page laid
   *  again once its own faces are in: never held by another page's (staging, 2026-11-08: 2611.07042v1's page 1, whose own
   *  faces were 49 slices, 2.5 MB, waited for the 64 of its wave, 3.9 MB) */
  function flushWave() {
    if (!wave.size) return
    const c = stack.centre() || 1
    const order = [...wave.keys()].sort((a, b) => Math.abs(a - c) - Math.abs(b - c) || b - a)
    const mine = gen
    // (each page's faces asked in that order: a slice another page asked first is read once, and this page waits for it too;
    // its loads not begun let go once the page is not near or its generation is gone, its early asks too)
    for (const n of order) {
      const wanted = () => !disposed && mine === gen && stack.near(n)
      void faces.ready(wave.get(n) ?? [], wanted).then(() => {
        if (wanted()) askLay(n)
      })
    }
    wave.clear()
  }
  function failed(n: number) {
    const P = rec(n)
    P.failed = true
    counts.failures++
    if (commits.has(n)) uncommit(n)
    settledNow(n)
  }
  function commit(n: number, page: Page) {
    if (!groups) return
    groups.set(page)
    const c: Commit = { page, tick: ++tick, gen, shown: false }
    commits.set(n, c)
    counts.commits++
    // (the pages kept: the oldest committed far from the view let go past the bound, its groups back on)
    if (commits.size > PAGES_KEPT)
      for (const [k] of commits) {
        if (commits.size <= PAGES_KEPT) break
        if (!stack.near(k)) uncommit(k)
      }
    const P = rec(n)
    clock.clear(P.clock)
    P.clock = 0
    if (stack.near(n)) {
      // (the stall clock runs from the commit to the drawing in place: a page still waiting for its part or rows is never one)
      P.clock = clock.later(() => stalled(n, c), PAGE_MS)
      clock.clear(holding?.timer ?? 0)
      holding = { n, key: keyOf(c), timer: clock.later(() => letHoldGo(), HOLD_MS) }
    }
    stack.refresh(n)
    tell('laid', { n, page })
    if (!firstTold) {
      firstTold = true
      tell('first', { n })
    }
  }
  function letHoldGo() {
    if (!holding) return
    clock.clear(holding.timer)
    holding = null
    void pump()
  }
  /** a commit not in place PAGE_MS later: the original's page, one warning a reader, asked again on the next scroll */
  function stalled(n: number, c: Commit) {
    const P = rec(n)
    P.clock = 0
    if (commits.get(n) !== c || c.shown || disposed) return
    P.stalled = true
    counts.stalls++
    rearm.add(n)
    warnOnce('wait', new Error(`page ${n} was not in place within ${PAGE_MS} ms: its slot shows the original's page`))
    uncommit(n)
    if (holding?.n === n) letHoldGo()
    settledNow(n)
  }
  const rearm = new Set<number>()
  function uncommit(n: number) {
    const c = commits.get(n)
    if (!c) return
    commits.delete(n)
    const P = recs.get(n)
    if (P?.clock) {
      clock.clear(P.clock)
      P.clock = 0
    }
    // (the groups of a page another generation still shows stay as they are until it goes)
    groups?.clear(n)
    counts.uncommits++
    stack.refresh(n)
    tell('laid', { n, page: null })
    if (holding?.n === n) letHoldGo()
  }
  /** the pages near the right's view laid */
  function layNear() {
    for (let n = 1; n <= stack.pages; n++) if (stack.near(n)) askLay(n)
    markSoon()
  }

  // ---------------------------------------------------------------- a generation: another target, the toggles, another layer
  function newGeneration() {
    gen++
    firstTold = false
    stopAhead()
    aheadNothing.clear()
    queue.clear()
    wave.clear()
    earlyLeft.clear()
    if (holding) clock.clear(holding.timer)
    holding = null
    pages.clear()
    rearm.clear()
    for (const P of recs.values()) {
      clock.clear(P.clock)
      P.clock = 0
      P.failed = false
      P.stalled = false
      P.nothing = false
    }
    // (the drawings kept off the view are the generation before's; a laid page not in place yet is let go with its drawing:
    // nothing the run before lays or draws is put in place)
    stack.dropKept()
    for (const [n, c] of [...commits]) if (!(c.shown && stack.near(n) && stack.showing(n) === keyOf(c))) uncommit(n)
    stack.refresh()
    layNear()
  }

  // ---------------------------------------------------------------- the translating marks (marks.ts)
  let markQueued = false
  function markSoon() {
    if (markQueued || disposed) return
    markQueued = true
    queueMicrotask(() => {
      markQueued = false
      for (const n of marks.pages()) if (!stack.near(n)) marks.unmark(n)
      for (let n = 1; n <= stack.pages; n++) if (stack.near(n)) markPage(n)
    })
  }
  /** page n's marks: over each paragraph the parts read so far locate on it, while the page is not laid and can still be (the
   *  layer open, the page not settled as the original's): none for a unit whose class the toggles hide, nor for one the paper
   *  keeps as it is (never translated), nor for one whose rows ended with no row of it (it stays the original's) */
  function markPage(n: number) {
    const slot = stack.page(n)
    if (disposed || !layer || !rows || !composed || !shown || !slot || settledOriginal(n)) return marks.unmark(n)
    if (stack.showing(n)?.startsWith('laid:')) return marks.unmark(n)
    const boxes: MarkBox[] = []
    for (const m of members.values()) {
      if (m.why === 'unlocated' || m.why === 'page' || !kindShown(m.kind, classes)) continue
      if (typeof m.text === 'string' && rowsView.kept?.(m.text)) continue
      if (rows.done && (typeof m.text !== 'string' || !rowsView.get(m.text)?.ok)) continue
      let x0 = Number.POSITIVE_INFINITY,
        y0 = Number.POSITIVE_INFINITY,
        x1 = Number.NEGATIVE_INFINITY,
        y1 = Number.NEGATIVE_INFINITY
      for (const l of m.lines) {
        if (l[0] !== n) continue
        x0 = Math.min(x0, l[2])
        x1 = Math.max(x1, l[3])
        y0 = Math.min(y0, l[6])
        y1 = Math.max(y1, l[5])
      }
      if (x1 > x0 && y1 > y0) boxes.push({ id: String(m.ord), box: [x0, y0, x1, y1] })
    }
    const vp = stack.viewport(n)
    marks.mark(n, slot, (vp?.viewBox as number[] | undefined) ?? null, vp?.rotation ?? 0, boxes)
  }

  // ---------------------------------------------------------------- the pages ahead (layer-side.mjs layAhead)
  let aheadAc: AbortController | null = null,
    aheadDir = 1,
    nearLo = 0,
    nearHi = 0,
    nearAt = 0,
    nearQueued = false
  const aheadNothing = new Set<number>()
  function nearSpan(): [number, number] {
    let lo = 0,
      hi = 0
    for (let n = 1; n <= stack.pages; n++)
      if (stack.near(n)) {
        if (!lo) lo = n
        hi = n
      }
    return [lo, hi]
  }
  function aheadWindow(): number[] {
    const [lo, hi] = nearSpan(),
      out: number[] = []
    if (!lo) return out
    for (let k = 1; k <= aheadPages; k++) {
      const m = aheadDir > 0 ? hi + k : lo - k
      if (m >= 1 && m <= stack.pages) out.push(m)
    }
    return out
  }
  /** the near pages moved: the way the reader moves told by the edge of the near run that moved past where it was (a run
   *  that shares no page with the one before is a jump, read on forward); a run under way given up where it turned */
  function nearMoved() {
    if (nearQueued || disposed) return
    nearQueued = true
    queueMicrotask(() => {
      nearQueued = false
      const [lo, hi] = nearSpan()
      if (!lo) return
      const dir = !nearLo || lo > nearHi || hi < nearLo ? 1 : hi > nearHi ? 1 : lo < nearLo ? -1 : aheadDir
      if (lo !== nearLo || hi !== nearHi) nearAt = clock.now()
      nearLo = lo
      nearHi = hi
      if (dir !== aheadDir) stopAhead()
      aheadDir = dir
      aheadSoon()
    })
  }
  /** whether the view's own pages hold the line or the thread: a page to lay or being put in place, or a near page drawn now on
   *  either pane */
  function viewBusy(): boolean {
    if (queue.size || pumping || holding || wave.size) return true
    const [lo, hi] = nearSpan()
    for (let n = lo; n && n <= hi; n++) if (stack.drawing(n) || o.leftDrawing?.(n)) return true
    return false
  }
  const aheadOk = () =>
    !disposed &&
    aheadPages > 0 &&
    !!layer &&
    !!rows?.done &&
    !!composed &&
    shown &&
    stack.centre() > 0 &&
    globalThis.document?.visibilityState !== 'hidden'
  function aheadSoon() {
    if (aheadAc || !aheadOk() || viewBusy()) return
    void layAhead()
  }
  function stopAhead() {
    aheadAc?.abort()
    aheadAc = null
  }
  const later = (ms: number, signal: AbortSignal) =>
    new Promise<void>((ok, no) => {
      if (signal.aborted) return no(signal.reason)
      const t = clock.later(() => ok(), ms)
      signal.addEventListener(
        'abort',
        () => {
          clock.clear(t)
          no(signal.reason)
        },
        { once: true },
      )
    })
  /** a turn of the main thread at background priority (scheduler.postTask's, once nothing of a higher priority waits; a task
   *  where the browser has no scheduler): not an idle callback, which Chromium gives no page while the reader scrolls */
  const backgroundTurn = (signal: AbortSignal) =>
    new Promise<void>((ok, no) => {
      if (signal.aborted) return no(signal.reason)
      const S = (globalThis as { scheduler?: { postTask?: (f: () => void, o: unknown) => Promise<unknown> } }).scheduler
      if (typeof S?.postTask === 'function') S.postTask(ok, { priority: 'background', signal }).catch(no)
      else {
        const t = clock.later(() => ok(), 0)
        signal.addEventListener('abort', () => {
          clock.clear(t)
          no(signal.reason)
        })
      }
    })
  async function layAhead() {
    const ac = new AbortController(),
      mine = gen
    aheadAc = ac
    const live = () => !ac.signal.aborted && !disposed && mine === gen && aheadOk()
    try {
      for (;;) {
        for (let wait = nearAt + AHEAD_SETTLE_MS - clock.now(); wait > 0; wait = nearAt + AHEAD_SETTLE_MS - clock.now())
          await later(wait, ac.signal)
        await backgroundTurn(ac.signal)
        if (!live() || viewBusy()) return
        const ms = aheadWindow().filter((q) => {
          const c = commits.get(q)
          return !stack.near(q) && !(c && c.gen === gen) && !aheadNothing.has(q) && !settledOriginal(q)
        })
        if (!ms.length) return
        for (const m of ms) {
          counts.ahead++
          let part: Part | null
          try {
            part = await partFor(m)
          } catch {
            aheadNothing.add(m)
            continue
          }
          if (!live()) return
          if (stack.near(m)) {
            askLay(m)
            return
          }
          const page = part ? held(o.lay(part, rowsView)) : null
          if (!page || !committed(page) || !page.members.some((x) => x.state === 'laid' && x.off)) {
            aheadNothing.add(m)
            continue
          }
          pages.set(m, page)
          await backgroundTurn(ac.signal)
          if (!live() || viewBusy()) return
          commit(m, page)
          const kept = await stack.ahead(m, ac.signal)
          if (!live()) return
          if (kept) counts.aheadKept++
          // (a drawing the keep budget let go, or that failed: not laid ahead again while the window stays)
          else aheadNothing.add(m)
        }
      }
    } catch {
      // (given up: its wait for a turn aborted)
    } finally {
      ac.abort()
      if (aheadAc === ac) aheadAc = null
    }
  }

  // ---------------------------------------------------------------- the stack's events
  const offs = [
    stack.on('near', ({ n, on }) => {
      if (on) {
        // (a page that failed is asked again on coming near)
        const P = recs.get(n)
        if (P?.failed) {
          P.failed = false
          stack.refresh(n)
        }
        askLay(n)
      } else {
        queue.delete(n)
        marks.unmark(n)
      }
      markSoon()
      nearMoved()
    }),
    stack.on('shown', ({ n, key }) => {
      const c = commits.get(n)
      if (!c || keyOf(c) !== key) return
      // (its marks go in the task its drawing is put in place)
      marks.unmark(n)
      c.shown = true
      const P = recs.get(n)
      if (P?.clock) {
        clock.clear(P.clock)
        P.clock = 0
      }
      // (the layer's first page in place: the pages ahead draw the original's pages now)
      o.aheadGo?.()
      if (holding?.n === n) letHoldGo()
      else aheadSoon()
    }),
    stack.on('failed', ({ n, key }) => {
      const c = commits.get(n)
      if (!c || keyOf(c) !== key) return
      warnOnce('a page drawn', new Error(`page ${n}'s drawing failed: its slot shows the original's page`))
      rearm.add(n)
      failed(n)
      if (holding?.n === n) letHoldGo()
    }),
    stack.on('scale', () => {
      // (a page that failed asked again on a zoom)
      for (const [n, P] of recs)
        if (P.failed && stack.near(n)) {
          P.failed = false
          stack.refresh(n)
          askLay(n)
        }
    }),
  ]
  const onScroll = () => {
    // (the pages given up at PAGE_MS, and the failed, asked again on the next scroll where they are near)
    if (!rearm.size) return
    const again = [...rearm]
    rearm.clear()
    for (const n of again) {
      const P = rec(n)
      P.stalled = false
      P.failed = false
      if (stack.near(n)) {
        stack.refresh(n)
        askLay(n)
      }
    }
  }
  const scroller = stack.element.parentElement
  scroller?.addEventListener('scroll', onScroll, { passive: true })

  return {
    setDocuments(d) {
      original = d.original
      if (composed !== d.composed) {
        texts.clear()
        for (const n of [...commits.keys()]) uncommit(n)
      }
      composed = d.composed
      groups = d.groups
      stack.refresh()
      layNear()
    },
    setLayer(next, nextRows) {
      // (the same layer whatever object carries it: its parts are read once)
      if (layer?.part !== next?.part) {
        parts.clear()
        members.clear()
        kindOf.clear()
      }
      layer = next
      unrows?.()
      rows = nextRows
      unrows =
        rows?.on(() => {
          // (a row in: the pages waiting laid again, and the pages another generation still shows where these rows have
          // ended; a committed page is final)
          for (const [n, p] of pages) {
            const c = commits.get(n)
            if ((!c || c.gen !== gen) && !committed(p) && stack.near(n)) askLay(n)
          }
          if (rows?.done) for (const [n, c] of commits) if (c.gen !== gen) askLay(n)
          markSoon()
          aheadSoon()
        }) ?? null
      newGeneration()
    },
    setClasses(next) {
      if (sameClasses(next, classes)) return
      classes = next
      if (layer && rows) newGeneration()
      else markSoon()
    },
    setShown(on) {
      if (shown === on) return
      shown = on
      for (const n of commits.keys()) stack.refresh(n)
      markSoon()
      if (!on) stopAhead()
    },
    laid: (n) => commits.get(n)?.page ?? null,
    page: (n) => pages.get(n) ?? commits.get(n)?.page ?? null,
    muted: (n) => {
      const c = commits.get(n)
      return !!c && c.gen !== gen
    },
    settled: (n) => settledOriginal(n),
    member: (ord) => members.get(ord) ?? null,
    on(type, f) {
      const set = listeners.get(type) ?? new Set()
      listeners.set(type, set)
      set.add(f as (e: unknown) => void)
      return () => set.delete(f as (e: unknown) => void)
    },
    timings: () => timings,
    probe() {
      return {
        laidPages: commits.size,
        pagesLaid: pages.size,
        parts: parts.size,
        ...counts,
        gen,
        muted: [...commits].filter(([, c]) => c.gen !== gen).length,
        marked: marks.pages().length,
        aheadRunning: aheadAc ? 1 : 0,
        busy: viewBusy() ? 1 : 0,
        aheadOk: aheadOk() ? 1 : 0,
        target: rows?.target ?? '',
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const f of offs) f()
      scroller?.removeEventListener('scroll', onScroll)
      unrows?.()
      stopAhead()
      if (holding) clock.clear(holding.timer)
      for (const P of recs.values()) clock.clear(P.clock)
      marks.dispose()
      o.settle?.(null)
      commits.clear()
      pages.clear()
      listeners.clear()
    },
  }
}

export type { Laid }
