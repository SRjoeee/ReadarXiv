// Sentence cuts for engines that report none of their own (Google, Chrome's built-in translator): where each sentence after
// the first begins, in a unit's plain projection (its text, each element one U+FFFC character). Restated from the
// extension's splitter (src/core/sentences, the owner's code, measured against Microsoft's own boundaries over 60 blocks:
// 98.4 % precision, 100 % outside bibliographies; under-splitting only), over typed elements instead of a wire's
// placeholders: what an element reads as is the caller's word (`standIn`), not a guess from TeX. The splitter cut a wire whose
// white space was collapsed; a projection carries its source's own, which is read here as that source reads it (`running`).

/** A period after one of these ends no sentence (the extension's list, extended 2026-10-01 over the corpus) */
export const ABBR =
  /\b(?:[A-Z]|Fig|Figs|Eq|Eqs|Sec|Secs|Ref|Refs|Thm|Def|Lem|Prop|Cor|Rev|Phys|Lett|Nucl|Astron|Astrophys|Mon|Not|Proc|Conf|Int|J|vs|etc|cf|al|approx|resp|viz|ca|c|Dr|Mr|Mrs|Ms|Prof|St|Mt|Jr|No|Vol|pp|Ed|Eds|Sci|Rep|Univ|Dept|Inst|Inc|Ltd|Corp|Co|e\.g|i\.e|w\.r\.t|a\.k\.a|i\.i\.d|a\.e)\.$/
/** abbreviations that may end a sentence, where what follows decides */
export const TERMINAL_ABBR = /\b(?:etc|al|a\.e|i\.i\.d|Inc|Ltd|Corp|Co|Jr|ca|c)\.$/
/** a case's `v.` after a capitalised name (`Oregon v. Mitchell`) */
const CASE_V = /\b[A-Z][\w'’-]*\s+v\.$/
/** a numbered part's label before its number, a month before its day or year */
const NUMBERED_PART =
  /\b(?:Eqn|Eqns|Sect|Sects|Ch|Chap|Chaps|Tab|Tabs|App|Apps|Alg|Algs|Ex|Exs|Thms|Defs|Lems|Props|Cors|Rem|Rems|Conj|Obs|Prob|Probs|Nos|Vols)\.$/
const ITS_NUMBER = /^\s*(?:\(?\d|[A-Z](?:\.?\d|(?!\w))|[IVX]+\b)/
const MONTH = /\b(?:Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.$/
const ITS_DATE = /^\s*\d/
/** a short capitalised label before its number (`Exer. 5`), not before an enumerator (`2)`, `2.`) */
const LABEL = /\b[A-Z][a-z]{1,4}\.$/
const NUMBERED = /^\s*\d+(?:\.\d+)*(?![\d)]|\.(?!\d))/
/** lower case, a digit or an opening bracket: a continuation, not a new sentence */
const CONTINUES = /^\s*[a-z0-9([]/

const OBJ = '￼'
/** what an element reads as when the caller says nothing: a word */
const STAND_IN = 'Xx'
/** what a citation reads as where it opens a sentence: a word that begins one, bracketed as a citation is written, so that a
 *  stop that ends no sentence before it still continues there (`et al. [3] classify`: TERMINAL_ABBR, CONTINUES) */
const OPENING_CITATION = '[Xx]'
/** a sentence's stop, its closing marks, then white space: what TeX sets a sentence's space after */
const AFTER_STOP = /[.!?]["'”’)\]]*[\t\n\f\r ]+$/
/** what follows a citation, past white space and elements: a word in lower case, which opens no sentence of its own */
const LOWER_NEXT = /^[\s￼]*\p{Ll}/u
/** a run of white space in the text, and a line end in it */
const WHITE = /[\t\n\f\r ]+/g
const LINE_ENDS = /\n/g

/** What an element reads as to the splitter: `annotation` (a footnote's mark, which belongs to the sentence before it),
 *  `citation` (a citation: an annotation of the sentence it is set against, but the first word of the sentence it opens
 *  after a sentence's stop and white space, a word in lower case after it), or the text it stands for (`x` a formula, `1` a
 *  reference, ' ' a space, '\n' a break, a word) */
export type StandIn = 'annotation' | 'citation' | string

/**
 * The text's white space as TeX and HTML read a paragraph's: a run of it is one space, never a sentence's end. Intl.Segmenter
 * breaks at every line end (UAX #29 SB4), and the PDF's units carry their source's own lines, where TeX reads a line end as a
 * space (34,791 of the 88 corpus papers' 71,288 cuts stood at one with no stop before it, 2026-11-10); the HTML page's text
 * comes collapsed (src/core/sentences visibleTextOf). A run holding an empty line is TeX's `\par`, a paragraph's end: its
 * first line end kept. Each character in its place, so offsets do not move; an element's own stand-in is not touched
 */
function running(projection: string): string {
  return projection.replace(WHITE, (run) => {
    const breaks = run.match(LINE_ENDS)?.length ?? 0
    if (breaks < 2) return ' '.repeat(run.length)
    const k = run.indexOf('\n')
    return ' '.repeat(k) + '\n' + ' '.repeat(run.length - k - 1)
  })
}

/**
 * The cuts of a projection: offsets where a sentence after the first begins, strictly inside it and strictly increasing.
 * `standIn(at)` is asked for the element at projection offset `at`
 */
export function sentenceCuts(
  projection: string,
  standIn: (at: number) => StandIn | undefined = () => undefined,
): number[] {
  if (!projection) return []
  const text = running(projection)
  let visible = ''
  /** visible offset → projection offset */
  const back: number[] = []
  const tokens: { from: number; to: number }[] = []
  for (let i = 0; i < projection.length; i++) {
    const ch = text[i] as string
    if (ch !== OBJ) {
      back.push(i)
      visible += ch
      continue
    }
    const s = standIn(i)
    // (a citation after a sentence's stop and the space TeX sets after it, then a word in lower case, is that word's subject:
    // the sentence can begin only at it, `… expensive. \citet{x} proposes …`. Microsoft's own boundaries over the stored rows:
    // cut before 54 of 54 after a sentence's last word, 0 of 11 after an abbreviation's, which the merge below keeps.
    // Elsewhere it annotates the sentence it is set against, `… holds.\cite{x} We …`, and what follows decides as before:
    // `… Harness? \cite{x}, LRB = …` goes on)
    const token =
      s === 'citation'
        ? AFTER_STOP.test(visible) && LOWER_NEXT.test(text.slice(i + 1))
          ? OPENING_CITATION
          : ' '
        : s === 'annotation'
          ? ' '
          : s === undefined
            ? STAND_IN
            : !s.trim()
              ? /\n/.test(s)
                ? '\n'
                : ' '
              : s.replace(/[\t\f\r ]+/g, ' ')
    for (let k = 0; k < token.length; k++) back.push(i)
    tokens.push({ from: visible.length, to: visible.length + token.length })
    visible += token
  }
  back.push(projection.length)
  const inToken = (at: number) => tokens.some((t) => at >= t.from && at < t.to)
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
  const pieces: string[] = []
  let last = 0
  let consumed = 0
  for (const { segment } of segmenter.segment(visible)) {
    const prev = pieces[pieces.length - 1]
    const tail = prev?.trimEnd() ?? ''
    const merge =
      prev !== undefined &&
      ((ABBR.test(tail) && (!TERMINAL_ABBR.test(tail) || CONTINUES.test(segment))) ||
        CASE_V.test(tail) ||
        (NUMBERED_PART.test(tail) && ITS_NUMBER.test(segment)) ||
        (MONTH.test(tail) && ITS_DATE.test(segment)) ||
        (LABEL.test(tail) && NUMBERED.test(segment))) &&
      // (not where the letter before the stop is an element's own: `… of v. Then` ends its sentence)
      !inToken(last + tail.length - 2)
    if (merge) pieces[pieces.length - 1] = prev + segment
    else {
      pieces.push(segment)
      last = consumed
    }
    consumed += segment.length
  }
  const cuts: number[] = []
  let at = 0
  for (let i = 0; i < pieces.length - 1; i++) {
    at += (pieces[i] as string).length
    // a boundary inside an element's own text is none of the unit's (a citation's `Ex. 2.6`)
    if (tokens.some((t) => at > t.from && at < t.to)) continue
    const p = back[at] ?? projection.length
    if (p > (cuts[cuts.length - 1] ?? 0) && p < projection.length) cuts.push(p)
  }
  return cuts
}
