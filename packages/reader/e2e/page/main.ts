// The harness page: the reader's parts, driven by the checks (run.mjs) through `window.__h`. Nothing here reaches the network
// but the page's own origin and the stand-in of arXiv's server, which the route table answers.
import { type Head, type Part, read, type Row } from '@readarxiv/format'
import { composedSource } from '../../src/bytes/composed.ts'
import { openRanged } from '../../src/bytes/ranged.ts'
import { type OriginalSource, rangeSource } from '../../src/bytes/source.ts'
import { chunkStore } from '../../src/bytes/store.ts'
import { DEFAULTS } from '../../src/prefs.ts'
import { type Composer, createComposer, type RowsSource } from '../../src/compose/composer.ts'
import { createFaces, type Faces } from '../../src/compose/faces.ts'
import { groupsOf, type Groups } from '../../src/compose/groups.ts'
import { createHighlight, type Highlight } from '../../src/compose/highlight.ts'
import type { Page } from '../../src/compose/page.ts'
import { fixtureLay, membersOf, pagesOf, type ReaderDump } from './convert.ts'
import { createPanes, type Panes } from '../../src/panes/panes.ts'
import { createStack, type Stack } from '../../src/stack/stack.ts'
import { eagerPages, quietRoot } from '../../src/panes/left.ts'
import { loadKit } from '../../src/pdfjs/kit.ts'
import { ownedClock } from '../../src/stack/clock.ts'
import { createScheduler } from '../../src/stack/scheduler.ts'
import { addSheets } from '../../src/styles.ts'
import { CATALOGUE_WORDS } from '../../src/compose/words.ts'
import { openReader, type Reader } from '../../src/reader.ts'

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
  head: null as Head | null,
  parts: new Map<number, Part>(),
  pages: new Map<number, Page>(),
  rows: null as (RowsSource & { give(ids?: string[]): void; end?(): void; rowsCount: number }) | null,
  external: [] as string[],
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
  /**
   * The layer of fixture `name` over the original open: its head and parts read from our server's objects, the original's chunks
   * proved, the composed document opened over the same store, its groups read, the fixture's dump made into Pages, the rows
   * given (all at once, or none until `give`), the right composed. `unlaid`: what a page not laid is drawn from
   */
  async layer(
    name: string,
    o: {
      unlaid?: 'original' | 'composed'
      rows?: 'all' | 'none'
      target?: string
      classes?: Record<'figures' | 'tables' | 'heads' | 'references' | 'names', boolean>
      ahead?: number
    } = {},
  ) {
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
    const target = o.target ?? 'de'
    const dump = (await (
      await fetch(`/fixtures/${name}/${fx.dumps[target] ?? `${target}.reader.json`}`)
    ).json()) as ReaderDump
    const all = (
      (await (await fetch(`/fixtures/${name}/${fx.rows[target] ?? `${target}.rows.json`}`)).json()) as { rows: Row[] }
    ).rows
    const pages = pagesOf(
      parts,
      dump,
      (m) => fx.face ?? ([...JSON.stringify(m)].some((c) => c.charCodeAt(0) > 127) ? 'cjk' : 'sans'),
    )
    h.pages = pages
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
    h.rows = rows
    h.faces ??= createFaces({
      table: faceTable(kit.base),
      fetch: (u, i) => fetch(u, i),
      root,
      warn: (w, e) => console.warn(w, e),
    })
    const panes = h.panes as Panes
    h.composer?.dispose()
    const composer = createComposer({
      stack: panes.right,
      kit,
      faces: h.faces,
      lay: fixtureLay(pages, parts),
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
    const items = (await (await (h.doc as import('pdfjs-dist').PDFDocumentProxy).getPage(n)).getTextContent())
      .items as { str: string; transform: number[]; width: number }[]
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
        at: firstOf(m.ord),
        t: m.lines.flatMap(([, , , its]) => its.filter((i) => !('src' in i)).map((i) => i.s)).filter((s) => s.trim()),
      }))
      .sort((a, b) => a.at - b.at)
      .map((x) => x.t)
    return { spans: spans.length, text: spans.join(''), copied, laid: runs.map((r) => r.join('')), runs }
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
  /** a language switch: the same layer, other rows (`target`): what it reuses (the composed document, the parts, the store),
   *  where the reader stays, and the pages laid again */
  async retarget(target: string, name: string) {
    const before = { composed: h.composed, place: (h.panes as Panes).reading(), laid: (h.composer as Composer).probe() }
    const fx = await (await fetch(`/fixtures/${name}/index.json`)).json()
    const all = (
      (await (await fetch(`/fixtures/${name}/${fx.rows[target] ?? `${target}.rows.json`}`)).json()) as { rows: Row[] }
    ).rows
    const given = new Map(all.map((r) => [r.id, r]))
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
  /** the screen point over the middle of member `ord`'s first right-pane box on page n, and its boxes on each pane */
  pointOf(n: number, ord: number, side: 'left' | 'right' = 'right') {
    const p = h.composer?.page(n),
      m = p?.members.find((x) => x.ord === ord)
    const committed = !!h.composer?.laid(n)
    const per = side === 'right' && committed ? m?.lit.right : m?.lit.left
    const b = per?.[0]?.[0]
    const el = (h.panes as Panes).pageElement(side, n)
    if (!b || !el) return null
    const q = (h.panes as Panes).boxOf(side, n, b) as { left: number; top: number; width: number; height: number }
    const r = el.getBoundingClientRect()
    // (one shape a sentence, and one of its kept ink: the bands each pane shows of the member lit whole)
    return {
      x: r.left + el.clientLeft + q.left + q.width / 2,
      y: r.top + el.clientTop + q.top + q.height / 2,
      left: m?.lit.left.filter((b) => b.length).length ?? 0,
      right: ((committed ? m?.lit.right : m?.lit.left) ?? []).filter((b) => b.length).length,
      own: m?.lit.own.some(([, x]) => x.length) ? 1 : 0,
    }
  },
  readers: [] as { reader: Reader; root: HTMLElement; asked: { url: string; at: number }[] }[],
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
            translate: async function* (units: readonly { id: string }[], t: string, x: { signal: AbortSignal }) {
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
      paper: index.paper,
      visit: { target },
      engine: {
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
          const laid = fixtureLay(
            pagesOf(
              parts,
              dump,
              (m) => face ?? ([...JSON.stringify(m)].some((c) => c.charCodeAt(0) > 127) ? 'cjk' : 'sans'),
            ),
            parts,
          )
          return (part, rows) => {
            h.marks.push({ what: 'lay', at: performance.now() - t0, gen, page: part.page })
            return laid(part, rows)
          }
        },
      },
    })
    if (o.closeAtOnce) reader.close()
    const returnedAt = performance.now() - t0
    h.readers.push({ reader, root, asked })
    return { returnedAt, askedBeforeReturn: asked.map((a) => a.url) }
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
