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
import type { Line, LinkBorder, Piece } from '@readarxiv/format'
import type { Mapping } from '../align/align.ts'
import type { Doc } from '../doc.ts'
import type { Instrument } from '../instrument.ts'
import { centredByBlock, END, TRAIL } from './facts.ts'
import { factsOf } from './facts-pass.ts'
import { keepArtefacts } from './artefacts.ts'
import { endMarks } from './end-marks.ts'
import { frameMeasures, lineGeometry, rooms } from './geometry.ts'
import { placeUnits } from './members.ts'
import { sentenceStarts } from './sentences.ts'
import { unitsBornOnA, unitsMadeOnA } from './page-units.ts'
import { claimTrails } from './trails.ts'
import { isInk, r2 } from './lines.ts'
import {
  BRACKET,
  eachBetweenPaired,
  FREE,
  field,
  HELD,
  type Located,
  type LocateOptions,
  type Member,
  ON_ROW,
  open,
  piecesOf,
  sameColumn,
} from './work.ts'

export { eachBetweenPaired, FREE, HELD, type Located, type LocateOptions, type Member }
export { urlBreaks } from './geometry.ts'
export { TEXT_NAMES } from './page-units.ts'
export type { Place } from './work.ts'

export function locate(ins: Instrument, inkA: Doc, m: Mapping, o: LocateOptions = {}): Located {
  const w = open(ins, inkA, m)
  const { B, NB, unitB, roleB, pieceB, pageB, pageA, gA, gB, framesA } = w.ix
  const { claimedA, units, members, stats, displays, floatLines } = w
  const noteUnlocated = (c: string) => {
    stats.unlocated[c] = (stats.unlocated[c] ?? 0) + 1
  }
  placeUnits(w)

  claimTrails(w)

  keepArtefacts(w)

  unitsMadeOnA(w, o)

  unitsBornOnA(w)
  const born = field(w, 'born')

  lineGeometry(w)

  sentenceStarts(w)

  frameMeasures(w)
  endMarks(w)
  rooms(w)
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

export { END, TRAIL }
/** a shared line's separation at most, in em of the follower's size, read from the leader's ink end (sepOf, the separation
 *  Placed.join states): a run-in head's \quad, a float split's word space (today's need.mjs SHARED_SEP, rowLeadOf, over the
 *  layout file's ink rows; rules.ts F.chains). Further apart, two pieces on one baseline are TeX's boxes set side by side (a
 *  running head's title and folio, two minipages' titles, 2609.36054v2 p1's footer "page 1 of 14" 4.3 em after a footnote's
 *  last line), not one line of a paragraph */
const SHARED_SEP = 3
