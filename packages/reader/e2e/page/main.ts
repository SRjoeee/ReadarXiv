// The harness page: the reader's parts, driven by the checks (run.mjs) through `window.__h`. Nothing here reaches the network
// but the page's own origin and the stand-in of arXiv's server, which the route table answers.
import { groupName, groupOf, type Head, type Part, type Placed, read, type Row } from '@readarxiv/format'
import { composedSource } from '../../src/bytes/composed.ts'
import { openRanged } from '../../src/bytes/ranged.ts'
import { type OriginalSource, rangeSource } from '../../src/bytes/source.ts'
import { chunkStore } from '../../src/bytes/store.ts'
import { DEFAULTS } from '../../src/prefs.ts'
import { type Composer, createComposer, type RowsSource } from '../../src/compose/composer.ts'
import { createFaces, type Faces } from '../../src/compose/faces.ts'
import { createServed, type Served } from '../../src/compose/served.ts'
import { layPage, rulesFor } from '@readarxiv/typeset'
import { leftKinds } from '../../src/compose/classes.ts'
import { ruleTag, typesetLay } from '../../src/compose/typeset.ts'
import { groupsOf, type Groups } from '../../src/compose/groups.ts'
import { createHighlight, type Highlight } from '../../src/compose/highlight.ts'
import type { Box, Ink, Item, Page } from '../../src/compose/page.ts'
import type { OptionalContentConfig } from '../../src/stack/stack.ts'
import { fixtureLay, inked, membersOf, pagesOf, type ReaderDump } from './convert.ts'
import { createPanes, type Panes } from '../../src/panes/panes.ts'
import { createStack, type Stack } from '../../src/stack/stack.ts'
import { eagerPages, quietRoot } from '../../src/panes/left.ts'
import { loadKit } from '../../src/pdfjs/kit.ts'
import { ownedClock } from '../../src/stack/clock.ts'
import { createScheduler } from '../../src/stack/scheduler.ts'
import { addSheets } from '../../src/styles.ts'
import { CATALOGUE_WORDS } from '../../src/compose/words.ts'
import { type Engine, openReader, type Reader } from '../../src/reader.ts'
import { LEGACY } from '../../src/pdfjs/legacy.ts'

const root = document.getElementById('root') as HTMLElement
const bytesOf = async (url: string) => {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`${url}: ${r.status}`)
  return new Uint8Array(await r.arrayBuffer())
}
/** the fixtures' faces: PDF.js's own Liberation Sans (metric for metric the standard Helvetica the fixtures are set in), a CJK
 *  face of the system's for the corpus papers' dumps (local runs) */
const faceTable = (base: string) => ({
  sans: { src: `${base}standard_fonts/LiberationSans-Regular.ttf`, fallback: 'sans-serif' },
  cjk: { local: 'Songti SC', fallback: '"STSong", "Noto Serif CJK SC", serif' },
})
/**
 * A check's crop cut in two between its glyphs over two lines, as the typesetter cuts a URL (its `cut` edges): element
 * `piece`'s first crop cut at `share` of its width, its head ending its line with the text `text[0]`, its tail opening the next
 * line with `text[1]`, the items after the head on its line carried after the tail, the next line's own after them. Whether
 * one was cut
 */
function cutCrop(pages: Map<number, Page>, o: { piece: string; share: number; text: [string, string] }): boolean {
  for (const p of pages.values())
    for (const m of p.members)
      for (let i = 0; i + 1 < m.lines.length; i++) {
        const [y, x0, x1, items] = m.lines[i]!
        const j = items.findIndex((it) => 'src' in it && it.piece === o.piece)
        if (j < 0) continue
        const it = items[j] as Extract<Item, { src: Ink }>
        const [pg, a, b, c, d, base] = it.src
        const at = a + (c - a) * o.share
        const [ny, nx0, nx1, next] = m.lines[i + 1]!
        const tailW = (c - at) * it.k
        // (the items after the crop keep their place after its end, now the tail's, the last a space after it where it ended its
        // line with none; the next line's own move past them)
        const dx = nx0 + tailW - (it.x + (c - a) * it.k)
        const moved = (list: Item[], by: number) => list.map((x) => ({ ...x, x: x.x + by }))
        const after = moved(items.slice(j + 1), dx)
        const last = after.at(-1)
        if (last && !/\s$/.test(last.s)) after[after.length - 1] = { ...last, s: `${last.s} ` }
        m.lines[i] = [y, x0, x1, [...items.slice(0, j), { ...it, s: o.text[0], src: [pg, a, b, at, d, base], cut: 2 }]]
        m.lines[i + 1] = [
          ny,
          nx0,
          nx1,
          [
            { ...it, s: o.text[1], x: nx0, src: [pg, at, b, c, d, base], cut: 1 },
            ...after,
            ...moved(next, x1 - it.x - (c - a) * it.k + tailW),
          ],
        ]
        return true
      }
  return false
}
/** a crop whose own ink is the left `share` of its source and whose source's rest is another piece's ink on its page (the
 *  Page's `inks`), as the typesetter states them where two pieces' ink stand side by side (lay/clips.ts); its own ink's right
 *  edge and its drawn box, PDF units of its page */
function clipCrop(
  pages: Map<number, Page>,
  o: { piece: string; share: number },
): { page: number; edge: number; box: [number, number, number, number] } | null {
  for (const p of pages.values())
    for (const m of p.members)
      for (const [y, , , items] of m.lines) {
        const j = items.findIndex((it) => 'src' in it && it.piece === o.piece)
        if (j < 0) continue
        const it = items[j] as Extract<Item, { src: Ink }>
        const [pg, a, b, c, d, base] = it.src
        const at = a + (c - a) * o.share
        items[j] = { ...it, ink: [[a, b, at, d]] }
        p.inks = [...(p.inks ?? []), [pg, a, b, at, d, base], [pg, at, b, c, d, base]]
        return {
          page: p.page,
          edge: it.x + (at - a) * it.k,
          box: [it.x, y + (b - base) * it.k, it.x + (c - a) * it.k, y + (d - base) * it.k],
        }
      }
  return null
}
/** a line on A that holds ink that stays (Line's KEPT flag) */
const KEPT = 1
/**
 * Every draw call on a 2D canvas rasterised as it is made while `flushing.on` (I2's renders; the canvas gate's `--flush`):
 * Chromium records a 2D canvas's calls and rasterises them in batches whose ends fall where the page's task yields, and the same
 * calls give other pixels for other batch ends (arXiv's page drawn twice so too); a one-pixel read after each call makes every
 * render of the same calls the same pixels, so that two renders of a page differ only where their calls do
 */
const flushing = { on: false }
{
  const P = CanvasRenderingContext2D.prototype as unknown as Record<string, (...a: unknown[]) => unknown>
  for (const name of [
    'drawImage',
    'fillText',
    'strokeText',
    'fill',
    'stroke',
    'fillRect',
    'strokeRect',
    'clearRect',
    'putImageData',
  ]) {
    const f = P[name] as (...a: unknown[]) => unknown
    P[name] = function (this: CanvasRenderingContext2D, ...a: unknown[]) {
      const r = f.apply(this, a)
      if (flushing.on) this.getImageData(0, 0, 1, 1)
      return r
    }
  }
}
/**
 * A member's ink on page `n` as the layer states it (the part's Placed, which the reader's typesetter reads its boxes from), by
 * the group that holds it: its text group (bit 1) its lines but the KEPT ones, its element group (bit 2) its elements' ink but a
 * kept element's (El.keep: TeX set it outside the unit's text, in no group), its label group (bit 4) its label's ink; `kept`,
 * the ink it states that stays where it stands in no group of its own: its KEPT lines and its kept elements' ink. `displays`:
 * its displays' ink (El kind 'display', lit as blocks of their own on both panes) and the KEPT lines on their rows, kept too
 */
function statedInk(m: Placed, n: number): { 1: Box[]; 2: Box[]; 4: Box[]; kept: Box[]; displays: Box[] } {
  const out = { 1: [] as Box[], 2: [] as Box[], 4: [] as Box[], kept: [] as Box[], displays: [] as Box[] }
  const area = (b: Box) => b[2] > b[0] && b[3] > b[1]
  for (const [, el] of m.els ?? [])
    for (const i of el.ink)
      if (i[0] === n) {
        const b: Box = [i[1], i[2], i[3], i[4]]
        if (!area(b)) continue
        if (el.kind === 'display') out.displays.push(b)
        else if (el.keep) out.kept.push(b)
        else out[2].push(b)
      }
  const onDisplay = (b: Box) =>
    out.displays.some(
      (d) =>
        Math.min(b[2], d[2]) > Math.max(b[0], d[0]) &&
        Math.min(b[3], d[3]) - Math.max(b[1], d[1]) > 0.5 * (b[3] - b[1]),
    )
  for (const l of m.lines) {
    if (l[0] !== n) continue
    const b: Box = [l[2], l[6], l[3], l[5]]
    if (!area(b)) continue
    if (!(l[9] & KEPT)) out[1].push(b)
    else if (onDisplay(b)) out.displays.push(b)
    else out.kept.push(b)
  }
  const li = m.label?.ink
  if (li && li[0] === n && li[3] > li[1] && li[4] > li[2]) out[4].push([li[1], li[2], li[3], li[4]])
  return out
}
/** box b grown by `d` on every side */
const grown = (b: Box, d: number): Box => [b[0] - d, b[1] - d, b[2] + d, b[3] + d]
/** the area of box `b` that no box of `cover` holds (rectangles, exact: b cut into strips at every edge of the cover) */
function uncovered(b: Box, cover: readonly Box[]): number {
  const xs = [b[0], b[2]]
  for (const c of cover) for (const x of [c[0], c[2]]) if (x > b[0] && x < b[2]) xs.push(x)
  xs.sort((p, q) => p - q)
  let area = 0
  for (let i = 0; i + 1 < xs.length; i++) {
    const x0 = xs[i] as number,
      x1 = xs[i + 1] as number
    if (x1 <= x0) continue
    const mid = (x0 + x1) / 2
    const iv = cover
      .filter((c) => c[0] <= mid && c[2] >= mid)
      .map((c) => [Math.max(c[1], b[1]), Math.min(c[3], b[3])] as [number, number])
      .filter(([a, z]) => z > a)
      .sort((p, q) => p[0] - q[0])
    let held = 0,
      top = b[1]
    for (const [a, z] of iv) {
      if (z <= top) continue
      held += z - Math.max(a, top)
      top = z
    }
    area += (x1 - x0) * (b[3] - b[1] - held)
  }
  return area
}
/** the extent of the boxes of `of` within box `b` (each cut to b; a box that only touches it has none), or null */
function extentIn(b: Box, of: readonly Box[]): Box | null {
  let out: Box | null = null
  for (const c of of) {
    const x0 = Math.max(b[0], c[0]),
      y0 = Math.max(b[1], c[1]),
      x1 = Math.min(b[2], c[2]),
      y1 = Math.min(b[3], c[3])
    if (x1 <= x0 || y1 <= y0) continue
    out = out
      ? [Math.min(out[0], x0), Math.min(out[1], y0), Math.max(out[2], x1), Math.max(out[3], y1)]
      : [x0, y0, x1, y1]
  }
  return out
}
/** a box of a member set along a direction (Laid.lit's `dir`: [s0, t0, s1, t1] along it and across it) as the page's box it
 *  stands in */
function pageBoxOf(b: Box, [ux, uy]: [number, number]): Box {
  const pts = [
    [b[0], b[1]],
    [b[2], b[1]],
    [b[0], b[3]],
    [b[2], b[3]],
  ].map(([s, t]) => [(s as number) * ux - (t as number) * uy, (s as number) * uy + (t as number) * ux] as const)
  return [
    Math.min(...pts.map((p) => p[0])),
    Math.min(...pts.map((p) => p[1])),
    Math.max(...pts.map((p) => p[0])),
    Math.max(...pts.map((p) => p[1])),
  ]
}
/** the hundredth of a point the part writes its numbers to, halved: two boxes read from the same numbers are the same boxes
 *  within it (I7's tolerance; anything past it is not the numbers' rounding) */
const PART_ROUNDING = 0.005
const h = {
  panes: null as Panes | null,
  kit: null as Awaited<ReturnType<typeof loadKit>> | null,
  doc: null as import('pdfjs-dist').PDFDocumentProxy | null,
  source: null as OriginalSource | null,
  task: null as { destroy(): Promise<void> } | null,
  composed: null as import('pdfjs-dist').PDFDocumentProxy | null,
  groups: null as Groups | null,
  composer: null as Composer | null,
  highlight: null as Highlight | null,
  clock: null as ReturnType<typeof ownedClock> | null,
  faces: null as Faces | null,
  /** the served faces and the reader's Metrics over them, where a layer is laid by the reader's own typesetter (`typeset`) */
  served: null as Served | null,
  head: null as Head | null,
  parts: new Map<number, Part>(),
  pages: new Map<number, Page>(),
  rows: null as (RowsSource & { give(ids?: string[]): void; end?(): void; rowsCount: number }) | null,
  external: [] as string[],
  /** the reading options the reader's own typesetter lays under (`typeset`), as the reader's preferences give them: setClasses */
  classes: null as Record<'figures' | 'tables' | 'heads' | 'references' | 'names', boolean> | null,
  /** the reading options turned, as the reader turns them: the typesetter's rules and the composer's toggles together */
  setClasses(c: Record<'figures' | 'tables' | 'heads' | 'references' | 'names', boolean>) {
    h.classes = c
    h.composer?.setClasses(c)
  },
  /** each member page `n` draws as committed: its ord, state and drawn text */
  drawnOf(n: number) {
    return (h.composer?.laid(n)?.members ?? []).map((m) => ({
      ord: m.ord,
      state: m.state,
      text: m.lines.map((l) => l[3].map((i) => i.s).join('')).join('|'),
    }))
  },
  t0: 0,
  marks: [] as { what: string; at: number; [k: string]: unknown }[],
  /** the panes over the original at `url` (a path of our server's, else arXiv's absolute URL). `borrow`: the right's pages as
   *  the panes give them (the left's drawing while a page waits, the skeleton with no original), else every page its own page
   *  view; `keepPixels`, `scrollEnd` the panes' */
  async open(url: string, o: { borrow?: boolean; keepPixels?: number; scrollEnd?: 'timer' | 'native' } = {}) {
    h.t0 = performance.now()
    const kit = await loadKit()
    h.kit = kit
    root.className = 'axt-reader'
    addSheets(root, kit.sheet)
    const left = document.createElement('div'),
      right = document.createElement('div')
    left.className = 'axt-pane left'
    right.className = 'axt-pane right'
    root.append(left, right)
    const clock = ownedClock()
    h.clock = clock
    const scheduler = createScheduler({ warn: (w, e) => console.warn(w, e) })
    const panes = createPanes({
      root,
      left,
      right,
      kit,
      scheduler,
      clock,
      pageName: (s, n) => `${s} page ${n}`,
      openExternal: (u) => h.marks.push({ what: 'external', at: 0, url: u }),
      warn: (w, e) => console.warn(w, e),
      ...(o.keepPixels !== undefined ? { keepPixels: o.keepPixels } : {}),
      ...(o.scrollEnd ? { scrollEnd: o.scrollEnd } : {}),
    })
    h.panes = panes
    panes.on('drawn', (e) =>
      h.marks.push({
        what: 'drawn',
        at: performance.now() - h.t0,
        side: e.side,
        page: e.page,
        scale: e.scale,
        key: e.key,
      }),
    )
    panes.on('scale', (e) => h.marks.push({ what: 'scale', at: performance.now() - h.t0, scale: e.scale }))
    panes.on('sync', (e) => h.marks.push({ what: 'sync', at: performance.now() - h.t0, ...e }))
    panes.on('page', (e) => h.marks.push({ what: 'page', at: performance.now() - h.t0, ...e }))
    const own = url.startsWith('/')
    const source = rangeSource({ fetch: (u, i) => fetch(u, i), url, own, store: chunkStore() })
    h.source = source
    const task = openRanged(kit.lib as never, source, { options: kit.options('original') })
    h.task = task
    const doc = await task.promise
    h.doc = doc
    if (!o.borrow) panes.right.contentOf = () => ({ key: 'original', doc, config: null, own: true, over: null })
    const r = await panes.open(doc)
    h.marks.push({ what: 'opened', at: performance.now() - h.t0, r })
    return { pages: doc.numPages, asks: source.counts.asks, bytes: source.counts.bytes }
  },
  /** the layer of fixture `name` over the original open, no composer: its head and parts read from our server's objects, the
   *  original's chunks proved, the composed document opened over the same store and its groups read */
  async openLayer(name: string) {
    const fx = await (await fetch(`/fixtures/${name}/index.json`)).json()
    const kit = h.kit as NonNullable<typeof h.kit>
    const t0 = performance.now()
    const head = read('head', await bytesOf(`${fx.objects}${fx.head}`), fx.head) as Head
    h.head = head
    const proved = await (h.source as OriginalSource).prove(head.original.chunks)
    const addOn = rangeSource({ fetch: (u, i) => fetch(u, i), url: `${fx.objects}${head.addOn?.digest}`, own: true })
    const src = composedSource(h.source as OriginalSource, head.original.bytes, addOn, head.addOn?.bytes ?? 0)
    const composed = await openRanged(kit.lib as never, src, { options: kit.options('composed') }).promise
    h.composed = composed
    const groups = groupsOf(composed)
    await groups.ready
    h.groups = groups
    const tOpen = performance.now() - t0
    const parts = new Map<number, Part>()
    await Promise.all(
      head.parts.map(async (d, i) => {
        if (d) parts.set(i + 1, read('part', await bytesOf(`${fx.objects}${d}`), d) as Part)
      }),
    )
    h.parts = parts
    // (the units the paper keeps as it is (Unit.kept), whose rows never come: the reader's rows say so, rows.ts)
    const kept = new Set<string>()
    for (const d of head.units)
      for (const u of (
        read('units', await bytesOf(`${fx.objects}${d}`), d) as { units: { id: string; kept?: unknown }[] }
      ).units)
        if (u.kept) kept.add(u.id)
    return { fx, head, proved, composed, groups, parts, tOpen, kept }
  },
  /**
   * The layer of fixture `name` over the original open: its head and parts read from our server's objects, the original's chunks
   * proved, the composed document opened over the same store, its groups read, the fixture's dump made into Pages, the rows
   * given (all at once, or none until `give`), the right composed. `unlaid`: what a page not laid is drawn from; `pages`: the
   * URL of the pages to lay instead of the dump's (page → Page: a typesetter's own, lab/typeset/checkpoint/entry-reader.mjs)
   */
  async layer(
    name: string,
    o: {
      unlaid?: 'original' | 'composed'
      rows?: 'all' | 'none'
      target?: string
      classes?: Record<'figures' | 'tables' | 'heads' | 'references' | 'names', boolean>
      ahead?: number
      pages?: string
      /** an element's crop cut over two lines, as the typesetter cuts a URL (cutCrop) */
      cut?: { piece: string; share: number; text: [string, string] }
      /** an element's crop whose own ink is the left share of its source, the rest another piece's (clipCrop) */
      clip?: { piece: string; share: number }
      /** laid by the reader's own typesetter (compose/typeset.ts typesetLay: layPage under the target's rules, over our site's
       *  faces and patterns, the reader's Metrics) from the fixture's parts and its `<target>.rows.json`, not from its dump; the
       *  faces the served ones (`h.served`) */
      typeset?: boolean
      /** the rows given ended at once (no other row will come: a unit with none is the original's, nothing waited for) */
      end?: boolean
    } = {},
  ) {
    const { fx, head, proved, composed, groups, parts, tOpen, kept } = await h.openLayer(name)
    const kit = h.kit as NonNullable<typeof h.kit>
    const target = o.target ?? 'de'
    const all = (
      (await (await fetch(`/fixtures/${name}/${fx.rows[target] ?? `${target}.rows.json`}`)).json()) as { rows: Row[] }
    ).rows
    // (the reader's own typesetter lays the pages as the composer asks: none made here)
    const pages = o.typeset
      ? new Map<number, Page>()
      : o.pages
        ? new Map(
            Object.entries((await (await fetch(o.pages)).json()) as Record<string, Page>).map(([n, p]) => [
              Number(n),
              p,
            ]),
          )
        : pagesOf(
            parts,
            (await (
              await fetch(`/fixtures/${name}/${fx.dumps[target] ?? `${target}.reader.json`}`)
            ).json()) as ReaderDump,
            (m) => fx.face ?? ([...JSON.stringify(m)].some((c) => c.charCodeAt(0) > 127) ? 'cjk' : 'sans'),
          )
    h.pages = pages
    if (o.cut && !cutCrop(pages, o.cut)) throw new Error(`no crop of ${o.cut.piece} to cut`)
    const clipped = o.clip ? clipCrop(pages, o.clip) : null
    if (o.clip && !clipped) throw new Error(`no crop of ${o.clip.piece} to clip`)
    const given = new Map<string, Row>()
    const listeners = new Set<() => void>()
    const rows = {
      target,
      done: false,
      get: (id: string) => given.get(id),
      kept: (id: string) => kept.has(id),
      on(f: () => void) {
        listeners.add(f)
        return () => listeners.delete(f)
      },
      give(ids?: string[]) {
        for (const r of all) if (!ids || ids.includes(r.id)) given.set(r.id, r)
        for (const f of [...listeners]) f()
      },
      /** no other row will come */
      end() {
        rows.done = true
        for (const f of [...listeners]) f()
      },
      get rowsCount() {
        return given.size
      },
    }
    if ((o.rows ?? 'all') === 'all') rows.give()
    if (o.end) rows.end()
    h.rows = rows
    h.faces ??= createFaces({
      table: faceTable(kit.base),
      fetch: (u, i) => fetch(u, i),
      root,
      warn: (w, e) => console.warn(w, e),
    })
    // (the reader's own typesetter: the served faces and the reader's Metrics over them, as the website's reader has them)
    if (o.typeset) h.served ??= createServed({ fetch: (u, i) => fetch(u, i), root, warn: (w, e) => console.warn(w, e) })
    const served = o.typeset ? (h.served as Served) : null
    const panes = h.panes as Panes
    h.composer?.dispose()
    const composer = createComposer({
      stack: panes.right,
      kit,
      faces: served ? served.faces : h.faces,
      lay: served
        ? await typesetLay({ served, target: () => target, classes: () => h.classes ?? o.classes ?? null })
        : fixtureLay(pages, parts),
      unlaid: o.unlaid ?? 'original',
      lang: () => target,
      links: {
        open: (u) => h.external.push(u),
        follow: (d, how) => void panes.follow(d, how),
        unnamed: (to) => CATALOGUE_WORDS.linkName(to),
      },
      clock: h.clock as NonNullable<typeof h.clock>,
      root,
      original: (n, settled) => panes.originalOf(n, settled),
      settle: (fn) => panes.settle(fn),
      aheadGo: () => panes.letAheadGo(),
      leftDrawing: (n) => panes.leftDrawing(n),
      ...(o.classes ? { classes: o.classes } : {}),
      ...(o.ahead !== undefined ? { ahead: o.ahead } : {}),
      warn: (w, e) => console.warn(w, e),
    })
    h.composer = composer
    h.classes = o.classes ?? null
    composer.on('laid', (e) => h.marks.push({ what: 'laid', at: performance.now() - h.t0, page: e.n, on: !!e.page }))
    panes.right.on('shown', (e) => {
      // (the commit's style and layout: the swap's own task, its layout forced here, in the same task)
      const t = performance.now()
      const slot = panes.right.page(e.n)
      // (the slot's size is contained: its own box asks nothing of what the commit added; the SVG's text and the text layer's
      // spans do)
      for (const x of slot?.querySelectorAll('.axt-over svg text') ?? []) (x as SVGTextElement).getBBox()
      slot?.querySelector('.axt-over .textLayer span:last-of-type')?.getBoundingClientRect()
      const layoutMs = performance.now() - t
      h.marks.push({
        what: 'shown',
        at: performance.now() - h.t0,
        page: e.n,
        key: e.key,
        swapMs: e.swapMs,
        layoutMs,
        drawMs: e.drawMs,
        // (the translating marks still on the page in the task its drawing is put in place, and the root's attributes the
        // swap's task wrote)
        marksLeft: slot?.querySelectorAll('.axt-translating-mark').length ?? 0,
      })
    })
    h.highlight?.dispose()
    h.highlight = createHighlight({ panes, composer, clock: h.clock as NonNullable<typeof h.clock>, on: true })
    composer.setDocuments({ original: h.doc, composed, groups })
    composer.setLayer({ part: async (n) => parts.get(n) ?? null, pages: head.paper.pages }, rows)
    return {
      proved,
      clipped,
      groups: groups.size,
      tOpen: Math.round(tOpen),
      parts: parts.size,
      laidPages: pages.size,
      digested: (h.source as OriginalSource).digested,
    }
  },
  /**
   * I3 and I4 on the right's page n as it shows, from a screenshot of its slot (`png`, base64, at the page's device scale): the
   * overlay's ink is where the slot is darker than its page view's own canvas (the composed page with the groups off); every
   * such pixel must lie in a laid member's region (its column across its measure, from its first line's top to its room's
   * bottom) and on no other ink (a pixel the page view itself inks). And every element of a laid member is an item or kept
   */
  async overlayInk(n: number, png: string) {
    const p = h.composer?.laid(n)
    const slot = (h.panes as Panes).right.page(n) as HTMLElement
    const canvas = slot.querySelector('.axt-slot-view .canvasWrapper canvas') as HTMLCanvasElement | null
    if (!p || !canvas) return { error: `page ${n} is not laid (${!!p}) or has no canvas` }
    const shot = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob())
    const W = canvas.width,
      H = canvas.height
    const a = new OffscreenCanvas(W, H).getContext('2d') as OffscreenCanvasRenderingContext2D
    a.drawImage(shot, 0, 0, W, H)
    const S = a.getImageData(0, 0, W, H).data
    const b = new OffscreenCanvas(W, H).getContext('2d') as OffscreenCanvasRenderingContext2D
    b.drawImage(canvas, 0, 0)
    const C = b.getImageData(0, 0, W, H).data
    const vp = (h.panes as Panes).right.viewport(n) as import('pdfjs-dist').PageViewport
    const k = W / vp.width
    const dev = (x0: number, y0: number, x1: number, y1: number) => {
      const [ax, ay] = vp.convertToViewportPoint(x0, y1) as [number, number],
        [bx, by] = vp.convertToViewportPoint(x1, y0) as [number, number]
      return [
        Math.floor(Math.min(ax, bx) * k) - 1,
        Math.floor(Math.min(ay, by) * k) - 1,
        Math.ceil(Math.max(ax, bx) * k) + 1,
        Math.ceil(Math.max(ay, by) * k) + 1,
      ]
    }
    const regions: number[][] = []
    let elements = 0,
      items = 0
    for (const m of p.members) {
      if (m.state !== 'laid') continue
      const pl = h.composer?.member(m.ord)
      if (!pl) continue
      const ls = pl.lines.filter((l) => l[0] === n)
      if (!ls.length) continue
      const top = Math.max(...ls.map((l) => l[5]), ...(pl.label?.ink[0] === n ? [pl.label.ink[4]] : []))
      const bottom = Math.min(...ls.map((l) => l[6])) - (pl.room.below ?? 0)
      const x0 = Math.min(...ls.map((l) => l[7]), ...ls.map((l) => l[2])),
        x1 = Math.max(...ls.map((l) => l[8]), ...ls.map((l) => l[3]))
      regions.push(dev(x0, bottom, x1, top))
      for (const [, el] of pl.els ?? []) if (el.ink.some((i) => i[0] === n) && !el.keep) elements++
      for (const [, , , its] of m.lines) items += its.filter((i) => 'src' in i).length
    }
    const lum = (D: Uint8ClampedArray, i: number) =>
      0.299 * (D[i] as number) + 0.587 * (D[i + 1] as number) + 0.114 * (D[i + 2] as number)
    let ink = 0,
      outside = 0,
      onInk = 0
    const where: number[][] = []
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = 4 * (y * W + x)
        if (lum(C, i) - lum(S, i) < 48) continue
        ink++
        if (lum(C, i) < 128) onInk++
        if (
          !regions.some(
            (r) => x >= (r[0] as number) && y >= (r[1] as number) && x <= (r[2] as number) && y <= (r[3] as number),
          )
        ) {
          outside++
          if (where.length < 5) where.push(vp.convertToPdfPoint(x / k, y / k).map((v) => Math.round(v * 10) / 10))
        }
      }
    return { size: [W, H], ink, outside, onInk, where, regions: regions.length, elements, crops: items }
  },
  /** the right's page n's text layer as a reader reads it (its spans in order), a selection of it whole, and the laid members'
   *  translations in the order their original text comes in the original document's own text content (its first item on the
   *  member's first line) */
  async textOf(n: number) {
    const slot = (h.panes as Panes).right.page(n) as HTMLElement
    const layer = slot.querySelector('.axt-over .textLayer') ?? slot.querySelector('.textLayer')
    if (!layer) return null
    const spans = [...layer.querySelectorAll('span')].map((x) => x.textContent ?? '').filter(Boolean)
    const r = document.createRange()
    r.selectNodeContents(layer)
    const sel = getSelection() as Selection
    sel.removeAllRanges()
    sel.addRange(r)
    const copied = sel.toString()
    sel.removeAllRanges()
    const p = h.composer?.laid(n)
    // (where each member's first line stands in the stream: the composed document's text, A's in its order split at every
    // group's seam, so that an item A sets across two members is each one's: 2609.26457v1's "and Zhengyao Jiang", an ink
    // orphan's "and" and a name)
    const doc = (h.composed ?? h.doc) as import('pdfjs-dist').PDFDocumentProxy
    const items = (await (await doc.getPage(n)).getTextContent()).items as {
      str: string
      transform: number[]
      width: number
    }[]
    const firstOf = (ord: number) => {
      const m = h.composer?.member(ord)
      const l = m?.lines.find((x) => x[0] === n)
      if (!l) return Number.POSITIVE_INFINITY
      const i = items.findIndex(
        (it) =>
          it.str.trim() &&
          Math.abs((it.transform[5] as number) - l[4]) < 1 &&
          (it.transform[4] as number) + it.width / 2 >= l[2] - 1 &&
          (it.transform[4] as number) + it.width / 2 <= l[3] + 1,
      )
      return i < 0 ? Number.POSITIVE_INFINITY : i
    }
    // (a member's runs of text, in order: a crop's text is the original's under its source, moved where it is drawn, or its own)
    const runs = (p?.members ?? [])
      .filter((m) => m.state === 'laid')
      .map((m) => ({
        ord: m.ord,
        at: firstOf(m.ord),
        t: m.lines.flatMap(([, , , its]) => its.filter((i) => !('src' in i)).map((i) => i.s)).filter((s) => s.trim()),
      }))
      .sort((a, b) => a.at - b.at)
    return {
      spans: spans.length,
      text: spans.join(''),
      copied,
      laid: runs.map((r) => r.t.join('')),
      runs: runs.map((r) => r.t),
      ords: runs.map((r) => r.ord),
    }
  },
  /**
   * The split residue and I1 on pages `pages` (all where none) at `scale` and the device's ratio, each rendered as the page views
   * render (a GPU-backed 2D canvas, the optional content configuration given): arXiv's page (A), A again (the canvas's own
   * noise), the composed page with every group on (W: I1), and on a page with a translation the composed page with its laid
   * groups off (L): the pixels it differs from A outside the laid members' regions are what a laid page shows of the residue.
   * Way (a), a page not laid drawn from A: only L's residue shows, on laid pages; way (b), both panes the composed document:
   * W's residue shows on every page, on both panes alike
   */
  async residue(o: { pages?: number[]; scale?: number } = {}) {
    const A = h.doc as import('pdfjs-dist').PDFDocumentProxy,
      W = h.composed as import('pdfjs-dist').PDFDocumentProxy,
      g = h.groups as Groups
    const scale = (o.scale ?? 1.5) * (96 / 72),
      dpr = devicePixelRatio
    for (const p of h.pages.values()) g.set(p)
    const draw = async (doc: import('pdfjs-dist').PDFDocumentProxy, n: number, config: Promise<unknown> | null) => {
      const page = await doc.getPage(n)
      const vp = page.getViewport({ scale })
      const c = document.createElement('canvas')
      c.width = Math.floor(vp.width * dpr)
      c.height = Math.floor(vp.height * dpr)
      const ctx = c.getContext('2d', { alpha: false }) as CanvasRenderingContext2D
      const t = performance.now()
      await page.render({
        canvas: c,
        canvasContext: ctx,
        viewport: vp,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
        ...(config ? { optionalContentConfigPromise: config } : {}),
      } as never).promise
      const ms = performance.now() - t
      const data = ctx.getImageData(0, 0, c.width, c.height).data
      c.width = 0
      c.height = 0
      return { data, ms, vp }
    }
    const diff = (x: Uint8ClampedArray, y: Uint8ClampedArray, keep: (i: number) => boolean = () => true) => {
      let px = 0,
        max = 0
      for (let i = 0; i < x.length; i += 4) {
        const d = Math.max(
          Math.abs((x[i] as number) - (y[i] as number)),
          Math.abs((x[i + 1] as number) - (y[i + 1] as number)),
          Math.abs((x[i + 2] as number) - (y[i + 2] as number)),
        )
        if (d && keep(i / 4)) {
          px++
          max = Math.max(max, d)
        }
      }
      return { px, max }
    }
    const out = []
    const all = membersOf(h.parts.values())
    const list = o.pages ?? Array.from({ length: A.numPages }, (_, i) => i + 1)
    for (const n of list) {
      const a = await draw(A, n, null),
        a2 = await draw(A, n, null),
        w = await draw(W, n, g.allOn)
      const row: Record<string, unknown> = {
        n,
        pixels: a.data.length / 4,
        self: diff(a.data, a2.data),
        all: diff(a.data, w.data),
        msA: Math.round(a.ms),
        msW: Math.round(w.ms),
      }
      const page = h.pages.get(n)
      if (page?.members.some((m) => m.state === 'laid')) {
        const l = await draw(W, n, g.laid)
        const W0 = Math.floor(l.vp.width * dpr)
        const boxes: number[][] = []
        for (const m of page.members) {
          if (m.state !== 'laid' || !m.off) continue
          const pl = all.get(m.ord)
          const inks = [
            ...(pl?.lines.filter((x) => x[0] === n).map((x) => [x[2], x[6], x[3], x[5]]) ?? []),
            ...(pl?.els ?? []).flatMap(([, e]) => e.ink.filter((i) => i[0] === n).map((i) => [i[1], i[2], i[3], i[4]])),
            ...(pl?.label?.ink[0] === n ? [[pl.label.ink[1], pl.label.ink[2], pl.label.ink[3], pl.label.ink[4]]] : []),
          ]
          for (const [x0, y0, x1, y1] of inks as number[][]) {
            const [ax, ay] = l.vp.convertToViewportPoint(x0 as number, y1 as number) as [number, number],
              [bx, by] = l.vp.convertToViewportPoint(x1 as number, y0 as number) as [number, number]
            boxes.push([
              Math.floor(Math.min(ax, bx) * dpr) - 2,
              Math.floor(Math.min(ay, by) * dpr) - 2,
              Math.ceil(Math.max(ax, bx) * dpr) + 2,
              Math.ceil(Math.max(ay, by) * dpr) + 2,
            ])
          }
        }
        const outside = (i: number) => {
          const x = i % W0,
            y = Math.floor(i / W0)
          return !boxes.some(
            (b) => x >= (b[0] as number) && y >= (b[1] as number) && x <= (b[2] as number) && y <= (b[3] as number),
          )
        }
        row.laid = diff(a.data, l.data, outside)
        row.msL = Math.round(l.ms)
      }
      out.push(row)
    }
    for (const p of h.pages.keys()) g.clear(p)
    return { scale: o.scale ?? 1.5, dpr, pages: out }
  },
  /** a language switch: the same layer, other rows (`target`'s, or `o.rowsOf`'s fixture rows, the units `o.refuse` names refused
   *  in them): what it reuses (the composed document, the parts, the store), where the reader stays, and the pages laid again */
  async retarget(target: string, name: string, o: { rowsOf?: string; refuse?: string[] } = {}) {
    const before = { composed: h.composed, place: (h.panes as Panes).reading(), laid: (h.composer as Composer).probe() }
    const fx = await (await fetch(`/fixtures/${name}/index.json`)).json()
    const of = o.rowsOf ?? target
    const all = (
      (await (await fetch(`/fixtures/${name}/${fx.rows[of] ?? `${of}.rows.json`}`)).json()) as { rows: Row[] }
    ).rows
    const given = new Map(
      all.map((r): [string, Row] => [
        r.id,
        o.refuse?.includes(r.id) ? { id: r.id, ok: false, why: { kind: 'refused' } } : r,
      ]),
    )
    const rows = {
      target,
      done: true,
      get: (id: string) => given.get(id),
      on: () => () => {},
      give() {},
      rowsCount: given.size,
    }
    h.rows = rows
    ;(h.composer as Composer).setLayer(
      { part: async (n) => h.parts.get(n) ?? null, pages: (h.head as Head).paper.pages },
      rows,
    )
    return {
      before: { place: before.place, laidPages: before.laid.laidPages },
      sameComposed: before.composed === h.composed,
    }
  },
  /** page n's members as last committed (ord, state, off, unit id) and each one's three groups as `laid` shows them (null: a group
   *  the document lacks) */
  async groupsOf(n: number) {
    const c = await (h.groups as Groups).laid
    const visible = new Map<string, boolean>()
    for (const [, g] of c as unknown as Iterable<[string, { name?: unknown; visible: boolean }]>)
      if (typeof g.name === 'string') visible.set(g.name, g.visible)
    return ((h.composer as Composer).laid(n)?.members ?? []).map((m) => ({
      ord: m.ord,
      state: m.state,
      off: m.off,
      id: (h.composer as Composer).member(m.ord)?.text,
      on: ([1, 2, 4] as const).map((bit) => visible.get(groupName(m.ord, n, bit)) ?? null),
    }))
  },
  /**
   * I2 on page n, read from the reader's own canvas: the right pane's page view (the stack drawing the composed document under an
   * optional content configuration of the check's own, as the reader's page views draw it, every draw call rasterised as it is
   * made: `flushing`) with every group on, with every group of the page off, with each group of the page on alone and with each
   * off alone. A group's own ink as the canvas paints it is where it alone on differs from none on. Its ink as the layer states
   * it (statedInk; the reader reads those boxes to place a text run in its group, compose/text.ts placesOf) is grown to whole
   * device pixels and one more (the canvas's own rounding: an edge drawn into the pixel that holds it, antialiased into the
   * next). For each group, from the pixels its off state changes against every group on:
   * - `neighbour`: those outside its stated ink that are not its own ink, or that stand in another member's stated ink: a
   *   neighbour's pixel changed (judged: none);
   * - `beyond`: those of its own ink outside its stated ink and every other member's: its glyphs' ink past the layer's
   *   statement of it (a line's box is its fonts' boxes up and down; reported, not judged);
   * - `shown`: its own ink, painted by no other group, that shows with every group on and stays with it off (judged: none);
   * - `unheld`: the page's text items (PDF.js's text content of the composed page) in no optional content run of ours, standing
   *   in its stated ink and in no kept ink the layer states (KEPT lines, kept elements, displays, a group the document does not
   *   hold): a mark of its statement drawn whatever its visibility (judged: none).
   * `at`: a few of each's places, PDF units
   */
  async groupsOff(n: number, o: { crops?: boolean } = {}) {
    const panes = h.panes as Panes
    const stack = panes.right
    const doc = h.composed as import('pdfjs-dist').PDFDocumentProxy
    const cfg = (await doc.getOptionalContentConfig({ intent: 'display' })) as OptionalContentConfig
    const ids = new Map<string, string>()
    for (const [id, g] of cfg as unknown as Iterable<[string, { name?: unknown }]>)
      if (typeof g?.name === 'string' && groupOf(g.name)) ids.set(g.name, id)
    const here = [...ids.keys()].filter((name) => groupOf(name)?.page === n).sort()
    const was = stack.contentOf
    let k0 = 0
    const t0 = performance.now()
    /** page n drawn by the right's stack with the names given off, every other group on; its pixels */
    const draw = async (off: readonly string[]) => {
      const gone = new Set(off)
      for (const [name, id] of ids) cfg.setVisibility(id, !gone.has(name), false)
      const key = `i2:${n}:${++k0}`
      const shown = new Promise<void>((done, fail) => {
        const t = setTimeout(() => fail(new Error(`page ${n} not drawn with ${key} in 20 s`)), 20_000)
        const stop = stack.on('shown', (e) => {
          if (e.n !== n || e.key !== key) return
          clearTimeout(t)
          stop()
          done()
        })
      })
      stack.contentOf = (m) => (m === n ? { key, doc, config: Promise.resolve(cfg), own: false, over: null } : was(m))
      stack.refresh(n)
      await shown
      const canvas = (stack.page(n) as HTMLElement).querySelector(
        '.axt-slot-view .canvasWrapper canvas',
      ) as HTMLCanvasElement
      const c = new OffscreenCanvas(canvas.width, canvas.height).getContext('2d') as OffscreenCanvasRenderingContext2D
      c.drawImage(canvas, 0, 0)
      return { w: canvas.width, h: canvas.height, data: c.getImageData(0, 0, canvas.width, canvas.height).data }
    }
    const same = (A: Uint8ClampedArray, B: Uint8ClampedArray, i: number) =>
      A[i] === B[i] && A[i + 1] === B[i + 1] && A[i + 2] === B[i + 2]
    flushing.on = true
    try {
      const on = await draw([])
      const none = await draw(here)
      const vp = stack.viewport(n) as import('pdfjs-dist').PageViewport
      const W = on.w,
        H = on.h,
        k = W / vp.width
      /** a box of the page (PDF units) as the device pixels it is drawn in and one more on each side, inclusive */
      const dev = (b: Box): [number, number, number, number] => {
        const [ax, ay] = vp.convertToViewportPoint(b[0], b[3]) as [number, number],
          [bx, by] = vp.convertToViewportPoint(b[2], b[1]) as [number, number]
        return [
          Math.max(0, Math.floor(Math.min(ax, bx) * k) - 1),
          Math.max(0, Math.floor(Math.min(ay, by) * k) - 1),
          Math.min(W - 1, Math.ceil(Math.max(ax, bx) * k) + 1),
          Math.min(H - 1, Math.ceil(Math.max(ay, by) * k) + 1),
        ]
      }
      const fill = (mask: Uint8Array, boxes: readonly Box[], v = 1) => {
        for (const b of boxes) {
          const [x0, y0, x1, y1] = dev(b)
          for (let y = y0; y <= y1; y++) mask.fill(v, y * W + x0, y * W + x1 + 1)
        }
        return mask
      }
      const pdfAt = (p: number) =>
        vp.convertToPdfPoint((p % W) / k, Math.floor(p / W) / k).map((v) => Math.round(v * 10) / 10)
      const inBox = (b: Box, x: number, y: number) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]
      // (the page's members, the stated ink of each group, and what the layer states stays in no group of the document)
      const members = membersOf(h.parts.values())
      const stated = new Map<string, Box[]>()
      const staying: Box[] = []
      for (const m of members.values()) {
        const s = statedInk(m, n)
        staying.push(...s.kept, ...s.displays)
        for (const bit of [1, 2, 4] as const) {
          if (!s[bit].length) continue
          const name = groupName(m.ord, n, bit)
          if (ids.has(name)) stated.set(name, s[bit])
          else staying.push(...s[bit])
        }
      }
      // (each stated group's member, by name; the stated ink of every member, each pixel the count of members stating it)
      const ordOf = (name: string) => groupOf(name)?.ord ?? -1
      const statedBy = new Map<number, Box[]>()
      for (const [name, boxes] of stated) statedBy.set(ordOf(name), [...(statedBy.get(ordOf(name)) ?? []), ...boxes])
      const stating = new Uint8Array(W * H)
      for (const boxes of statedBy.values()) {
        const m = fill(new Uint8Array(W * H), boxes)
        for (let p = 0; p < W * H; p++)
          if (m[p] && (stating[p] as number) < 255) stating[p] = (stating[p] as number) + 1
      }
      // (the page's text items in no optional content run of ours, by their place: text.ts's own reading of the runs)
      const content = await (await doc.getPage(n)).getTextContent({ includeMarkedContent: true })
      const free: [number, number][] = []
      {
        const depth: boolean[] = []
        for (const e of content.items as {
          str?: string
          transform?: number[]
          width?: number
          type?: string
          tag?: string
        }[]) {
          if (typeof e.str === 'string') {
            if (!e.str.trim() || depth.some(Boolean)) continue
            const [a, b, , , x, y] = e.transform as number[]
            const len = Math.hypot(a as number, b as number) || 1
            free.push([
              (x as number) + ((a as number) / len) * ((e.width ?? 0) / 2),
              (y as number) + ((b as number) / len) * ((e.width ?? 0) / 2),
            ])
          } else if (e.type === 'beginMarkedContentProps' || e.type === 'beginMarkedContent')
            depth.push(e.type === 'beginMarkedContentProps' && e.tag === 'OC')
          else if (e.type === 'endMarkedContent') depth.pop()
        }
      }
      // pass 1: each group on alone: its own ink (where it differs from none on), and how many groups paint each pixel
      const own = new Map<string, Int32Array>()
      const painters = new Uint8Array(W * H)
      for (const name of here) {
        const only = await draw(here.filter((x) => x !== name))
        const at: number[] = []
        for (let p = 0, i = 0; p < W * H; p++, i += 4)
          if (!same(only.data, none.data, i)) {
            at.push(p)
            if ((painters[p] as number) < 255) painters[p] = (painters[p] as number) + 1
          }
        own.set(name, Int32Array.from(at))
      }
      let cropsMade = 0
      /** 48 device px a side of a render about pixel p, four times larger, as a PNG data URL */
      const cropOf = async (img: { data: Uint8ClampedArray }, p: number) => {
        const R = 24,
          x0 = Math.max(0, (p % W) - R),
          y0 = Math.max(0, Math.floor(p / W) - R),
          w = Math.min(W - x0, 2 * R),
          hh = Math.min(H - y0, 2 * R)
        const part = new ImageData(w, hh)
        for (let y = 0; y < hh; y++)
          part.data.set(img.data.subarray(4 * ((y0 + y) * W + x0), 4 * ((y0 + y) * W + x0 + w)), 4 * y * w)
        const a = new OffscreenCanvas(w, hh)
        ;(a.getContext('2d') as OffscreenCanvasRenderingContext2D).putImageData(part, 0, 0)
        const b = new OffscreenCanvas(4 * w, 4 * hh)
        const g = b.getContext('2d') as OffscreenCanvasRenderingContext2D
        g.imageSmoothingEnabled = false
        g.drawImage(a, 0, 0, 4 * w, 4 * hh)
        const blob = await b.convertToBlob({ type: 'image/png' })
        return await new Promise<string>((done) => {
          const r = new FileReader()
          r.onload = () => done(String(r.result))
          r.readAsDataURL(blob)
        })
      }
      // pass 2: each group off alone, against every group on
      const rows = []
      for (const name of here) {
        const mine = fill(new Uint8Array(W * H), stated.get(name) ?? [])
        // (another member's stated ink: a pixel more members state than this group's own member)
        const member = fill(new Uint8Array(W * H), statedBy.get(ordOf(name)) ?? [])
        const ownMask = new Uint8Array(W * H)
        for (const p of own.get(name) ?? []) ownMask[p] = 1
        const off = await draw([name])
        let changed = 0,
          neighbour = 0,
          beyond = 0,
          shown = 0
        const neighbourAt: number[][] = [],
          beyondAt: number[][] = [],
          shownAt: number[][] = []
        let first = -1
        for (let p = 0, i = 0; p < W * H; p++, i += 4) {
          const d = !same(on.data, off.data, i)
          if (d) {
            changed++
            if (!mine[p] && (!ownMask[p] || (stating[p] as number) > (member[p] as number))) {
              neighbour++
              if (first < 0) first = p
              if (neighbourAt.length < 4) neighbourAt.push(pdfAt(p))
            } else if (!mine[p]) {
              beyond++
              if (beyondAt.length < 4) beyondAt.push(pdfAt(p))
            }
          } else if (ownMask[p] && painters[p] === 1 && !same(on.data, none.data, i)) {
            shown++
            if (first < 0) first = p
            if (shownAt.length < 4) shownAt.push(pdfAt(p))
          }
        }
        // (the page's text items in no run of ours standing in its stated ink and in no kept ink: a mark of it drawn whatever
        // its visibility)
        const boxes = stated.get(name) ?? []
        const unheldAt = free
          .filter(([x, y]) => boxes.some((b) => inBox(b, x, y)) && !staying.some((b) => inBox(b, x, y)))
          .map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])
        // (`crops`: around a group's first pixel judged, the page with every group on, with it off and with every group off, 48
        // device px a side drawn four times larger, for a reader of the run to look at)
        const crops =
          o.crops && first >= 0 && cropsMade++ < 6
            ? { on: await cropOf(on, first), off: await cropOf(off, first), none: await cropOf(none, first) }
            : null
        rows.push({
          name,
          stated: boxes.length,
          own: own.get(name)?.length ?? 0,
          changed,
          neighbour,
          beyond,
          shown,
          unheld: unheldAt.length,
          ...(neighbourAt.length ? { neighbourAt } : {}),
          ...(beyondAt.length ? { beyondAt } : {}),
          ...(shownAt.length ? { shownAt } : {}),
          ...(unheldAt.length ? { unheldAt: unheldAt.slice(0, 4) } : {}),
          ...(crops ? { crops } : {}),
        })
      }
      return { n, size: [W, H], groups: here.length, renders: k0, ms: Math.round(performance.now() - t0), rows }
    } finally {
      flushing.on = false
      stack.contentOf = was
      stack.refresh(n)
    }
  },
  /**
   * I7 at the reader's seam, on the right's committed page n: for every laid member, the boxes the highlight lights on the left
   * pane (the committed Page's `lit.left`, every sentence's, as highlight.ts entriesOf reads them: a box set along a direction as
   * the page's box it stands in) are the boxes the right hides (each of the member's groups the `laid` configuration holds off,
   * as compose/groups.ts set it and the right's page view draws with it, its ink as the layer states it: statedInk) and keeps
   * (its ink in no group, or in a group left on: lit with it on both panes; its displays apart, blocks of their own), within
   * the part's own rounding (PART_ROUNDING; for a member set along a direction, its run's rounding turned onto the page with
   * it): `hidden` every hidden box held by the lit boxes (its area no lit box holds
   * counted), `lit` every lit box the extent of the hidden and kept ink inside it (one that holds none, or whose edge stands
   * past that ink, counted). `seed`: the check's own fault on its copy of the page (`unlit`: a member's last lit box dropped;
   * `wide`: its first lit box widened by 2 pt), the check's red
   */
  async sameBoxes(n: number, o: { seed?: 'unlit' | 'wide' } = {}) {
    const committed = h.composer?.laid(n)
    if (!committed) return null
    const page = structuredClone(committed) as Page
    const c = await (h.groups as Groups).laid
    const off = new Set<string>()
    for (const [, g] of c as unknown as Iterable<[string, { name?: unknown; visible: boolean }]>)
      if (typeof g?.name === 'string' && !g.visible && groupOf(g.name)?.page === n) off.add(g.name)
    let seeded = false
    const out = { n, laid: 0, mirrored: 0, turned: 0, boxes: 0, hidden: 0, differ: [] as Record<string, unknown>[] }
    for (const m of page.members) {
      if (m.state !== 'laid') {
        out.mirrored++
        continue
      }
      const pl = h.composer?.member(m.ord)
      if (!pl) continue
      out.laid++
      const dir = m.lit.dir
      if (dir) out.turned++
      let lit = m.lit.left.flat().map((b) => (dir ? pageBoxOf(b, dir) : ([...b] as Box)))
      if (o.seed && !seeded && lit.length > 1) {
        seeded = true
        if (o.seed === 'unlit') lit = lit.slice(0, -1)
        else lit[0] = [lit[0]?.[0] as number, lit[0]?.[1] as number, (lit[0]?.[2] as number) + 2, lit[0]?.[3] as number]
      }
      const s = statedInk(pl, n)
      const hidden: Box[] = [],
        kept: Box[] = [...s.kept]
      for (const bit of [1, 2, 4] as const) (off.has(groupName(m.ord, n, bit)) ? hidden : kept).push(...s[bit])
      out.boxes += lit.length
      out.hidden += hidden.length
      // (a member set along a direction: its lit boxes stated in its run's frame, each rounded there and turned onto the page,
      // its hidden ones on the page's axes: the two roundings together)
      const tol = dir ? PART_ROUNDING * (1 + Math.abs(dir[0]) + Math.abs(dir[1])) : PART_ROUNDING
      const cover = lit.map((b) => grown(b, tol))
      const unheld = hidden.map((b) => ({ b, area: uncovered(b, cover) })).filter((x) => x.area > tol * tol)
      const both = [...hidden, ...kept]
      const loose = lit
        .map((b) => ({ b, ink: extentIn(b, both) }))
        .filter(({ b, ink }) => !ink || ink.some((v, i) => Math.abs(v - (b[i] as number)) > tol))
      if (unheld.length || loose.length)
        out.differ.push({
          ord: m.ord,
          id: pl.text,
          kind: pl.kind,
          ...(dir ? { dir } : {}),
          off: m.off,
          ...(unheld.length
            ? {
                hiddenUnlit: unheld
                  .slice(0, 3)
                  .map((x) => ({ box: x.b.map((v) => +v.toFixed(2)), area: +x.area.toFixed(2) })),
              }
            : {}),
          ...(loose.length
            ? {
                litBeyond: loose
                  .slice(0, 3)
                  .map((x) => ({ box: x.b.map((v) => +v.toFixed(2)), ink: x.ink?.map((v) => +v.toFixed(2)) ?? null })),
              }
            : {}),
        })
    }
    return out
  },
  /** the right's committed page n as the text layer reads it: the Page (its members' laid items, as laidText reads them) and
   *  the layer's own text items in order (its leaf spans: a span holding none of its own, PDF.js's marked content's not read
   *  twice), so that a reading made without a browser from the same Page can be held against it */
  readingOf(n: number) {
    const page = h.composer?.laid(n)
    const slot = (h.panes as Panes).right.page(n) as HTMLElement | null
    const layer = slot?.querySelector('.axt-over .textLayer')
    if (!page || !layer) return null
    const leaves = [...layer.querySelectorAll('span')]
      .filter((x) => !x.querySelector('span'))
      .map((x) => x.textContent ?? '')
    return { page, leaves }
  },
  /**
   * The storage check (design-reduction 3g(2)): the original at `url`, on a server of another origin than ours, read by the
   * reader's own range reader as the reader reads arXiv's copy (`own` false: no entity-tag asked, `no-store`) and opened by
   * PDF.js, held to the head's chunk digests (`prove`, unless `unheld`: the seed's reader that never holds them) once the head
   * is read: after the open (the chunks read before it compared then), or before any byte (`headFirst`: every chunk compared
   * as it is given); then every chunk read. What was proven, read, and why the source was refused
   */
  async elsewhere(url: string, chunks: string, o: { unheld?: boolean; headFirst?: boolean } = {}) {
    const kit = await loadKit()
    const refused: string[] = []
    // (a source refused while PDF.js opens the document: the open given up there, as the reader's session gives it up)
    let refuse: (e: unknown) => void = () => {}
    const refusal = new Promise<never>((_, no) => {
      refuse = no
    })
    refusal.catch(() => {})
    const source = rangeSource({
      fetch: (u, i) => fetch(u, i),
      url,
      own: false,
      store: chunkStore(),
      refused: (e) => {
        refused.push(e.kind)
        refuse(e)
      },
    })
    const first = o.headFirst && !o.unheld ? await source.prove(chunks) : null
    const task = openRanged(kit.lib as never, source, { options: kit.options('original') })
    let pages = 0,
      opened: true | string = true
    try {
      pages = (await Promise.race([task.promise, refusal])).numPages
    } catch (e) {
      opened = String((e as Error)?.message ?? e).slice(0, 160)
    }
    const readBefore = o.headFirst ? { chunks: 0, proven: 0 } : { ...source.digested }
    const proved = o.unheld ? null : o.headFirst ? first : await source.prove(chunks)
    let read: true | string = true
    const total = source.bound?.total ?? 0
    try {
      for (let a = 0; a < total; a += 65536) await source.read(a, Math.min(total, a + 65536))
    } catch (e) {
      read = (e as { kind?: string }).kind ?? String(e)
    }
    await Promise.race([task.destroy().catch(() => {}), new Promise((f) => setTimeout(f, 2000))])
    kit.release('original')
    return {
      pages,
      opened,
      readBefore,
      proved,
      read,
      refusal: source.refusal?.kind ?? null,
      refused,
      digested: source.digested,
      chunks: Math.ceil(total / 65536),
    }
  },
  /** another target whose rows are not in yet (`give` and `end` them later): the pages laid before kept until its commits */
  async retargetLater(target: string, name: string) {
    const fx = await (await fetch(`/fixtures/${name}/index.json`)).json()
    const all = ((await (await fetch(`/fixtures/${name}/${fx.rows.de ?? 'de.rows.json'}`)).json()) as { rows: Row[] })
      .rows
    const given = new Map<string, Row>()
    const listeners = new Set<() => void>()
    const rows = {
      target,
      done: false,
      get: (id: string) => given.get(id),
      on(f: () => void) {
        listeners.add(f)
        return () => listeners.delete(f)
      },
      give(ids?: string[]) {
        for (const r of all) if (!ids || ids.includes(r.id)) given.set(r.id, r)
        for (const f of [...listeners]) f()
      },
      end() {
        rows.done = true
        for (const f of [...listeners]) f()
      },
      get rowsCount() {
        return given.size
      },
    }
    h.rows = rows
    ;(h.composer as Composer).setLayer(
      { part: async (n) => h.parts.get(n) ?? null, pages: (h.head as Head).paper.pages },
      rows,
    )
  },
  /** the right's page n's translating marks: each one's box in shares of its slot, and the looks the sheet gives them */
  marksOf(n: number) {
    const slot = (h.panes as Panes).right.page(n) as HTMLElement
    const el = slot.querySelector<HTMLElement>('.axt-translating')
    if (!el) return null
    const o0 = slot.getBoundingClientRect()
    // (the slot's box inside PDF.js's page border: the overlay's)
    const s = {
      left: o0.left + slot.clientLeft,
      top: o0.top + slot.clientTop,
      width: slot.clientWidth,
      height: slot.clientHeight,
    }
    const ms = [...el.querySelectorAll<HTMLElement>('.axt-translating-mark')]
    const anims = el.getAnimations({ subtree: true }) as CSSAnimation[]
    const pass = anims.filter((a) => a.animationName === 'axt-tr-pass')
    const cs = getComputedStyle(el),
      m0 = ms[0] ? getComputedStyle(ms[0]) : null,
      b0 = ms[0] ? getComputedStyle(ms[0], '::before') : null
    const root = getComputedStyle(document.getElementById('root') as HTMLElement)
    return {
      count: ms.length,
      ariaHidden: el.getAttribute('aria-hidden'),
      pointerEvents: cs.pointerEvents,
      shares: ms.map((m) => {
        const r = m.getBoundingClientRect()
        return [(r.left - s.left) / s.width, (r.top - s.top) / s.height, r.width / s.width, r.height / s.height]
      }),
      delay: m0?.animationDelay,
      fade: m0?.animationDuration,
      background: m0?.backgroundColor,
      before: b0?.content,
      run: b0?.animationDuration,
      starts: [...new Set(pass.map((a) => a.startTime))],
      passes: pass.length,
      light: root.getPropertyValue('--axt-tr-light').trim(),
      angle: root.getPropertyValue('--axt-tr-angle').trim(),
      still: el.classList.contains('axt-translating-still'),
    }
  },
  /** the anchors of the right's laid page n: their names, hrefs and boxes */
  linksOf(n: number) {
    const slot = (h.panes as Panes).right.page(n) as HTMLElement
    return [...slot.querySelectorAll('.axt-over a.axt-link')].map((a) => ({
      href: a.getAttribute('href'),
      name: a.getAttribute('aria-label'),
      rect: a.getBoundingClientRect().toJSON(),
    }))
  },
  /** what the reader's own typesetter made of page n's links (`layer`'s `typeset`): its part's links, each with its fate
   *  (packages/typeset lay/links.ts LinkFate: what became of it), from page n laid again by layPage as typesetLay lays it (the
   *  rows' target's rules, the toggles' none left, the served Metrics and patterns) over the rows given; that lay's Page.links
   *  and the committed page's, which are to be the same */
  linkFatesOf(n: number) {
    const part = h.parts.get(n)
    const served = h.served
    const rows = h.rows
    if (!part || !served || !rows) return null
    const tag = ruleTag(rows.target)
    if (!tag) return null
    const hyph: Record<string, unknown> = {}
    for (const l of rulesFor(tag).patterns) hyph[l] = served.hyphNow(l) ?? null
    const fates: string[] = []
    const again = layPage(part, rows, rulesFor(tag, { leave: leftKinds(null) }, hyph), served.metrics, {
      linkFates: fates as never,
    })
    return {
      links: (part.links ?? []).map((l, i) => ({
        box: l.box,
        to: l.to,
        owner: l.owner ?? null,
        page: l.page ?? n,
        fate: fates[i] ?? null,
      })),
      laid: again.links,
      committed: h.composer?.laid(n)?.links ?? null,
    }
  },
  /** the laid page n's own link boxes (Page.links) on the screen, through the right's viewport of the page as it shows */
  linkBoxesOf(n: number) {
    const el = (h.panes as Panes).pageElement('right', n) as HTMLElement
    const r = el.getBoundingClientRect()
    return (h.composer?.laid(n)?.links ?? []).map(([b]) => {
      const q = (h.panes as Panes).boxOf('right', n, b) as { left: number; top: number; width: number; height: number }
      return { x: r.left + el.clientLeft + q.left, y: r.top + el.clientTop + q.top, width: q.width, height: q.height }
    })
  },
  /** the points a quarter and three quarters along each line box of member `ord` on page n's `side` (the boxes it is lit by),
   *  half way up it: relative to the page element's box (`at`) and on the screen (`x`, `y`) */
  linePoints(n: number, ord: number, side: 'left' | 'right') {
    const p = h.composer?.page(n),
      m = p?.members.find((x) => x.ord === ord)
    const committed = !!h.composer?.laid(n)
    const boxes = ((side === 'right' && committed ? m?.lit.right : m?.lit.left) ?? []).flat()
    const el = (h.panes as Panes).pageElement(side, n)
    if (!el || !boxes.length) return []
    const r = el.getBoundingClientRect()
    // (a turned member's boxes in its run's frame: a point of one at s along its run and t across it on the page)
    const [ux, uy] = m?.lit.dir ?? [1, 0]
    return boxes.flatMap((b) =>
      [0.25, 0.75].map((f) => {
        const s = b[0] + f * (b[2] - b[0]),
          t = (b[1] + b[3]) / 2
        const x = s * ux - t * uy,
          y = s * uy + t * ux
        const q = (h.panes as Panes).boxOf(side, n, [x, y, x, y]) as { left: number; top: number }
        return {
          at: [el.clientLeft + q.left, el.clientTop + q.top],
          x: r.left + el.clientLeft + q.left,
          y: r.top + el.clientTop + q.top,
        }
      }),
    )
  },
  /** at each point (`at`, CSS px in two shots of one element at dpr 1), how many pixels of the 9 × 9 around it differ */
  async differAt(a: string, b: string, points: number[][]) {
    const data = async (png: string) => {
      const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob())
      const c = new OffscreenCanvas(img.width, img.height).getContext('2d') as OffscreenCanvasRenderingContext2D
      c.drawImage(img, 0, 0)
      return c.getImageData(0, 0, img.width, img.height)
    }
    const A = await data(a),
      B = await data(b)
    return points.map(([x, y]) => {
      let n = 0
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++) {
          const px = Math.round((x as number) + dx),
            py = Math.round((y as number) + dy)
          if (px < 0 || py < 0 || px >= A.width || py >= A.height) continue
          const i = 4 * (py * A.width + px)
          let d = 0
          for (let c = 0; c < 3; c++) d += Math.abs((A.data[i + c] as number) - (B.data[i + c] as number))
          if (d > 12) n++
        }
      return n
    })
  },
  /** the screen point over the middle of member `ord`'s first right-pane box on page n, and its boxes on each pane */
  pointOf(n: number, ord: number, side: 'left' | 'right' = 'right') {
    const p = h.composer?.page(n),
      m = p?.members.find((x) => x.ord === ord)
    const committed = !!h.composer?.laid(n)
    const per = side === 'right' && committed ? m?.lit.right : m?.lit.left
    const f = per?.[0]?.[0]
    const el = (h.panes as Panes).pageElement(side, n)
    if (!f || !el) return null
    // (a turned member's box in its run's frame: its middle on the page)
    const [ux, uy] = m?.lit.dir ?? [1, 0]
    const [ms, mt] = [(f[0] + f[2]) / 2, (f[1] + f[3]) / 2]
    const b: [number, number, number, number] = m?.lit.dir
      ? [ms * ux - mt * uy, ms * uy + mt * ux, ms * ux - mt * uy, ms * uy + mt * ux]
      : f
    const q = (h.panes as Panes).boxOf(side, n, b) as { left: number; top: number; width: number; height: number }
    const r = el.getBoundingClientRect()
    // (one shape a sentence: the bands each pane shows of the member lit whole; `own` its displays, blocks of their own)
    return {
      x: r.left + el.clientLeft + q.left + q.width / 2,
      y: r.top + el.clientTop + q.top + q.height / 2,
      left: m?.lit.left.filter((b) => b.length).length ?? 0,
      right: ((committed ? m?.lit.right : m?.lit.left) ?? []).filter((b) => b.length).length,
      own: m?.lit.own.filter(([, x]) => x.length).length ?? 0,
    }
  },
  readers: [] as {
    reader: Reader
    root: HTMLElement
    asked: { url: string; at: number }[]
    /** every layer state the reader told, from its first (a check reads the whole run of them, not what a poll happened to see) */
    layers: string[]
    /** each call of the extension's host's translate (rows made here): the units' ids it was handed, in order, and its context */
    translated: { ids: string[]; context: { title?: string; abstract?: string } | null }[]
  }[],
  /** the held first layout let go (a reader opened with `holdFirstLay`) */
  releaseLay: null as (() => void) | null,
  /**
   * A reader through openReader over fixture `name`, with a fake host: the website's (`web`: our copy of the original, our server's
   * rows) or the extension's (`ext`: arXiv's own PDF, rows made here by a translate that yields the fixture's rows). Every fetch
   * the host is asked is recorded with its time; the fixture's lay stands in for the typesetter's
   */
  async reader(
    name: string,
    o: {
      host?: 'web' | 'ext'
      unlaid?: 'original' | 'composed'
      width?: string
      target?: string
      delayRowsMs?: number
      /** the host's own scrollers (its chrome's), under its root */
      panes?: { root: HTMLElement; left: HTMLElement; right: HTMLElement }
      /** the reader closed in the task that opened it (before PDF.js is in) */
      closeAtOnce?: boolean
      /** the first layout made (the first composed document's) held until `h.releaseLay()` */
      holdFirstLay?: boolean
      /** PDF.js's legacy build handed to the reader, as a host does below the modern build's floor */
      legacy?: boolean
      /** another paper than the fixture's (one our server does not have) */
      paper?: string
      /** no engine given: the reader's own typesetter (layPage over our site's faces and patterns, the reader's Metrics) */
      typeset?: boolean
      /** page 1 laid with runs of three inks (convert.ts inked) */
      inks?: boolean
    } = {},
  ) {
    const index = (await (await fetch(`/fixtures/${name}/index.json`)).json()) as { paper: string }
    const root = o.panes?.root ?? document.createElement('div')
    if (!o.panes) {
      root.style.cssText = `position:absolute;top:0;bottom:0;left:0;width:${o.width ?? '100%'}`
      if (o.width) root.style.left = `${100 * h.readers.length}%`.replace('100%', o.width)
      document.body.append(root)
    }
    const asked: { url: string; at: number }[] = []
    const t0 = performance.now()
    let fx: {
      seg: string
      dumps: Record<string, string>
      rows: Record<string, string>
      face: string | null
      id: string
    } | null = null
    const fxReady = fetch(`/fixtures/${name}/index.json`)
      .then((r) => r.json())
      .then((x) => (fx = x))
    const target = o.target ?? 'de'
    const ext = o.host === 'ext'
    const translated: (typeof h.readers)[number]['translated'] = []
    // (each layout the engine makes is a generation: its making marked `lay-asked`, each page it lays marked `lay`)
    let generations = 0
    const host = {
      fetch: (u: string, i?: RequestInit) => {
        asked.push({ url: u, at: performance.now() - t0 })
        return fetch(u, i)
      },
      original: (ref: string) =>
        ext ? `https://arxiv.org/pdf/${ref}` : `/api/v2/o/arxiv/${ref.replace(/[./]/g, '_')}.pdf`,
      prefs: {
        read: async () => ({ ...DEFAULTS, display: 'bilingual' as const, target, sync: true }),
        write: async () => {},
        watch: () => () => {},
      },
      ...(ext
        ? {
            translate: async function* (
              units: readonly { id: string }[],
              t: string,
              x: { signal: AbortSignal; context?: { title?: string; abstract?: string } },
            ) {
              translated.push({ ids: units.map((u) => u.id), context: x.context ?? null })
              await fxReady
              const all = (
                (await (
                  await fetch(
                    `/fixtures/${name}/${(fx as { rows: Record<string, string> }).rows[t] ?? `${t}.rows.json`}`,
                  )
                ).json()) as { rows: Row[] }
              ).rows
              const by = new Map(all.map((r) => [r.id, r]))
              if (o.delayRowsMs) await new Promise((f) => setTimeout(f, o.delayRowsMs))
              for (const u of units) {
                if (x.signal.aborted) return
                const r = by.get(u.id)
                yield r ?? ({ id: u.id, ok: false, why: { kind: 'refused' } } as Row)
              }
            },
          }
        : {}),
    }
    const reader = openReader(root, {
      host,
      ...(o.panes ? { panes: { left: o.panes.left, right: o.panes.right } } : {}),
      ...(o.legacy ? { pdfjs: LEGACY } : {}),
      paper: o.paper ?? index.paper,
      visit: { target },
      ...(o.typeset ? {} : { engine: fixtureEngine() }),
    })
    if (o.closeAtOnce) reader.close()
    const returnedAt = performance.now() - t0
    const layers = [reader.state().layer.s as string]
    reader.subscribe(() => {
      const s = reader.state().layer.s
      if (layers.at(-1) !== s) layers.push(s)
    })
    h.readers.push({ reader, root, asked, layers, translated })
    return { returnedAt, askedBeforeReturn: asked.map((a) => a.url) }
    function fixtureEngine(): Engine {
      return {
        faces: faceTable(h.kit?.base ?? '/pdfjs/6.3.289/'),
        unlaid: o.unlaid ?? 'original',
        lay: async (partOf, pages) => {
          const gen = ++generations
          h.marks.push({ what: 'lay-asked', at: performance.now() - t0, gen })
          if (o.holdFirstLay && gen === 1)
            await new Promise<void>((go) => {
              h.releaseLay = () => go()
            })
          await fxReady
          const parts = new Map<number, Part>()
          for (let n = 1; n <= pages; n++) {
            const p = await partOf(n)
            if (p) parts.set(n, p)
          }
          const dump = (await (
            await fetch(
              `/fixtures/${name}/${(fx as { dumps: Record<string, string> }).dumps[target] ?? `${target}.reader.json`}`,
            )
          ).json()) as ReaderDump
          const face = (fx as { face: string | null }).face
          const fixed = fixtureLay(
            pagesOf(
              parts,
              dump,
              (m) => face ?? ([...JSON.stringify(m)].some((c) => c.charCodeAt(0) > 127) ? 'cjk' : 'sans'),
            ),
            parts,
          )
          const laid = o.inks ? inked(fixed, 1) : fixed
          return (part, rows) => {
            h.marks.push({
              what: 'lay',
              at: performance.now() - t0,
              gen,
              page: part.page,
              members: part.flows.flat().length,
            })
            return laid(part, rows)
          }
        },
      }
    }
  },
  /** way (b): the left on the composed document too (its pages drawn again from it), the original's document let go */
  async toComposed() {
    const panes = h.panes as Panes
    const t = performance.now()
    await panes.open(h.composed as import('pdfjs-dist').PDFDocumentProxy)
    ;(h.composer as Composer).setDocuments({ original: null, composed: h.composed, groups: h.groups })
    await h.task?.destroy()
    h.kit?.release('original')
    return { reopenMs: Math.round(performance.now() - t) }
  },
  /** every page walked on the right (the left following), each drawn on both; then the memory the page holds, workers included */
  async walk() {
    const panes = h.panes as Panes
    const n = panes.right.pages
    const t = performance.now()
    for (let i = 1; i <= n; i++) {
      panes.goToPage('right', i)
      const t1 = performance.now()
      while (performance.now() - t1 < 8000) {
        // (drawn once on each pane: a page kept drawn is not drawn again)
        const right = h.marks.some((m) => m.what === 'drawn' && m.side === 'right' && m.page === i)
        const left = h.marks.some((m) => m.what === 'drawn' && m.side === 'left' && m.page === i)
        if (right && left) break
        await new Promise((f) => setTimeout(f, 20))
      }
    }
    const walkMs = performance.now() - t
    return { pages: n, walkMs: Math.round(walkMs), probe: panes.probe() }
  },
  one: null as {
    kind: string
    pane: HTMLElement
    stack?: Stack
    viewer?: unknown
    drawn: { n: number; at: number }[]
    t0: number
  } | null,
  /**
   * One pane over the original, full width: PDF.js's viewer as the left is today (`viewer`: eagerPages, quietRoot, its text and
   * annotation layers) or the page stack (`stack`: PDF.js's page views in slots, their own text and annotation layers, the
   * reader's scheduler). For deliverable 7's measurement: first paint, a scroll trace, memory, and the behaviours
   */
  async single(url: string, kind: 'viewer' | 'stack') {
    const t0 = performance.now()
    const kit = await loadKit()
    h.kit = kit
    root.className = 'axt-reader'
    addSheets(root, kit.sheet)
    const pane = document.createElement('div')
    pane.className = 'axt-pane left'
    pane.style.width = '100%'
    root.append(pane)
    const drawn: { n: number; at: number }[] = []
    const source = rangeSource({ fetch: (u, i) => fetch(u, i), url, own: url.startsWith('/'), store: chunkStore() })
    const task = openRanged(kit.lib as never, source, { options: kit.options('original') })
    const doc = await task.promise
    h.doc = doc
    const V = kit.viewer
    const bus = new V.EventBus()
    const links = new V.PDFLinkService({ eventBus: bus })
    const out: NonNullable<typeof h.one> = { kind, pane, drawn, t0 }
    if (kind === 'viewer') {
      quietRoot(document.documentElement.style)
      const inner = document.createElement('div')
      inner.className = 'pdfViewer'
      pane.append(inner)
      const Viewer = eagerPages(V.PDFViewer as never) as unknown as typeof V.PDFViewer
      const viewer = new Viewer({
        container: pane as HTMLDivElement,
        viewer: inner as HTMLDivElement,
        eventBus: bus,
        linkService: links,
        textLayerMode: 1,
        removePageBorders: false,
      } as never)
      links.setViewer(viewer)
      bus.on('pagerendered', (e: { pageNumber: number; isDetailView?: boolean }) => {
        if (!e.isDetailView) drawn.push({ n: e.pageNumber, at: performance.now() - t0 })
      })
      bus.on('pagesinit', () => {
        viewer.currentScaleValue = 'page-width'
      })
      viewer.setDocument(doc)
      links.setDocument(doc)
      out.viewer = viewer
    } else {
      const clock = ownedClock()
      const stack = createStack({
        scroller: pane,
        kit,
        scheduler: createScheduler(),
        clock,
        name: (n) => `page ${n}`,
        links,
      })
      links.setViewer({ scrollPageIntoView: () => {}, pagesCount: doc.numPages, currentPageNumber: 1 } as never)
      links.setDocument(doc)
      stack.contentOf = () => ({ key: 'original', doc, config: null, own: true, over: null })
      stack.on('drawn', (e) => {
        if (!e.detail) drawn.push({ n: e.n, at: performance.now() - t0 })
      })
      const p1 = (await doc.getPage(1)).getViewport({ scale: 1 })
      await stack.layout(doc, (pane.clientWidth - 40) / (p1.width * (96 / 72)))
      out.stack = stack
    }
    h.one = out
    return { pages: doc.numPages }
  },
  /** the pane scrolled through `ms` at `px` a frame: each frame's time (rAF to rAF), the pages drawn meanwhile */
  async scrollTrace(ms = 4000, px = 40) {
    const s = h.one as NonNullable<typeof h.one>
    const frames: number[] = []
    const t0 = performance.now(),
      d0 = s.drawn.length
    let last = t0
    await new Promise<void>((done) => {
      const step = (t: number) => {
        frames.push(t - last)
        last = t
        s.pane.scrollTop += px
        if (t - t0 < ms && s.pane.scrollTop + s.pane.clientHeight < s.pane.scrollHeight) requestAnimationFrame(step)
        else done()
      }
      requestAnimationFrame(step)
    })
    frames.shift()
    const sorted = [...frames].sort((a, b) => a - b)
    const q = (k: number) =>
      Math.round((sorted[Math.min(sorted.length - 1, Math.floor(k * sorted.length))] ?? 0) * 10) / 10
    return {
      frames: frames.length,
      p50: q(0.5),
      p95: q(0.95),
      max: q(1),
      over50: frames.filter((f) => f > 50).length,
      drawn: s.drawn.length - d0,
      scrolled: s.pane.scrollTop,
    }
  },
  async memory() {
    const m = (performance as unknown as { measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }> })
      .measureUserAgentSpecificMemory
    return crossOriginIsolated && m ? Math.round(((await m.call(performance)).bytes / 2 ** 20) * 10) / 10 : null
  },
  /** the behaviours on a pane: text layers on the pages near, a selection across two pages, links, a detail view at a zoom */
  async behaviours() {
    const s = h.one as NonNullable<typeof h.one>
    s.pane.scrollTop = 0
    await new Promise((f) => setTimeout(f, 600))
    const pages = [...s.pane.querySelectorAll<HTMLElement>('.page')].filter((p) => p.querySelector('.textLayer span'))
    const a = pages[0]?.querySelector('.textLayer span'),
      b = pages[1]?.querySelector('.textLayer span:last-of-type')
    let across = ''
    if (a && b) {
      const r = document.createRange()
      r.setStart(a, 0)
      r.setEnd(b, b.childNodes.length)
      const sel = getSelection() as Selection
      sel.removeAllRanges()
      sel.addRange(r)
      across = sel.toString()
      sel.removeAllRanges()
    }
    const anchors = s.pane.querySelectorAll('.annotationLayer a').length
    return {
      textPages: pages.length,
      selectionAcross: across.length,
      firstPageText: (a?.textContent ?? '').length,
      anchors,
    }
  },
  /** each page's box on both panes: [width, height, top in the pane's scroll] */
  boxes() {
    const p = h.panes as Panes
    const out: { n: number; left: number[] | null; right: number[] | null }[] = []
    for (let n = 1; n <= p.right.pages; n++) {
      const of = (side: 'left' | 'right') => {
        const d = p.pageElement(side, n)
        if (!d) return null
        const r = d.getBoundingClientRect()
        // (its top in the pane's scroll, whatever the follower's transform: the stack is then its offsetParent)
        const stack = d.parentElement as HTMLElement
        const top = d.offsetTop + (d.offsetParent === stack ? stack.offsetTop : 0)
        return [Math.round(r.width * 100) / 100, Math.round(r.height * 100) / 100, top]
      }
      out.push({ n, left: of('left'), right: of('right') })
    }
    return out
  },
  probe: () => h.panes?.probe() ?? null,
}
;(globalThis as { __h?: typeof h }).__h = h
