// Placed.words (format's; docs/PDF-READER.md §17.2): where on arXiv's page a sentence of a unit may begin, each word of the
// unit's source projection at its first glyph on A. A row's sentence starts are its translator's own (Microsoft's sentence
// lengths; the shared cutter's for Google, an LLM, Chrome's), offsets in the unit's projection the prepare cannot know before
// it is translated, so every word is placed, as today's left part carried every word's page token for its starts
// (anchors.mjs startRuns, sentenceStarts): over the corpus's stored Microsoft rows 82 % of the starts are among the shared
// cutter's cuts and 83 % among Unicode's sentence boundaries (40,409 starts, 2026-11-08), and no closed set of what precedes
// them covers the rest ("." 73 %, an element 16 %, ";" 6 %, "(" 1 %, a comma, a letter).
//
// A word is a run of letters and digits of the projection, a CJK character one of its own (today's anchors.mjs tokens). The
// unit's text glyphs on A, in stream order, are its text as TeX set it: the projection's letters and the glyphs' letters are
// matched in order (the longest common subsequence, Myers', the align's own), each side's words kept apart by a break where its
// text has one (a space, a mark, an element; a glyph apart from the one before, PDF.js's space, or on another line, but where
// TeX ended the line inside the word: facts.ts lineEnd). Letters are compared folded (compatibility decomposition, marks off,
// lower case: a ligature is its letters, an accent TeX sets as a glyph of its own is none). A word is placed where every
// letter of it is matched and its glyphs' letters follow one another with no break between: its first glyph's line (the
// index in the member's lines) and x0, from the opening brackets and quotes set against it (Unicode's Ps, Pi: the page's text
// runs them in one token with the word, today's left start, so that "(See" begins at its "("). One that is not (a word TeX never set, a word a macro's own text stands across) is
// stated at line -1: a row's start there is found at its sentence's next word placed (lay/lit.ts startsOnA, LATE).
import type { Piece } from '@readarxiv/format'
import { lcs } from '../align/myers.ts'
import type { DocGlyph } from '../doc.ts'
import { apart, lineChange, lineEnd } from './facts.ts'

/** the unit kinds lit whole, never by sentence (today's view/highlight.mjs NOT_RUNNING): a heading, a table's cell, a figure's
 *  text, a figure's ink text (what lies among their words is their float's or their table's); and a babel name, a word */
const WHOLE = new Set(['heading', 'cell', 'figure', 'inkfigures', 'name'])
/** whether a unit of `kind` lights by sentence: the prepare marks it (Unit.sentences), so that a translator cuts it, and places
 *  its words (Placed.words) */
export const bySentence = (kind: string, figure = false): boolean => !figure && !WHOLE.has(kind)

const OBJ = '￼'
/** a unit's plain projection, as the translate package counts a row's sentences in it (accept.ts projectionOf: text pieces
 *  joined, each element one character, a group's edges none; a nested unit travels as an element, the hosts' units) */
export function projectionOf(content: readonly Piece[]): string {
  let out = ''
  for (const p of content) {
    if (p.t === 'text') out += p.s
    else if (p.t === 'span') out += projectionOf(p.content)
    else out += OBJ
  }
  return out
}

/** each element's (and nested unit's) offset in the projection (projectionOf's count) and its piece id, in order: where a
 *  sentence may begin with it (a row's start that falls on it: its translator set it first in its sentence, "\method{} trains
 *  …", "\citet{x} proposes …"), placed by locate at its ink's first box on A */
export function elementsOf(content: readonly Piece[]): [offset: number, id: string][] {
  const out: [number, string][] = []
  const walk = (ps: readonly Piece[], at: number): number => {
    for (const p of ps) {
      if (p.t === 'text') at += p.s.length
      else if (p.t === 'span') at = walk(p.content, at)
      else {
        out.push([at, p.id])
        at += 1
      }
    }
    return at
  }
  walk(content, 0)
  return out
}

const LETTER = /[\p{L}\p{N}]/u
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
/** a character's letters as both sides are compared: decomposed, marks off, lower case, its letters and digits alone */
const fold = (ch: string): number[] =>
  [...ch.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()]
    .filter((c) => LETTER.test(c))
    .map((c) => c.codePointAt(0) as number)
/** a break between two words in either sequence (no folded letter is a space) */
const SEP = 32
/** the steps an alignment may take, per letter of the two sides: a resource bound (myers.ts `work`), never a decision about
 *  content; past it the words not reached are not placed */
const WORK_PER_LETTER = 256

export type Word = [offset: number, line: number, x: number]

/** opening punctuation (Unicode's Ps and Pi, and Spanish's inverted marks): what it opens follows it, never precedes it */
const OPENING = /^[\p{Ps}\p{Pi}\u00bf\u00a1]+$/u
/** whether glyph `p` is an opening mark set against `g` after it on its line: no space between them, as PDF.js reads one */
const opensBefore = (p: DocGlyph, g: DocGlyph) => !p.blank && OPENING.test(p.u) && !lineChange(p, g) && !apart(p, g)

/**
 * Each word of `content`'s projection placed on A: `glyphs` the unit's text glyphs on A in stream order, `lineOf(i)` the index in
 * the member's lines of the line glyph i stands on (-1 none), `source` its text's TeX (facts.ts lineEnd: whether a line's end
 * falls inside a word). Every word, in order; one not placed at line -1
 */
export function wordsOn(
  content: readonly Piece[],
  glyphs: readonly DocGlyph[],
  lineOf: (i: number) => number,
  source: string,
): Word[] {
  const projection = projectionOf(content)
  // (the projection's letters, each with its offset, its words' first letters, the breaks between them)
  const P: number[] = []
  const words: { offset: number; from: number; to: number }[] = []
  let sep = false,
    prev = ''
  for (let i = 0; i < projection.length; ) {
    const ch = String.fromCodePoint(projection.codePointAt(i) as number)
    const letters = fold(ch)
    if (letters.length) {
      // (a break before the unit's first word too, where an element opens it: a macro's own text on A stands before it)
      if (sep) P.push(SEP)
      if (!words.length || sep || CJK.test(ch) || CJK.test(prev))
        words.push({ offset: i, from: P.length, to: P.length })
      P.push(...letters)
      words[words.length - 1]!.to = P.length
      sep = false
    } else sep = true
    prev = ch
    i += ch.length
  }
  // (the glyphs' letters, each with its glyph, a break where the page's text has one)
  const G: number[] = []
  const gOf: number[] = []
  let gsep = false,
    beforeMark = false
  glyphs.forEach((g, q) => {
    const p = glyphs[q - 1]
    if (p) {
      if (lineChange(p, g)) gsep = lineEnd(glyphs, q, { source }) === 'drop' ? beforeMark : true
      else if (apart(p, g)) gsep = true
    }
    const letters = fold(g.u)
    if (!letters.length) {
      beforeMark = gsep
      gsep = true
      return
    }
    if (gsep && G.length) {
      G.push(SEP)
      gOf.push(-1)
    }
    for (const c of letters) {
      G.push(c)
      gOf.push(q)
    }
    gsep = false
  })
  const matched = new Int32Array(P.length).fill(-1)
  if (P.length && G.length) {
    const { pairs } = lcs(Int32Array.from(P), Int32Array.from(G), WORK_PER_LETTER * (P.length + G.length))
    for (let k = 0; k < pairs.length; k += 2) matched[pairs[k] as number] = pairs[k + 1] as number
  }
  return words.map(({ offset, from, to }) => {
    let ok = matched[from]! >= 0
    for (let i = from + 1; ok && i < to; i++) ok = matched[i]! === matched[i - 1]! + 1
    let q = ok ? gOf[matched[from]!]! : -1
    // (from the opening brackets and quotes set against it: the page's text runs them in one token with it, today's start)
    while (q > 0 && opensBefore(glyphs[q - 1]!, glyphs[q]!)) q--
    const line = q >= 0 ? lineOf(q) : -1
    return line >= 0 ? [offset, line, Math.round(glyphs[q]!.x0 * 100) / 100] : [offset, -1, 0]
  })
}
