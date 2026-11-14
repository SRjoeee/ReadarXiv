// U.blocks (design-b §1.5; lab/typeset/registry.ts): a unit's lines grouped into blocks, each with the original's
// baselines, its grid, its pitch and its measures; the blocks of one flow of TeX's lines told apart (T21, E10, E11).
// Ported from layer2.mjs at 065c1d973: blocks2 L2:2966-3032, blocksOf2 L2:626-695, measuresOf L2:549-576, evenGridOf
// L2:3172-3176, tightOf L2:3037-3040. Pure: no input is mutated, every block is a new object.
//
// Its inputs, and the part's field each comes from once lane L1 states it (until then the tap's recorded values):
// - `rects`: the unit's lines as rectangles, its baseline less 0.215 and plus 0.683 of its size (tex.mjs texRects) ← Placed.lines
//   (page, x0, x1, base, size; the band is today's reading of a line's extent)
// - `lineInfo`: each line's exact baseline, size, top, bottom, its row `j` in the unit's lines and its frame ← Placed.lines
//   (base, top, bottom, col; `j` its index)
// - `keep`: the lines the unit keeps as the original's (held lines, a display's rows) ← Line flag KEPT
// - `regionOf`, `referenced`: the kept lines in runs, and the runs the text passes (U.breaks)
// - `breakAt`, `joinAt`, `paraAt`: where TeX's forced breaks and a group's paragraph end the lines (U.breaks)
// - `centred`: TeX's alignment of the unit ← Placed.align; `pageViews`: each page's box, read only where `centred` is not
//   told (a unit no file holds), which the part never leaves untold: void then
// - `lineskip`: TeX's \lineskip and \lineskiplimit ← Part.paper.lineskip
// - `pitch`: TeX's \baselineskip, the pitch it set the unit's lines at ← Placed.lead where the part states it (no 'lead' read)
import { median, type Rect, rectKey, rectKeyNoX0 } from '../util.ts'

/** how far apart two baselines are told (PDF units): a line's is stated to a hundredth, as the slots' feet read it */
const ON_BASE = 0.05

/** a line as the unit's reading knows it (tex.mjs:506 texParts' lineInfo) */
export type LineInfo = {
  baseline: number
  size: number
  top: number
  bottom: number
  exact?: boolean
  file?: boolean
  j?: number
  frame?: number
}

export type BlocksInput = {
  rects: readonly Rect[]
  pageViews: readonly (readonly number[] | undefined)[]
  keep: ReadonlySet<string> | null
  lineInfo: ReadonlyMap<string, LineInfo>
  regionOf?: ReadonlyMap<string, number> | null
  referenced?: ReadonlySet<number> | null
  lineskip?: readonly [skip: number, limit: number] | null
  breakAt?: ReadonlyMap<string, number> | null
  joinAt?: ReadonlyMap<string, number> | null
  centred?: boolean | undefined
  paraAt?: ReadonlySet<string> | null
  /** TeX's \baselineskip for the unit's lines (Placed.lead where the part states it): every block's pitch, null where unstated */
  pitch?: number | null
}

/** a block of a unit's lines (layer2.d.mts Block2): its lines, bounds, pitch, measures, the original's baselines `B` and
 *  grid `G` (its forced breaks' gaps closed), its one-pitch grid `E`, the kept regions before it (`after`), its flow */
export type Block = {
  page: number
  rects: Rect[]
  opens?: true
  x0: number
  x1: number
  top: number
  bottom: number
  h: number
  pitch: number
  indent: number
  centred: boolean
  measures: Map<string, [number, number]> | null
  after: number
  B: number[]
  exact: boolean[]
  sizes: number[]
  G?: number[]
  pitch0: number | null
  E?: number[]
  /** the room under its last line a translation may borrow (lay/adapt.ts: TeX's facts, Room.runs and Room.sep), 0 none */
  free: number
  flow: number
  through?: boolean
}

/** a change of a paragraph's measure: a line's edge this many em off the line's before it (L2:534) */
const STEP_EM = 2
/** lines set to one measure: their edges within this many em of it (L2:537) */
const MEASURE_TOL = 0.5

/** a block's lines by the measure TeX set each to, where it changed within the paragraph (L2:549 measuresOf) */
export function measuresOf(
  rects: readonly Rect[],
  keep: ReadonlySet<string> | null = null,
): Map<string, [number, number]> | null {
  const lines = rects.filter((r) => !keep?.has(rectKey(r)))
  const n = lines.length
  if (n < 4) return null
  const em = median(lines.map((r) => (r[4] - r[2]) / 0.894))
  const step = STEP_EM * em,
    tol = MEASURE_TOL * em
  const cuts = new Set<number>()
  for (const side of [1, 3] as const) {
    const e = lines.map((r) => r[side])
    for (let i = 2; i + 1 < n; i++) {
      if (!(Math.abs(e[i]! - e[i - 1]!) > step)) continue
      const widens = side === 3 ? e[i]! > e[i - 1]! : e[i]! < e[i - 1]!
      const before = Math.abs(e[i - 2]! - e[i - 1]!) <= tol || (side === 1 && i - 2 === 0 && e[0]! > e[1]!)
      const after = Math.abs(e[i + 1]! - e[i]!) <= tol || (side === 3 && widens && i + 1 === n - 1 && e[i + 1]! < e[i]!)
      if (before && after) cuts.add(i)
    }
  }
  if (!cuts.size) return null
  const out = new Map<string, [number, number]>()
  let from = 0
  for (const to of [...[...cuts].sort((a, b) => a - b), n]) {
    const run = lines.slice(from, to)
    const m: [number, number] = [Math.min(...run.map((r) => r[1])), Math.max(...run.map((r) => r[3]))]
    for (const r of run) out.set(rectKey(r), m)
    from = to
  }
  return out
}

/** a block's measure at slot `k` of its lines or at baseline `y`: its line's (measuresOf); between two lines of two
 *  measures the narrower of both (L2:579 measureAt) */
function measureAt(b: Measured, y: number | null, k: number | null): [number, number] {
  const at = (i: number) => b.measures!.get(rectKey(b.rects[i]!)) ?? [b.x0, b.x1]
  return k !== null && k >= 0 && k < b.rects.length ? at(k) : measureOn(b.G ?? b.B!, at, y!)
}
/** what a measure is read from: a block, or blocksOf2's block before its baselines (read by its lines alone) */
type Measured = Pick<Block, 'measures' | 'centred' | 'rects' | 'x0' | 'x1' | 'G'> & { B?: number[] }
/** a block's measure as its own lines are laid: measureAt where TeX changed it within the paragraph, else its edges
 *  (L2:585 measureOf) */
export const measureOf = (b: Measured, y: number | null, k: number | null): [number, number] =>
  b.measures && !b.centred ? measureAt(b, y, k) : [b.x0, b.x1]
/** the measure at baseline `y` of lines at baselines `Y` (top down), line i's `at(i)` (L2:588 measureOn) */
export function measureOn(Y: readonly number[], at: (i: number) => [number, number], y: number): [number, number] {
  if (y >= Y[0]! - 0.05) return at(0)
  for (let i = 0; i + 1 < Y.length; i++) {
    if (Math.abs(y - Y[i + 1]!) <= 0.05) return at(i + 1)
    if (y < Y[i]! && y > Y[i + 1]!) {
      const a = at(i),
        c = at(i + 1)
      return [Math.max(a[0], c[0]), Math.min(a[1], c[1])]
    }
  }
  return at(Y.length - 1)
}

type Raw = Omit<Block, 'after' | 'B' | 'exact' | 'sizes' | 'pitch0' | 'free' | 'flow'> & { after?: number }

/** the unit's lines as blocks, its kept lines never moved, each block with the kept regions before it (L2:626 blocksOf2) */
export function blocksOf2(i: BlocksInput): Raw[] {
  const { rects, pageViews, keep, regionOf, referenced, breakAt, joinAt, centred, paraAt } = i
  const kept = (r: Rect) => !!keep?.has(rectKey(r))
  const blocks: { page: number; rects: Rect[]; opens?: true }[] = []
  let cur: { page: number; rects: Rect[]; opens?: true } | null = null
  for (const [page, x0, y0, x1, y1] of rects) {
    const prev = cur?.rects.at(-1)
    const pitchSoFar =
      cur && cur.rects.length > 1 && !joinAt?.has(rectKey(prev!))
        ? cur.rects.at(-2)![4] - prev![4]
        : prev
          ? (prev[4] - prev[2]) * 1.4
          : 0
    const joined = !!cur && cur.page === page && !!joinAt?.has(rectKey([page, x0, y0, x1, y1]))
    const key = rectKey([page, x0, y0, x1, y1])
    const at = breakAt?.get(key)
    const opens = !!paraAt?.has(key) && at !== undefined && !!referenced?.has(at)
    const follows =
      !opens &&
      (joined ||
        (cur &&
          cur.page === page &&
          x0 < prev![3] &&
          x1 > prev![1] &&
          y1 < prev![4] &&
          prev![2] - y1 < Math.max(pitchSoFar, (prev![4] - prev![2]) * 1.4) * 0.9))
    if (!follows) {
      cur = { page, rects: [], ...(opens ? { opens: true as const } : {}) }
      blocks.push(cur)
    }
    cur!.rects.push([page, x0, y0, x1, y1])
  }
  const whole: Raw[] = blocks.map((b) => {
    const rs = b.rects
    const x0 = Math.min(...rs.map((r) => r[1]))
    const x1 = Math.max(...rs.map((r) => r[3]))
    const top = Math.max(...rs.map((r) => r[4]))
    const bottom = Math.min(...rs.map((r) => r[2]))
    const h = median(rs.map((r) => r[4] - r[2]))
    const pitch = rs.length > 1 ? median(rs.slice(1).map((r, k) => rs[k]![4] - r[4])) : h * 1.38
    const indent = Math.max(0, rs[0]![1] - x0)
    const centres = rs.map((r) => (r[1] + r[3]) / 2)
    const view = pageViews[b.page - 1]
    const pageCentre = view ? (view[0]! + view[2]!) / 2 : 306
    const widthsVary = Math.max(...rs.map((r) => r[3] - r[1])) - Math.min(...rs.map((r) => r[3] - r[1])) > 6
    const c =
      typeof centred === 'boolean'
        ? centred
        : rs.length > 1
          ? Math.max(...centres) - Math.min(...centres) < 3 && widthsVary
          : Math.abs(centres[0]! - pageCentre) < 3 && x1 - x0 < 0.8 * (view ? view[2]! - view[0]! : 612)
    return { ...b, x0, x1, top, bottom, h, pitch, indent, centred: c, measures: c ? null : measuresOf(rs, keep) }
  })
  if (!keep?.size && !breakAt?.size) return whole.map((b) => ({ ...b, after: 0 }))
  let after = 0
  return whole.flatMap((b) => {
    const runs: Raw[] = []
    let run: Raw | null = null
    b.rects.forEach((r, k) => {
      const brk = breakAt?.get(rectKey(r))
      if (brk !== undefined && referenced?.has(brk)) {
        run = null
        after = Math.max(after, brk + 1)
      }
      if (kept(r)) {
        run = null
        const g = regionOf?.get(rectKey(r))
        if (g !== undefined && referenced?.has(g)) after = Math.max(after, g + 1)
      } else {
        if (!run) {
          const { opens, ...rest } = b
          run = { ...rest, ...(k === 0 && opens ? { opens } : {}), rects: [], indent: k === 0 ? b.indent : 0, after }
          runs.push(run)
        }
        ;(run as Raw).rects.push(r)
      }
    })
    for (const x of runs) {
      x.top = Math.max(...x.rects.map((q) => q[4]))
      x.bottom = Math.min(...x.rects.map((q) => q[2]))
    }
    return runs
  })
}

/** whether TeX's \lineskip rule set two consecutive lines `gap` apart (L2:3037 tightOf) */
function tightOf(
  upper: LineInfo | undefined,
  lower: LineInfo | undefined,
  gap: number,
  lineskip: readonly number[],
): boolean {
  return (
    [upper?.baseline, upper?.bottom, lower?.baseline, lower?.top].every(Number.isFinite) &&
    gap <= upper!.baseline - upper!.bottom + (lower!.top - lower!.baseline) + lineskip[0]! + 0.025
  )
}

/** a block's grid with one pitch inside it: each gap TeX's \lineskip rule opened closed to `p0` (L2:3172 evenGridOf; the
 *  maintainer's ruling of 2026-10-29) */
export function evenGridOf(G: readonly number[], opened: readonly boolean[], p0: number): number[] {
  const out = [G[0]!]
  for (let k = 1; k < G.length; k++) {
    const gap = G[k - 1]! - G[k]!
    out.push(out[k - 1]! - (opened[k - 1] && gap > p0 ? p0 : gap))
  }
  return out
}

/** U.blocks: blocksOf2's blocks, each with its baselines, sizes, grids and pitch, and the flows they make (L2:2966 blocks2) */
export function blocks(i: BlocksInput): Block[] {
  const { rects, lineInfo } = i
  const lineskip = i.lineskip ?? null
  const joinAt = i.joinAt ?? null
  const info = (r: readonly number[]) => lineInfo.get(rectKey(r)) ?? lineInfo.get(rectKeyNoX0(r))
  const out: Block[] = blocksOf2(i).map((raw) => {
    const B = raw.rects.map((r) => info(r)?.baseline ?? r[2] + 0.24 * (r[4] - r[2]))
    const exact = raw.rects.map((r) => !!info(r)?.exact)
    const sizes = raw.rects.map((r) => info(r)?.size ?? (r[4] - r[2]) / 0.894)
    let G: number[] | undefined
    if (joinAt?.size && raw.rects.some((r, k) => k > 0 && joinAt.has(rectKey(r)))) {
      let up = 0
      G = B.map((y, k) => {
        const pitch = k > 0 ? joinAt.get(rectKey(raw.rects[k]!)) : undefined
        if (pitch !== undefined) up += Math.max(0, B[k - 1]! - y - pitch)
        return y + up
      })
    }
    const g = G ?? B
    const d = g
      .slice(1)
      .map((y, k) => g[k]! - y)
      .filter((v) => v > 0)
    // (its pitch: TeX's \baselineskip where the part states it, the pitch TeX set the paragraph's lines at, which its \lineskip
    // rule only widens under a line too tall for it; else, as today, read off its gaps, their upper median, the mean where they
    // agree to a fiftieth. A gap the \lineskip rule opened is no pitch: read as one (2602.23285v2 p4 t29, its gaps 10.96 and
    // 12.24 read 12.24), the grid kept that gap where the translation set the tall line elsewhere and a push of its own was
    // added to it, the paragraph's last line past TeX's text block bottom. A block whose lines stand nearer than the pitch
    // stated was set at another: read)
    let pitch0: number | null = d.length ? median(d) : null
    if (d.length > 1 && raw.rects.every((r) => info(r)?.file) && d.every((v) => Math.abs(v - pitch0!) <= 0.02))
      pitch0 = d.reduce((a, v) => a + v, 0) / d.length
    if (i.pitch && i.pitch > 0 && d.every((v) => v >= i.pitch! - ON_BASE)) pitch0 = i.pitch
    let E: number[] | undefined
    if (lineskip && pitch0 !== null) {
      const p0 = pitch0
      const opened = g
        .slice(1)
        .map((y, k) => g[k]! - y > p0 && tightOf(info(raw.rects[k]!), info(raw.rects[k + 1]!), g[k]! - y, lineskip))
      if (opened.includes(true)) E = evenGridOf(g, opened, p0)
    }
    return {
      ...raw,
      after: raw.after ?? 0,
      B,
      exact,
      sizes,
      ...(G ? { G } : {}),
      pitch0,
      ...(E ? { E } : {}),
      free: 0,
      flow: 0,
    }
  })
  const mine = new Set(rects.map((r) => info(r)?.j).filter(Number.isInteger))
  const where = (r: Rect) => rects.findIndex((q) => q[0] === r[0] && q[2] === r[2] && q[3] === r[3] && q[4] === r[4])
  let flow = 0
  for (const [k, b] of out.entries()) {
    const a = out[k - 1]
    const from = info(b.rects[0]!),
      to = info(a?.rects.at(-1) ?? b.rects[0]!)
    let next =
      !!a &&
      !!from?.file &&
      !!to?.file &&
      Number.isInteger(from.j) &&
      Number.isInteger(to.j) &&
      to.j! < from.j! &&
      Number.isInteger(from.frame) &&
      to.frame === from.frame &&
      (a.after ?? 0) === (b.after ?? 0)
    if (next) {
      for (let j = to!.j! + 1; j < from!.j!; j++)
        if (!mine.has(j)) {
          next = false
          break
        }
    }
    b.flow = next ? a!.flow : flow++
    if (next) {
      const last = a!.rects.at(-1)!,
        ia = where(last),
        ib = where(b.rects[0]!)
      const tight = !!lineskip && tightOf(to, from, to!.baseline - from!.baseline, lineskip)
      a!.through = tight && ia >= 0 && ib > ia && rects.slice(ia + 1, ib).every((r) => r[2] >= last[2])
    }
  }
  return out
}
