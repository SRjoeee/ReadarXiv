// The adapter (design-b §1.6 L6, stage one): a part's member (lane L1's Placed) made the composition's prepared member, its
// setting through the ported unit rules from the facts the part states: U.blocks (blocks2 over the member's lines: each Line
// a rectangle and its line facts, KEPT lines kept, TeX's \lineskip, where TeX's forced breaks and the paragraphs it opened
// end its lines: U.breaks' maps, the reading's), U.decor (decorBefore and decorAfter: the alignment
// stated, the label's ink, the room beside its lines Room.side, the row kept after it, the displays set with the short
// skip), U.params (the size the style states, the edges its lines' PINNED flags and Room.next state, a CJK cell's bands over
// the page's rules), and, within its flow, the shared row it starts on and the row it leaves (Placed.join, the members before
// and after it). The reading and the tokens (L5, L7: U.elements to U.marks, B.tokens to B.measure) are not adapted here yet:
// the caller hands them in (`Reading`), and what it hands is today's (the gate's runner: the tap's), so that a difference the
// runner finds is a fact of the setting's. A member the stage does not set says why (`stop`), never silently.
import type { Placed } from '@readarxiv/format'
import { classifyFont } from '../breaker/font-names.types.ts'
import { type NumberCrop, numberCrop } from '../fit/numbered.ts'
import type { FitBlock, FitParams, Stay, Tokens } from '../fit/types.ts'
import type { Row, RowLine, RunRow } from '../shared/row-start.ts'
import type { RuleParams } from '../types.ts'
import { blocks as blocksOf, type LineInfo } from '../unit/blocks.ts'
import type { Breaks } from '../unit/breaks.ts'
import {
  carriedCrop,
  type DecorLabel,
  decorAfter,
  decorBefore,
  INK_UNIT_KINDS,
  type KeptRow,
  type ShortSkip,
  type Side,
  widen,
} from '../unit/decor.ts'
import { cropOfBox } from '../unit/crops.ts'
import { params, unitSizeOf } from '../unit/params.ts'
import { type Rect, rectKey, rectKeyNoX0 } from '../util.ts'
import type { FlowMember } from './flow.ts'

type Line = Placed['lines'][number]
const KEPT = 1,
  PINNED = 2,
  SHORTSKIP = 4

/** a trail's crop's element index (Tok.crop.k): no piece's (a piece's is its index, 0 up), never a label's (none) */
const TRAIL_K = -1

/** what the reading (L5) and the tokens (L7) decided of the member, handed in until the adapter makes them */
export type Reading = {
  tokens: Tokens
  /** the label drawn anew in the target (U.label's relabel or head), its text; null where it stays the original's */
  labelDrawn: string | null
  /** a name leads the member (U.lead) */
  lead: boolean
  /** the CJK body face's size correction (B.faces), U.params' trackStart reads it */
  cjkSize: number | undefined
  /** the kept regions (runs of KEPT lines, in order) the translation passes (U.breaks' referenced): what its tokens block to */
  referenced: ReadonlySet<number>
  /** U.breaks' maps (lay/read.ts: TeX's forced breaks and paragraphs paired with the row), which number the regions
   *  `referenced` names; absent where the reading is not the part's (the gate's runner hands today's tokens), and a member
   *  whose part states a break or a paragraph point is then not set */
  breaks?: Pick<Breaks, 'regionOf' | 'breakAt' | 'joinAt' | 'paraAt'>
  /** the tokens are the unit's own (lay/read.ts): the adapter sets a carried label's crop before them (RUN:2225-2238), which
   *  today's tokens handed in already hold */
  own?: boolean
}
export type AdaptInput = {
  m: Placed
  /** the member before it in its flow, and after it (their shared rows: Placed.join) */
  before: Placed | null
  after: Placed | null
  /** whether the member after it will be laid (admitted: it has a row and no prepare's reason) */
  afterOpen: boolean
  R: RuleParams
  /** the call's measure and patterns, as the fit reads them (FitParams) */
  measure: FitParams['measure']
  patterns: FitParams['patterns']
  /** the page's box (pageViews), the page's rules (A's, the add-on manifest's: Room.band's source) */
  view: (page: number) => readonly number[] | undefined
  rulesOf: (page: number) => readonly number[] | null | undefined
  lineskip: readonly [number, number] | null
  reading: Reading
  /** the middle of the free paper it shares on its baseline with a member that may widen into it too, left and right
   *  (sharedPaper; NaN where it shares none) */
  shared?: readonly [number, number]
  /** the line of TeX's it shares whole with the members beside it, set centred or flush right (rowLinesOf) */
  line?: Omit<RowLine, 'left' | 'right'>
}
export type Adapted = { member: FlowMember } | { stop: string }

/** today's rectangle of a line (tex.mjs texRects, TEX:269-286): across its ink, and up and down a band of its size from its
 *  baseline, BELOW under it and ABOVE over it, to a hundredth (the line's top and bottom, its fonts' boxes, are its `exact`
 *  facts, which the \lineskip rule reads) */
const BELOW = 0.215,
  ABOVE = 0.683
const r2 = (v: number) => Math.round(v * 100) / 100
/** a line's size: the median of its main glyphs' sizes as the prepare states it (Line's 11th field), else the member's */
const sizeOf = (l: Line, m: Placed): number => (l[10] as number | undefined) ?? m.style.size
export const rectOf = (l: Line, m: Placed): Rect => {
  const [x0, x1] = m.kind === 'cell' ? cellExtent(l, m) : [l[2], l[3]]
  return [l[0], r2(x0), r2(l[4] - BELOW * sizeOf(l, m)), r2(x1), r2(l[4] + ABOVE * sizeOf(l, m))]
}
/**
 * A table cell's own room on a line (the owner's ruling of 2026-11-08: each cell in its own room, sized as today): what TeX set
 * on it, its glyphs' advances (the line's x0 and x1) and its elements' ink on its baseline, which an italic letter's overhang
 * takes past its advance (2610.17024v1 p14's cells "p=5 n=20 …": the p's ink at 149.79, its line's advances from 150.42).
 * Today's rectangle held it (texRects: the layout file's glyph boxes); a room of the advances alone was that much narrower, and
 * a translation opening with that p was set a step under the original's size where today's kept it. A centred cell's stays
 * centred where TeX centred its line, its advances' middle (TeX's column class, Placed.align), as wide as its own ink needs
 * (2602.23285v2 p19's "Top-τ", the τ's ink 0.74 pt past its line's end). A held line's is its own
 */
function cellExtent(l: Line, m: Placed): [number, number] {
  let x0 = l[2],
    x1 = l[3]
  if (l[9] & KEPT) return [x0, x1]
  const band = 0.4 * sizeOf(l, m)
  for (const [, e] of m.els ?? [])
    for (const k of e.ink)
      if (k[0] === l[0] && Math.abs(k[5] - l[4]) < band && k[1] < l[3] && k[3] > l[2]) {
        x0 = Math.min(x0, k[1])
        x1 = Math.max(x1, k[3])
      }
  if (m.align !== 'c') return [x0, x1]
  const mid = (l[2] + l[3]) / 2,
    half = Math.max(mid - x0, x1 - mid)
  return [mid - half, mid + half]
}
/** the label as U.decor reads it: its parts' ink as its characters, the first and the last reaching its ink's own ends (today's
 *  decor read every glyph of the label: a bracket before its name, "(a)", no part names, is its ink's all the same) */
function labelOf(m: Placed, drawn: string | null): (DecorLabel & { chars: NonNullable<DecorLabel['chars']> }) | null {
  const lb = m.label
  if (!lb) return null
  const size = lb.style?.size ?? m.style.size
  const parts = [lb.name, lb.num, lb.punct].filter((x) => x !== undefined) as [string, number[]][]
  const chars = (parts.length ? parts : [['', lb.ink] as [string, number[]]]).map(([text, ink]) => ({
    ch: text,
    x0: ink[1]!,
    x1: ink[3]!,
    page: ink[0]!,
    yb: ink[5]!,
    size,
  }))
  const onInk = chars.filter((c) => c.page === lb.ink[0])
  if (onInk.length) {
    const first = onInk.reduce((a, c) => (c.x0 < a.x0 ? c : a)),
      last = onInk.reduce((a, c) => (c.x1 > a.x1 ? c : a))
    first.x0 = Math.min(first.x0, lb.ink[1])
    last.x1 = Math.max(last.x1, lb.ink[3])
  }
  return {
    x1: Math.max(...chars.map((c) => c.x1)),
    text: parts.map(([t]) => t).join(''),
    chars,
    ...(drawn !== null ? { drawn } : {}),
  }
}

/**
 * The free paper two members share on one baseline (two authors set side by side; a table cell's own widening reads its side
 * alone, half way to the glyph beside it, the adapter's cellSideOf): where a line's Room.side stops at another
 * member's ink on its baseline (within 0.4 of the smaller size) and that one's stops at its own, both may widen into the paper
 * between, and each takes its half: today's paperTo widened a cell half way to another unit's text (RUN:1717), as today's
 * figure reading shares the line between two figure texts (figure-text.mjs: half the line to another unit's band, the other
 * half that unit's). Not between a member and the one it shares a row with (Placed.join, a name's bound member: set as one
 * row). By ord, [left, right] the middle of the paper on each side, NaN where it shares none
 */
export function sharedPaper(flows: readonly (readonly Placed[])[], page: number): Map<number, [number, number]> {
  const rowOf = new Set<string>()
  for (const flow of flows)
    for (let k = 1; k < flow.length; k++)
      if (flow[k]!.join || flow[k - 1]!.bound) rowOf.add(`${flow[k - 1]!.ord}|${flow[k]!.ord}`)
  const ls = flows
    .flat()
    .flatMap((m) =>
      m.kind === 'figure' || !m.room.side
        ? []
        : m.lines.filter((l) => l[0] === page && !(l[9] & KEPT)).map((l) => ({ m, l, side: m.room.side! })),
    )
  const out = new Map<number, [number, number]>()
  const at = (ord: number) => out.get(ord) ?? out.set(ord, [Number.NaN, Number.NaN]).get(ord)!
  for (const a of ls)
    for (const b of ls) {
      if (a.m === b.m || a.l[3] > b.l[2] + 0.01) continue
      if (Math.abs(a.l[4] - b.l[4]) >= 0.4 * Math.min(sizeOf(a.l, a.m), sizeOf(b.l, b.m))) continue
      if (Math.abs(a.side[1] - b.l[2]) > 0.02 || Math.abs(b.side[0] - a.l[3]) > 0.02) continue
      if (rowOf.has(`${a.m.ord}|${b.m.ord}`) || rowOf.has(`${b.m.ord}|${a.m.ord}`)) continue
      const mid = (a.l[3] + b.l[2]) / 2
      const A = at(a.m.ord),
        B = at(b.m.ord)
      A[1] = Number.isFinite(A[1]) ? Math.min(A[1], mid) : mid
      B[0] = Number.isFinite(B[0]) ? Math.max(B[0], mid) : mid
    }
  return out
}

/**
 * The paragraphs of TeX's that several members of a flow fill whole, set centred or flush right (RowLine), by ord: each member
 * after the first on the line the one before ends (Placed.join on its baseline), its lines TeX's next lines of the paragraph,
 * one under the other; nothing of the page between two of them there but the second's own label, which goes with it (what
 * stays there would stay inside the run: a join kept by other ink, the one's Room.side not reaching the other); no name among
 * them (S.names sets a babel name on its own, or as the lead of the member it binds), no cell nor figure text (set in boxes of
 * their own). Its alignment is TeX's: the one its members' own marks state (Placed.align where `read` holds no 'align'), all
 * alike; a member made on A (an ink unit: text TeX set that no unit owns, amsart's "AND" between two names) states none of
 * TeX's for the line and takes the line's. A line TeX set justified or flush left needs nothing: its members run on from its
 * first one's start already (S.rowStart). Its rows are TeX's lines, each from its first glyph's start (a member's label's,
 * where it stands first on it) to its last one's end: IJCAI's names, one centred paragraph over three lines, each \and's comma
 * the next name's label, a name over two lines (2611.00342v1 p1). A paragraph of several lines is the run's whole, nothing of
 * the page before its first member nor after its last on their lines
 */
export function rowLinesOf(flows: readonly (readonly Placed[])[]): Map<number, Omit<RowLine, 'left' | 'right'>> {
  const out = new Map<number, Omit<RowLine, 'left' | 'right'>>()
  const onRow = (a: Placed, b: Placed) => {
    const l = a.lines.at(-1),
      f = b.lines[0]
    return !!b.join && !!l && !!f && l[0] === f[0] && Math.abs(l[4] - f[4]) < 0.05
  }
  // (its label standing on its first line, before its text)
  const labelFirst = (m: Placed): number[] | null => {
    const lb = m.label,
      l = m.lines[0]
    if (!lb || !l) return null
    const on = lb.line !== undefined ? lb.line === 0 : lb.ink[0] === l[0] && Math.abs(lb.ink[5] - l[4]) < 0.05
    return on ? lb.ink : null
  }
  // (a join kept by something of the page other than the member's own label: the ink beside the one before stops short of the
  // label, and the ink beside the member short of the one before's end, both as Room.side states them, to the part's hundredth)
  const keptOther = (a: Placed, b: Placed) => {
    if (!b.join?.[1]) return false
    const lb = labelFirst(b),
      end = a.lines.at(-1)?.[3]
    if (!lb || end === undefined) return true
    return !((b.room.side && b.room.side[0] >= end - 0.01) || (a.room.side && a.room.side[1] <= lb[1]! + 0.01))
  }
  const ink = new Set(INK_UNIT_KINDS)
  for (const flow of flows)
    for (let k = 0; k < flow.length; ) {
      let j = k
      while (j + 1 < flow.length && onRow(flow[j]!, flow[j + 1]!)) j++
      const row = flow.slice(k, j + 1)
      k = j + 1
      if (row.length < 2) continue
      if (
        row.some(
          (m, q) =>
            m.why ||
            m.kind === 'name' ||
            m.kind === 'cell' ||
            m.kind === 'figure' ||
            (q > 0 && keptOther(row[q - 1]!, m)),
        )
      )
        continue
      const told = row.filter((m) => !ink.has(m.kind) && !(m.read ?? []).includes('align')).map((m) => m.align)
      const align = told[0]
      if ((align !== 'c' && align !== 'r') || told.some((a) => a !== align)) continue
      // (its rows: the first member's lines, then each member's lines after its first, each TeX's next line under the one before)
      const rows: RunRow[] = []
      let lines = true
      for (const [q, m] of row.entries())
        m.lines.forEach((l, i) => {
          const at = q > 0 && i === 0 ? rows.at(-1)! : undefined
          if (!at) {
            const up = rows.at(-1)
            if (up && (l[0] !== up.page || l[4] > up.baseline - 0.05)) lines = false
            rows.push({ page: l[0], baseline: l[4], x0: l[2], x1: l[3] })
          } else {
            at.x0 = Math.min(at.x0, l[2])
            at.x1 = Math.max(at.x1, l[3])
          }
          const lb = i === 0 ? labelFirst(m) : null
          if (lb) rows.at(-1)!.x0 = Math.min(rows.at(-1)!.x0, lb[1]!)
        })
      if (!lines) continue
      // (a paragraph of several lines is the run's whole: nothing of the page before its first member on its first line nor after
      // its last one on its last line, as their Room.side states it, to their column's edge. Its lines are laid anew, its members'
      // text moving from one to another: beside ink that stays there it would take or lose text under it. 2608.16117v1 p1's
      // places, another flow's after them on their last line. One line keeps its members on it, its middle TeX's: as before)
      const a = row[0]!,
        z = row.at(-1)!
      if (
        rows.length > 1 &&
        !(
          a.room.side &&
          a.room.side[0] <= a.lines[0]![7] + 0.01 &&
          z.room.side &&
          z.room.side[1] >= z.lines.at(-1)![8] - 0.01
        )
      )
        continue
      const line = { ords: row.map((m) => m.ord), align, rows } as const
      for (const m of row) out.set(m.ord, line)
    }
  return out
}

/** U.blocks, U.decor and U.params over a member's stated facts; with the rows it shares in its flow */
export function adapt(i: AdaptInput): Adapted {
  const { m, R } = i
  if (m.why) return { stop: m.why }
  if (!m.lines.length) return { stop: 'no lines' }
  const br = i.reading.breaks
  if (
    !br &&
    (m.els?.some(([, e]) => e.ends || e.opens !== undefined) || m.spans?.some(([, x]) => x.opens !== undefined))
  )
    return { stop: 'breaks (U.breaks not adapted)' }
  const lines = m.lines
  const rects = lines.map((l) => rectOf(l, m))
  // (each line's frame: its run of lines on one page and column)
  const frames: number[] = []
  lines.forEach((l, j) => {
    const p = lines[j - 1]
    frames.push(j && p && p[0] === l[0] && p[1] === l[1] ? frames[j - 1]! : j ? frames[j - 1]! + 1 : 0)
  })
  const lineInfo = new Map<string, LineInfo>()
  lines.forEach((l, j) => {
    const info: LineInfo = {
      baseline: l[4],
      size: sizeOf(l, m),
      top: l[5],
      bottom: l[6],
      exact: true,
      file: true,
      j,
      frame: frames[j]!,
    }
    lineInfo.set(rectKey(rects[j]!), info)
    lineInfo.set(rectKeyNoX0(rects[j]!), info)
  })
  // (the KEPT lines: a display's rows, a held line; each run of them a region, as U.breaks numbers them where no forced
  // break opens one; the reading's numbering where it hands U.breaks' maps)
  const keepKeys = lines.flatMap((l, j) => (l[9] & KEPT ? [rectKey(rects[j]!)] : []))
  const regionOf = new Map<string, number>()
  let region = -1
  lines.forEach((l, j) => {
    if (!(l[9] & KEPT)) return
    if (!(j && lines[j - 1]![9] & KEPT)) region++
    regionOf.set(rectKey(rects[j]!), region)
  })
  const kind = m.kind as string
  const fixed = m.fixed ?? 0
  const labelKept = !!m.label && !!(fixed & 4)
  const relabels = !!m.label && !labelKept
  const label = labelOf(m, i.reading.labelDrawn)
  // (a label drawn anew is the first line's: its rectangle starts at the label, RUN:2039-2041. But a label TeX hung beside its
  // text, every text line of the member starting at one x past the label's end and the label at the measure's start (the
  // caption package's `hang`, \hangindent its label box's width, the label and its separator: 2609.36054v2 p3's "Figure 1." at
  // 47, its text's lines at 95.61, 3.94 pt after it), hangs its text by TeX's own rule at the drawn label's width: the label at
  // its place, the space TeX set after it (`hangGap`), every text line from there to its right edge (the coordinator's ruling
  // of 2026-11-11). Widened to the label, the block's edge was the label's and every line after the first ran under it)
  let hang: number | undefined
  let hangGap = 0
  if (label?.drawn) {
    const r0 = rects[0]!,
      lx0 = Math.min(...label.chars.map((c) => c.x0))
    if (lx0 < r0[1] - 0.5 && label.chars.every((c) => c.page === r0[0])) {
      const text = lines.filter((l) => !(l[9] & KEPT))
      const hung =
        !!m.label &&
        text.length > 1 &&
        text.every((l) => Math.abs(l[2] - text[0]![2]) <= 0.01) &&
        text[0]![2] > m.label.ink[3] &&
        Math.abs(m.label.ink[1] - lines[0]![7]) <= 0.01
      if (hung && m.label) {
        hang = lx0
        hangGap = text[0]![2] - m.label.ink[3]
      } else rects[0] = [r0[0], lx0, r0[2], r0[3], r0[4]]
    }
  }
  const centred = m.align === 'c'
  const before = decorBefore({
    kind,
    byCell: kind === 'cell' ? centred : null,
    luCentred: kind === 'cell' ? undefined : centred,
    label,
    relabels,
    labelKept,
    labelShown: relabels,
    rects,
  })
  const pages = [...new Set(lines.map((l) => l[0]))]
  const blocks = blocksOf({
    rects: before.rects,
    pageViews: Array.from({ length: Math.max(...pages) }, (_, k) => i.view(k + 1)),
    keep: keepKeys.length ? new Set(keepKeys) : null,
    lineInfo,
    regionOf: br ? br.regionOf : keepKeys.length ? regionOf : null,
    referenced: br || keepKeys.length ? new Set(i.reading.referenced) : null,
    breakAt: br?.breakAt ?? null,
    joinAt: br?.joinAt ?? null,
    paraAt: br?.paraAt ?? null,
    lineskip: i.lineskip,
    centred: before.centredFlag,
    // (TeX's \baselineskip where the part states it: Placed.lead, read off the lines where 'lead' is read)
    pitch: (m.read ?? []).includes('lead') ? null : m.lead,
  }) as FitBlock[]
  // (the label's hang: on the block of the member's first line, whose first slot starts at the label, its text at the hang's end)
  if (hang !== undefined && blocks[0] && blocks[0].page === rects[0]![0] && !blocks[0].centred) {
    blocks[0].hang = hang
    blocks[0].hangGap = hangGap
  }
  // (the room each block may borrow under it (today's freeFor RUN:1677, which RUN:2193 gives every block but a cell's), from TeX's
  // facts alone (the owner's ruling of 2026-11-08): a block that ends a run of its text lines the part states the room under
  // (Room.runs) takes the lines down to TeX's text block bottom, the next ink staying TeX's paragraph separation (Room.sep,
  // \baselineskip and \parskip) under the lowest one's baseline. A part that states no run or no separation, nothing: no tuned
  // clearance and no reading of the page's pixels stand in for TeX's)
  const runs = m.room.runs
  const sep = m.room.sep
  if (runs && sep !== undefined && kind !== 'cell')
    for (const b of blocks) {
      const r = b.rects.at(-1) as Rect
      const j = (lineInfo.get(rectKey(r)) ?? lineInfo.get(rectKeyNoX0(r)))?.j
      const e = j === undefined ? undefined : runs.find((x) => x[0] === j)
      if (!e) continue
      b.free = r2(Math.max(0, Math.min(e[2], e[1] - sep)))
      // (and, where the reader asks the borrow past TeX's bottom (§18.34), the two depths it reads apart)
      if ((R.pastFoot ?? 0) > 0) {
        b.toFoot = r2(e[2])
        b.toInk = r2(e[1] - sep)
      }
    }
  // (the ink that stays beside its lines, no member's (Room.stays: a QED box after a proof's last words): on the block that holds
  // the line it stood beside, on that line's side of it, which every slot of the block reaching it keeps off (B.slots), a line
  // borrowed under it too. Not a cell's: its room is its walls')
  const stays = kind === 'cell' ? [] : (m.room.stays ?? [])
  const stayOf = (j: number) =>
    stays
      .filter((k) => k[0] === j)
      .map((k): Stay => {
        const right = k[1] >= lines[j]![3]
        return { right, x0: k[1], y0: k[2], x1: k[3], y1: k[4], gap: right ? k[1] - lines[j]![3] : lines[j]![2] - k[3] }
      })
  if (stays.length)
    for (const b of blocks) {
      const own = b.rects.flatMap((r) => {
        const j = (lineInfo.get(rectKey(r as Rect)) ?? lineInfo.get(rectKeyNoX0(r as Rect)))?.j
        return j === undefined ? [] : stayOf(j)
      })
      if (own.length) b.stays = own
    }
  // (its size: the style's, where the prepare read it off its text (today's originalStyle); else, as today, the median of its
  // lines' bands over 0.894 (RUN:2088). In a CJK target smaller where its base is set in small capitals: the tokens' base
  // (baseOf over the row's groups), else its style's (its face's, or today's vote, Style.caps), as unitSizeOf reads it)
  const fromText = !(m.read ?? []).includes('size:lines')
  const heights = rects.map((r) => r[4] - r[2]).sort((a, b) => a - b)
  const base = (i.reading.tokens as { base?: { caps?: boolean } }).base
  const caps = base ? !!base.caps : !!m.style.caps || (!!m.style.design && classifyFont(m.style.design).caps)
  const s =
    (fromText ? unitSizeOf({ orig: { size: m.style.size, st: { caps } } }, R) : undefined) ??
    (heights[heights.length >> 1] as number) / 0.894
  // (the row kept after it: the next member's join says ink stays between the two on their shared line)
  const last = lines.at(-1)!
  const after = i.after
  // (a shared row's size, here and below: its line's, today's rowLeadOf row (need.mjs:37, the file line's size field), which
  // keptAfter and S.share read as the row's band)
  const kept: KeptRow | null = after?.join?.[1]
    ? { page: last[0], baseline: last[4], x1: last[3], size: sizeOf(last, m), byLabel: !!after.label }
    : null
  // (the displays set with the short skip: under each SHORTSKIP line, the member's display element there)
  const displays = (m.els ?? []).filter(([, e]) => e.kind === 'display').flatMap(([, e]) => e.ink)
  const shortSkips: ShortSkip[] = []
  lines.forEach((l, j) => {
    if (!(l[9] & SHORTSKIP)) return
    const d = displays.find((k) => k[0] === l[0] && k[4] < l[6])
    if (d) shortSkips.push({ page: d[0]!, x0: d[1]!, x1: d[3]!, top: d[4]!, bottom: d[2]!, line: j })
  })
  // (a single line's room to widen into: its column, TeX's measure m0..m1; the ink beside it where Room.side stops short of
  // the column, half its size off, today's margin: widen RUN:1576-1584)
  const sideOf = (b: FitBlock): Side | undefined => {
    // (its line by its rectangle, or, where a label drawn anew moved the rectangle's start, by the rest of it: as U.blocks reads it)
    const r0 = b.rects[0] as Rect
    const side = m.room.side,
      j = (lineInfo.get(rectKey(r0)) ?? lineInfo.get(rectKeyNoX0(r0)))?.j
    const l = j === undefined ? undefined : lines[j]
    if (!l) return undefined
    // (no side stated: a member across columns, whose lines' sides the one interval cannot hold; its line runs to its column)
    if (!side) return { column: [l[7], l[8]], left: [], right: [] }
    const half = 0.5 * (b.sizes?.[0] ?? m.style.size)
    // (the paper it shares with a member beside it: its half, as today's paperTo widened a cell half way to another unit's text
    // (RUN:1717))
    const [sl, sr] = i.shared ?? [Number.NaN, Number.NaN]
    // (and the ink that stays beside it, a rule or an image too (Room.stays), which Room.side, the glyphs', does not stop at)
    const st = stayOf(j!)
    return {
      column: [l[7], l[8]],
      left: [
        ...(side[0] > l[7] + 0.01 ? [side[0] + half] : []),
        ...(Number.isFinite(sl) ? [sl] : []),
        ...st.filter((k) => !k.right).map((k) => k.x1 + Math.min(half, k.gap)),
      ],
      right: [
        ...(side[1] < l[8] - 0.01 ? [side[1] - half] : []),
        ...(Number.isFinite(sr) ? [sr] : []),
        ...st.filter((k) => k.right).map((k) => k.x0 - Math.min(half, k.gap)),
      ],
    }
  }
  const firstX0 = m.label ? lines[0]![2] : undefined
  const decor = decorAfter(blocks, {
    kind,
    // (the paper's title and its front matter, the part's: no section heading's rules)
    title: !!m.title,
    front: !!m.front,
    luFlush: m.align === 'l' ? 'left' : m.align === 'r' ? 'right' : null,
    label,
    firstX0,
    s,
    relabels,
    lead: i.reading.lead,
    labelHides: before.labelHides,
    firstPage: rects[0]![0],
    firstX: before.rects[0]?.[1],
    side: (b) => sideOf(b),
    kept,
    shortSkips,
    lineInfo,
  })
  // (a cell's single lines widened over the paper beside them, its fit's further step where it is clipped in its own ink's
  // width at its floor (X.further's 'widen': today's widenOverPaper, a cell never widened before, RUN:2116), its room today's
  // paperTo's (RUN:1699): half way to the glyph beside it, another cell's text or a number's (two cells sharing paper take
  // half each), a quarter of its size off a wall (Room.wall: its column's rule, a neighbour's fill), to its column's edge
  // where nothing stands before it; null where none grows)
  const cellSideOf = (b: FitBlock): Side | undefined => {
    const r0 = b.rects[0] as Rect
    const j = (lineInfo.get(rectKey(r0)) ?? lineInfo.get(rectKeyNoX0(r0)))?.j
    const l = j === undefined ? undefined : lines[j]
    if (!l) return undefined
    const side = m.room.side
    if (!side) return { column: [l[7], l[8]], left: [], right: [] }
    const quarter = 0.25 * (b.sizes?.[0] ?? m.style.size),
      wall = m.room.wall ?? 0
    return {
      column: [l[7], l[8]],
      left: side[0] > l[7] + 0.01 ? [wall & 1 ? side[0] + quarter : (side[0] + l[2]) / 2] : [],
      right: side[1] < l[8] - 0.01 ? [wall & 2 ? side[1] - quarter : (side[1] + l[3]) / 2] : [],
    }
  }
  let wide: FitBlock[] | null = null
  if (kind === 'cell') {
    const grown = blocks.map((b) => {
      const w = { ...b }
      widen(w, cellSideOf(w))
      return w
    })
    if (grown.some((w, k) => w.x0 < blocks[k]!.x0 - 1e-9 || w.x1 > blocks[k]!.x1 + 1e-9)) wide = grown
  }
  const edges = {
    first: !(lines[0]![9] & PINNED),
    last: !(last[9] & PINNED),
    below: m.room.next ?? Number.POSITIVE_INFINITY,
  }
  const up = params({
    kind,
    blocks,
    s,
    P: R as never,
    label: label ? { ...(label.drawn ? { drawn: label.drawn } : {}) } : null,
    edges,
    rulesOf: i.rulesOf,
    cjkSize: i.reading.cjkSize,
    lineskip: i.lineskip,
    heading: decor.heading,
    numbered: decor.numbered,
  })
  const P = { ...(R as object), ...up.P, measure: i.measure, patterns: i.patterns } as FitParams
  const numberCropOf: NumberCrop | null =
    decor.numbered && label ? numberCrop(label.chars, label.text, blocks[0]!) : null
  // (the row it starts on, shared with the member before: that member's last line, TeX's separation before its text)
  const b = i.before
  const bl = b?.lines.at(-1)
  const rowStart =
    b && bl && m.join
      ? {
          row: {
            id: b.ord,
            page: bl[0],
            baseline: bl[4],
            x0: bl[2],
            x1: lines[0]![2] - m.join[0],
            size: sizeOf(bl, b),
          } as Row,
          carried: decor.carried,
          // (its label on the row: where the part says it stands on its first line, which is the row (Label.line: a mark raised
          // over the row is the row's); a part made before states no line: its baseline the row's, as before)
          ownLabel:
            m.label &&
            (m.label.line !== undefined
              ? m.label.line === 0
              : m.label.ink[0] === bl[0] && Math.abs(m.label.ink[5] - bl[4]) < 0.05)
              ? [0, m.label.ink[0], m.label.ink[1], m.label.ink[5], m.label.ink[3], m.label.ink[4], m.label.ink[2]]
              : null,
          keptBetween: () => !!m.join![1],
          x: lines[0]![2],
          // (its label's crop, where the tokens are its own: RUN:2215-2224, the crop as a carried label's, set by the row's
          // baseline)
          ...(i.reading.own && label
            ? {
                label: {
                  crop: (baseline: number) => {
                    const c = carriedCrop(label, { page: lines[0]![0], B: [baseline] }, firstX0, s, [baseline])
                    return { ...c, ownLabel: true } as unknown as FlowMember['tokens'][number]
                  },
                  head: edges.first,
                },
              }
            : {}),
        }
      : undefined
  const fl = after?.lines[0]
  // (a label carried to its first line's start: its own ink's crop before the unit's own tokens, the line's own glyphs'
  // baselines its own: RUN:2225-2238)
  let tokens = i.reading.tokens
  if (i.reading.own && decor.carried && label && blocks[0]) {
    const own = lines
      .filter((l) => l[0] === blocks[0]!.page)
      .slice(0, 1)
      .map((l) => l[4])
    const c = carriedCrop(label, blocks[0], firstX0, s, own)
    tokens = Object.assign([c as unknown as (typeof tokens)[number], ...tokens], {
      base: (tokens as { base?: unknown }).base,
    }) as typeof tokens
  }
  // (its trail, the ink TeX set glued after its last glyph that no unit owns (El.trail: a class's marks and separator after a
  // name, a \thanks mark): cut from where TeX set it and drawn right after its own tokens' last, glued to it as TeX set it, so
  // that the member after it on the row is laid from its end and no hole stands where the original's longer text was (2604.14228v3)
  const trail = i.reading.own ? (m.els ?? []).find(([, e]) => e.trail && e.ink.length === 1) : undefined
  if (trail && tokens.length) {
    const [p, x0, y0, x1, y1, base] = trail[1].ink[0]!
    // (on the line TeX set it on, its member's last (El.trail): a crop's baseline is its line's (crops.ts), so that a mark raised
    // over the name stands as far over the translation; its ink's own is its glyphs', which raised marks alone hold off the line,
    // and drawn by it they stood on the line: 2610.10069v1 p1's daggers, 1706.03762v7 p1's star)
    const on = lines.findLast((l) => l[0] === p)
    const box = cropOfBox({ x0, x1, bottom: y0, top: y1, baseline: on ? on[4] : base })
    const crop = {
      mode: 'crop' as const,
      page: p,
      ...box,
      text: trail[1].copy ?? '',
      k: TRAIL_K,
      gap: { box: { x0, x1, bottom: y0, top: y1 } },
    }
    tokens = Object.assign(
      [...tokens, { crop, cw: box.crop[2] - box.crop[0], glue: true, w100: 0 } as unknown as (typeof tokens)[number]],
      {
        base: (tokens as { base?: unknown }).base,
      },
    ) as typeof tokens
  }
  // (the line of TeX's it shares whole, laid as one run (lay/flow.ts layLine), with the room its own line may take beside it,
  // as U.decor's widen reads it (sideOf): the run's left its first member's, its right its last one's. None where its label
  // stays where TeX set it (neither drawn anew nor carried as its crop): its text would leave it)
  const own = i.line && blocks[0] ? sideOf(blocks[0]) : undefined
  const lineOf: RowLine | undefined =
    i.line && own && !(label && !label.drawn && !decor.carried)
      ? {
          ...i.line,
          left: Math.max(own.column[0], ...own.left),
          right: Math.min(own.column[1], ...own.right),
        }
      : undefined
  const member: FlowMember = {
    ord: m.ord,
    kind,
    pages,
    tokens,
    blocks,
    s,
    P,
    clear: up.clear,
    rulesOf: i.rulesOf,
    numbered: decor.numbered,
    numberCrop: numberCropOf,
    onLeadOf: null,
    kept,
    follower:
      after && after.join && fl
        ? {
            id: after.ord,
            open: i.afterOpen,
            row: { page: last[0], baseline: last[4] },
            first: { page: fl[0], x1: fl[3] },
          }
        : null,
    shareRow: after?.join ? { page: last[0], baseline: last[4], size: sizeOf(last, m) } : null,
    wide,
    ...(rowStart ? { rowStart } : {}),
    ...(lineOf ? { line: lineOf } : {}),
  }
  return { member }
}
