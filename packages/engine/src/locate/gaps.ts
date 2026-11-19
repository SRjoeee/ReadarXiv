// The separation TeX set under each member's last line, by its class (Room.gap), and a heading's paragraph separation
// (Room.sep): read from what the marked compile states (Instrument.tex: each heading's \@startsection skips, the paper's float,
// caption and footnote separations, each paragraph's \parskip; marks/channels.ts) and from what stands under the member on A
// (the next member's line under its last one, and the float each is of by B's brackets). Phase 10 (rooms), read-only: it reads
// the members' lines, measures and columns (phases 6, 8) and B's points. The compile move's B1 (the display design's F12, 2c's
// F-last and F-sep, 2d's rule 2 facts, F40's form 1).
import type { Line, Room } from '@readarxiv/format'
import type { GlueName, Instrument } from '../instrument.ts'
import { r2 } from './lines.ts'
import type { Member, Work } from './work.ts'

/** a member's separation by class (Room.gap) */
export type Gap = NonNullable<Room['gap']>
/** a float's bracket on B (LAYOUT_TEX's POINTS: `fs<n>` before its box's first glyph, `fe<n>` after its last), and a column
 *  body's (`bs<n>` before the column's main list as TeX's page builder broke it, `be<n>` after it: POINTS' \@makecol hook, run
 *  before \@makecol sets the column's top floats over that list and its bottom ones under it): one serial for all, the order TeX
 *  made them in */
const FLOAT_BRACKET = /^f([se])(\d+)$/
const BODY_BRACKET = /^b([se])(\d+)$/
/** two heights told apart (PDF units): a line's are stated to a hundredth (lines.ts r2) */
const APART = 0.01
/** the first ink under a height on a page across x0..x1: the highest top under it (geometry.ts inkIndex `under`) */
type InkUnder = (page: number, foot: number, x0: number, x1: number) => number
/** where TeX placed a float, by B's brackets: in a column's body (`here`: a float the page builder met in the main list,
 *  \@addtocurcol's, \intextsep over and under it), or outside every body of its page (`out`: \@makecol's top or bottom list,
 *  \textfloatsep between it and the body) */
type Placed = 'here' | 'out'

/** each B page's floats, glyph by glyph (the innermost float bracket open before it, its serial; -1 none); whether each glyph
 *  stands in a column's body (inside a `bs<n>`..`be<n>` bracket POINTS' \@makecol hook made); the serial of the last body TeX
 *  shipped on it (its last `bs<n>`; 0 none); and each float's place, by its opening bracket among the bodies' in B's stream, on a
 *  page that states a column's body. A page bracketed whole (`whole`, Instrument.tex.whole: no \@makecol ran for it, a class's own
 *  output routine or a page of floats) states no place for its floats and no glyph of it stands in a column's body: where TeX
 *  placed a float there no bracket says (PDF-READER §18.76: no gap class there, no geometric guess); a page
 *  of no body bracket, a compile made before the brackets, states none either */
export function bracketsOf(
  B: { pages: readonly { glyphs: { length: number }; points: readonly { name: string; glyph: number }[] }[] },
  whole: ReadonlySet<number> = new Set(),
): {
  floatAt: Int32Array[]
  inBody: Uint8Array[]
  body: number[]
  placed: Map<number, Placed>
  /** each float's brackets on its B page (0-based): its opening and closing point, their index in the page's points */
  brackets: Map<number, { page: number; s: number; e: number }>
  /** each page's column bodies (not whole), their opening and closing points' indices, by serial */
  bodies: { serial: number; s: number; e: number }[][]
} {
  const floatAt: Int32Array[] = []
  const inBody: Uint8Array[] = []
  const body: number[] = []
  const placed = new Map<number, Placed>()
  const brackets = new Map<number, { page: number; s: number; e: number }>()
  const bodyList: { serial: number; s: number; e: number }[][] = []
  B.pages.forEach((pg, pi) => {
    const list: { serial: number; s: number; e: number }[] = []
    if (!whole.size || !pg.points.some((x) => /^bs(\d+)$/.test(x.name) && whole.has(Number(x.name.slice(2)))))
      pg.points.forEach((x, q) => {
        const b = BODY_BRACKET.exec(x.name)
        if (!b) return
        if (b[1] === 's') list.push({ serial: Number(b[2]), s: q, e: -1 })
        else {
          const o = list.find((y) => y.serial === Number(b[2]) && y.e < 0)
          if (o) o.e = q
        }
      })
    bodyList.push(list.filter((y) => y.e >= 0))
    pg.points.forEach((x, q) => {
      const f = FLOAT_BRACKET.exec(x.name)
      if (!f) return
      const n = Number(f[2])
      const o = brackets.get(n)
      if (f[1] === 's' && !o) brackets.set(n, { page: pi, s: q, e: -1 })
      else if (f[1] === 'e' && o && o.page === pi && o.e < 0) o.e = q
    })
  })
  for (const pg of B.pages) {
    const at = new Int32Array(pg.glyphs.length).fill(-1)
    const bodied = new Uint8Array(pg.glyphs.length)
    const open: number[] = []
    const bodies = new Set<number>()
    let q = 0
    let last = 0
    const points = pg.points
    const states = points.some((x) => BODY_BRACKET.test(x.name))
    const wholePage = points.some((x) => {
      const b = BODY_BRACKET.exec(x.name)
      return !!b && b[1] === 's' && whole.has(Number(b[2]))
    })
    for (let g = 0; g <= pg.glyphs.length; g++) {
      for (; q < points.length && points[q]!.glyph <= g; q++) {
        const name = points[q]!.name
        const b = BODY_BRACKET.exec(name)
        if (b) {
          if (b[1] === 's') {
            last = Math.max(last, Number(b[2]))
            bodies.add(Number(b[2]))
          } else bodies.delete(Number(b[2]))
        }
        const f = FLOAT_BRACKET.exec(name)
        if (!f) continue
        if (f[1] === 's') {
          open.push(Number(f[2]))
          if (states && !wholePage && !placed.has(Number(f[2]))) placed.set(Number(f[2]), bodies.size ? 'here' : 'out')
        } else {
          const i = open.lastIndexOf(Number(f[2]))
          if (i >= 0) open.splice(i, 1)
        }
      }
      if (g < pg.glyphs.length && open.length) at[g] = open[open.length - 1]!
      if (g < pg.glyphs.length && bodies.size && !wholePage) bodied[g] = 1
    }
    floatAt.push(at)
    inBody.push(bodied)
    body.push(last)
  }
  return { floatAt, inBody, body, placed, brackets, bodies: bodyList }
}

/** the paper's separations in force at a serial (Instrument.tex.glues): each name's last value written at or before it */
function inForce(glues: NonNullable<Instrument['tex']['glues']>, serial: number): Map<GlueName, [number, number]> {
  const out = new Map<GlueName, [number, number]>()
  for (const g of glues) if (g.at <= serial) out.set(g.name, [g.natural, g.shrink])
  return out
}

/**
 * Each member's separation under its last line by TeX's class of it (Room.gap), and the paragraph separation of a heading
 * TeX set on lines of its own (Room.sep, its \@startsection after-skip and the \baselineskip and \parskip around it). The class:
 * - a heading the compile states the skips of: under a title on lines of its own (an after-skip over zero, TeX's \@sect test)
 *   `afterskip`, and its sep; after a title set in the line `runin`, the skip TeX sets after it, the after-skip negated;
 * - a float's last ink (a member no glyph or painted box of B follows before its float's closing bracket), by where TeX placed
 *   the float and what it set after it, as B's brackets state them (POINTS' \@makecol hook brackets a column's main list,
 *   `bs<n>` .. `be<n>`, before \@makecol sets its top list over it and its bottom list under it; AXT-BODY's side, its column): a
 *   float set in the body (its bracket inside the body's) `intextsep` where the body goes on under it, over the next float set
 *   there (their brackets adjacent) the two \intextsep TeX set between them whole, natural sizes and shrinks added (2608.04322v1
 *   p9's [H] Figures 7 and 8); on a column's top list, over the next float of that list (their brackets adjacent, no ink
 *   between: the next float's own ink stands under the member on A) `floatsep`, the last over the body `textfloatsep`; over both
 *   columns (its lines across the gutter, the page's frame) `dblfloatsep` over the next such float, `dbltextfloatsep` over the
 *   columns; in a column of floats beside another column's body (the column of no body bracket on a two-column page) `fpsep`
 *   between two; under the last of a bottom list or of a column of floats nothing (its column's foot); the float's values
 *   (Instrument.tex.glues at its serial);
 * - body text over a float's first member: `intextsep` where TeX set the float in the body, `textfloatsep` over the first of a
 *   bottom list. Body text is what TeX set in a column's body (between its `bs<n>` and `be<n>`): a title block \twocolumn[…] sets
 *   over both columns stands in none, and states no float's separation (2611.03953v2 p1: ICML's title and authors over a top
 *   float, which TeX set \textfloatsep under);
 * - on a page whose output routine was a class's own, or a page of floats (its body bracket the whole page's, Instrument.tex.whole,
 *   floats inside), or one stating no body, where TeX placed a float no bracket says: none of these (PDF-READER §18.76: no
 *   geometric guess);
 * - inside a float, over its caption `abovecaptionskip`, the caption over what follows `belowcaptionskip`;
 * - over a heading the compile states the skips of `beforeskip`, its before-skip as TeX adds it (a negative one negated whole);
 * - body text over a footnote `footins` (the rule between is TeX's own), a footnote over a footnote `footnotesep` (a strut: no
 *   shrink), the values in force when TeX shipped the page;
 * - a paragraph over a paragraph, each stating its skips (AXT-LINES), the next one's \parskip and its shrink `parskip`.
 * A heading the compile states no skips of states nothing (what TeX set under it is its class's own after-skip), and over
 * a heading of no statement nothing is stated either.
 * None where nothing of the paper's own text stands under it (the next member is a figure text, a name, a unit made on A),
 * where ink no unit owns stands between (but over the footnotes and over a float), or where the class's glue is not stated.
 * The next member: the one whose line on the page is the highest under the member's last line across its last line's
 * extent and measure. A figure text and a name keep their own room (no gap)
 */
export function gapsOf(w: Work, under: InkUnder): Map<Member, { gap?: Gap; sep?: number }> {
  const { ins, m, pageB } = w.ix
  const { members, units } = w
  const out = new Map<Member, { gap?: Gap; sep?: number }>()
  const heads = new Map((ins.tex.heads ?? []).map((h) => [h.unit, h]))
  const skips = new Map((ins.tex.skips ?? []).map((k) => [k.unit, k]))
  const glues = ins.tex.glues ?? []
  const { floatAt, inBody, body, placed, brackets, bodies } = bracketsOf(ins.ink, new Set(ins.tex.whole ?? []))
  const sides = new Map(ins.tex.bodySides ?? [])
  const own = (mem: Member) => mem.unit >= 0 && mem.unit < ins.units.length && mem.name === undefined
  // (a member's float by its first glyph on B, its serial; null none; whether that glyph stands in a column's body, as TeX's
  // brackets state it; and the serial of the last body shipped on its B page)
  const floatOf = new Map<Member, number | null>()
  const bodied = new Set<Member>()
  const bodyOf = new Map<Member, number>()
  for (const mem of members) {
    if (!own(mem) || mem.bFirst < 0) {
      floatOf.set(mem, null)
      continue
    }
    const p = (pageB[mem.bFirst] as number) - 1
    const j = mem.bFirst - (m.offB[p] as number)
    const f = floatAt[p]?.[j] ?? -1
    floatOf.set(mem, f >= 0 ? f : null)
    if (f < 0 && inBody[p]?.[j] === 1) bodied.add(mem)
    bodyOf.set(mem, body[p] ?? 0)
  }
  // (each A page's lines of the members that are the paper's own text, by page: what stands under another)
  const text = (mem: Member) => own(mem) && mem.located && !mem.figure && mem.kind !== 'inkfigures'
  const onPage = new Map<number, { mem: Member; l: Line }[]>()
  for (const mem of members)
    if (text(mem)) for (const l of mem.lines) (onPage.get(l[0]) ?? onPage.set(l[0], []).get(l[0])!).push({ mem, l })
  const across = (l: Line, x0: number, x1: number) => Math.max(l[3], l[8]) > x0 && Math.min(l[2], l[7]) < x1
  // (a float's lines on a page, every member's of it)
  const floatLines = (f: number, page: number) =>
    (onPage.get(page) ?? []).filter((e) => floatOf.get(e.mem) === f).map((e) => e.l)
  const spans = (f: number, page: number) => floatLines(f, page).some((l) => l[1] === 2)
  // (whether B's page holds ink between two of its points (by their index): a glyph not blank, a painted box but an annotation)
  const inkBetween = (p: number, q0: number, q1: number) => {
    const pg = ins.ink.pages[p]!
    const [a, z] = [pg.points[q0]!, pg.points[q1]!]
    for (let j = a.glyph; j < z.glyph; j++) if (!pg.glyphs[j]!.blank && /\S/.test(pg.glyphs[j]!.u)) return true
    for (let k = a.box; k < z.box; k++) if (pg.kinds[k] !== -1) return true
    return false
  }
  // (where TeX placed each float, by B's brackets: `here` in its column's body; else on the list of its column (its members'
  // lines' column on A, the page's frame: a float across both columns `wide`, over the columns) the column's body bracket on its
  // page tells: before it the top list, after it the bottom list, a column of no body a page's column of floats (`fcol`). And the
  // float set right after it in that list, its brackets adjacent with no ink between (TeX's own \floatsep, \dblfloatsep or
  // \@fpsep stands there). None on a page bracketed whole or stating no body)
  type Place = { kind: 'wide' | 'here' | 'top' | 'bottom' | 'fcol'; next: number | null; first: boolean }
  /** a float's column on A by its members' lines (the page's frame): 1 the right where most of them stand there, else 0 */
  const colOf = (f: number, page: number) => {
    const ls = floatLines(f, page)
    return ls.filter((l) => l[1] === 1).length > ls.length / 2 ? 1 : 0
  }
  const places = new Map<number, Place | null>()
  const placeOf = (f: number, page: number): Place | null => {
    if (places.has(f)) return places.get(f)!
    const br = brackets.get(f)
    const kind = (x: number): Place['kind'] | null => {
      if (placed.get(x) === undefined) return null
      if (placed.get(x) === 'here') return 'here'
      if (spans(x, page)) return 'wide'
      const b = brackets.get(x)!
      const col = colOf(x, page)
      const pageBodies = bodies[b.page] ?? []
      const two = pageBodies.some((y) => sides.get(y.serial) === 1 || sides.get(y.serial) === 2)
      const own = pageBodies.find((y) => (two ? sides.get(y.serial) === col + 1 : true))
      if (!own) return two ? 'fcol' : null
      return b.s < own.s ? 'top' : b.s > own.e ? 'bottom' : null
    }
    const k = br && br.e >= 0 ? kind(f) : null
    if (!br || !k) {
      places.set(f, null)
      return null
    }
    // (the floats of its page in stream order, of the same list; the one after it and whether one stands before it)
    const same = [...brackets]
      .filter(
        ([x, b]) =>
          b.page === br.page && b.e >= 0 && kind(x) === k && (k === 'wide' || colOf(x, page) === colOf(f, page)),
      )
      .sort((x, y) => x[1].s - y[1].s)
    const i = same.findIndex(([x]) => x === f)
    const after = same[i + 1]
    const before = same[i - 1]
    const adjacent = (x: { s: number; e: number }, y: { s: number; e: number }) =>
      ins.ink.pages[br.page]!.points.slice(x.e + 1, y.s).every((pt) => !BODY_BRACKET.test(pt.name)) &&
      !inkBetween(br.page, x.e, y.s)
    const place: Place = {
      kind: k,
      next: after && adjacent(br, after[1]) ? after[0] : null,
      first: !(before && adjacent(before[1], br)),
    }
    places.set(f, place)
    return place
  }
  /** whether a member is its float's last ink: no glyph or painted box of B between its last glyph and the float's closing bracket */
  const lastOf = (mem: Member, f: number) => {
    const br = brackets.get(f)
    if (!br || br.e < 0 || mem.bLast < 0 || (pageB[mem.bLast] as number) - 1 !== br.page) return false
    const pg = ins.ink.pages[br.page]!
    const j = mem.bLast - (m.offB[br.page] as number)
    const e = pg.points[br.e]!
    for (let g = j + 1; g < e.glyph; g++) if (!pg.glyphs[g]!.blank && /\S/.test(pg.glyphs[g]!.u)) return false
    for (let k = pg.boxAt[j + 1] ?? pg.kinds.length; k < e.box; k++) if (pg.kinds[k] !== -1) return false
    return true
  }
  // (the separation TeX set under a float's last ink, by where it placed the float: over the next float of its list `floatsep`,
  // `dblfloatsep` between two over the columns, `fpsep` in a column of floats; a top float over its column's body `textfloatsep`,
  // one over the columns `dbltextfloatsep`; a float set in the body `intextsep`; under the last of a bottom list or of a column
  // of floats nothing, its column's foot)
  const underFloat = (f: number, page: number): GlueName | undefined => {
    const pl = placeOf(f, page)
    if (!pl) return undefined
    if (pl.kind === 'here') {
      // (where the body goes on under it: ink of the body's between the float's closing bracket and the body's own)
      const br = brackets.get(f)!
      const own = (bodies[br.page] ?? []).find((y) => y.s < br.s && br.e < y.e)
      return own && inkBetween(br.page, br.e, own.e) ? 'intextsep' : undefined
    }
    if (pl.kind === 'wide')
      return pl.next !== null && placeOf(pl.next, page)?.kind === 'wide' ? 'dblfloatsep' : 'dbltextfloatsep'
    if (pl.next !== null) return pl.kind === 'fcol' ? 'fpsep' : 'floatsep'
    return pl.kind === 'top' ? 'textfloatsep' : undefined
  }
  // (the separation TeX set over a float's first ink from the body text over it: a float set in the body `intextsep`; the first
  // of a bottom list `textfloatsep`)
  const overFloat = (f: number, page: number): GlueName | undefined => {
    const pl = placeOf(f, page)
    if (!pl) return undefined
    if (pl.kind === 'here') return 'intextsep'
    return pl.kind === 'bottom' && pl.first ? 'textfloatsep' : undefined
  }
  const glue = (vals: Map<GlueName, [number, number]>, name: GlueName): Gap | undefined => {
    const v = vals.get(name)
    return v ? [name, r2(v[0]), r2(v[1])] : undefined
  }
  const kindOf = (mem: Member) => units[mem.unit]?.kind
  for (const mem of members) {
    if (!mem.lines.length || !own(mem) || mem.figure || mem.kind === 'inkfigures') continue
    const last = mem.lines.at(-1)!
    const page = last[0]
    const x0 = Math.min(last[2], last[7])
    const x1 = Math.max(last[3], last[8])
    // (the next member's line under it: the highest across its last line whose baseline is under its last line's and whose
    // top is too, a line under it and not beside it on its row)
    let next: { mem: Member; l: Line } | null = null
    for (const e of onPage.get(page) ?? [])
      if (e.mem !== mem && e.l[4] < last[4] - APART && e.l[5] <= last[4] && across(e.l, x0, x1))
        if (!next || e.l[4] > next.l[4]) next = e
    // (ink between the two that no member's line holds: under its last line's bottom, a top higher than the next line's)
    const between = !!next && under(page, last[6], x0, x1) > next.l[5] + APART
    const fm = floatOf.get(mem) ?? null
    const fn = next ? (floatOf.get(next.mem) ?? null) : null
    const head = heads.get(mem.unit)
    let gap: Gap | undefined
    let sep: number | undefined
    if (head && kindOf(mem) === 'heading') {
      // (TeX's own test, \@sect's and \@xsect's: an after-skip over zero sets the title on lines of its own)
      const [a, s] = head.after
      if (a > 0) {
        gap = ['afterskip', r2(a), r2(s)]
        sep = r2(a + head.baselineskip + head.parskip[0])
      } else gap = ['runin', r2(neg(a)), r2(neg(s))]
    } else if (fm !== null && fn !== fm) {
      // (its float's last ink: what TeX set under it by where it placed the float, B's brackets, whatever stands under it on A: the
      // next float's own ink (a float over a float), the body's)
      const s = lastOf(mem, fm) ? underFloat(fm, page) : undefined
      if (s) gap = glue(inForce(glues, fm), s)
      // (two floats set here one over the other: TeX set \intextsep under the first and \intextsep again over the second, the two
      // glues between the members whole (float.sty's \float@endH, LaTeX's \@addtocurcol: `\vskip\intextsep \box \vskip
      // \intextsep`; PDF-READER §18.76, 2608.04322v1 p9's [H] Figures 7 and 8), each float's value at its
      // serial, natural sizes and shrinks added: the room TeX itself could close there)
      const pl = s === 'intextsep' ? placeOf(fm, page) : null
      const below = pl?.next ?? null
      if (gap && below !== null && placeOf(below, page)?.kind === 'here') {
        const v = inForce(glues, below).get('intextsep')
        if (v) gap = ['intextsep', r2(gap[1] + v[0]), r2(gap[2] + v[1])]
      }
    } else if (next && fm !== null && fn === fm) {
      const vals = inForce(glues, fm)
      if (kindOf(next.mem) === 'caption') gap = glue(vals, 'abovecaptionskip')
      else if (kindOf(mem) === 'caption') gap = glue(vals, 'belowcaptionskip')
      else if (!between && skips.has(mem.unit)) gap = parskipOf(skips.get(next.mem.unit))
    } else if (next && fm === null && fn !== null) {
      // (body text over a float: by where TeX placed the float; what stands over a float outside every column's body, a two-column
      // title block \twocolumn[…] sets over the columns, is no body text and states none)
      const s = bodied.has(mem) ? overFloat(fn, page) : undefined
      if (s) gap = glue(inForce(glues, fn), s)
    } else if (next && kindOf(mem) !== 'heading') {
      // (a heading the compile states no skips of states nothing: what TeX set under it is its class's own after-skip)
      const nh = kindOf(next.mem) === 'heading' ? heads.get(next.mem.unit) : undefined
      const note = kindOf(mem) === 'footnote'
      const nextNote = kindOf(next.mem) === 'footnote'
      const vals = inForce(glues, bodyOf.get(mem) ?? 0)
      if (nextNote && !note) gap = glue(vals, 'footins')
      else if (between) gap = undefined
      else if (nh) {
        // (\@startsection's: a negative before-skip TeX adds negated, glue and all)
        const [b, s] = nh.before
        gap = ['beforeskip', r2(Math.abs(b)), r2(b < 0 ? neg(s) : s)]
      } else if (nextNote && note) {
        const v = vals.get('footnotesep')
        if (v) gap = ['footnotesep', r2(v[0]), 0]
      } else if (skips.has(mem.unit)) gap = parskipOf(skips.get(next.mem.unit))
    }
    if (gap || sep !== undefined) out.set(mem, { ...(gap ? { gap } : {}), ...(sep !== undefined ? { sep } : {}) })
  }
  return out
}

/** a glue's part negated, zero itself (no negative zero in a part) */
const neg = (v: number): number => (v === 0 ? 0 : -v)
/** a paragraph's \parskip as a gap over it (`parskip`), where its unit states the glue and its shrink */
function parskipOf(k: NonNullable<Instrument['tex']['skips']>[number] | undefined): Gap | undefined {
  return k && k.parskipShrink !== undefined ? ['parskip', r2(k.parskip), r2(k.parskipShrink)] : undefined
}
