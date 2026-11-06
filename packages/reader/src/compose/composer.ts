// Composing the right pane (design §4.5 "composing a page"; interfaces/page design-a §2.2, §2.3): what each slot of the right
// stack shows, from the documents open and the pages laid.
//
// - A page not laid is arXiv's: the composed document's page with every group on (`allOn`), or, by the reader's choice
//   (`unlaid: 'original'`), the original document's page itself, so that a page with no translation is arXiv's file drawn as the
//   left draws it (the split residue, L1's finding 2, then touches laid pages alone).
// - A laid page is the composed document's page drawn by the same page view with its laid units' groups off (`laid`), under an
//   overlay of the translations (the SVG painter), the elements' and labels' crops, our text layer and our links; a unit of the
//   page that is not laid keeps its groups on and stays arXiv's. It is drawn beside the page shown and swapped in once drawn, in
//   one task (the stack's swap), with its size and the pane's scroll unchanged.
// - A page's `Page` is laid when the page comes near, laid again only when a row it waits for arrives, and kept: a page that
//   comes back is not laid again (within a bound of pages kept). Committed is final: a late row changes nothing on screen until
//   the language changes or the paper opens again.
// - A language switch keeps the parts, the composed document, its page views' documents, A's text content and the faces the
//   targets share; every laid page goes back to arXiv's and is laid again from the same parts with the new rows, near pages first.
import type { Part, Placed } from '@readarxiv/format'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Kit } from '../pdfjs/kit.ts'
import type { Stack } from '../stack/stack.ts'
import type { Faces } from './faces.ts'
import type { Groups } from './groups.ts'
import { type LinkHooks, linkLayer } from './links.ts'
import { committed, type Lay, type Laid, type Page, type Rows } from './page.ts'
import { cropsFor, svgOf } from './paint.ts'
import { canvasMeasure, laidText, type TextContent, textContentOf, textLayerOf } from './text.ts'

/** the laid pages a reader keeps, at most (a page's Page is some kilobytes; past it the least recently shown is let go) */
export const PAGES_KEPT = 600

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
  /** the layer (its parts) and the rows of the target shown: pages near laid now */
  setLayer(layer: Layer | null, rows: RowsSource | null): void
  /** whether the right shows translations (the display) */
  setShown(on: boolean): void
  /** page n's committed Page, or null */
  laid(n: number): Page | null
  /** the Page laid for page n now (committed or waiting), or null */
  page(n: number): Page | null
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
  warn?(what: string, e: unknown): void
}

export function createComposer(o: ComposerOptions): Composer {
  const { stack, faces } = o
  let original: PDFDocumentProxy | null = null,
    composed: PDFDocumentProxy | null = null,
    groups: Groups | null = null
  let layer: Layer | null = null,
    rows: RowsSource | null = null,
    unrows: (() => void) | null = null
  let shown = true,
    gen = 0,
    disposed = false
  /** the parts read, by page; the Page of each page laid for the current target; the committed ones */
  const parts = new Map<number, Part | null>()
  const pages = new Map<number, Page>()
  const commits = new Map<number, { page: Page; tick: number }>()
  const members = new Map<number, Placed>()
  /** A's text content of each page of the composed document (the same for every target) */
  const texts = new Map<number, Promise<TextContent>>()
  let tick = 0,
    firstTold = false
  const counts = { lays: 0, commits: 0, uncommits: 0, overlays: 0 }
  /** each overlay's making, its parts (ms): the probe's, for the commit's timings */
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

  stack.contentOf = (n) => {
    const c = commits.get(n)
    if (c && composed && groups && shown) {
      const doc = composed,
        g = groups,
        page = c.page
      return { key: `laid:${c.tick}`, doc, config: g.laid, own: false, over: (at) => overlay(n, page, doc, g, at) }
    }
    if (composed && groups && o.unlaid === 'composed')
      return { key: 'composed', doc: composed, config: groups.allOn, own: true, over: null }
    if (original) return { key: 'original', doc: original, config: null, own: true, over: null }
    if (composed && groups) return { key: 'composed', doc: composed, config: groups.allOn, own: true, over: null }
    return null
  }

  /** the overlay of a committed page over its page view: made in the drawing's turn, before the swap */
  async function overlay(
    n: number,
    page: Page,
    doc: PDFDocumentProxy,
    g: Groups,
    at: Parameters<NonNullable<ReturnType<Stack['contentOf']>>['over'] & {}>[0],
  ) {
    counts.overlays++
    const t0 = performance.now()
    const faceIds = new Set<string>()
    for (const m of page.members)
      for (const [, , , items] of m.lines) for (const it of items) if ('face' in it) faceIds.add(it.face)
    await faces.ready(faceIds)
    const el = document.createElement('div')
    el.className = 'axt-over'
    const raw = (at.viewport as unknown as { rawDims: { pageWidth: number; pageHeight: number } }).rawDims
    el.style.setProperty('--axt-frame-w', `calc(var(--total-scale-factor) * ${raw.pageWidth}px)`)
    el.style.setProperty('--axt-frame-h', `calc(var(--total-scale-factor) * ${raw.pageHeight}px)`)
    el.append(svgOf(page, at.viewport, faces))
    const tSvg = performance.now()
    const pdfPage = await doc.getPage(n)
    const out = (at.view as unknown as { outputScale?: { sx: number; sy: number } }).outputScale ?? { sx: 1, sy: 1 }
    const crops = await cropsFor(page, pdfPage, at.viewport, g.crops, out)
    if (crops) el.append(crops)
    const tCrops = performance.now()
    const text = texts.get(n) ?? textContentOf(pdfPage)
    texts.set(n, text)
    const laid = laidText(await text, page, members, faces, measure)
    el.append(await textLayerOf(o.kit.lib as never, laid.content, at.viewport, o.lang()))
    const links = linkLayer(page, at.viewport, o.links)
    if (links) el.append(links)
    const tEnd = performance.now()
    timings.push({ n, svgMs: tSvg - t0, cropsMs: tCrops - tSvg, textMs: tEnd - tCrops, overlayMs: tEnd - t0 })
    if (timings.length > 64) timings.shift()
    return el
  }

  /** page n laid (its part read once), committed where nothing is waited for */
  async function layNow(n: number) {
    const mine = gen
    if (!layer || !rows || !composed || commits.has(n)) return
    let part = parts.get(n)
    if (part === undefined) {
      try {
        part = await layer.part(n)
      } catch (e) {
        o.warn?.(`page ${n}'s part`, e)
        part = null
      }
      if (mine !== gen) return
      parts.set(n, part)
      if (part) for (const f of part.flows) for (const m of f) if (!members.has(m.ord)) members.set(m.ord, m)
    }
    if (!part || !rows) return
    counts.lays++
    let page: Page
    try {
      page = o.lay(part, rows)
    } catch (e) {
      o.warn?.(`page ${n} laid`, e)
      return
    }
    pages.set(n, page)
    if (committed(page) && page.members.some((m) => m.state === 'laid')) commit(n, page)
  }
  function commit(n: number, page: Page) {
    if (!groups) return
    groups.set(page)
    commits.set(n, { page, tick: ++tick })
    counts.commits++
    // (the pages kept: the oldest committed far from the view let go past the bound, its groups back on)
    if (commits.size > PAGES_KEPT)
      for (const [k] of commits) {
        if (commits.size <= PAGES_KEPT) break
        if (!stack.near(k)) uncommit(k)
      }
    stack.refresh(n)
    tell('laid', { n, page })
    if (!firstTold) {
      firstTold = true
      tell('first', { n })
    }
  }
  function uncommit(n: number) {
    if (!commits.delete(n)) return
    groups?.clear(n)
    counts.uncommits++
    stack.refresh(n)
    tell('laid', { n, page: null })
  }
  /** the pages near the right's view laid (in page order: the view's own first) */
  function layNear() {
    for (let n = 1; n <= stack.pages; n++) if (stack.near(n)) void layNow(n)
  }
  const unnear = stack.on('near', ({ n, on }) => {
    if (on) void layNow(n)
  })

  return {
    setDocuments(d) {
      original = d.original
      if (composed !== d.composed) {
        texts.clear()
        commits.clear()
      }
      composed = d.composed
      groups = d.groups
      stack.refresh()
      layNear()
    },
    setLayer(next, nextRows) {
      gen++
      for (const n of [...commits.keys()]) uncommit(n)
      pages.clear()
      firstTold = false
      if (layer !== next) {
        parts.clear()
        members.clear()
      }
      layer = next
      unrows?.()
      rows = nextRows
      unrows =
        rows?.on(() => {
          // (a row in: the pages waiting laid again; a committed page is final)
          for (const [n, p] of pages) if (!commits.has(n) && !committed(p)) void layNow(n)
        }) ?? null
      layNear()
    },
    setShown(on) {
      if (shown === on) return
      shown = on
      for (const n of commits.keys()) stack.refresh(n)
    },
    laid: (n) => commits.get(n)?.page ?? null,
    page: (n) => pages.get(n) ?? null,
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
        target: rows?.target ?? '',
      }
    },
    dispose() {
      if (disposed) return
      disposed = true
      unnear()
      unrows?.()
      commits.clear()
      pages.clear()
      listeners.clear()
    },
  }
}

export type { Laid }
