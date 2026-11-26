// Phase 2 of locate (locate.ts): each member's trail, the ink TeX set right after its last glyph that no unit owns,
// claimed as its element TRAIL, or, an author's member's whose source writes pieces after its name that own no ink, as the
// first of those pieces' (runOf).
// Reads: the index; the record's `members` and `units`; the ownership (a glyph another member holds is no trail).
// Writes: the ownership (each trail taken by its member, its element TRAIL or its run's first piece), `trailSep` (assigned:
// an author's trail's gap, which phase 6 states), `runShared` (assigned: the run's other pieces, which phase 6 states empty).
import type { Piece } from '@readarxiv/format'
import { isImage, isPath } from '../doc.ts'
import { TRAIL } from './facts.ts'
import { lineTextOf, scriptOn } from './ink-units.ts'
import { isInk, r2 } from './lines.ts'
import type { Claims } from './ownership.ts'
import {
  AUTHOR_KINDS,
  assign,
  BRACKET,
  CALL,
  INKED_CLASSES,
  lettersIn,
  type Member,
  UNIT_MARK,
  type Work,
} from './work.ts'

/** a word ends where two glyphs stand this share of their size apart, and a trail with it (the ink units' word rule,
 *  ink-units.ts wordsOf's WORD_GAP); a table's entry no unit is read by its words (facts-pass.ts readColumns) */
export const WORD_GAP = 0.12

export function claimTrails(w: Work, claims: Claims): void {
  const { B, NB, m, inkA, ins, pageA, pageB, unitB, gA } = w.ix
  const { members } = w
  // ---- a member's trail: the ink TeX set right after its last glyph, glued to it on its row, that no unit owns (a class's marks
  // after a name and its separator: Meta FAIR's \authorformat sets `#2$^{#1}$` and \addtolist ", " after each \author's text; the
  // \thanks mark \maketitle sets in an \rlap after a name), claimed as its element TRAIL, which travels with its text (its group
  // `.e`, El.trail: laid after its translation's end). Left where TeX set it, that ink fenced the member's room beside it and kept
  // the member after it on the row where it stood: 2604.14228v3's translated names each at its original's start, a hole after
  // each, 1706.03762v7's first name set small before its \thanks mark. Glued: its glyphs one after the other in TeX's stream,
  // no other unit's between, each on the member's line (its box meeting the last glyph's across: a raised mark is, which a
  // row's baseline rule, ON_ROW, is not) and no word's gap (WORD_GAP, the ink units' word rule) after the one before; a mark TeX
  // set past a skip (an \hspace, a \hfill: a proof's QED box) is none of it, and stays (Room.stays)
  // A run TeX states (marks.ts \axtcall: the point `<i>c` the marked compile sets before each author's call, the command
  // or the \and that opens unit i's block, where TeX sets it on a line): an author's member owns what stands on its last line
  // between its end mark and the next author's call, before any unit's mark or bracket, whatever the gap (ICML's \, before its
  // marks, 0.17 em, past WORD_GAP: the marks were left behind its name's translation), and nothing past it, which the next
  // author's lead is (own/own.ts MR 5); a row of another line there (1706.03762v7's e-mails, under each place before NeurIPS'
  // \And) is none of it, left the original's where TeX set it (taken, the place was laid on two lines at 8.97 pt). The last of such calls, an author whose own call is stated with no call after it, owns what
  // stands on its last line before the paragraph TeX ends after it (Instrument.tex.paragraphEnds), no unit's mark between: the
  // end of the list its calls make (ICML's last name, "Zuo Bai 2 †"); a row of another line before that end (an e-mail a class
  // sets under the last name in its tabular) is none of it, and the glue rule below reads the run. Where no call is stated (a
  // class that stores its list and sets it whole, 2604.14228v3's \addtolist), the glue rule below, as before.
  // An author's member (the author block's names and places, docs/PDF-READER.md §18.59) also owns, past a word's gap, the ink of
  // no letter TeX set after it on its last line, up to the next unit's ink in B's stream: what TeX set as part of its line (a
  // \thanks mark after `\hspace{1.7mm} `, a footnote mark after `\,`, a postal code between two places) moves with it, the gap
  // TeX set before it stated (El.sep) and laid before its crop. Left where TeX set it, it fenced the member's room and its
  // neighbour's: 1706.03762v7's last name (no call after NeurIPS' last block) drawn at 0.875 beside its ‡, 2608.16117v1's
  // "19104," parting its line's runs, two places at 0.8. Ink holding a letter is text, never a trail: a class's "and" between two
  // names is an ink unit's, translated (the walk ends at it); a member of no author block keeps the glue rule alone.
  // A separator TeX set after the next author's call, the called author starting on another row (llncs's
  // `Hualuo Liu\inst{2} \and \\ Chunjie Zhang`, or a row TeX wrapped there): it stands on the row of the name it follows, no
  // lead of the next (whose label is what stands on its start's line, own/own.ts MR 5), and is the member's run, glued after
  // it, where it holds no letter; a separator of a word (", and") is the ink units' whole, translated and laid after the name in
  // its row's flow, as between two names of a row. The rows read as the trail reads its line (a glyph's box meeting the last
  // glyph's across): the called author's first glyph off the member's last line is another row. Left no one's, the comma stood
  // at the original row's end, past the shorter translated row (2604.10456v1, rows 1 and 2)
  const paraEndsB: number[] = []
  ;(ins.tex.paragraphEnds ?? []).forEach((l, p) => {
    for (const g of l) paraEndsB.push((m.offB[p] as number) + g)
  })
  paraEndsB.sort((x, y) => x - y)
  const calledOwn = new Set<string>()
  for (const pg of B.pages) for (const x of pg.points ?? []) if (CALL.test(x.name)) calledOwn.add(x.name.slice(0, -1))
  const runEndOf = (mem: Member): { at: number; line: boolean; start?: number } | null => {
    if (!AUTHOR_KINDS.has(mem.kind)) return null
    const p = (pageB[mem.bLast] as number) - 1
    const o = m.offB[p] as number
    const pts = B.pages[p]?.points ?? []
    const k = pts.findIndex((x) => x.name === `${mem.unit}e`)
    if (k < 0) return null
    let next = Number.POSITIVE_INFINITY
    for (let j = k + 1; j < pts.length; j++) {
      const x = pts[j]!
      if (CALL.test(x.name)) {
        // (and the called author's start on this page, else the page's end: the glyph before which it begins)
        const own = `${x.name.slice(0, -1)}s`
        let start = o + (B.pages[p]?.glyphs.length ?? 0)
        for (let q = j + 1; q < pts.length; q++)
          if (pts[q]!.name === own) {
            start = o + pts[q]!.glyph
            break
          }
        return { at: o + x.glyph, line: false, start }
      }
      if (UNIT_MARK.test(x.name) || BRACKET.test(x.name)) {
        next = o + x.glyph
        break
      }
    }
    if (!calledOwn.has(String(mem.unit))) return null
    const from = o + pts[k]!.glyph
    const end = paraEndsB.find((e) => e >= from)
    return end === undefined || end > next || pageB[end - 1] !== pageB[mem.bLast] ? null : { at: end, line: true }
  }
  // (an author's trail past a word's gap: the gap TeX set before it, by member ord)
  const trailSep = new Map<number, number>()
  // (the pieces of a run but its first, by `${unit}|${piece}`: their ink the first's, each stated empty by phase 6)
  const runShared = new Set<string>()
  for (const mem of members) {
    if (!mem.located || mem.fixed || mem.figure || mem.kind === 'cell' || mem.name !== undefined || mem.bLast < 0)
      continue
    const end = m.bToA[mem.bLast] as number
    if (end < 0) continue
    // (CHANGED: the member's last line is its own glyphs on its last glyph's baseline (lineOf), its band and its text, not its
    // last glyph's ink: a comma after a name stands at the baseline, and a mark TeX raised right after it read off the line)
    const { last, text } = lineOf(w, mem, end)
    // (an author's ink ends where its element boxes on its last glyph's band end, an ORCID icon after the name, no glyph: what
    // TeX set right after the icon is glued to the member, and a gap is read from there, as the crop it travels in ends there)
    let boxEnd = last.x1
    if (AUTHOR_KINDS.has(mem.kind))
      for (const l of mem.elBoxes.values())
        for (const [p, i] of l) {
          const bx = inkA.pages[p - 1]?.boxes
          if (p !== pageA[end] || !bx || (bx[4 * i] as number) < last.x0) continue
          if ((bx[4 * i + 1] as number) < last.top && (bx[4 * i + 3] as number) > last.bottom)
            boxEnd = Math.max(boxEnd, bx[4 * i + 2] as number)
        }
    let prev = boxEnd > last.x1 ? { ...last, x1: boxEnd } : last
    const trail: number[] = []
    let apart = false
    let glued = 0
    // (the scripts the trail opens with, one after the other)
    let scripts = 0
    let sep: number | undefined
    const run = runEndOf(mem)
    let call = run ? run.at : -1
    // (the list's end: every free ink glyph before it on the member's last line, else the glue rule)
    if (run?.line)
      for (let b = mem.bLast + 1; b < run.at && b < NB && (unitB[b] as number) < 0; b++) {
        const a = m.bToA[b] as number
        if (a < 0 || !claims.free(a) || pageA[a] !== pageA[end]) continue
        const g = gA(a)
        if (isInk(g) && (g.top <= last.bottom || g.bottom >= last.top)) {
          call = -1
          break
        }
      }
    for (let b = mem.bLast + 1; b < NB && pageB[b] === pageB[mem.bLast] && (unitB[b] as number) < 0; b++) {
      if (call >= 0) {
        if (b >= call) break
        const a = m.bToA[b] as number
        if (a < 0 || !claims.free(a) || pageA[a] !== pageA[end]) continue
        const g = gA(a)
        // (on the member's last line alone: another row before the call, an e-mail a block sets under its place, is no trail)
        if (isInk(g) && g.top > last.bottom && g.bottom < last.top) trail.push(a)
        continue
      }
      const a = m.bToA[b] as number
      if (a < 0 || !claims.free(a) || pageA[a] !== pageA[end]) break
      const g = gA(a)
      // (a glyph that paints nothing, a word space a producer wrote as one, decides nothing for an author's member: the ink after
      // it does, past the gap it stands in)
      if (!isInk(g) && AUTHOR_KINDS.has(mem.kind)) continue
      if (!isInk(g) || g.top <= last.bottom || g.bottom >= last.top || g.x0 < prev.x0) break
      // (past a word's gap, and on after it: an author's member alone, and ink of no letter alone. A letter on the line after it
      // is the paragraph's own text going on (acmart's reference format: "Ru Huang. 2027. ABNAT", the year the sentence's): none of
      // what stands past the gap is the member's then, as the end mark's walk reads text no unit owns after a unit's end)
      const wide = g.x0 - prev.x1 > WORD_GAP * Math.max(g.size, prev.size)
      // (CHANGED: a script of the member's line (smaller than its text and off its baseline, ink-units.ts scriptOn) that TeX set
      // right after it, and every one after that before any other glyph: a run of marks, whole past a thin space inside it)
      const script = scriptOn(text, g) !== 0
      if (script && scripts === trail.length) scripts++
      if (wide || apart) {
        if (!AUTHOR_KINDS.has(mem.kind)) break
        if (!apart) glued = trail.length
        if (!script && lettersIn(g.u) > 0) {
          // (CHANGED: cut back to the glued part, or to the run of scripts, whichever is longer: marks TeX set as a script are
          // no text of the sentence that goes on after them, whatever follows: REVTeX's "Bob Ray,¹,²,³ and Cy Day⁴")
          if (scripts > glued) glued = scripts
          else sep = undefined
          trail.length = glued
          break
        }
        if (wide && !trail.length) sep = r2(g.x0 - prev.x1)
        apart = true
      }
      trail.push(a)
      prev = g
    }
    // (the separator TeX set after the next author's call, the called author's first glyph on another row: on the member's last
    // line, holding no letter)
    const first = run?.start !== undefined && run.start < NB ? (m.bToA[run.start] as number) : -1
    const offRow =
      first < 0 || pageA[first] !== pageA[end] || gA(first).top <= last.bottom || gA(first).bottom >= last.top
    if (call >= 0 && run?.start !== undefined && offRow) {
      const said: number[] = []
      let word = false
      for (let b = call; b < run.start && b < NB && (unitB[b] as number) < 0; b++) {
        const a = m.bToA[b] as number
        if (a < 0 || !claims.free(a) || pageA[a] !== pageA[end]) continue
        const g = gA(a)
        if (!isInk(g) || g.top <= last.bottom || g.bottom >= last.top) continue
        if (lettersIn(g.u) > 0) {
          word = true
          break
        }
        said.push(a)
      }
      if (!word) trail.push(...said)
    }
    // (ONE OWNER PER INK: an author's member whose source writes pieces after its name that own no ink — llncs's `\inst{1}`, a
    // class's `\textsuperscript{…}`, `\inst{…}\orcidID{…}`, an `\IEEEauthorrefmark` list —, set past the end mark where a front
    // unit's marks state no point between them (marks.ts: no mark of a piece after a front unit's last text): what TeX set
    // there is those pieces' ink, never a trail of no piece beside them, which left each piece stating no ink and no text, and
    // the typesetter, which cannot tell a piece TeX set nothing for from one whose ink was not found, refused the member
    // `unproven`: every name of the block drawn in the original, whatever the translator gave (2604.10456v1's eleven). The run
    // is the first piece's ink, a crop of TeX's own setting drawn where the translation sets that piece; each other piece of
    // the run is stated empty (El.text '', phase 6), its ink in the first's, so that the run is drawn once, in TeX's order,
    // wherever a translation sets the pieces and whatever their order. The run is what TeX painted there, its boxes too (an
    // ORCID icon `\orcidlink` draws, no glyph, before a class's mark: 2610.20451v1's "Davide Usseglio", the icon then REVTeX's
    // "2"), each box no unit's, on the member's last line, painted after its last glyph and before the glyph after the run's
    // last. One gap TeX set before the run (`sep`) is the trail's statement alone: the run's first piece is laid where the
    // translation sets it, glued there as a piece is)
    const pieces = AUTHOR_KINDS.has(mem.kind) ? runOf(w, mem) : []
    if (pieces.length) {
      const boxes = runBoxes(w, mem, trail, last)
      if (!trail.length && !boxes.length) continue
      const first = pieces[0]!
      claims.take(mem, {
        els: new Map(trail.length ? [[first, trail]] : []),
        elBoxes: new Map(boxes.length ? [[first, boxes.map(([ap, ai]): [number, number] => [ap, ai])]] : []),
        elBoxesB: new Map(boxes.length ? [[first, boxes.map(([, , p, x]): [number, number] => [p, x])]] : []),
      })
      for (const id of pieces.slice(1)) runShared.add(`${mem.unit}|${id}`)
      continue
    }
    if (!trail.length) continue
    claims.take(mem, { els: new Map([[TRAIL, trail]]) })
    if (sep !== undefined) trailSep.set(mem.ord, sep)
  }
  assign(w, 'trailSep', trailSep)
  assign(w, 'runShared', runShared)
}

/** a member's last glyph `end` (A's) and its last line: the band across every glyph of its own text on that glyph's baseline on
 *  its page (TeX sets one line's text on one baseline, read on the engine's hundredth), and that text's size and baseline as a
 *  line's scripts are read against (ink-units.ts lineTextOf). Read off the last glyph alone, a comma after a name, whose ink
 *  stands at the baseline, left the marks TeX raised right after it off the line: REVTeX's "Ann Lee,¹,*", kept where TeX set
 *  them, which fenced the next name's join and its row's run (a blank before the last name) */
function lineOf(w: Work, mem: Member, end: number) {
  const { gA, pageA } = w.ix
  const g = gA(end)
  let top = g.top,
    bottom = g.bottom
  const own: { size: number; y: number }[] = []
  for (const a of mem.text) {
    if (pageA[a] !== pageA[end]) continue
    const x = gA(a)
    if (r2(x.y) !== r2(g.y) || !isInk(x)) continue
    top = Math.max(top, x.top)
    bottom = Math.min(bottom, x.bottom)
    own.push(x)
  }
  return { last: { ...g, top, bottom }, text: lineTextOf(own) }
}

/**
 * The boxes TeX painted in an author's run (A's [page, index] and B's [page index, box index] of each): on B's page of the
 * member's last glyph, painted after that glyph and before the glyph after the run's last (`trail`, A's; none: before the glyph
 * after the member's last), a rule or an image of no unit's with a partner on A's page of that glyph, meeting the member's last
 * glyph `last` across and not before its start
 */
function runBoxes(
  w: Work,
  mem: Member,
  trail: readonly number[],
  last: { x0: number; top: number; bottom: number },
): [ap: number, ai: number, p: number, x: number][] {
  const { ins, B, m, inkA, pageA, pageB } = w.ix
  const p = (pageB[mem.bLast] as number) - 1
  const o = m.offB[p] as number
  const pg = B.pages[p]!
  const g0 = mem.bLast - o
  let g1 = g0
  for (const a of trail) {
    const b = m.aToB[a] as number
    if (b >= 0 && b - o > g1) g1 = b - o
  }
  const at = pg.boxAt
  const from = (at[g0] as number | undefined) ?? pg.kinds.length
  // (bounded as the glyphs are: before the glyph after the run's last, and before the next author's call or any unit's mark
  // after the member's end point, which the next author's ink is: an icon its block opens with is its own)
  let to = g1 + 1 < pg.glyphs.length ? (at[g1 + 1] as number) : pg.kinds.length
  const k = pg.points.findIndex((x) => x.name === `${mem.unit}e`)
  if (k >= 0)
    for (let j = k + 1; j < pg.points.length; j++) {
      const x = pg.points[j]!
      if (CALL.test(x.name) || UNIT_MARK.test(x.name) || BRACKET.test(x.name)) {
        to = Math.min(to, x.box)
        break
      }
    }
  const pageOfLast = pageA[m.bToA[mem.bLast] as number] as number
  const out: [number, number, number, number][] = []
  for (let x = from; x < to; x++) {
    const kind = pg.kinds[x] as number
    const ap = m.boxPage[p]?.[x] ?? 0
    if (!(isPath(kind) || isImage(kind)) || ap !== pageOfLast || (ins.boxes[p]?.unit[x] ?? -1) >= 0) continue
    const ai = m.boxIndex[p]![x] as number
    const bx = inkA.pages[ap - 1]!.boxes
    const [x0, y0, y1] = [bx[4 * ai] as number, bx[4 * ai + 1] as number, bx[4 * ai + 3] as number]
    if (x0 < last.x0 || y0 >= last.top || y1 <= last.bottom) continue
    out.push([ap, ai, p, x])
  }
  return out
}

/** a unit's pieces in the source's order, a group's inside where it stands: its texts, its elements and nested units */
function flatOf(content: readonly Piece[], out: Piece[] = []): Piece[] {
  for (const p of content) {
    if (p.t === 'span') flatOf(p.content, out)
    else out.push(p)
  }
  return out
}

/**
 * The pieces a member's trail is the ink of, in the source's order: those its unit's source writes after its last text and
 * after the last piece that owns ink, each of a class drawn from its ink (INKED_CLASSES) that owns no glyph and no box of its
 * own, is not stated to set nothing (the instrument's `empty`) and was not set before the unit's start (`outside`); a piece of
 * no ink of its own (a space, a switch) passed over. None where the source writes no such piece: the trail is then ink of no
 * piece (a class's separator, a mark of the class's own lists), and stays the member's trail
 */
function runOf(w: Work, mem: Member): string[] {
  const unit = w.units[mem.unit]
  if (!unit) return []
  const { emptyPiece, outsidePiece } = w.ix
  const classOf = new Map(unit.classes ?? [])
  const seq = flatOf(unit.content)
  const run: string[] = []
  for (let k = seq.length - 1; k >= 0; k--) {
    const p = seq[k]!
    if (p.t === 'text') {
      if (/\S/.test(p.s)) break
      continue
    }
    if (p.t !== 'el' && p.t !== 'unit') continue
    if ((mem.els.get(p.id)?.length ?? 0) > 0 || (mem.elBoxes.get(p.id)?.length ?? 0) > 0) break
    const key = `${mem.unit}|${p.id}`
    const stated = classOf.get(p.id)?.cls ?? (p.t === 'unit' ? 'note-mark' : p.kind)
    if (!INKED_CLASSES.has(stated) || emptyPiece.has(key) || outsidePiece.has(key)) continue
    run.unshift(p.id)
  }
  return run
}
