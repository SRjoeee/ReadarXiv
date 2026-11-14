// Phases 13 and 14 of locate (locate.ts).
// Phase 13, flowsAndTies: the flows (members TeX set in one paragraph, one after the other on a shared line), the ties (a
// table's cells, a figure's set, a flow's members, laid together), a name that leads a unit placed in its flow. Reads the index
// and the record's `members` (their lines, measures, leads: phases 6, 8, 11) and `units`; writes the members' joins, `flows`
// and `ties` (assigned: read by phase 14 and close).
// Phase 14, rowAligns: a single line read centred by its block, read again over the row its flow shares. Reads `members` and
// `flows`; writes the members' alignment.
import type { Line } from '@readarxiv/format'
import { centredByBlock } from './facts.ts'
import { isInk, r2 } from './lines.ts'
import { assign, BRACKET, field, type Located, type Member, ON_ROW, sameColumn, type Work } from './work.ts'

/** a shared line's separation at most, in em of the follower's size, read from the leader's ink end (sepOf, the separation
 *  Placed.join states): a run-in head's \quad, a float split's word space (today's need.mjs SHARED_SEP, rowLeadOf, over the
 *  layout file's ink rows; lab/typeset/registry.ts F.chains). Further apart, two pieces on one baseline are TeX's boxes set
 *  side by side (a running head's title and folio, two minipages' titles, 2609.36054v2 p1's footer "page 1 of 14" 4.3 em after
 *  a footnote's last line), not one line of a paragraph */
const SHARED_SEP = 3

export function flowsAndTies(w: Work): void {
  const { ins, B, NB, m, inkA, pageB, unitB, gA } = w.ix
  const { members, units } = w
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
  // after its last, as a name leads the unit after it (leads.ts). amsthm's head no source unit owns, made on A, and its theorem's
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
  assign(w, 'flows', flows)
  assign(w, 'ties', ties)
}

// ---- a single line read centred by its block, on a row it shares with the members its flow joins to it there (a run-in
// theorem head between its label and its text, 2610.30034v1 p5's "Lemma 3 (Bellman-objective decomposition): Let"): its
// alignment is TeX's line's, never a fragment's, read again over the row, its label's start to the last member's end on it;
// its fragment's middle at the column's was a coincidence of the note's length, and its translation was set from the
// fragment's middle, 36 pt into the column (today's maker reads the line with its label: MAKE:2121-2135)
/** a single line's alignment its block read centred (Member.byBlock), read again over the TeX line its flow says it shares: the
 *  row from its label's start (or the first member's start the flow joins before it on that row) to the last member's end the
 *  flow joins after it there; justified where the row's stack does not centre it (centredByBlock over the row, the row's own
 *  lines out of the stack) */
export function rowAligns(w: Work): void {
  const { members } = w
  const flows = field(w, 'flows')
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
