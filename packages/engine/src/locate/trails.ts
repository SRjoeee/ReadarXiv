// Phase 2 of locate (locate.ts): each member's trail, the ink TeX set right after its last glyph that no unit owns,
// claimed as its element TRAIL.
// Reads: the index; the record's `members`; the ownership (a glyph another member holds is no trail).
// Writes: the ownership (each trail taken by its member, its element TRAIL), `trailSep` (assigned: an author's trail's gap,
// which phase 6 states).
import { TRAIL } from './facts.ts'
import { isInk, r2 } from './lines.ts'
import type { Claims } from './ownership.ts'
import { AUTHOR_KINDS, assign, BRACKET, CALL, lettersIn, type Member, UNIT_MARK, type Work } from './work.ts'

/** a word ends where two glyphs stand this share of their size apart, and a trail with it (the ink units' word rule, today's
 *  wordsOf: ink-units.mjs WORD_GAP) */
const WORD_GAP = 0.12

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
  // A run TeX states (latex-front.mjs \axtcall: the point `<i>c` the marked compile sets before each author's call, the command
  // or the \and that opens unit i's block, where TeX sets it on a line): an author's member owns what stands on its last line
  // between its end mark and the next author's call, before any unit's mark or bracket, whatever the gap (ICML's \, before its
  // marks, 0.17 em, past WORD_GAP: the marks were left behind its name's translation), and nothing past it, which the next
  // author's lead is (own.mjs MR 5); a row of another line there (1706.03762v7's e-mails, under each place before NeurIPS'
  // \And) is none of it, the original's where TeX set it as before (taken, the place was laid on two lines at 8.97 pt). The last of such calls, an author whose own call is stated with no call after it, owns what
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
  // names is an ink unit's, translated (the walk ends at it); a member of no author block keeps the glue rule alone
  const paraEndsB: number[] = []
  ;(ins.tex.paragraphEnds ?? []).forEach((l, p) => {
    for (const g of l) paraEndsB.push((m.offB[p] as number) + g)
  })
  paraEndsB.sort((x, y) => x - y)
  const calledOwn = new Set<string>()
  for (const pg of B.pages) for (const x of pg.points ?? []) if (CALL.test(x.name)) calledOwn.add(x.name.slice(0, -1))
  const runEndOf = (mem: Member): { at: number; line: boolean } | null => {
    if (!AUTHOR_KINDS.has(mem.kind)) return null
    const p = (pageB[mem.bLast] as number) - 1
    const o = m.offB[p] as number
    const pts = B.pages[p]?.points ?? []
    const k = pts.findIndex((x) => x.name === `${mem.unit}e`)
    if (k < 0) return null
    let next = Number.POSITIVE_INFINITY
    for (let j = k + 1; j < pts.length; j++) {
      const x = pts[j]!
      if (CALL.test(x.name)) return { at: o + x.glyph, line: false }
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
  for (const mem of members) {
    if (!mem.located || mem.fixed || mem.figure || mem.kind === 'cell' || mem.name !== undefined || mem.bLast < 0)
      continue
    const end = m.bToA[mem.bLast] as number
    if (end < 0) continue
    const last = gA(end)
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
      if (wide || apart) {
        if (!AUTHOR_KINDS.has(mem.kind)) break
        if (!apart) glued = trail.length
        if (lettersIn(g.u) > 0) {
          trail.length = glued
          sep = undefined
          break
        }
        if (wide && !trail.length) sep = r2(g.x0 - prev.x1)
        apart = true
      }
      trail.push(a)
      prev = g
    }
    if (!trail.length) continue
    claims.take(mem, { els: new Map([[TRAIL, trail]]) })
    if (sep !== undefined) trailSep.set(mem.ord, sep)
  }
  assign(w, 'trailSep', trailSep)
}
