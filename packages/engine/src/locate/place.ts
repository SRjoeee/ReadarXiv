// A unit's transfer to A, phase 1's (members.ts placeUnits calls `place` for each placement of an instrument's unit): its B
// glyphs' partners in their roles and pieces, A's own glyphs between two of its partners where the alignment shows they are its
// text, its rules' and images' partners, or the cause it stays the original's. `place` is the only code here that writes the
// ownership (`claims`: the ink its member takes, the glyphs a unit that stays the original's holds); `empty` makes a member of
// nothing, for phases 1, 4 and 5, and writes nothing.
import type { Piece } from '@readarxiv/format'
import { HUNK, hunkName } from '../align/align.ts'
import { isImage, isPath } from '../doc.ts'
import { ROLE } from '../instrument.ts'
import { TEXT_SYMBOLS } from '../source/tables.ts'
import { cutLines, isInk } from './lines.ts'
import type { Ink } from './ownership.ts'
import { eachBetweenPaired, INKED_CLASSES, lettersIn, type Member, piecesOf, type Work } from './work.ts'

/** a LaTeX text symbol's character (\S, \%, alone or before `{}`), by the kernel's table (source/tables.ts TEXT_SYMBOLS, today's
 *  rules/text-symbols.mjs), read here so that the back half needs nothing of the front half but the table */
const symbolText = (src: string): string | null => {
  const m = /^(\\(?:[A-Za-z]+|[%&#$_{}]))(?:\{\})?$/.exec(src)
  return m && Object.hasOwn(TEXT_SYMBOLS, m[1] as string) ? (TEXT_SYMBOLS[m[1] as string] as string) : null
}

export const empty = ({ members }: Work, u: number, kind: string, id: string): Member => ({
  ord: members.length,
  unit: u,
  id,
  kind,
  located: false,
  fixed: false,
  kept: false,
  figure: false,
  text: [],
  label: [],
  els: new Map(),
  textBoxes: [],
  elBoxes: new Map(),
  elBoxesB: new Map(),
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

/** the first element of unit u whose ink TeX's points show it set and its unit's ownership gives none of: of a class drawn
 *  from its ink (INKED_CLASSES; a paper's own macro aside, which the typesetter leaves unproven where it has neither ink nor
 *  text), both its points stated with a glyph of B between them, none of its own; a text macro whose glyphs there are its
 *  unit's text is found as that text (its El.text, the reading between its points). `element not found`, null where none is */
function notFound(w: Work, u: number, list: readonly number[], boxes: readonly [number, number][]): string | null {
  const { ins, roleB, pieceB, placeSpan, emptyPiece, gB, unitB } = w.ix
  const unit = ins.units[u]!
  if (!unit.classes?.length) return null
  const found = new Set<number>()
  for (const b of list) if (roleB[b] === ROLE.element && (pieceB[b] as number) >= 0) found.add(pieceB[b] as number)
  for (const [p, x] of boxes)
    if (ins.boxes[p]!.role[x] === ROLE.element && (ins.boxes[p]!.piece[x] as number) >= 0)
      found.add(ins.boxes[p]!.piece[x] as number)
  const classes = new Map(unit.classes)
  for (const [id, piece] of piecesOf(unit.content)) {
    const c = classes.get(id)
    if (piece.t !== 'el' || !c || !INKED_CLASSES.has(c.cls) || c.unknown || found.has(Number(id))) continue
    const span = placeSpan.get(`${u}|${id}`)
    if (!span || !(span[0] < span[1]) || emptyPiece.has(`${u}|${id}`)) continue
    let set = false
    let text = false
    for (let b = span[0]; b < span[1]; b++) {
      if (!isInk(gB(b))) continue
      set = true
      if (unitB[b] === u && roleB[b] === ROLE.text) text = true
    }
    if (!set || ((c.cls === 'macro' || c.cls === 'umacro') && text)) continue
    return 'element not found'
  }
  return null
}
/** the letters unit u's text may hold: those its text pieces write, and those of the pieces whose glyphs its ownership gives
 *  its text, as TeX's facts state them: a text symbol's character; a text macro's, its unit's text glyphs between its two
 *  points on B (the reading El.text takes), else the text the probe showed it sets */
function writtenOf(w: Work, u: number): number {
  const { ins, placeSpan, unitB, roleB, gB } = w.ix
  const unit = ins.units[u]!
  const classes = new Map(unit.classes ?? [])
  let n = 0
  const walk = (ps: readonly Piece[]) => {
    for (const p of ps) {
      if (p.t === 'text') n += lettersIn(p.s)
      else if (p.t === 'span') walk(p.content)
      else if (p.t === 'el') {
        const c = classes.get(p.id)
        n += lettersIn(symbolText(p.src) ?? c?.sym?.[0] ?? '')
        if (c?.cls !== 'macro' && c?.cls !== 'umacro') continue
        const span = placeSpan.get(`${u}|${p.id}`)
        let between = 0
        if (span)
          for (let b = span[0]; b < span[1]; b++)
            if (unitB[b] === u && roleB[b] === ROLE.text) between += lettersIn(gB(b).u)
        n += between || lettersIn(c.text ?? '')
      }
    }
  }
  walk(unit.content)
  return n
}

/** one placement of unit u from its B glyphs `list` and boxes `boxes` */
export function place(
  w: Work,
  u: number,
  list: number[],
  boxes: [number, number][],
  name?: string,
  turnedB: [number, number][] = [],
): Member {
  const { ins, B, m, inkA, roleB, pieceB, unitB, gA, gB, atA, atB, pageA, pageB } = w.ix
  const { claims } = w
  const unit = ins.units[u]!
  const mem = empty(w, u, name !== undefined ? 'name' : unit.kind, unit.id)
  if (name !== undefined) mem.name = name
  mem.fixed = !!unit.fixed
  mem.kept = !!unit.kept
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
  // (B's glyphs with no partner inside the unit, between two of its own whose partners A sets one right after the other:
  // glyphs our compile set where arXiv's set nothing (1810.04805v2 u325: our tree sets the .bbl's UTF-8 quotes round "Cloze
  // procedure", arXiv's 2016 tree read their bytes as characters its OT1 font has no glyph for, TeX's "Missing character",
  // and set none). They are no ink of A: its ink of the unit is the glyphs A set, whole, nothing between them another's or
  // none's, and the unit is located from them; its translation reads its source, those characters with it. A run at the
  // unit's start or end, or one whose neighbours' partners stand apart on A, is no such statement (a line A set elsewhere
  // that no block move paired): a content difference, the unit the original's, as before)
  const prevPaired = new Int32Array(list.length).fill(-1)
  for (let i = 0, last = -1; i < list.length; i++) {
    prevPaired[i] = last
    if ((m.bToA[list[i] as number] as number) >= 0) last = i
  }
  let nextPaired = -1
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i] as number
    const a = m.bToA[b] as number
    if (a >= 0) {
      aIdx.push(a)
      nextPaired = i
      continue
    }
    if (m.hunkB[b] === HUNK.hyphen || m.offpageB[b]) continue
    const pv = prevPaired[i] as number
    if (pv >= 0 && nextPaired >= 0) {
      const ap = m.bToA[list[pv] as number] as number
      const an = m.bToA[list[nextPaired] as number] as number
      if (an === ap + 1) continue
    }
    bad = `content difference: ${hunkName(m.hunkB[b] as number) === 'none' ? 'bonly' : hunkName(m.hunkB[b] as number)}`
  }
  aIdx.reverse()
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
  const unpaired: [number, [number, number]][] = []
  if (aIdx.length) {
    const sorted = [...aIdx].sort((x, y) => x - y)
    const lo = sorted[0] as number
    const hi = sorted.at(-1) as number
    // (one walk, eachBetweenPaired's; the B range between the two partners read once for a run of unpaired glyphs)
    let run = -1
    let between: boolean | undefined
    eachBetweenPaired(
      lo,
      hi,
      (a) => (m.aToB[a] as number) >= 0,
      (a, pv, nx) => {
        if (nx !== run) {
          run = nx
          between = undefined
        }
        if (m.offpageA[a] || !claims.free(a)) return
        const bp = m.aToB[pv] as number
        const bn = m.aToB[nx] as number
        if (unitB[bp] !== u || unitB[bn] !== u) return
        // (B's glyphs between the two partners: none with no partner of another unit's)
        if (m.hunkA[a] === HUNK.hyphen && between === undefined) {
          between = true
          for (let b = Math.min(bp, bn) + 1; between && b < Math.max(bp, bn); b++)
            if ((m.bToA[b] as number) < 0 && unitB[b] !== u) between = false
        }
        const own = m.hunkA[a] === HUNK.hyphen && between === true
        if (own) {
          const rp = roleOfB(bp)
          const rn = roleOfB(bn)
          unpaired.push([a, rp[0] === rn[0] && rp[1] === rn[1] ? rp : [ROLE.text, -1]])
          return
        }
        if (gA(a).form && !gA(pv).form && !gA(nx).form) return
        unpaired.push([a, [ROLE.none, -1]])
        const h = hunkName(m.hunkA[a] as number)
        bad ??= `content difference: ${h === 'none' || h === 'hyphen' ? 'aonly' : h}`
      },
    )
  }
  // (an element TeX set ink for between its two points that its unit's ownership gives none of, glyph or box: its ink is not
  // found, which is no statement that TeX set none (today's LOST, make.mjs, against its EMPTY: both its points stated and
  // nothing between them, or TeX's probe said it sets none). Read as none, it is drawn as nothing while its ink is erased with
  // the unit's text or stays under the translation. A text macro whose glyphs there are the unit's text is found as that text.
  // The unit stays the original's)
  if (!bad) bad = notFound(w, u, list, boxes)
  if (bad || (!aIdx.length && !turnedA.length)) {
    for (const [a] of unpaired) claims.hold(a)
    mem.cause = bad ?? 'no ink'
    return mem
  }
  for (const [a, r] of unpaired) roleAt.set(a, r)
  mem.located = true
  if (!aIdx.length) {
    claims.take(mem, { turned: turnedA })
    mem.place = turnedSame ? 'same' : 'shifted'
    return mem
  }
  // (an element's glyph of no piece is no glyph of the unit's text: the instrument's u<id>.p glyphs no placeholder's points stand
  // round, which no El states. They stay A's ink where they stand (HELD), and so does a label they cut from the unit's text,
  // the glyphs of no unit TeX set between them: 2610.37818v1 p14, sub-caption (a), which has no unit, given to (b)'s, "(a)" its
  // label and "Dark rim band" an element of no piece; read as (b)'s text its line ran over (a), (a)'s English was erased with
  // nothing drawn there, and "(a)" drawn before "(b)" (the checkpoint's measure-4))
  const sortedRoles = [...roleAt].sort((x, y) => x[0] - y[0])
  const loose = sortedRoles.filter(([, [role, k]]) => role === ROLE.element && k < 0).map(([a]) => a)
  if (loose.length) {
    const firstText = sortedRoles.find(([, [role]]) => role === ROLE.text)?.[0] ?? Number.POSITIVE_INFINITY
    const cut = (a: number) => loose.some((x) => x > a && x < firstText)
    for (const [a, [role, k]] of sortedRoles)
      if ((role === ROLE.element && k < 0) || (role === ROLE.label && cut(a))) {
        claims.hold(a)
        roleAt.delete(a)
      }
  }
  // (its text no more letters than its source writes: TeX sets a text's letters as written, and the ownership gives a unit's
  // text the glyphs of its text pieces, its text symbols and its text macros alone. Glyphs past them are another piece's
  // ink read as the text, which its text group would erase and no translation draws again: 2608.25210v2 p7's Algorithm 1,
  // its formulas' and keywords' glyphs claimed as its text (200 letters where its text pieces write 6), erased with its 21
  // lines and one drawn. The unit stays the original's. A count, no threshold: fewer is TeX's (a ligature's one glyph
  // for its letters, a word the class does not print), more is never)
  if (name === undefined) {
    let claimed = 0
    for (const [a, [role, k]] of roleAt)
      if (role !== ROLE.label && !(role === ROLE.element && k >= 0)) claimed += lettersIn(gA(a).u)
    const written = writtenOf(w, u)
    if (claimed > written) {
      for (const [a] of unpaired) claims.hold(a)
      mem.located = false
      mem.cause = 'text past its source'
      return mem
    }
  }
  // (its ink, each glyph in its role (text, label, an element by piece) and each box's partner, taken whole)
  const ink = {
    text: [] as number[],
    label: [] as number[],
    els: new Map<string, number[]>(),
    textBoxes: [] as [number, number][],
    elBoxes: new Map<string, [number, number][]>(),
    elBoxesB: new Map<string, [number, number][]>(),
    turned: turnedA,
  } satisfies Ink
  for (const [a, [role, k]] of [...roleAt].sort((x, y) => x[0] - y[0])) {
    if (role === ROLE.label) ink.label.push(a)
    else if (role === ROLE.element && k >= 0) {
      const id = String(k)
      const l = ink.els.get(id)
      if (l) l.push(a)
      else ink.els.set(id, [a])
    } else ink.text.push(a)
  }
  for (const [ap, ai, p, x] of boxPartners) {
    const role = ins.boxes[p]!.role[x] as number
    const k = ins.boxes[p]!.piece[x] as number
    if (role === ROLE.element && k >= 0) {
      const id = String(k)
      const l = ink.elBoxes.get(id)
      if (l) l.push([ap, ai])
      else ink.elBoxes.set(id, [[ap, ai]])
      const lb = ink.elBoxesB.get(id)
      if (lb) lb.push([p, x])
      else ink.elBoxesB.set(id, [[p, x]])
    } else ink.textBoxes.push([ap, ai])
  }
  claims.take(mem, ink)
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
