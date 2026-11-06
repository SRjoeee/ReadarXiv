// What today's reader read of a paper that S.names reads, from the bundle it opened (the sweep cache, today.ts's CACHE): the
// file's name rows (each part's `layout.names`, decoded as layout/file.mjs indexLayout does: L2 file.mjs:943-950), each page's
// view (the part's `views`), and each page's characters as today's run read them from the page's server-made draw (the left
// part's `draw`: draw.mjs drawInputsOf, fonts.mjs classifyFont, layer2.mjs pageChars2, run.mjs:2839-2853), with today's own
// code (engine 065c1d973, read-only), as lab/typeset/derive.mjs runs it.
//
// One input of a page's characters the tap does not record: the width of each character in its font's design, which
// pageChars2 splits an item's width by (layer2.mjs wDesign: a canvas measure of the character in the role face, the served
// faces). The characters are read here under two stand-ins for it (`a`: every character alike; `b`: widths that vary by
// character), and a name's facts are taken only where both readings give the same (names.ts): there they are decided by the
// draw's items alone (each item's start, width, size and font, exact). Where a page's characters are in the tap
// (samples/pages, pass 2's own reading), those are read instead.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import type { NameRow, PageChar } from '../../src/shared/names.ts'
import { TAP, TODAY, unser } from './tap.ts'
import { CACHE } from './today.ts'

type Part = {
  pages: [number, number]
  views: number[]
  layout?: { names?: number[][] } | null
  leftParts?: { page: number; sha256: string }[]
}
type PartRef = { from: number; to: number; sha256: string }

const NAME_KEYS = [
  'abstract',
  'ref',
  'bib',
  'contents',
  'listfigure',
  'listtable',
  'appendix',
  'index',
  'proof',
  'preface',
  'glossary',
  'figure',
  'table',
] as const
const CENTRED = 1,
  CAPITALS = 2,
  RUN_IN = 4

export type TodayNames = {
  names: NameRow[]
  view(page: number): [number, number, number, number] | undefined
  draw(page: number): unknown | undefined
}
const papers = new Map<string, TodayNames | null>()

/** a paper's name rows, views and draws as today's reader read them; null where the cache holds no catalog of it */
export function todayNames(paper: string): TodayNames | null {
  if (papers.has(paper)) return papers.get(paper)!
  const cat = join(CACHE, 'papers', paper, 'catalog.json')
  let out: TodayNames | null = null
  if (existsSync(cat)) {
    const refs = ((JSON.parse(readFileSync(cat, 'utf8')).parts ?? []) as PartRef[]).sort((a, b) => a.from - b.from)
    const byOcc = new Map<number, NameRow>()
    const views = new Map<number, [number, number, number, number]>()
    const draws = new Map<number, string>()
    for (const ref of refs) {
      const f = join(CACHE, 'objects', ref.sha256)
      if (!existsSync(f)) continue
      const p = JSON.parse(readFileSync(f, 'utf8')) as Part
      const [lo, hi] = p.pages
      for (let q = lo; q <= hi; q++) {
        const v = 4 * (q - lo)
        views.set(q, [p.views[v]!, p.views[v + 1]!, p.views[v + 2]!, p.views[v + 3]!])
      }
      for (const l of p.leftParts ?? []) draws.set(l.page, l.sha256)
      for (const r of p.layout?.names ?? []) {
        if (byOcc.has(r[0]!)) continue
        const runIn = (r[10]! & RUN_IN) !== 0
        byOcc.set(r[0]!, {
          occurrence: r[0]!,
          key: NAME_KEYS[r[1]!]!,
          page: r[2]!,
          x0: r[3]!,
          baseline: r[4]!,
          x1: r[5]!,
          top: r[6]!,
          bottom: r[7]!,
          size: r[8]!,
          font: r[9]!,
          centred: (r[10]! & CENTRED) !== 0,
          capitals: (r[10]! & CAPITALS) !== 0,
          unit: r[11]!,
          glue: runIn ? r[12]! : 0,
          counter: runIn ? 0 : r[12]!,
          cx0: r[13]!,
          cx1: r[14]!,
        })
      }
    }
    const drawn = new Map<number, unknown>()
    out = {
      names: [...byOcc.values()].sort((a, b) => a.occurrence - b.occurrence),
      view: (q) => views.get(q),
      draw: (q) => {
        if (!drawn.has(q)) {
          const sha = draws.get(q)
          drawn.set(
            q,
            sha
              ? (JSON.parse(readFileSync(join(CACHE, 'objects', sha), 'utf8')) as { draw?: unknown }).draw
              : undefined,
          )
        }
        return drawn.get(q)
      },
    }
  }
  papers.set(paper, out)
  return out
}

/** the two stand-ins for a character's design width (layer2.mjs wDesign's canvas measure), at 100 px */
const WIDTHS = {
  a: () => 50,
  b: (ch: string) => 20 + (((ch.codePointAt(0) ?? 0) * 7919) % 61),
} as const
export type WidthMode = keyof typeof WIDTHS

type Today = {
  pageChars2: (tc: unknown, fontOf: unknown, mapOf: unknown, fills: unknown, nus: unknown) => PageChar[]
  drawInputsOf: (draw: unknown) => {
    items: unknown[]
    styles: Record<string, { fontFamily?: string }>
    fonts: Map<string, { name: string }>
    fills: unknown
    nus: unknown
  }
  classifyFont: (name: string, family?: string) => unknown
}
const engines = new Map<WidthMode, Promise<Today>>()
/** today's page reading, one module instance a stand-in (layer2's character widths are cached by the module) */
function engine(mode: WidthMode): Promise<Today> {
  let e = engines.get(mode)
  if (!e) {
    // (a canvas that measures each character by the stand-in the module instance was loaded under: none measures anything else
    // in a page's reading)
    const g = globalThis as unknown as { OffscreenCanvas?: unknown; __axtNamesWidth?: (ch: string) => number }
    g.OffscreenCanvas ??= class {
      getContext() {
        return { font: '', measureText: (s: string) => ({ width: (g.__axtNamesWidth ?? WIDTHS.a)(s) }) }
      }
    }
    const E = join(TODAY, 'src', 'pdf-reader', 'engine', 'layer-proto')
    e = (async () => {
      const L2 = await import(`${join(E, 'layer2.mjs')}?names=${mode}`)
      const D = await import(join(E, 'draw.mjs'))
      const F = await import(join(E, 'fonts.mjs'))
      return { pageChars2: L2.pageChars2, drawInputsOf: D.drawInputsOf, classifyFont: F.classifyFont } as Today
    })()
    engines.set(mode, e)
  }
  return e
}

/** a page's characters as today's run read them off its draw (run.mjs:2853), under a stand-in for the design widths */
export async function pageChars(paper: string, page: number, mode: WidthMode): Promise<PageChar[] | null> {
  const t = todayNames(paper)
  const draw = t?.draw(page)
  if (!draw) return null
  const E = await engine(mode)
  const x = E.drawInputsOf(draw)
  const cls = new Map<string, unknown>()
  const fontOf = (key: string) => {
    if (!cls.has(key)) cls.set(key, E.classifyFont(x.fonts.get(key)?.name ?? '', x.styles[key]?.fontFamily))
    return cls.get(key)
  }
  const g = globalThis as unknown as { __axtNamesWidth?: (ch: string) => number }
  g.__axtNamesWidth = WIDTHS[mode]
  return E.pageChars2({ items: x.items, styles: x.styles }, fontOf, () => null, x.fills, x.nus ?? null)
}

const tapPages = new Map<string, Record<string, PageChar[]> | null>()
/** a page's characters as pass 2 of the tap read them (samples/pages), or null where the tap holds none of the page */
export function tapChars(pair: string, page: number): PageChar[] | null {
  if (!tapPages.has(pair)) {
    const f = join(TAP, 'samples', 'pages', `${pair}.pages.json.gz`)
    tapPages.set(
      pair,
      existsSync(f)
        ? ((unser(JSON.parse(gunzipSync(readFileSync(f)).toString('utf8'))) as { pages: Record<string, PageChar[]> })
            .pages ?? null)
        : null,
    )
  }
  return tapPages.get(pair)?.[String(page)] ?? null
}
