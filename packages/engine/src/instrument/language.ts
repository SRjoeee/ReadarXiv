// Whether a short text is language to translate (docs/PDF-READER.md §18.72, the owner's direction of 2026-11-13: decide which
// cells are content and which are not, by what the source states and the table's structure; a translator's error is not ours
// to correct). A text that holds no ordinary word is not language: it is kept as written (R1). It is a fact of a text, so it is
// decided where Unit.kept is decided
// (instrument.mjs unitFactsOf for the source's cells and figure texts, locate/ink.ts for a figure's texts read off its ink); the
// table's own structure (a header cell alone, a body column's cells between the same two rules) is the typesetter's
// (packages/typeset lay/entry.ts decideTables). No word list and no tuned number: the definitions below are the rule.
import type { Piece } from '@readarxiv/format'

/** what text set in a code face stands as among a text's characters (a code element, a \texttt group): no word holds it */
const CODE = '\ue000'
const IS_LETTER = /\p{L}/u
const IS_DIGIT = /\p{Nd}/u
/** a token's edges: what is neither a letter, a digit nor code ("(ours)", "Avg.", "+schema", "[CLS]") */
const EDGES = /^[^\p{L}\p{Nd}\ue000]+|[^\p{L}\p{Nd}\ue000]+$/gu
/** what joins the parts of one token: a hyphen (and its Unicode forms, an en dash), a slash, a plus, a bracket */
const JOINERS = /[-\u2010\u2011\u2013/+()[\]]/
/** an apostrophe inside a word ("model's", "VGG's"): part of it */
const APOSTROPHES = /['\u2019]/g

/** a part of a token between joiners: a digit in it; two letters or more all capitals; a capital after a letter where the part
 *  is not title case (MedQA, iPhone, CNNs, McDonald); one letter alone; else a word (lower case or title case, of any script,
 *  one with no case among them) */
function partKind(p: string): 'digit' | 'capitals' | 'inner' | 'one' | 'word' | 'none' {
  if (IS_DIGIT.test(p)) return 'digit'
  const letters = [...p].filter((c) => IS_LETTER.test(c))
  if (!letters.length) return 'none'
  if (letters.length === 1) return 'one'
  if (letters.every((c) => c !== c.toLowerCase() && c === c.toUpperCase())) return 'capitals'
  if (/\p{L}\p{Lu}/u.test(p) && !/^\p{Lu}[^\p{Lu}]*$/u.test(p)) return 'inner'
  return 'word'
}

/** a token's class (R1's exact reading, PDF-READER §18.72):
 *  - `symbol`: no letter and no digit once its edges are off, or one letter alone (a variable, a label: "B", "N+");
 *  - `number`: it holds a digit (79.86, 4,099, Qwen3-4B, 18-layer, test1);
 *  - `identifier`: it holds text set in a code face; or an underscore; or a dot between two letters (torch.nn, Aes.Qual, s.e.);
 *    or, cut at its joiners (- / + ( ) [ ]), one part of it is all capitals of two letters or more, holds a capital after a
 *    letter (not title case), holds a digit or is one letter (Lean-GAP, MNLI-(m/mm), T(s), w/o); or, with no joiner, it is
 *    all capitals of two letters or more (AULC, BLEU) or holds a capital after a letter (MedQA, CaseHOLD, DeepSeek);
 *  - `word`: anything else: lower case or title case letters (Avg., Recovery, Self-Attention, Precision/Recall, Gemini) */
export function tokenKind(token: string): 'symbol' | 'number' | 'identifier' | 'word' {
  const t = token.replace(EDGES, '')
  if (!t || ![...t].some((c) => IS_LETTER.test(c) || IS_DIGIT.test(c) || c === CODE)) return 'symbol'
  if (IS_DIGIT.test(t)) return 'number'
  if (t.includes(CODE) || t.includes('_') || /\p{L}\.\p{L}/u.test(t)) return 'identifier'
  const parts = t.split(JOINERS).filter((x) => x.length)
  if (parts.length > 1)
    return parts.some(
      (x) => partKind(x.replace(APOSTROPHES, '')) !== 'word' && partKind(x.replace(APOSTROPHES, '')) !== 'none',
    )
      ? 'identifier'
      : 'word'
  const k = partKind(t.replace(APOSTROPHES, ''))
  return k === 'one' || k === 'none' ? 'symbol' : k === 'capitals' || k === 'inner' ? 'identifier' : 'word'
}

/** a text's characters as R1 reads them: its text pieces in order, text set in a code face (a span whose style is `mono`, an
 *  element of kind `code`) one CODE character each, every other element (a formula, a citation, a reference, a paper's macro, a
 *  space, a rule) a space: an element is a fact of the source, never a word */
export function wordTextOf(content: readonly Piece[], mono = false): string {
  let out = ''
  for (const p of content) {
    if (p.t === 'text') out += mono ? p.s.replace(/\S+/g, CODE) : p.s
    else if (p.t === 'el') out += p.kind === 'code' ? CODE : ' '
    else if (p.t === 'span') out += wordTextOf(p.content, mono || p.style === 'mono')
    else out += ' '
  }
  return out
}

/** the tokens of a text (wordTextOf, cut at white space) */
export const tokensOf = (content: readonly Piece[]): string[] =>
  wordTextOf(content)
    .split(/\s+/u)
    .filter((x) => x.length)

/** R1: a text that holds no ordinary word is not language (every token a symbol, a number or an identifier) */
export const holdsNoWord = (content: readonly Piece[]): boolean =>
  tokensOf(content).every((t) => tokenKind(t) !== 'word')

/** why a short text is kept as written: 'words' (R1: it holds no ordinary word), or null (language: sent) */
export function keptAsWritten(content: readonly Piece[]): 'words' | null {
  return holdsNoWord(content) ? 'words' : null
}
