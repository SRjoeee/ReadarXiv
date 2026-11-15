// A group that cuts a word is offered to no translator (the owner's ruling of 2026-11-12, docs/PDF-READER.md §18.47). A style
// group says something about a stretch of meaning, and crosses a translation only where it is made of whole words: one with
// an edge inside a word describes that word's spelling (an acronym's initials, `\textbf{I}nduce, \textbf{E}dit,
// \textbf{R}etrieve`; a drop cap; a stressed syllable, `{\em sub}gradient`), which has no counterpart in the target. Offered,
// the translator translated the fragments (2111.09276v1 on staging, Google: "I" the pronoun 我, "dit" 迪特, "R" 拉). So the
// word travels whole and plain on every wire, and the translation carries no style from the group; widened to the whole
// word, the group would state an emphasis the author did not make. Correct words come before style.
//
// The rule, a definition with no list of letters or words: a group (a span) that is not `must`, an edge of which (its start
// or its end in the unit's projection, accept.ts projectionOf) stands strictly inside a word of the source, is unwrapped:
// its words become its parent's, its head (accept.ts headLength: the elements before its first word, a declaration's place)
// stays in a copy of it holding the head alone, as every wire already brings a head back (loose, `{\bf B}`'s `\bf` would hold
// past the group), and the stop TeX set at its end (its `stop`) is written after its words. A word is a word-like segment
// of the projection by Unicode's word boundaries (UAX #29 as ICU gives them, `Intl.Segmenter` of the source language SOURCE,
// granularity `word`, whose `isWordLike` marks letters, digits and ideographs: ICU's dictionaries cut a CJK text into words);
// an element is U+FFFC there, no letter of any word, and an edge where TeX sets a group's stop stands on that punctuation.
// So `\textit{n}-gram` (a hyphen is a boundary), `\textbf{RQ1}:` and `\textbf{Step 1}.` keep their groups, and a group of
// whole words travels as before. Not unwrapped: a `must` group, which the host states comes back exactly once (a link, which
// carries an address; a run-in label; every pair of the HTML page, which holds a `<sub>` or a `<sup>` as a pair of no style),
// and any group of a unit with no letter (nothing is sent: hasLetter).
//
// Letters glued to an element that make one word with the text TeX set for it (its `text`: on its line's baseline at its text's
// size, the prepare's statement, contract.ts) are that word's, never a word of their own (the display design's F10): the
// translator is offered the element alone, and the row has those letters back beside it, literally, as the source sets them.
// 2111.09276v1's Table 1 on staging, Google: `\hlyellow{guitar}s.` went out as an element and "s.", and "s" came back as 秒,
// seconds. The same definition: UAX #29's word boundaries (`Intl.Segmenter` of SOURCE) over the projection with each element
// that states a text in its place; every letter of a word-like segment that holds such a text and stands outside it, in the
// unit's own text, is held back. An element that states none (a raised mark, `\textsuperscript{1}Carnegie`; one that sets
// nothing) holds nothing back, nor is the kind asked: the text alone decides. Each held run comes back after the element it
// follows, else before the one it precedes, outside the groups that hold the element but not the run.
//
// The chain applies both rules once, to the unit before anything else reads it (chain.ts settle, rowContextOf): every wire
// writes the unit so unwrapped, every reading reads the reply against it (the tags and markers wires, the runs floor, the
// acceptance rule, the literal put-back and the references of groups.ts), so no wire and no reading decides it again. The
// unit's own content, and so the original's, never changes; a row's sentences come back in the unit's own projection.
import { hasLetter, headLength } from './accept.ts'
import { type OutPiece, type Piece, type Result, SOURCE, type Sentences, type UnitIn } from './contract.ts'

const OBJ = '￼'
let segmenter: Intl.Segmenter | null = null

interface Whole {
  /** the unit as every translator is sent it */
  unit: UnitIn
  /** a row of it with its sentences in the unit's own projection; dropped where they no longer rise */
  back: (r: Result) => Result
}

type Span = Extract<Piece, { t: 'span' }>
const holdsFree = (ps: readonly Piece[]): boolean => ps.some((p) => p.t === 'span' && (!p.must || holdsFree(p.content)))

/** The unit as a translator is sent it (the module's two rules: a group that is not `must` and cuts a word unwrapped; letters
 *  that make one word with an element's text held back), with the way back for a row; null where neither changes it, and the
 *  unit goes as it is */
export function wholeWordsOf(unit: UnitIn): Whole | null {
  const groups = cutGroupsOf(unit)
  const held = heldLettersOf(groups?.unit ?? unit)
  if (!held) return groups
  if (!groups) return held
  return { unit: held.unit, back: (r) => groups.back(held.back(r)) }
}

/** the unit with each group that is not `must` and cuts a word unwrapped (the module's first rule); null where none does */
function cutGroupsOf(unit: UnitIn): Whole | null {
  if (!holdsFree(unit.content) || !hasLetter(unit)) return null
  // the projection, each group's [start, end) in it, and the offsets where TeX sets a group's stop
  let projection = ''
  const edges = new Map<Span, [number, number]>()
  const stopsAt = new Set<number>()
  const walk = (ps: readonly Piece[]) => {
    for (const p of ps) {
      if (p.t === 'text') projection += p.s
      else if (p.t === 'el') projection += OBJ
      else {
        const a = projection.length
        walk(p.content)
        edges.set(p, [a, projection.length])
        if (p.stop) stopsAt.add(projection.length)
      }
    }
  }
  walk(unit.content)
  // (every offset strictly inside a word-like segment)
  segmenter ??= new Intl.Segmenter(SOURCE, { granularity: 'word' })
  const inside = new Set<number>()
  for (const s of segmenter.segment(projection))
    if (s.isWordLike) for (let x = s.index + 1; x < s.index + s.segment.length; x++) inside.add(x)
  const cuts = (x: number) => inside.has(x) && !stopsAt.has(x)
  const cut = new Set<Span>()
  for (const [p, [a, b]] of edges) if (!p.must && (cuts(a) || cuts(b))) cut.add(p)
  if (!cut.size) return null
  // the unit with each such group unwrapped: its head in a copy of it, its words, its stop; texts side by side as one
  const stops: { at: number; now: number }[] = []
  const unwrap = (ps: readonly Piece[]): Piece[] => {
    const out: Piece[] = []
    const put = (q: Piece) => {
      const last = out[out.length - 1]
      if (q.t === 'text' && last?.t === 'text') out[out.length - 1] = { t: 'text', s: last.s + q.s }
      else out.push(q)
    }
    for (const p of ps) {
      if (p.t !== 'span') put(p)
      else if (!cut.has(p)) put({ ...p, content: unwrap(p.content) })
      else {
        const k = headLength(p.content)
        if (k) {
          const { stop: _stop, ...copy } = p
          put({ ...copy, content: unwrap(p.content.slice(0, k)) })
        }
        for (const q of unwrap(p.content.slice(k))) put(q)
        if (p.stop) {
          stops.push({ at: (edges.get(p) as [number, number])[1], now: p.stop.length })
          put({ t: 'text', s: p.stop })
        }
      }
    }
    return out
  }
  const content = unwrap(unit.content)
  stops.sort((a, b) => a.at - b.at)
  /** an offset of the sent unit's projection in the unit's own: one inside a stop written there the stop's place */
  const own = (x: number): number => {
    let shift = 0
    for (const s of stops) {
      const from = s.at + shift
      if (x < from) break
      if (x < from + s.now) return s.at
      shift += s.now
    }
    return x - shift
  }
  const back = (r: Result): Result => {
    if (!stops.length || !r.ok || !r.sentences) return r
    const src = r.sentences.src.map(own)
    if (src.some((x, i) => x <= (i ? (src[i - 1] as number) : 0))) {
      const { sentences: _sentences, ...rest } = r
      return rest
    }
    return { ...r, sentences: { src, tr: r.sentences.tr } }
  }
  return { unit: { ...unit, content }, back }
}

type El = Extract<Piece, { t: 'el' }>
/** a run of letters held back: the element it comes back beside, on which side, and the groups that hold the element but not
 *  the run, innermost first (the row has it back outside them) */
interface Held {
  id: string
  side: 'before' | 'after'
  s: string
  exits: string[]
}
/** an element in the projection this rule reads: the text TeX set for it, where it states one and is a word of the unit's
 *  sentences; else U+FFFC, no letter of any word. One stating `after` is none (contract.ts: TeX sets it after the unit's text,
 *  white space before it, a backref's list of pages; the chain gives it no translator, tailOf), its text no neighbour of the
 *  unit's letters */
const shownOf = (p: El): string => (p.text && p.after === undefined ? p.text : OBJ)
/** the projection position of each piece of the unit: a text's characters (with the groups around them) or an element */
type At = { t: 'text'; piece: Piece; k: number; groups: string[] } | { t: 'el'; el: El; groups: string[] }

/** The unit with the letters that make one word with an element's text held back (the module's second rule, F10), and the way
 *  back for a row; null where no element states a text that a letter beside it shares a word with */
function heldLettersOf(unit: UnitIn): Whole | null {
  // (the projection with each element's text in its place, each position's piece; an element stating none, U+FFFC)
  let projection = ''
  const at: At[] = []
  const texts: { el: El; a: number; b: number }[] = []
  const walk = (ps: readonly Piece[], groups: string[]) => {
    for (const p of ps) {
      if (p.t === 'text') {
        for (let k = 0; k < p.s.length; k++) at.push({ t: 'text', piece: p, k, groups })
        projection += p.s
      } else if (p.t === 'el') {
        const s = shownOf(p)
        if (s !== OBJ) texts.push({ el: p, a: projection.length, b: projection.length + s.length })
        for (let k = 0; k < s.length; k++) at.push({ t: 'el', el: p, groups })
        projection += s
      } else walk(p.content, [...groups, p.id])
    }
  }
  walk(unit.content, [])
  if (!texts.length) return null
  segmenter ??= new Intl.Segmenter(SOURCE, { granularity: 'word' })
  const held = new Set<number>()
  /** the word (its index) each position of a word that holds an element's text stands in */
  const wordAt = new Map<number, number>()
  let w = 0
  for (const s of segmenter.segment(projection)) {
    if (!s.isWordLike) continue
    const from = s.index
    const to = s.index + s.segment.length
    if (!texts.some((x) => x.a < to && x.b > from)) continue
    w++
    for (let x = from; x < to; x++) {
      wordAt.set(x, w)
      if (at[x]?.t === 'text') held.add(x)
    }
  }
  if (!held.size) return null
  // (each held run, within one text piece: after the element of its word it follows, past the other held runs, else before the
  // one it precedes)
  const runs: Held[] = []
  const seen = new Set<number>()
  const elAt = (x: number, word: number | undefined) =>
    at[x]?.t === 'el' && wordAt.get(x) === word ? (at[x] as Extract<At, { t: 'el' }>) : null
  for (let x = 0; x < at.length; x++) {
    if (!held.has(x) || seen.has(x)) continue
    const here = at[x] as Extract<At, { t: 'text' }>
    let y = x
    while (held.has(y + 1) && at[y + 1]?.t === 'text' && (at[y + 1] as Extract<At, { t: 'text' }>).piece === here.piece)
      y++
    for (let k = x; k <= y; k++) seen.add(k)
    let left = x - 1
    while (held.has(left)) left--
    let right = y + 1
    while (held.has(right)) right++
    const after = elAt(left, wordAt.get(x))
    const before = after ? null : elAt(right, wordAt.get(x))
    const to = after ?? before
    if (!to) {
      // (no element of its word beside it: it stays in the unit; by the segments' definition one always is)
      for (let k = x; k <= y; k++) held.delete(k)
      continue
    }
    runs.push({
      id: to.el.id,
      side: after ? 'after' : 'before',
      s: here.piece.t === 'text' ? here.piece.s.slice(here.k, here.k + (y - x) + 1) : '',
      exits: to.groups.filter((g) => !here.groups.includes(g)).reverse(),
    })
  }
  // the unit without them
  let n = 0
  const keep: number[] = []
  const strip = (ps: readonly Piece[]): Piece[] => {
    const out: Piece[] = []
    for (const p of ps) {
      if (p.t === 'text') {
        let s = ''
        for (const ch of p.s) {
          if (!held.has(n)) {
            s += ch
            keep.push(n)
          }
          n += ch.length
        }
        if (s) out.push({ t: 'text', s })
      } else if (p.t === 'el') {
        keep.push(n)
        n += shownOf(p).length
        out.push(p)
      } else out.push({ ...p, content: strip(p.content) })
    }
    return out
  }
  const content = strip(unit.content)
  // (the unit's own projection, each element one character: where each kept position of the sent unit's projection stands)
  const ownOf = new Map<number, number>()
  {
    let own = 0
    let x = 0
    for (const a of at) {
      if (a.t === 'el') {
        if (x === 0 || at[x - 1]?.t !== 'el' || (at[x - 1] as Extract<At, { t: 'el' }>).el !== a.el) ownOf.set(x, own++)
      } else ownOf.set(x, own++)
      x++
    }
    ownOf.set(at.length, own)
  }
  const sentToOwn = [...keep.map((x) => ownOf.get(x) as number), ownOf.get(at.length) as number]
  const back = (r: Result): Result => {
    if (!r.ok) return r
    const { content: row, inserted } = putBack(r.content, runs)
    if (!r.sentences) return { ...r, content: row }
    const sentences = mapSentences(r.sentences, sentToOwn, inserted)
    if (!sentences) {
      const { sentences: _s, ...rest } = r
      return { ...rest, content: row }
    }
    return { ...r, content: row, sentences }
  }
  return { unit: { ...unit, content }, back }
}

/** a row with each held run back beside its element, outside the groups it left (where the row holds them around the element);
 *  each inserted run's place in the row's projection before it, and its side */
function putBack(
  row: readonly OutPiece[],
  runs: readonly Held[],
): { content: OutPiece[]; inserted: { at: number; n: number; side: 'before' | 'after' }[] } {
  const MARK = Symbol('held')
  type Marked = OutPiece & { [MARK]?: 'before' | 'after' }
  const clone = (ps: readonly OutPiece[]): OutPiece[] =>
    ps.map((p) => (p.t === 'span' ? { ...p, content: clone(p.content) } : { ...p }))
  const out = clone(row)
  /** the path to an element: each level's list and the index in it */
  const find = (
    ps: OutPiece[],
    id: string,
    path: { list: OutPiece[]; i: number }[] = [],
  ): { list: OutPiece[]; i: number }[] | null => {
    for (const [i, p] of ps.entries()) {
      if (p.t === 'el' && p.id === id) return [...path, { list: ps, i }]
      if (p.t === 'span') {
        const f = find(p.content, id, [...path, { list: ps, i }])
        if (f) return f
      }
    }
    return null
  }
  for (const side of ['after', 'before'] as const)
    for (const h of side === 'after' ? [...runs].reverse() : runs) {
      if (h.side !== side) continue
      const path = find(out, h.id)
      if (!path) continue
      // (out of the groups the run stands outside of, innermost first, where the row holds the element in them)
      let level = path.length - 1
      for (const g of h.exits) {
        const up = path[level - 1]
        const node = up?.list[up.i]
        if (!up || node?.t !== 'span' || node.id !== g) break
        level--
      }
      const { list, i } = path[level] as { list: OutPiece[]; i: number }
      const text: Marked = { t: 'text', s: h.s, [MARK]: side }
      list.splice(side === 'after' ? i + 1 : i, 0, text)
    }
  // (each inserted run's place in the projection the reading gave, then the row's texts side by side as one)
  const inserted: { at: number; n: number; side: 'before' | 'after' }[] = []
  let old = 0
  const scan = (ps: readonly OutPiece[]) => {
    for (const p of ps as Marked[]) {
      if (p.t === 'text') {
        if (p[MARK]) inserted.push({ at: old, n: p.s.length, side: p[MARK] })
        else old += p.s.length
      } else if (p.t === 'el') old += 1
      else scan(p.content)
    }
  }
  scan(out)
  const join = (ps: OutPiece[]): OutPiece[] => {
    const res: OutPiece[] = []
    for (const p of ps) {
      const last = res[res.length - 1]
      if (p.t === 'text' && last?.t === 'text') res[res.length - 1] = { t: 'text', s: last.s + p.s }
      else res.push(p.t === 'span' ? { ...p, content: join(p.content) } : p.t === 'text' ? { t: 'text', s: p.s } : p)
    }
    return res
  }
  return { content: join(out), inserted }
}

/** a row's sentences after the put-back: the source's from the sent unit's projection to the unit's own; the row's past the
 *  letters put back (a run put back after its element stays in the sentence before a start right after it, one put back
 *  before its element in the sentence that starts at it); null where they no longer rise */
function mapSentences(
  s: Sentences,
  sentToOwn: readonly number[],
  inserted: readonly { at: number; n: number; side: 'before' | 'after' }[],
): Sentences | null {
  const src = s.src.map((x) => sentToOwn[x] ?? x)
  const tr = s.tr.map(
    (t) => t + inserted.reduce((a, x) => a + (x.at < t || (x.at === t && x.side === 'after') ? x.n : 0), 0),
  )
  const rises = (xs: number[]) => xs.every((x, i) => x > (i ? (xs[i - 1] as number) : 0))
  return rises(src) && rises(tr) ? { src, tr } : null
}
