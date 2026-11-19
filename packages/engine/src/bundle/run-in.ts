// A title its author sets in the line at a paragraph's opening with no mark after it (the display design's F40, the owner's
// ruling of 2026-11-13: one character's width after the title; docs/PDF-READER.md §18.85): `\noindent\textbf{Global Matching}
// We leverage …` (2111.09276v1 pp5-6). TeX keeps such a title apart from its sentence by its face and an interword space; a
// translation into a script that writes no spaces between its words ran the two together. The engine states the fact on the
// group (the part's SpanAt.runin, bundle.ts placedOf) and the typesetter sets the script's separation after it (packages/typeset
// breaker/tokens.ts); no translator is told it: the wire is the same, and a reply is read as before.
//
// A group of a unit of the paper's running text (bundle.ts reads it over language.ts RUNNING's kinds alone: never an author
// block, whose names one after another set off by `\quad` are no title and its sentence) is so stated where
// (a) it opens a paragraph of its unit: no text of the unit before it (elements only), or a placement states TeX opened a
//     paragraph at it (SpanAt.opens); the outermost group there is read, a group inside it never on its own;
// (b) it sets a face: its style is a face's (bold, italic, small capitals, a code face, a face read off its glyphs), not a
//     colour, a link, an underline or a group of no style the rules know (`other`): a title set in the line is set in a face,
//     as \paragraph sets its own;
// (c) the source follows it with white space, alone or beside horizontal spacing of the paper's own: a text that begins with
//     it, a tie (an element of kind `space`, TeX's interword glue), or an element the instrument states glue of (`\hspace`,
//     `\quad`, a kern: PieceClass.glue, the part's El.glue), past any element that sets nothing (`silent`); the paper's own space
//     counts toward the lay's separation (the coordinator's amendment of 2026-11-16: 2111.09276v1's "Object Replacement" +
//     \hspace{0.2em} stood closer to its text than its siblings). A vertical skip (`\vspace`, no glue of a line's), a forced
//     break or any other element there leaves it: the title is not set in the line of its text;
// (d) what follows begins a sentence by the cutter's reading (@readarxiv/text opensAfter: a stop set at the group's close, what
//     follows no continuation), only white space, ties, citations and notes' marks between (no text; any other element first,
//     a formula opening the sentence, is a miss of the rule: "Textual Similarity $G$ is …", 2111.09276v1), and begins with a
//     word, its first character a letter (2608.27181v1's table row `\textbf{SSMB (Ours)} + HardNet~\cite{…} + MNN`, which the
//     cutter reads as two sentences, is no title and its sentence);
// and the group's text ends with no closing mark of its own (Unicode's Terminal_Punctuation or a dash, past closing brackets and
// quotes) and states no `stop` (a macro's own `{\bf #1.}`): a title so ended, or followed by its colon, is separated already.
import type { KnownElKind, KnownSpanKind, Piece } from '@readarxiv/format'
import { opensAfter } from '@readarxiv/text'
import { standInOf } from '../instrument/language.ts'

/** an element in a projection the sentence cutter reads */
const OBJECT = '\ufffc'
/** the group styles that set no face (format's SpanKind) */
const NO_FACE = new Set<string>(['colour', 'link', 'underline', 'other'] satisfies readonly KnownSpanKind[])
/** a mark a text ends with that closes it: Unicode's Terminal_Punctuation (a full stop, a colon, a semicolon, a comma, …) or a
 *  dash, read past closing brackets and quotes */
const CLOSING = /[\p{Terminal_Punctuation}\p{Pd}]$/u
const CLOSERS = /[\p{Pe}\p{Pf}"']+$/u
/** the elements that may stand between the title and its sentence's first word, none of them text: a tie, a citation, a note's
 *  mark (a nested unit is a note) */
const BETWEEN = new Set<string>(['space', 'cite', 'note-mark', 'footnote'] satisfies readonly KnownElKind[])

type Span = Extract<Piece, { t: 'span' }>
/** the unit's pieces flat, in order, each at its offset in the unit's projection (its text, each element and nested unit one
 *  U+FFFC) */
type Flat =
  | { t: 'text'; s: string }
  | { t: 'el'; kind: string; silent: boolean; glue: boolean }
  | { t: 'open'; g: Span }
  | { t: 'close'; at: number }

const textOf = (ps: readonly Piece[]): string =>
  ps.map((p) => (p.t === 'text' ? p.s : p.t === 'span' ? textOf(p.content) : OBJECT)).join('')

/** the ids of a unit's groups stated as titles set in the line, by the clauses above; `opened` the ids of its groups any
 *  placement states TeX opened a paragraph at, `glued` the ids of its elements the instrument states glue of */
export function runInsOf(
  content: readonly Piece[],
  opened: ReadonlySet<string>,
  glued: ReadonlySet<string> = new Set(),
): Set<string> {
  const flat: Flat[] = []
  const kinds = new Map<number, string>()
  let projection = ''
  const walk = (ps: readonly Piece[]) => {
    for (const p of ps) {
      if (p.t === 'text') {
        flat.push({ t: 'text', s: p.s })
        projection += p.s
      } else if (p.t === 'span') {
        flat.push({ t: 'open', g: p })
        walk(p.content)
        flat.push({ t: 'close', at: projection.length })
      } else {
        const kind = p.t === 'el' ? p.kind : 'footnote'
        flat.push({
          t: 'el',
          kind,
          silent: p.t === 'el' && p.silent !== undefined,
          glue: p.t === 'el' && glued.has(p.id),
        })
        kinds.set(projection.length, kind)
        projection += OBJECT
      }
    }
  }
  walk(content)
  const standIn = (at: number) => standInOf(kinds.get(at) ?? 'other')
  const out = new Set<string>()
  let textBefore = false
  for (let k = 0; k < flat.length; k++) {
    const x = flat[k]!
    if (x.t === 'text') {
      if (/\S/.test(x.s)) textBefore = true
      continue
    }
    if (x.t !== 'open') continue
    const g = x.g
    const text = textOf(g.content)
    if (!/\S/.test(text) || (textBefore && !opened.has(g.id))) continue
    // (the outermost group at the opening: its own text is text before what follows)
    textBefore = true
    let close = k
    for (let depth = 0; close < flat.length; close++) {
      const y = flat[close]!
      if (y.t === 'open') depth++
      else if (y.t === 'close' && --depth === 0) break
    }
    const at = flat[close]
    k = close
    if (at?.t !== 'close' || NO_FACE.has(g.style) || g.stop !== undefined) continue
    if (CLOSING.test(text.trimEnd().replace(CLOSERS, ''))) continue
    if (followed(flat, close + 1) && opensAfter(projection, at.at, standIn) !== null) out.add(g.id)
  }
  return out
}

/** (c) and (d)'s pieces: from `n`, past elements that set nothing, white space (a white text, or a text beginning with it, a
 *  tie, or the paper's own horizontal glue); then only white space, ties, glue, citations, notes' marks and groups' edges before
 *  the first text, which begins with a letter */
function followed(flat: readonly Flat[], n: number): boolean {
  let white = false
  for (; n < flat.length; n++) {
    const x = flat[n]!
    if (x.t === 'el' && x.silent) continue
    if (!white && !(x.t === 'text' ? /^\s/.test(x.s) : x.t === 'el' && (x.kind === 'space' || x.glue))) return false
    white = true
    if (x.t === 'text') {
      if (/\S/.test(x.s)) return /^\s*\p{L}/u.test(x.s)
    } else if (x.t === 'el' && !x.glue && !BETWEEN.has(x.kind)) return false
  }
  return false
}
