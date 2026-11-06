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
// - Members: one placement per unit, a babel name's every occurrence its own; then the units born on A (born.ts) from the
//   glyphs B never printed. Flows: members that share a TeX line, consecutive in the stream. Ties: a table's cells; a
//   figure's set. Links: A's annotations, each owned by the element or the text its rectangle lies over.
// - Groups (design §4.5): per member and page, `<ord>.<page>.t` its text (and a name's or figure text's word), `.e` its
//   travelling elements, `.l` its label; a display, a kept block and what is not located are in no group.
import { type El, type Ink, type Label, type Line, type Piece, type Room, type Style, unitId } from '@readarxiv/format'
import type { Mapping } from '../align/align.ts'
import { HUNK, hunkName } from '../align/align.ts'
import type { Doc, DocGlyph } from '../doc.ts'
import { isImage, isPath } from '../doc.ts'
import { type Instrument, ROLE } from '../instrument.ts'
import { styleOf } from './facts.ts'
import { bornOf } from './born.ts'
import { factsOf } from './facts-pass.ts'
import { type CutLine, cutLines, r2 } from './lines.ts'
import { type RowBox, rowsOf } from './rows.ts'

/** where a located unit stands on A against B */
export type Place = 'same' | 'shifted' | 'respaced' | 'rebroken'

export interface Member {
  ord: number
  /** the instrument's unit (-1: born on A) */
  unit: number
  id: string
  kind: string
  /** a babel name's key, for a name's occurrence */
  name?: string
  located: boolean
  /** why it is not located: the class of its first unmatched glyph, `box`, `no ink` or the instrument's why */
  cause?: string
  place?: Place
  /** its ink stays (a kept block): in no group */
  fixed: boolean
  figure: boolean
  /** A's glyphs (global) by role; elements by piece id */
  text: number[]
  label: number[]
  els: Map<string, number[]>
  /** A's boxes ([page, index]) by role */
  textBoxes: [number, number][]
  elBoxes: Map<string, [number, number][]>
  /** A's turned glyphs ([page, index among the page's turned]): a figure text set turned */
  turned: [number, number][]
  lines: Line[]
  elements: [string, El][]
  labelAt?: Label
  style: Style
  align: 'j' | 'l' | 'c' | 'r'
  lead: number
  room: Room
  pages: number[]
  join?: [number] | [number, 1]
  dir?: [number, number]
  /** its first and last glyph on B (global), -1 for none */
  bFirst: number
  bLast: number
  /** the class's marks after its text (C20) */
  tail?: [string, Style][]
  /** the facts it carries as read on A by today's reader's rule, not stated by TeX (stage 1b states them) */
  read: string[]
  /** each line's glyphs on A (global), by line, for the facts read after the lines */
  lineGlyphs: number[][]
}

export interface Located {
  members: Member[]
  /** the units born on A (their content, for Units) by member ord */
  born: Map<number, { kind: string; content: Piece[] }>
  flows: number[][]
  ties: ({ rule: 'cells'; cells: number[][]; head?: 1 } | { rule: 'size'; ords: number[] })[]
  links: Map<
    number,
    { box: [number, number, number, number]; to: { url: string } | { dest: string }; owner?: [number, string] }[]
  >
  /** per A page (index p - 1): each glyph's and each box's group (the wrap's plan), null for none */
  groups: { glyphs: (string | null)[]; boxes: (string | null)[]; turned: (string | null)[] }[]
  /** groups that are figure texts' (the wrap writes their runs inside a form in the form) */
  figureGroups: Set<string>
  stats: {
    units: number
    located: number
    unlocated: Record<string, number>
    places: Record<Place, number>
    born: number
    bornGlyphs: number
  }
}

/** an A glyph's owner in `claimedA` where no member owns it: free (born.ts may make a unit of it), or held as A's ink inside a
 *  unit that stays the original's */
export const FREE = -1
export const HELD = -2

/** an element kind whose glyphs are a reading of it: its text is stated */
const TEXT_KINDS = new Set(['cite', 'ref', 'eqref', 'url', 'number', 'footnote', 'macro'])
const LABEL_KIND: Record<string, Label['kind']> = {
  caption: 'float',
  heading: 'head',
  theorem: 'head',
  footnote: 'mark',
}

/** a unit's pieces by id, spans opened */
function piecesOf(content: readonly Piece[], out = new Map<string, Piece>()): Map<string, Piece> {
  for (const p of content) {
    if (p.t === 'el' || p.t === 'unit') out.set(p.id, p)
    else if (p.t === 'span') {
      out.set(p.id, p)
      piecesOf(p.content, out)
    }
  }
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

export interface LocateOptions {
  /** each A page's annotations as PDF.js gives them (getAnnotations), for the links */
  annotations?: (unknown[] | null)[]
}

export function locate(ins: Instrument, inkA: Doc, m: Mapping, o: LocateOptions = {}): Located {
  const B = ins.ink
  const NB = m.offB[B.pages.length] as number
  const NA = m.offA[inkA.pages.length] as number
  // flat owners of B, and each document's glyph by global index
  const unitB = new Int32Array(NB).fill(-1)
  const roleB = new Uint8Array(NB)
  const pieceB = new Int32Array(NB).fill(-1)
  const pageB = new Int32Array(NB)
  B.pages.forEach((pg, p) => {
    const o0 = m.offB[p] as number
    const ow = ins.glyphs[p]
    for (let j = 0; j < pg.glyphs.length; j++) {
      pageB[o0 + j] = p + 1
      if (!ow) continue
      unitB[o0 + j] = ow.unit[j] as number
      roleB[o0 + j] = ow.role[j] as number
      pieceB[o0 + j] = ow.piece[j] as number
    }
  })
  const pageA = new Int32Array(NA)
  inkA.pages.forEach((pg, p) => {
    for (let j = 0; j < pg.glyphs.length; j++) pageA[(m.offA[p] as number) + j] = p + 1
  })
  const gA = (a: number): DocGlyph => {
    const p = (pageA[a] as number) - 1
    return inkA.pages[p]!.glyphs[a - (m.offA[p] as number)]!
  }
  const gB = (b: number): DocGlyph => {
    const p = (pageB[b] as number) - 1
    return B.pages[p]!.glyphs[b - (m.offB[p] as number)]!
  }
  const atA = (a: number) => ({ page: pageA[a] as number, g: gA(a) })
  /** A's boxes ([page, index]) as rows.ts takes them */
  const boxesOf_ = (l: readonly [number, number][]): RowBox[] =>
    l.map(([ap, ai]) => {
      const b = inkA.pages[ap - 1]!.boxes
      return { page: ap, x0: b[4 * ai]!, y0: b[4 * ai + 1]!, x1: b[4 * ai + 2]!, y1: b[4 * ai + 3]! }
    })
  const atB = (b: number) => ({ page: pageB[b] as number, g: gB(b) })

  // each unit's B glyphs and boxes
  const glyphsOf = new Map<number, number[]>()
  for (let b = 0; b < NB; b++) {
    const u = unitB[b] as number
    if (u < 0) continue
    const l = glyphsOf.get(u)
    if (l) l.push(b)
    else glyphsOf.set(u, [b])
  }
  const boxesOf = new Map<number, [number, number][]>()
  B.pages.forEach((pg, p) => {
    const ow = ins.boxes[p]
    if (!ow) return
    for (let x = 0; x < pg.kinds.length; x++) {
      const u = ow.unit[x] as number
      if (u < 0) continue
      const l = boxesOf.get(u)
      if (l) l.push([p, x])
      else boxesOf.set(u, [[p, x]])
    }
  })

  const turnedOf = new Map<number, [number, number][]>()
  ;(ins.turned ?? []).forEach((ow, p) => {
    for (let j = 0; j < ow.unit.length; j++) {
      const u = ow.unit[j] as number
      if (u < 0) continue
      const l = turnedOf.get(u)
      if (l) l.push([p, j])
      else turnedOf.set(u, [[p, j]])
    }
  })
  const claimedA = new Int32Array(NA).fill(FREE)
  const members: Member[] = []
  const stats: Located['stats'] = {
    units: ins.units.length,
    located: 0,
    unlocated: {},
    places: { same: 0, shifted: 0, respaced: 0, rebroken: 0 },
    born: 0,
    bornGlyphs: 0,
  }
  const noteUnlocated = (c: string) => {
    stats.unlocated[c] = (stats.unlocated[c] ?? 0) + 1
  }
  const empty = (u: number, kind: string, id: string): Member => ({
    ord: members.length,
    unit: u,
    id,
    kind,
    located: false,
    fixed: false,
    figure: false,
    text: [],
    label: [],
    els: new Map(),
    textBoxes: [],
    elBoxes: new Map(),
    turned: [],
    lines: [],
    elements: [],
    style: { role: 'serif', size: 10 },
    align: 'j',
    lead: 12,
    room: { below: 0 },
    pages: [],
    bFirst: -1,
    bLast: -1,
    read: [],
    lineGlyphs: [],
  })

  /** one placement of unit u from its B glyphs `list` and boxes `boxes` */
  const place = (
    u: number,
    list: number[],
    boxes: [number, number][],
    name?: string,
    turnedB: [number, number][] = [],
  ): Member => {
    const unit = ins.units[u]!
    const mem = empty(u, name !== undefined ? 'name' : unit.kind, unit.id)
    if (name !== undefined) mem.name = name
    mem.fixed = !!unit.fixed
    mem.figure = !!unit.figure
    if (unit.figure?.dir) mem.dir = unit.figure.dir
    if (list.length) {
      mem.bFirst = list[0] as number
      mem.bLast = list.at(-1) as number
    }
    mem.align = unit.align ?? 'j'
    // (no glyph of its own: nothing a translation replaces and no line to lay it on. Where it owns rules or images alone, they
    // stay A's ink, in no group, as a kept element's: `no text`)
    if (!list.length && !turnedB.length) {
      mem.cause = unit.why ?? (boxes.length ? 'no text' : 'no ink')
      return mem
    }
    let bad: string | null = null
    const aIdx: number[] = []
    for (const b of list) {
      const a = m.bToA[b] as number
      if (a >= 0) {
        aIdx.push(a)
        continue
      }
      if (m.hunkB[b] === HUNK.hyphen || m.offpageB[b]) continue
      bad ??= `content difference: ${hunkName(m.hunkB[b] as number) === 'none' ? 'bonly' : hunkName(m.hunkB[b] as number)}`
    }
    const boxPartners: [ap: number, ai: number, p: number, x: number][] = []
    for (const [p, x] of boxes) {
      const kind = B.pages[p]!.kinds[x] as number
      const ap = m.boxPage[p]?.[x] ?? 0
      if (!(isPath(kind) || isImage(kind)) || ap === 0) {
        bad ??= 'content difference: a rule or image with no partner'
        continue
      }
      boxPartners.push([ap, m.boxIndex[p]![x] as number, p, x])
    }
    const turnedA: [number, number][] = []
    let turnedSame = true
    for (const [p, j] of turnedB) {
      const ap = m.turnedPage[p]?.[j] ?? 0
      if (ap === 0) {
        bad ??= 'content difference: a turned glyph with no partner'
        continue
      }
      const aj = m.turnedIndex[p]![j] as number
      turnedA.push([ap, aj])
      const tb = B.pages[p]!.turned![j]!
      const ta = inkA.pages[ap - 1]!.turned![aj]!
      if (ap !== p + 1 || Math.abs(ta.ox - tb.ox) > 0.01 || Math.abs(ta.oy - tb.oy) > 0.01) turnedSame = false
    }
    // its A ink by role
    const roleOfB = (b: number): [number, number] => [roleB[b] as number, pieceB[b] as number]
    const roleAt = new Map<number, [number, number]>()
    for (const b of list) {
      const a = m.bToA[b] as number
      if (a >= 0) roleAt.set(a, roleOfB(b))
    }
    // (A's glyphs with no partner inside its span, between two matched glyphs of its own: its ink only where the alignment
    // shows they are its text. That is a hunk align classes `hyphen` (A's glyphs there spell B's once line-end hyphens are out:
    // a word arXiv's page broke at a line end where our compile did not) whose B side holds the unit's glyphs alone, or none.
    // A glyph drawn inside a form XObject between glyphs that are not is an included figure's own text, no glyph of the unit's
    // text: it stays unclaimed (born.ts gives it to a figure text). Any other is text A sets inside the unit that our compile
    // does not: a content difference, and the unit stays the original's (as for B's glyphs with no partner; no fuzzy rescue).
    // A unit that stays the original's holds those glyphs as A's ink (HELD): they are no unit born on A)
    const claims: [number, [number, number]][] = []
    if (aIdx.length) {
      const sorted = [...aIdx].sort((x, y) => x - y)
      const lo = sorted[0] as number
      const hi = sorted.at(-1) as number
      for (let a = lo; a <= hi; a++) {
        if ((m.aToB[a] as number) >= 0 || m.offpageA[a] || (claimedA[a] as number) !== FREE) continue
        let pv = a - 1
        while (pv >= lo && (m.aToB[pv] as number) < 0) pv--
        let nx = a + 1
        while (nx <= hi && (m.aToB[nx] as number) < 0) nx++
        if (pv < lo || nx > hi) continue
        const bp = m.aToB[pv] as number
        const bn = m.aToB[nx] as number
        if (unitB[bp] !== u || unitB[bn] !== u) continue
        let own = m.hunkA[a] === HUNK.hyphen
        for (let b = Math.min(bp, bn) + 1; own && b < Math.max(bp, bn); b++)
          if ((m.bToA[b] as number) < 0 && unitB[b] !== u) own = false
        if (own) {
          const rp = roleOfB(bp)
          const rn = roleOfB(bn)
          claims.push([a, rp[0] === rn[0] && rp[1] === rn[1] ? rp : [ROLE.text, -1]])
          continue
        }
        if (gA(a).form && !gA(pv).form && !gA(nx).form) continue
        claims.push([a, [ROLE.none, -1]])
        const h = hunkName(m.hunkA[a] as number)
        bad ??= `content difference: ${h === 'none' || h === 'hyphen' ? 'aonly' : h}`
      }
    }
    if (bad || (!aIdx.length && !turnedA.length)) {
      for (const [a] of claims) claimedA[a] = HELD
      mem.cause = bad ?? 'no ink'
      return mem
    }
    for (const [a, r] of claims) roleAt.set(a, r)
    mem.located = true
    mem.turned = turnedA
    if (!aIdx.length) {
      mem.place = turnedSame ? 'same' : 'shifted'
      return mem
    }
    for (const [a, [role, k]] of [...roleAt].sort((x, y) => x[0] - y[0])) {
      claimedA[a] = mem.ord
      if (role === ROLE.label) mem.label.push(a)
      else if (role === ROLE.element && k >= 0) {
        const id = String(k)
        const l = mem.els.get(id)
        if (l) l.push(a)
        else mem.els.set(id, [a])
      } else mem.text.push(a)
    }
    for (const [ap, ai, p, x] of boxPartners) {
      const role = ins.boxes[p]!.role[x] as number
      const k = ins.boxes[p]!.piece[x] as number
      if (role === ROLE.element && k >= 0) {
        const id = String(k)
        const l = mem.elBoxes.get(id)
        if (l) l.push([ap, ai])
        else mem.elBoxes.set(id, [[ap, ai]])
      } else mem.textBoxes.push([ap, ai])
    }
    // where it stands on A against B
    {
      const own = list.filter((b) => (m.bToA[b] as number) >= 0)
      const linesB = cutLines(own, atB)
      const lineOf = new Map<number, number>()
      linesB.forEach((l, q) => {
        for (const b of l.gs) lineOf.set(b, q)
      })
      let same = true
      let rigid = true
      const off = new Map<number, [number, number, number]>()
      for (const b of own) {
        const a = m.bToA[b] as number
        const g = gB(b)
        const h = gA(a)
        const dx = h.x0 - g.x0
        const dy = h.y - g.y
        const pg = (pageA[a] as number) - (pageB[b] as number)
        if (pg !== 0 || Math.max(Math.abs(dx), Math.abs(dy)) > 0.01) same = false
        const q = lineOf.get(b)
        if (q === undefined) continue
        const o0 = off.get(q)
        if (!o0) off.set(q, [dx, dy, pg])
        else if (o0[2] !== pg || Math.abs(o0[0] - dx) > 0.01 || Math.abs(o0[1] - dy) > 0.01) rigid = false
      }
      const linesA = cutLines(
        own.map((b) => m.bToA[b] as number),
        atA,
      )
      const rebroken = linesA.length !== linesB.length || linesA.some((l, q) => l.gs.length !== linesB[q]?.gs.length)
      mem.place = rebroken ? 'rebroken' : same ? 'same' : rigid ? 'shifted' : 'respaced'
    }
    return mem
  }

  // ---- the instrument's units, a name's every occurrence its own member
  for (let u = 0; u < ins.units.length; u++) {
    const unit = ins.units[u]!
    const list = glyphsOf.get(u) ?? []
    const boxes = boxesOf.get(u) ?? []
    if (unit.name === undefined) {
      members.push(place(u, list, boxes, undefined, turnedOf.get(u) ?? []))
      continue
    }
    // (a name's occurrences: each maximal run of its glyphs in B's stream on one page)
    const runs: number[][] = []
    for (const b of list) {
      const last = runs.at(-1)
      if (last && last.at(-1) === b - 1 && pageB[b] === pageB[b - 1]) last.push(b)
      else runs.push([b])
    }
    if (!runs.length) members.push(place(u, [], []))
    for (const r of runs) members.push(place(u, r, [], unit.name))
  }

  // ---- the units born on A, from the glyphs B never printed
  const born = new Map<number, { kind: string; content: Piece[] }>()
  for (const b of bornOf(inkA, m, claimedA, pageA)) {
    const mem = empty(-1, b.kind, unitId(b.kind, b.content))
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
    const unit = mem.unit >= 0 ? ins.units[mem.unit]! : null
    const pieces = unit ? piecesOf(unit.content) : new Map<string, Piece>()
    const kindOf = (id: string) => (pieces.get(id) as { kind?: string } | undefined)?.kind ?? 'other'
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
          kindOf(id) !== 'display' &&
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
    for (const [id, l] of mem.els) if (kindOf(id) !== 'display' && !outside.has(id)) inline.push(...l)
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
      if (kindOf(id) === 'display') {
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
      for (let a = own[0] as number; a <= (own.at(-1) as number); a++) {
        const b = m.aToB[a] as number
        if ((claimedA[a] as number) >= 0 || b < 0 || (unitB[b] as number) >= 0) continue
        const g = gA(a)
        const q = box.get(pageA[a] as number)
        if (q && /\S/.test(g.u) && g.y >= q[1] && g.y <= q[3] && g.x1 > q[0] && g.x0 < q[2]) held.push(a)
      }
      kept.push(...cutLines(held, atA))
    }
    const all = [...cut.map((l) => ({ l, kept: false })), ...kept.map((l) => ({ l, kept: true }))].sort(
      (x, y) => (x.l.gs[0] as number) - (y.l.gs[0] as number),
    )
    mem.lines = all.map(
      ({ l, kept: k }) =>
        [l.page, 0, r2(l.x0), r2(l.x1), l.base, r2(l.top), r2(l.bottom), r2(l.x0), r2(l.x1), k ? 1 : 0] as Line,
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
    // style: TeX's font state is not stated by today's instrument: read off its own glyphs on A as today's reader reads it
    // (facts.ts styleOf: the role, weight and slant of its fonts' names, the size, fill and design; stage 1b states it)
    const txt = mem.text.map(gA).filter((g) => /\S/.test(g.u))
    const size =
      mostOf(txt.map((g) => r2(g.size))) ??
      (mem.turned[0] ? r2(inkA.pages[mem.turned[0][0] - 1]!.turned![mem.turned[0][1]]!.size) : 10)
    mem.style = { ...styleOf(mem.text.map(gA), size), size }
    // the lead: the pitch of its lines, where it has two on one page; else its size's
    const pitches: number[] = []
    for (let q = 1; q < cut.length; q++)
      if (cut[q]!.page === cut[q - 1]!.page) {
        const d = cut[q - 1]!.base - cut[q]!.base
        if (d > 0 && d < 3 * size) pitches.push(r2(d))
      }
    if (mem.lines.length) mem.read.push('style', 'lead')
    pitches.sort((x, y) => x - y)
    mem.lead = pitches.length ? (pitches[Math.floor(pitches.length / 2)] as number) : r2(1.2 * size)
    // elements: each one's own ink, one box per line it stands on (its glyphs and its rules)
    for (const [id, p] of pieces) {
      if (p.t !== 'el') continue
      const gl = mem.els.get(id) ?? []
      const bx = mem.elBoxes.get(id) ?? []
      const ink: Ink[] = (p.kind === 'display' ? (displayRows.get(id) ?? []) : cutLines(gl, atA)).map(
        (l) => [l.page, r2(l.x0), r2(l.bottom), r2(l.x1), r2(l.top), l.base] as Ink,
      )
      for (const [ap, ai] of bx) {
        const pg = inkA.pages[ap - 1]!
        const [x0, y0, x1, y1] = [
          pg.boxes[4 * ai]!,
          pg.boxes[4 * ai + 1]!,
          pg.boxes[4 * ai + 2]!,
          pg.boxes[4 * ai + 3]!,
        ]
        const hit = ink.find((k) => k[0] === ap && y1 >= k[2] - 0.5 && y0 <= k[4] + 0.5)
        if (hit) {
          hit[1] = r2(Math.min(hit[1], x0))
          hit[2] = r2(Math.min(hit[2], y0))
          hit[3] = r2(Math.max(hit[3], x1))
          hit[4] = r2(Math.max(hit[4], y1))
        } else ink.push([ap, r2(x0), r2(y0), r2(x1), r2(y1), r2(y0)])
      }
      const el: El = { kind: p.kind, ink }
      if (p.kind === 'display' || outside.has(id)) el.keep = 1
      if (TEXT_KINDS.has(p.kind) && gl.length) el.text = gl.map((a) => gA(a).u).join('')
      mem.elements.push([id, el])
    }
    // its label: the class's mark before it
    if (mem.label.length) {
      const L = cutLines(mem.label, atA)[0]
      const lg = mem.label.map(gA)
      if (L) {
        mem.labelAt = {
          kind: LABEL_KIND[mem.kind] ?? 'number',
          // (its glyphs' advances, as an element's ink and a line's extent)
          ink: [L.page, r2(L.x0), r2(L.bottom), r2(L.x1), r2(L.top), L.base],
          style: { role: 'serif', size: L.most },
        }
      }
    }
  }
  columnsAndMeasures(members, inkA)
  for (const mem of members) if (mem.lines.length) mem.room = roomOf(mem, inkA, m.offA)
  // ---- the facts today's reader works out from the page before it typesets (stage 1a-2: facts-pass.ts)
  factsOf({ ins, inkA, m, members, claimedA, pageA, unitB, roleB, pieceB })

  // ---- flows: a member whose first line is the one before's last line, on its baseline after its end, in one paragraph of
  // TeX's (no paragraph end of B's between the one's last glyph and the other's first, where the instrument states them); a
  // table's cell and a figure's text are set in boxes of their own, never in a paragraph with another
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
  const flows: number[][] = []
  let cur: number[] = []
  for (let q = 0; q < members.length; q++) {
    const mem = members[q]!
    const prev = q > 0 ? members[q - 1]! : null
    const a = prev?.lines.at(-1)
    const b = mem.lines[0]
    const shares =
      !!a &&
      !!b &&
      !!prev?.located &&
      mem.located &&
      mem.unit >= 0 &&
      prev.unit >= 0 &&
      a[0] === b[0] &&
      a[1] === b[1] &&
      Math.abs(a[4] - b[4]) < 0.5 * Math.min(prev.style.size, mem.style.size) &&
      b[2] >= a[3] - 0.5 &&
      !ownBox(prev) &&
      !ownBox(mem) &&
      (prev.bLast < 0 || mem.bFirst < 0 || !endBetween(prev.bLast, mem.bFirst))
    if (shares && cur.length) {
      mem.join = mem.labelAt && mem.labelAt.ink[0] === b[0] ? [r2(b[2] - a[3]), 1] : [r2(b[2] - a[3])]
      cur.push(mem.ord)
    } else {
      if (cur.length) flows.push(cur)
      cur = [mem.ord]
    }
  }
  if (cur.length) flows.push(cur)

  // ---- ties: a table's cells, laid together; a figure's set, at one size
  const ties: Located['ties'] = []
  {
    const tables = new Map<number, Map<number, number[]>>()
    const heads = new Set<number>()
    const sets = new Map<number, number[]>()
    for (const mem of members) {
      const unit = mem.unit >= 0 ? ins.units[mem.unit] : undefined
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
  }

  // ---- links: A's annotations, each owned by the member that owns most of the glyphs under it (today's links.mjs ownersOf: the
  // unit whose rectangles hold more than half of its glyph points; by exact ownership, the member that owns more than half of
  // them), and within it by the element that owns more than half of them, else its text. A glyph point is a glyph's advance
  // centre on its baseline strictly inside the annotation's rectangle or one of its quads (PDF.js's overlaidText rule, today's
  // pointsOf). A link over no glyph: the member one of whose lines or elements holds its rectangle's centre
  const links: Located['links'] = new Map()
  ;(o.annotations ?? []).forEach((list, p) => {
    if (!list?.length) return
    const out: NonNullable<ReturnType<typeof links.get>> = []
    const pg = inkA.pages[p]!
    const off = m.offA[p] as number
    for (const an of list as {
      annotationType?: number
      rect?: number[]
      quadPoints?: ArrayLike<number> | null
      url?: string
      unsafeUrl?: string
      dest?: unknown
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
      if (pts.length) {
        const by = new Map<number, number>()
        for (const a of pts)
          if ((claimedA[a] as number) >= 0) by.set(claimedA[a] as number, (by.get(claimedA[a] as number) ?? 0) + 1)
        const top = [...by].find(([, n]) => 2 * n > pts.length)
        if (top) {
          const mem = members[top[0]]!
          const els = [...mem.els].map(([id, l]) => [id, pts.filter((a) => l.includes(a)).length] as const)
          const el = els.find(([, n]) => 2 * n > pts.length)
          owner = [mem.ord, el ? el[0] : '']
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
          if (owner) break
        }
      }
      out.push({ box: [x0, y0, x1, y1], to, ...(owner ? { owner } : {}) })
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
    const unit = mem.unit >= 0 ? ins.units[mem.unit] : undefined
    const pieces = unit ? piecesOf(unit.content) : new Map<string, Piece>()
    const name = (a: number, c: string) => `${mem.ord}.${pageA[a]}.${c}`
    // (an element whose ink stays, a display's, one outside the unit or on a held line: in no group)
    const keptEl = new Set(mem.elements.filter(([, el]) => el.keep).map(([id]) => id))
    for (const a of mem.text) {
      set(a, name(a, 't'))
      if (mem.figure) figureGroups.add(name(a, 't'))
    }
    for (const a of mem.label) set(a, name(a, 'l'))
    for (const [ap, aj] of mem.turned) {
      groups[ap - 1]!.turned[aj] = `${mem.ord}.${ap}.t`
      if (mem.figure) figureGroups.add(`${mem.ord}.${ap}.t`)
    }
    for (const [id, l] of mem.els) {
      if ((pieces.get(id) as { kind?: string } | undefined)?.kind === 'display' || keptEl.has(id)) continue
      for (const a of l) set(a, name(a, 'e'))
    }
    for (const [ap, ai] of mem.textBoxes) groups[ap - 1]!.boxes[ai] = `${mem.ord}.${ap}.t`
    for (const [id, l] of mem.elBoxes) {
      if ((pieces.get(id) as { kind?: string } | undefined)?.kind === 'display' || keptEl.has(id)) continue
      for (const [ap, ai] of l) groups[ap - 1]!.boxes[ai] = `${mem.ord}.${ap}.e`
    }
  }

  for (const mem of members) {
    if (mem.unit < 0) continue
    if (mem.located) {
      stats.located++
      if (mem.place) stats.places[mem.place]++
    } else noteUnlocated(mem.cause ?? 'no ink')
  }
  return { members, born, flows, ties, links, groups, figureGroups, stats }
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

/** each line's column and measure on A: on a page of two columns (lines on both halves that keep to their half), a line
 *  keeps to the left half (0), the right (1), or spans (2); a column's measure is the hull of the lines of its justified
 *  paragraphs of two lines or more, a line with no such column set within its own extent */
function columnsAndMeasures(members: Member[], inkA: Doc): void {
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
  const measure = new Map<string, [number, number]>()
  for (const mem of members) {
    if (mem.align !== 'j' || mem.lines.filter((l) => !(l[9] & 1)).length < 2) continue
    for (const l of mem.lines) {
      if (l[9] & 1) continue
      const k = `${l[0]}|${l[1]}`
      const m = measure.get(k)
      if (!m) measure.set(k, [l[2], l[3]])
      else measure.set(k, [Math.min(m[0], l[2]), Math.max(m[1], l[3])])
    }
  }
  for (const mem of members)
    for (const l of mem.lines) {
      const mm = measure.get(`${l[0]}|${l[1]}`)
      if (mm) {
        l[7] = r2(Math.min(mm[0], l[2]))
        l[8] = r2(Math.max(mm[1], l[3]))
      }
    }
}

/** the free depth under a member's last line in its column, to the first ink not its own (a page's glyph or box), the page's
 *  bottom edge where there is none; and the distance to the next text line of its column, baseline to baseline */
function roomOf(mem: Member, inkA: Doc, offA: Int32Array): Room {
  const last = mem.lines.at(-1)!
  const [p, , x0, x1, , , bottom] = last
  const pg = inkA.pages[p - 1]!
  const foot = bottom - 0.5
  let next = Number.NEGATIVE_INFINITY
  for (const g of pg.glyphs) if (g.top < foot && g.x1 > x0 && g.x0 < x1 && g.top > next && /\S/.test(g.u)) next = g.top
  const W = pg.view[2] - pg.view[0]
  const H = pg.view[3] - pg.view[1]
  for (let b = 0; b < pg.kinds.length; b++) {
    const bx0 = pg.boxes[4 * b]!
    const by0 = pg.boxes[4 * b + 1]!
    const bx1 = pg.boxes[4 * b + 2]!
    const by1 = pg.boxes[4 * b + 3]!
    if (by1 < foot && bx1 > x0 && bx0 < x1 && by1 > next && !(bx1 - bx0 >= 0.9 * W && by1 - by0 >= 0.75 * H)) next = by1
  }
  const below = r2(Math.min(H, Math.max(0, bottom - (Number.isFinite(next) ? next : pg.view[1]))))
  // (the next line under its last text line (today's edgesOf `below` RUN:1655): from that line's baseline, across its last
  // block — the lines of its own on that page stacked over it, each standing above the one under it and across it (a caption
  // whose short last line keeps to one column of a block across both), never a column of its before a column break — the
  // page's glyphs under that baseline by more than three quarters of its pitch, its own travelling ink aside (its text, label
  // and elements set anew: a script of its last line) and its kept rows counted (a display that stays under it is the next ink
  // the fill meets); of the highest, those within half a size, their median baseline)
  const own = mem.lines.filter((l) => !(l[9] & 1))
  const lastText = own.at(-1) ?? last
  const tp = lastText[0]
  let bx0 = lastText[2]
  let bx1 = lastText[3]
  let over = lastText[4]
  for (let q = own.length - 2; q >= 0; q--) {
    const l = own[q] as Line
    if (l[0] !== tp || l[4] <= over || l[3] <= bx0 || l[2] >= bx1) break
    bx0 = Math.min(bx0, l[2])
    bx1 = Math.max(bx1, l[3])
    over = l[4]
  }
  const travels = new Set<number>([...mem.text, ...mem.label])
  for (const [id, l] of mem.els) if (!mem.elements.find(([k]) => k === id)?.[1].keep) for (const a of l) travels.add(a)
  const T = lastText[4] - 0.75 * (mem.lead > 0 ? mem.lead : 1.2 * mem.style.size)
  const off = offA[tp - 1] as number
  const under: DocGlyph[] = []
  inkA.pages[tp - 1]!.glyphs.forEach((g, j) => {
    if (/\S/.test(g.u) && g.y < T && g.x1 > bx0 && g.x0 < bx1 && !travels.has(off + j)) under.push(g)
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
  return { below, ...(nextBase !== null ? { next: r2(lastText[4] - nextBase) } : {}) }
}
