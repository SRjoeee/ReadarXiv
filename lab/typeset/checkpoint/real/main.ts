// The checkpoint's examples through the reader itself (lab/typeset/checkpoint/real.mjs drives it through `window.__r`): a paper
// opened by `openReader` with a website-like host (our server's v2 document, its bundle and a rows object, all on the loopback),
// its pages laid by the reader harness's stand-in of the typesetter (packages/reader/e2e/page/convert.ts: fixtureLay over the
// dump made into Pages, the seam `engine.lay` that lane L3's layPage fills), and composed, painted and cropped by the reader's own
// composer: the composed document with each laid member's groups off as its Page says, its SVG and its crops over it. Nothing of
// the sheet's drawing page (page/main.ts) is used: no run is spread over its laid extent (the reader draws a run from its x).
// With `laid` (laid.mjs's file), a page the runner laid is the typesetter's own display list instead (each laid member's runs
// and crops where the typesetter put them, its groups off by layPage's rule), its other members the original's.
import type { Part } from '@readarxiv/format'
import { fixtureLay, membersOf, pagesOf, type ReaderDump } from '../../../../packages/reader/e2e/page/convert.ts'
import type { Laid, Page } from '../../../../packages/reader/src/compose/page.ts'
import { DEFAULTS } from '../../../../packages/reader/src/prefs.ts'
import { openReader, type Reader } from '../../../../packages/reader/src/reader.ts'

const root = document.getElementById('root') as HTMLElement
let reader: Reader | null = null
const added: FontFace[] = []

const r = {
  /** the paper opened: `paper` its id with version, `dump` the URL of the reader dump that stands for the typesetter's lay, the
   *  served faces' slices (each a FontFace `ck-<id>` over its code points) and the faces a run is drawn in, first to last */
  async open(o: {
    paper: string
    target: string
    dump: string
    /** laid.mjs's pages of this pair: page → its laid members */
    laid?: Record<string, Laid[]> | null
    slices: Record<string, { url: string; range: string }[]>
    faces: string[]
  }) {
    for (const f of added) document.fonts.delete(f)
    added.length = 0
    for (const [id, list] of Object.entries(o.slices))
      for (const s of list) {
        const face = new FontFace(`ck-${id}`, `url(${s.url})`, { unicodeRange: s.range })
        document.fonts.add(face)
        added.push(face)
      }
    reader?.close()
    const [first, ...rest] = o.faces
    const marks: string[] = []
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
            classes: { figures: true, tables: true, heads: true, references: true, names: true },
          }),
          write: async () => {},
          watch: () => () => {},
        },
      },
      paper: o.paper,
      visit: { target: o.target, display: 'translation' },
      engine: {
        faces: Object.fromEntries(
          [
            ['text', '400', 'normal'],
            ['w400', '400', 'normal'],
            ['w700', '700', 'normal'],
            ['w400i', '400', 'italic'],
            ['w700i', '700', 'italic'],
            ['w500', '500', 'normal'],
            ['w600', '600', 'normal'],
          ].map(([id, weight, style]) => [
            id,
            { local: `ck-${first}`, weight, style, fallback: [...rest.map((f) => `"ck-${f}"`), 'serif'].join(', ') },
          ]),
        ),
        unlaid: 'original',
        lay: async (partOf, pages) => {
          const parts = new Map<number, Part>()
          for (let n = 1; n <= pages; n++) {
            const p = await partOf(n)
            if (p) parts.set(n, p)
          }
          const dump = (await (await fetch(o.dump)).json()) as ReaderDump
          // (the runner's dump holds a few lines whose text is null: drawn as nothing, as the sheet did)
          for (const u of dump.units) for (const l of u.lines) if (typeof l.text !== 'string') l.text = ''
          marks.push(`lay ${parts.size} parts`)
          const fixture = fixtureLay(
            pagesOf(parts, dump, () => 'text'),
            parts,
          )
          const laid = o.laid
          if (!laid) return fixture
          return (part, rows) => {
            const own = laid[String(part.page)]
            if (!own) return fixture(part, rows)
            const by = new Map(own.map((l) => [l.ord, l]))
            const members = [...membersOf([part]).values()]
              .filter((m) => m.lines.some((l) => l[0] === part.page))
              .sort((a, b) => a.ord - b.ord)
              .map(
                (m): Laid =>
                  by.get(m.ord) ?? {
                    ord: m.ord,
                    page: part.page,
                    state: 'none',
                    off: 0,
                    lines: [],
                    lit: { left: [], right: [], own: [] },
                  },
              )
            return { page: part.page, wait: { rows: [], faces: [] }, members, links: [] } satisfies Page
          }
        },
      },
    })
    ;(r as { marks?: string[] }).marks = marks
    return true
  },
  state: () => {
    const s = reader?.state()
    return s ? { original: s.original, layer: s.layer, rows: s.rows, view: s.view.sides, scale: s.view.scale } : null
  },
  /** the reader at scale 1 (PDF.js's 96/72 CSS px a point) on page n of the translation's pane */
  go(n: number) {
    reader?.do({ do: 'zoom', to: 1 })
    reader?.do({ do: 'page', side: 'right', page: n })
    return true
  },
  /** page n of the right pane: whether it shows a committed overlay, how many members it draws, and where the slot stands */
  slot(n: number) {
    const el = root.querySelector<HTMLElement>(`.axt-pane.right .page.axt-slot[data-page-number="${n}"]`)
    if (!el) return null
    const over = el.querySelector('.axt-over')
    const svg = over?.querySelector('svg')
    const rect = el.getBoundingClientRect()
    return {
      over: !!over,
      members: svg?.querySelectorAll('g').length ?? 0,
      crops: !!over?.querySelector('canvas.axt-crops'),
      marks: el.querySelectorAll('.axt-translating-mark').length,
      canvas: !!el.querySelector('canvas'),
      viewBox: svg?.getAttribute('viewBox') ?? null,
      rect: [rect.left + el.clientLeft, rect.top + el.clientTop, el.clientWidth, el.clientHeight],
    }
  },
  /** the right pane scrolled so that the region's top (PDF units, y up, on page n) stands `margin` CSS px under its top */
  reveal(n: number, top: number, margin = 20) {
    const el = root.querySelector<HTMLElement>(`.axt-pane.right .page.axt-slot[data-page-number="${n}"]`)
    const pane = root.querySelector<HTMLElement>('.axt-pane.right')
    if (!el || !pane) return false
    const svg = el.querySelector('.axt-over svg')
    const vb = (svg?.getAttribute('viewBox') ?? '').split(' ').map(Number)
    const h = vb[3] || 792
    const s = el.clientHeight / h
    const want = el.getBoundingClientRect().top + el.clientTop + (h - top) * s - pane.getBoundingClientRect().top - margin
    pane.scrollTop += want
    return true
  },
  fonts: async () => {
    await document.fonts.ready
    return document.fonts.size
  },
}
;(globalThis as { __r?: typeof r }).__r = r
