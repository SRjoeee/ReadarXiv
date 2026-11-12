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
import type { Piece } from '@readarxiv/format'
import type { Mapping } from '../align/align.ts'
import type { Doc } from '../doc.ts'
import type { Instrument } from '../instrument.ts'
import { END, TRAIL } from './facts.ts'
import { factsOf } from './facts-pass.ts'
import { keepArtefacts } from './artefacts.ts'
import { endMarks } from './end-marks.ts'
import { frameMeasures, lineGeometry, rooms } from './geometry.ts'
import { flowsAndTies, rowAligns } from './flows.ts'
import { leadNames } from './leads.ts'
import { linksOnA } from './links.ts'
import { placeUnits } from './members.ts'
import type { Owned } from './ownership.ts'
import { sentenceStarts } from './sentences.ts'
import { unitsBornOnA, unitsMadeOnA } from './page-units.ts'
import { claimTrails } from './trails.ts'
import {
  eachBetweenPaired,
  FREE,
  field,
  HELD,
  type Located,
  type LocateOptions,
  type Member,
  open,
  piecesOf,
  type Work,
} from './work.ts'

export { eachBetweenPaired, FREE, HELD, type Located, type LocateOptions, type Member }
export { urlBreaks } from './geometry.ts'
export { TEXT_NAMES } from './page-units.ts'
export type { Place } from './work.ts'

// ---- the facts today's reader works out from the page before it typesets (stage 1a-2: facts-pass.ts)
function facts(w: Work): void {
  const { ins, inkA, m, unitB, roleB, pieceB, pageA, framesA } = w.ix
  const { members, units } = w
  const owned: Owned = w.claims
  factsOf({ ins, inkA, m, members, owned, pageA, unitB, roleB, pieceB, units, framed: new Set(framesA.keys()) })
}

/** locate's phases, called in the order they run, which is the contract: each phase's file says what it reads of the record
 *  and what it writes, and a field one phase assigns is read only after it (work.ts `field`) */
export function locate(ins: Instrument, inkA: Doc, m: Mapping, o: LocateOptions = {}): Located {
  const w = open(ins, inkA, m)
  placeUnits(w) // 1
  claimTrails(w) // 2
  keepArtefacts(w) // 3
  unitsMadeOnA(w, o) // 4
  unitsBornOnA(w) // 5
  lineGeometry(w) // 6
  sentenceStarts(w) // 7
  frameMeasures(w) // 8
  endMarks(w) // 9
  // (the last claim made: a write after it throws)
  w.claims.freeze()
  rooms(w) // 10
  leadNames(w) // 11
  facts(w) // 12
  flowsAndTies(w) // 13
  rowAligns(w) // 14
  linksOnA(w, o) // 15
  return close(w)
}

/** what locate states, read off the record its phases wrote: the wrap's groups, the counts */
function close(w: Work): Located {
  const { ins, inkA, m, pageA } = w.ix
  const { units, members, stats, displays, floatLines } = w
  const born = field(w, 'born')
  const flows = field(w, 'flows')
  const ties = field(w, 'ties')
  const links = field(w, 'links')
  const noteUnlocated = (c: string) => {
    stats.unlocated[c] = (stats.unlocated[c] ?? 0) + 1
  }
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

export { END, TRAIL }
