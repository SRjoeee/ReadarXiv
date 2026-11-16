// The separation TeX set under each member's last line, by its class (Room.gap), and a heading's paragraph separation
// (Room.sep): read from what the marked compile states (Instrument.tex: each heading's \@startsection skips, the paper's float,
// caption and footnote separations, each paragraph's \parskip; marks/channels.ts) and from what stands under the member on A
// (the next member's line under its last one, and the float each is of by B's brackets). Phase 10 (rooms), read-only: it reads
// the members' lines, measures and columns (phases 6, 8) and B's points. The compile move's B1 (the display design's F12, 2c's
// F-last and F-sep, 2d's rule 2 facts, F40's form 1).
import type { Line, Room } from '@readarxiv/format'
import type { Instrument } from '../instrument.ts'
import type { GlueName } from '../marks/channels.ts'
import { r2 } from './lines.ts'
import type { Member, Work } from './work.ts'

/** a member's separation by class (Room.gap) */
export type Gap = NonNullable<Room['gap']>
/** a float's bracket on B (LAYOUT_TEX's POINTS: `fs<n>` before its box's first glyph, `fe<n>` after its last), and a body's
 *  opening point (`bs<n>`): one serial for both, the order TeX made them in */
const FLOAT_BRACKET = /^f([se])(\d+)$/
const BODY_POINT = /^bs(\d+)$/
/** two heights told apart (PDF units): a line's are stated to a hundredth (lines.ts r2) */
const APART = 0.01
/** the first ink under a height on a page across x0..x1: the highest top under it (geometry.ts inkIndex `under`) */
type InkUnder = (page: number, foot: number, x0: number, x1: number) => number

/** each B page's floats, glyph by glyph (the innermost float bracket open before it, its serial; -1 none), and the serial of
 *  the last body TeX shipped on it (its last `bs<n>`; 0 none) */
function bracketsOf(B: Instrument['ink']): { floatAt: Int32Array[]; body: number[] } {
  const floatAt: Int32Array[] = []
  const body: number[] = []
  for (const pg of B.pages) {
    const at = new Int32Array(pg.glyphs.length).fill(-1)
    const open: number[] = []
    let q = 0
    let last = 0
    const points = pg.points
    for (let g = 0; g <= pg.glyphs.length; g++) {
      for (; q < points.length && points[q]!.glyph <= g; q++) {
        const name = points[q]!.name
        const b = BODY_POINT.exec(name)
        if (b) last = Math.max(last, Number(b[1]))
        const f = FLOAT_BRACKET.exec(name)
        if (!f) continue
        if (f[1] === 's') open.push(Number(f[2]))
        else {
          const i = open.lastIndexOf(Number(f[2]))
          if (i >= 0) open.splice(i, 1)
        }
      }
      if (g < pg.glyphs.length && open.length) at[g] = open[open.length - 1]!
    }
    floatAt.push(at)
    body.push(last)
  }
  return { floatAt, body }
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
 * - a float's last member (2c's F-last: the next member under it is of no float or of another, with no ink between that no unit
 *   owns, which may be the float's own): over body text `textfloatsep` where no body text stands over the float in its column
 *   (a top float), `intextsep` where some does (a float set here), `dbltextfloatsep` a float across both columns; over another
 *   float `floatsep` (`dblfloatsep`), or `fpsep` (`dblfpsep`) on a page of floats alone; the float's values (Instrument.tex.glues
 *   at its serial);
 * - body text over a float's first member: `intextsep` where body text stands under the float in its column, `textfloatsep`
 *   where none does (a bottom float), `dbltextfloatsep` a float across both columns;
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
  const { floatAt, body } = bracketsOf(ins.ink)
  const own = (mem: Member) => mem.unit >= 0 && mem.unit < ins.units.length && mem.name === undefined
  // (a member's float by its first glyph on B, its serial; null none; and the serial of the last body shipped on its B page)
  const floatOf = new Map<Member, number | null>()
  const bodyOf = new Map<Member, number>()
  for (const mem of members) {
    if (!own(mem) || mem.bFirst < 0) {
      floatOf.set(mem, null)
      continue
    }
    const p = (pageB[mem.bFirst] as number) - 1
    const f = floatAt[p]?.[mem.bFirst - (m.offB[p] as number)] ?? -1
    floatOf.set(mem, f >= 0 ? f : null)
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
  // (body text, of no float, on the page across a float's lines: over its first line, or under its last)
  const bodyBy = (f: number, page: number, side: 'over' | 'under') => {
    const ls = floatLines(f, page)
    if (!ls.length) return false
    const x0 = Math.min(...ls.map((l) => Math.min(l[2], l[7])))
    const x1 = Math.max(...ls.map((l) => Math.max(l[3], l[8])))
    const top = Math.max(...ls.map((l) => l[4]))
    const foot = Math.min(...ls.map((l) => l[4]))
    return (onPage.get(page) ?? []).some(
      (e) =>
        floatOf.get(e.mem) === null &&
        across(e.l, x0, x1) &&
        (side === 'over' ? e.l[4] > top + APART : e.l[4] < foot - APART),
    )
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
      if (next && !between) {
        const vals = inForce(glues, fm)
        const two = spans(fm, page)
        if (fn !== null) {
          // (a page of floats alone: no body text across the member's line on it)
          const bodied = (onPage.get(page) ?? []).some((e) => floatOf.get(e.mem) === null && across(e.l, x0, x1))
          gap = glue(vals, bodied ? (two ? 'dblfloatsep' : 'floatsep') : two ? 'dblfpsep' : 'fpsep')
        } else gap = glue(vals, two ? 'dbltextfloatsep' : bodyBy(fm, page, 'over') ? 'intextsep' : 'textfloatsep')
      }
    } else if (next && fm !== null && fn === fm) {
      const vals = inForce(glues, fm)
      if (kindOf(next.mem) === 'caption') gap = glue(vals, 'abovecaptionskip')
      else if (kindOf(mem) === 'caption') gap = glue(vals, 'belowcaptionskip')
      else if (!between && skips.has(mem.unit)) gap = parskipOf(skips.get(next.mem.unit))
    } else if (next && fm === null && fn !== null) {
      const vals = inForce(glues, fn)
      gap = glue(vals, spans(fn, page) ? 'dbltextfloatsep' : bodyBy(fn, page, 'under') ? 'intextsep' : 'textfloatsep')
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
