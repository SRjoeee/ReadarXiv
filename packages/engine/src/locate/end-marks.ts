// Phase 9 of locate (PHASES, locate.ts): a unit's end mark, what TeX pushed to the end of its last line after its text, claimed
// by the member as its element END.
// Reads: the index; the record's `members` (their last lines and their measures, phases 6 and 8), `units`, `claimedA` (what
// another member holds on A ends the walk).
// Writes: `claimedA` (the mark's glyphs its member's), the members' END element and its glyphs and boxes, `stats.ends`.
import type { Line } from '@readarxiv/format'
import { isImage, isPath } from '../doc.ts'
import { CENTRE, END } from './facts.ts'
import { isInk, r2 } from './lines.ts'
import { BRACKET, CALL, FREE, type Member, ON_ROW, UNIT_MARK, type Work } from './work.ts'

// ---- a unit's end mark (docs/PDF-READER.md §18.52; the coordinator's ruling of 2026-11-12): what TeX pushed to the end of the
// unit's last line after its text, amsthm's `\qed` (`\unskip\penalty9999\hbox{}\nobreak\hfill\quad\hbox{\qedsymbol}`, its
// `\openbox` four rules, set by `\end{proof}` after the unit's end point), a class's or an author's mark after `\hfill`. It
// belongs to the end of the unit's text: left where TeX set it (Room.stays, in no group), a translation a line longer stood it
// beside a line in the middle of the paragraph (2610.40645v1-ja p12 t80, p30 t253), one a line shorter left it alone under the
// text. Decided by what TeX set, never by a symbol's name or shape: what TeX shipped in B's stream after the member's end point,
// glyphs and boxes alike, up to the next unit's ink (the walk below), every piece of it with a partner on A, free there, within
// the member's last line's box and together on its band (as Room.stays reads ink beside a line: facts.ts staysOf), wholly after
// its last glyph (half a point, pinnedOf's), and its box's right edge at that line's measure end (CENTRE: the maker's
// flush-right reading, a line of the page's head or foot and a label's own line read so, facts-pass.ts): TeX pushed it there,
// and the paragraph ends with it (nothing of no unit's after it before the next unit's ink, on this page or at the next
// page's body's head). Over the 88 papers of r19: 251 of the 263 marks Room.stays stated at a source unit's last line's
// measure end, none else. Claimed by the member as its
// element END, of no piece, in its travelling group `.e` (erased with the unit's elements, drawn as a crop at the
// translation's end, El.end; `trail` too, so that a typesetter of before draws it after the translation's end), and no stay of
// any member's. Not a mark TeX set after a space (2608.25210v2's `example`, `$\square$` 2.24 pt after the text: no push), nor
// one past a line's end that is no measure's (2610.40394v1's six, the part's measure its column's): both stay as before. Not
// the author's own mark written in the text (`\qed`, `\hfill $\square$`: an element of the unit's): the same reading of its
// ink (the unit's last piece, after the line's other glyphs, at its measure's end) states as many of the units whose last
// element TeX set after a word space on a full last line, a reference's year, a caption's formula (34 of them on the first 47
// papers of the 88, against the corpus's 26 `\qed`): what TeX pushed it there with, a fill in its setting, is no fact the part
// or B's stream states. The typesetter lays such an element as an end mark where a part states it (El.end), none does
export function endMarks(w: Work): void {
  const { ins, B, m, inkA, pageA, pageB, unitB, gA, gB } = w.ix
  const { members, units, claimedA, stats } = w
  const memberOf = new Map<number, Member>()
  for (const x of members) if (x.unit >= 0 && x.name === undefined && !memberOf.has(x.unit)) memberOf.set(x.unit, x)
  // (whether ink at `a` on A stands on unit u's first line, before its text: its head, whatever member holds it)
  const onHead = (u: number, a: number) => {
    const f = memberOf.get(u)?.lines.find((x) => !(x[9] & 1))
    const g = gA(a)
    return !!f && f[0] === pageA[a] && Math.abs(g.y - f[4]) < ON_ROW * (f[10] ?? g.size) && g.x1 <= f[2] + 0.5
  }
  // (whether TeX's paragraph goes on at the next B page's body: its first ink no unit owns in B's stream)
  const goesOn = (p: number) => {
    const q = B.pages[p + 1]
    if (!q) return false
    const o1 = m.offB[p + 1] as number
    const start = (q.points ?? []).find((x) => /^bs\d+$/.test(x.name))?.glyph ?? 0
    for (let j = start; j < q.glyphs.length; j++) {
      if (!isInk(q.glyphs[j]!)) continue
      return (unitB[o1 + j] as number) < 0
    }
    return false
  }
  for (const mem of members) {
    if (!mem.located || mem.fixed || mem.figure || mem.dir || mem.name !== undefined || mem.unit < 0 || mem.bLast < 0)
      continue
    const unit = units[mem.unit]
    if (!unit || unit.cell || mem.unit >= ins.units.length) continue
    let j = mem.lines.length - 1
    while (j >= 0 && (mem.lines[j] as Line)[9] & 1) j--
    if (j < 0) continue
    const l = mem.lines[j] as Line
    const size = l[10] ?? mem.style.size
    const band = 0.4 * size
    const flush = (x1: number) => Math.abs(x1 - l[8]) <= CENTRE
    // (B's stream after the end point, on its page: to the next unit's mark or bracket or an author's call, the first glyph or
    // box a unit owns)
    const p = (pageB[mem.bLast] as number) - 1
    const o = m.offB[p] as number
    const pg = B.pages[p]!
    const pts = pg.points ?? []
    const k = pts.findIndex((x) => x.name === `${mem.unit}e`)
    if (k >= 0) {
      let stopG = o + pg.glyphs.length
      let stopBox = pg.kinds.length
      // (the unit the walk stops at: its mark's, its ink's; -1 a bracket or the page's end)
      let next = -1
      for (let q = k + 1; q < pts.length; q++) {
        const x = pts[q]!
        if (UNIT_MARK.test(x.name) || BRACKET.test(x.name) || CALL.test(x.name)) {
          stopG = o + x.glyph
          stopBox = x.box
          next = Number(/^[ht]?(\d+)[sec]$/.exec(x.name)?.[1] ?? -1)
          break
        }
      }
      const from = o + pts[k]!.glyph
      for (let b = from; b < stopG; b++)
        if ((unitB[b] as number) >= 0) {
          stopG = b
          stopBox = Math.min(stopBox, pg.boxAt[b - o] as number)
          next = unitB[b] as number
          break
        }
      // (the walk in TeX's order, glyphs and the boxes shipped before each, up to the next unit's ink: its own in B's stream,
      // or a glyph its member holds on A (the next theorem's head, a label no unit owns on B, 2610.21037v1 p6 t57): what TeX
      // set on the last line, and nothing of no unit's after it. Ink of no unit on another line before the next unit's, or a
      // glyph another member holds on A (an ink unit made of it), is the paragraph's own going on, no mark pushed to its end: a
      // reference whose unit holds its authors alone, its year and title after them on its line and the next, an ink unit's
      // (2610.11256v1's apacite entries, 2610.16663v1's two); and the next heading's number no unit owns (2610.16663v1 p55
      // t277, its box left a stay as before)
      const owner = ins.boxes[p]?.unit
      const glyphs: number[] = []
      const boxes: [number, number, number, number][] = []
      const at: { x0: number; x1: number; y0: number; y1: number }[] = []
      const onLine = (q: { x0: number; x1: number; y0: number; y1: number }) => q.y0 < l[5] && q.y1 > l[6]
      let ok = true
      let ended = false
      let xb = pts[k]!.box
      for (let b = from; ok && !ended; b++) {
        const upto = Math.min(stopBox, b < stopG ? (pg.boxAt[b - o] as number) : stopBox)
        for (; xb < upto && ok && !ended; xb++) {
          if (owner && (owner[xb] as number) >= 0) {
            ended = true
            break
          }
          const kind = pg.kinds[xb] as number
          if (!(isPath(kind) || isImage(kind))) continue
          const ap = m.boxPage[p]?.[xb] ?? 0
          if (!ap) {
            ok = false
            break
          }
          const ai = m.boxIndex[p]![xb] as number
          const bx = inkA.pages[ap - 1]!.boxes
          const q = { x0: bx[4 * ai]!, y0: bx[4 * ai + 1]!, x1: bx[4 * ai + 2]!, y1: bx[4 * ai + 3]! }
          if (ap !== l[0] || !onLine(q)) ok = false
          else {
            boxes.push([ap, ai, p, xb])
            at.push(q)
          }
        }
        if (!ok || ended || b >= stopG || (unitB[b] as number) >= 0) break
        if (!isInk(gB(b))) continue
        const a = m.bToA[b] as number
        if (a < 0) {
          ok = false
          break
        }
        const g = gA(a)
        const q = { x0: g.x0, x1: g.x1, y0: g.bottom, y1: g.top }
        // (a glyph a member holds on A ends it where that member is the next unit's, whose head it is; another's (an ink unit
        // made on A of the paragraph's own text going on) is no end of the paragraph)
        const c = claimedA[a] as number
        if (c !== FREE) {
          if (c >= 0 && next >= 0 && (members[c]?.unit === next || onHead(next, a))) ended = true
          else ok = false
        } else if (pageA[a] !== l[0] || !onLine(q)) ok = false
        else {
          glyphs.push(a)
          at.push(q)
        }
      }
      // (a walk to the body's end or the page's: the paragraph ends there unless TeX goes on with it on the next page, its
      // body's first ink no unit's (a reference's title its unit does not hold, 2610.16663v1 p39 t322))
      if (ok && next < 0 && goesOn(p)) ok = false
      if (ok && at.length) {
        const x0 = Math.min(...at.map((x) => x.x0))
        const x1 = Math.max(...at.map((x) => x.x1))
        const y0 = Math.min(...at.map((x) => x.y0))
        const y1 = Math.max(...at.map((x) => x.y1))
        if (x0 >= l[3] + 0.5 && flush(x1) && y0 < l[4] + band && y1 > l[4] - band) {
          for (const a of glyphs) claimedA[a] = mem.ord
          if (glyphs.length) mem.els.set(END, glyphs)
          if (boxes.length) {
            mem.elBoxes.set(
              END,
              boxes.map(([ap, ai]) => [ap, ai]),
            )
            mem.elBoxesB.set(
              END,
              boxes.map(([, , bp, bx]) => [bp, bx]),
            )
          }
          stats.ends = (stats.ends ?? 0) + 1
          mem.elements.push([
            END,
            {
              kind: 'other',
              copy: glyphs.map((a) => gA(a).u).join(''),
              ink: [[l[0], r2(x0), r2(y0), r2(x1), r2(y1), l[4]]],
              trail: 1,
              end: 1,
            },
          ])
        }
      }
    }
  }
}
