// Whether a short text is language to translate (docs/PDF-READER.md §18.72, the owner's direction: decide which cells are
// content and which are not, by what the source states and the table's structure; a translator's error is not ours to
// correct). A text that holds no ordinary word is not language: it is kept as written (R1). A word the paper's own running
// text writes as a name is a name of that paper (R2). Both are facts of a text, so they are decided where Unit.kept is decided
// (instrument.mjs unitFactsOf for the source's cells and figure texts, locate/ink.ts for a figure's texts read off its ink); the
// table's own structure (a header cell alone, a body column's cells between the same two rules) is the typesetter's
// (packages/typeset lay/entry.ts decideTables). No word list and no tuned number: the definitions below are the rule.
import type { Piece } from '@readarxiv/format'
import { sentenceCuts } from '@readarxiv/text'

/** what text set in a code face stands as among a text's characters (a code element, a \texttt group): no word holds it */
const CODE = '\ue000'
/** an element in a projection the sentence cutter reads (@readarxiv/text) */
const OBJECT = '\ufffc'
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
function wordTextOf(content: readonly Piece[], mono = false): string {
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
const tokensOf = (content: readonly Piece[]): string[] =>
  wordTextOf(content)
    .split(/\s+/u)
    .filter((x) => x.length)

/** R1: a text that holds no ordinary word is not language (every token a symbol, a number or an identifier) */
export const holdsNoWord = (content: readonly Piece[]): boolean =>
  tokensOf(content).every((t) => tokenKind(t) !== 'word')

/** the kinds whose units are the paper's running text: what LaTeX sets in paragraph mode as sentences of the paper's own prose (a
 *  paragraph, the abstract environment, a \newtheorem environment's body, a \caption, a \footnote); not a \section's heading or
 *  the \title (set in title case), a tabular's cell or a figure's text (the texts judged), the bibliography (titles and names),
 *  the author block */
export const RUNNING = new Set(['para', 'abstract', 'theorem', 'caption', 'footnote'])

/** what an element reads as to the sentence cutter (@readarxiv/text sentenceCuts): packages/translate's standInOf (wire/text.ts),
 *  the same table: a note's mark the sentence before it's, a citation where it stands, a reference a number, a formula a word,
 *  a break or a space a space; any other element a word */
function standInOf(kind: string): string | undefined {
  if (kind === 'cite') return 'citation'
  if (kind === 'note-mark' || kind === 'footnote') return 'annotation'
  if (kind === 'ref' || kind === 'eqref') return '1'
  if (kind === 'math') return 'x'
  if (kind === 'break' || kind === 'space') return ' '
  return undefined
}

/** a unit's plain projection (its text, each element and nested unit one U+FFFC) and each U+FFFC's element kind */
function projectionOf(content: readonly Piece[], kinds: Map<number, string>, out = { s: '' }): string {
  for (const p of content) {
    if (p.t === 'text') out.s += p.s
    else if (p.t === 'span') projectionOf(p.content, kinds, out)
    else {
      kinds.set(out.s.length, p.t === 'el' ? p.kind : 'unit')
      out.s += OBJECT
    }
  }
  return out.s
}

const TITLE_CASE = /^\p{Lu}\p{Ll}+$/u
const LOWER_CASE = /^\p{Ll}+$/u
const WORD = /\p{L}+/gu

/**
 * R2: the paper's own names: each title-case word (a capital, then lower-case letters) its running text (RUNNING) writes
 * capitalised mid-sentence at least once and never in lower case. Mid-sentence: not the first word of its sentence, the
 * sentences being the shared cutter's (@readarxiv/text sentenceCuts over each unit's plain projection, its elements read as
 * the translators' wires read them); a sentence's first word is the first run of letters at or after its start. Never in lower
 * case: no run of letters of the running text, wherever it stands, is the word in lower case. A word is a run of letters
 * (\p{L}+): "Gemini-2.5" holds "Gemini"; "MiniMax" and "GPT" are no title-case word (R1 reads them)
 */
export function paperNamesOf(units: readonly { kind: string; content: readonly Piece[] }[]): Set<string> {
  const capital = new Set<string>()
  const lower = new Set<string>()
  for (const u of units) {
    if (!RUNNING.has(u.kind)) continue
    const kinds = new Map<number, string>()
    const projection = projectionOf(u.content, kinds)
    if (!projection) continue
    const starts = [0, ...sentenceCuts(projection, (at) => standInOf(kinds.get(at) ?? 'other'))]
    // (each sentence's first word: the first run of letters at or after its start)
    const first = new Set<number>()
    for (const s of starts) {
      const m = /\p{L}/u.exec(projection.slice(s))
      if (m) first.add(s + m.index)
    }
    for (const m of projection.matchAll(WORD)) {
      const w = m[0]
      if (LOWER_CASE.test(w)) lower.add(w)
      else if (TITLE_CASE.test(w) && !first.has(m.index)) capital.add(w)
    }
  }
  return new Set([...capital].filter((w) => !lower.has(w.toLowerCase())))
}

/** R2: a text made only of the paper's own names and R1's tokens: every word in it, cut at its joiners, of the paper's names */
export function onlyNames(content: readonly Piece[], names: ReadonlySet<string>): boolean {
  const words = tokensOf(content).filter((t) => tokenKind(t) === 'word')
  return (
    words.length > 0 &&
    words.every((t) =>
      t
        .replace(EDGES, '')
        .split(JOINERS)
        .filter((x) => x.length)
        .every((x) => names.has(x)),
    )
  )
}

/** why a short text is kept as written: 'words' (R1: it holds no ordinary word), 'paperNames' (R2: its words are the paper's
 *  own names), or null (language: sent). Each the mark the lab's dump states it by (`keptBy`) */
export function keptAsWritten(content: readonly Piece[], names: ReadonlySet<string>): 'words' | 'paperNames' | null {
  if (holdsNoWord(content)) return 'words'
  return onlyNames(content, names) ? 'paperNames' : null
}

/** R4's one threshold: a block is the paper's names where MORE than this share of its text cells are names, exactly half not.
 *  A majority is the least that makes a block one kind of thing (names) rather than the other (words): in the owner's words,
 *  translated, "if the whole column is proper names, we should not translate it" (PDF-READER §18.72). Measured over the 92
 *  pairs' tables against one reading of their cells (lane table-judge): a body column's kept share stands at 0 or 1 in 72 % of
 *  them, and keeping the 72 blocks at exactly one half too would keep 72 cells read as words for 1 read as a name */
const BLOCK_SHARE = 0.5

/** a block's text cell (the front end's tableBlocks): a cell's units, by index, or a cell of none that prints text */
export type BlockCell = { units: readonly number[] } | { name: true }

/**
 * R4 (PDF-READER §18.72): the texts the paper's names blocks keep. A block is a body column's cells between the same two rules;
 * its text cells every cell that prints text (a unit; a call of the paper's macro that sets text; a cell in a code face). A
 * text cell is a name where it is no unit (such a call, such a code) or where each of its units is kept by R1 or R2 (`kept`).
 * Where more than half of a block's text cells are names, each of its other units' texts is a name of the paper (`keyOf`, the
 * text the unit is), kept wherever the paper's tables print it: one answer for one text. Read once, off R1's and R2's names
 * alone: a text a block keeps tips no other block
 */
export function namesOfBlocks(
  blocks: readonly (readonly BlockCell[])[],
  kept: (i: number) => boolean,
  keyOf: (i: number) => string,
): Set<string> {
  const out = new Set<string>()
  for (const block of blocks) {
    const names = block.filter((c) => 'name' in c || c.units.every(kept)).length
    if (names <= block.length * BLOCK_SHARE) continue
    for (const c of block) if ('units' in c) for (const i of c.units) if (!kept(i)) out.add(keyOf(i))
  }
  return out
}
