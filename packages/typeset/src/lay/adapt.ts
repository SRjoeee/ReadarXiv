// The adapter (design-b §1.6 L6, stage one): a part's member (lane L1's Placed) made the composition's prepared member, its
// setting through the ported unit rules from the facts the part states: U.blocks (blocks2 over the member's lines: each Line
// a rectangle and its line facts, KEPT lines kept, TeX's \lineskip), U.decor (decorBefore and decorAfter: the alignment
// stated, the label's ink, the room beside its lines Room.side, the row kept after it, the displays set with the short
// skip), U.params (the size the style states, the edges its lines' PINNED flags and Room.next state, a CJK cell's bands over
// the page's rules), and, within its flow, the shared row it starts on and the row it leaves (Placed.join, the members before
// and after it). The reading and the tokens (L5, L7: U.elements to U.marks, B.tokens to B.measure) are not adapted here yet:
// the caller hands them in (`Reading`), and what it hands is today's (the gate's runner: the tap's), so that a difference the
// runner finds is a fact of the setting's. A member the stage does not set says why (`stop`), never silently.
import type { Placed } from '@readarxiv/format'
import { type NumberCrop, numberCrop } from '../fit/numbered.ts'
import type { FitBlock, FitParams, Tokens } from '../fit/types.ts'
import type { Row } from '../shared/row-start.ts'
import type { RuleParams } from '../types.ts'
import { blocks as blocksOf, type LineInfo } from '../unit/blocks.ts'
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
  /** the page's lowest unit line, as today's pageBottom (RUN:911: a rectangle's bottom and 0.24 of its height, the lowest of
   *  the page's units'): no unit borrows below it; undefined where the page has none */
  bottomOf?: (page: number) => number | undefined
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
export const rectOf = (l: Line, m: Placed): Rect => [
  l[0],
  r2(l[2]),
  r2(l[4] - BELOW * sizeOf(l, m)),
  r2(l[3]),
  r2(l[4] + ABOVE * sizeOf(l, m)),
]
/** the label as U.decor reads it: its parts' ink as its characters */
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
  return {
    x1: Math.max(...chars.map((c) => c.x1)),
    text: parts.map(([t]) => t).join(''),
    chars,
    ...(drawn !== null ? { drawn } : {}),
  }
}

/** U.blocks, U.decor and U.params over a member's stated facts; with the rows it shares in its flow */
export function adapt(i: AdaptInput): Adapted {
  const { m, R } = i
  if (m.why) return { stop: m.why }
  if (!m.lines.length) return { stop: 'no lines' }
  if (m.els?.some(([, e]) => e.ends || e.opens !== undefined)) return { stop: 'breaks (U.breaks not adapted)' }
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
  // break opens one)
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
    regionOf: keepKeys.length ? regionOf : null,
    referenced: keepKeys.length ? new Set(i.reading.referenced) : null,
    lineskip: i.lineskip,
    centred: before.centredFlag,
  }) as FitBlock[]
  // (the borrow room under its last block (today's freeFor RUN:1677, read where the walk asks): down from a third of its size
  // under its last baseline to the first ink under it (Room.below: under its last line, to the first ink not its own), a
  // borrowGap of pitches clear of it, and never past the page's lowest unit line; the blocks before it none)
  const lastBlock = blocks.at(-1)
  const bottom = lastBlock ? i.bottomOf?.(lastBlock.page) : undefined
  // (set after the size below is read)
  const borrowRoom = (s: number) => {
    if (!lastBlock || bottom === undefined) return
    const last = lastBlock.B.at(-1)!,
      l = lines.at(-1)!
    const yStart = last - 0.3 * s,
      yLimit = bottom - 0.3 * s
    if (yLimit >= yStart) return
    const inkTop = l[6] - m.room.below
    const pitch = lastBlock.pitch0 ?? 1.2 * s
    const lowest =
      inkTop <= yLimit + 0.01 ? bottom : inkTop + Number((R as { borrowGap?: number }).borrowGap ?? 0) * pitch + 0.3 * s
    lastBlock.free = Math.max(0, last - lowest)
  }
  // (its size: the style's, where the prepare read it off its text (today's originalStyle); else, as today, the median of its
  // lines' bands over 0.894 (RUN:2088))
  const fromText = !(m.read ?? []).includes('size:lines')
  const heights = rects.map((r) => r[4] - r[2]).sort((a, b) => a - b)
  const s =
    (fromText ? unitSizeOf({ orig: { size: m.style.size, st: { caps: !!m.style.sc } } }, R) : undefined) ??
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
    const half = 0.5 * (b.sizes?.[0] ?? m.style.size)
    return {
      column: [l[7], l[8]],
      left: side[0] > l[7] + 0.01 ? [side[0] + half] : [],
      right: side[1] < l[8] - 0.01 ? [side[1] - half] : [],
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
          ownLabel:
            m.label && m.label.ink[0] === bl[0] && Math.abs(m.label.ink[5] - bl[4]) < 0.05
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
