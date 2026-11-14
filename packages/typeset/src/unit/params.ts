// U.params (design-b §1.5, E6, E7, E23, E24): the size a unit is laid at and its base style, and the parameters its fit reads
// beside the target's rules: its leading relative to the original's own pitch (leadOf: the script's of a solid-set
// original, never closer than the original's), the CJK runs' starting tracking (a face's size correction given back), TeX's
// \lineskip, its edges (whether its first and last lines stand alone on their baselines, the room under its last), whether a
// heading stands on its original's last lines, and a CJK cell's bands between the rules near its lines (cellBands) with the
// size every band holds. Ported from engine 065c1d973: RUN:2088-2089 (s, base), unitSizeOf L2:796-803 (CJK_CAPS_SIZE
// L2:792, the ruling of 2026-10-24), RUN:2244-2251 (P, clear, capScale, fillable), leadOf L2:3073-3079 (SOLID L2:3065),
// cjkAdvance RUN:1822-1826, edgesOf's use of the label RUN:1670, clearanceOf RUN:1675, cellBands L2:352-380.
//
// Its inputs, and the field each comes from once lane L1 states it:
// - the reading's `orig` (the original's size and style, its faked small capitals aside ← Placed.style) and `measured`
//   (its glyphs' base style ← TeX's font state); `rects` (where no glyph was read: its lines' heights ← Line)
// - `edges`: whether the first and the last line share their baseline with nothing of the page beside them in their frame,
//   and the room down to the next line of its column (edgesOf RUN:1638, the page's characters) ← Room.next, Line PINNED
//   (F.edges); `rules`: each page's rules near the unit's lines (hiding.rules: the manifest's) ← the part's rules
// - `cjkSize`: the size correction of the target's CJK body face (B.faces); `lineskip`: TeX's \lineskip and its limit
//   (the run's LINESKIP, TeX's log); `heading`, `numbered`: U.decor's
import { median, type Rect } from '../util.ts'
import { baseOf, type TokensInput, type TStyle } from '../breaker/tokens.ts'
import type { Block } from './blocks.ts'

/** a CJK target's small capitals at this share of the original's size (L2:792 CJK_CAPS_SIZE, the ruling of 2026-10-24) */
export const CJK_CAPS_SIZE = 1
/** a solid-set original's pitch, × its size (L2:3065 SOLID) */
export const SOLID = 1.25
/** the units of the page's head and foot (today's ink units of the heads and the notes): one of a single line, a running head,
 *  a page number, keeps the original's size (the owner's ruling of 2026-11-08): its fit's floor is its size */
const HEAD_FOOT = new Set(['inkheads', 'inknotes'])

/** the target's rules U.params reads */
export type ParamsRules = {
  cjk?: boolean
  leadBase: number
  cellClear?: number
  cellCapMin?: number
  adaptiveFill?: unknown
  [more: string]: unknown
}
/** the reading's facts of the unit's size and style */
export type Original = {
  orig?: { size?: number; st?: TStyle | null } | null
  measured?: { st?: TStyle | null } | null
}

/** the size a unit is laid at: the original's, × CJK_CAPS_SIZE in a CJK target where its base is in small capitals;
 *  undefined where no glyph of it was read (L2:796 unitSizeOf) */
export function unitSizeOf(prep: Original, P: Pick<ParamsRules, 'cjk'>, unit: TokensInput['unit'] | null = null) {
  const size = prep?.orig?.size
  if (!(size! > 0)) return undefined
  if (!P?.cjk) return size
  const caps = prep.measured?.st
    ? prep.measured.st.caps
    : !!prep.orig!.st?.caps && (!unit?.pieces || baseOf(unit, prep.orig!.st!).caps)
  return caps ? size! * CJK_CAPS_SIZE : size
}
/** the size the unit is laid at, its lines' median height where no glyph was read (RUN:2088) */
export const sizeOf = (
  prep: Original,
  P: Pick<ParamsRules, 'cjk'>,
  unit: TokensInput['unit'],
  rects: readonly Rect[],
) => unitSizeOf(prep, P, unit) ?? median(rects.map((r) => r[4] - r[2])) / 0.894
/** the unit's base style: the original's, else a serif one, bold for a heading (RUN:2089) */
export const baseStyleOf = (prep: Original, kind: string, serif: string): TStyle => {
  const orig = prep.orig
  return orig && orig.st!.fam !== 'math'
    ? { ...orig.st }
    : { fam: 'serif', bold: kind === 'heading', italic: false, caps: false, design: serif }
}

/** the unit's leading relative to the original's own pitch (L2:3073 leadOf) */
export function leadOf(blocks: readonly Pick<Block, 'pitch0'>[], s: number, P: Pick<ParamsRules, 'leadBase'>): number {
  if (!(P.leadBase > 1) || !(s > 0)) return P.leadBase
  const pitches = blocks
    .map((b) => b.pitch0)
    .filter((v): v is number => v! > 0)
    .sort((a, b) => a - b)
  if (!pitches.length) return P.leadBase
  const p0 = pitches[pitches.length >> 1]!
  return Math.min(P.leadBase, Math.max(1, Math.round((1000 * P.leadBase * SOLID * s) / p0) / 1000))
}

/** the CJK runs' tracking a fit starts from: the em a face's size correction takes, given back (RUN:1822 cjkAdvance) */
export const cjkAdvance = (cjk: boolean | undefined, cjkSize: number | undefined): number => {
  if (!cjk) return 0
  const c = cjkSize ?? 1
  return c < 1 ? Math.round((1 - c) * 1000) / 1000 : 0
}

/** a line's band between the rules over and under it (cellBands) */
export type Band = { B: number; lo: number; hi: number }
/** a CJK cell's bands by block, and the largest size every band holds its em box at (L2:352 cellBands) */
export function cellBands(
  blocks: readonly Pick<Block, 'page' | 'B' | 'rects' | 'x0' | 'x1'>[],
  rulesOf: (page: number) => readonly number[] | null | undefined,
  s: number,
  P: Pick<ParamsRules, 'cellClear' | 'cellCapMin'>,
): { cap: number; bands: Map<number, Band[]> } | null {
  const clear = P.cellClear!,
    cellCapMin = P.cellCapMin!
  let cap = 1
  const bands = new Map<number, Band[]>()
  blocks.forEach((b, bi) => {
    const R = rulesOf(b.page)
    if (!R?.length) return
    b.B.forEach((B, j) => {
      const r = b.rects[j]
      if (!r || !Number.isFinite(B)) return
      let over = Infinity,
        under = -Infinity
      const lx0 = Math.min(r[1], b.x0 ?? r[1]),
        lx1 = Math.max(r[3], b.x1 ?? r[3])
      for (let q = 0; q + 3 < R.length; q += 4) {
        if (Math.min(R[q + 2]!, lx1) - Math.max(R[q]!, lx0) <= 0.5) continue
        if (R[q + 1]! >= B) over = Math.min(over, R[q + 1]!)
        else if (R[q + 3]! <= B) under = Math.max(under, R[q + 3]!)
      }
      if (over === Infinity && under === -Infinity) return
      const foot = Math.min(r[2], B - 0.12 * s)
      const hi = over === Infinity ? B + 0.88 * s : Math.max(r[4], over - clear)
      const lo = under === -Infinity ? foot : Math.max(foot, under + clear)
      cap = Math.min(cap, (hi - lo) / s)
      const list = bands.get(bi) ?? []
      bands.set(bi, list)
      list.push({ B, lo, hi })
    })
  })
  return bands.size ? { cap: Math.max(cellCapMin, Math.min(1, Math.floor(cap * 1000) / 1000)), bands } : null
}

/** the unit's edges as the fit reads them (P.halfLead) */
export type HalfLead = { head: boolean; foot: boolean; below: number }
export type ParamsInput = {
  kind: string
  blocks: readonly Block[]
  s: number
  P: ParamsRules
  label: { drawn?: string } | null | undefined
  /** the first line alone on its baseline, the last, and the room under the last (F.edges); null for a cell or no block */
  edges: { first: boolean; last: boolean; below: number } | null
  rulesOf: (page: number) => readonly number[] | null | undefined
  cjkSize: number | undefined
  lineskip: readonly number[] | null
  heading: boolean
  numbered: boolean
}
export type Params = {
  P: ParamsRules & {
    leadBase: number
    trackStart: number
    lineskip: readonly number[] | null
    halfLead: HalfLead | null
    lastLines: boolean
    capScale?: number
    floor?: number
    floorMin?: number
  }
  clear: ReturnType<typeof cellBands>
  fillable: boolean
}

/** U.params: the fit's parameters of the unit (RUN:2244-2251) */
export function params(i: ParamsInput): Params {
  const halfLead =
    i.kind === 'cell' || !i.blocks.length || !i.edges
      ? null
      : { head: !(i.label && !i.label.drawn) && i.edges.first, foot: i.edges.last, below: i.edges.below }
  const P: Params['P'] = {
    ...i.P,
    leadBase: leadOf(i.blocks, i.s, i.P),
    trackStart: cjkAdvance(i.P.cjk, i.cjkSize),
    lineskip: i.lineskip,
    halfLead,
    lastLines: i.heading && !i.numbered,
    // (a line of the page's head or foot keeps its size: no step of the fit or past it shrinks it; where its free row does not
    // hold it at its size it is left the original's)
    ...(HEAD_FOOT.has(i.kind) && i.blocks.length === 1 && i.blocks[0]!.rects.length === 1
      ? { floor: 1, floorMin: 1 }
      : {}),
  }
  const clear = i.P.cjk && i.kind === 'cell' ? cellBands(i.blocks, i.rulesOf, i.s, i.P) : null
  if (clear && clear.cap < 1) P.capScale = clear.cap
  return { P, clear, fillable: !!i.P.adaptiveFill }
}
