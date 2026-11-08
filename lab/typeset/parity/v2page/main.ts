// v2's side of the parity check, the page lab/typeset/parity/render.mjs drives through `window.__p`: a paper opened by
// `openReader` with a website-like host (our server's v2 document, its bundle, a rows object and the served faces, all on
// the loopback) and no engine of the host's, so that the reader draws with its own served faces (compose/served.ts) as the
// website's reader does; the one seam replaced is the lay itself: compose/typeset.ts's `typesetLay`, which the build of this
// page (render.mjs's `layHook`) makes return `globalThis.__parityLay`, the entry's own Page of each page as v2.mjs laid it in
// Node (design-a's layPage over the part, the pair's door rows and the layered metrics: lab/typeset/checkpoint/laid.mjs
// `--entry`'s Page). A Page whose runs' faces are not loaded yet is answered as the typesetter answers it (`wait.faces`), so
// that the composer asks the served faces and lays the page again: the same path as a page laid in the browser. Everything
// else (composing, the groups off, the SVG, the crops, the links) is the reader's own. What it drew is read back with
// measure-dom.mjs, as today's is.
import { cropsOf } from '../../../../packages/reader/src/compose/paint.ts'
import type { Laid, Page } from '../../../../packages/reader/src/compose/page.ts'
import { DEFAULTS } from '../../../../packages/reader/src/prefs.ts'
import { openReader, type Reader } from '../../../../packages/reader/src/reader.ts'
import { linesOfSvg } from '../measure-dom.mjs'

type Metrics = { ready(face: string, text: string): boolean | 'never' }
const root = document.getElementById('root') as HTMLElement
let reader: Reader | null = null
let pages: Record<string, { members: Laid[]; links: Page['links'] }> = {}
let asked: Record<string, number> = {}

;(globalThis as { __parityLay?: unknown }).__parityLay = (part: { page: number }, _rows: unknown, metrics: Metrics): Page => {
  const n = part.page
  asked[n] = (asked[n] ?? 0) + 1
  const got = pages[String(n)]
  if (!got) return { page: n, wait: { rows: [], faces: [] }, members: [], links: [] }
  // (the faces its runs are set in, each as the typesetter asks it: a face not loaded yet is waited for)
  const need: [string, string][] = []
  for (const m of got.members)
    for (const [, , , items] of m.lines)
      for (const it of items) if (!('src' in it) && metrics.ready(it.face, it.s) === false) need.push([it.face, it.s])
  if (need.length)
    return {
      page: n,
      wait: { rows: [], faces: need },
      members: got.members.map((m) => ({ ...m, state: 'waiting', off: 0, lines: [] })),
      links: [],
    }
  return { page: n, wait: { rows: [], faces: [] }, members: got.members, links: got.links }
}

const slotOf = (n: number) => root.querySelector<HTMLElement>(`.axt-pane.right .page.axt-slot[data-page-number="${n}"]`)

const p = {
  /** the paper opened over its v2 document, its pages the entry's (v2.mjs's `pages`) */
  async open(o: { paper: string; target: string; pages: typeof pages }) {
    pages = o.pages
    asked = {}
    reader?.close()
    reader = openReader(root, {
      host: {
        fetch: (u, i) => fetch(u, i),
        original: (ref) => `/api/v2/o/arxiv/${ref.replace(/[./]/g, '_')}.pdf`,
        prefs: {
          read: async () => ({
            ...DEFAULTS,
            display: 'translation' as const,
            target: o.target,
            sync: false,
          }),
          write: async () => {},
          watch: () => () => {},
        },
      },
      paper: o.paper,
      visit: { target: o.target, display: 'translation' },
    })
    return true
  },
  state: () => {
    const s = reader?.state()
    return s ? { original: s.original, layer: s.layer, rows: s.rows, scale: s.view.scale, faces: s.faces } : null
  },
  /** the reader at scale 1 (PDF.js's 96/72 CSS px a point) on page n of the translation's pane */
  go(n: number) {
    reader?.do({ do: 'zoom', to: 1 })
    reader?.do({ do: 'page', side: 'right', page: n })
    return true
  },
  /** page n of the right pane: whether its overlay is committed, and where the slot stands */
  slot(n: number) {
    const el = slotOf(n)
    if (!el) return null
    const over = el.querySelector('.axt-over')
    const rect = el.getBoundingClientRect()
    return {
      over: !!over,
      canvas: !!el.querySelector('canvas'),
      marks: el.querySelectorAll('.axt-translating-mark').length,
      asked: asked[n] ?? 0,
      rect: [rect.left + el.clientLeft, rect.top + el.clientTop, el.clientWidth, el.clientHeight],
      /** each canvas of the slot: its pixels and the CSS box it is drawn in (a copy drawn at another size than its box is
       *  resampled) */
      canvases: [...el.querySelectorAll('canvas')].map((c) => {
        const r = c.getBoundingClientRect()
        return [c.className, c.width, c.height, Math.round(r.width * 1000) / 1000, Math.round(r.height * 1000) / 1000]
      }),
    }
  },
  /** the right pane scrolled so that page n's top stands `margin` CSS px under the pane's */
  reveal(n: number, margin = 8) {
    const el = slotOf(n)
    const pane = root.querySelector<HTMLElement>('.axt-pane.right')
    if (!el || !pane) return false
    pane.scrollTop += el.getBoundingClientRect().top - pane.getBoundingClientRect().top - margin
    return true
  },
  /** what page n drew, read back: each member's lines (`g[data-axt-ord]`), its links, the lit boxes its Page carries */
  measure(n: number, view: [number, number, number, number]) {
    const el = slotOf(n)
    const svg = el?.querySelector<SVGSVGElement>('.axt-over svg')
    const got = pages[String(n)]
    const page: Page | null = got ? { page: n, wait: { rows: [], faces: [] }, members: got.members, links: got.links } : null
    const crops = page ? cropsOf(page).map((c) => [c.ord, ...c.at]) : []
    const vb = (svg?.getAttribute('viewBox') ?? '').split(' ').map(Number)
    const k = svg && vb[2] ? vb[2] / (view[2] - view[0]) : 1
    return {
      committed: !!svg,
      units: svg ? linesOfSvg(svg, 'data-axt-ord', view, k, crops) : [],
      crops,
      links: got?.links.length ?? 0,
      // (the links a reader can follow on the page: the overlay's anchors on a laid page, PDF.js's annotation layer's on a page
      // the reader shows as arXiv's)
      linksDrawn: el?.querySelectorAll('.axt-links a, .annotationLayer a').length ?? 0,
      lit: (got?.members ?? []).filter((m) => m.state === 'laid' && m.lit.right.some((b) => b.length)).map((m) => m.ord),
    }
  },
  /** the translated text alone (the page view's canvas, the crops and the links hidden), the members `hide` names (its
   *  figure texts, which today's shot hides too) out of it */
  textOnly(on: boolean, hide: number[] = []) {
    document.documentElement.toggleAttribute('data-parity-text', on)
    for (const g of root.querySelectorAll<SVGGElement>('.axt-over svg g[data-axt-ord]'))
      g.style.display = on && hide.includes(Number(g.dataset.axtOrd)) ? 'none' : ''
    return true
  },
  fonts: async () => {
    await document.fonts.ready
    return document.fonts.size
  },
  close() {
    reader?.close()
    reader = null
  },
}
;(globalThis as { __p?: typeof p }).__p = p
