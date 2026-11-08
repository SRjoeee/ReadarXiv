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
import type { FitBlock, FitParams, Tokens } from '../fit/types.ts'
import type { Row } from '../shared/row-start.ts'
import type { RuleParams } from '../types.ts'
import { blocks as blocksOf, type LineInfo } from '../unit/blocks.ts'
import type { Breaks } from '../unit/breaks.ts'
import {
  carriedCrop,
  type DecorLabel,
  decorAfter,
  decorBefore,
  type KeptRow,
  type ShortSkip,
  type Side,
} from '../unit/decor.ts'
import { params, unitSizeOf } from '../unit/params.ts'
import { type Rect, rectKey, rectKeyNoX0 } from '../util.ts'
import type { FlowMember } from './flow.ts'

type Line = Placed['lines'][number]
const KEPT = 1,
  PINNED = 2,
  SHORTSKIP = 4

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
  /** for a part made before (no Room.ends): the page's lowest unit line, as today's pageBottom (RUN:911: a rectangle's bottom
   *  and 0.24 of its height, the lowest of the page's units'): no unit borrows below it; undefined where the page has none */
  bottomOf?: (page: number) => number | undefined
  /** what stands at the ends of its Room.side on its baseline (sharedPaper): another member's text, and the middle of the free
   *  paper it shares with one that may widen into it too */
  beside?: Beside
}
/** the ends of a member's Room.side, left and right: whether another member's text stands there, and the middle of the free
 *  paper it shares with it (NaN where it shares none) */
export type Beside = { text: [boolean, boolean]; mid: [number, number] }
export type Adapted = { member: FlowMember } | { stop: string }

/** today's rectangle of a line (tex.mjs texRects, TEX:269-286): across its ink, and up and down a band of its size from its
 *  baseline, BELOW under it and ABOVE over it, to a hundredth (the line's top and bottom, its fonts' boxes, are its `exact`
 *  facts, which the \lineskip rule reads) */
const BELOW = 0.215,
  ABOVE = 0.683
const r2 = (v: number) => Math.round(v * 100) / 100
/** a line's size: the median of its main glyphs' sizes as the prepare states it (Line's 11th field), else the member's */
const sizeOf = (l: Line, m: Placed): number => (l[10] as number | undefined) ?? m.style.size
export const rectOf = (l: Line, m: Placed): Rect => [
  l[0],
  r2(l[2]),
  r2(l[4] - BELOW * sizeOf(l, m)),
  r2(l[3]),
  r2(l[4] + ABOVE * sizeOf(l, m)),
]
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
 * The free paper two members share on one baseline (two cells of a table's row): where a line's Room.side stops at another
 * member's ink on its baseline (within 0.4 of the smaller size) and that one's stops at its own, both may widen into the paper
 * between, and each takes its half: today's figure reading shares the line between two figure texts so (figure-text.mjs: half
 * the line to another unit's band, the other half that unit's); today never widened a cell, whose rectangle was its cell's.
 * Not between a member and the one it shares a row with (Placed.join, a name's bound member: set as one row). By ord, what
 * stands at the ends of its side: another member's text, and the middle of the paper it shares (Beside)
 */
export function sharedPaper(flows: readonly (readonly Placed[])[], page: number): Map<number, Beside> {
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
  const out = new Map<number, Beside>()
  const at = (ord: number) =>
    out.get(ord) ?? out.set(ord, { text: [false, false], mid: [Number.NaN, Number.NaN] }).get(ord)!
  // (every member's line, its side's or not: a member that widens nowhere is text all the same)
  const all = flows
    .flat()
    .flatMap((m) =>
      m.kind === 'figure' ? [] : m.lines.filter((l) => l[0] === page && !(l[9] & KEPT)).map((l) => ({ m, l })),
    )
  for (const a of ls)
    for (const b of all) {
      if (a.m === b.m || Math.abs(a.l[4] - b.l[4]) >= 0.4 * Math.min(sizeOf(a.l, a.m), sizeOf(b.l, b.m))) continue
      if (Math.abs(a.side[1] - b.l[2]) <= 0.02 && b.l[2] >= a.l[3] - 0.01) at(a.m.ord).text[1] = true
      if (Math.abs(a.side[0] - b.l[3]) <= 0.02 && b.l[3] <= a.l[2] + 0.01) at(a.m.ord).text[0] = true
    }
  for (const a of ls)
    for (const b of ls) {
      if (a.m === b.m || a.l[3] > b.l[2] + 0.01) continue
      if (Math.abs(a.l[4] - b.l[4]) >= 0.4 * Math.min(sizeOf(a.l, a.m), sizeOf(b.l, b.m))) continue
      if (Math.abs(a.side[1] - b.l[2]) > 0.02 || Math.abs(b.side[0] - a.l[3]) > 0.02) continue
      if (rowOf.has(`${a.m.ord}|${b.m.ord}`) || rowOf.has(`${b.m.ord}|${a.m.ord}`)) continue
      const mid = (a.l[3] + b.l[2]) / 2
      const A = at(a.m.ord).mid,
        B = at(b.m.ord).mid
      A[1] = Number.isFinite(A[1]) ? Math.min(A[1], mid) : mid
      B[0] = Number.isFinite(B[0]) ? Math.max(B[0], mid) : mid
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
  // (a label drawn anew is the first line's: its rectangle starts at the label, RUN:2039-2041)
  if (label?.drawn) {
    const r0 = rects[0]!,
      lx0 = Math.min(...label.chars.map((c) => c.x0))
    if (lx0 < r0[1] - 0.5 && label.chars.every((c) => c.page === r0[0])) rects[0] = [r0[0], lx0, r0[2], r0[3], r0[4]]
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
  }) as FitBlock[]
  // (the room each block may borrow under it, read where the walk asks (today's freeFor RUN:1677, which RUN:2193 gives every
  // block but a cell's): a block that ends a run of its text lines takes the room the part states under that line (Room.ends:
  // the free depth to the first ink, its own kept rows and elements too, and its page's lowest unit baseline), so that a member
  // running on to the next page or column borrows at the foot of the one it leaves and none through a display of its own; down
  // from a third of its size under its last baseline to that ink, a borrowGap of pitches clear of it, never past that lowest
  // line. A part made before states its last line's room alone (Room.below): its last block's, the page's lowest unit line the
  // part's (`bottomOf`), as before)
  const ends = m.room.ends
  const roomUnder = (b: FitBlock): { inkTop: number; floor: number } | null => {
    if (ends) {
      const r = b.rects.at(-1) as Rect
      const j = (lineInfo.get(rectKey(r)) ?? lineInfo.get(rectKeyNoX0(r)))?.j
      const e = j === undefined ? undefined : ends.find((x) => x[0] === j)
      return e ? { inkTop: lines[j!]![6] - e[1], floor: e[2] } : null
    }
    const floor = b === blocks.at(-1) ? i.bottomOf?.(b.page) : undefined
    return floor === undefined ? null : { inkTop: lines.at(-1)![6] - m.room.below, floor }
  }
  const gap = Number((R as { borrowGap?: number }).borrowGap ?? 0)
  // (set after the size below is read)
  const borrowRoom = (s: number) => {
    if (ends && kind === 'cell') return
    for (const b of blocks) {
      const room = roomUnder(b)
      if (!room) continue
      const last = b.B.at(-1)!
      const yStart = last - 0.3 * s,
        yLimit = room.floor - 0.3 * s
      if (yLimit >= yStart) continue
      const pitch = b.pitch0 ?? 1.2 * s
      const lowest = room.inkTop <= yLimit + 0.01 ? room.floor : room.inkTop + gap * pitch + 0.3 * s
      b.free = Math.max(0, last - lowest)
    }
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
  borrowRoom(s)
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
    const size = b.sizes?.[0] ?? m.style.size
    const half = 0.5 * size
    // (a cell's side ending at no member's text ends at its walls, its column's rules: a quarter of its size off, as today's
    // paperTo widened a cell to a rule (RUN:1717); text half its size off, any line's margin; the paper it shares with a
    // member beside it its half, a quarter of its size short of the middle, so that the two stand half their size apart)
    const by = i.beside ?? { text: [false, false], mid: [Number.NaN, Number.NaN] }
    const off = (text: boolean) => (kind === 'cell' && !text ? 0.25 * size : half)
    return {
      column: [l[7], l[8]],
      left: [
        ...(side[0] > l[7] + 0.01 ? [side[0] + off(by.text[0])] : []),
        ...(Number.isFinite(by.mid[0]) ? [by.mid[0] + half / 2] : []),
      ],
      right: [
        ...(side[1] < l[8] - 0.01 ? [side[1] - off(by.text[1])] : []),
        ...(Number.isFinite(by.mid[1]) ? [by.mid[1] - half / 2] : []),
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
    wide: null,
    ...(rowStart ? { rowStart } : {}),
  }
  return { member }
}
