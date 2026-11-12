// locate(instrument, inkA, mapping): every unit the instrument owns, on arXiv's page (design §4.1, §4.2's Located, §4.3).
//
// - A unit is LOCATED where every glyph it owns on B has a partner on A (or is a line-end hyphen a `hyphen` hunk holds, or lies
//   off its page), and every rule and image it owns pairs with A's (S1d). No partial credit, no threshold; a unit that is not
//   located stays the original's, with the cause: `content difference: <class>` (the hunk class that holds its first
//   unmatched glyph, B's and A's glyphs differing there; or a rule, an image, a turned glyph with no partner), `no ink` (the
//   instrument gives it none), or the instrument's own why.
// - Its ink on A: its glyphs' partners, each in the role and piece its B glyph has, and A's own unmatched glyphs inside its A
//   span whose matched neighbours on both sides are its own (a word TeX broke on A and not on B: its hyphen; a content
//   difference: A's own glyphs there), in their neighbours' role where both have one, else its text's.
// - Everything geometric is A's: lines cut in its own glyph run (lines.ts), elements' ink per line, its label, its room, its
//   style's size and fill; TeX's statements where the instrument has them (its alignment). Where it stands on A against B:
//   `same` (every pair within 0.01 pt on its page), `shifted` (each of B's lines moved whole), `respaced`, `rebroken`.
// - Members: one placement per unit, a babel name's every occurrence its own; then the units no source unit is, made on A by
//   today's rule where A's pages are given (ink.ts: ink units, kept blocks, figure texts, of A's glyphs no source unit owns, B's
//   marks carried onto A); then the units born on A (born.ts) from the glyphs B never printed that today's rule makes nothing of. Flows: members that share a TeX line, consecutive in the stream. Ties: a table's cells; a
//   figure's set. Links: A's annotations, each owned by the element or the text its rectangle lies over.
// - Groups (design §4.5): per member and page, `<ord>.<page>.t` its text (and a name's or figure text's word), `.e` its
//   travelling elements, `.l` its label; a display, a kept block and what is not located are in no group.
import {
  type El,
  type Ink,
  type Label,
  type Line,
  type LinkBorder,
  type Piece,
  type Room,
  unitId,
} from '@readarxiv/format'
import type { Mapping } from '../align/align.ts'
import { HUNK, hunkName } from '../align/align.ts'
import type { Doc, DocGlyph } from '../doc.ts'
import { isImage, isPath } from '../doc.ts'
import { type Instrument, type InstrumentUnit, ROLE, type TexFrame } from '../instrument.ts'
import {
  bracketsOf,
  CENTRE,
  centredByBlock,
  END,
  elementCase,
  fakedCaps,
  fillRunsOf,
  joinAccents,
  type StyleGlyph,
  sourceText,
  styleOf,
  TRAIL,
  textOf,
  turnedStyleGlyph,
  unitSize,
  urlCopyOf,
} from './facts.ts'
import { bornOf } from './born.ts'
import { factsOf } from './facts-pass.ts'
import { placeUnits } from './members.ts'
import { empty } from './place.ts'
import { groupLettersOf, groupStyleOf, hasScopes, namesFace } from './group-style.ts'
import { groupStyleOf as commandStyleOf, inkOf } from './ink.ts'
import { type CutLine, cutLines, isInk, lineSize, r2 } from './lines.ts'
import { type RowBox, rowsOf } from './rows.ts'
import { regionsOf } from './today/today.types.ts'
import {
  AUTHOR_KINDS,
  BRACKET,
  CALL,
  eachBetweenPaired,
  FREE,
  field,
  HELD,
  INKED_CLASSES,
  type Located,
  type LocateOptions,
  lettersIn,
  type Member,
  ON_ROW,
  open,
  piecesOf,
  sameColumn,
  standsOn,
  UNIT_MARK,
} from './work.ts'
import { bySentence, elementsOf, wordsOn } from './words.ts'

export { eachBetweenPaired, FREE, HELD, type Located, type LocateOptions, type Member }
export type { Place } from './work.ts'

/** an element kind whose glyphs are a reading of it: its text is stated */
const TEXT_KINDS = new Set(['cite', 'ref', 'eqref', 'url', 'number', 'footnote', 'macro'])
/** the kind of a member of the author block's units set away from the block under the title (author-block.ts): the text it is
 *  there, of no toggle (the reader's and the content classes' tables name it nowhere: always translated) */
export const TEXT_NAMES = 'textnames'
/** the classes the typesetter draws as the page's text (drawnAs L2:1757: a citation, a reference, a macro) */
const TEXT_CLASSES = new Set(['cite', 'num', 'macro', 'umacro'])
const LABEL_KIND: Record<string, Label['kind']> = {
  caption: 'float',
  heading: 'head',
  theorem: 'head',
  footnote: 'mark',
  // (a babel name's: the number a class set right before a heading it sets itself, the wrap's `n<occ>.l` (own.mjs MR 6c),
  // a heading's number as a section's is: 2610.20967v1's "9. REFERENCES")
  name: 'head',
}

/** a group's TeX as its unit writes it: each piece's source in order (a text's characters, an element's source, a group's open,
 *  content and close, a nested unit's source around it) */
function texOf(list: readonly Piece[]): string {
  let out = ''
  for (const p of list)
    if (p.t === 'text') out += p.s
    else if (p.t === 'el') out += p.src
    else if (p.t === 'span') out += (p.open ?? '') + texOf(p.content) + (p.close ?? '')
    else out += p.pre + p.post
  return out
}

const mostOf = <T>(xs: Iterable<T>): T | undefined => {
  const n = new Map<T, number>()
  let best: T | undefined
  let k = 0
  for (const x of xs) {
    const c = (n.get(x) ?? 0) + 1
    n.set(x, c)
    if (c > k) {
      k = c
      best = x
    }
  }
  return best
}

export function locate(ins: Instrument, inkA: Doc, m: Mapping, o: LocateOptions = {}): Located {
  const w = open(ins, inkA, m)
  const {
    B,
    NB,
    unitB,
    roleB,
    pieceB,
    pageB,
    placeSpan,
    emptyPiece,
    outsidePiece,
    pageA,
    gA,
    gB,
    atA,
    setA,
    fixedFaces,
    framesA,
  } = w.ix
  const { claimedA, units, members, stats, jointPiece, displays, floatLines } = w
  /** A's boxes ([page, index]) as rows.ts takes them */
  const boxesOf_ = (l: readonly [number, number][]): RowBox[] =>
    l.map(([ap, ai]) => {
      const b = inkA.pages[ap - 1]!.boxes
      return { page: ap, x0: b[4 * ai]!, y0: b[4 * ai + 1]!, x1: b[4 * ai + 2]!, y1: b[4 * ai + 3]! }
    })
  // (each B glyph's region by B's brackets, stream.mjs regionsOf's: a float's depth, a column's body or not; read once a page)
  const regionsB = new Map<number, Int32Array>()
  const regionB = (b: number): number => {
    const p = (pageB[b] as number) - 1
    let r = regionsB.get(p)
    if (!r) {
      const pg = B.pages[p]!
      r = regionsOf({ glyphs: { n: pg.glyphs.length }, boxes: pg.boxes, points: pg.points }).glyph as Int32Array
      regionsB.set(p, r)
    }
    return r[b - (m.offB[p] as number)] as number
  }
  // (each unit's \baselineskip where its paragraph ends, LINES_TEX's AXT-LINES: its members' lead)
  const texSkip = new Map((ins.tex.skips ?? []).map((k) => [k.unit, k.baselineskip]))
  const noteUnlocated = (c: string) => {
    stats.unlocated[c] = (stats.unlocated[c] ?? 0) + 1
  }
  placeUnits(w)
  const released = field(w, 'released')

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
        if (a < 0 || (claimedA[a] as number) !== FREE || pageA[a] !== pageA[end]) continue
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
        if (a < 0 || (claimedA[a] as number) !== FREE || pageA[a] !== pageA[end]) continue
        const g = gA(a)
        // (on the member's last line alone: another row before the call, an e-mail a block sets under its place, is no trail)
        if (isInk(g) && g.top > last.bottom && g.bottom < last.top) trail.push(a)
        continue
      }
      const a = m.bToA[b] as number
      if (a < 0 || (claimedA[a] as number) !== FREE || pageA[a] !== pageA[end]) break
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
    for (const a of trail) claimedA[a] = mem.ord
    mem.els.set(TRAIL, trail)
    if (sep !== undefined) trailSep.set(mem.ord, sep)
  }

  // ---- artefacts (Rule 1, the owner's ruling of 2026-11-10, PDF-READER §18.22): a unit whose text is set wholly in a face of one
  // pitch, a typewriter's, is an artefact the paper presents exactly (code, a command, a prompt, JSON, an identifier, an OCR or
  // a model's sample): kept as the original, never translated, as a code environment's lines are (its unit kept, its member
  // fixed); a figure text so set too (ink.ts). Unless the paper's own body face, the face most of its source units' text glyphs
  // are set in, is one of one pitch: a paper typeset in a typewriter face is translated as any. The pitch is read off the
  // document's glyphs (facts.ts fixedFacesOf), never a face's name, a macro's or the font's FixedPitch flag. A unit holding a
  // word of another face (a line of prose naming a function) is none
  const bodyFace = (() => {
    const n = new Map<string, number>()
    for (const mem of members) {
      if (!mem.located || mem.unit < 0 || mem.figure || mem.name !== undefined) continue
      for (const a of mem.text) {
        const g = gA(a)
        if (!isInk(g) || !/\S/.test(g.u)) continue
        const f = g.font.replace(/^[A-Z]{6}\+/, '')
        n.set(f, (n.get(f) ?? 0) + 1)
      }
    }
    let best = '',
      most = 0
    for (const [f, c] of n)
      if (c > most) {
        most = c
        best = f
      }
    return best
  })()
  const bodyFixed = fixedFaces.has(bodyFace)
  const artefacts = !bodyFixed
  const fixedFace = (font: string) => fixedFaces.has(font.replace(/^[A-Z]{6}\+/, ''))
  const artefact = (text: readonly number[], turned: readonly [number, number][] = []): boolean => {
    if (!artefacts) return false
    let any = false
    for (const a of text) {
      const g = gA(a)
      if (!isInk(g) || !/\S/.test(g.u)) continue
      if (!fixedFace(g.font)) return false
      any = true
    }
    for (const [p, j] of turned) {
      const t = inkA.pages[p - 1]?.turned?.[j]
      if (!t || !/\S/.test(t.u)) continue
      if (!fixedFaces.has(t.base)) return false
      any = true
    }
    return any
  }
  // (a figure's word set in another face inside a line of code is that line's: figure-lines.ts reads a line every word of which
  // stands between glyphs of one pitch as code, kept whole (Rule 1's inside-a-line read on the line, PDF-READER §18.26:
  // 2411.13093v4 p19's "attractions" in Georgia inside its Consolas line); a figure text is kept here where it is set wholly in
  // such a face)
  const figureArtefact = (text: readonly number[], turned: readonly [number, number][]): boolean =>
    artefact(text, turned)
  stats.artefacts = { units: 0, bodyFixed }
  for (const mem of members) {
    if (!mem.located || mem.fixed || mem.unit < 0 || mem.figure || mem.name !== undefined) continue
    if (!artefact(mem.text)) continue
    units[mem.unit] = { ...units[mem.unit]!, kept: true, fixed: true, pitch: true }
    mem.fixed = true
    mem.kept = true
    stats.artefacts.units++
  }
  // (and read by group, as F0 reads a figure's line (figure-lines.ts): a group of a unit's that holds text of its own and whose
  // every glyph is set in a face of one pitch is one element `code`, the original's ink, never sent, the rest of its unit
  // translated. 2608.25210v2's `\mypython{…}` prompt box was kept on p2, a unit of its own after a blank line, and translated on
  // p3, where its source sets it right after its lead line in one paragraph: one rule for the box, wherever its source's blank
  // lines fall. The outermost such group, one element, never one inside another. Its glyphs: its letters as the unit's groups'
  // are matched to A's glyphs (group-style.ts), the text between them, the marks at its ends its own text writes, and its
  // elements' ink. TeX set it on lines of its own (a vertical box: no other ink of the unit's shares a line with it), its rows
  // stay where TeX set them, in their own measure and frame, as a display's do (`ownRows`, class `display`); else it stands on
  // its line, drawn as its ink, F0's class (`other`, literal, its copy its glyphs' text). A unit placed more than once (a babel
  // name's occurrences) is read so nowhere: one content serves every placement)
  /** the groups of a unit (placed once, by `mem`) Rule 1 makes elements of: the outermost that hold text of their own whose every
   *  glyph is set in a face of one pitch, each with its text glyphs on A (global) and the ids of the elements inside it */
  const pitchGroupsOf = (
    unit: InstrumentUnit,
    mem: Member,
  ): { span: Extract<Piece, { t: 'span' }>; text: number[]; nested: string[] }[] => {
    const classOf = new Map(unit.classes ?? [])
    const textGs = [...mem.text].sort((x, y) => x - y)
    const { groups: letters, all: matched } = groupLettersOf(
      unit.content,
      textGs.map(gA),
      (el) => classOf.get(el.id)?.text,
    )
    const lettered = new Set(matched.map((q) => textGs[q] as number))
    // (the member's stream: its text glyphs and its elements' (by piece id), in order)
    const elOf = new Map<number, string>()
    for (const [id, l] of mem.els) for (const a of l) elOf.set(a, id)
    const stream = [...textGs, ...elOf.keys()].sort((x, y) => x - y)
    const at = new Map(stream.map((a, q) => [a, q]))
    const elsIn = (list: readonly Piece[]): string[] =>
      list.flatMap((p) => (p.t === 'el' ? [p.id] : p.t === 'span' ? elsIn(p.content) : []))
    const holdsUnit = (list: readonly Piece[]): boolean =>
      list.some((p) => p.t === 'unit' || (p.t === 'span' && holdsUnit(p.content)))
    // (the marks its own text writes before its first letter or inked element and after its last: white space aside)
    const edgesOf = (list: readonly Piece[]): { head: string; tail: string } => {
      const seq: (string | null)[] = []
      const walk = (ps: readonly Piece[]) => {
        for (const p of ps)
          if (p.t === 'span') walk(p.content)
          else if (p.t === 'text') for (const ch of p.s) seq.push(/[\p{L}\p{N}]/u.test(ch) ? null : ch)
          else if (p.t === 'el' && ((mem.els.get(p.id)?.length ?? 0) > 0 || classOf.get(p.id)?.text)) seq.push(null)
      }
      walk(list)
      const first = seq.indexOf(null),
        last = seq.lastIndexOf(null)
      const marks = (xs: (string | null)[]) => xs.filter((c): c is string => c !== null && /\S/u.test(c)).join('')
      return first < 0 ? { head: '', tail: '' } : { head: marks(seq.slice(0, first)), tail: marks(seq.slice(last + 1)) }
    }
    const spells = (a: number, ch: string) => gA(a).u.normalize('NFKC') === ch.normalize('NFKC')
    const judge = (span: Extract<Piece, { t: 'span' }>) => {
      const L = letters.get(span.id)
      if (!L?.length || holdsUnit(span.content)) return null
      const nested = elsIn(span.content)
      const mine = new Set(nested)
      const nestedGs = nested.flatMap((id) => mem.els.get(id) ?? [])
      let lo = Math.min(textGs[L[0] as number] as number, ...nestedGs)
      let hi = Math.max(textGs[L.at(-1) as number] as number, ...nestedGs)
      // (its end marks: the text glyphs beside its extent that spell them, none another element's or a matched letter)
      const { head, tail } = edgesOf(span.content)
      const grow = (from: number, step: 1 | -1, marks: string) => {
        let k = step > 0 ? 0 : marks.length - 1
        let q = (at.get(from) as number) + step
        let end = from
        while (k >= 0 && k < marks.length && q >= 0 && q < stream.length) {
          const a = stream[q] as number
          const g = gA(a)
          if (elOf.has(a) || lettered.has(a)) break
          if (isInk(g) && /\S/u.test(g.u)) {
            if (!spells(a, marks[k] as string)) break
            k += step
            end = a
          }
          q += step
        }
        return end
      }
      lo = grow(lo, -1, head)
      hi = grow(hi, 1, tail)
      // (no other element's ink inside it)
      for (let q = at.get(lo) as number; q <= (at.get(hi) as number); q++) {
        const id = elOf.get(stream[q] as number)
        if (id !== undefined && !mine.has(id)) return null
      }
      const text = textGs.filter((a) => a >= lo && a <= hi)
      for (const a of [...text, ...nestedGs]) {
        const g = gA(a)
        if (isInk(g) && /\S/u.test(g.u) && !fixedFace(g.font)) return null
      }
      return { span, text, nested }
    }
    const out: { span: Extract<Piece, { t: 'span' }>; text: number[]; nested: string[] }[] = []
    const visit = (list: readonly Piece[]) => {
      for (const p of list) {
        if (p.t !== 'span') continue
        const x = judge(p)
        if (x) out.push(x)
        else visit(p.content)
      }
    }
    visit(unit.content)
    return out
  }
  if (artefacts) {
    const placements = new Map<number, number>()
    for (const mem of members) if (mem.unit >= 0) placements.set(mem.unit, (placements.get(mem.unit) ?? 0) + 1)
    for (const mem of members) {
      if (!mem.located || mem.fixed || mem.unit < 0 || mem.figure || mem.name !== undefined) continue
      if (placements.get(mem.unit) !== 1) continue
      const unit = units[mem.unit]!
      if (unit.kept || unit.fixed || !unit.content.some((p) => p.t === 'span')) continue
      // (a unit no glyph of whose text is set in a face of one pitch holds no such group: its letters are not aligned)
      if (
        !mem.text.some((a) => {
          const g = gA(a)
          return isInk(g) && /\S/u.test(g.u) && fixedFace(g.font)
        })
      )
        continue
      stats.artefacts.read = (stats.artefacts.read ?? 0) + 1
      const made = pitchGroupsOf(unit, mem)
      if (!made.length) continue
      const at = new Map(made.map((x) => [x.span.id, x]))
      const swap = (list: readonly Piece[]): Piece[] =>
        list.map((p): Piece => {
          if (p.t !== 'span') return p
          return at.has(p.id)
            ? { t: 'el', id: p.id, kind: 'code', src: texOf([p]) }
            : { ...p, content: swap(p.content) }
        })
      const content = swap(unit.content)
      const gone = new Set(made.flatMap((x) => x.nested))
      const taken = new Set(made.flatMap((x) => x.text))
      mem.text = mem.text.filter((a) => !taken.has(a))
      // (TeX's vertical box: no other ink of the unit's, its text or its other elements' (a display's aside, a block of its own),
      // shares a line with it)
      const others = [...mem.text, ...[...mem.els].flatMap(([id, l]) => (gone.has(id) ? [] : l))]
      const classes = (unit.classes ?? []).filter(([id]) => !gone.has(id))
      for (const x of made) {
        const own = [...x.text, ...x.nested.flatMap((id) => mem.els.get(id) ?? [])].sort((a, b) => a - b)
        const boxes = x.nested.flatMap((id) => mem.elBoxes.get(id) ?? [])
        const boxesB = x.nested.flatMap((id) => mem.elBoxesB.get(id) ?? [])
        for (const id of x.nested) {
          mem.els.delete(id)
          mem.elBoxes.delete(id)
          mem.elBoxesB.delete(id)
        }
        mem.els.set(x.span.id, own)
        if (boxes.length) {
          mem.elBoxes.set(x.span.id, boxes)
          mem.elBoxesB.set(x.span.id, boxesB)
        }
        const mine = new Set(own)
        const shares = cutLines(
          [...others.filter((a) => !mine.has(a)), ...own].sort((a, b) => a - b),
          atA,
        ).some((l) => l.gs.some((a) => mine.has(a)) && l.gs.some((a) => !mine.has(a)))
        const copy = textOf(own.map(gA))
        if (!shares) {
          mem.ownRows ??= new Set()
          mem.ownRows.add(x.span.id)
          classes.push([x.span.id, { cls: 'display', copy }])
        } else classes.push([x.span.id, { cls: 'other', literal: true, copy }])
      }
      const { classes: _was, ...rest } = unit
      void _was
      units[mem.unit] = {
        ...rest,
        id: unitId(unit.kind, content),
        content,
        ...(classes.length ? { classes } : {}),
        keptEls: [...(unit.keptEls ?? []), ...made.map((x): [string, 'pitch'] => [x.span.id, 'pitch'])],
      }
      mem.id = units[mem.unit]!.id
      stats.artefacts.groups = (stats.artefacts.groups ?? 0) + made.length
    }
  }

  // ---- the units no source unit is, made on A by today's rule (ink.ts): from A's glyphs no source unit owns after the transfer,
  // those B never printed among them but arXiv's ink (on a page our compile sets, a glyph it never printed: no figure glyph,
  // none born); each a member as an instrument's unit is, its ink A's own (`same`), its span on B its glyphs' partners' (a
  // paragraph end of TeX's between two of them tells their flows apart, as it tells a source unit's)
  if (o.pages) {
    const owned = (a: number) => {
      const c = claimedA[a] as number
      const b = m.aToB[a] as number
      return c >= 0 || c === HELD || (b >= 0 && (unitB[b] as number) >= 0 && !released.has(unitB[b] as number))
    }
    // (the source unit a glyph of A is: its member's claim, else its partner's owner on B)
    const ownerOf = (a: number) => {
      const c = claimedA[a] as number
      if (c >= 0) return members[c]!.unit
      const b = m.aToB[a] as number
      return b >= 0 ? (unitB[b] as number) : -1
    }
    const {
      made,
      stats: st,
      block,
      displays: dl,
      floatLines: fl,
    } = inkOf({
      ins,
      inkA,
      raws: o.pages,
      take: o.take === true,
      m,
      pageA,
      owned,
      setA,
      classesOf: o.classesOf,
      ownerOf,
      artefact: figureArtefact,
      fixed: artefacts ? fixedFaces : null,
    })
    displays.push(...dl)
    floatLines.push(...fl)
    // (a unit of the author block TeX sets away from the block under the title — acmart's reference format, amsart's addresses
    // at the paper's end — is the text it is there, of no toggle: `textnames` (the owner's ruling of 2026-11-09). One set in the
    // block keeps its kind; where no title is located, none is told apart)
    if (block)
      for (const mem of members) {
        if (!mem.located || !AUTHOR_KINDS.has(mem.kind) || !mem.text.length) continue
        if (!mem.text.some((a) => pageA[a] === block.page + 1 && block.within(a - (m.offA[block.page] as number))))
          mem.kind = TEXT_NAMES
      }
    for (const x of made) {
      const u = units.length
      units.push(x.unit)
      if (x.els) for (const id of piecesOf(x.unit.content).keys()) if (!x.els.has(id)) jointPiece.add(`${u}|${id}`)
      const mem = empty(w, u, x.unit.kind, x.unit.id)
      mem.fixed = !!x.unit.fixed
      mem.kept = !!x.unit.kept
      mem.figure = !!x.unit.figure
      if (x.unit.figure?.dir) mem.dir = x.unit.figure.dir
      mem.align = x.unit.align ?? 'j'
      // (a figure text's own text on A, which S.figures tells a translation that says nothing else by: Placed.plain; its groups'
      // text with the rest. Its runs in another face, each group's style its glyphs': the part's SpanAt.style)
      // (a figure text with an element, F0's line: none, and the paragraph path lays it, its elements carried as their ink; a
      // paragraph and an item with its label, F3's: none either)
      if (x.unit.figure && !x.unit.content.some((q) => q.t === 'el') && !x.unit.figure.para && !x.label?.length)
        mem.plain = sourceText(x.unit.content)
      if (x.spanStyles) mem.spanStyles = x.spanStyles
      members.push(mem)
      if (!x.text.length && !x.ph.length && !x.turned.length) {
        mem.cause = 'no ink'
        continue
      }
      // (a glyph B never printed between two of its own that B printed is text arXiv's page sets inside the unit and our compile
      // does not, 2610.21084v1's initials: a content difference, and the unit stays the original's, as a source unit does (no
      // fuzzy rescue), those glyphs A's ink (HELD), no unit born of them; a line-end hyphen A breaks at is none, nor an included
      // figure's glyph inside it)
      const mine = [...x.text, ...(x.label ?? []), ...x.ph].sort((p, q) => p - q)
      const aOnly: number[] = []
      eachBetweenPaired(
        0,
        mine.length - 1,
        (i) => (m.aToB[mine[i] as number] as number) >= 0,
        (i, pv, nx) => {
          const a = mine[i] as number
          if (m.offpageA[a] || m.hunkA[a] === HUNK.hyphen) return
          if (gA(a).form && !gA(mine[pv] as number).form && !gA(mine[nx] as number).form) return
          aOnly.push(a)
        },
      )
      if (aOnly.length) {
        const h = hunkName(m.hunkA[aOnly[0] as number] as number)
        mem.cause = `content difference: ${h === 'none' ? 'aonly' : h}`
        for (const a of aOnly) claimedA[a] = HELD
        continue
      }
      mem.located = true
      mem.place = 'same'
      mem.text = x.text
      // (its label, the mark its text does not say (an affiliation's raised number, a note's mark): a label as a source unit's,
      // its group `.l`, stated with its ink and the line it stands on below)
      mem.label = x.label ?? []
      for (const [id, e] of x.els ?? []) {
        if (e.glyphs.length)
          mem.els.set(
            id,
            [...e.glyphs].sort((p, q) => p - q),
          )
        if (e.boxes.length) mem.elBoxes.set(id, e.boxes)
      }
      mem.turned = x.turned
      mem.textBoxes = x.textBoxes
      for (const a of mine) {
        claimedA[a] = mem.ord
        const b = m.aToB[a] as number
        if (b < 0) continue
        if (mem.bFirst < 0 || b < mem.bFirst) mem.bFirst = b
        if (b > mem.bLast) mem.bLast = b
      }
    }
    stats.made = st
  }

  // ---- the units born on A, from the glyphs B never printed
  const born = new Map<number, { kind: string; content: Piece[] }>()
  for (const b of bornOf(inkA, m, claimedA, pageA, setA)) {
    const mem = empty(w, -1, b.kind, unitId(b.kind, b.content))
    mem.located = true
    // (text inside an included figure, a form XObject: a figure's text, which the wrap writes in its form, as today's figure units)
    mem.figure = b.kind === 'inkfigures'
    mem.text = b.glyphs
    for (const a of b.glyphs) claimedA[a] = mem.ord
    born.set(mem.ord, { kind: b.kind, content: b.content })
    members.push(mem)
    stats.born++
    stats.bornGlyphs += b.glyphs.length
  }

  // ---- geometry: lines, columns and measures, elements, labels, style, lead, room
  for (const mem of members) {
    if (!mem.located && !mem.text.length) continue
    const unit = mem.unit >= 0 ? units[mem.unit]! : null
    const pieces = unit ? piecesOf(unit.content) : new Map<string, Piece>()
    const kindOf = (id: string) => (pieces.get(id) as { kind?: string } | undefined)?.kind ?? 'other'
    // (an element whose rows stay where TeX set them: a display, and a group of one pitch TeX set on lines of its own)
    const rowsKept = (id: string) => kindOf(id) === 'display' || !!mem.ownRows?.has(id)
    const classOf = new Map(unit?.classes ?? [])
    // (an element whose ink stands apart from the unit's text lines: outside the unit (B11 OUTSIDE), kept where it stands
    // and no line of the unit's)
    const textCut = cutLines(
      [...mem.text].sort((x, y) => x - y),
      atA,
    )
    const outside = new Set<string>()
    if (textCut.length)
      for (const [id, l] of mem.els)
        if (
          !rowsKept(id) &&
          l.length &&
          // (beside its text lines: within two sizes over their first and under their last on a page, a line of formulas alone at
          // its end or a script between two of them; outside, only ink apart from all of them: a mark set in a margin, a float)
          l.every((a) => {
            const g = gA(a)
            const on = textCut.filter((t) => t.page === pageA[a])
            return (
              !on.length ||
              g.y > Math.max(...on.map((t) => t.top)) + 2 * g.size ||
              g.y < Math.min(...on.map((t) => t.bottom)) - 2 * g.size
            )
          })
        )
          outside.add(id)
    const inline: number[] = [...mem.text]
    for (const [id, l] of mem.els) if (!rowsKept(id) && !outside.has(id)) inline.push(...l)
    inline.sort((x, y) => x - y)
    const cut = cutLines(inline, atA)
    // (the lines whose ink stays, KEPT, in their place in the stream: a display's rows; and a held line, the glyphs inside its
    // span on A that B printed and no unit owns: the lines its source does not write (B17; today's heldOf MAKE:1855 read them
    // by the source's words, under a 0.2 share: ownership says it))
    // (a display's rows by rows.ts: its ink's bands joined where its glyphs interleave in the stream, never the text line rule,
    // which cuts a row's stacked parts apart)
    const kept: CutLine[] = []
    const displayRows = new Map<string, CutLine[]>()
    for (const [id, l] of mem.els)
      if (rowsKept(id)) {
        const rows = rowsOf(l, atA, boxesOf_(mem.elBoxes.get(id) ?? []))
        displayRows.set(id, rows)
        kept.push(...rows)
      }
    if (inline.length && unit) {
      const own = [...inline, ...mem.label].sort((x, y) => x - y)
      // (within its own lines' extent on each page: a page's furniture, a float the stream passes between two of its lines
      // on another part of the page, are none of its)
      const box = new Map<number, [number, number, number, number]>()
      for (const l of cut) {
        const q = box.get(l.page)
        box.set(
          l.page,
          q
            ? [Math.min(q[0], l.x0), Math.min(q[1], l.bottom), Math.max(q[2], l.x1), Math.max(q[3], l.top)]
            : [l.x0, l.bottom, l.x1, l.top],
        )
      }
      const held: number[] = []
      // (a float TeX set inside the paragraph, between two of its lines, is none of its held lines: a glyph in another float depth
      // than the unit's text by B's brackets, or, where B brackets none, drawn inside a form XObject where its text is not (L1's
      // second held-line fault, 2610.10492v1 ord 21: a float's glyphs no unit owns read as the paragraph's KEPT lines))
      const firstText = mem.text.length ? (mem.text[0] as number) : -1
      const textB = firstText >= 0 ? (m.aToB[firstText] as number) : -1
      const depthOf = (b: number) => regionB(b) >> 1
      const textDepth = textB >= 0 ? depthOf(textB) : 0
      const textForm = firstText >= 0 && !!gA(firstText).form
      for (let a = own[0] as number; a <= (own.at(-1) as number); a++) {
        const b = m.aToB[a] as number
        if ((claimedA[a] as number) >= 0 || b < 0 || (unitB[b] as number) >= 0) continue
        if (depthOf(b) !== textDepth || (!textForm && gA(a).form)) continue
        const g = gA(a)
        const q = box.get(pageA[a] as number)
        // (a glyph that stands on one of its own text lines (the line rule's band, within the line's extent) is none of a held
        // line's: ink in no group on the unit's line, never a KEPT line over it)
        const onOwn = cut.some(
          (l) =>
            l.page === pageA[a] &&
            Math.abs(g.y - l.base) < 0.5 * Math.max(l.size, g.size) &&
            g.x1 > l.x0 &&
            g.x0 < l.x1,
        )
        if (q && !onOwn && isInk(g) && g.y >= q[1] && g.y <= q[3] && g.x1 > q[0] && g.x0 < q[2]) held.push(a)
      }
      kept.push(...cutLines(held, atA))
    }
    const all = [...cut.map((l) => ({ l, kept: false })), ...kept.map((l) => ({ l, kept: true }))].sort(
      (x, y) => (x.l.gs[0] as number) - (y.l.gs[0] as number),
    )
    mem.lines = all.map(
      ({ l, kept: k }) =>
        [
          l.page,
          0,
          r2(l.x0),
          r2(l.x1),
          l.base,
          r2(l.top),
          r2(l.bottom),
          r2(l.x0),
          r2(l.x1),
          k ? 1 : 0,
          lineSize(l.gs.map(gA)),
        ] as Line,
    )
    mem.lineGlyphs = all.map(({ l }) => l.gs)
    // (a run set turned: its band's box on the page, from its first glyph's origin to its last one's end, its descent to its
    // ascent across; its baseline the first glyph's origin's height)
    if (mem.turned.length) {
      const byPage = new Map<number, number[]>()
      for (const [ap, aj] of mem.turned) (byPage.get(ap) ?? byPage.set(ap, []).get(ap)!).push(aj)
      for (const [ap, js] of byPage) {
        const T = inkA.pages[ap - 1]!.turned!
        let x0 = Number.POSITIVE_INFINITY
        let x1 = Number.NEGATIVE_INFINITY
        let y0 = Number.POSITIVE_INFINITY
        let y1 = Number.NEGATIVE_INFINITY
        for (const j of js) {
          const t = T[j]!
          for (const [x, y] of [
            [t.ox, t.oy],
            [t.ex, t.ey],
          ] as const)
            for (const e of [t.ascent, t.descent]) {
              const X = x - t.uy * e * t.size
              const Y = y + t.ux * e * t.size
              x0 = Math.min(x0, X)
              x1 = Math.max(x1, X)
              y0 = Math.min(y0, Y)
              y1 = Math.max(y1, Y)
            }
        }
        const first = T[js[0]!]!
        mem.lines.push([ap, 0, r2(x0), r2(x1), r2(first.oy), r2(y1), r2(y0), r2(x0), r2(x1), 0])
      }
    }
    // (the pages it has ink of its own on, which a group of its holds: a KEPT line's page alone is none of them)
    mem.pages = [...new Set(mem.lines.filter((l) => !(l[9] & 1)).map((l) => l[0]))]
    // style: TeX's font state is not stated by today's instrument: read off all of its own glyphs on A, level and turned, as
    // today's reader reads it (facts.ts styleOf: the role, weight and slant of its fonts' names, the size, fill and design; stage
    // 1b states it). A figure text set turned has its glyphs in `turned` alone: their font, size and fill are its style, as
    // today's figure texts take their turned glyphs' font (layout/figure-text.mjs); read off its level glyphs alone, a bold
    // axis title was the default serif (35 lines on 11 pages of the parity's pairs)
    // (its size today's reader's: the median of its text glyphs' sizes, up the line (TeX's, its font expansion aside), math
    // fonts aside, facts.ts unitSize; where it has none, the most common size of its glyphs, `read` 'size:lines': today then
    // reads it off its lines' bands)
    const own: StyleGlyph[] = [
      ...mem.text.map(gA),
      ...mem.turned.map(([ap, aj]) => turnedStyleGlyph(inkA.pages[ap - 1]!.turned![aj]!)),
    ]
    const txt = own.filter((g) => /\S/.test(g.u))
    // (its source's text: a babel name's none, its key (`ref`) being no text of it (\refname's is the class's: IEEEtran's
    // "REFERENCES" in faked small capitals, read against `ref` as capitals at the small capitals' size: 32 names of 14 papers of
    // the corpus))
    const source = unit && unit.name === undefined ? sourceText(unit.content) : null
    // (its faked small capitals aside, as today's originalStyle reads its size: smallCapsOf's, facts.ts fakedCaps; their share
    // Style.sc, and whether its text is set in them, today's vote, Style.caps)
    const caps = fakedCaps(txt, source, mem.kind.startsWith('ink'))
    const read = unitSize(caps.small.size ? txt.filter((g) => !caps.small.has(g)) : txt)
    const size = read ?? mostOf(txt.map((g) => r2(g.size))) ?? 10
    if (read === undefined && mem.lines.length) mem.read.push('size:lines')
    // (in the text's capitals by fakedCaps' `upper`: a faked small capital is no case change; an ink unit's by its capitals' share)
    const { upper: _upper, ...read0 } = styleOf(own, size, source)
    void _upper
    mem.style = {
      ...read0,
      size,
      ...(caps.upper ? { upper: 1 as const } : {}),
      ...(caps.ratio !== undefined ? { sc: caps.ratio } : {}),
      ...(caps.caps ? { caps: 1 as const } : {}),
    }
    // (the fill and the face TeX set its text in, group by group (group-style.ts): a group's fill where it is not the fill
    // around it, a link's that hyperref colours, and the face of a group whose command names none where it is not the face
    // around it, stated for the typesetter to draw its translation in; and where a group or a switch's run is set apart so,
    // the unit's own fill, slant and weight are its own text's, not those most of all its glyphs hold, which a link or an
    // \emph holding most of its letters makes theirs)
    const colourSwitch = (el: Extract<Piece, { t: 'el' }>) => classOf.get(el.id)?.colour !== undefined
    const faceSwitch = (el: Extract<Piece, { t: 'el' }>) => {
      const c = classOf.get(el.id)
      return !!c?.bare && !!c.cmd && namesFace(commandStyleOf(`\\${c.cmd}`))
    }
    const switches = (el: Extract<Piece, { t: 'el' }>) => colourSwitch(el) || faceSwitch(el)
    // (not a figure text's: its groups are its runs of glyphs in another face than its own, which is the face of most of its
    // glyphs by their definition (ink.ts figureRuns), its text in its run's order, not its glyphs' stream order: read again in
    // the stream's, 2610.37668v1's "PSNR 33.42 dB" took its italic run's face for its own)
    if (unit && !mem.figure && !unit.figure && mem.text.length && hasScopes(unit.content, switches)) {
      const g = groupStyleOf(
        unit.content,
        [...mem.text].sort((x, y) => x - y).map(gA),
        (el) => classOf.get(el.id)?.text,
        colourSwitch,
        faceSwitch,
      )
      if (g.fill.groups.length) mem.spanFills = g.fill.groups
      if (g.fill.apart && g.fill.own !== undefined) {
        if (g.fill.own > 0) mem.style.fill = g.fill.own
        else delete mem.style.fill
      }
      if (g.face.groups.length) mem.spanFaces = g.face.groups
      if (g.face.apart && g.face.own) {
        if (g.face.own.bold) mem.style.bold = 1
        else delete mem.style.bold
        if (!g.face.own.italic) delete mem.style.slant
        else mem.style.slant ??= 1
      }
    }
    // (a babel name's own text, its counter aside: S.names leaves it the original's where the target's word is it already, and
    // sets the counter after the target's word)
    if (mem.name !== undefined) {
      const ctr = new Set(mem.counterA ?? [])
      mem.plain = textOf(mem.text.filter((a) => !ctr.has(a)).map(gA))
      const cs = [...ctr].map(gA).filter(isInk)
      if (cs.length && cs.length < mem.text.length)
        mem.counter = [
          textOf(cs),
          [
            pageA[mem.counterA![0] as number] as number,
            r2(Math.min(...cs.map((g) => g.x0))),
            r2(Math.min(...cs.map((g) => g.bottom))),
            r2(Math.max(...cs.map((g) => g.x1))),
            r2(Math.max(...cs.map((g) => g.top))),
            r2(cs[0]!.y),
          ],
        ]
    }
    // the lead: TeX's \baselineskip where its paragraph states it (LINES_TEX's AXT-LINES, as the paragraph ends: the one TeX
    // appended its lines at), the pitch TeX set its lines at, which TeX's \lineskip rule only widens, under a line too tall for
    // it, never narrows; else (read) the pitch of its lines, where it has two on one page, else its size's, today's rule. A gap
    // the \lineskip rule opened is no pitch of the paragraph: read as one (2602.23285v2 p4 t29, gaps 10.96 and 12.24, read
    // 12.24), a translation that set the tall line elsewhere had that gap added to the push its own tall line took. A
    // paragraph whose lines stand nearer than the \baselineskip stated was not set at it (a negative skip after a forced
    // break, a part of it set before a display under another): read
    const pitches: number[] = []
    for (let q = 1; q < cut.length; q++)
      if (cut[q]!.page === cut[q - 1]!.page) {
        const d = cut[q - 1]!.base - cut[q]!.base
        if (d > 0 && d < 3 * size) pitches.push(r2(d))
      }
    const skip = mem.unit >= 0 && mem.name === undefined ? texSkip.get(mem.unit) : undefined
    const stated = skip !== undefined && skip > 0 && pitches.every((d) => d >= skip - ON_BASE)
    if (mem.lines.length) mem.read.push(...(stated ? ['style'] : ['style', 'lead']))
    pitches.sort((x, y) => x - y)
    // (a stated pitch to a thousandth: it is laid line after line, and 12 pt, 11.9552 PDF units, written 11.96 drifts 0.005 a line)
    mem.lead = stated
      ? Math.round(skip * 1000) / 1000
      : pitches.length
        ? (pitches[Math.floor(pitches.length / 2)] as number)
        : r2(1.2 * size)
    // elements: each one's own ink, one box per line of TeX's it stands on (its glyphs and its rules)
    const unitText = unit ? sourceText(unit.content) : ''
    // (the line of the unit's own each of its glyphs was cut into, its KEPT lines aside: the line TeX set it on)
    const lineOfA = new Map<number, number>()
    mem.lineGlyphs.forEach((gs, j) => {
      if (!((mem.lines[j] as Line)[9] & 1)) for (const a of gs) lineOfA.set(a, j)
    })
    for (const [id, p0] of pieces) {
      if (p0.t !== 'el' && p0.t !== 'unit') continue
      const gl = mem.els.get(id) ?? []
      // (a nested unit, a footnote set inside the unit: its mark, the glyphs TeX set for it in the unit's text, an element of
      // the unit's as today's placeholdersOf reads it (L2:1066, a footnote mark); one B gives none an element of no ink, so that
      // the part says which of the unit's pieces are its nested units: the instrument's class `nested`)
      const p = p0.t === 'unit' ? { kind: 'note-mark' } : p0
      const bx = mem.elBoxes.get(id) ?? []
      const bxB = mem.elBoxesB.get(id) ?? []
      // (its glyphs by line of TeX's, each line's box of its own ink: across its glyphs' advances and their outlines (an italic
      // glyph's overhang past its advance is its ink), top to bottom, on that line's baseline. As today's file's segment of a
      // piece (layout/stream.mjs: the piece's own ink, on its line's baseline), which the typesetter crops. An element in the
      // unit's text stands on the unit's lines, each glyph on the line the unit's text was cut into: an overline's nucleus, a
      // fraction's denominator back under its numerator, a big delimiter, a script are their line's whatever their own baselines
      // (today's file: both its points on one line of the unit, the whole piece one segment of that line's, make.mjs), and one
      // TeX broke over lines has a box on each. Cut alone, a fraction's denominator, which runs back left under its numerator,
      // read as a line of its own (2608.06701v1 p8's 2×|LCS(X,Y)| / (|X|+|Y|), set as two crops side by side). One outside the
      // unit's lines (a mark in a margin, kept where it stands) is cut into lines of its own, each on the baseline of the unit's
      // line it stands on where it stands on one, else its own. A display's rows are its own lines)
      const onLine = (page: number, lo: number, hi: number, own: number) => {
        const j = standsOn(mem.lines, page, lo, hi, own)
        return j >= 0 ? (mem.lines[j] as Line)[4] : own
      }
      // (its glyphs that are ink, whatever their Unicode (isInk): a big delimiter PDF.js reads as a blank, 2610.30034v1 p4 t60's
      // \big\} (CMEX10's code 9, U+0009), is the element's ink, its group erases it and its box draws it again)
      const shown = gl.filter((a) => isInk(gA(a)))
      const groups: number[][] = []
      const ink: Ink[] = []
      /** each of the unit's lines its box, by the line's index */
      const byLine = new Map<number, number>()
      const boxOfGlyphs = (gs: readonly number[], base: number): Ink => {
        const g = gs.map(gA)
        const outlined = g.filter((x) => x.ix1 > x.ix0)
        return [
          pageA[gs[0] as number] as number,
          r2(Math.min(...g.map((x) => x.x0), ...outlined.map((x) => x.ix0))),
          r2(Math.min(...g.map((x) => x.bottom))),
          r2(Math.max(...g.map((x) => x.x1), ...outlined.map((x) => x.ix1))),
          r2(Math.max(...g.map((x) => x.top))),
          base,
        ]
      }
      if (rowsKept(id))
        for (const l of displayRows.get(id) ?? []) {
          groups.push(l.gs)
          ink.push([l.page, r2(l.x0), r2(l.bottom), r2(l.x1), r2(l.top), l.base])
        }
      else if (shown.length && shown.every((a) => lineOfA.has(a))) {
        for (const a of shown) {
          const j = lineOfA.get(a) as number
          const q = byLine.get(j)
          if (q === undefined) {
            byLine.set(j, groups.length)
            groups.push([a])
          } else groups[q]!.push(a)
        }
        for (const [j, q] of byLine) ink[q] = boxOfGlyphs(groups[q]!, (mem.lines[j] as Line)[4])
      } else
        for (const l of cutLines(gl, atA)) {
          groups.push(l.gs)
          ink.push(boxOfGlyphs(l.gs, onLine(l.page, l.bottom, l.top, l.base)))
        }
      // (its rules and images: each with the box of the line its neighbour in B's stream stands on, TeX shipping a rule among its
      // nucleus's glyphs (an overline's, a fraction's bar, a radical's), of its two neighbours the one nearer it where they stand on
      // two lines; a display's with the row whose band holds it (rows.ts: a row's band its boxes' too); one of an element with no
      // glyph on its page with the unit's line it stands on, where it stands on one, else a box of its own. Before, a rule joined
      // a line's box only within 0.5 pt of its ink, and an overline's, 1.03 to 1.24 pt over its nucleus, was a box of its own on
      // its own baseline, which the typesetter set after the formula as an underscore: 2610.10069v1 p10's "H = H ▁")
      const inkOfA = new Map<number, number>()
      groups.forEach((gs, q) => {
        for (const a of gs) inkOfA.set(a, q)
      })
      const onB = new Map<number, [number, number][]>()
      for (const a of shown) {
        const b = m.aToB[a] as number
        if (b < 0 || !inkOfA.has(a)) continue
        const pb = (pageB[b] as number) - 1
        ;(onB.get(pb) ?? onB.set(pb, []).get(pb)!).push([b, a])
      }
      for (const l of onB.values()) l.sort((x, y) => x[0] - y[0])
      bx.forEach(([ap, ai], q) => {
        const pg = inkA.pages[ap - 1]!
        const [x0, y0, x1, y1] = [
          pg.boxes[4 * ai]!,
          pg.boxes[4 * ai + 1]!,
          pg.boxes[4 * ai + 2]!,
          pg.boxes[4 * ai + 3]!,
        ]
        const cx = (x0 + x1) / 2
        const cy = (y0 + y1) / 2
        let k = -1
        if (rowsKept(id)) k = ink.findIndex((r) => r[0] === ap && cy >= r[2] && cy <= r[4])
        else {
          const [pb, xb] = bxB[q] ?? [-1, -1]
          const on = onB.get(pb) ?? []
          const at = B.pages[pb]?.boxAt ?? []
          const o = (m.offB[pb] as number) ?? 0
          // (the last of its glyphs TeX shipped before the box, and the first after it)
          let before: number | undefined
          let after: number | undefined
          for (const [b, a] of on) {
            if ((at[b - o] as number) <= xb) before = a
            else {
              after = a
              break
            }
          }
          const near = [before, after].filter((a): a is number => a !== undefined)
          const ks = [...new Set(near.map((a) => inkOfA.get(a) as number))]
          if (ks.length === 1) k = ks[0] as number
          else if (ks.length === 2) {
            const d = (a: number) => {
              const g = gA(a)
              return Math.hypot((g.x0 + g.x1) / 2 - cx, g.y - cy)
            }
            k = inkOfA.get(
              d(near[0] as number) <= d(near[1] as number) ? (near[0] as number) : (near[1] as number),
            ) as number
          } else {
            const j = standsOn(mem.lines, ap, y0, y1, y0)
            if (j >= 0 && byLine.has(j)) k = byLine.get(j) as number
            else if (j >= 0) {
              byLine.set(j, ink.length)
              ink.push([ap, r2(x0), r2(y0), r2(x1), r2(y1), (mem.lines[j] as Line)[4]])
              return
            }
          }
        }
        const hit = k >= 0 ? ink[k] : undefined
        if (hit) {
          hit[1] = r2(Math.min(hit[1], x0))
          hit[2] = r2(Math.min(hit[2], y0))
          hit[3] = r2(Math.max(hit[3], x1))
          hit[4] = r2(Math.max(hit[4], y1))
        } else ink.push([ap, r2(x0), r2(y0), r2(x1), r2(y1), r2(y0)])
      })
      const el: El = { kind: p.kind, ink }
      if (rowsKept(id) || outside.has(id)) el.keep = 1
      // (its text where every glyph's Unicode is a reading of it: none `nu`, A17; else the typesetter crops it, TEX:420. Read
      // as the page's text layer reads it, today's rendering (tex.mjs renderingOf over PDF.js's text content): a space between two
      // glyphs PDF.js's text content sets one between (facts.ts textOf). Stated where the typesetter may draw it as text: a
      // kind of text, a class drawn as the page's text (a citation, a reference, a macro: the instrument's), its own brackets
      // (U.brackets reads the text inside them), ink over lines (a formula broken over lines is drawn as text where its
      // segments make no crops))
      // (a line's end inside a word of its text, facts.ts lineEnd: decided by the source where it states the word, its own TeX
      // and its unit's text; a URL's or a code mark's text TeX sets as written, a hyphen a line of it ends in its own)
      // (a URL: a \url's, or a piece the instrument states sets one, PieceClass.url: a \urldef'd control sequence a macro shows)
      const isUrl = p.kind === 'url' || !!classOf.get(id)?.url
      const literal = !!classOf.get(id)?.literal || isUrl || p.kind === 'code'
      const copy0 = classOf.get(id)?.copy ?? ''
      const lineEnds = {
        literal,
        // (one word as written, its line's ends joins as its copy reads them (facts.ts LineEndOptions.oneWord, lane url-join): a
        // URL (urlCopyOf), or a literal mark whose copy, the source's reading, holds no white space)
        oneWord: isUrl || (literal && copy0 !== '' && !/\s/u.test(copy0)),
        source: [p0.t === 'el' ? p0.src : '', copy0, unitText].join('\n'),
      }
      const asText =
        TEXT_KINDS.has(p.kind) ||
        TEXT_CLASSES.has(classOf.get(id)?.cls ?? '') ||
        ink.length > 1 ||
        !!bracketsOf(gl.map(gA))
      // (and, where the typesetter draws it as the page's text (a citation, a reference, a macro: TEXT_CLASSES; by its kind where
      // the instrument states no class), only where that text is a reading of its ink: its glyphs on each line on one baseline,
      // no rule or image among them. Plain text carries no shift and no size: a script's raise or drop, a fraction's parts, a
      // rule TeX set over or under it are none of it, and such an element is drawn as its ink (the typesetter's crop of El.ink
      // where it has no text). TeX sets one box's glyphs on one baseline, equal on the engine's hundredth of a point: no
      // threshold. 2609.20976v1 p2's `\kmsMpc`, "km s⁻¹ Mpc⁻¹", was drawn as the text "km s−1 Mpc−1"; today's reader crops a
      // text macro raised 0.1 em or more over its baseline (layer2.mjs scriptedOf) and draws a lowered one as text (1810.04805v2's
      // BERT_base, wrong too). A formula's text is no drawing (it is cropped, its text read for its brackets), nor a display's.
      // And each glyph where that text is drawn: on the baseline of the line it stands on (its ink's line, the hundredth most of
      // that line's body glyphs share, lines.ts); a footnote's mark is drawn raised whatever TeX set it as (El.mark: a superior
      // figure on the baseline, newpx's, 2307.16209v1). One box TeX raised or lowered whole has its glyphs on one baseline of
      // their own: 2610.17024v1 p11's `\REPOFOOTNOTE{}`, a
      // paper's macro around a footnote, its "3" 6.58 pt and 3.16 pt over the line's baseline, was read level against its own
      // glyphs alone, stated the text "3" and drawn flat at the line's size; on staging and in today's reader both)
      const cls0 = classOf.get(id)?.cls
      const textClass = cls0 !== undefined ? TEXT_CLASSES.has(cls0) : TEXT_KINDS.has(p.kind)
      const level =
        !textClass ||
        (!bx.length &&
          groups.every(
            (gs) =>
              new Set(
                asRead(gs, gA)
                  .filter((g) => /\S/.test(g.u))
                  .map((g) => r2(g.y)),
              ).size <= 1,
          ) &&
          (!!classOf.get(id)?.mark || standsAsDrawn(groups, ink, false, gA)))
      // (a symbol, drawn as its reading's character (El.sym) on the line's baseline, or raised where its reading raises it: only
      // where TeX's ink is that symbol so drawn, no Latin letter or digit among its glyphs (a symbol's reading holds none, its
      // source's letters and digits once commands are dropped: phClass) and each where the drawing sets it; else drawn as its ink. 2610.10069v1 p20's `$\vs^*$`, the paper's bold s starred, was read
      // as the symbol "*" on the baseline (the reading knows no `\vs`): drawn as a full-size *, the s lost)
      const c0 = classOf.get(id)
      if (
        c0?.cls === 'symbol' &&
        shown.length &&
        (shown.some((a) => /[A-Za-z0-9]/.test(gA(a).u)) || !standsAsDrawn(groups, ink, !!c0.sym?.[1], gA))
      ) {
        mem.asInk ??= new Set()
        mem.asInk.add(id)
      }
      if (asText && level && gl.length && !gl.some((a) => gA(a).nu)) {
        // (a text the typesetter draws as the page's text (a class of text, its glyphs on its line's baseline: `level`) in TeX's
        // case: each faked small capital its source's lowercase letter, read off its own glyphs' sizes (facts.ts elementCase),
        // their share stated with its style, El.style.sc (facts-pass), so that the typesetter draws it in small capitals as TeX
        // set it. A formula's text is no drawing (it is cropped, its text read for its brackets): a capital set smaller there is
        // a script, `\rho_{BDM}`'s BDM, no small capital)
        const cased = textClass ? elementCase(gl.map(gA)) : { glyphs: gl.map(gA) }
        if (cased.ratio !== undefined) {
          mem.smallCaps ??= new Map()
          mem.smallCaps.set(id, cased.ratio)
        }
        const own = cased.glyphs
        el.text = textOf(own, lineEnds)
        // (its runs of one fill, where its glyphs hold more than one: a link's text coloured, its brackets black)
        const runs = fillRunsOf(own, lineEnds)
        if (runs) el.fills = runs
      }
      // (a text macro drawn as its ink for its scripts: its copy text its glyphs', where the source's reading has none (a paper's
      // own macro), so that the crop's selection reads what it shows, as a URL's is its glyphs' (urlCopyOf))
      if (
        !level &&
        asText &&
        (cls0 === 'macro' || cls0 === 'umacro') &&
        !classOf.get(id)?.copy &&
        gl.length &&
        !gl.some((a) => gA(a).nu)
      )
        el.copy = textOf(gl.map(gA), lineEnds)
      // (a URL's copy text, its crop's: its glyphs' text as the page sets it (urlCopyOf), what the crop shows: no space at a line's end
      // inside it, which TeX's url package breaks without one, #633 review. The instrument's copy is the source's reading
      // (texToText2), which reads a URL's "_1" as the subscript "₁" and knows no prefix a macro prints (a DOI's, an eprint's): 30
      // of the corpus's 360 URLs with break points were cut elsewhere than after a break, #630. Where TeX set it on one line,
      // where its url package lets TeX break it, counted in that text (urlBreaks))
      if (isUrl && el.text !== undefined) el.copy = urlCopyOf(gl.map(gA))
      if (isUrl && ink.length === 1) {
        const breaks = urlBreaks(gl.map(gA), el.copy ?? classOf.get(id)?.copy ?? '')
        if (breaks.length) el.breaks = breaks
      }
      // (a text macro none of whose glyphs the instrument gives it, 1810.04805v2's \bert set as "BERT", the unit's text: its
      // text the unit's own text glyphs between its two points on B, as today's reader finds its rendering among the unit's
      // characters (texParts: TEX:487-495); its ink stays the unit's text's)
      const cls = classOf.get(id)?.cls
      const span = placeSpan.get(`${mem.unit}|${id}`)
      if (!gl.length && (cls === 'macro' || cls === 'umacro') && span) {
        const mine = new Set(mem.text)
        const between: number[] = []
        for (let b = span[0]; b < span[1]; b++) {
          const a = m.bToA[b] as number
          if (unitB[b] === mem.unit && roleB[b] === ROLE.text && a >= 0 && mine.has(a)) between.push(a)
        }
        if (between.length && !between.some((a) => gA(a).nu)) el.text = textOf(between.map(gA), lineEnds)
      }
      // (an element of no ink states which of three it is (rootcause/lave.md §2, math.md §4), of a class the reading draws from
      // its ink (INKED_CLASSES): TeX set nothing for it, its text '' — both its places stated and no glyph of B between them,
      // or the instrument's `empty` (its probe said it sets none, or its points prove it set none of its own: 2610.19159v1's
      // `\trajectoryMark{}`, 2402.10294v1's `\url` in `\urldef\tempurl`) —; or TeX set it before the unit's start point,
      // outside the unit's text: El.keep, its ink never erased (the instrument's `outside`); with neither, its ink was not
      // found, and the reading leaves its unit the original's. Before, an empty ink of a visible class read as TeX's nothing:
      // 2608.25210v2 p7's algorithm erased under one line, 2402.10294v1's reference [1] drawn without its year)
      const emptySpan = !!span && span[0] === span[1]
      const stated = cls ?? p.kind
      if (!ink.length && el.text === undefined && INKED_CLASSES.has(stated)) {
        if (emptySpan || emptyPiece.has(`${mem.unit}|${id}`) || jointPiece.has(`${mem.unit}|${id}`)) el.text = ''
        else if (outsidePiece.has(`${mem.unit}|${id}`)) el.keep = 1
      }
      mem.elements.push([id, el])
    }
    // its trail (above): an element of no piece, its ink a crop's, its text its glyphs'
    const tr = mem.els.get(TRAIL)
    if (tr?.length) {
      const L = cutLines(tr, atA)[0]
      if (L)
        mem.elements.push([
          TRAIL,
          {
            kind: 'other',
            copy: tr.map((a) => gA(a).u).join(''),
            ink: [[L.page, r2(L.x0), r2(L.bottom), r2(L.x1), r2(L.top), L.base]],
            trail: 1,
            ...(trailSep.has(mem.ord) ? { sep: trailSep.get(mem.ord) } : {}),
          },
        ])
    }
    // its label: the class's mark before it
    if (mem.label.length) {
      const L = cutLines(mem.label, atA)[0]
      const lg = mem.label.map(gA)
      if (L) {
        // (the line of its own it stands on, by an element's rule: a footnote's mark raised over the row it shares with the note
        // before stands on that row, its first line)
        const on = standsOn(mem.lines, L.page, L.bottom, L.top, L.base)
        mem.labelAt = {
          kind: LABEL_KIND[mem.kind] ?? 'number',
          // (its glyphs' advances, as an element's ink and a line's extent)
          ink: [L.page, r2(L.x0), r2(L.bottom), r2(L.x1), r2(L.top), L.base],
          style: { role: 'serif', size: L.most },
          ...(on >= 0 ? { line: on } : {}),
        }
      }
    }
  }
  // ---- where a sentence may begin: each word of a running unit's projection at its first glyph on A (words.ts), a unit drawn
  // with its own row (no echo of another's, no kept block, no babel name's occurrence, no figure text)
  for (const mem of members) {
    const unit = mem.unit >= 0 ? units[mem.unit] : undefined
    const content = unit ? unit.content : born.get(mem.ord)?.content
    if (!content || !mem.located || !mem.lines.length || mem.fixed || mem.figure || mem.dir || mem.name !== undefined)
      continue
    if (unit?.echo !== undefined || unit?.kept || !bySentence(mem.kind, !!unit?.figure)) continue
    const lineOf = new Map<number, number>()
    mem.lineGlyphs.forEach((gs, j) => {
      for (const a of gs) lineOf.set(a, j)
    })
    const text = [...mem.text].sort((x, y) => x - y)
    const words = wordsOn(content, text.map(gA), (i) => lineOf.get(text[i] as number) ?? -1, sourceText(content))
    // (an element a sentence may begin with, where a row's start falls on it (its translator set it first in its sentence:
    // "\method{} trains …", "\citet{x} proposes …"), placed at its ink's first box on A, its line and x0, as a word is; never a
    // display (a block of its own) nor an element TeX set outside the unit's text (kept where it stands). Words alone, the left
    // pane lit it with the sentence before, the start moved on past it: 556 of 2,148 starts of staging's rows, 2026-11-10)
    const els = new Map(mem.elements)
    for (const [o, id] of elementsOf(content)) {
      const el = els.get(id)
      const k = el?.ink[0]
      if (!el || !k || el.kind === 'display' || el.keep) continue
      const j = standsOn(mem.lines, k[0], k[2], k[4], k[5])
      if (j >= 0) words.push([o, j, k[1]])
    }
    words.sort((a, b) => a[0] - b[0])
    if (words.length) mem.words = words
  }
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
  function endMarks(): void {
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
  columnsAndMeasures(members, inkA, gA, (mem) => (mem.unit >= 0 ? units[mem.unit]?.cell?.table : undefined), framesA)
  endMarks()
  const ink = inkIndex(inkA)
  // (TeX's paragraph separation where each unit's paragraph ends: its \baselineskip and \parskip, LINES_TEX's AXT-LINES)
  const texSep = new Map((ins.tex.skips ?? []).map((k) => [k.unit, r2(k.baselineskip + k.parskip)]))
  for (const mem of members)
    if (mem.lines.length)
      mem.room = roomOf(mem, inkA, m.offA, ink, {
        frames: framesA,
        // (a table's cell keeps its own room, a figure text, an ink figure and a name theirs: no run's room is theirs to borrow)
        runs: !(
          mem.figure ||
          mem.kind === 'inkfigures' ||
          mem.kind === 'name' ||
          (mem.unit >= 0 && units[mem.unit]?.cell)
        ),
        sep: mem.unit >= 0 && mem.name === undefined ? texSep.get(mem.unit) : undefined,
      })
  // ---- a babel name that leads a unit (today's RUN_IN, make.mjs leadAt: the first unit start after the name's end on its line,
  // in its column, in our compile): the unit whose glyph TeX set next after the name's in B's stream (glyphs of no unit between
  // aside), that glyph its first, on the name's baseline on B (0.5 pt, leadAt's) from the name's end on (0.05 pt, leadAt's).
  // TeX's stream tells the column: after a column's last line it goes on at the next column's top, never at a line beside it
  {
    const memberOfUnit = new Map<number, Member>()
    for (const mem of members) if (mem.name === undefined && mem.unit >= 0) memberOfUnit.set(mem.unit, mem)
    for (const n of members) {
      if (n.name === undefined || !n.located || n.bLast < 0) continue
      let b = n.bLast + 1
      while (b < NB && pageB[b] === pageB[n.bLast] && (unitB[b] as number) < 0) b++
      if (b >= NB || pageB[b] !== pageB[n.bLast]) continue
      const led = memberOfUnit.get(unitB[b] as number)
      if (!led || led.bFirst !== b) continue
      const g = gB(b),
        e = gB(n.bLast)
      if (Math.abs(g.y - e.y) > 0.5 || g.x0 < e.x1 - 0.05) continue
      // (in its column: a left column's last line and the right column's first can share a baseline, the stream going on from
      // the one to the other; the columns as columnsAndMeasures read them on A, a line over both (2) of either)
      const nc = n.lines.at(-1)?.[1],
        lc = led.lines[0]?.[1]
      if (nc !== undefined && lc !== undefined && !sameColumn(nc, lc)) continue
      n.leads = led.ord
      led.leader = n.ord
    }
  }
  // ---- the facts today's reader works out from the page before it typesets (stage 1a-2: facts-pass.ts)
  factsOf({ ins, inkA, m, members, claimedA, pageA, unitB, roleB, pieceB, units, framed: new Set(framesA.keys()) })

  // ---- flows: a member whose first line is the one before's last line, on its baseline after its end (SHARED_SEP of its size at
  // most, today's rowLeadOf), in one paragraph of TeX's (no paragraph end of B's between the one's last glyph and the other's
  // first, where the instrument states them); a table's cell and a figure's text are set in boxes of their own, never in a
  // paragraph with another
  const ends: number[] = []
  ;(ins.tex.paragraphEnds ?? []).forEach((l, p) => {
    for (const g of l) ends.push((m.offB[p] as number) + g)
  })
  ends.sort((x, y) => x - y)
  const endBetween = (lo: number, hi: number) => {
    let a = 0
    let b = ends.length
    while (a < b) {
      const mid = (a + b) >> 1
      if ((ends[mid] as number) <= lo) a = mid + 1
      else b = mid
    }
    return a < ends.length && (ends[a] as number) <= hi
  }
  const ownBox = (x: Member) => x.kind === 'cell' || x.figure || x.kind === 'inkfigures'
  // (TeX keeps a paragraph open across the inserts set inside it: a float's caption and cells, a figure's text, a footnote's
  // text, each in a box of its own; so the member of the body before a member of the body is the last one before it that is
  // no insert's, and the paragraph ends inside those inserts (their own paragraphs: a caption's, a footnote's) are none of
  // its. 2608.06701v1 p6: a run-in head, a table and a footnote in the stream, then the head's paragraph on its row)
  const insert = (x: Member) => ownBox(x) || x.kind === 'caption' || x.kind === 'footnote'
  // (whether something of the page stays on a shared row between the member before's end there and the next one's first text:
  // a shown glyph of A whose advance's middle stands between the two, on the row (its baseline within ON_ROW of the row's size of
  // the row's): today's keptBetween (RUN:1592, over the page's characters), the next member's own label among them, which goes
  // with it (ownLabelOnRow, RUN:1623). Placed.join's kept: the next member is not laid from the first one's end, where something
  // else stays there, and the first one's text on the row ends where TeX's did (keptAfter, RUN:1596))
  const keptOn = (a: Line, b: Line, size: number) => {
    const pg = inkA.pages[a[0] - 1]
    if (!pg || b[0] !== a[0]) return false
    for (const g of pg.glyphs) {
      if (g.unseen || !isInk(g)) continue
      const mid = (g.x0 + g.x1) / 2
      if (mid > a[3] && mid < b[2] && Math.abs(g.y - a[4]) < ON_ROW * size) return true
    }
    return false
  }
  // (Placed.join's separation: from the leader's ink end on the row, its last line's glyphs' outlines (an advance where a glyph
  // has none), to the follower's first line: S.rowStart lays the follower from the translation's ink end (S.share's `ink`), so
  // the separation it keeps is the original's from its ink; today's shared row is the file's row, its glyphs' ink (make.mjs
  // rowsOf), 2610.40645v1 p34's "Proof of Proposition 4.4." and its theorem 4.49 pt apart drawn where v2's were 3.33)
  // (and its elements' boxes on that line, no glyph's, which travel with it in their crops: an ORCID icon after a name. Read
  // from the glyphs alone, the next member was laid the icon's width after it, the mark TeX set right after the icon apart from
  // the name: 2609.20976v1 p1, §18.60. An element's glyphs are among the line's glyphs already, read by their ink)
  const inkEnd = (lead: Member, a: Line) => {
    let x = Number.NEGATIVE_INFINITY
    const last = lead.lines.at(-1) === a
    for (const g of last ? (lead.lineGlyphs.at(-1) ?? []) : []) {
      const d = gA(g)
      if (isInk(d)) x = Math.max(x, d.ix1 > d.ix0 ? d.ix1 : d.x1)
    }
    if (last)
      for (const l of lead.elBoxes.values())
        for (const [p, i] of l) {
          const bx = inkA.pages[p - 1]?.boxes
          if (p !== a[0] || !bx) continue
          if ((bx[4 * i + 1] as number) < a[5] && (bx[4 * i + 3] as number) > a[6])
            x = Math.max(x, bx[4 * i + 2] as number)
        }
    return Number.isFinite(x) ? x : a[3]
  }
  const sepOf = (lead: Member, b: Line) => r2(b[2] - inkEnd(lead, lead.lines.at(-1)!))
  const joinOf = (lead: Member, b: Line, size: number): [number] | [number, 1] => {
    const sep = sepOf(lead, b)
    return keptOn(lead.lines.at(-1)!, b, size) ? [sep, 1] : [sep]
  }
  // (the stream: the instrument's members in its order, and each member made on A (ink.ts, born.ts) where TeX set its text in
  // it, where B printed that: right before the member whose first glyph on B is the next glyph of its page some member owns
  // after its last, as a name leads the unit after it (above). amsthm's head no source unit owns, made on A, and its theorem's
  // text after it on the row (2608.25210v2 p4 "Definition 2. Minimal Provenance."): one flow, as a run-in head's and its
  // paragraph's, today's shared line over every unit of the page (need.mjs rowLeadOf). One B never printed, or after which no
  // member begins on its page, stands after the instrument's, as made. Which box TeX set a member made on A in the instrument
  // does not say: none is the body an insert is passed over to)
  const madeOnA = (x: Member) => x.unit < 0 || x.unit >= ins.units.length
  const madeB = new Set<number>()
  const firstAt = new Map<number, number>()
  for (const x of members) {
    if (x.bFirst >= 0) firstAt.set(x.bFirst, x.ord)
    if (!madeOnA(x)) continue
    for (const a of x.text) if ((m.aToB[a] as number) >= 0) madeB.add(m.aToB[a] as number)
    for (const l of x.els.values()) for (const a of l) if ((m.aToB[a] as number) >= 0) madeB.add(m.aToB[a] as number)
  }
  const standsBefore = new Map<number, number[]>()
  const standing = new Set<number>()
  // (one whose first glyph TeX set right after a member's last, on that member's last row, stands after it: the paragraph goes
  // on past that member into text no unit owns. acmart's reference format, its last author's name a unit of \author's that TeX
  // sets late in the stream and ". 2027. ABNAT: …" after it, the title set again, made on A: no member begins after it on the
  // page, and standing where it was made, after every member, the member before it was another row's (2610.22065v1), its
  // translation laid at its original's start past a gap. Else before the member whose first glyph comes next, as above)
  const lastAt = new Map<number, number>()
  for (const x of members) if (x.bLast >= 0 && !madeOnA(x)) lastAt.set(x.bLast, x.ord)
  const standsAfter = new Map<number, number[]>()
  for (const x of members) {
    if (!madeOnA(x) || x.bFirst < 0) continue
    let b = x.bFirst - 1
    while (b >= 0 && pageB[b] === pageB[x.bFirst] && (unitB[b] as number) < 0 && !madeB.has(b)) b--
    const o = b >= 0 && pageB[b] === pageB[x.bFirst] ? lastAt.get(b) : undefined
    const lead = o === undefined ? undefined : members[o]
    const a = lead?.lines.at(-1),
      l = x.lines[0]
    if (!lead || !a || !l || a[0] !== l[0] || a[1] !== l[1] || l[2] < a[3] - 0.5) continue
    if (Math.abs(a[4] - l[4]) >= 0.5 * Math.min(lead.style.size, x.style.size)) continue
    ;(standsAfter.get(lead.ord) ?? standsAfter.set(lead.ord, []).get(lead.ord)!).push(x.ord)
    standing.add(x.ord)
  }
  // (B's body and float brackets, LAYOUT_TEX's `bs<n>`, `be<n>`, `fs<n>`, `fe<n>`, each at the glyph after it: a column's body is
  // bracketed each, a float's set apart)
  const brackets: number[] = []
  B.pages.forEach((pg, p) => {
    for (const x of pg.points ?? []) if (BRACKET.test(x.name)) brackets.push((m.offB[p] as number) + x.glyph)
  })
  const bracketBetween = (lo: number, hi: number) => brackets.some((g) => g > lo && g <= hi)
  // (a member of the instrument's whose first glyph TeX set right after another's last, on that one's last row, stands after it,
  // whatever their order among the units: the front end numbers the units it cut out of what was one unit after every other
  // unit of the source (latex-front.mjs `later`: no unit's number moves), an author block's names after an \and among them.
  // 2611.00342v1 p1, IJCAI: the second name's unit came after the body's, the body was taken for the member before it, and the
  // first name kept a flow of its own, laid centred on its original's middle, a hole before the next. The member before on B:
  // the one whose last glyph is the last an instrument unit owns before its first (what stands between is no unit's, or made on
  // A: a connector), on that one's last line after its end, in one column or in none TeX set apart (no body's or float's
  // bracket between: a row of names over the page's middle). It moves where that member is not the one before it among the
  // units, or moved itself: the rest of a run TeX set one after the other goes with it. Never an insert's, nor to one; nor a
  // babel name's or to one, whose place in a flow is its binding's (below: `leads`), its unit's place among the units none)
  for (const x of members) {
    if (madeOnA(x) || x.bFirst < 0 || insert(x) || x.name !== undefined || standing.has(x.ord)) continue
    let b = x.bFirst - 1
    while (b >= 0 && pageB[b] === pageB[x.bFirst] && (unitB[b] as number) < 0) b--
    const o = b >= 0 && pageB[b] === pageB[x.bFirst] ? lastAt.get(b) : undefined
    const lead = o === undefined ? undefined : members[o]
    if (
      !lead ||
      lead === x ||
      insert(lead) ||
      lead.name !== undefined ||
      (members[x.ord - 1] === lead && !standing.has(lead.ord))
    )
      continue
    const a = lead.lines.at(-1),
      l = x.lines[0]
    if (!a || !l || a[0] !== l[0] || l[2] < a[3] - 0.5) continue
    if (a[1] !== l[1] && bracketBetween(lead.bLast, x.bFirst)) continue
    if (Math.abs(a[4] - l[4]) >= 0.5 * Math.min(lead.style.size, x.style.size)) continue
    ;(standsAfter.get(lead.ord) ?? standsAfter.set(lead.ord, []).get(lead.ord)!).push(x.ord)
    standing.add(x.ord)
  }
  for (const x of members) {
    if (!madeOnA(x) || x.bLast < 0 || standing.has(x.ord)) continue
    let b = x.bLast + 1
    while (b < NB && pageB[b] === pageB[x.bLast] && (unitB[b] as number) < 0 && !madeB.has(b)) b++
    const next = b < NB && pageB[b] === pageB[x.bLast] ? firstAt.get(b) : undefined
    if (next === undefined || next === x.ord) continue
    ;(standsBefore.get(next) ?? standsBefore.set(next, []).get(next)!).push(x.ord)
    standing.add(x.ord)
  }
  const seq: Member[] = []
  const put = (o: number) => {
    for (const x of standsBefore.get(o) ?? []) put(x)
    seq.push(members[o]!)
    for (const x of standsAfter.get(o) ?? []) put(x)
  }
  for (const x of members) if (!standing.has(x.ord)) put(x.ord)
  const flowOf = new Map<number, number[]>()
  const flows: number[][] = []
  let body: number | null = null
  // (a footnote's text is set in the footnote insert, TeX's \footins, the page's notes one after the other there: the member
  // before a footnote is the footnote before it, the body between them in the stream passed over (footmisc's para sets the
  // notes as one paragraph, a note on the row the one before ends: 2608.06701v1 p5), but a member made on A that B printed
  // right before it)
  let note: number | null = null
  // (a member of the instrument's that B never printed — a unit whose marks TeX set nowhere, acmart's \affiliation between two
  // names its reference format sets again — has no place in TeX's stream: never the member before. 2610.22065v1: the authors'
  // names each a flow of their own, each laid at its original's start, the gaps between them read as stretched spaces)
  const inStream = (x: Member) => x.bFirst >= 0 || madeOnA(x)
  for (let q = 0; q < seq.length; q++) {
    const mem = seq[q]!
    let k = q - 1
    while (k >= 0 && !inStream(seq[k]!)) k--
    if (!insert(mem) && k >= 0 && insert(seq[k]!) && body !== null) k = body
    else if (mem.kind === 'footnote' && note !== null && !(k >= 0 && standsBefore.get(mem.ord)?.includes(seq[k]!.ord)))
      k = note
    const prev = k >= 0 ? seq[k]! : null
    // (the paragraph ends between the two that are not inside the inserts between them)
    const insideInsert = (e: number) => {
      for (let j = k + 1; j < q; j++) {
        const x = seq[j]!
        if (x.bFirst >= 0 && e > x.bFirst && e <= x.bLast + 1) return true
      }
      return false
    }
    const endsBetween = (lo: number, hi: number) =>
      k === q - 1 ? endBetween(lo, hi) : ends.some((e) => e > lo && e <= hi && !insideInsert(e))
    const a = prev?.lines.at(-1)
    const b = mem.lines[0]
    const shares =
      !!a &&
      !!b &&
      !!prev?.located &&
      mem.located &&
      // (a member born on A, of glyphs B never printed, has no place in TeX's stream to tell its paragraph by)
      mem.unit >= 0 &&
      prev.unit >= 0 &&
      a[0] === b[0] &&
      // (one column by the line's x, or none TeX set apart: no body's or float's bracket between the two in B's stream, ICML's
      // centred names over the page's middle, which its x read as three columns' and laid as three lines)
      (a[1] === b[1] ||
        (prev.kind === 'heading' && sameColumn(a[1], b[1])) ||
        (prev.bLast >= 0 && mem.bFirst >= 0 && !bracketBetween(prev.bLast, mem.bFirst))) &&
      Math.abs(a[4] - b[4]) < 0.5 * Math.min(prev.style.size, mem.style.size) &&
      b[2] >= a[3] - 0.5 &&
      sepOf(prev, b) <= SHARED_SEP * (b[10] ?? mem.style.size) &&
      !ownBox(prev) &&
      !ownBox(mem) &&
      (prev.bLast < 0 || mem.bFirst < 0 || !endsBetween(prev.bLast, mem.bFirst))
    const into = shares ? flowOf.get(prev.ord) : undefined
    if (into) {
      mem.join = joinOf(prev!, b!, a![10] ?? prev!.style.size)
      into.push(mem.ord)
      flowOf.set(mem.ord, into)
    } else {
      const flow = [mem.ord]
      flows.push(flow)
      flowOf.set(mem.ord, flow)
    }
    if (!insert(mem) && !madeOnA(mem) && inStream(mem)) body = q
    if (mem.kind === 'footnote' && inStream(mem)) note = q
  }
  // (the flows in the members' order, each at its first member's place there: the instrument's, then those made on A)
  flows.sort((f, g) => Math.min(...f) - Math.min(...g))

  // ---- ties: a table's cells, laid together; a figure's set, at one size; a flow's members, at one size
  const ties: Located['ties'] = []
  {
    const tables = new Map<number, Map<number, number[]>>()
    const heads = new Set<number>()
    const sets = new Map<number, number[]>()
    for (const mem of members) {
      const unit = mem.unit >= 0 ? units[mem.unit] : undefined
      if (!unit || !mem.located) continue
      if (unit.cell) {
        const t = tables.get(unit.cell.table) ?? tables.set(unit.cell.table, new Map()).get(unit.cell.table)!
        const key = unit.cell.row * 4096 + unit.cell.col
        const l = t.get(key)
        if (l) l.push(mem.ord)
        else t.set(key, [mem.ord])
        if (unit.cell.head) heads.add(unit.cell.table)
      }
      if (unit.figure) {
        const l = sets.get(unit.figure.set)
        if (l) l.push(mem.ord)
        else sets.set(unit.figure.set, [mem.ord])
      }
    }
    for (const [t, cells] of tables)
      ties.push({
        rule: 'cells',
        cells: [...cells].sort((x, y) => x[0] - y[0]).map(([, o]) => o),
        ...(heads.has(t) ? { head: 1 as const } : {}),
      })
    for (const ords of sets.values()) if (ords.length > 1) ties.push({ rule: 'size', ords })
    // (the members of one flow: one paragraph of TeX's, a member's first line the one before's last, on its baseline after its
    // end, no paragraph end between them — a paragraph the front end cut at a float set inside it (2608.16117v1 p19, the
    // checkpoint's free-9: one part laid at its size, the other shrunk), a run-in head and its paragraph — laid at one size)
    for (const ords of flows) if (ords.length > 1) ties.push({ rule: 'size', ords: [...ords] })
  }
  // (a name that leads a unit stands before it in its flow, the unit's join its separation from the name (the joint, the unit's
  // label, kept between): design-a's `bound`, set only with the member after it. Where the unit's first line on A is not the
  // name's line (its page, its baseline within leadAt's 0.5 pt, from the name's end on), the name keeps its own flow, bound to a
  // member its part does not hold after it. (No column read: B's stream told it, and a name's short line is given the column its
  // own extent falls in, the left of a one-column page's, 2610.18513v1 p21.) No size tie: the name is drawn at its unit's size)
  for (const n of members) {
    if (n.leads === undefined) continue
    const led = members[n.leads]!
    const flow = flowOf.get(led.ord)
    const l = n.lines[0]
    const f = led.lines[0]
    if (!flow || !l || !f || n.lines.length !== 1) continue
    if (f[0] !== l[0] || Math.abs(f[4] - l[4]) > 0.5 || f[2] < l[3] - 0.05) continue
    // (the name alone taken out of the flow it stood in, the members beside it left in theirs (two names on one line: Devin on
    // #624), the flow dropped where it is left empty; and out of the size ties, which name it with that flow's members)
    const own = flowOf.get(n.ord)
    if (own) {
      own.splice(own.indexOf(n.ord), 1)
      if (!own.length) flows.splice(flows.indexOf(own), 1)
    }
    for (let t = ties.length - 1; t >= 0; t--) {
      const tie = ties[t]!
      if (tie.rule !== 'size' || !tie.ords.includes(n.ord)) continue
      tie.ords = tie.ords.filter((o) => o !== n.ord)
      if (tie.ords.length < 2) ties.splice(t, 1)
    }
    const k = flow.indexOf(led.ord)
    const before = k > 0 ? members[flow[k - 1] as number] : undefined
    const prev = before?.lines.at(-1)
    if (before && prev && led.join) n.join = joinOf(before, l, prev[10] ?? before.style.size)
    flow.splice(k, 0, n.ord)
    flowOf.set(n.ord, flow)
    led.join = joinOf(n, f, l[10] ?? n.style.size)
  }

  // ---- a single line read centred by its block, on a row it shares with the members its flow joins to it there (a run-in
  // theorem head between its label and its text, 2610.30034v1 p5's "Lemma 3 (Bellman-objective decomposition): Let"): its
  // alignment is TeX's line's, never a fragment's, read again over the row, its label's start to the last member's end on it;
  // its fragment's middle at the column's was a coincidence of the note's length, and its translation was set from the
  // fragment's middle, 36 pt into the column (today's maker reads the line with its label: MAKE:2121-2135)
  rowAligns(members, flows)

  // ---- links: A's annotations, each owned by the member that owns most of the glyphs under it (today's links.mjs ownersOf: the
  // unit whose rectangles hold more than half of its glyph points; by exact ownership, the member that owns more than half of
  // them), and within it by the element that owns more than half of them, else its text; where its label's glyphs are more than
  // half of them, its text's stated as the label's (`label`: the add-on wraps the label in a group of its own, which stays on
  // where the label is not drawn anew, as its link may: today's freeze keeps a link no match took whose glyphs no operation of
  // the page erased). A glyph point is a glyph's advance centre on its baseline strictly inside the annotation's rectangle or one
  // of its quads (PDF.js's overlaidText rule, today's pointsOf). A link over no glyph: the member one of whose lines or elements
  // holds its rectangle's centre. The annotations of one target a member owns on a page that hold, together, every glyph of its
  // text's and its elements' there are stated so (`whole`: today's whole tier, links.mjs:426, every own character of the unit's
  // the drawing replaces under them, by glyph point; a line's ink is no measure of it, its last glyph's ink past the link's box)
  const links: Located['links'] = new Map()
  ;(o.annotations ?? []).forEach((list, p) => {
    if (!list?.length) return
    const out: NonNullable<ReturnType<typeof links.get>> = []
    const pg = inkA.pages[p]!
    const off = m.offA[p] as number
    // (each annotation's glyph points and the member that owns it, by its place in `out`)
    const under: { pts: number[]; mem: Member | undefined }[] = []
    for (const an of list as {
      annotationType?: number
      rect?: number[]
      quadPoints?: ArrayLike<number> | null
      url?: string
      unsafeUrl?: string
      dest?: unknown
      borderStyle?: { width?: number; style?: number }
      borderColor?: ArrayLike<number> | null
    }[]) {
      if (an.annotationType !== 2 || !Array.isArray(an.rect) || an.rect.length !== 4) continue
      const to =
        (an.url ?? an.unsafeUrl)
          ? { url: String(an.url ?? an.unsafeUrl) }
          : an.dest !== undefined
            ? { dest: JSON.stringify(an.dest) }
            : null
      if (!to) continue
      const [x0, y0, x1, y1] = an.rect.map(r2) as [number, number, number, number]
      const boxes = quadBoxesOf(an.quadPoints) ?? [
        [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)],
      ]
      const inside = (x: number, y: number) => boxes.some((b) => x > b[0] && x < b[2] && y > b[1] && y < b[3])
      const pts: number[] = []
      pg.glyphs.forEach((g, j) => {
        if (/\S/.test(g.u) && inside((g.x0 + g.x1) / 2, g.y)) pts.push(off + j)
      })
      let owner: [number, string] | undefined
      let label = false
      let owning: Member | undefined
      if (pts.length) {
        const by = new Map<number, number>()
        for (const a of pts)
          if ((claimedA[a] as number) >= 0) by.set(claimedA[a] as number, (by.get(claimedA[a] as number) ?? 0) + 1)
        const top = [...by].find(([, n]) => 2 * n > pts.length)
        if (top) {
          const mem = members[top[0]]!
          owning = mem
          const els = [...mem.els].map(([id, l]) => [id, pts.filter((a) => l.includes(a)).length] as const)
          const el = els.find(([, n]) => 2 * n > pts.length)
          owner = [mem.ord, el ? el[0] : '']
          label = !el && 2 * pts.filter((a) => mem.label.includes(a)).length > pts.length
        }
      } else {
        const cx = (x0 + x1) / 2
        const cy = (y0 + y1) / 2
        const holds = (a: number, b: number, c: number, d: number) => cx >= a && cx <= c && cy >= b && cy <= d
        for (const mem of members) {
          if (!mem.pages.includes(p + 1)) continue
          const el = mem.elements.find(([, e]) => e.ink.some((k) => k[0] === p + 1 && holds(k[1], k[2], k[3], k[4])))
          if (el) owner = [mem.ord, el[0]]
          else if (mem.lines.some((l) => l[0] === p + 1 && holds(l[2], l[6], l[3], l[5]))) owner = [mem.ord, '']
          if (owner) {
            owning = mem
            break
          }
        }
      }
      // (the characters of the glyphs under it, its glyph points' in their order: today's annotation's own (links.mjs g2.ch, which
      // its placeText finds among a piece's drawn characters where PDF.js's overlaidText is not read: the server's reading
      // skips it, pdf-lite.mjs's text guard)
      const text = pts.map((a) => pg.glyphs[a - off]!.u).join('')
      const border = borderOf(an)
      out.push({
        box: [x0, y0, x1, y1],
        to,
        ...(owner ? { owner } : {}),
        ...(text ? { text } : {}),
        ...(label ? { label: 1 as const } : {}),
        ...(border ? { border } : {}),
      })
      under.push({ pts, mem: owning })
    }
    const byTarget = new Map<string, number[]>()
    out.forEach((l, k) => {
      if (!l.owner) return
      const key = `${l.owner[0]}|${JSON.stringify(l.to)}`
      byTarget.set(key, [...(byTarget.get(key) ?? []), k])
    })
    for (const ks of byTarget.values()) {
      const mem = under[ks[0]!]!.mem
      if (!mem) continue
      const held = new Set(ks.flatMap((k) => under[k]!.pts))
      const own = [...mem.text, ...[...mem.els.values()].flat()].filter(
        (a) => pageA[a] === p + 1 && /\S/.test(pg.glyphs[a - off]!.u),
      )
      if (own.length && own.every((a) => held.has(a))) for (const k of ks) out[k]!.whole = 1
    }
    if (out.length) links.set(p + 1, out)
  })

  // ---- groups for the wrap
  const groups = inkA.pages.map((pg) => ({
    glyphs: new Array<string | null>(pg.glyphs.length).fill(null),
    boxes: new Array<string | null>(pg.kinds.length).fill(null),
    turned: new Array<string | null>(pg.turned?.length ?? 0).fill(null),
  }))
  const figureGroups = new Set<string>()
  const set = (a: number, g: string) => {
    const p = (pageA[a] as number) - 1
    groups[p]!.glyphs[a - (m.offA[p] as number)] = g
  }
  for (const mem of members) {
    if (!mem.located || mem.fixed) continue
    const unit = mem.unit >= 0 ? units[mem.unit] : undefined
    const pieces = unit ? piecesOf(unit.content) : new Map<string, Piece>()
    const name = (a: number, c: string) => `${mem.ord}.${pageA[a]}.${c}`
    // (an element whose ink stays, a display's, one outside the unit or on a held line: in no group)
    const keptEl = new Set(mem.elements.filter(([, el]) => el.keep).map(([id]) => id))
    for (const a of mem.text) {
      set(a, name(a, 't'))
      if (mem.figure) figureGroups.add(name(a, 't'))
    }
    // (a figure item's label, F3's: a figure group too, written inside the form its text is shown in)
    for (const a of mem.label) {
      set(a, name(a, 'l'))
      if (mem.figure) figureGroups.add(name(a, 'l'))
    }
    for (const [ap, aj] of mem.turned) {
      groups[ap - 1]!.turned[aj] = `${mem.ord}.${ap}.t`
      if (mem.figure) figureGroups.add(`${mem.ord}.${ap}.t`)
    }
    // (a figure text's elements' groups figures' too: the wrap writes them inside the form they are shown in, as their text's)
    for (const [id, l] of mem.els) {
      if ((pieces.get(id) as { kind?: string } | undefined)?.kind === 'display' || keptEl.has(id)) continue
      for (const a of l) {
        set(a, name(a, 'e'))
        if (mem.figure) figureGroups.add(name(a, 'e'))
      }
    }
    for (const [ap, ai] of mem.textBoxes) groups[ap - 1]!.boxes[ai] = `${mem.ord}.${ap}.t`
    for (const [id, l] of mem.elBoxes) {
      if ((pieces.get(id) as { kind?: string } | undefined)?.kind === 'display' || keptEl.has(id)) continue
      for (const [ap, ai] of l) {
        groups[ap - 1]!.boxes[ai] = `${mem.ord}.${ap}.e`
        if (mem.figure) figureGroups.add(`${mem.ord}.${ap}.e`)
      }
    }
  }

  for (const mem of members) {
    if (mem.unit < 0 || mem.unit >= ins.units.length) continue
    if (mem.located) {
      stats.located++
      if (mem.place) stats.places[mem.place]++
      if (mem.opensLost) stats.opensLost = (stats.opensLost ?? 0) + mem.opensLost
      if (mem.opensUnstated) {
        stats.opensUnstated ??= { anchored: 0, plain: 0 }
        stats.opensUnstated.anchored += mem.opensUnstated[0]
        stats.opensUnstated.plain += mem.opensUnstated[1]
      }
    } else noteUnlocated(mem.cause ?? 'no ink')
  }
  return { units, members, born, flows, ties, links, groups, figureGroups, stats, displays, floatLines }
}

/** a single line's alignment its block read centred (Member.byBlock), read again over the TeX line its flow says it shares: the
 *  row from its label's start (or the first member's start the flow joins before it on that row) to the last member's end the
 *  flow joins after it there; justified where the row's stack does not centre it (centredByBlock over the row, the row's own
 *  lines out of the stack) */
function rowAligns(members: Member[], flows: readonly number[][]): void {
  const linesOn = new Map<number, Line[]>()
  for (const mem of members) for (const l of mem.lines) (linesOn.get(l[0]) ?? linesOn.set(l[0], []).get(l[0])!).push(l)
  const onRow = (l: Line, k: Line, size: number) => k[0] === l[0] && Math.abs(k[4] - l[4]) < ON_ROW * size
  for (const flow of flows) {
    flow.forEach((o, k) => {
      const mem = members[o]!
      const own = mem.lines.filter((l) => !(l[9] & 1))
      if (!mem.byBlock || own.length !== 1) return
      const l = own[0]!
      const size = l[10] ?? mem.style.size
      const row = new Set<Line>([l])
      let x0 = l[2]
      let x1 = l[3]
      const lb = mem.labelAt?.ink
      if (lb && lb[0] === l[0] && Math.abs(lb[5] - l[4]) < ON_ROW * size) x0 = Math.min(x0, lb[1])
      // (back: each member joined to the next on this row, its last line there; on while that line is its only one)
      for (let j = k; j > 0 && members[flow[j]!]!.join; j--) {
        const p = members[flow[j - 1]!]!
        const e = p.lines.at(-1)
        if (!e || !onRow(l, e, size)) break
        row.add(e)
        x0 = Math.min(x0, e[2])
        if (p.lines.length > 1) break
      }
      // (on: each member the flow joins after it on this row, its first line there)
      for (let j = k + 1; j < flow.length && members[flow[j]!]!.join; j++) {
        const n = members[flow[j]!]!
        const f = n.lines[0]
        if (!f || !onRow(l, f, size)) break
        row.add(f)
        x1 = Math.max(x1, f[3])
        if (n.lines.length > 1) break
      }
      if (row.size === 1 && x0 === l[2]) return
      const line = [...l.slice(0, 2), x0, x1, ...l.slice(4)] as Line
      const stack = (linesOn.get(l[0]) ?? []).filter((k) => !row.has(k))
      if (!centredByBlock([line], stack, mem.lead)) mem.align = 'j'
    })
  }
}

/** a link annotation's border as PDF.js's annotation layer draws it (the original's pane): its width where above 0 (its /BS /W,
 *  else its /Border's, as PDF.js reads them: none where neither is), its colour (PDF.js's borderColor: a link's /C, null for /C
 *  [], black where it has none), its style (PDF.js's AnnotationBorderStyleType: 2 dashed, 5 underline, any other solid, today's
 *  layer-proto/links.mjs annotsOf). None where the width or the colour is none: PDF.js draws none */
function borderOf(an: {
  borderStyle?: { width?: number; style?: number }
  borderColor?: ArrayLike<number> | null
}): LinkBorder | undefined {
  const w = r2(Number(an.borderStyle?.width))
  const c = an.borderColor
  if (!(w > 0) || !Number.isFinite(w) || !c || c.length !== 3) return undefined
  const rgb = ((c[0]! & 255) << 16) | ((c[1]! & 255) << 8) | (c[2]! & 255)
  const style = an.borderStyle?.style
  return style === 2 ? [w, rgb, 'dashed'] : style === 5 ? [w, rgb, 'underline'] : [w, rgb]
}
/** an annotation's quads (PDF.js's quadPoints, eight numbers a quad) as boxes, null where it has none or they are ill formed
 *  (today's links.mjs quadBoxes) */
function quadBoxesOf(q: ArrayLike<number> | null | undefined): [number, number, number, number][] | null {
  if (!q || typeof q.length !== 'number' || !q.length) return null
  const flat = Array.from(q)
  if (flat.length % 8 || !flat.every(Number.isFinite)) return null
  const out: [number, number, number, number][] = []
  for (let i = 0; i < flat.length; i += 8) {
    const xs = [flat[i]!, flat[i + 2]!, flat[i + 4]!, flat[i + 6]!]
    const ys = [flat[i + 1]!, flat[i + 3]!, flat[i + 5]!, flat[i + 7]!]
    out.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)])
  }
  return out
}

/** the characters after which TeX's url package may break a URL (url.sty's \UrlBreaks and \UrlBigBreaks; a hyphen only under
 *  its `hyphens` option) */
const URL_BREAKS = new Set(".@\\/!_|;>]),?&'+=#:")
/** a glyph's text as a copy text may hold it: as PDF.js gives it, or a ligature as its letters (ﬁ, ﬄ: NFKC) */
const lettersOf = (u: string) => u.replace(/[\uFB00-\uFB06]/g, (c) => c.normalize('NFKC'))
/**
 * Where a URL TeX set on one line may break (El.breaks): after a run of url.sty's break characters, never inside one (a
 * break after "https:" or "https:/" would leave "//…" or "/…" to start a line), at the middle of the paper between the run's
 * last glyph's ink and the next one's (their outlines where read, else their advances), with how much of its copy text `copy`
 * stands before it, in UTF-16 code units, the unit the typesetter slices it in: read off the text itself, each glyph found in
 * it in turn, so that a space it holds between two glyphs (urlCopyOf's, where they stand apart on a line), an astral
 * character's two units and a ligature's letters are counted as the text has them (a count of the glyphs misplaced every cut after any of them,
 * Devin on #630). None where the glyphs are not that text: a cut there would fall elsewhere than after a break. Its glyphs in
 * their order on the line
 */
export function urlBreaks(gs: readonly DocGlyph[], copy: string): [number, number][] {
  const line = gs.filter((g) => /\S/.test(g.u)).sort((a, b) => a.x0 - b.x0)
  // (the copy's code units through each glyph)
  const ends: number[] = []
  let at = 0
  for (const g of line) {
    while (at < copy.length && /\s/.test(copy[at]!)) at++
    const u = copy.startsWith(g.u, at) ? g.u : lettersOf(g.u)
    if (!copy.startsWith(u, at)) return []
    at += u.length
    ends.push(at)
  }
  const out: [number, number][] = []
  for (let k = 1; k < line.length; k++) {
    const a = line[k - 1]!,
      b = line[k]!
    if (!URL_BREAKS.has(a.u) || URL_BREAKS.has(b.u)) continue
    const right = a.ix1 > a.ix0 ? a.ix1 : a.x1,
      left = b.ix1 > b.ix0 ? b.ix0 : b.x0
    out.push([r2((right + left) / 2), ends[k - 1]!])
  }
  return out
}

/** how far apart two baselines are told (PDF units): a line's is stated to a hundredth, its glyphs' on A as the PDF wrote them */
const ON_BASE = 0.05
/** a word ends where two glyphs stand this share of their size apart, and a trail with it (the ink units' word rule, today's
 *  wordsOf: ink-units.mjs WORD_GAP) */
const WORD_GAP = 0.12
export { END, TRAIL }
/** a shared line's separation at most, in em of the follower's size, read from the leader's ink end (sepOf, the separation
 *  Placed.join states): a run-in head's \quad, a float split's word space (today's need.mjs SHARED_SEP, rowLeadOf, over the
 *  layout file's ink rows; rules.ts F.chains). Further apart, two pieces on one baseline are TeX's boxes set side by side (a
 *  running head's title and folio, two minipages' titles, 2609.36054v2 p1's footer "page 1 of 14" 4.3 em after a footnote's
 *  last line), not one line of a paragraph */
const SHARED_SEP = 3

/** each line's column and measure on A: on a page of two columns (lines on both halves that keep to their half), a line
 *  keeps to the left half (0), the right (1), or spans (2); its measure TeX's frame of it where TeX shipped the page's frame
 *  (`frames`: the column its extent meets alone, else the text block), else today's column of it (below; TeX's \parshape
 *  and \hangindent measures: stage 1b) */
function columnsAndMeasures(
  members: Member[],
  inkA: Doc,
  gA: (a: number) => DocGlyph,
  tableOf: (mem: Member) => number | undefined,
  frames: ReadonlyMap<number, TexFrame>,
): void {
  const byPage = new Map<number, Line[]>()
  for (const mem of members) for (const l of mem.lines) (byPage.get(l[0]) ?? byPage.set(l[0], []).get(l[0])!).push(l)
  for (const [p, lines] of byPage) {
    const v = inkA.pages[p - 1]!.view
    const mid = (v[0] + v[2]) / 2
    const left = lines.filter((l) => l[3] <= mid + 2).length
    const right = lines.filter((l) => l[2] >= mid - 2).length
    const two = left >= 3 && right >= 3
    for (const l of lines) l[1] = !two ? 0 : l[3] <= mid + 2 ? 0 : l[2] >= mid - 2 ? 1 : 2
  }
  // (each line's measure, today's column of it (run.mjs columnOf RUN:1557-1569, which U.decor widens a line of its own to): the
  // page's paragraphs' lines over its middle, three at least, else those of the nearest page before it that has three, else
  // the page's text area (its members' lines' hull); from their leftmost start to their furthest end, but a line TeX set
  // overfull: an end past the furthest end two lines share (within 0.2 pt) by less than the line's size is no edge)
  const paras = new Map<number, Line[]>()
  const area = new Map<number, [number, number]>()
  // (text lines: a display's rows and a held line, which today's rectangles leave out, are none; each by the extent of its
  // own text glyphs, which today's rectangles are (its words', an inline formula that overruns the line's end aside))
  for (const mem of members) {
    const text = new Set(mem.text)
    mem.lines.forEach((l, j) => {
      if (l[9] & 1) return
      const own = (mem.lineGlyphs[j] ?? []).filter((a) => text.has(a)).map(gA)
      const t: Line = own.length
        ? ([
            ...l.slice(0, 2),
            Math.min(...own.map((g) => g.x0)),
            Math.max(...own.map((g) => g.x1)),
            ...l.slice(4),
          ] as Line)
        : l
      const a = area.get(l[0])
      area.set(l[0], a ? [Math.min(a[0], t[2]), Math.max(a[1], t[3])] : [t[2], t[3]])
      if (mem.kind === 'para' && mem.located) (paras.get(l[0]) ?? paras.set(l[0], []).get(l[0])!).push(t)
    })
  }
  const columnOf = (l: Line, x0 = l[2]): [number, number] => {
    const mid = (x0 + l[3]) / 2
    const over = (q: number) => (paras.get(q) ?? []).filter((c) => c[2] <= mid && c[3] >= mid)
    let own = over(l[0])
    for (let q = l[0] - 1; own.length < 3 && q >= 1; q--) {
      const o = over(q)
      if (o.length >= 3) own = o
    }
    if (own.length < 3) return area.get(l[0]) ?? [l[2], l[3]]
    const ends = own.map((c) => c[3]).sort((x, y) => y - x)
    let right = ends[0] as number
    for (let i = 0; i + 1 < ends.length; i++)
      if ((ends[i] as number) - (ends[i + 1] as number) <= 0.2) {
        if ((ends[0] as number) - (ends[i] as number) < (l[10] ?? 10)) right = ends[i] as number
        break
      }
    return [Math.min(...own.map((c) => c[2])), right]
  }
  // (TeX's frame of a line: of its page's columns the one its extent meets alone, a line in the left column that hangs into the
  // gutter (a protruded stop, an overfull box) its column's; a line over both columns, in none (the gutter) or outside the text
  // block (a margin's, arXiv's turned stamp, ink no compile of the source sets), the text block. The gutter is no line's paper:
  // a line ends inside its column's measure (the maintainer, 2026-11-08: 2610.22065v1 p1's ACM reference line, today's run 16 pt
  // past its column into the gutter, called wrong); a name centred on the page is centred on the block's middle, never on a
  // hull of the page's ink that takes in the stamp at x 24 (2610.40645v1 p1's and 2610.10069v1 p1's "Abstract")
  const frameOf = (f: TexFrame, x0: number, x1: number): [number, number] => {
    const meets = f.columns.filter((c) => x1 > c[0] && x0 < c[1])
    return meets.length === 1 ? meets[0]! : f.block
  }
  const measures = new Map<Line, [number, number]>()
  // (a line's middle as today's widened block has it: from its label's start where its label stands on it, the label drawn
  // anew beginning the block (U.decor's first rectangle, RUN:2039); 1512.03385v1 p11's "Table 9." caption across both columns,
  // whose words' middle stands in the right column and whose block's in neither: the page's text area)
  for (const mem of members)
    for (const l of mem.lines) {
      const lb = mem.labelAt?.ink
      const on = lb && lb[0] === l[0] && Math.abs(lb[5] - l[4]) < ON_ROW * (l[10] ?? mem.style.size) && lb[1] < l[2]
      const f = frames.get(l[0])
      measures.set(l, f ? frameOf(f, on ? lb[1] : l[2], l[3]) : columnOf(l, on ? lb[1] : l[2]))
    }
  // (a table's cell: its line's room is its table's extent on the page where the table reaches past its text column, a float set
  // across both columns of a two-column page (2610.17024v1 p15's cell, whose room ended at the left column's edge, short of the
  // next cell's ink; today's widen ran on to it, its block's middle over the gutter giving it the page's text area): the hull of
  // the table's cells' lines there, the column's measure widened to it. A table inside one column keeps its column's measure)
  const tables = new Map<string, [number, number]>()
  for (const mem of members) {
    const t = tableOf(mem)
    if (t === undefined) continue
    for (const l of mem.lines) {
      if (l[9] & 1) continue
      const k = `${t}|${l[0]}`
      const h = tables.get(k)
      tables.set(k, h ? [Math.min(h[0], l[2]), Math.max(h[1], l[3])] : [l[2], l[3]])
    }
  }
  for (const mem of members) {
    const t = tableOf(mem)
    if (t === undefined) continue
    for (const l of mem.lines) {
      const h = tables.get(`${t}|${l[0]}`)
      const own = measures.get(l)
      if (h && own) measures.set(l, [Math.min(own[0], h[0]), Math.max(own[1], h[1])])
    }
  }
  for (const [l, [m0, m1]] of measures) {
    l[7] = r2(m0)
    l[8] = r2(m1)
  }
  // (a label that stands on none of its member's lines, IEEEtran's "TABLE I" on a line of its own: its own line's measure, as a
  // line's is read, the frame's column its extent meets alone, else its column)
  for (const mem of members) {
    const lb = mem.labelAt
    if (!lb || lb.line !== undefined) continue
    const f = frames.get(lb.ink[0])
    const l = [lb.ink[0], 0, lb.ink[1], lb.ink[3], lb.ink[5], lb.ink[4], lb.ink[2], 0, 0, 0] as Line
    const [m0, m1] = f ? frameOf(f, lb.ink[1], lb.ink[3]) : columnOf(l)
    mem.labelMeasure = [r2(m0), r2(m1)]
  }
}

/** a line's glyphs of an element as its text is read (facts.ts textOf): each spacing accent TeX set over its letter joined to it
 *  (joinAccents), the accent no glyph of its own. TeX's \accent raises the accent over its letter by the letter's height less
 *  the x-height, so `\v{c}`'s caron stands 0.05 pt over the line's baseline (2610.21312v1 p2's "(Marčenko and Pastur, 1967)"):
 *  read glyph by glyph, an element holding one stood on two baselines and stated no text, drawn as one crop no line could break,
 *  where the unit's own text reads the accent as its letter's. A script stays its own glyph: no accent is set over it */
const asRead = (gs: readonly number[], gA: (a: number) => DocGlyph): readonly DocGlyph[] => joinAccents(gs.map(gA))
/** whether an element's glyphs (by line, `groups`, read by `gA`, each line's with its ink's box on the line it stands on, `ink`,
 *  its baseline at 5) stand where its text is drawn: each glyph of a character on its line's baseline, as two baselines are
 *  told (ON_BASE: the line's stated to a hundredth, a glyph's as the PDF wrote it; TeX's positions fall on a half-hundredth
 *  often, 2610.40394v1 p34's line at 476.125, stated 476.12, its glyphs' floats rounding to either side), or, `raised`, over it
 *  (a symbol its reading raises) */
function standsAsDrawn(
  groups: readonly number[][],
  ink: readonly Ink[],
  raised: boolean,
  gA: (a: number) => DocGlyph,
): boolean {
  return groups.every((gs, q) =>
    asRead(gs, gA).every((g) => {
      if (!/\S/.test(g.u)) return true
      const base = (ink[q] as Ink)[5]
      return raised ? g.y > base + ON_BASE : Math.abs(g.y - base) <= ON_BASE
    }),
  )
}

/** the first ink under a height on a page across x0..x1: the highest top under `foot` of a glyph that is ink (isInk, whatever its
 *  Unicode; something of it shown) or of a box (a page-sized one aside: a background), -Infinity for none; each page's ink sorted by its
 *  tops once, read by halving from the top down (roomOf asks it under each member's last line and each run's) */
type InkUnder = (page: number, foot: number, x0: number, x1: number) => number
/** the next ink's line under a height across x0..x1: of the ink whose top stands under `foot`, the highest baseline, a glyph's
 *  own (TeX's \baselineskip runs between baselines), a box's top (a rule, a picture: no baseline over it); -Infinity for none */
type InkNext = InkUnder
function inkIndex(inkA: Doc): { under: InkUnder; next: InkNext } {
  const byPage = new Map<number, { top: Float64Array; base: Float64Array; x0: Float64Array; x1: Float64Array }>()
  const indexOf = (page: number) => {
    const got = byPage.get(page)
    if (got) return got
    const pg = inkA.pages[page - 1]!
    const W = pg.view[2] - pg.view[0]
    const H = pg.view[3] - pg.view[1]
    const all: [number, number, number, number][] = []
    for (const g of pg.glyphs) if (isInk(g) && !g.unseen) all.push([g.top, Math.min(g.y, g.top), g.x0, g.x1])
    for (let b = 0; b < pg.kinds.length; b++) {
      const qx0 = pg.boxes[4 * b]!
      const qy0 = pg.boxes[4 * b + 1]!
      const qx1 = pg.boxes[4 * b + 2]!
      const qy1 = pg.boxes[4 * b + 3]!
      if (!(qx1 - qx0 >= 0.9 * W && qy1 - qy0 >= 0.75 * H)) all.push([qy1, qy1, qx0, qx1])
    }
    all.sort((a, b) => b[0] - a[0])
    const ix = {
      top: Float64Array.from(all, (a) => a[0]),
      base: Float64Array.from(all, (a) => a[1]),
      x0: Float64Array.from(all, (a) => a[2]),
      x1: Float64Array.from(all, (a) => a[3]),
    }
    byPage.set(page, ix)
    return ix
  }
  const firstUnder = (ix: ReturnType<typeof indexOf>, foot: number) => {
    let lo = 0
    let hi = ix.top.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((ix.top[mid] as number) >= foot) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  return {
    under: (page, foot, x0, x1) => {
      const ix = indexOf(page)
      for (let k = firstUnder(ix, foot); k < ix.top.length; k++)
        if ((ix.x1[k] as number) > x0 && (ix.x0[k] as number) < x1) return ix.top[k] as number
      return Number.NEGATIVE_INFINITY
    },
    // (by tops downward: a baseline is never over its own top, so none further down is higher than the best once tops fall
    // under it)
    next: (page, foot, x0, x1) => {
      const ix = indexOf(page)
      let best = Number.NEGATIVE_INFINITY
      for (let k = firstUnder(ix, foot); k < ix.top.length && (ix.top[k] as number) > best; k++)
        if ((ix.x1[k] as number) > x0 && (ix.x0[k] as number) < x1) best = Math.max(best, ix.base[k] as number)
      return best
    },
  }
}

/** the free depth under a member's last line in its column, to the first ink not its own (a page's glyph or box), the page's
 *  bottom edge where there is none; the distance to the next text line of its column, baseline to baseline; and, with TeX's
 *  facts, the room under each run of its text lines and its paragraph's separation (Room.runs, Room.sep: what a translation
 *  may borrow, the owner's ruling of 2026-11-08) */
function roomOf(
  mem: Member,
  inkA: Doc,
  offA: Int32Array,
  ink: { under: InkUnder; next: InkNext },
  tex: { frames: ReadonlyMap<number, TexFrame>; runs: boolean; sep: number | undefined },
): Room {
  const inkBelow = ink.under
  const last = mem.lines.at(-1)!
  // (its last block, as Room.below and Room.next read it, from its line `at` up: its lines on the page each standing above the one
  // under it and across its column, to a kept row (a display, a held line: today's blocks split there); across: the block's
  // column, its lines' measures, as design-a's "the next text line of its column" reads it, which a translation's last line may
  // fill whatever the original's extent; never a column of its before a column break (a caption whose short last line keeps to
  // one column of a block across both stands in the block over it))
  const lastBlockOf = (at: number) => {
    const end = mem.lines[at] as Line
    let x0 = Math.min(end[7], end[2])
    let x1 = Math.max(end[8], end[3])
    let over = end[4]
    let from = at
    for (let q = at - 1; q >= 0; q--) {
      const l = mem.lines[q] as Line
      if (l[9] & 1 || l[0] !== end[0] || l[4] <= over || Math.max(l[8], l[3]) <= x0 || Math.min(l[7], l[2]) >= x1) break
      x0 = Math.min(x0, l[7], l[2])
      x1 = Math.max(x1, l[8], l[3])
      over = l[4]
      from = q
    }
    return { from, x0, x1 }
  }
  // (the free depth under a line across x0..x1: from its bottom to the first ink under it, whoever's it is (its own kept rows and
  // elements under it too), the page's bottom edge where there is none)
  const depthUnder = (l: Line, x0: number, x1: number): number => {
    const pg = inkA.pages[l[0] - 1]!
    const next = inkBelow(l[0], l[6] - 0.5, x0, x1)
    return r2(Math.min(pg.view[3] - pg.view[1], Math.max(0, l[6] - (Number.isFinite(next) ? next : pg.view[1]))))
  }
  // (its last text line: the last line not kept, the first where every line is; its block)
  let at = mem.lines.length - 1
  while (at > 0 && (mem.lines[at] as Line)[9] & 1) at--
  const lastText = mem.lines[at] as Line
  const tp = lastText[0]
  const { x0: bx0, x1: bx1 } = lastBlockOf(at)
  // (the room below: from its last line's bottom to the first ink under it across its last block (its lines' measures, as for the
  // next line: a translation's lines span the block, so what stands under the block's full lines is under its last, a display,
  // the checkpoint's free-11))
  const [p, , lx0, lx1] = last
  const below = depthUnder(last, p === tp ? Math.min(lx0, bx0) : lx0, p === tp ? Math.max(lx1, bx1) : lx1)
  // (the next line under its last text line (today's edgesOf `below` RUN:1655): from that line's baseline, across its last
  // block, the page's glyphs under that baseline by more than three quarters of its pitch, its own travelling ink aside (its text,
  // label and elements set anew: a script of its last line) and its kept rows counted (a display that stays under it is the next
  // ink the fill meets); of the highest, those within half a size, their median baseline)
  const travels = new Set<number>([...mem.text, ...mem.label])
  for (const [id, l] of mem.els) if (!mem.elements.find(([k]) => k === id)?.[1].keep) for (const a of l) travels.add(a)
  const T = lastText[4] - 0.75 * (mem.lead > 0 ? mem.lead : 1.2 * mem.style.size)
  const off = offA[tp - 1] as number
  const under: DocGlyph[] = []
  inkA.pages[tp - 1]!.glyphs.forEach((g, j) => {
    if (isInk(g) && !g.unseen && g.y < T && g.x1 > bx0 && g.x0 < bx1 && !travels.has(off + j)) under.push(g)
  })
  let nextBase: number | null = null
  if (under.length) {
    const top = Math.max(...under.map((g) => g.y))
    const ys = under
      .filter((g) => g.y > top - 0.5 * g.size)
      .map((g) => g.y)
      .sort((a, b) => a - b)
    nextBase = ys[(ys.length - 1) >> 1] as number
  }
  // (the room under each run of its text lines, from its last up (today's freeFor, RUN:1677, which RUN:2193 gives every block but
  // a cell's): a member running on to the next page or column may borrow at the foot of the one it leaves, a run over a kept row
  // of its own only down to that row. A run: its lines on one page each standing above the one under it and across its column
  // (its lines' measures), with no other ink between the two (the first ink under the upper the lower's own: a float TeX set
  // between two lines of a paragraph ends a run, as today's blocks end at its gap), to a kept row. Its room is read across it as
  // its lines are laid (today's block's extent, the typesetter's measure): its lines' own hull, from their start (a member's
  // first line on a row it shares starts there) to their furthest end, a line borrowed under it laid at its last line's (a
  // paragraph set beside a figure, 2602.23285v2 p5 t32: read to the column's end, the figure beside it was the ink under every
  // line); a run of one line to its column's end (a single line widened to it, U.decor, RUN:1576). Stated where TeX states its
  // page's text block bottom
  // (TeX's frame, Instrument.tex.frames' foot): the depth under the run's last baseline of the next ink's baseline (a glyph's;
  // a box's top), the page's bottom edge where none, and of that bottom)
  const runs: [number, number, number][] = []
  for (let e = mem.lines.length - 1; tex.runs && e >= 0; ) {
    const end = mem.lines[e] as Line
    if (end[9] & 1) {
      e--
      continue
    }
    let mx0 = Math.min(end[7], end[2])
    let mx1 = Math.max(end[8], end[3])
    let ox0 = end[2]
    let ox1 = end[3]
    let from = e
    for (let q = e - 1; q >= 0; q--) {
      const l = mem.lines[q] as Line
      const lower = mem.lines[q + 1] as Line
      if (l[9] & 1 || l[0] !== end[0] || l[4] <= lower[4] || Math.max(l[8], l[3]) <= mx0 || Math.min(l[7], l[2]) >= mx1)
        break
      // (another's ink between, across the two lines' hull: the first under the upper higher than the lower's own top, its
      // hundredth aside)
      if (inkBelow(l[0], l[6] - 0.5, Math.min(ox0, l[2]), Math.max(ox1, l[3])) > lower[5] + 0.005) break
      mx0 = Math.min(mx0, l[7], l[2])
      mx1 = Math.max(mx1, l[8], l[3])
      ox0 = Math.min(ox0, l[2])
      ox1 = Math.max(ox1, l[3])
      from = q
    }
    const foot = tex.frames.get(end[0])?.foot
    if (foot !== undefined) {
      const next = ink.next(end[0], end[6] - 0.5, ox0, from === e ? mx1 : ox1)
      const pg = inkA.pages[end[0] - 1]!
      runs.push([e, r2(end[4] - (Number.isFinite(next) ? next : pg.view[1])), r2(end[4] - foot)])
    }
    e = from - 1
  }
  runs.reverse()
  return {
    below,
    ...(nextBase !== null ? { next: r2(lastText[4] - nextBase) } : {}),
    ...(runs.length ? { runs } : {}),
    ...(tex.sep !== undefined ? { sep: tex.sep } : {}),
  }
}
