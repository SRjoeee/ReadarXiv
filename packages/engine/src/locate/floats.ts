// Each float's box on A (link previews, docs/PDF-READER.md §20.1), read from the brackets the marked compile already makes:
// `fs<n>` and `fe<n>` round the float's box inside LaTeX's \@endfloatbox (marks/marks.ts POINTS), points on B, each naming the
// glyphs and boxes B's page showed before it. The float's ink is B's glyphs, turned glyphs and painted boxes between its two
// points; its box on A is the union of their partners there (align.ts Mapping), its drawing with its caption. Never a guess:
// a float gets a box only where every piece of its ink is told on A and the box holds nothing of anyone else's, else none, and
// a link to it keeps its jump alone. Phase 17 of locate, read-only: it reads B's points, the mapping, the members and the
// ownership (the frozen face).
import { HUNK } from '../align/align.ts'
import { type DocGlyph, type DocTurned, isImage, isPath } from '../doc.ts'
import { bracketsOf } from './gaps.ts'
import { isInk } from './lines.ts'
import type { Owned } from './ownership.ts'
import { paints } from './turned-frames.ts'
import type { Member, Work } from './work.ts'

/** why a float has no box: its caption in no bracket (`unbracketed`: longtable's, which defines no \@captype, a \captionof
 *  outside a float), its bracket not closed on its page (`unclosed`), some of its ink on B with no partner on A (`unpaired`),
 *  its ink on two A pages (`pages`), no ink at all (`empty`), its caption not wholly inside its bracket (`caption`), ink on A of
 *  a member of the float outside the box (`outside`), another's glyph inside the box (`foreign`), A ink none of the float's
 *  crossing the box's edge (`cut`) */
export type FloatCause =
  | 'unbracketed'
  | 'unclosed'
  | 'unpaired'
  | 'pages'
  | 'empty'
  | 'caption'
  | 'outside'
  | 'foreign'
  | 'cut'
export type Box4 = [number, number, number, number]
export interface FloatBox {
  /** its bracket's serial (`fs<n>`), -1 for a caption of no bracket */
  serial: number
  /** its page on A (1-based); for a float with no partner there, 0 */
  page: number
  /** its caption's member ord (the outermost bracket's caption where floats nest; of several, the first not a part of
   *  another: subcaption's `sub<type>` caption is its float's part), null where it has none */
  caption: number | null
  /** every caption member inside its bracket, by ord */
  captions: number[]
  /** LaTeX's \@captype as its caption's unit states it (InstrumentUnit.float), null where it has no caption */
  type: string | null
  /** the union of the A partners of every glyph, turned glyph and box between its two points; null with a cause */
  box: Box4 | null
  cause: FloatCause | null
  /** the members that own its ink on A, by ord: what is its own beside its partners */
  members: number[]
  /** the measure's counts: A glyphs none of the float's inside `box`; A ink none of the float's crossing its edge; A ink of its
   *  members outside it; B ink with no partner */
  foreign: number
  cut: number
  outside: number
  unpaired: number
}

/** a float bracket's point (marks/marks.ts POINTS `fs<n>`, `fe<n>`; `fn<n>` beside a float of a type with no counter) */
const COUNTERLESS = /^fn(\d+)$/

/** a level glyph on its page: across, its advance and its outline where it has one (a form's glyph: its advance alone; its
 *  outline may be a .notdef's box PDF.js never draws, lines.ts isInk), the bundle stating a line's and an element's ink by the
 *  advance and a glyph's ink may reach past it; up and down, its own ink */
export function glyphRect(g: DocGlyph): Box4 {
  const across = !g.form && g.ix1 > g.ix0
  return [across ? Math.min(g.x0, g.ix0) : g.x0, g.bottom, across ? Math.max(g.x1, g.ix1) : g.x1, g.top]
}
/** a turned glyph's ink on its page: its run from its origin to its advance's end, across its band (turned-frames.ts's reading) */
export function turnedRect(t: DocTurned): Box4 {
  const lo = Math.min(t.descent, t.down ?? t.descent) * t.size
  const hi = Math.max(t.ascent, t.up ?? t.ascent) * t.size
  const xs: number[] = []
  const ys: number[] = []
  for (const [x, y] of [
    [t.ox, t.oy],
    [t.ex, t.ey],
  ] as const)
    for (const h of [lo, hi]) {
      xs.push(x - t.uy * h)
      ys.push(y + t.ux * h)
    }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}
const meets = (r: Box4, u: Box4) => r[0] < u[2] && r[2] > u[0] && r[1] < u[3] && r[3] > u[1]
const within = (r: Box4, u: Box4) => r[0] >= u[0] && r[2] <= u[2] && r[1] >= u[1] && r[3] <= u[3]
const grow = (u: Box4 | null, r: Box4): Box4 =>
  u ? [Math.min(u[0], r[0]), Math.min(u[1], r[1]), Math.max(u[2], r[2]), Math.max(u[3], r[3])] : [...r]
/** an A page's painted box as ink: a path, an image, a shading, a merged box; an annotation's appearance and a turned glyph's
 *  own box (read as its glyph) are not */
const isInkBox = (kind: number) => kind !== -1 && kind !== -4

/** each float's box on A, and each caption of no bracket, in the order of their serials (unbracketed captions last, by ord) */
export function floatBoxes(w: Work, owned: Owned): FloatBox[] {
  const { ins, inkA, m, B, pageA } = w.ix
  const { members, units } = w
  const { brackets } = bracketsOf(B, new Set(ins.tex.whole ?? []))
  // (each bracket on its B page, with its glyph and box ranges; the outermost of nested ones stands for them)
  type Br = { serial: number; page: number; s: number; e: number; g0: number; g1: number; x0: number; x1: number }
  const list: Br[] = []
  const unclosed: number[] = []
  for (const [serial, b] of brackets) {
    const pts = B.pages[b.page]!.points
    if (pts.some((x) => COUNTERLESS.exec(x.name)?.[1] === String(serial))) continue
    if (b.e < 0) {
      unclosed.push(serial)
      continue
    }
    const s = pts[b.s]!
    const e = pts[b.e]!
    list.push({ serial, page: b.page, s: b.s, e: b.e, g0: s.glyph, g1: e.glyph, x0: s.box, x1: e.box })
  }
  const outer = list.filter((b) => !list.some((o) => o !== b && o.page === b.page && o.s < b.s && o.e > b.e))
  outer.sort((a, b) => a.serial - b.serial)
  // (captions: members of a unit of kind `caption`, each in the outermost bracket that holds its first glyph on B)
  const captionsOf = new Map<number, number[]>()
  const crossing = new Set<number>()
  const loose: Member[] = []
  for (const mem of members) {
    if (mem.unit < 0 || units[mem.unit]?.kind !== 'caption') continue
    const bracketOf = (b: number) => {
      if (b < 0) return null
      const p = (w.ix.pageB[b] as number) - 1
      const j = b - (m.offB[p] as number)
      return outer.find((x) => x.page === p && j >= x.g0 && j < x.g1) ?? null
    }
    const first = bracketOf(mem.bFirst)
    if (!first) {
      loose.push(mem)
      continue
    }
    ;(captionsOf.get(first.serial) ?? captionsOf.set(first.serial, []).get(first.serial)!).push(mem.ord)
    if (bracketOf(mem.bLast) !== first) crossing.add(first.serial)
  }
  // (who owns each A box and each A turned glyph, by page: a member's text, element and label boxes)
  const boxOwner = new Map<string, number>()
  const turnedOwner = new Map<string, number>()
  for (const mem of members) {
    for (const [p, x] of [...mem.textBoxes, ...(mem.labelBoxes ?? []), ...[...mem.elBoxes.values()].flat()])
      boxOwner.set(`${p}|${x}`, mem.ord)
    for (const [p, j] of mem.turned) turnedOwner.set(`${p}|${j}`, mem.ord)
  }
  const typeOf = (ord: number | null) => (ord === null ? null : (units[members[ord]!.unit]?.float ?? null))
  const out: FloatBox[] = []
  for (const br of outer) out.push(boxOf(br))
  for (const serial of unclosed.sort((a, b) => a - b)) out.push(empty(serial, 0, null, [], 'unclosed'))
  for (const mem of loose) out.push(empty(-1, mem.lines[0]?.[0] ?? 0, mem.ord, [mem.ord], 'unbracketed'))
  return out

  function empty(
    serial: number,
    page: number,
    caption: number | null,
    captions: number[],
    cause: FloatCause,
  ): FloatBox {
    return {
      serial,
      page,
      caption,
      captions,
      type: typeOf(caption),
      box: null,
      cause,
      members: [],
      foreign: 0,
      cut: 0,
      outside: 0,
      unpaired: 0,
    }
  }

  function boxOf(br: Br): FloatBox {
    const pb = B.pages[br.page]!
    const o0 = m.offB[br.page] as number
    const captions = captionsOf.get(br.serial) ?? []
    // (the float's caption: the first of its captions that is no part of another of them, as subcaption makes a part's type,
    // \@captype sub\@captype, of its float's)
    const types = new Set(captions.map((o) => typeOf(o)))
    const isPart = (o: number) => {
      const t = typeOf(o)
      return !!t && t.startsWith('sub') && types.has(t.slice(3))
    }
    const caption = captions.find((o) => !isPart(o)) ?? null
    let unpaired = 0
    const ownGlyphs = new Set<number>()
    const ownBoxes = new Set<string>()
    const ownTurned = new Set<string>()
    const pages = new Map<number, number>()
    const seen = (p: number) => pages.set(p, (pages.get(p) ?? 0) + 1)
    // (its glyphs: each paired, or ink A does not draw: off its page, in a draft frame, no ink, a line-end hyphen A broke
    // elsewhere, or a glyph whose neighbours' partners stand side by side on A, nothing of A's between them; place.ts's rule)
    let pv = -1
    for (let j = br.g0; j < br.g1; j++) {
      const b = o0 + j
      const a = m.bToA[b] as number
      if (a >= 0) {
        ownGlyphs.add(a)
        seen(pageA[a] as number)
        pv = a
        continue
      }
      if (m.offpageB[b] || m.skipB[b] || m.hunkB[b] === HUNK.hyphen || !isInk(pb.glyphs[j]!)) continue
      let nx = -1
      for (let k = j + 1; k < br.g1 && nx < 0; k++) nx = m.bToA[o0 + k] as number
      if (pv >= 0 && nx === pv + 1) continue
      unpaired++
    }
    // (its painted boxes: a path or an image by its partner; a shading or a merged box has none; an annotation's appearance and
    // a turned glyph's box are no ink of their own here)
    for (let x = br.x0; x < br.x1; x++) {
      const kind = pb.kinds[x] as number
      if (!isInkBox(kind)) continue
      const ap = (isPath(kind) || isImage(kind) ? m.boxPage[br.page]?.[x] : 0) ?? 0
      if (!ap) {
        unpaired++
        continue
      }
      ownBoxes.add(`${ap}|${m.boxIndex[br.page]![x]}`)
      seen(ap)
    }
    // (its turned glyphs, by their own box between its two points)
    ;(pb.turned ?? []).forEach((t, k) => {
      if (t.box < br.x0 || t.box >= br.x1 || !paints(t)) return
      const ap = m.turnedPage[br.page]?.[k] ?? 0
      if (!ap) {
        unpaired++
        return
      }
      ownTurned.add(`${ap}|${m.turnedIndex[br.page]![k]}`)
      seen(ap)
    })
    const page = [...pages].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0
    const base = empty(br.serial, page, caption, captions, 'empty')
    base.unpaired = unpaired
    if (!page) return { ...base, cause: unpaired ? 'unpaired' : 'empty' }
    const pa = inkA.pages[page - 1]!
    const a0 = m.offA[page - 1] as number
    // (the union of its partners on its page)
    let u: Box4 | null = null
    for (const a of ownGlyphs)
      if (pageA[a] === page && isInk(pa.glyphs[a - a0]!)) u = grow(u, glyphRect(pa.glyphs[a - a0]!))
    for (const k of ownBoxes) {
      const [p, x] = k.split('|').map(Number) as [number, number]
      if (p === page) u = grow(u, pa.boxes.slice(4 * x, 4 * x + 4) as Box4)
    }
    for (const k of ownTurned) {
      const [p, j] = k.split('|').map(Number) as [number, number]
      if (p === page) u = grow(u, turnedRect(pa.turned![j]!))
    }
    if (!u) return { ...base, cause: unpaired ? 'unpaired' : 'empty' }
    // (on the format's grid, outward: every piece of its ink inside the box as stated)
    u = [
      Math.floor(u[0] * 100) / 100,
      Math.floor(u[1] * 100) / 100,
      Math.ceil(u[2] * 100) / 100,
      Math.ceil(u[3] * 100) / 100,
    ]
    // (its members: those that own any of its ink on A; their every glyph, box and turned glyph is its own too)
    const own = new Set<number>()
    for (const a of ownGlyphs) if (owned.member(a) >= 0) own.add(owned.member(a))
    for (const k of ownBoxes) if (boxOwner.has(k)) own.add(boxOwner.get(k)!)
    for (const k of ownTurned) if (turnedOwner.has(k)) own.add(turnedOwner.get(k)!)
    let outside = 0
    const mine = new Set(ownGlyphs)
    const mineBoxes = new Set(ownBoxes)
    const mineTurned = new Set(ownTurned)
    for (const ord of own) {
      const mem = members[ord]!
      for (const a of [...mem.text, ...mem.label, ...[...mem.els.values()].flat()]) {
        mine.add(a)
        if (pageA[a] !== page) outside++
        else if (isInk(pa.glyphs[a - a0]!) && !within(glyphRect(pa.glyphs[a - a0]!), u)) outside++
      }
      for (const [p, x] of [...mem.textBoxes, ...(mem.labelBoxes ?? []), ...[...mem.elBoxes.values()].flat()]) {
        mineBoxes.add(`${p}|${x}`)
        if (p !== page) outside++
        else if (!within(pa.boxes.slice(4 * x, 4 * x + 4) as Box4, u)) outside++
      }
      for (const [p, j] of mem.turned) {
        mineTurned.add(`${p}|${j}`)
        if (p !== page) outside++
        else if (paints(pa.turned![j]!) && !within(turnedRect(pa.turned![j]!), u)) outside++
      }
    }
    // (another's glyph inside: any glyph of the page that is none of the float's, its ink meeting the box)
    let foreign = 0
    pa.glyphs.forEach((g, j) => {
      if (!mine.has(a0 + j) && isInk(g) && meets(glyphRect(g), u!)) foreign++
    })
    ;(pa.turned ?? []).forEach((t, j) => {
      if (!mineTurned.has(`${page}|${j}`) && paints(t) && meets(turnedRect(t), u!)) foreign++
    })
    // (ink none of the float's crossing its edge: a box that meets it, neither wholly inside it nor wholly round it)
    let cut = 0
    for (let x = 0; x < pa.kinds.length; x++) {
      if (!isInkBox(pa.kinds[x] as number) || mineBoxes.has(`${page}|${x}`)) continue
      const r = pa.boxes.slice(4 * x, 4 * x + 4) as Box4
      if (meets(r, u) && !within(r, u) && !within(u, r)) cut++
    }
    const cause: FloatCause | null =
      unpaired > 0
        ? 'unpaired'
        : pages.size > 1
          ? 'pages'
          : crossing.has(br.serial)
            ? 'caption'
            : outside > 0
              ? 'outside'
              : foreign > 0
                ? 'foreign'
                : cut > 0
                  ? 'cut'
                  : null
    return {
      ...base,
      cause,
      box: cause ? null : u,
      members: [...own].sort((a, b) => a - b),
      foreign,
      cut,
      outside,
    }
  }
}
