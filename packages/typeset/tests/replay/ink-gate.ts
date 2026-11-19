// I3 by ink (design §4.9: a laid unit's ink stays inside its regions and room and overlaps no other ink), read on the page as the
// reader draws it from the layer: arXiv's page with the groups the entry's Page turns off (Laid.off) erased, and the Page's laid
// lines drawn over it (Laid.lines). A laid unit's drawn ink is held against everything that stays on its page, each as the part
// states it (the engine's own statement of kept ink; no second reading of a PDF): the lines of every member not laid there (a unit
// left as the original, a figure text or a babel name not drawn, a member the prepare could not wrap), a laid member's lines and
// pieces whose group stays on (an element kept where it stands, a label kept as the original's ink, a line held KEPT, a group the
// add-on folded into another), every element stated `keep` (in no group), the ink no member owns beside a member's text lines
// (Room.stays: a mark, a frame's rule, a figure's ink on a text line's band), and every other laid unit's drawn ink.
//
// Ink is read glyph by glyph where a run's box meets other ink: each character's ink at its place in the run (its `dx`, else the
// run's advance up to it; the tracking after each character), from its ink's left to its ink's right, its ascent over the baseline
// (a raise added) and its descent under it, as the reader's served faces measure it (Metrics.ink, the measure the entry laid it
// with; the ink's left from the served faces' own reading, `inkLeft`, where the Metrics holds none: a CJK opening mark's blank
// first half is no ink, nor a glyph's left bearing). A run set along a direction (a turned figure text, its items' `dir`: from its
// line's origin along it, its ascent across it to the left) is read in its own frame, a rectangle turned with it. A crop's ink is
// its own ink boxes where the Page states them (Item.ink, which the reader cuts it by), else its piece's ink as the part states it
// (an element's El.ink, a label's Label.ink), else its rectangle, each inside its rectangle, scaled by `k` with its base on the
// line's baseline. A line on arXiv's page: its ink across (Line x0, x1) and its fonts' boxes up and down (Line top,
// bottom: the part states no ink height of a text line); a turned member's line in its run's frame, its length along the run
// (Placed.run) and the rest of its stated box across it; an element's, a label's and a stay's ink their boxes. Two inks overlap
// where they share more than half a point on every axis of the two (the runner's I3 measure across and up and down, gate-l1.ts
// invariantsOf; a turned rectangle's own axes beside). A box stands for ink it may not hold (a fonts' box over a line's glyphs, a
// painted image or a stay's pieces as one box): an overlap of a laid unit with ink its own original's lines on the page met
// already, by the same measure, is the page's own setting (a figure's label TeX set over its image, two labels whose boxes met on
// arXiv's page), counted apart and never held; with the unit's own element, label or line that stays, never so (its original's
// lines hold them). Not read: a figure's drawing (its paths and images) that stands on no member's text line, which no part
// states; a run no measure holds the ink of, counted apart.
import { type Box, type Ink, LINE_FLAG, type Part, type Placed } from '@readarxiv/format'
import type { Item, Metrics, Page } from '../../src/types.ts'

/** what a drawn box of a laid member meets: another laid member's drawn ink, or ink that stays, by what states it */
export type InkKind = 'drawn' | 'text' | 'element' | 'label' | 'stays'
/** one overlap: the laid member, the member whose ink it meets (itself where its own kept ink), what that ink is, the page's boxes
 *  of the two inks that meet; `own` where the laid member's own original lines met that ink already (the page's own setting:
 *  counted apart, not held) */
export type InkOverlap = { ord: number; with: number; kind: InkKind; a: Box; b: Box; piece?: string; own?: true }
/** a rectangle in a frame: `o` its origin on the page, `u` the unit vector along it (its left normal across it), `s` its extent
 *  along u, `t` across it; one of the page's own is at (0, 0) along (1, 0) */
export type Rect = { o: [number, number]; u: [number, number]; s: [number, number]; t: [number, number] }
/** the served faces' reading of where a text's ink starts, right of its start (served-metrics.mjs): no field of Metrics */
export type InkLeft = { inkLeft?(face: string, size: number, text: string): number }
type Glyphs = () => Rect[]
/** a laid member's drawn ink; a crop's `pieces`, what it is cut from: its member's elements whose ink it holds, by id, or
 *  'label' */
type Drawn = { ord: number; r: Rect; pieces?: readonly string[]; glyphs?: Glyphs }
type Kept = { ord: number; r: Rect; kind: Exclude<InkKind, 'drawn'>; piece?: string }

/** two inks overlap where they share more than half a point on each axis (the runner's I3 measure, gate-l1.ts invariantsOf) */
const MEETS = 0.5
const page = (b: Box): Rect => ({
  o: [0, 0],
  u: [1, 0],
  s: [Math.min(b[0], b[2]), Math.max(b[0], b[2])],
  t: [Math.min(b[1], b[3]), Math.max(b[1], b[3])],
})
const corners = (r: Rect): [number, number][] => {
  const [ux, uy] = r.u
  return [r.s[0], r.s[1]].flatMap((s) =>
    [r.t[0], r.t[1]].map((t): [number, number] => [r.o[0] + s * ux - t * uy, r.o[1] + s * uy + t * ux]),
  )
}
/** the page's box of a rectangle */
export const boxOfRect = (r: Rect): Box => {
  const c = corners(r)
  return [
    Math.min(...c.map((p) => p[0])),
    Math.min(...c.map((p) => p[1])),
    Math.max(...c.map((p) => p[0])),
    Math.max(...c.map((p) => p[1])),
  ]
}
/** whether two rectangles share more than MEETS on every axis of the two (their own along and across) */
export function meets(a: Rect, b: Rect): boolean {
  const axes: [number, number][] = [a.u, [-a.u[1], a.u[0]], b.u, [-b.u[1], b.u[0]]]
  const ca = corners(a),
    cb = corners(b)
  for (const [ax, ay] of axes) {
    const pa = ca.map(([x, y]) => x * ax + y * ay),
      pb = cb.map(([x, y]) => x * ax + y * ay)
    if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= MEETS) return false
  }
  return true
}
const inkBox = (k: Ink): Box => [k[1], Math.min(k[2], k[4]), k[3], Math.max(k[2], k[4])]

/**
 * A turned member's line on A in its run's frame (Placed.dir, Placed.run: its first glyph's origin and its length along the
 * direction): across it, what the line's stated box on the page leaves of its height (the box of a rectangle that long and that
 * wide, turned so); null where the part states no run
 */
function turnedLine(m: Placed, l: Placed['lines'][number]): Rect | null {
  if (!m.dir || !m.run) return null
  const [ux, uy] = m.dir
  const [ox, oy, L] = m.run
  const x0 = l[2],
    x1 = l[3],
    y0 = Math.min(l[5], l[6]),
    y1 = Math.max(l[5], l[6])
  let t0: number, t1: number
  // (each side of the box is reached at a corner: its coordinate there solved for the extent across, by the axis it changes on most)
  if (Math.abs(ux) >= Math.abs(uy)) {
    const lo = (y0 - oy - Math.min(0, L * uy)) / ux,
      hi = (y1 - oy - Math.max(0, L * uy)) / ux
    ;[t0, t1] = ux > 0 ? [lo, hi] : [hi, lo]
  } else {
    const lo = (ox + Math.min(0, L * ux) - x0) / uy,
      hi = (ox + Math.max(0, L * ux) - x1) / uy
    ;[t1, t0] = uy > 0 ? [lo, hi] : [hi, lo]
  }
  return { o: [ox, oy], u: [ux, uy], s: [0, L], t: [Math.min(t0, t1), Math.max(t0, t1)] }
}
/** a member's line on A as I3 reads it: its run's frame where it is turned, else its ink across and its fonts' box up and down */
const lineRect = (m: Placed, l: Placed['lines'][number]): Rect =>
  turnedLine(m, l) ?? page([l[2], Math.min(l[5], l[6]), l[3], Math.max(l[5], l[6])])

/**
 * The laid members' drawn ink on the page, item by item: a run by its measured ink (`metrics`, then `served` where the first holds
 * none), as a rectangle of the run (turned with it) and its glyphs' each, read where it meets other ink; a crop by its own ink
 * boxes or its rectangle. `turned`: the runs set along a direction; `unmeasured`: the runs no measure holds the ink of, not read
 */
export function drawnInk(
  page_: Page,
  metrics: Metrics,
  served?: (Metrics & InkLeft) | null,
  part?: Part,
): { inks: Drawn[]; turned: number; unmeasured: number } {
  const out: Drawn[] = []
  // (each member's pieces' ink on A as the part states it, by id: its elements' El.ink, its label's Label.ink. A crop names its
  // piece by its place among its row's pieces (Item.piece), which the Page does not state: it is read by its ink, which the
  // crop's rectangle holds on its page)
  const pieceInk = new Map<number, [string, Ink][]>()
  for (const m of (part?.flows.flat() ?? []) as Placed[])
    pieceInk.set(m.ord, [
      ...(m.els ?? []).flatMap(([id, e]) => e.ink.map((k): [string, Ink] => [id, k])),
      ...(m.label ? [['label', m.label.ink] as [string, Ink]] : []),
    ])
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
  const leftOf = (face: string, size: number, s: string): number => {
    try {
      return served?.inkLeft?.(face, size, s) ?? 0
    } catch (e) {
      if ((e as Error)?.name !== 'Unserved') throw e
      return 0
    }
  }
  const advanceOf = (face: string, size: number, s: string): number | null => {
    for (const m of [metrics, served]) {
      if (!m) continue
      try {
        return m.advance(face, size, s)
      } catch (e) {
        if ((e as Error)?.name !== 'MissingMeasure' && (e as Error)?.name !== 'Unserved') throw e
      }
    }
    return null
  }
  for (const m of page_.members) {
    if (m.state !== 'laid') continue
    for (const [y, x0, , items] of m.lines) {
      for (const it of items as (Item & { rise?: number; slant?: number })[]) {
        if ('src' in it) {
          const [, sx0, sy0, sx1, sy1, base] = it.src
          // (what the reader draws of it: its rectangle cut by its own ink, each box inside the rectangle (a URL cut where TeX's url
          // package breaks it states its whole ink on its line, its parts each a rectangle of it); where the Page states none, its
          // piece's ink on A as the part states it, inside the rectangle (the rectangle's antialiased margin is no ink); else the
          // rectangle)
          // (its member's pieces whose ink on its page its rectangle holds, as gate-l1.ts pastInk finds a crop's ink)
          const held = (pieceInk.get(it.of ?? m.ord) ?? []).filter(
            ([id, k]) =>
              (it.piece === 'label') === (id === 'label') &&
              k[0] === it.src[0] &&
              k[1] >= sx0 - 0.01 &&
              k[3] <= sx1 + 0.01 &&
              Math.min(k[2], k[4]) >= Math.min(sy0, sy1) - 0.01 &&
              Math.max(k[2], k[4]) <= Math.max(sy0, sy1) + 0.01,
          )
          const pieces = it.piece === 'label' ? ['label'] : [...new Set(held.map(([id]) => id))]
          const stated = it.ink?.length ? it.ink : held.map(([, k]) => inkBox(k))
          const inside = (b: Box) =>
            b[0] < sx1 &&
            b[2] > sx0 &&
            Math.min(b[1], b[3]) < Math.max(sy0, sy1) &&
            Math.max(b[1], b[3]) > Math.min(sy0, sy1)
          const own = stated.filter(inside)
          const boxes = (own.length ? own : [[sx0, sy0, sx1, sy1] as Box]).flatMap((b): Box[] => {
            const c: Box = [
              Math.max(b[0], sx0),
              Math.max(Math.min(b[1], b[3]), Math.min(sy0, sy1)),
              Math.min(b[2], sx1),
              Math.min(Math.max(b[1], b[3]), Math.max(sy0, sy1)),
            ]
            return c[2] > c[0] && c[3] > c[1] ? [c] : []
          })
          for (const b of boxes)
            out.push({
              ord: it.of ?? m.ord,
              pieces,
              r: page([
                it.x + (b[0] - sx0) * it.k,
                y + (Math.min(b[1], b[3]) - base) * it.k,
                it.x + (b[2] - sx0) * it.k,
                y + (Math.max(b[1], b[3]) - base) * it.k,
              ]),
            })
          continue
        }
        if (!it.s.trim()) continue
        const rise = it.rise ?? 0
        const chars = [...it.s]
        const whole = inkOf(it.face, it.size, it.s)
        // (each character's place along the run: its `dx`, else the run's advance up to it, the tracking after each before it)
        const placeOf = (i: number): number | null => {
          if (it.dx?.length) return it.x + it.dx[i]!
          const a = i ? advanceOf(it.face, it.size, chars.slice(0, i).join('')) : 0
          return a === null ? null : it.x + a + (it.track ?? 0) * i
        }
        const lastAt = placeOf(chars.length - 1)
        const end = it.dx?.length ? inkOf(it.face, it.size, chars.at(-1)!) : whole
        if (!whole || !end || lastAt === null) {
          unmeasured++
          continue
        }
        const slant = it.skew && it.slant ? Math.tan((it.slant * Math.PI) / 180) : 0
        const [a, d] = whole
        const right =
          (it.dx?.length ? lastAt : it.x) +
          end[2] +
          (it.dx?.length ? 0 : (it.track ?? 0) * Math.max(0, chars.length - 1))
        const left = it.x + Math.min(0, leftOf(it.face, it.size, it.s))
        // (a rectangle along the run: on the page, or in its own frame from its line's origin where it is set along a direction)
        const dir = 'dir' in it && it.dir ? it.dir : null
        if (dir) turned++
        const rect = (s0: number, s1: number, t0: number, t1: number): Rect =>
          dir ? { o: [x0, y], u: dir, s: [s0 - x0, s1 - x0], t: [t0, t1] } : page([s0, y + t0, s1, y + t1])
        const glyphs: Glyphs = () =>
          chars.flatMap((c, i) => {
            if (!c.trim()) return []
            const at = placeOf(i),
              k = inkOf(it.face, it.size, c)
            if (at === null || !k) return [rect(left, right + Math.max(0, a + rise) * slant, rise - d, rise + a)]
            const l = at + leftOf(it.face, it.size, c) - Math.max(0, k[1] - rise) * slant
            return [
              rect(Math.min(l, at + k[2]), at + k[2] + Math.max(0, k[0] + rise) * slant, rise - k[1], rise + k[0]),
            ]
          })
        out.push({
          ord: m.ord,
          r: rect(
            left - Math.max(0, d - rise) * slant,
            Math.max(left, right) + Math.max(0, a + rise) * slant,
            rise - d,
            rise + a,
          ),
          glyphs,
        })
      }
    }
  }
  return { inks: out, turned, unmeasured }
}

/**
 * The ink that stays on page `page.page` as the part states it, by its member: each member's text lines there unless the Page
 * turns its text group off (a line held KEPT always), its elements' ink unless their group is off (an element stated `keep`
 * always: in no group), its label's unless its label group is off, and the ink no member owns beside its text lines (Room.stays)
 */
export function keptInk(part: Part, page_: Page): Kept[] {
  const pg = page_.page
  const off = new Map(page_.members.map((m) => [m.ord, m.off]))
  const out: Kept[] = []
  for (const m of part.flows.flat() as Placed[]) {
    const o = off.get(m.ord) ?? 0
    m.lines.forEach((l) => {
      if (l[0] !== pg) return
      if (o & 1 && !(l[9] & LINE_FLAG.KEPT)) return
      out.push({ ord: m.ord, kind: 'text', r: lineRect(m, l) })
    })
    for (const [id, e] of m.els ?? [])
      if (e.keep || !(o & 2))
        for (const k of e.ink) if (k[0] === pg) out.push({ ord: m.ord, kind: 'element', piece: id, r: page(inkBox(k)) })
    if (m.label && m.label.ink[0] === pg && !(o & 4))
      out.push({ ord: m.ord, kind: 'label', piece: 'label', r: page(inkBox(m.label.ink)) })
    for (const [j, x0, y0, x1, y1] of m.room.stays ?? [])
      if (m.lines[j]?.[0] === pg) out.push({ ord: m.ord, kind: 'stays', r: page([x0, y0, x1, y1]) })
  }
  return out
}

/**
 * I3 by ink over one laid page: each laid member's drawn ink against every other laid member's and against the ink that stays
 * (keptInk), its own kept ink too (a translation laid over its own kept element or label is drawn over it all the same); a crop
 * is never held against the ink it is cut from (its own element's or label's, which it is). A run whose rectangle meets other ink
 * is read glyph by glyph (and the other's too where it is a run). Each overlap once a page by the laid member, the member whose
 * ink it meets, what that ink is and which element or label, with the first two inks that meet
 */
export function inkOverlaps(
  page_: Page,
  part: Part,
  metrics: Metrics,
  served?: (Metrics & InkLeft) | null,
): { overlaps: InkOverlap[]; turned: number; unmeasured: number } {
  const drawn = drawnInk(page_, metrics, served, part)
  const kept = keptInk(part, page_)
  // (each member's original lines on the page, as keptInk reads a line: what its own setting met)
  const origOf = new Map<number, Rect[]>()
  for (const m of part.flows.flat() as Placed[])
    origOf.set(
      m.ord,
      m.lines.filter((l) => l[0] === page_.page).map((l) => lineRect(m, l)),
    )
  const metAlready = (ord: number, r: Rect) => (origOf.get(ord) ?? []).some((o) => meets(o, r))
  // (the inks of a drawn run that meet another ink, glyph by glyph: the first pair, or none)
  const glyphCache = new Map<Drawn, Rect[]>()
  const glyphsOf = (x: Drawn) => {
    if (!x.glyphs) return [x.r]
    if (!glyphCache.has(x)) glyphCache.set(x, x.glyphs())
    return glyphCache.get(x)!
  }
  const firstMeet = (as: readonly Rect[], bs: readonly Rect[]): [Rect, Rect] | null => {
    for (const p of as) for (const q of bs) if (meets(p, q)) return [p, q]
    return null
  }
  const seen = new Map<string, InkOverlap>()
  // (one a page by the laid member, the member it meets, what that ink is and which piece, an element by its id: two elements of
  // one member are two entries, neither standing for the other; one its own original did not meet before any that it did)
  const add = (x: InkOverlap) => {
    const k = `${x.ord}|${x.with}|${x.kind}|${x.piece ?? ''}`
    const had = seen.get(k)
    if (!had || (had.own && !x.own)) seen.set(k, x)
  }
  const D = drawn.inks
  for (let i = 0; i < D.length; i++) {
    const a = D[i]!
    for (let j = i + 1; j < D.length; j++) {
      const b = D[j]!
      if (b.ord === a.ord || !meets(a.r, b.r)) continue
      const hit = firstMeet(glyphsOf(a), glyphsOf(b))
      if (!hit) continue
      const [p, q, hp, hq] = a.ord < b.ord ? [a, b, hit[0], hit[1]] : [b, a, hit[1], hit[0]]
      const own = (origOf.get(q.ord) ?? []).some((o) => metAlready(p.ord, o))
      add({
        ord: p.ord,
        with: q.ord,
        kind: 'drawn',
        a: boxOfRect(hp),
        b: boxOfRect(hq),
        ...(own ? { own: true as const } : {}),
      })
    }
    for (const k of kept) {
      // (a crop drawn where the ink it is cut from stands, its own element's or label's, is that ink; drawn elsewhere while that
      // ink stays, the two are drawn both)
      if (
        k.ord === a.ord &&
        k.piece !== undefined &&
        a.pieces?.includes(k.piece) &&
        boxOfRect(a.r).every((v, q) => Math.abs(v - boxOfRect(k.r)[q]!) <= 0.01)
      )
        continue
      if (!meets(a.r, k.r)) continue
      const hit = firstMeet(glyphsOf(a), [k.r])
      if (!hit) continue
      const own = (k.ord !== a.ord || k.kind === 'stays') && metAlready(a.ord, k.r)
      add({
        ord: a.ord,
        with: k.ord,
        kind: k.kind,
        a: boxOfRect(hit[0]),
        b: boxOfRect(k.r),
        ...(k.piece ? { piece: k.piece } : {}),
        ...(own ? { own: true as const } : {}),
      })
    }
  }
  return { overlaps: [...seen.values()], turned: drawn.turned, unmeasured: drawn.unmeasured }
}
