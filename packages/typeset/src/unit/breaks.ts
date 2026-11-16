// U.breaks (design-b §1.5): where the unit's forced breaks and the paragraphs TeX set of a group end its lines, paired with
// the row in the translation's order (T19, T20), and the maps the blocks and the tokens read of them, with the kept lines in
// runs (T21's inputs: C12, C14-C18). Ported from engine 065c1d973: finishUnit's maps L2:1484-1525, break-room.mjs's pitch.
// The port of today's re-derivation of the breaks from the page (forcedBreaks TEX:120-199, paragraphBreaks TEX:222-255, the
// measure of a line TEX:515-531), which nothing called once TeX's points were stated, went with its replay.
// What the part states is paired by `statedBreaks` (the layPage's reading): each break's line and room TeX's (El.ends), each
// paragraph's line TeX's paragraph point (El.opens, SpanAt.opens, and a paragraph's first word, Placed.paras: `paraPieces` cuts
// the row at the sentence start paired with it, else directly after the element it stands after, Placed.parasAfter); the
// translation's order decides the rest, as today's.
import type { El, Placed, SpanAt } from '@readarxiv/format'
import { firstWordAt, projectionOf, type Sentences, startsInProjection, worded } from '../lay/lit.ts'
import { type Rect, rectKey } from '../util.ts'

/** a placeholder row of the layout file (file.d.mts LayoutPh): its kind, flags (PH_FLAG) and segments (stride 6: page, x0,
 *  baseline, x1, top, bottom) */
type LayoutPh = { kind: string; flags: number; segs: readonly number[] }
/** the layout file's unit as the breaks read it (file.d.mts LayoutUnit) */
export type LayoutUnit = {
  lines: readonly number[]
  frames: readonly number[]
  held?: readonly number[] | null
  ph: ReadonlyMap<number, LayoutPh>
  centred?: boolean | null
  flush?: string | null
}
/** the face TeX set a group's text in where its command names no style the rules know (the part's SpanAt.style: role, weight,
 *  slant) */
type OpenFace = { role: 'serif' | 'sans' | 'mono'; bold?: 1 | undefined; slant?: 1 | 2 | undefined }
/** a piece of a row as today's unit holds it (rows.mjs unitOf: the translation's pieces in its order, `k` the source's; a
 *  group's open with the face TeX set it in, where its part states one, and `runin` where its part states the group a title set
 *  in the line, SpanAt.runin); `par` a piece of the typesetter's own, never in a Row
 *  nor on a wire: a paragraph TeX opened at its first word (Placed.paras), cut into the row where a sentence start pairs with
 *  that word, else directly after the element the word stands after in the source (Placed.parasAfter) (paraPieces), `next`
 *  the line TeX opened it on; it sets nothing and stands in the translation's projection as a group's edge does, for none */
export type V0Piece =
  | { t: 'text'; s: string; k?: number }
  | { t: 'ph'; src: string; k?: number }
  | { t: 'open'; src?: string; id?: unknown; k?: number; face?: OpenFace; runin?: true }
  | { t: 'close'; src?: string; id?: unknown; k?: number }
  | { t: 'nested'; src?: string; k?: number }
  | { t: 'par'; next: number; src?: undefined; k?: undefined }
/** where a break ends a line: the file's line after it, TeX's room after it in pitches and its frame's pitch (null where the
 *  next line opens another frame), and whether it is a group's paragraph */
export type Break = { next: number; room: number | null; pitch: number | null; paragraph?: true }

/** layout/file.mjs:272 PH_FLAG */
export const PH_FLAG = Object.freeze({ EMPTY: 16, LOST: 32, TEXT: 64, JOINED: 128, OUTSIDE: 256 })
/** v0's placeholder classes that draw ink of their own (TEX:18) */
const VISIBLE = new Set(['cite', 'num', 'other', 'macro', 'umacro', 'display', 'symbol'])

// ---- break-room.mjs: TeX's room after a forced break
/** a frame's pitch: the median of its own lines' gaps, the mean of the two middles (break-room.mjs:8 pitchOf) */
function pitchOf(gaps: readonly number[]): number | null {
  const g = gaps.filter((v) => v > 0).sort((a, b) => a - b)
  return g.length ? (g[(g.length - 1) >> 1]! + g[g.length >> 1]!) / 2 : null
}

/** what U.breaks says: the breaks by row piece, the kept lines in runs (regions), the maps the blocks read (breakAt, joinAt,
 *  paraAt), the regions the text passes (referenced), a group's open piece's region (openBreaks), and each resolved piece's
 *  break or region */
export type Breaks = {
  breaks: Map<number, Break>
  regionOf: Map<string, number>
  breakAt: Map<string, number>
  joinAt: Map<string, number>
  paraAt: Set<string> | null
  referenced: Set<number>
  openBreaks: Map<number, number> | null
  marks: Map<number, { region?: number; brk?: true; room?: number; brkAt?: number }>
}

/** what finishUnit's maps read besides the breaks: the row's pieces, the unit's lines as laid and their rows, the lines it
 *  keeps, the lines each kept resolution holds, the row pieces U.elements resolved */
export type MapsInput = {
  pieces: readonly V0Piece[]
  rects: readonly Rect[]
  lineInfo: ReadonlyMap<string, { j?: number }>
  keep: readonly string[]
  kept: ReadonlyMap<number, readonly string[]>
  resolved: ReadonlySet<number>
}

/**
 * finishUnit's maps over the row's breaks (L2:1484-1525): the kept lines in runs (regions), a break whose next line opens
 * another frame a region of its own before that line (`breakAt`), one inside a frame its frame's pitch on its next line
 * (`joinAt`), a paragraph's first line a block of its own (`paraAt`); each resolved piece's region or break, and a piece at
 * which TeX opened a paragraph (a group's open, or an element: drawn, the text before it ending its block) its region
 * (`openBreaks`)
 */
export function breakMaps(out: ReadonlyMap<number, Break>, i: MapsInput): Breaks {
  const keepSet = new Set(i.keep)
  const regionOf = new Map<string, number>(),
    breakAt = new Map<string, number>(),
    joinAt = new Map<string, number>()
  const breakNext = new Set<number>(),
    joinNext = new Map<number, number | null>(),
    breakOf = new Map<number, number>(),
    joined = new Set<number>(),
    paraNext = new Set<number>()
  for (const { next, room, pitch, paragraph } of out.values()) {
    if (room === null) breakNext.add(next)
    else joinNext.set(next, pitch)
    if (paragraph) paraNext.add(next)
  }
  let paraAt: Set<string> | null = null
  let region = -1,
    inRun = false
  for (const r of i.rects) {
    const k = rectKey(r)
    const j = breakNext.size || joinNext.size ? i.lineInfo.get(k)?.j : undefined
    if (j !== undefined && breakNext.has(j) && !keepSet.has(k) && !breakOf.has(j)) {
      region++
      inRun = false
      breakAt.set(k, region)
      breakOf.set(j, region)
      if (paraNext.has(j)) {
        paraAt ??= new Set()
        paraAt.add(k)
      }
    }
    if (j !== undefined && joinNext.has(j) && !keepSet.has(k) && !joined.has(j)) {
      joinAt.set(k, joinNext.get(j)!)
      joined.add(j)
    }
    if (keepSet.has(k)) {
      if (!inRun) region++
      inRun = true
      regionOf.set(k, region)
    } else inRun = false
  }
  const referenced = new Set<number>()
  const marks = new Map<number, { region?: number; brk?: true; room?: number; brkAt?: number }>()
  const mark = (k: number) => marks.get(k) ?? marks.set(k, {}).get(k)!
  for (const [k, lines] of i.kept) {
    const regs = lines.map((key) => regionOf.get(key)).filter((g) => g !== undefined)
    if (regs.length) {
      const g = Math.max(...regs)
      mark(k).region = g
      referenced.add(g)
    }
  }
  let openBreaks: Map<number, number> | null = null
  for (const [k, { next, room, paragraph }] of out) {
    if (!i.resolved.has(k) || paragraph) {
      const g = room === null && (i.pieces[k]?.t === 'open' || paragraph) ? breakOf.get(next) : undefined
      if (g !== undefined) {
        openBreaks ??= new Map()
        openBreaks.set(k, g)
        referenced.add(g)
      }
      continue
    }
    if (room !== null) {
      if (joined.has(next)) Object.assign(mark(k), { brk: true, room, brkAt: next })
      continue
    }
    const g = breakOf.get(next)
    if (g === undefined) continue
    Object.assign(mark(k), { region: g, brk: true })
    referenced.add(g)
  }
  return { breaks: new Map(out), regionOf, breakAt, joinAt, paraAt, referenced, openBreaks, marks }
}

/** what U.breaks reads of a member the part states (Placed): its lines, and its elements' and groups' facts by id; whether
 *  its breaks' lines are read off the page by their short ends, not stated by TeX's points (Placed.read 'breaks') */
type StatedFacts = {
  lines: Placed['lines']
  els: ReadonlyMap<string, El>
  spans: ReadonlyMap<string, SpanAt>
  read?: boolean
  /** TeX's \baselineskip for the unit's lines (Placed.lead where the part states it): a frame's pitch */
  pitch?: number | null
}

/**
 * U.breaks' pairing over what TeX states (design-a §1.1: El.ends, El.opens, SpanAt.opens), in the translation's order (T19,
 * T20), as today's forcedBreaks and paragraphBreaks pair the lines they read (TEX:120-199, 222-255):
 * - forced breaks: the row's breaks (the elements the part states forced breaks, El.brk: `\\`, \newline, LaTeX's \break, a grid
 *   cell's row-ending macro, as the engine reads them; no source is read) in groups (one after the other, nothing drawn between
 *   them), a group between two texts a break (one the translation sets at its start or its end, or next to a display, none);
 *   its line the one TeX ended at its first break (El.ends), the text after it on the next; its room TeX's (El.ends) where the
 *   next line is in the frame (the run of lines on one page and column) and the frame's pitch is known (the median of its own
 *   consecutive lines' gaps, a break's line and a kept line aside), else none (`room` null: the next line opens a block of its own, as today's break that opens
 *   another frame or whose frame has no pitch). Where TeX's points state each break's line, the guards of today's
 *   re-derivation are void (its SHORT test, the count of short lines, one column a page). Where the lines are read by their
 *   short ends (`read`: the marked compile set no point for them, the engine paired them in the source's order), today's
 *   check of that pairing holds: every element of the row with ink on the unit's lines stands on a line between the breaks
 *   its place in the row says, else no forced break is taken (TEX:161-181);
 * - paragraphs: a group's open piece or an element at which TeX opened a paragraph (SpanAt.opens, El.opens: its first line),
 *   where the row holds it between two texts of its own (T20) and that line and the one before are the unit's own text lines,
 *   no forced break's next line: the text from it starts on that line in a block of its own (`paragraph`). Today's SHORT and
 *   justified-unit tests read the paragraph's end off the page, which TeX's point states
 */
export function statedBreaks(
  f: StatedFacts,
  pieces: readonly V0Piece[],
  cls2: readonly (string | null)[],
): Map<number, Break> {
  const out = new Map<number, Break>()
  const L = f.lines,
    n = L.length
  const KEPT = 1
  const elOf = (p: V0Piece | undefined) => (p && p.t === 'ph' ? f.els.get(String(p.k)) : undefined)
  // (each line's frame: its run of lines on one page and column)
  const frameOf: number[] = []
  L.forEach((l, j) => {
    const p = L[j - 1]
    frameOf.push(!j ? 0 : p![0] === l[0] && p![1] === l[1] ? frameOf[j - 1]! : frameOf[j - 1]! + 1)
  })
  const brkLines = new Set<number>()
  for (const e of f.els.values()) if (e.ends) brkLines.add(e.ends[0])
  const gaps = new Map<number, number[]>()
  for (let j = 0; j + 1 < n; j++) {
    if (brkLines.has(j) || L[j]![9] & KEPT || L[j + 1]![9] & KEPT || frameOf[j] !== frameOf[j + 1]) continue
    const g = gaps.get(frameOf[j]!) ?? gaps.set(frameOf[j]!, []).get(frameOf[j]!)!
    g.push(L[j]![4] - L[j + 1]![4])
  }
  // forced breaks, in groups in the row's order (TEX:125-137): the elements the part states forced breaks (El.brk), whatever
  // source the piece carries
  type Group = { members: number[]; before: string | null; after: string | null }
  const groups: Group[] = []
  let group: Group | null = null,
    before: string | null = null
  for (const [i, p] of pieces.entries()) {
    if (elOf(p)?.brk) {
      if (!group) {
        group = { members: [], before, after: null }
        groups.push(group)
      }
      group.members.push(i)
      continue
    }
    const cls = p.t === 'nested' ? 'num' : p.t === 'ph' ? cls2[i] : null
    if (!(p.t === 'text' ? /\S/.test(p.s ?? '') : !!cls && VISIBLE.has(cls))) continue
    const kind = cls === 'display' ? 'display' : 'text'
    if (group) {
      group.after = kind
      group = null
    }
    before = kind
  }
  const taken: { members: number[]; line: number; room: number }[] = []
  for (const g of groups) {
    if (g.before !== 'text' || g.after !== 'text') continue
    const ends = g.members.map((i) => elOf(pieces[i])?.ends).find((e) => e !== undefined)
    if (!ends || ends[0] + 1 >= n) continue
    taken.push({ members: g.members, line: ends[0], room: ends[1] })
  }
  // (a read pairing checked: each element's ink, on the line of its page nearest its baseline, after the line the break before
  // it in the row ends and not after the one the break after it ends)
  const lineOf = (page: number, base: number) => {
    let best = -1
    L.forEach((l, j) => {
      if (l[0] === page && (best < 0 || Math.abs(l[4] - base) < Math.abs(L[best]![4] - base))) best = j
    })
    return best
  }
  let side = 0
  const misread =
    !!f.read &&
    pieces.some((p, i) => {
      while (side < taken.length && taken[side]!.members[0]! < i) side++
      const e = elOf(p)
      return (e?.ink ?? []).some((k) => {
        const j = lineOf(k[0], k[5])
        return j >= 0 && ((side > 0 && j <= taken[side - 1]!.line) || (side < taken.length && j > taken[side]!.line))
      })
    })
  if (!misread)
    for (const { members, line: j, room: stated } of taken) {
      // (the frame's pitch: TeX's \baselineskip where the part states it, else its other gaps' median, which a gap TeX's
      // \lineskip rule opened under a tall line passes for one)
      const pitch = frameOf[j] === frameOf[j + 1] ? f.pitch || pitchOf(gaps.get(frameOf[j]!) ?? []) : null
      const room = pitch === null ? null : stated
      for (const i of members) out.set(i, { next: j + 1, room, pitch })
    }
  // paragraphs TeX opened at a group or an element (TEX:222-255)
  const forcedNext = new Set([...out.values()].map((b) => b.next))
  const said = (p: V0Piece) => p.t === 'text' && /\S/.test(p.s ?? '')
  const open = (i: number, j: number | undefined) => {
    if (j === undefined || j <= 0 || j >= n || out.has(i) || forcedNext.has(j)) return
    if (L[j - 1]![9] & KEPT || L[j]![9] & KEPT) return
    if (pieces.slice(0, i).some(said) && pieces.slice(i + 1).some(said))
      out.set(i, { next: j, room: null, pitch: null, paragraph: true })
  }
  pieces.forEach((p, i) => {
    if (p.t !== 'par') open(i, p.t === 'open' ? f.spans.get(String(p.k))?.opens : elOf(p)?.opens)
  })
  // (then each paragraph its first word states, cut into the row at the sentence start paired with it (paraPieces): on a line
  // no stronger fact the row holds opens, the paragraph stated once)
  pieces.forEach((p, i) => {
    if (p.t === 'par' && ![...out.values()].some((b) => b.next === p.next)) open(i, p.next)
  })
  return out
}

/** what statedBreaks reads of a member, as the reading reads it (lay/read.ts readMember): its lines, its elements and groups
 *  by id, whether its breaks' lines are read off the page (Placed.read 'breaks'), its frames' pitch (Placed.lead, where it is
 *  TeX's) */
export function factsOf(m: Placed): StatedFacts {
  const read = m.read ?? []
  return {
    lines: m.lines,
    els: new Map(m.els ?? []),
    spans: new Map(m.spans ?? []),
    read: read.includes('breaks'),
    pitch: read.includes('lead') ? null : m.lead,
  }
}

/** each piece's class as the reading reads it (lay/read.ts readingsOf; today's phClass2): an element's El.kind, 'symbol' where
 *  it states a drawn symbol, 'zero' where the part states nothing of it; null for every other piece */
export const clsOf = (pieces: readonly V0Piece[], els: ReadonlyMap<string, El>): (string | null)[] =>
  pieces.map((p) => {
    if (p.t !== 'ph') return null
    const el = els.get(String(p.k))
    return el ? (el.sym ? 'symbol' : el.kind) : 'zero'
  })

/** a paragraph TeX opened inside a member's text, stated by its first word (design-display 2a): the offset of that word in the
 *  unit's source projection (what Row.sentences.src counts in) and the index in Placed.lines of the line TeX opened it on. One at
 *  a line a stronger fact also states (a group's open, an element) is read only where the row does not hold that fact between
 *  its texts (a group the reply dropped) */
type ParaPoint = readonly [offset: number, line: number]
/** the member's paragraph points (the part's `paras`, which packages/format's Placed carries once the engine states it),
 *  ascending; none where its part states none (a part made before) */
export const parasOf = (m: Placed): readonly ParaPoint[] => (m as Placed & { paras?: readonly ParaPoint[] }).paras ?? []
/** beside its points, point by point, the element each point's first word stands directly after in the source (the part's
 *  `parasAfter`: the one that ended the paragraph before), null where none; none where its part names none or does not hold
 *  one a point (a part made before) */
export const parasAfterOf = (m: Placed): readonly (string | null)[] | null => {
  const a = m.parasAfter
  return a && a.length === parasOf(m).length ? a : null
}
/** what the lay states of a member's paragraph points (Laid.paras): how many opened a block on their line (by their own
 *  sentence start, by the element they stand after, or by a stronger fact the row holds there), how many did not for want of a
 *  sentence start the lay can open there (the row's starts hold none at the point's word) and of an element named, how many
 *  for want of the row's sentences and of an element named; where its part names an element beside its points
 *  (Placed.parasAfter), also how many of the opened opened by their element, and how many were not opened because the row
 *  does not return their element exactly once (or another point names it too) */
export type ParasStated =
  | [opened: number, noStart: number, noSentences: number]
  | [opened: number, noStart: number, noSentences: number, byElement: number, notOnce: number]

/**
 * How a member's row pairs a paragraph's first word (its offset `o` in the source projection, `j` the line TeX opened it on)
 * with one of its sentence starts: the row's sentences (Row.sentences), each cut holding a word of A (lit.ts `worded`), the one
 * whose first word on A (lit.ts's start rule: the first of Placed.words at or after its start, `firstWordAt`) is that word on
 * that line; its place the start's in the translation's projection (lit.ts `startsInProjection`: its first letter, digit or
 * element, back over the opening marks set against it). 'sentences' where the row carries none, 'start' where none pairs (an
 * offset inside a sentence, a start the translation sets on no letter)
 */
export function pairing(
  m: Placed,
  pieces: readonly V0Piece[],
  sentences: Sentences | undefined,
): 'sentences' | ((o: number, j: number) => number | 'start') {
  const src = sentences?.src ?? [],
    tr = sentences?.tr ?? []
  if (!src.length || src.length !== tr.length) return 'sentences'
  const words = m.words ?? []
  const cuts = worded(words, src, tr)
  const starts = startsInProjection(projectionOf(pieces).text, cuts.tr)
  return (o, j) => {
    const k = cuts.src.findIndex((s) => {
      const w = words[firstWordAt(words, s)]
      return w?.[0] === o && w[1] === j
    })
    return k < 0 || !starts ? 'start' : starts[k]!
  }
}

/**
 * The member's row pieces with its paragraph points cut into them (design-display 2a): a point on a line no stronger fact the
 * row holds opens (a group's open or an element between its texts, a forced break: statedBreaks) is paired with a sentence
 * start of the row (`pairing`), and a piece of the typesetter's own (`par`) stands in the translation where that sentence
 * begins: before the piece that holds its first character and before the groups opened right there, a text piece cut in two.
 * Where no sentence start pairs it and its part names the element its first word stands directly after in the source (the one
 * that ended the paragraph before, Placed.parasAfter: cas-sc's `\sep`, which is `\par`), it is paired with THAT element: the
 * `par` stands directly after it in the translation (and after the groups closed right there), where the row returns the
 * element exactly once and no other point names it; else it opens nothing and is counted. The row's projection is unchanged:
 * a `par` stands for no character. statedBreaks reads it as a group's open with `opens` its line, under the same guards; one it
 * does not open is taken out. Where neither pairs it the text flows on, no nearest start and no proportional place taken (an
 * end inside a sentence, a float set in the middle of one, must flow). The statement (`paras`) is present where the part
 * states a point; the pieces are `pieces` itself where it states none
 */
export function paraPieces(
  m: Placed,
  pieces: V0Piece[],
  sentences: Sentences | undefined,
): { pieces: V0Piece[]; paras?: ParasStated } {
  const points = parasOf(m)
  if (!points.length) return { pieces }
  const named = parasAfterOf(m)
  const f = factsOf(m)
  // (opened, no start, no sentences, opened by their element, their element not returned once)
  const n = [0, 0, 0, 0, 0]
  const stated = (): ParasStated => (named ? [n[0]!, n[1]!, n[2]!, n[3]!, n[4]!] : [n[0]!, n[1]!, n[2]!])
  const stronger = new Set([...statedBreaks(f, pieces, clsOf(pieces, f.els)).values()].map((b) => b.next))
  const waiting = points.flatMap(([o, j], i) => (stronger.has(j) ? [] : [{ o, j, el: named?.[i] ?? null }]))
  n[0] = points.length - waiting.length
  if (!waiting.length) return { pieces, paras: stated() }
  const pair = pairing(m, pieces, sentences)
  // (each point paired by its sentence start: its place in the translation's projection, and its line; else by its element:
  // the piece after which it stands (the element, or the groups closed right after it), and its line)
  const at = new Map<number, number>()
  const after = new Map<number, number>()
  for (const { o, j, el } of waiting) {
    const p = pair === 'sentences' ? pair : pair(o, j)
    if (typeof p === 'number') {
      at.set(p, j)
      continue
    }
    if (el === null) {
      n[p === 'sentences' ? 2 : 1]!++
      continue
    }
    const qs = pieces.flatMap((x, q) => ((x.t === 'ph' || x.t === 'nested') && x.k === Number(el) ? [q] : []))
    if (qs.length !== 1 || named!.filter((x) => x === el).length !== 1) {
      n[4]!++
      continue
    }
    let q = qs[0]!
    while (pieces[q + 1]?.t === 'close') q++
    after.set(q, j)
  }
  if (!at.size && !after.size) return { pieces, paras: stated() }
  const proj = projectionOf(pieces)
  // (the pieces cut, each with the offset it begins at in the projection; the `par`s an element placed)
  const cut: V0Piece[] = [],
    cutFrom: number[] = []
  const push = (p: V0Piece, o: number) => {
    cut.push(p)
    cutFrom.push(o)
  }
  const byEl = new Set<V0Piece>()
  pieces.forEach((p, q) => {
    const from = proj.from[q]!
    // (at a piece's first character: before it and the groups opened right there)
    if ((p.t === 'text' ? p.s.length > 0 : p.t === 'ph' || p.t === 'nested') && at.has(from)) {
      let g = cut.length
      while (g > 0 && cut[g - 1]!.t === 'open' && cutFrom[g - 1] === from) g--
      cut.splice(g, 0, { t: 'par', next: at.get(from)! })
      cutFrom.splice(g, 0, from)
    }
    if (p.t !== 'text') push(p, from)
    else {
      // (inside a text piece: the piece cut there)
      let last = 0
      for (const o of [...at.keys()].filter((x) => x > from && x < from + p.s.length).sort((a, b) => a - b)) {
        push({ ...p, s: p.s.slice(last, o - from) }, from + last)
        push({ t: 'par', next: at.get(o)! }, o)
        last = o - from
      }
      push(last ? { ...p, s: p.s.slice(last) } : p, from + last)
    }
    // (directly after the element a point is paired with, and the groups closed right there)
    const j = after.get(q)
    if (j !== undefined) {
      const par: V0Piece = { t: 'par', next: j }
      byEl.add(par)
      push(par, from + (p.t === 'ph' || p.t === 'nested' ? 1 : 0))
    }
  })
  // (statedBreaks decides each: one it does not open (its line's guards) is taken out, counted with the unpaired)
  const opens = statedBreaks(f, cut, clsOf(cut, f.els))
  const out = cut.filter((p, i) => p.t !== 'par' || opens.has(i))
  const kept = out.filter((p) => p.t === 'par')
  n[0]! += kept.length
  n[1]! += at.size + after.size - kept.length
  n[3]! += kept.filter((p) => byEl.has(p)).length
  return { pieces: out, paras: stated() }
}
