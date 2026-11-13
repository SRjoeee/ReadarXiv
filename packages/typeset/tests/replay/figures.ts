// S.figures replayed against the baseline's reader dumps (baseline/FORMAT.md §4 `figures`: each figure text of the pages laid,
// drawn or why not, and where its markup drew it): every page's figure units as today's bundle holds them (today-figures.ts),
// each unit's row as the door gave it, its faces by B.faces' port over the run's roles and the paper's designs (the ledger's
// `info.paper`), its widths and inks from the pair's metrics table, the target's rules. Each outcome projected as the dump
// projects today's (reader-entry.mjs othersOfSvg over layer2.mjs svgOfFigure): the anchor's place through the page's viewport
// at the dump's scale, its CSS pixels on a 1/100 grid (n2), back to PDF units on a 1/100 grid (r2); its turn; its runs' text.
// The document's groups of the figure units (the add-on's VIS, which `unhidden` reads) are not in the cache's JSON: taken as
// held (no dump says `unhidden`). Today's S.figures set a translation by its advance, as a line whose marks' ems hold no blank
// half: replayed with `marks: 'today'`, its faces state no measure of their marks (Face.ids none: script.ts markOf finds no
// blank half, which S.figures' blanksOf alone reads of them), the rest the target's own; else by its ink, as v2 sets every
// line. One rule departs from today's on purpose (the owner's rule of 2026-11-13, F41: width is the fit's only test, no stroke
// under a text measured): a text today left `crowded` over a stroke under it (its row stating the stroke) that S.figures draws
// now is `cleared`, and each other text of its set that moves only where its line starts, its size stepping with the set's,
// `stepped`: neither is a difference.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { faceOf } from '../../src/breaker/faces.ts'
import { type MeasureTable, tableMetrics } from '../../src/metrics/table.ts'
import { type Figure, figures } from '../../src/shared/figures.ts'
import { derived, firstDifference, LAB, ledger, readGz, TAP } from './tap.ts'
import { paperOf } from './today.ts'
import { figureUnits, todayFigures } from './today-figures.ts'
import { rolesOf } from './tokens-input.ts'

type Raw = Record<string, unknown>
/** the dump's figure text: its unit, page, whether drawn, why not, its line as drawn */
export type DumpFigure = {
  id: string | null
  ord: number
  page: number
  drawn: boolean
  why?: string
  line?: { x0: number; baseline: number; rot?: number; text: string }
}
/** the dump's scale (reader-entry.mjs SCALE): CSS pixels a PDF unit */
const SCALE = 2.5
const n2 = (v: number) => Math.round(v * 100) / 100
const r2 = n2
/** a PDF point in the page's viewport at `scale`, unrotated (PDF.js PageViewport's transform, applyTransform) */
function viewportPoint(view: readonly number[], x: number, y: number, scale: number): [number, number] {
  const [v0, v1, v2, v3] = view as [number, number, number, number]
  const cx = (v2 + v0) / 2,
    cy = (v3 + v1) / 2
  const m = [scale, 0, 0, -scale, Math.abs(cx - v0) * scale - scale * cx, Math.abs(cy - v1) * scale + scale * cy]
  return [x * m[0]! + y * m[2]! + m[4]!, x * m[1]! + y * m[3]! + m[5]!]
}
/** a figure's outcome as the dump writes it */
export function dumpOf(f: Figure, id: string | null, view: readonly number[]): DumpFigure {
  const out: DumpFigure = { id, ord: f.id, page: f.page, drawn: f.drawn, ...(f.why ? { why: f.why } : {}) }
  if (f.drawn) {
    const [px, py] = viewportPoint(view, f.x!, f.y!, SCALE)
    const turn = Math.abs(f.angle!) > 1e-6 ? n2(-f.angle!) : 0
    out.line = {
      x0: r2(n2(px) / SCALE + view[0]!),
      baseline: r2(view[3]! - n2(py) / SCALE),
      ...(turn ? { rot: -turn } : {}),
      text: f.runs!.map((r) => r.s).join(''),
    }
  }
  return out
}

let rules: { targets: Record<string, { params: Raw }> } | null = null
const ids = new Map<string, (string | null)[]>()
/** a paper's units' content ids by ord (the baseline's prepare dump: the dump's join key) */
const idsOf = (paper: string) => {
  if (!ids.has(paper)) {
    const d = JSON.parse(
      readFileSync(join(LAB, 'refactor-2026-11', 'baseline', 'prepare', `${paper}.prepare.json`), 'utf8'),
    ) as { units: { id: string; ord: number }[] }
    const list: (string | null)[] = []
    for (const u of d.units) list[u.ord] = u.id
    ids.set(paper, list)
  }
  return ids.get(paper)!
}

/** a pair's figure texts replayed, page by page, with the dump's; the first difference of each, by ord and page */
export function replayFigures(
  pair: string,
  o: { marks?: 'today' } = {},
): { equal: number; total: number; differ: string[]; extra: string[]; cleared: string[]; stepped: string[] } {
  const L = ledger(pair)
  const paper = paperOf(pair)
  const tf = todayFigures(paper)
  const dump = JSON.parse(
    readFileSync(join(LAB, 'refactor-2026-11', 'baseline', 'reader', `${pair}.reader.json`), 'utf8'),
  ) as { figures: DumpFigure[]; pages: { page: number }[] }
  const want = new Map(dump.figures.map((f) => [`${f.ord}|${f.page}`, f]))
  if (!tf)
    return {
      equal: 0,
      total: dump.figures.length,
      differ: ['no bundle in the cache'],
      extra: [],
      cleared: [],
      stepped: [],
    }
  rules ??= derived('rules')
  const R = rules!.targets[L.target]!.params as { cjkQuotes?: boolean; floorMin: number; compressMax: number }
  const info = L.info.paper as { designs: Record<string, string> }
  const roles = rolesOf(pair)
  const metrics = tableMetrics(readGz(join(TAP, 'metrics', `${pair}.metrics.json.gz`)) as MeasureTable)
  const unit = figureUnits(pair, paper)
  const differ: string[] = [],
    extra: string[] = [],
    cleared: string[] = [],
    stepped: string[] = []
  let equal = 0
  const seen = new Set<string>()
  for (const { page } of dump.pages) {
    const rows = tf.figures(page)
    if (!rows.length) continue
    const got = figures({
      figures: rows,
      unit,
      src: tf.src,
      grouped: () => true,
      designs: info.designs,
      faceOf: (st, cls) => (o.marks === 'today' ? { ...faceOf(roles, st, cls), ids: [] } : faceOf(roles, st, cls)),
      rules: R,
      metrics,
    })
    // (the texts today left crowded over a stroke under them that S.figures draws now, and their sets)
    const rowOf = new Map(rows.map((r) => [r.id, r]))
    const clears = (f: Figure) => {
      const r = rowOf.get(f.id),
        w = want.get(`${f.id}|${f.page}`),
        under = tf.under(f.id, f.page)
      return !!r && !!w && !w.drawn && w.why === 'crowded' && f.drawn && under !== null && Number.isFinite(under)
    }
    const clearedSets = new Set(got.figures.filter(clears).map((f) => rowOf.get(f.id)!.set ?? rowOf.get(f.id)!.group))
    for (const f of got.figures) {
      const key = `${f.id}|${f.page}`
      seen.add(key)
      const w = want.get(key)
      if (!w) {
        extra.push(`ord ${f.id} p${f.page}: not in the dump`)
        continue
      }
      if (clears(f)) {
        cleared.push(`ord ${f.id} p${f.page}`)
        continue
      }
      const d = firstDifference(dumpOf(f, idsOf(paper)[f.id] ?? null, tf.view(page)!), w, `ord ${f.id} p${f.page}`)
      const r = rowOf.get(f.id)
      if (d && r && clearedSets.has(r.set ?? r.group) && /^ord \d+ p\d+\.line\.x0: /.test(d))
        stepped.push(`ord ${f.id} p${f.page}`)
      else if (d) differ.push(d)
      else equal++
    }
  }
  for (const [key] of want) if (!seen.has(key)) differ.push(`${key}: in the dump, not replayed`)
  return { equal, total: dump.figures.length, differ, extra, cleared, stepped }
}
