// The highlight (docs/PDF-READER.md §17): both panes light the same per-sentence boxes of the same unit,
// from `Page.lit` (on the left from A, on the right as drawn), with `{id, s}` the only lit state: a member's ord and its sentence,
// -1 for the whole member, -2 - k its display of piece k alone (Laid.lit's `own`: a display is a block of its own, the same ink on
// both panes, lit only where the pointer is over it, never with its member: docs/PDF-READER.md §17.9). What is painted is what
// is hit: a point lights the sentence whose box holds it, on the pane it is over, read from the same boxes the bands are drawn
// from, the smaller unit winning where two overlap; a miss keeps what is lit 120 ms (the HTML page's grace). A shape paints the
// union of its boxes and never part of one (paintRows: boxes on one band are never met); its rows are one outline where they
// meet across, never across another block standing between two of them (a display, another member's line: the run is cut
// there), which the outline would fill. A page that is not laid lights from A on both panes (the right mirrors the left). The
// pointer lights, nothing else does: a click holds nothing.
//
// The shapes (docs/PDF-READER.md §17.3, §17.9): one outline a shape (3 px corners), padded 3 px beside and above and below by
// half its member's own leading (the page's for a member of one row), never past half the room to the next block (padsOf);
// each shape in CSS pixels of the page as it was drawn, scaled with the page about its origin
// (`scale: calc(var(--total-scale-factor) / s0)`), so that a zoom's steps and a pinch move it on the compositor with no layout
// and no script (§10.1: percent positioning cost the page's layout every frame); the left's layer put back in the same task
// where PDF.js's redraw removes it (§10.2). One look and one paint a frame, the pointer read before anything is written; a
// scroll under a still pointer lights what comes under it; what is lit drawn again by what replaces it, the resting pointer
// asked again. Nothing is computed while the switch is off; a page another generation still shows is muted (nothing of it lit
// or hit on the right). A member set along a direction (a figure text the original sets turned: Laid.lit's `dir`, its boxes in
// its run's frame) is lit as a band turned with its text about its own centre, padded beside along its run and by half the
// leading across it, and hit where it is painted; a level box over it would stand over its neighbours (a label set at 30° about
// twice its height).
import type { Panes, Side } from '../panes/panes.ts'
import type { Clock } from '../stack/clock.ts'
import type { Composer } from './composer.ts'
import { LAND_FULL, LAND_MS } from './landing.ts'
import type { Box, Page } from './page.ts'

export { LAND_FULL, LAND_MS }

/** the pad beside a band, CSS px, its corners, and how long a point that lights nothing keeps what is lit */
export const PAD = 3
export const RADIUS = 3
export const MISS_HOLD = 120

export interface Lit {
  id: number
  s: number
}
export interface Highlight {
  readonly lit: Lit | null
  readonly on: boolean
  light(t: Lit | null): void
  /** what a point of the screen over `side` lights, or null */
  at(side: Side, x: number, y: number): Lit | null
  /** "you landed here" (link previews' §3.7): the shapes of a lit unit or sentence on both panes, or a box of a page on the panes
   *  that show it (`side`: that pane alone), in the band's look at full strength for LAND_FULL of LAND_MS, then fading; drawn
   *  in the highlight's own layer, whatever the hover switch says; a new landing replaces the last */
  land(what: { lit: Lit } | { page: number; box: Box; side?: Side }): void
  /** the sentence (or unit, `s` -1) a point of a page lights (PDF units on that pane's page, y up; `x` null: any column),
   *  else the first member whose box stands at most `below` under it; null where none */
  litAt(side: Side, page: number, x: number | null, y: number, below?: number): Lit | null
  setOn(on: boolean): void
  /** the shapes each pane shows (the probe's) */
  bands(): Record<Side, number>
  /** the looks made, and their script's time (ms), the probe's */
  costs(): { looks: number; ms: number[] }
  dispose(): void
}

/** a member's boxes on a pane: per sentence (one entry: lit whole), from the Page (the right's as drawn where its page is
 *  committed); and its displays (Laid.lit's `own`, the same on both panes), each a block of its own by its piece */
function entriesOf(page: Page, ord: number, side: Side, committed: boolean): { per: Box[][]; own: [string, Box[]][] } {
  const m = page.members.find((x) => x.ord === ord)
  if (!m) return { per: [], own: [] }
  return { per: side === 'right' && committed ? m.lit.right : m.lit.left, own: m.lit.own }
}
/** the lit state of a display alone (its piece's id; a key that is none lights nothing alone) and the piece it names */
const displayS = (key: string) => (/^\d+$/.test(key) ? -2 - Number(key) : null)
const displayKey = (s: number) => String(-2 - s)
/** the shapes a lit state paints of a member on a pane: every sentence (whole), one sentence, or one display */
function shapesOf(page: Page, lit: Lit, side: Side, committed: boolean): Box[][] {
  const { per, own } = entriesOf(page, lit.id, side, committed)
  if (lit.s === -1) return per
  // (a sentence the page holds none of, a display on another page: nothing of it here)
  if (lit.s >= 0) return lit.s < per.length ? [per[lit.s] as Box[]] : []
  const d = own.find(([k]) => k === displayKey(lit.s))
  return d ? [d[1]] : []
}
/** every box lit on a pane of a page but a turned member's (its boxes in its run's frame, a figure's text): what stands between
 *  two rows of a shape */
function pageBoxes(page: Page, side: Side, committed: boolean): Box[] {
  const out: Box[] = []
  for (const m of page.members) {
    if (m.lit.dir) continue
    const { per, own } = entriesOf(page, m.ord, side, committed)
    for (const boxes of per) out.push(...boxes)
    for (const [, boxes] of own) out.push(...boxes)
  }
  return out
}

/**
 * Whether each of a shape's boxes (PDF units, y up), in the order given, stands apart from the one before it: another block
 * stands between them, a box of `others` that is none of the shape's whose middle is between the two and that stands in
 * their column (meets `column` across: [x0, x1], the extent the shape's member spans on the page, its sentences' boxes and its
 * displays', columnOf), the two at least the shorter one's height apart (room for a line). A run is cut there, its own display
 * included: a block in the column between two rows, whatever their width, which the outline would fill (docs/PDF-READER.md
 * §17.9; on 2610.17024v1 p9 two short rows either side of display (43), both left of its ink, were joined by a strip down the
 * column's edge over its row while the rows on arXiv's page, longer, were cut). Never the first
 */
export function apartRows(boxes: readonly Box[], others: readonly Box[], column: readonly [number, number]): boolean[] {
  const mine = new Set(boxes)
  const [x0, x1] = column
  return boxes.map((below, i) => {
    const above = boxes[i - 1]
    if (!above) return false
    if (above[1] - below[3] < Math.min(above[3] - above[1], below[3] - below[1])) return false
    return others.some((o) => {
      if (mine.has(o)) return false
      const y = (o[1] + o[3]) / 2
      return y < above[1] && y > below[3] && Math.min(o[2], x1) > Math.max(o[0], x0)
    })
  })
}
/** the column a member's shapes stand in on a pane: the extent across of its every box there, its sentences' and its
 *  displays' (Laid.lit's entries and `own`); null where it has none */
export function columnOf(
  per: readonly (readonly Box[])[],
  own: readonly (readonly [string, readonly Box[]])[],
): [number, number] | null {
  let x0 = Number.POSITIVE_INFINITY,
    x1 = Number.NEGATIVE_INFINITY
  for (const boxes of [...per, ...own.map(([, b]) => b)])
    for (const b of boxes) {
      x0 = Math.min(x0, b[0])
      x1 = Math.max(x1, b[2])
    }
  return x0 < x1 ? [x0, x1] : null
}
/** what cuts a shape's rows into outlines: the page's boxes lit on the pane and the column its member spans there */
export type Cut = { others: readonly Box[]; column: readonly [number, number] }
/** a row a shape paints (PDF units, y up): `box` its extent across and its band, padded above and below (paintRows' `lead`: one
 *  half leading, or each box's pads, padsOf) and met with the row next to it where their pads overlap (meetOf); `own` the
 *  extent of the shape's boxes it paints; `apart` where it begins an outline of its own */
export type PaintRow = { box: Box; own: Box; apart: boolean }

/** whether two of a shape's boxes stand on one band: their own extents overlap up and down */
export const sharesBand = (boxes: readonly Box[]): boolean =>
  boxes.some((a, i) => boxes.some((b, j) => j > i && Math.min(a[3], b[3]) > Math.max(a[1], b[1])))

/**
 * Where two of a shape's rows one over the other meet, their pads overlapping (PDF units, y up): the middle of the overlap
 * (`foot`, the upper row's padded foot; `head`, the lower one's padded head), held in the gap between their own boxes (`ownFoot`,
 * the upper box's foot; `ownHead`, the lower one's head), so that each lit row covers its own box whole and neither is painted
 * past its own pad: the point lies inside both pads, the overlap and the gap always sharing one. Two rows padded alike meet
 * at the middle of that gap. The middle of the padded edges alone, where two rows' pads differ (a row's pad cut on one side by
 * a block near it, padsOf), lies inside the less padded one's box when the gap is narrower than the other's pad: boxes 1
 * apart, the upper one unpadded under, the lower padded 5 over, would meet 2 over the upper box's foot, that strip neither
 * painted nor hit (docs/PDF-READER.md §17.9)
 */
function meetOf(foot: number, head: number, ownFoot: number, ownHead: number): number {
  return Math.min(ownFoot, Math.max(ownHead, (foot + head) / 2))
}

/**
 * The rows a shape paints (PDF units, y up): the union of its boxes, never part of one. Two rows one over the other meet where
 * their pads overlap (meetOf: in the gap between their own boxes), so that they touch, and one outline joins them where they
 * meet across, the room between them painted, unless another block stands between them (apartRows, with `cut`). The reader's
 * paint and hit test read these rows, and so do the lab's models of the paint. Boxes on one band (their own extents overlapping up
 * and down) are never met: the union is cut into bands at every box's head and foot, each band's boxes one row where they meet
 * across (a row and the number TeX set beside it; two lines whose fonts' boxes overlap) and a row each where they stand apart
 * (a sentence's runs either side of another sentence's element, a line in the next column); a row joins the outline whose last
 * row stands on the band right above it and meets it across, else it begins its own. Every two rows next to each other in their
 * order from the top met where their pads overlap, as if one stood over the other, would cut two boxes of one band at the middle
 * of their overlap, the lower one's top and the upper one's foot lost (docs/PDF-READER.md §17.9; 2111.09276v1 p5: display (4),
 * its second row's line holding its number's "(", lit as a band over its first row and a strip to the number, its second row on
 * neither pane; over the corpus's laid pages 27 kept displays a pane, 7 and 2 sentences, 11 and 4 members lit whole cut so). A
 * shape of no two boxes on one band paints as before, row for row
 */
export function paintRows(boxes: readonly Box[], lead: number | Pads, cut?: Cut): PaintRow[] {
  const padOf: Pads = typeof lead === 'number' ? () => [lead, lead] : lead
  if (!sharesBand(boxes)) {
    const sorted = [...boxes].sort((p, q) => q[3] - p[3])
    const apart = cut ? apartRows(sorted, cut.others, cut.column) : sorted.map(() => false)
    const rows = sorted.map((b, i): PaintRow => {
      const [under, over] = padOf(b)
      return { box: [b[0], b[1] - under, b[2], b[3] + over], own: b, apart: !!apart[i] }
    })
    for (let i = 1; i < rows.length; i++) {
      const p = rows[i - 1] as PaintRow,
        q = rows[i] as PaintRow
      if (q.box[3] > p.box[1]) {
        const at = meetOf(p.box[1], q.box[3], p.own[1], q.own[3])
        p.box[1] = at
        q.box[3] = at
      }
    }
    return rows
  }
  // (the bands: the union cut at every box's head and foot, each band's boxes joined across where they meet or touch)
  const ys = [...new Set(boxes.flatMap((b) => [b[1], b[3]]))].sort((a, b) => b - a)
  const pieces: { own: Box; band: number }[] = []
  let band = 0
  for (let k = 1; k < ys.length; k++) {
    const hi = ys[k - 1] as number,
      lo = ys[k] as number
    const across = boxes
      .filter((b) => b[1] <= lo && b[3] >= hi)
      .map((b) => [b[0], b[2]] as [number, number])
      .sort((a, b) => a[0] - b[0])
    if (!across.length) continue
    const runs: [number, number][] = []
    for (const [a, b] of across) {
      const last = runs.at(-1)
      if (last && a <= last[1]) last[1] = Math.max(last[1], b)
      else runs.push([a, b])
    }
    for (const [a, b] of runs) pieces.push({ own: [a, lo, b, hi], band })
    band++
  }
  // (each padded by its pads (half the leading); two of two bands met where their pads overlap (meetOf), never into either:
  // next to each other from the top, and next to each other in an outline)
  const pads = pieces.map((p) => padOf(p.own))
  const head0 = pieces.map((p, i) => p.own[3] + (pads[i] as readonly [number, number])[1]),
    foot0 = pieces.map((p, i) => p.own[1] - (pads[i] as readonly [number, number])[0])
  const head = [...head0],
    foot = [...foot0]
  const meet = (u: number, l: number) => {
    const a = pieces[u] as (typeof pieces)[number],
      b = pieces[l] as (typeof pieces)[number]
    if (a.band === b.band || (head0[l] as number) <= (foot0[u] as number)) return
    const at = meetOf(foot0[u] as number, head0[l] as number, a.own[1], b.own[3])
    foot[u] = Math.max(foot[u] as number, at)
    head[l] = Math.min(head[l] as number, at)
  }
  for (let i = 1; i < pieces.length; i++) meet(i - 1, i)
  for (const [u, a] of pieces.entries())
    for (const [l, b] of pieces.entries())
      if (b.band === a.band + 1 && Math.min(a.own[2], b.own[2]) > Math.max(a.own[0], b.own[0])) meet(u, l)
  const chains: number[][] = []
  pieces.forEach((p, i) => {
    const c = chains.findLast((ch) => {
      const l = pieces[ch.at(-1) as number] as (typeof pieces)[number]
      return l.band === p.band - 1 && Math.min(l.own[2], p.own[2]) > Math.max(l.own[0], p.own[0])
    })
    if (c) c.push(i)
    else chains.push([i])
  })
  const mine = new Set(boxes)
  const others = cut?.others.filter((o) => !mine.has(o)) ?? []
  const out: PaintRow[] = []
  chains.forEach((ch, k) => {
    const apart = cut
      ? apartRows(
          ch.map((i) => (pieces[i] as (typeof pieces)[number]).own),
          others,
          cut.column,
        )
      : []
    ch.forEach((i, j) => {
      const own = (pieces[i] as (typeof pieces)[number]).own
      out.push({ box: [own[0], foot[i] as number, own[2], head[i] as number], own, apart: (!j && k > 0) || !!apart[j] })
    })
  })
  return out
}

const areaOf = (bs: readonly Box[][]) =>
  bs.flat().reduce((a, b) => a + Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]), 0)
/** the direction a member's boxes are set along (a turned figure text's: Laid.lit's `dir`, its boxes in its run's frame) */
const dirOf = (page: Page, ord: number) => page.members.find((x) => x.ord === ord)?.lit.dir

const leads = new WeakMap<Page, Map<string, number>>()
/** the half of a page's leading on a pane, PDF units: half the lower quartile of the gaps between a member's consecutive rows
 *  (the space between a kind's lines on that page), once a Page */
function halfLeading(page: Page, side: Side, committed: boolean): number {
  const key = `${side}:${committed}`
  const known = leads.get(page)?.get(key)
  if (known !== undefined) return known
  const v = halfLeadingOf(
    page.members.map((m) => (m.lit.dir ? [] : side === 'right' && committed ? m.lit.right : m.lit.left)),
  )
  const m = leads.get(page) ?? new Map<string, number>()
  m.set(key, v)
  leads.set(page, m)
  return v
}
const panesBy = new WeakMap<Page, Map<string, PaneMember[]>>()
const padsBy = new WeakMap<Page, Map<string, Pads>>()
/** the pads of a member's rows on a pane of a page (padsOf over the page's members there but a turned one, its half leading
 *  where the member has no gap of its own), once a Page */
function padsFor(page: Page, side: Side, committed: boolean, ord: number): Pads {
  const at = `${side}:${committed}`
  const key = `${at}:${ord}`
  const known = padsBy.get(page)?.get(key)
  if (known) return known
  const panes = panesBy.get(page) ?? new Map<string, PaneMember[]>()
  panesBy.set(page, panes)
  let pane = panes.get(at)
  if (!pane) {
    pane = page.members
      .filter((m) => !m.lit.dir)
      .map((m) => ({ ord: m.ord, per: side === 'right' && committed ? m.lit.right : m.lit.left, own: m.lit.own }))
    panes.set(at, pane)
  }
  const v = padsOf(pane, ord, halfLeading(page, side, committed))
  const m = padsBy.get(page) ?? new Map<string, Pads>()
  m.set(key, v)
  padsBy.set(page, m)
  return v
}
/**
 * Half the lower quartile of the gaps between each member's consecutive rows on a pane, PDF units (`members`: each member's
 * boxes there, one entry a sentence): its rows whatever sentence each is of, the space between a member's lines being its
 * leading. Read inside each sentence alone, a pane whose sentences each
 * hold one row (a translation's sentences are shorter than the original's), or whose rows a display parts, held no gap and
 * padded nothing: on 2610.10069v1-zh p21 the right pane's shapes stood on their glyphs' em boxes, a heading's flush with its
 * ink, where the left's were padded by 2.98 pt (the parity's highlight). Two sentences' boxes on one row
 * overlap and make no gap. The parity's measure reads the paint with this function (lab/typeset/parity/verdict.mjs)
 */
export function halfLeadingOf(members: readonly (readonly (readonly Box[])[])[]): number {
  return halfOf(members.flatMap((entries) => gapsOf(entries)))
}
/** the gaps between a member's consecutive rows on a pane (its boxes there, one entry a sentence): each under twice the lower
 *  row's height, two boxes on one row making none; and, where `blocks` are given, none across a block that stands between the
 *  two (its middle between them, meeting either across: a display, another member's line), which is no space between lines */
function gapsOf(entries: readonly (readonly Box[])[], blocks: readonly Box[] = []): number[] {
  const gaps: number[] = []
  const ys = entries.flat().sort((a, b) => b[3] - a[3])
  const across = (o: Box, r: Box) => Math.min(o[2], r[2]) > Math.max(o[0], r[0])
  for (let i = 1; i < ys.length; i++) {
    const a = ys[i - 1] as Box,
      b = ys[i] as Box
    const g = a[1] - b[3]
    if (!(g >= 0 && g < 2 * (b[3] - b[1]))) continue
    if (blocks.some((o) => (o[1] + o[3]) / 2 < a[1] && (o[1] + o[3]) / 2 > b[3] && (across(o, a) || across(o, b))))
      continue
    gaps.push(g)
  }
  return gaps
}
/** half the lower quartile of gaps, 0 for none */
function halfOf(gaps: number[]): number {
  if (!gaps.length) return 0
  gaps.sort((a, b) => a - b)
  return (gaps[Math.floor((gaps.length - 1) / 4)] as number) / 2
}

/** a box's pads, PDF units: under it and over it */
export type Pads = (b: Box) => readonly [under: number, over: number]
/** a member of a pane as the paint reads it: its boxes there by sentence and its displays (Laid.lit's entries and `own`) */
export type PaneMember = {
  ord: number
  per: readonly (readonly Box[])[]
  own: readonly (readonly [string, readonly Box[]])[]
}
/**
 * The pads over and under a member's rows on a pane (PDF units): half its own leading, the lower quartile of the gaps between
 * its own consecutive rows (as halfLeadingOf reads a page's; none across a block between two of them, a display of its own
 * or another member's line, which parts its lines and is no space between them), or `pageLead`, the page's on the pane, where
 * it has none (a member of one row); and never past half the room to the nearest other block over or under the box that meets
 * it across (another member's box on the pane, a display: a block of its own), so that the pads of two blocks meet at most
 * halfway between them. A display of the member's own is such a block to its rows, and they to it: a box of one (inside the
 * extent of its boxes: a box, or a band of them paintRows cuts) is painted and hit alone, so its pads stop halfway to the
 * member's own rows as to any other block's; padded by the member's leading alone, a display 10 under one of its rows was
 * painted 5 over that row's foot, and the pointer there lit the display. A page's leading is its body's: on 2610.19274v1-zh
 * p34, a double-spaced body (rows 18 pt apart) made it 8.87 pt, and the caption set single-spaced over a table (its rows 5.47
 * apart) was padded so under its last row, over the upper half of the table's header labels 2 pt under it, where its own rows'
 * half leading is 2.75
 */
export function padsOf(pane: readonly PaneMember[], ord: number, pageLead: number): Pads {
  const me = pane.find((m) => m.ord === ord)
  const others: Box[] = []
  for (const m of pane) {
    if (m.ord !== ord) for (const boxes of m.per) others.push(...boxes)
    for (const [, boxes] of m.own) others.push(...boxes)
  }
  const gaps = me ? gapsOf(me.per, others) : []
  const lead = gaps.length ? halfOf(gaps) : pageLead
  // (the member's own rows, and the extent of each of its displays: what stands around a box of a display)
  const rows = me ? me.per.flat() : []
  const displays = (me?.own ?? []).flatMap(([, boxes]) => (boxes.length ? [extentOf(boxes)] : []))
  const memo = new WeakMap<Box, readonly [number, number]>()
  return (b) => {
    const known = memo.get(b)
    if (known) return known
    let under = lead,
      over = lead
    const near = rows.length && displays.some((d) => within(b, d)) ? [...others, ...rows] : others
    for (const o of near) {
      if (Math.min(o[2], b[2]) <= Math.max(o[0], b[0])) continue
      if (o[1] >= b[3]) over = Math.min(over, (o[1] - b[3]) / 2)
      else if (o[3] <= b[1]) under = Math.min(under, (b[1] - o[3]) / 2)
    }
    const out = [under, over] as const
    memo.set(b, out)
    return out
  }
}
/** the extent of boxes: the least box that holds them all */
function extentOf(boxes: readonly Box[]): Box {
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ]
}
/** whether a box stands inside another (a band paintRows cuts takes its edges from its boxes' own: inside exactly) */
const within = (b: Box, d: Box) => b[0] >= d[0] && b[1] >= d[1] && b[2] <= d[2] && b[3] <= d[3]

/**
 * One outline of a shape's rectangles stacked from the top (CSS pixels, y down): an SVG path, every corner rounded to `radius`
 * (or half its shorter side), the inner ones too; rectangles that do not meet across by more than two radii, and one `apart`
 * from the one above it (another block between them, apartRows), are outlines of their own in the one path (a sentence's first
 * row right of its last; its rows either side of a display). An outline joins its rows at the
 * upper one's foot on the right and the lower one's head on the left, so that it fills what stands between two of them
 */
export function shapePath(
  rects: { x0: number; x1: number; y0: number; y1: number; apart?: boolean }[],
  radius: number,
): string {
  return shapeOutlines(rects, radius)
    .map((corners) => rounded(corners, radius))
    .join('')
}
/** the outlines shapePath draws of a shape's rows, each its corners in order, before they are rounded: what it paints (the lab's
 *  reader gate holds every lit box inside them, its I11; lab/typeset/painted.mjs) */
export function shapeOutlines(
  rects: { x0: number; x1: number; y0: number; y1: number; apart?: boolean }[],
  radius: number,
): [number, number][][] {
  const out: [number, number][][] = []
  for (let a = 0, b = 1; b <= rects.length; b++) {
    const p = rects[b - 1],
      q = rects[b]
    if (p && q && !q.apart && Math.min(p.x1, q.x1) - Math.max(p.x0, q.x0) > 2 * radius) continue
    out.push(cornersOf(rects, a, b))
    a = b
  }
  return out
}
function cornersOf(
  rects: { x0: number; x1: number; y0: number; y1: number }[],
  a: number,
  b: number,
): [number, number][] {
  const cx: number[] = [],
    cy: number[] = []
  const push = (x: number, y: number) => {
    const n = cx.length
    if (n && Math.abs(x - (cx[n - 1] as number)) < 0.01 && Math.abs(y - (cy[n - 1] as number)) < 0.01) return
    cx.push(x)
    cy.push(y)
  }
  const r = (i: number) => rects[i] as { x0: number; x1: number; y0: number; y1: number }
  push(r(a).x0, r(a).y0)
  push(r(a).x1, r(a).y0)
  for (let i = a; i < b; i++) {
    push(r(i).x1, r(i).y1)
    if (i + 1 < b) push(r(i + 1).x1, r(i).y1)
  }
  push(r(b - 1).x0, r(b - 1).y1)
  for (let i = b - 1; i > a; i--) {
    push(r(i).x0, r(i).y0)
    push(r(i - 1).x0, r(i).y0)
  }
  let n = cx.length
  if (
    n > 1 &&
    Math.abs((cx[0] as number) - (cx[n - 1] as number)) < 0.01 &&
    Math.abs((cy[0] as number) - (cy[n - 1] as number)) < 0.01
  )
    n--
  // (the corners that turn: a point on the line through its neighbours is none)
  const keep: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const p = (i - 1 + n) % n,
      q = (i + 1) % n
    const X = (k: number) => cx[k] as number,
      Y = (k: number) => cy[k] as number
    if (Math.abs((X(i) - X(p)) * (Y(q) - Y(i)) - (Y(i) - Y(p)) * (X(q) - X(i))) > 0.001) keep.push([X(i), Y(i)])
  }
  return keep
}
/** an outline's corners as an SVG path, every corner rounded to `radius` (or half its shorter side) */
function rounded(keep: readonly [number, number][], radius: number): string {
  const f = (v: number) => Math.round(v * 100) / 100
  let d = ''
  keep.forEach(([x, y], k) => {
    const [Ax, Ay] = keep[(k - 1 + keep.length) % keep.length] as [number, number],
      [Bx, By] = keep[(k + 1) % keep.length] as [number, number]
    const ax = Ax - x,
      ay = Ay - y,
      bx = Bx - x,
      by = By - y
    const la = Math.hypot(ax, ay),
      lb = Math.hypot(bx, by),
      rr = Math.min(radius, la / 2, lb / 2)
    d += `${k ? 'L' : 'M'}${f(x + (ax * rr) / la)} ${f(y + (ay * rr) / la)}Q${f(x)} ${f(y)} ${f(x + (bx * rr) / lb)} ${f(y + (by * rr) / lb)}`
  })
  return `${d}Z`
}

export function createHighlight(o: { panes: Panes; composer: Composer; clock: Clock; on: boolean }): Highlight {
  const { panes, composer, clock } = o
  let lit: Lit | null = null,
    on = o.on,
    missTimer = 0,
    frame = 0,
    disposed = false
  const ac = new AbortController()
  const costs: number[] = []
  let looks = 0
  /** each pane's layers, by page; the left's pages watched for PDF.js's redraw taking a layer (§10.2) */
  const layers: Record<Side, Map<number, HTMLElement>> = { left: new Map(), right: new Map() }
  const watch = new MutationObserver((records) => {
    for (const r of records)
      for (const node of r.removedNodes)
        if (node instanceof HTMLElement && node.classList.contains('axt-hl-layer') && !node.dataset.axtGone) {
          const page = r.target as HTMLElement
          if (!node.isConnected) page.append(node)
        }
  })
  const watched = new WeakSet<HTMLElement>()
  const layerOf = (side: Side, n: number): HTMLElement | null => {
    const page = panes.pageElement(side, n)
    if (!page) return null
    let l = layers[side].get(n)
    if (!l || l.parentElement !== page) {
      l = page.querySelector<HTMLElement>(':scope > .axt-hl-layer') ?? document.createElement('div')
      l.className = 'axt-hl-layer'
      page.append(l)
      layers[side].set(n, l)
      if (side === 'left' && !watched.has(page)) {
        watched.add(page)
        watch.observe(page, { childList: true })
      }
    }
    return l
  }
  /** every page a lit member has boxes on: the pages laid now that hold it */
  const pagesOf = (ord: number): number[] => {
    const out: number[] = []
    for (let n = 1; n <= panes.right.pages; n++) if (composer.page(n)?.members.some((m) => m.ord === ord)) out.push(n)
    return out
  }
  /** the rows of a shape (paintRows: the union of its boxes, never part of one, met where their pads overlap) in the page's CSS
   *  px at its scale now, in its own frame (a turned page's layer is turned with it), padded beside; with `cut` (the page's boxes
   *  on the pane and the column of the shape's member), each row apart from the one above it where another block stands between
   *  them in that column (apartRows: an outline of its own). The rows the lab's models read, the page's box of each: what is
   *  painted and hit is theirs */
  function rowsOf(side: Side, n: number, boxes: Box[], lead: number | Pads, cut?: Cut, pad = PAD) {
    const out: { x0: number; x1: number; y0: number; y1: number; apart?: boolean }[] = []
    for (const row of paintRows(boxes, lead, cut)) {
      const r = panes.boxOf(side, n, row.box, { upright: true })
      if (!r) continue
      out.push({
        x0: r.left - pad,
        x1: r.left + r.width + pad,
        y0: r.top,
        y1: r.top + r.height,
        ...(row.apart ? { apart: true } : {}),
      })
    }
    return out
  }
  /** the rows of a turned member's shape (its boxes in its run's frame along `dir`) in the page's CSS px at its scale now, each
   *  a rectangle turned with its text: its centre, its length along its run padded beside, its band across it padded by half
   *  the leading, and the angle its run stands at on the page (CSS's: clockwise, y down) */
  function turnedRowsOf(side: Side, n: number, boxes: Box[], lead: number, [ux, uy]: [number, number], pad = PAD) {
    const at = (s: number, t: number) => {
      const x = s * ux - t * uy,
        y = s * uy + t * ux
      const r = panes.boxOf(side, n, [x, y, x, y], { upright: true })
      return r ? [r.left, r.top] : null
    }
    const o = at(0, 0),
      e = at(1, 0)
    if (!o || !e) return []
    const k = Math.hypot((e[0] as number) - (o[0] as number), (e[1] as number) - (o[1] as number))
    const deg = (Math.atan2((e[1] as number) - (o[1] as number), (e[0] as number) - (o[0] as number)) * 180) / Math.PI
    const out: { cx: number; cy: number; w: number; h: number; deg: number }[] = []
    for (const b of boxes) {
      const c = at((b[0] + b[2]) / 2, (b[1] + b[3]) / 2)
      if (!c) continue
      out.push({
        cx: c[0] as number,
        cy: c[1] as number,
        w: (b[2] - b[0]) * k + 2 * pad,
        h: (b[3] - b[1] + 2 * lead) * k,
        deg,
      })
    }
    return out
  }
  function paint() {
    for (const side of ['left', 'right'] as const)
      for (const l of layers[side].values())
        for (const c of [...l.children]) if (!c.classList.contains('axt-land')) c.remove()
    if (!lit || !on) return
    drawLit(lit, '')
  }
  /** the shapes of a lit state on both panes, every page that holds its member; `extra`, a class of each shape's beside the
   *  band's (the landing's); the elements made */
  function drawLit(lit: Lit, extra: string): Element[] {
    const made: Element[] = []
    for (const n of pagesOf(lit.id)) {
      const page = composer.page(n) as Page
      const committed = !!composer.laid(n) && !composer.muted(n)
      for (const side of ['left', 'right'] as const) {
        // (a page another generation still shows: nothing of it lit on the right until the new one commits)
        if (side === 'right' && composer.muted(n)) continue
        const shapes = shapesOf(page, lit, side, committed)
        const layer = layerOf(side, n)
        const frame = panes.frameOf(side, n)
        if (!layer || !frame) continue
        // (a turned page's layer: the page's own frame, turned with the page as its drawing is)
        if (frame.turn && layer.dataset.axtTurn !== String(frame.turn)) {
          layer.dataset.axtTurn = String(frame.turn)
          layer.style.setProperty('--axt-frame-w', `calc(var(--total-scale-factor) * ${frame.w}px)`)
          layer.style.setProperty('--axt-frame-h', `calc(var(--total-scale-factor) * ${frame.h}px)`)
        }
        const s0 = panes.scale
        // (a figure text on its own lines' band alone: Laid.lit's `band`)
        const band = !!page.members.find((m) => m.ord === lit?.id)?.lit.band
        const lead = band ? 0 : halfLeading(page, side, committed)
        // (a level member's rows padded by its own leading, never past half the room to the next block: padsOf)
        const pads = band ? 0 : padsFor(page, side, committed, lit.id)
        const pad = band ? 0 : PAD
        const dir = dirOf(page, lit.id)
        // (a turned member's rows turned with its text: each a band of its own about its centre, at its run's angle, scaled with
        // the page about the page's origin as any)
        if (dir)
          for (const r of shapes.flatMap((boxes) => turnedRowsOf(side, n, boxes, lead, dir, pad))) {
            const el = document.createElement('div')
            el.className = `axt-hl${extra}`
            made.push(el)
            Object.assign(el.style, {
              left: '0px',
              top: '0px',
              width: `${r.w}px`,
              height: `${r.h}px`,
              transformOrigin: '0px 0px',
              transform: `translate(${r.cx}px, ${r.cy}px) rotate(${r.deg}deg) translate(${-r.w / 2}px, ${-r.h / 2}px)`,
              scale: `calc(var(--total-scale-factor) / ${s0 * (96 / 72)})`,
            })
            layer.append(el)
          }
        // (what stands between two of a shape's rows: the page's boxes on the pane, in the column its member spans there)
        const mine = entriesOf(page, lit.id, side, committed)
        const column = dir || !shapes.length ? null : columnOf(mine.per, mine.own)
        const cut = column ? { others: pageBoxes(page, side, committed), column } : undefined
        for (const boxes of dir ? [] : shapes) {
          const rows = rowsOf(side, n, boxes, pads, cut, pad)
          if (!rows.length) continue
          const X0 = Math.min(...rows.map((r) => r.x0)),
            Y0 = Math.min(...rows.map((r) => r.y0))
          const local = rows.map((r) => ({
            x0: r.x0 - X0,
            x1: r.x1 - X0,
            y0: r.y0 - Y0,
            y1: r.y1 - Y0,
            apart: r.apart,
          }))
          const w = Math.max(...local.map((r) => r.x1)),
            h = Math.max(...local.map((r) => r.y1))
          let el: HTMLElement | SVGSVGElement
          if (rows.length === 1) {
            el = document.createElement('div')
            el.className = `axt-hl${extra}`
          } else {
            el = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
            el.setAttribute('class', `axt-hl axt-hl-shape${extra}`)
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
            path.setAttribute('d', shapePath(local, RADIUS))
            el.append(path)
          }
          // (its pixels at the scale it was drawn at, scaled with the page about the page's origin: a zoom's steps and a pinch
          // move it on the compositor)
          Object.assign((el as HTMLElement).style, {
            left: `${X0}px`,
            top: `${Y0}px`,
            width: `${w}px`,
            height: `${h}px`,
            transformOrigin: `${-X0}px ${-Y0}px`,
            scale: `calc(var(--total-scale-factor) / ${s0 * (96 / 72)})`,
          })
          layer.append(el)
          made.push(el)
        }
      }
    }
    return made
  }
  // ---- the landing: one at a time, gone after LAND_MS
  let landed: Element[] = []
  let landTimer = 0
  const unland = () => {
    clock.clear(landTimer)
    landTimer = 0
    for (const el of landed) el.remove()
    landed = []
  }
  /** a box of a page on a pane, as a band of its own (the link's half tint's inset: 1.5 px over and under, 2 px beside) */
  function drawBox(side: Side, n: number, box: Box): Element | null {
    const layer = layerOf(side, n)
    const frame = panes.frameOf(side, n)
    const r = panes.boxOf(side, n, box, { upright: true })
    if (!layer || !frame || !r) return null
    if (frame.turn && layer.dataset.axtTurn !== String(frame.turn)) {
      layer.dataset.axtTurn = String(frame.turn)
      layer.style.setProperty('--axt-frame-w', `calc(var(--total-scale-factor) * ${frame.w}px)`)
      layer.style.setProperty('--axt-frame-h', `calc(var(--total-scale-factor) * ${frame.h}px)`)
    }
    const el = document.createElement('div')
    el.className = 'axt-hl axt-land axt-land-box'
    const x0 = r.left - 2,
      y0 = r.top - 1.5
    Object.assign(el.style, {
      left: `${x0}px`,
      top: `${y0}px`,
      width: `${r.width + 4}px`,
      height: `${r.height + 3}px`,
      transformOrigin: `${-x0}px ${-y0}px`,
      scale: `calc(var(--total-scale-factor) / ${panes.scale * (96 / 72)})`,
    })
    layer.append(el)
    return el
  }
  function land(what: { lit: Lit } | { page: number; box: Box; side?: Side }) {
    if (disposed) return
    unland()
    if ('lit' in what) landed = drawLit(what.lit, ' axt-land')
    else
      for (const side of what.side ? [what.side] : (['left', 'right'] as const)) {
        if (side === 'right' && composer.muted(what.page)) continue
        const el = drawBox(side, what.page, what.box)
        if (el) landed.push(el)
      }
    if (landed.length) landTimer = clock.later(unland, LAND_MS)
  }
  function litAt(side: Side, n: number, x: number | null, y: number, below = 0): Lit | null {
    const page = composer.page(n)
    if (!page || (side === 'right' && composer.muted(n))) return null
    const committed = !!composer.laid(n)
    const across = (b: Box) => x === null || (x >= b[0] && x <= b[2])
    let best: Lit | null = null,
      least = Number.POSITIVE_INFINITY,
      near: Lit | null = null,
      nearest = Number.POSITIVE_INFINITY
    for (const m of page.members) {
      if (m.lit.dir) continue
      const { per } = entriesOf(page, m.ord, side, committed)
      const whole = !(per.length > 1 && m.lit.left.length > 1)
      for (let s = 0; s < per.length; s++)
        for (const b of per[s] as Box[]) {
          const t = { id: m.ord, s: whole ? -1 : s }
          if (across(b) && y >= b[1] && y <= b[3]) {
            const area = areaOf(per)
            if (area < least) {
              least = area
              best = t
            }
          } else if (below > 0 && across(b) && b[3] <= y && y - b[3] <= below && y - b[3] < nearest) {
            nearest = y - b[3]
            near = t
          }
        }
    }
    return best ?? near
  }
  function at(side: Side, x: number, y: number): Lit | null {
    // (the page under the point and the point in its box by arithmetic over the places the panes keep (pointAt), the follower's
    // shift and the scroll as their events give them: no element tested and no layout read in the pointer's frame (§17.4) but
    // while a pinch is shown; the DOM's hit test here, elementFromPoint in every frame of a scroll, was a tenth of a scroll's
    // main-thread time, §17.9)
    const hit = panes.pointAt(side, x, y)
    if (!hit) return null
    const n = hit.page
    if (side === 'right' && composer.muted(n)) return null
    const page = composer.page(n)
    const f = panes.frameOf(side, n)
    if (!page || !f) return null
    let px = hit.x,
      py = hit.y
    // (on a turned page, the point turned back into the page's own frame, where the rows are)
    if (f.turn === 90) [px, py] = [py, f.height - px]
    else if (f.turn === 180) [px, py] = [f.width - px, f.height - py]
    else if (f.turn === 270) [px, py] = [f.width - py, px]
    const committed = !!composer.laid(n)
    const lead = halfLeading(page, side, committed)
    // (what is painted is what is hit: the same rows; the smaller unit winning where two overlap, a heading run into its paragraph)
    let best: Lit | null = null,
      least = Number.POSITIVE_INFINITY
    // (a turned member's rows hit as painted: the point turned back into each row's own frame; a figure text's on its band)
    const inside = (m: Page['members'][number], boxes: Box[]) => {
      const lit = m.lit,
        dir = lit.dir,
        l = lit.band ? 0 : lead,
        pad = lit.band ? 0 : PAD
      return dir
        ? turnedRowsOf(side, n, boxes, l, dir, pad).some((q) => {
            const a = (-q.deg * Math.PI) / 180,
              dx = px - q.cx,
              dy = py - q.cy
            return (
              Math.abs(dx * Math.cos(a) - dy * Math.sin(a)) <= q.w / 2 &&
              Math.abs(dx * Math.sin(a) + dy * Math.cos(a)) <= q.h / 2
            )
          })
        : rowsOf(side, n, boxes, lit.band ? 0 : padsFor(page, side, committed, m.ord), undefined, pad).some(
            (q) => px >= q.x0 && px <= q.x1 && py >= q.y0 && py <= q.y1,
          )
    }
    const take = (t: Lit, area: number) => {
      if (area < least) {
        least = area
        best = t
      }
    }
    for (const m of page.members) {
      const { per, own } = entriesOf(page, m.ord, side, committed)
      for (let s = 0; s < per.length; s++)
        if (inside(m, per[s] as Box[]))
          take({ id: m.ord, s: per.length > 1 && m.lit.left.length > 1 ? s : -1 }, areaOf(per))
      // (a display: a block of its own, its own area)
      for (const [key, boxes] of own) {
        const s = displayS(key)
        if (s !== null && inside(m, boxes)) take({ id: m.ord, s }, areaOf([boxes]))
      }
    }
    return best
  }
  const same = (a: Lit | null, b: Lit | null) => a === b || (!!a && !!b && a.id === b.id && a.s === b.s)
  function light(t: Lit | null) {
    clock.clear(missTimer)
    missTimer = 0
    if (!on) t = null
    if (same(t, lit)) return
    lit = t
    paint()
  }
  // the pointer: one look a frame, read before anything is written; a miss held MISS_HOLD
  let last: { side: Side; x: number; y: number } | null = null
  const look = () => {
    frame = 0
    if (!last || !on || disposed) return
    const t0 = performance.now()
    const t = at(last.side, last.x, last.y)
    if (t) light(t)
    else if (lit && !missTimer) missTimer = clock.later(() => light(null), MISS_HOLD)
    looks++
    costs.push(performance.now() - t0)
    if (costs.length > 256) costs.shift()
  }
  const lookSoon = () => {
    if (!frame && last && on) frame = clock.frame(look)
  }
  for (const side of ['left', 'right'] as const) {
    const c = panes.containerOf(side)
    c.addEventListener(
      'mousemove',
      (e) => {
        last = { side, x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY }
        lookSoon()
      },
      { signal: ac.signal },
    )
    c.addEventListener(
      'mouseleave',
      () => {
        last = null
        if (lit && !missTimer) missTimer = clock.later(() => light(null), MISS_HOLD)
      },
      { signal: ac.signal },
    )
    // (a scroll under a still pointer lights what comes under it)
    c.addEventListener('scroll', lookSoon, { passive: true, signal: ac.signal })
  }
  // (drawn again at a new scale, and where a page's own redraw took its layer; what is lit drawn again by what replaces it, and
  // the resting pointer asked again)
  const offs = [
    panes.on('scale', () => paint()),
    panes.on('drawn', () => (lit ? paint() : undefined)),
    composer.on('laid', () => {
      if (lit) paint()
      lookSoon()
    }),
    panes.right.on('shown', () => lookSoon()),
  ]
  return {
    get lit() {
      return lit
    },
    get on() {
      return on
    },
    light,
    at,
    land,
    litAt,
    setOn(next) {
      if (on === next) return
      on = next
      if (!on) {
        clock.cancel(frame)
        frame = 0
        light(null)
      } else lookSoon()
    },
    bands: () => ({
      left: [...layers.left.values()].reduce((a, l) => a + l.childElementCount, 0),
      right: [...layers.right.values()].reduce((a, l) => a + l.childElementCount, 0),
    }),
    costs: () => ({ looks, ms: costs.slice() }),
    dispose() {
      if (disposed) return
      disposed = true
      ac.abort()
      watch.disconnect()
      for (const f of offs) f()
      clock.clear(missTimer)
      clock.cancel(frame)
      unland()
      for (const side of ['left', 'right'] as const)
        for (const l of layers[side].values()) {
          l.dataset.axtGone = ''
          l.remove()
        }
    },
  }
}
