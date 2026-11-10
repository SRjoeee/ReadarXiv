// A reference's abbreviated name sent as the referenced item's full name (the owner's ruling of 2026-11-10). Microsoft's free
// endpoint cuts a sentence at an abbreviation's full stop before a reference's marker: 2610.22065v1 p5's "in Fig. 7." came back
// into Chinese with the figure's word dropped and the number left alone after a full stop of its own, and "Fig." elsewhere as
// the fruit; a no-break space or the text paired did not help. Over 52 abbreviations tied to a reference in 27 units of the
// corpus, sent live as they are and as the item's full name (lane ref-names, 2026-11-10): the endpoint cut its source sentence at
// the abbreviation 10 times as they are and never as the name; "Fig." kept its word for the figure 7 times of 15, "Tab." 0 of 3
// (read as a label), "App." 2 of 5, and every one of them as the full name ("Eq.", "Sec." read alike both ways).
//
// The rule, a definition with no word list and no language's table: where the word a unit's text ends in right before a
// reference (white space, a tie or a break alone between them) is a case-insensitive proper prefix of the full name the paper
// gives the referenced item's type (the element's `name`, read in its marked compile from its own TeX: the label's type and
// cleveref's, hyperref's or LaTeX's name for it), followed by a full stop, the translator is sent that name instead, in the
// word's case. A name not stated (a type or a name TeX did not tell), or a word that is no such abbreviation ("Figs.",
// "Thm."), leaves the text as it is. Only what a translator is sent changes: the unit, the original's text and every reading of
// it stay; a row's sentences come back in the unit's own projection.
import type { Piece, Result, UnitIn } from './contract.ts'
import { standInOf } from './wire/text.ts'

/** the word a text ends in, its full stop, then white space alone: [1] the word (a letter, then letters and marks: no
 *  letter, mark or digit right before it), [2] the white space */
const TIED = /(?<![\p{L}\p{M}\p{N}])(\p{L}[\p{L}\p{M}]*)\.(\s*)$/u

/** the name in the abbreviation's case: in capitals where its letters are (two or more), else its first letter the word's */
function cased(word: string, name: string): string {
  if (word.length > 1 && word === word.toUpperCase() && word !== word.toLowerCase()) return name.toUpperCase()
  const first = name.slice(0, 1)
  const lead = word.slice(0, 1)
  return (
    (lead === lead.toUpperCase() && lead !== lead.toLowerCase() ? first.toUpperCase() : first.toLowerCase()) +
    name.slice(1)
  )
}

/** whether `word` abbreviates `name`: a case-insensitive proper prefix of it */
const abbreviates = (word: string, name: string): boolean =>
  word.length < name.length && name.toLowerCase().startsWith(word.toLowerCase())

/** the reference a text piece at `k` is tied to: the next piece past white space alone (an element read as a space or a
 *  break, a text of white space), where it states a name */
function tiedTo(ps: readonly Piece[], k: number): string | null {
  for (let j = k + 1; j < ps.length; j++) {
    const q = ps[j] as Piece
    if (q.t === 'text') {
      if (/^\s*$/.test(q.s)) continue
      return null
    }
    if (q.t !== 'el') return null
    if (q.name) return q.name
    if (standInOf(q.kind) === ' ') continue
    return null
  }
  return null
}

/** one word replaced: at `at` in the unit's projection, `was` characters there (the word and its stop), `now` sent */
interface Swap {
  at: number
  was: number
  now: number
}

export interface Named {
  /** the unit as every translator is sent it */
  unit: UnitIn
  /** a row of it with its sentences in the unit's own projection; dropped where they no longer rise */
  back: (r: Result) => Result
}

/**
 * The unit as a translator is sent it where a word tied to a reference abbreviates the referenced item's full name (the module's
 * rule), with the way back for a row; null where no word is so tied, and the unit goes as it is
 */
export function namedOf(unit: UnitIn): Named | null {
  const swaps: Swap[] = []
  let at = 0
  const walk = (ps: readonly Piece[]): Piece[] =>
    ps.map((p, k) => {
      if (p.t === 'span') return { ...p, content: walk(p.content) }
      if (p.t === 'el') {
        at += 1
        return p
      }
      const start = at
      at += p.s.length
      const name = tiedTo(ps, k)
      const m = name ? TIED.exec(p.s) : null
      const word = m?.[1]
      if (!name || !m || word === undefined || !abbreviates(word, name)) return p
      const full = cased(word, name)
      swaps.push({ at: start + m.index, was: word.length + 1, now: full.length })
      return { ...p, s: p.s.slice(0, m.index) + full + (m[2] ?? '') }
    })
  const content = walk(unit.content)
  if (!swaps.length) return null
  /** an offset of the sent unit's projection in the unit's own: one inside a sent name its word's start */
  const own = (x: number): number => {
    let shift = 0
    for (const s of swaps) {
      const from = s.at + shift
      if (x < from) break
      if (x < from + s.now) return s.at
      shift += s.now - s.was
    }
    return x - shift
  }
  const back = (r: Result): Result => {
    if (!r.ok || !r.sentences) return r
    const src = r.sentences.src.map(own)
    if (src.some((x, i) => x <= (i ? (src[i - 1] as number) : 0))) {
      const { sentences: _sentences, ...rest } = r
      return rest
    }
    return { ...r, sentences: { src, tr: r.sentences.tr } }
  }
  return { unit: { ...unit, content }, back }
}
