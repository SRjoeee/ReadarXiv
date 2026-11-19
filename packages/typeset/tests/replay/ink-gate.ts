// I3 by ink (design §4.9: a laid unit's ink stays inside its regions and room and overlaps no other ink), read on the page as the
// reader draws it from the layer: arXiv's page with the groups the entry's Page turns off (Laid.off) erased, and the Page's laid
// lines drawn over it (Laid.lines). A laid unit's drawn ink is held against everything that stays on its page, each as the part
// states it (the engine's own statement of kept ink; no second reading of a PDF): the lines of every member not laid there (a unit
// left as the original, a figure text or a babel name not drawn, a member the prepare could not wrap), a laid member's lines and
// pieces whose group stays on (an element kept where it stands, a label kept as the original's ink, a line held KEPT, a group the
// add-on folded into another), every element stated `keep` (in no group), the ink no member owns beside a member's text lines
// (Room.stays: a mark, a frame's rule, a figure's ink on a text line's band), and every other laid unit's drawn ink.
//
// A drawn run's ink: from its start to its ink's right, its ink's ascent over its baseline (a raise added) and descent under it,
// as the reader's served faces measure it (Metrics.ink: the measure the entry laid it with); a crop's: its own ink boxes where the
// Page states them (Item.ink, which the reader cuts it by), else its rectangle, scaled by `k` with its base on the line's baseline.
// A line on arXiv's page: its ink across (Line x0, x1) and its fonts' boxes up and down (Line top, bottom: the part states no ink
// height of a text line); an element's, a label's and a stay's ink their boxes. Two boxes overlap where they share more than
// half a point across and up and down, as the runner's I3 read laid lines. A run set along a direction (a turned figure text, its
// items' `dir`, Item: from its line's origin along it, its ink's ascent across it to the left) is read by the page's box of its
// four corners. A box stands for ink it may not hold (a fonts' box over
// a line's glyphs, a painted image or a stay's pieces as one box): an overlap of a laid unit with ink its own original's lines on
// the page met already, by the same measure, is the page's own setting (a figure's label TeX set over its image, two labels whose
// boxes met on arXiv's page), counted apart and never held; with the unit's own element, label or line that stays, never so
// (its original's lines hold them). Not read: a figure's drawing (its paths and images) that stands on no member's text line,
// which no part states; a run no measure holds the ink of, counted apart.
import { type Box, type Ink, LINE_FLAG, type Part, type Placed } from '@readarxiv/format'
import type { Item, Metrics, Page } from '../../src/types.ts'

/** what a drawn box of a laid member meets: another laid member's drawn ink, or ink that stays, by what states it */
export type InkKind = 'drawn' | 'text' | 'element' | 'label' | 'stays'
/** one overlap: the laid member, the member whose ink it meets (itself where its own kept ink), what that ink is, the two boxes;
 *  `own` where the laid member's own original lines met that ink already (the page's own setting: counted apart, not held) */
export type InkOverlap = { ord: number; with: number; kind: InkKind; a: Box; b: Box; piece?: string; own?: true }
type Drawn = { ord: number; box: Box; piece?: string }
type Kept = { ord: number; box: Box; kind: Exclude<InkKind, 'drawn'>; piece?: string }

/** two boxes share more than half a point across and up and down (the runner's I3 measure, gate-l1.ts invariantsOf) */
const MEETS = 0.5
const meets = (a: Box, b: Box) =>
  Math.min(a[2], b[2]) - Math.max(a[0], b[0]) > MEETS && Math.min(a[3], b[3]) - Math.max(a[1], b[1]) > MEETS
const boxOf = (k: Ink): Box => [k[1], Math.min(k[2], k[4]), k[3], Math.max(k[2], k[4])]

/**
 * The laid members' drawn ink on the page, item by item: a run by its measured ink (`metrics`, then `served` where the first holds
 * no ink right of the run), a turned one by the page's box of its corners, a crop by its own ink boxes or its rectangle. `turned`:
 * the runs set along a direction read so; `unmeasured`: the runs no measure holds the ink of, not read
 */
export function drawnInk(
  page: Page,
  metrics: Metrics,
  served?: Metrics | null,
): { boxes: Drawn[]; turned: number; unmeasured: number } {
  const out: Drawn[] = []
  let turned = 0,
    unmeasured = 0
  const inkOf = (face: string, size: number, s: string): [number, number, number] | null => {
    for (const m of [metrics, served]) {
      if (!m) continue
      try {
        const k = m.ink(face, size, s)
        if (k.every(Number.isFinite)) return k
      } catch (e) {
        if ((e as Error)?.name !== 'MissingMeasure' && (e as Error)?.name !== 'Unserved') throw e
      }
    }
    return null
  }
  for (const m of page.members) {
    if (m.state !== 'laid') continue
    for (const [y, x0, , items] of m.lines) {
      for (const it of items as (Item & { rise?: number; slant?: number })[]) {
        if ('src' in it) {
          const [, sx0, , sx1, , base] = it.src
          const boxes = it.ink?.length ? it.ink : [[sx0, it.src[2], sx1, it.src[4]] as Box]
          for (const b of boxes)
            out.push({
              ord: it.of ?? m.ord,
              piece: it.piece,
              box: [
                it.x + (b[0] - sx0) * it.k,
                y + (Math.min(b[1], b[3]) - base) * it.k,
                it.x + (b[2] - sx0) * it.k,
                y + (Math.max(b[1], b[3]) - base) * it.k,
              ],
            })
          continue
        }
        if (!it.s.trim()) continue
        const rise = it.rise ?? 0
        // (a run of characters each placed (`dx`): its last character's ink from its own place)
        const last = it.dx?.length ? [...it.s].at(-1)! : it.s
        const at = it.dx?.length ? it.x + it.dx.at(-1)! : it.x
        const whole = inkOf(it.face, it.size, it.s),
          end = it.dx?.length ? inkOf(it.face, it.size, last) : whole
        if (!whole || !end) {
          unmeasured++
          continue
        }
        let right = at + end[2] + (it.track ?? 0) * Math.max(0, [...it.s].length - 1)
        const [a, d] = whole
        // (an oblique face's top-right corner stands its height times the slant further on)
        if (it.skew && it.slant) right += Math.max(0, a + rise) * Math.tan((it.slant * Math.PI) / 180)
        if ('dir' in it && it.dir) {
          // (along its direction u from its line's origin (x0, y): its start x - x0 along u, its ink to right - x0, across it
          // along u's left normal n from -d to a, a raise with it; the page's box of the four corners)
          turned++
          const [ux, uy] = it.dir
          const xs: number[] = [],
            ys: number[] = []
          for (const s0 of [it.x - x0, Math.max(it.x, right) - x0])
            for (const t of [rise - d, rise + a]) {
              xs.push(x0 + s0 * ux - t * uy)
              ys.push(y + s0 * uy + t * ux)
            }
          out.push({ ord: m.ord, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] })
          continue
        }
        out.push({ ord: m.ord, box: [it.x, y + rise - d, Math.max(it.x, right), y + rise + a] })
      }
    }
  }
  return { boxes: out, turned, unmeasured }
}

/**
 * The ink that stays on page `page.page` as the part states it, by its member: each member's text lines there unless the Page
 * turns its text group off (a line held KEPT always), its elements' ink unless their group is off (an element stated `keep`
 * always: in no group), its label's unless its label group is off, and the ink no member owns beside its text lines (Room.stays)
 */
export function keptInk(part: Part, page: Page): Kept[] {
  const pg = page.page
  const off = new Map(page.members.map((m) => [m.ord, m.off]))
  const out: Kept[] = []
  for (const m of part.flows.flat() as Placed[]) {
    const o = off.get(m.ord) ?? 0
    m.lines.forEach((l) => {
      if (l[0] !== pg) return
      if (o & 1 && !(l[9] & LINE_FLAG.KEPT)) return
      out.push({ ord: m.ord, kind: 'text', box: [l[2], Math.min(l[5], l[6]), l[3], Math.max(l[5], l[6])] })
    })
    for (const [id, e] of m.els ?? [])
      if (e.keep || !(o & 2))
        for (const k of e.ink) if (k[0] === pg) out.push({ ord: m.ord, kind: 'element', piece: id, box: boxOf(k) })
    if (m.label && m.label.ink[0] === pg && !(o & 4))
      out.push({ ord: m.ord, kind: 'label', piece: 'label', box: boxOf(m.label.ink) })
    for (const [j, x0, y0, x1, y1] of m.room.stays ?? [])
      if (m.lines[j]?.[0] === pg)
        out.push({ ord: m.ord, kind: 'stays', box: [x0, Math.min(y0, y1), x1, Math.max(y0, y1)] })
  }
  return out
}

/**
 * I3 by ink over one laid page: each laid member's drawn ink against every other laid member's and against the ink that stays
 * (keptInk), its own kept ink too (a translation laid over its own kept element or label is drawn over it all the same); a crop
 * is never held against the ink it is cut from (its own element's or label's, which it is). Each overlap once a page by the
 * laid member, the member whose ink it meets and what that ink is, with the first two boxes that meet
 */
export function inkOverlaps(
  page: Page,
  part: Part,
  metrics: Metrics,
  served?: Metrics | null,
): { overlaps: InkOverlap[]; turned: number; unmeasured: number } {
  const drawn = drawnInk(page, metrics, served)
  const kept = keptInk(part, page)
  // (each member's original lines on the page, as keptInk reads a line: what its own setting met)
  const origOf = new Map<number, Box[]>()
  for (const m of part.flows.flat() as Placed[])
    origOf.set(
      m.ord,
      m.lines
        .filter((l) => l[0] === page.page)
        .map((l): Box => [l[2], Math.min(l[5], l[6]), l[3], Math.max(l[5], l[6])]),
    )
  const metAlready = (ord: number, b: Box) => (origOf.get(ord) ?? []).some((o) => meets(o, b))
  const seen = new Map<string, InkOverlap>()
  // (one a page by the laid member, the member it meets and what that ink is: one its own original did not meet before any that it
  // did)
  const add = (x: InkOverlap) => {
    const k = `${x.ord}|${x.with}|${x.kind}`
    const had = seen.get(k)
    if (!had || (had.own && !x.own)) seen.set(k, x)
  }
  const D = drawn.boxes
  for (let i = 0; i < D.length; i++) {
    const a = D[i]!
    for (let j = i + 1; j < D.length; j++) {
      const b = D[j]!
      if (b.ord === a.ord || !meets(a.box, b.box)) continue
      const [p, q] = a.ord < b.ord ? [a, b] : [b, a]
      const own = (origOf.get(q.ord) ?? []).some((o) => metAlready(p.ord, o))
      add({ ord: p.ord, with: q.ord, kind: 'drawn', a: p.box, b: q.box, ...(own ? { own: true as const } : {}) })
    }
    for (const k of kept) {
      // (a crop is the ink it is cut from: its own element's or label's)
      if (k.ord === a.ord && a.piece !== undefined && k.piece === a.piece) continue
      if (!meets(a.box, k.box)) continue
      const own = (k.ord !== a.ord || k.kind === 'stays') && metAlready(a.ord, k.box)
      add({
        ord: a.ord,
        with: k.ord,
        kind: k.kind,
        a: a.box,
        b: k.box,
        ...(k.piece ? { piece: k.piece } : {}),
        ...(own ? { own: true as const } : {}),
      })
    }
  }
  return { overlaps: [...seen.values()], turned: drawn.turned, unmeasured: drawn.unmeasured }
}
