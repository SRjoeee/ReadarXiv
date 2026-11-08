// D.display against the baseline's reader dumps (baseline/FORMAT.md §4: each laid unit's size, leading, lines and the crops
// painted): every laid unit of a pair laid by the chain from F2 and filled by its page's pass (pass.ts), its lines drawn by
// D.display (src/emit/display.ts), projected as the baseline's harness reads today's drawing (baseline/tools/reader.mjs
// dumpOf, reader-entry.mjs unitsOfSvg and run()): a line's page, baseline, x0 and x1 today's record's (RUN:1829 recLinesOf,
// to 1/100), its text the SVG's line on the same page within 0.05 of that baseline (each <text>'s tspans, a crop's copy text
// read as U+FFFC, two <text>s on one y within 0.01 one line), each crop's box its device pixels (hideOps' dst, the page's
// viewport at the harness's scale 2.5) read back over the page's view. The page views are today's bundle's (each part's
// `views`, PDF.js page.view: the sweep cache, tests/replay/today.ts); a crop's piece index, which the tap's tokens file does
// not keep on the crop, is read back from the round's U.elements slot (each placeholder's mode and k in the row's order, a
// crop of n parts n tokens), a crop the run set before the first line (a label's, a number's) none.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Layout } from '../../src/fit/types.ts'
import { displayLines } from '../../src/emit/display.ts'
import type { PassUnit } from '../../src/shared/fill-pass.ts'
import { framed, laysOf, passesOf, trackedCells } from './pass.ts'
import { firstDifference, flooredIn, LAB, ledger } from './tap.ts'
import { CACHE, paperOf } from './today.ts'

/** the harness's CSS pixels a PDF unit (reader-entry.mjs SCALE; dpr 1: its audit's device pixels too) */
export const SCALE = 2.5
const OBJ = '￼'
const r2 = (v: number) => Math.round(v * 100) / 100
const n2 = r2

/**
 * A page's viewport at `scale` (PDF.js PageViewport, rotation 0, its arithmetic as it is: convertToViewportPoint), PDF
 * units to pixels, y down
 */
export function viewport(view: readonly number[], scale = SCALE): (x: number, y: number) => [number, number] {
  const centerX = (view[2]! + view[0]!) / 2,
    centerY = (view[3]! + view[1]!) / 2
  const offsetCanvasX = Math.abs(centerX - view[0]!) * scale,
    offsetCanvasY = Math.abs(centerY - view[1]!) * scale
  const m = [
    scale,
    0,
    0,
    -1 * scale,
    offsetCanvasX - 1 * scale * centerX - 0 * scale * centerY,
    offsetCanvasY - 0 * scale * centerX - -1 * scale * centerY,
  ]
  return (x, y) => [x * m[0]! + y * m[2]! + m[4]!, x * m[1]! + y * m[3]! + m[5]!]
}

/** the baseline's reader-dump unit (FORMAT.md §4), as far as the typesetter decides it */
export type DumpUnit = {
  size: number | null
  leading: number | null
  lines: { page: number; x0: number; x1: number; baseline: number; text: string | null }[]
  elements?: { k: number | null; page: number; x0: number; x1: number; top: number; bottom: number }[]
}

/**
 * A laid unit as the baseline's harness reads today's drawing of it: its record's size, leading and lines, each line's text
 * the drawing's, each crop's box. `view(page)`: the page's view (PDF.js page.view); its pages painted in their order
 */
export function dumpUnit(p: Pick<PassUnit, 'layout'>, view: (page: number) => readonly number[] | undefined): DumpUnit {
  const L = p.layout as Layout
  const pages = [...new Set(L.lines.map((l) => l.page))].sort((a, b) => a - b)
  const svg: { page: number; baseline: number; text: string }[] = []
  const elements: NonNullable<DumpUnit['elements']> = []
  for (const pg of pages) {
    const v = view(pg)
    if (!v) throw new Error(`no view of page ${pg}`)
    const px = viewport(v)
    // (svgOfUnit's <text>s on the page, read as unitsOfSvg reads them: y, and the text of its tspans)
    const texts: { y: number; text: string }[] = []
    for (const [y, x0, , items] of displayLines(L, pg)) {
      const by = px(x0, y)[1]
      let body = '',
        hasBody = false,
        parts = false
      for (const it of items) {
        if ('src' in it) {
          if (it.s) {
            body += OBJ
            hasBody = true
          }
          continue
        }
        if (it.skew) {
          if (hasBody) texts.push({ y: n2(by), text: body })
          body = ''
          hasBody = false
          parts = true
          texts.push({ y: it.rise ? n2(by - it.rise * SCALE) : n2(by), text: it.s })
        } else {
          body += it.s
          hasBody = true
        }
      }
      if (!(parts && !hasBody)) texts.push({ y: n2(by), text: body })
      // (each crop as hideOps lays it: its ink's top on the line's baseline, its width the item's)
      for (const it of items) {
        if (!('src' in it)) continue
        const c = it.src
        const [dx, dy] = px(it.x, y + (c[4] - c[5]) * it.k)
        const dx1 = dx + it.w * SCALE,
          dy1 = dy + (c[4] - c[2]) * it.k * SCALE
        elements.push({
          k: it.piece === 'label' ? null : Number(it.piece),
          page: pg,
          x0: r2(dx / SCALE + v[0]!),
          x1: r2(dx1 / SCALE + v[0]!),
          top: r2(v[3]! - dy / SCALE),
          bottom: r2(v[3]! - dy1 / SCALE),
        })
      }
    }
    const merged: { y: number; text: string }[] = []
    for (const t of texts) {
      const last = merged.at(-1)
      if (last && Math.abs(last.y - t.y) < 0.01) last.text += t.text
      else merged.push({ ...t })
    }
    for (const t of merged) svg.push({ page: pg, baseline: r2(v[3]! - t.y / SCALE), text: t.text })
  }
  const used = new Set<number>()
  const lines = L.lines.map((l) => {
    const page = l.page,
      baseline = r2(l.baseline)
    const j = svg.findIndex((s, i) => !used.has(i) && s.page === page && Math.abs(s.baseline - baseline) <= 0.05)
    if (j >= 0) used.add(j)
    return { page, x0: r2(l.x0), x1: r2(l.x0 + (l.used ?? 0)), baseline, text: j >= 0 ? svg[j]!.text : null }
  })
  return {
    size: L.f ? r2(L.f) : null,
    leading: L.state?.lead ?? null,
    lines,
    ...(elements.length ? { elements } : {}),
  }
}

// ---------------------------------------------------------------- the replay's inputs
const views = new Map<string, Map<number, number[]>>()
/** a paper's page views, from today's bundle's parts (`pages` [from, to], `views` four numbers a page) */
export function viewsOf(paper: string): Map<number, number[]> {
  const got = views.get(paper)
  if (got) return got
  const out = new Map<number, number[]>()
  const cat = join(CACHE, 'papers', paper, 'catalog.json')
  if (existsSync(cat))
    for (const ref of (JSON.parse(readFileSync(cat, 'utf8')).parts ?? []) as { sha256: string }[]) {
      const f = join(CACHE, 'objects', ref.sha256)
      if (!existsSync(f)) continue
      const part = JSON.parse(readFileSync(f, 'utf8')) as { pages: [number, number]; views: number[] }
      for (let pg = part.pages[0]; pg <= part.pages[1]; pg++) {
        const i = (pg - part.pages[0]) * 4
        if (!out.has(pg)) out.set(pg, part.views.slice(i, i + 4))
      }
    }
  views.set(paper, out)
  return out
}

/** each crop of a lay given its piece index (today's crop.k), read back from its last round's U.elements slot */
export function pieceCrops(pair: string, lays: Map<number, PassUnit>): string[] {
  const L = ledger(pair)
  const off: string[] = []
  for (const [ord, p] of lays) {
    const u = L.units.find((x) => x.ord === ord)
    const last = Math.max(...(u?.slots.filter((s) => s.by === 'X.cut').map((s) => s.round) ?? [0]))
    const modes = ((u?.slots.find((s) => s.by === 'U.elements' && s.round === last)?.value as { modes?: unknown[][] })
      ?.modes ?? []) as [number, string, string, number, number, string][]
    const ks: number[] = []
    for (const [k, mode, , , , flags] of modes) {
      if (mode !== 'crop') continue
      const n = Number(/parts:(\d+)/.exec(flags ?? '')?.[1] ?? 1)
      for (let i = 0; i < n; i++) ks.push(k)
    }
    const crops = [...new Set(p.tokens.filter((t) => t.crop).map((t) => t.crop!))]
    if (crops.length < ks.length) {
      off.push(`ord ${ord}: ${crops.length} crops, ${ks.length} cropped placeholders`)
      continue
    }
    const lead = crops.length - ks.length
    crops.forEach((c, i) => {
      if (i >= lead) c.k = ks[i - lead]
    })
  }
  return off
}

type Dump = { units: ({ ord: number; id: string | null; kind: string } & DumpUnit)[] }
/** a pair's reader dump */
export const readerDump = (pair: string): Dump =>
  JSON.parse(readFileSync(join(LAB, 'refactor-2026-11', 'baseline', 'reader', `${pair}.reader.json`), 'utf8')) as Dump

export type DisplayResult = {
  units: number
  equal: number
  lines: number
  elements: number
  differ: { ord: number; d: string }[]
  /** the dump's laid units the chain did not lay */
  unlaid: number[]
  chains: string[]
  /** the dump's units whose frames the port fills each at its own leading (pass.ts framed) that it lays otherwise; the cells
   *  today's fill letter-spaced, laid untracked by the ruling of 2026-11-08 (pass.ts trackedCells), whose size and lines' text
   *  are today's; and those on a page where today's held a paragraph's gap to the next one's leading that it lays otherwise
   *  (tap.ts flooredIn: the gap ruling of 2026-11-08) */
  ruled: { frames: number; cells: number; gap: number }
}

/** D.display replayed on every laid unit of a pair's reader dump */
export function displayReplay(pair: string): DisplayResult {
  const { lays, differ: chains } = laysOf(pair)
  passesOf(pair, lays)
  const off = pieceCrops(pair, lays)
  const v = viewsOf(paperOf(pair))
  // (a cell today's fill letter-spaced, untracked by the ruling of 2026-11-08: its lines' text today's, their extents not)
  const untracked = trackedCells(pair)
  const out: DisplayResult = {
    units: 0,
    equal: 0,
    lines: 0,
    elements: 0,
    differ: [],
    unlaid: [],
    chains: [...chains, ...off],
    ruled: { frames: 0, cells: 0, gap: 0 },
  }
  const gap = flooredIn(pair)
  for (const u of readerDump(pair).units) {
    out.units++
    const p = lays.get(u.ord)
    if (!p) {
      out.unlaid.push(u.ord)
      continue
    }
    const mine = dumpUnit(p, (pg) => v.get(pg))
    const want = { size: u.size, leading: u.leading, lines: u.lines, ...(u.elements ? { elements: u.elements } : {}) }
    if (untracked.has(u.ord)) {
      const d = firstDifference(
        { size: mine.size, texts: mine.lines.map((l) => l.text) },
        { size: u.size, texts: u.lines.map((l) => l.text) },
        '',
      )
      if (d && gap.units.has(u.ord)) out.ruled.gap++
      else if (d) out.differ.push({ ord: u.ord, d })
      else out.ruled.cells++
      continue
    }
    const d = firstDifference(mine, want, '')
    if (d && framed(p)) out.ruled.frames++
    else if (d && gap.units.has(u.ord)) out.ruled.gap++
    else if (d) out.differ.push({ ord: u.ord, d })
    else {
      out.equal++
      out.lines += u.lines.length
      out.elements += u.elements?.length ?? 0
    }
  }
  return out
}
