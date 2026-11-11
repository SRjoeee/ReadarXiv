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
// The chain applies it once, to the unit before anything else reads it (chain.ts settle, rowContextOf): every wire writes the
// unit so unwrapped, every reading reads the reply against it (the tags and markers wires, the runs floor, the acceptance
// rule, the literal put-back and the references of groups.ts), so no wire and no reading decides it again. The unit's own
// content, and so the original's, never changes; a row's sentences come back in the unit's own projection.
import { hasLetter, headLength } from './accept.ts'
import { type Piece, type Result, SOURCE, type UnitIn } from './contract.ts'

const OBJ = '￼'
let segmenter: Intl.Segmenter | null = null

export interface Whole {
  /** the unit as every translator is sent it */
  unit: UnitIn
  /** a row of it with its sentences in the unit's own projection; dropped where they no longer rise */
  back: (r: Result) => Result
}

type Span = Extract<Piece, { t: 'span' }>
const holdsFree = (ps: readonly Piece[]): boolean => ps.some((p) => p.t === 'span' && (!p.must || holdsFree(p.content)))

/** The unit as a translator is sent it where a group that is not `must` cuts a word (the module's rule), with the way back for
 *  a row; null where none does, and the unit goes as it is */
export function wholeWordsOf(unit: UnitIn): Whole | null {
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
