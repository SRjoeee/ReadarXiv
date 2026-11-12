// Phases 4 and 5 of locate (PHASES, locate.ts): the units no source unit is, made on A by ink.ts; then the units born on A
// (born.ts), of the glyphs B never printed that nothing else made a unit of.
// Phase 4, unitsMadeOnA: reads the index, the options' pages, the record's `claimedA` and `members` (a glyph's owner), `released`
// (phase 1's) and `pitch` (phase 3's); writes `units` and `members` (each unit made pushed, its member's glyph and box lists),
// `claimedA` (its two writes), `jointPiece`, `displays`, `floatLines`, `stats.made`, and the kind of an author block's member
// set away from the block.
// Phase 5, unitsBornOnA: reads the index and `claimedA` (the glyphs free); writes `members` (each unit born pushed, its text),
// `claimedA` (its one write), `stats.born`, `stats.bornGlyphs`, `born` (assigned: read by phase 7 and close).
import { type Piece, unitId } from '@readarxiv/format'
import { HUNK, hunkName } from '../align/align.ts'
import { bornOf } from './born.ts'
import { sourceText } from './facts.ts'
import { inkOf } from './ink.ts'
import { empty } from './place.ts'
import {
  AUTHOR_KINDS,
  assign,
  eachBetweenPaired,
  field,
  HELD,
  type LocateOptions,
  piecesOf,
  type Work,
} from './work.ts'

/** the kind of a member of the author block's units set away from the block under the title (author-block.ts): the text it is
 *  there, of no toggle (the reader's and the content classes' tables name it nowhere: always translated) */
export const TEXT_NAMES = 'textnames'

export function unitsMadeOnA(w: Work, o: LocateOptions): void {
  const { ins, inkA, m, pageA, setA, fixedFaces, unitB, gA } = w.ix
  const { claimedA, members, units, stats, jointPiece, displays, floatLines } = w
  const released = field(w, 'released')
  const { artefacts, figureArtefact } = field(w, 'pitch')
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
      // its group `.l`, stated with its ink and the line it stands on by phase 6, geometry.ts)
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
}

export function unitsBornOnA(w: Work): void {
  const { inkA, m, pageA, setA } = w.ix
  const { claimedA, members, stats } = w
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
  assign(w, 'born', born)
}
