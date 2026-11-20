// B.tokens: a unit's row as the breaker's tokens, unmeasured, each in the face it is set in: the style stack over the
// row's groups and switches, script chunks (cut between grapheme clusters, docs/PDF-READER.md §18.93), glue, the line-break
// marks, UAX 14's kept pairs, CJK–Latin autospace, punctuation's compression, hyphenation's language, the layer's own small
// capitals, TeX's explicit glue as kerns, crops, the control tokens (a forced break's newline, a kept region's blockTo), the
// marks dropped after a display or a held line's mark and the class's tail marks (U.marks' decisions: unit/marks.ts, called
// as the tokens are made, its trace in the answer), the spaces a spaceless script does not set and those beside a full-width
// mark's blank side, and each token's place in the unit's plain text (the word table's).
//
// What it reads, and the part's field each comes from (the replays hand it the tap's recorded values):
// - `unit`: the row's pieces in the translation's order, its kind and title ← Row + Placed.kind / flags
// - `resolved`: the unit's reading: the elements' resolutions (U.elements, U.breaks' marks, U.rename's names, U.marks' facts),
//   `measured` (the base style and pieces' colours its glyphs hold ← TeX's font state, Placed.style / spans), `capsRatio`
//   (Style.sc), `orig.size` (Style.size), `openBreaks` / `referenced` (U.breaks), `tail` / `tailOwn` (Placed.tail)
// - `colourOf`, `fillOf`: a group's run's fill (a colour piece's, TeX's log; any other's, a link's, its glyphs' on A where it is
//   not the fill around it) and an element's (A's glyphs) ← SpanAt.colour, El.colour, El.style.fill
// - `fills`, `smallCaps`: each rendering's runs of one fill and its faked small capitals (El.fills; the tap's in the replays);
//   a rendering's own weight, slant and small capitals, faked in TeX's case at their share or its face's, ride on its
//   resolution (`st` ← El.style, lay/read.ts)
// - `cls2`: each piece's class ← El.kind; `spacedSource`: the source writes CJK with spaces between ← a unit fact
// - `faces`: B.faces' answers (faceOf over the role table and the paper's family) and whether a face has small capitals
// - `P`: the rule set's fields resolved for the target (Rules.breaking, Rules.fit); `designs`: the paper's
import type { KnownElKind } from '@readarxiv/format'
import { cjkLeadRe, clustersOf, fullWidthPunctOf, kinsokuOf, keptPair, markOf, noStart, SPACELESS } from './script.ts'
import { drawnText, plainTracker, shown, type TextPiece, transformMap } from './text.ts'
import { dropMarks, type MarksAfter, type MarksTrace, mergeTail } from '../unit/marks.ts'
import type { V0Piece } from '../unit/breaks.ts'

/** a run's style as the tokens carry it: its family, weight, slant, small capitals, design, colour, link… */
export type TStyle = {
  fam?: string
  bold?: boolean
  italic?: boolean
  caps?: boolean
  design?: string
  color?: string | undefined
  colourRun?: true
  link?: unknown
  upper?: boolean
  fill?: number
  [more: string]: unknown
}
/** a face as B.faces gives it (faces.ts faceOf, by the role table) */
export type Face = {
  family: string
  weight: number
  style: string
  oblique: number
  stand: string
  caps: boolean
  size: number
  id?: string
  ids?: string[]
}
/** infinite glue at a place: its order (fil 1, fill 2) and how many of that order (a higher order there takes a lower's place) */
export type Fill = readonly [order: 1 | 2, n: number]
/** a fill with one more of order `o` (TeX's: only the highest order stretches) */
const fillWith = (f: Fill | undefined, o: 1 | 2): Fill => (!f || o > f[0] ? [o, 1] : o === f[0] ? [o, f[1] + 1] : f)
/** a token (layer2.d.mts Token): a run of one face, a space, a crop, or a control token */
export type Token = {
  s?: string
  st?: TStyle
  face?: Face
  cls?: 'cjk' | 'latin'
  w100: number
  glue?: boolean
  brk?: boolean
  cont?: boolean
  asp?: boolean
  punct?: 'open' | 'close' | null
  hyph?: string
  sc?: number
  at?: number
  end?: number
  space?: true
  /** a space no line breaks at: a tie's, the source's `~` (TeX's \penalty10000 and its interword glue): break.ts's group runs
   *  on through it; the space is drawn and stretched with the line's other spaces */
  tie?: true
  /** set right after the token before it with nothing between, two elements the source sets side by side (consecutive pieces of
   *  its unit) and the row too: one word, glued, and the gap before it inside the word (break.ts inWord: no slack, no squeeze) */
  tight?: true
  keep?: true
  crop?: Record<string, unknown>
  cw?: number
  sup?: true
  ph?: string
  k?: number
  math?: true
  label?: true
  leadEnd?: true
  leadGap?: number
  kern?: true
  kernEm?: number
  kernW?: number
  kernEnd?: true
  /** TeX's infinite glue after it (glueOf's `fill`): its order and how many of that order, the line's free room set there
   *  (B.place); `fillLead`, the same before it, where it is the unit's first item, whatever its kind */
  fill?: Fill
  fillLead?: Fill
  /** its `fill` stands before TeX's `\break`, a penalty, which discards nothing before it: on the line that break ends, where
   *  the placement keeps it (B.place fillsOf) */
  fillStays?: true
  newline?: number
  room?: number
  blockTo?: number
  /** its unit's end mark (El.end, lay/adapt.ts; docs/PDF-READER.md §18.52): a crop the breaker sets at the end of the unit's last
   *  line, `pad` the distance TeX set from its rectangle's right edge to its line's right edge (the slot's, PDF units at the
   *  original's size; set at the fit's scale, as the crop is drawn: §18.87), a break
   *  before it, kept off the line's text by `gap` (the original line's own distance to its ink) and half an em at most */
  endMark?: { pad: number; gap: number }
  /** a frame break (B.cuts withPageBreaks: its page, the unit's block its frame begins with, a cut of the frames' share only) */
  pageBreak?: number
  frame?: number
  share?: true
  /** a unit's own label carried to its first line's start (lay/adapt.ts, the row's label crop) */
  ownLabel?: true
  /** a part of a URL cut at its break points: the token cut (B.break urlCut) */
  of?: Token
  /** a word's head cut at a hyphenation point, its hyphen set (B.break) */
  hyphenated?: true
  /** its start stands inside a word of the target's text, by the platform's segmentation (breaker/words.ts): a merged cell's
   *  fill ends no line before it (FitParams.words) */
  midWord?: true
  /** where a word of the target's text ends inside it (breaker/words.ts, UTF-16 offsets into `s`): the only places a merged
   *  cell's fill cuts it (FitParams.words); absent on an element's text, a label's and a control token */
  wordEnds?: readonly number[]
}
/** a resolution as the tokens read it (U.elements' with the later rules' fields) */
export type TRes = {
  mode: string
  text?: string
  sup?: boolean
  math?: boolean
  st?: TStyle | null
  cls?: string
  k?: number
  parts?: { page: number; crop: number[]; baseline: number; seg: unknown }[]
  crop?: number[]
  gap?: Record<string, unknown> | null
  rename?: [number, number, string][]
  /** a mark's crop: glued to what precedes it (unit/elements.ts Res.mark) */
  mark?: true
  /** a tie's space (unit/elements.ts Res.tie) */
  tie?: true
  brk?: true
  room?: number
  brkAt?: number
  region?: number
  inPlace?: true
  origAfter?: string | null
  heldAfter?: string | null
  heldMarks?: string[]
  [more: string]: unknown
}
type Reading = {
  get(k: number): TRes | undefined
  measured?: { st?: TStyle | null; fill?: number | null; pieces?: ReadonlyMap<number, number> | null } | null
  capsRatio?: number
  orig?: { size?: number } | null
  openBreaks?: ReadonlyMap<number, number> | null
  referenced?: ReadonlySet<number> | null
  tail?: readonly { ch: string; st?: TStyle | null }[] | null
  tailOwn?: readonly string[] | null
}
/** the rule set's fields the tokens read (rules/layout.mjs resolveRules' params) */
export type TokenRules = {
  keepAll: boolean
  /** whether the script writes a space between its words (ScriptRules.spaced): read with keepAll, so that a rule set recorded
   *  before the field (the tap's) reads every target as it did */
  spaced: boolean
  cjkQuotes: boolean
  latinPatterns: string
  cyrillicPatterns: string
  hyphenation: { minWord: number }
  noStart: string
  noEnd: string
  autospace: number
  compressMax: number
  hyphen: boolean | number
}
export type TokensInput = {
  unit: { kind: string; title?: boolean; pieces: readonly V0Piece[] }
  resolved: Reading
  colourOf: (k: number) => number | null
  fillOf: (k: number) => number | null
  fills: ReadonlyMap<number, { text: string; fill: number }[] | null>
  smallCaps: ReadonlyMap<number, readonly boolean[] | null>
  cls2: readonly (string | null)[]
  spacedSource: boolean
  to: string
  base: TStyle
  designs: { serif: string; sans: string; mono: string }
  P: TokenRules
  lead: { parts?: { text: string; st: TStyle; gap?: number }[]; gap?: number } | null
  faces: { of(st: TStyle, cls: 'cjk' | 'latin'): Face; ownSmallCaps(id: string): boolean }
  /** each text token's range in the unit's plain text (the page's word table) */
  tagWords: boolean
}
/** the tokens, with the unit's base style (`base`) and U.marks' decisions taken while they were made */
type Tokens = { tokens: Token[]; base: TStyle; marks: MarksTrace }

const hexOf = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`
/** a fill not told (layout/fills.mjs UNKNOWN) */
const UNKNOWN = -1
/** a link group's open: \href's, \hyperref's and \hyperlink's, and \url's, which the prepare reads as a link group too
 *  (locate/ink.ts SPAN_STYLES): its tokens tagged with the group, so that its annotation is paired with its drawing (else a
 *  paragraph's \url beside its text loses its link) */
const LINK_OPEN = /^\\(?:href|hyperref|hyperlink|url)(?![A-Za-z])/

type Designs = TokensInput['designs']
/** latex.ltx's \normalfont: the document's serif, upright, medium, no small capitals, which \textnormal sets and each old
 *  font command first */
const normalOf = (s: TStyle, d: Designs): TStyle => ({
  ...s,
  fam: 'serif',
  bold: false,
  italic: false,
  caps: false,
  design: d.serif,
})
/** the style commands, each with what it sets: latex.ltx's \textbf, \bfseries, \textmd, \mdseries, \emph,
 *  \em, \textit, \itshape, \textsl, \slshape, \textup, \upshape, \textsc, \scshape, \texttt, \ttfamily, \textsf, \sffamily,
 *  \textrm, \rmfamily; article.cls's \bf, \it, \sl, \sc, \tt, \sf, \rm; fontmath.ltx's \mathbf and \mathit; amsbsy.sty's
 *  \boldsymbol; url.sty's \url and \path; listings.sty's \lstinline; and \code, a paper's own (its cases the rule ledger's).
 *  The old ones are LaTeX's own: article.cls's \DeclareOldFontCommand{\bf}{\normalfont\bfseries}{\mathbf}, and \it, \sl, \sc,
 *  \tt, \sf, \rm alike, \normalfont first (normalOf), then their one series, shape or family, never added to the face around
 *  them (`\emph{\bf …}` is bold upright, `{\it …}` in bold text medium italic: 2610.19282v1's captions were drawn bold italic) */
const STYLE_CMDS: [RegExp, (s: TStyle, d: Designs) => TStyle][] = [
  [/^\\bf\b/, (s, d) => ({ ...normalOf(s, d), bold: true })],
  [/^\\(?:it|sl)\b/, (s, d) => ({ ...normalOf(s, d), italic: true })],
  [/^\\sc\b/, (s, d) => ({ ...normalOf(s, d), caps: true })],
  [/^\\tt\b/, (s, d) => ({ ...normalOf(s, d), fam: 'mono', design: d.mono })],
  [/^\\sf\b/, (s, d) => ({ ...normalOf(s, d), fam: 'sans', design: d.sans })],
  [/^\\rm\b/, normalOf],
  [/^\\(?:textbf|bfseries|mathbf|boldsymbol)\b/, (s) => ({ ...s, bold: true })],
  [/^\\(?:textmd|mdseries)\b/, (s) => ({ ...s, bold: false })],
  [/^\\(?:emph|em)\b/, (s) => ({ ...s, italic: !s.italic })],
  [/^\\(?:textit|itshape|textsl|slshape|mathit)\b/, (s) => ({ ...s, italic: true })],
  [/^\\(?:textup|upshape)\b/, (s) => ({ ...s, italic: false })],
  [/^\\(?:textsc|scshape)\b/, (s) => ({ ...s, caps: true })],
  [/^\\(?:texttt|ttfamily|url|path|code|lstinline)\b/, (s, d) => ({ ...s, fam: 'mono', design: d.mono })],
  [/^\\(?:textsf|sffamily)\b/, (s, d) => ({ ...s, fam: 'sans', design: d.sans })],
  [/^\\(?:textrm|rmfamily)\b/, (s, d) => ({ ...s, fam: 'serif', design: d.serif })],
  [/^\\(?:textnormal|normalfont)\b/, normalOf],
]
const applyCmd = (src: string | undefined, s: TStyle, d: Designs): TStyle | null => {
  for (const [re, f] of STYLE_CMDS) if (re.test(src as string)) return f(s, d)
  return null
}
/** what a group's open sets: its command's style (applyCmd), else the face TeX set it in where its part states one (a paper's
 *  macro, `\topic{…}` setting `{\bf #1.}`: SpanAt.style, read off its glyphs), else nothing */
const openStyle = (p: Extract<V0Piece, { t: 'open' }>, s: TStyle, d: Designs): TStyle | null => {
  const named = applyCmd(p.src, s, d)
  if (named || !p.face) return named
  const f = p.face
  const fam = s.fam ?? 'serif'
  return {
    ...s,
    bold: !!f.bold,
    italic: !!f.slant,
    ...(f.role !== fam ? { fam: f.role, design: d[f.role] } : {}),
  }
}

/** a mark that closes a title or opens nothing a sentence starts with (SpanAt.runin's separation): Unicode's
 *  Terminal_Punctuation (a full stop, a colon, a comma, theirs in full width) or a dash, at a text's end past closing brackets
 *  and quotes, or at its start */
const CLOSING_END = /[\p{Terminal_Punctuation}\p{Pd}]$/u
const CLOSING_START = /^[\p{Terminal_Punctuation}\p{Pd}]/u
const CLOSERS_END = /[\p{Pe}\p{Pf}"']+$/u
/** a sentence's end: Unicode's Sentence_Terminal (a full stop, a question or an exclamation mark, theirs in full width) */
const SENTENCE_END = /\p{Sentence_Terminal}$/u
/** the elements that stand between a title set in the line and its sentence, none of them its first word: a tie, a citation, a
 *  note's mark (engine bundle/run-in.ts's BETWEEN, by the part's El.kind) */
const BETWEEN = new Set<string>(['space', 'cite', 'note-mark', 'footnote'] satisfies readonly KnownElKind[])

const GROUP_ITALIC = 1,
  GROUP_BOLD = 2,
  GROUP_CAPS = 4
/** a string's UTF-16 code units that are no white space. The comparisons below are ECMAScript's `\s`, its
 *  WhiteSpace and LineTerminator code points (ECMA-262's White Space and Line Terminators: U+0009-U+000D, U+0020, U+00A0,
 *  U+FEFF and the Space_Separator code points U+1680, U+2000-U+200A, U+202F, U+205F, U+3000; U+2028, U+2029): the same 25
 *  of the 65,536 code units as `/\s/` under Unicode 17 */
function nonSpace(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (
      c === 32 ||
      (c >= 9 && c <= 13) ||
      c === 0xa0 ||
      c === 0x1680 ||
      (c >= 0x2000 && c <= 0x200a) ||
      c === 0x2028 ||
      c === 0x2029 ||
      c === 0x202f ||
      c === 0x205f ||
      c === 0x3000 ||
      c === 0xfeff
    )
      continue
    n++
  }
  return n
}
/** what a declaration sets, as a group's bits: an italic, bold or small capitals switch (\em, \itshape, \bfseries, \sc, …):
 *  latex.ltx's \em, \itshape, \slshape, \bfseries, \scshape, article.cls's \it, \sl, \bf, \sc */
const declared = (src: string | undefined): number =>
  (/^\\(?:em|it|itshape|sl|slshape)$/.test(src ?? '') ? GROUP_ITALIC : 0) |
  (/^\\(?:bf|bfseries)$/.test(src ?? '') ? GROUP_BOLD : 0) |
  (/^\\(?:sc|scshape)$/.test(src ?? '') ? GROUP_CAPS : 0)
/** the unit's base style without what its own groups set, and its declarations: a declaration sets its group from where it
 *  stands, at the unit's top level the rest of it (the \sc rule, for every switch: the part's style is the state of the unit's
 *  glyphs, its declarations' already, so that "{\em …}" read over it would toggle an italic base upright where its glyphs
 *  outside its styled pieces stand upright) */
export function baseOf(unit: TokensInput['unit'], base: TStyle): TStyle {
  let total = 0,
    after = 0,
    inItalic = 0,
    inBold = 0,
    inCaps = 0,
    nItalic = 0,
    nBold = 0,
    nCaps = 0
  const open: number[] = []
  for (const p of unit.pieces) {
    if (p.t === 'open') {
      const src = p.src as string
      // (a bare group a face switch opens is stated with that switch as its command, `\em{` (SpanAt.cmd: the instrument's
      // switchesOf), and sets its group's face as the switch inside it did, declared's: latex.ltx's \textit, \emph, \itshape,
      // \textsl, \textbf, \bfseries, \textsc, \scshape)
      const bits =
        (/^\\(?:textit|emph|itshape|textsl)\b/.test(src) ? GROUP_ITALIC : 0) |
        (/^\\(?:textbf|bfseries)\b/.test(src) ? GROUP_BOLD : 0) |
        (/^\\(?:textsc|scshape)\b/.test(src) ? GROUP_CAPS : 0) |
        declared(/^(\\[A-Za-z]+)\{$/.exec(src)?.[1])
      open.push(bits)
      if (bits & GROUP_ITALIC) nItalic++
      if (bits & GROUP_BOLD) nBold++
      if (bits & GROUP_CAPS) nCaps++
    } else if (p.t === 'close') {
      const bits = open.pop() ?? 0
      if (bits & GROUP_ITALIC) nItalic--
      if (bits & GROUP_BOLD) nBold--
      if (bits & GROUP_CAPS) nCaps--
    } else if (p.t === 'ph' && declared(p.src)) {
      const bits = declared(p.src)
      if (!open.length) after |= bits
      else {
        const fresh = bits & ~open[open.length - 1]!
        open[open.length - 1]! |= fresh
        if (fresh & GROUP_ITALIC) nItalic++
        if (fresh & GROUP_BOLD) nBold++
        if (fresh & GROUP_CAPS) nCaps++
      }
    } else if (p.t === 'text') {
      const n = nonSpace(p.s)
      total += n
      if (nItalic || after & GROUP_ITALIC) inItalic += n
      if (nBold || after & GROUP_BOLD) inBold += n
      if (nCaps || after & GROUP_CAPS) inCaps += n
    }
  }
  const out = { ...base }
  if (total && base.italic && inItalic >= 0.5 * total) out.italic = false
  if (total && base.bold && inBold >= 0.5 * total) out.bold = false
  if (total && base.caps && inCaps >= 0.5 * total) out.caps = false
  return out
}

/** a length TeX reads as a dimension, in PDF units */
const DIMEN = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))\s*(pt|bp|mm|cm|in|pc|dd|cc|sp|em)$/
const BP: Record<string, number> = {
  pt: 72 / 72.27,
  bp: 1,
  mm: 72 / 25.4,
  cm: 72 / 2.54,
  in: 72,
  pc: (12 * 72) / 72.27,
  dd: ((1238 / 1157) * 72) / 72.27,
  cc: (((12 * 1238) / 1157) * 72) / 72.27,
  sp: 72 / 72.27 / 65536,
}
/** TeX's explicit glue in em, as latex.ltx defines it: \enspace \kern.5em; \thinspace and \, a thin space, \: a medium and
 *  \; a thick one (\tmspace's \thinmuskip, \medmuskip and \thickmuskip, 3, 4 and 5 mu of 18 an em: .16667em, .2222em,
 *  .2777em in text); \quad \hskip1em and \qquad \hskip2em. A kern no line breaks at, a skip one may */
const KERNS: Record<string, number> = {
  '\\enspace': 0.5,
  '\\thinspace': 1 / 6,
  '\\,': 1 / 6,
  '\\:': 2 / 9,
  '\\;': 5 / 18,
}
const SKIPS: Record<string, number> = { '\\quad': 1, '\\qquad': 2 }
/** TeX's infinite glue by its order (tex.web §150: fil 1, fill 2): latex.ltx's \hfil, \hskip 0pt plus 1fil, and \hfill,
 *  \hskip 0pt plus 1fill. No natural width; the line's free room is set at it (B.place placeItems) */
const FILLS: Record<string, 1 | 2> = { '\\hfil': 1, '\\hfill': 2 }
/** a placeholder's source that is explicit glue, as TeX sets it: { em } or { bp }, or infinite glue's order (`fill`), and
 *  whether a line may break at it */
export function glueOf(src: string): { em?: number; bp?: number; fill?: 1 | 2; brk: boolean } | null {
  if (Object.hasOwn(FILLS, src)) return { fill: FILLS[src]!, brk: true }
  if (Object.hasOwn(KERNS, src)) return { em: KERNS[src]!, brk: false }
  if (Object.hasOwn(SKIPS, src)) return { em: SKIPS[src]!, brk: true }
  const m = /^\\(hspace\*?|hskip|kern)\s*(?:\{\s*([^{}]*?)\s*\}|([^{}\\]*?))\s*$/.exec(src)
  if (!m) return null
  const len = (m[2] ?? m[3] ?? '').replace(/\s+(?:plus|minus)\s.*$/, '').trim()
  const d = DIMEN.exec(len)
  if (!d || !(Number(d[1]) > 0)) return null
  const brk = m[1] !== 'kern'
  return d[2] === 'em' ? { em: Number(d[1]), brk } : { bp: Number(d[1]) * BP[d[2]!]!, brk }
}

const SPACELESS_QUOTES = /[“”‘’—…·]/u
/** a token whose edge is a character a spaceless script sets no space beside */
const spacelessEdge = (t: Token | null, end: boolean) => {
  if (t?.cls !== 'cjk' || typeof t.s !== 'string' || !t.s) return false
  const cps = [...t.s],
    ch = end ? cps.at(-1)! : cps[0]!
  return SPACELESS.test(ch) || SPACELESS_QUOTES.test(ch)
}
/**
 * A token whose edge is a full-width mark's outer side: its last character a closing mark (the white after it), or its first an
 * opening mark (the white before it), by what the mark does in the text (script.ts punctOf), wherever its face draws its ink (a
 * mark set in the middle of its em has white on both sides). Full-width by Unicode: a mark of the CJK blocks (script.ts CJK: the
 * full-width and wide forms, East Asian Width F or W) wherever it stands; a curly quote (East Asian Width A, ambiguous) only where the target
 * sets it in its CJK face (`cjkFace`), an em wide; an alphabet's target sets it in its Latin face, proportional. A space there is
 * no space of the text's: the mark carries the white, and a translator's space beside it doubled it (2611.03953v2-zh's
 * references, each name followed by U+FF0C and a space: about 1 em of white a name where the original's comma and space held
 * 0.3 em). xeCJK sets none after a closing mark whatever follows it (\xeCJK_FullRight_and_Boundary: ignores the spaces after it)
 */
const markBlankEdge = (t: Token | null, end: boolean, cjkFace: (t: Token) => boolean) => {
  if (t?.cls !== 'cjk' || typeof t.s !== 'string' || !t.s) return false
  const cps = [...t.s],
    ch = end ? cps.at(-1)! : cps[0]!
  return fullWidthPunctOf(ch, cjkFace(t)) === (end ? 'close' : 'open')
}

/**
 * A token that opens with a full-width mark no line opens with (the breaker's `barred`: UAX 14's no-start classes or the target's
 * rules' P.noStart; full-width by markBlankEdge's definition: a mark of the class table, of the CJK blocks wherever it stands or a
 * curly quote in the target's CJK face): an ordinary space before it is not set, whatever stands before it, as none is after a
 * closing mark (markBlankEdge) or between two characters of a spaceless script (a CJK character, a space, a full stop). The
 * mark carries its own blank half; the space before it is an engine's (Google sets one after an element before the text's own
 * full stop or comma in every such place a probe asked it), never a CJK writer's. xeCJK and ctex keep this one case, a typed space between a
 * Latin letter or a formula and a full-width closing mark (xeCJK.sty 3.10.4 :3886 `\xeCJK_Boundary_and_FullRight:N`; measured
 * with ctexart 2.6.4: a CJK word, Q, a space and the ideographic full stop 46.84 pt against 43.33 without the space), where it is an author's keystroke; here it is not set
 * (docs/PDF-READER.md §18.18). A half-width mark keeps the space before it in every target
 */
const markBarredStart = (t: Token | null, cjkFace: (t: Token) => boolean, barred: (ch: string) => boolean) => {
  if (t?.cls !== 'cjk' || typeof t.s !== 'string' || !t.s) return false
  const ch = [...t.s][0]!
  return fullWidthPunctOf(ch, cjkFace(t)) !== null && barred(ch)
}

/** a target's capitals: its language's case mapping, the root's where it names none a locale reads */
export function upperOf(to: string): (s: string) => string {
  let loc = 'und'
  if (typeof to === 'string' && to)
    try {
      'a'.toLocaleUpperCase(to)
      loc = to
    } catch {}
  return (s) => s.toLocaleUpperCase(loc)
}
const MARKS = /^\p{M}$/u,
  CAPITAL = /^\p{Lu}$/u
/** `s` in runs of one case as the layer draws its small capitals */
export function caseRuns(
  s: string,
  ratio: number,
  upper: (s: string) => string,
  smallAt: ((at: number) => boolean) | null = null,
): { s: string; k: number; at: number; n: number }[] {
  const out: { src: string; k: number; at: number; n: number }[] = []
  let at = 0
  for (const ch of s) {
    const last = out.at(-1)
    const k = last && MARKS.test(ch) ? last.k : upper(ch) !== ch || (smallAt?.(at) && CAPITAL.test(ch)) ? ratio : 1
    if (last?.k === k) {
      last.src += ch
      last.n += ch.length
    } else out.push({ src: ch, k, at, n: ch.length })
    at += ch.length
  }
  return out.map(({ src, k, at: a, n }) => ({ s: k === 1 ? src : upper(src), k, at: a, n }))
}
/** a rendering's runs with the names a package generated in it in the target's */
function renameRuns<R extends { text: string }>(
  runs: readonly R[],
  rename: readonly [number, number, string][],
): R[] | null {
  const out = runs.map((r) => ({ ...r }))
  let from = 0
  const starts = out.map((r) => {
    const s = from
    from += r.text.length
    return s
  })
  for (const [a, b, w] of [...rename].sort((x, y) => y[0] - x[0])) {
    const i = starts.findIndex((s, j) => a >= s && b <= s + out[j]!.text.length)
    if (i < 0) return null
    const s = starts[i]!
    out[i]!.text = out[i]!.text.slice(0, a - s) + w + out[i]!.text.slice(b - s)
  }
  return out
}
/** a crop resolution as its readers take it, one a part */
function cropPartsOf(r: TRes): Record<string, unknown>[] {
  if (!r.parts) return [r]
  return r.parts.map((q, i) => ({
    ...r,
    page: q.page,
    crop: q.crop,
    baseline: q.baseline,
    text: i ? '' : r.text,
    gap: { ...r.gap, box: q.seg },
    part: i,
    parts: undefined,
  }))
}

/** B.tokens: the unit's row as tokens, unmeasured, each in its face */
export function tokens(i: TokensInput): Tokens {
  const { unit, resolved, to, designs, P, lead } = i
  const faceOf = (st: TStyle, cls: 'cjk' | 'latin') => i.faces.of(st, cls)
  const selfCaps = (face: Face | undefined) => !!face?.caps && !(face.id && i.faces.ownSmallCaps(face.id))
  const plainOf = (face: Face) => (selfCaps(face) ? { ...face, caps: false } : face)
  const tokens: Token[] = []
  const plain = i.tagWords ? plainTracker() : null
  const measured = resolved.measured ?? null
  const { fill: _fill, ...given } = i.base
  const base: TStyle = measured?.st ? { ...given, ...measured.st } : baseOf(unit, given)
  if (Number.isInteger(measured?.fill) && measured!.fill! > 0) base.color = hexOf(measured!.fill!)
  const stack: TStyle[] = [{ ...base }]
  const style = () => stack.at(-1)!
  const colourRun = (k: number, p: V0Piece): { color?: string | undefined; colourRun?: true } => {
    const rgb = i.colourOf(k)
    if (Number.isInteger(rgb)) return { color: hexOf(rgb!), colourRun: true }
    const own = Number.isInteger(p.k) ? measured?.pieces?.get(p.k!) : undefined
    if (Number.isInteger(own)) return { color: own! > 0 ? hexOf(own!) : undefined, colourRun: true }
    return {}
  }
  const { keepAll, cjkQuotes, latinPatterns: latinLang, cyrillicPatterns: cyrLang } = P
  const minWord = P.hyphenation.minWord
  const cjkLead = cjkLeadRe(cjkQuotes)
  const kinsoku = kinsokuOf(P.noStart, P.noEnd)
  /** a character no line opens with: UAX 14's (script.ts noStart) or the target's rules' (P.noStart): break.ts `barred`'s */
  const barredChar = (ch: string) => noStart(ch) || kinsoku.starts(ch)
  const lastIsSpace = () => tokens.length > 0 && !!tokens.at(-1)!.space
  /** the space tokens a chunk of white space made that holds more than ordinary collapsible white space (space, tab, line
   *  ends): a no-break space U+00A0, a narrow one U+202F, the ideographic space U+3000; a text's own, which no rule of the
   *  marks takes (the rule before a full-width mark no line opens with, below) */
  const hardSpaces = new WeakSet<Token>()
  let noBreakNext = false,
    afterHead = false,
    afterRunin = false
  /** a title set in the line (SpanAt.runin) whose group is open where it opens a sentence of the row */
  let runinId: unknown = null
  /** the paper's own horizontal space laid after such a title, in kernW's units (100 an em of the line's size) */
  let runinOwn = 0
  /** infinite glue before the unit's first token (fillOn), set on that token once the list is made */
  let fillLead: Fill | undefined
  const push = (t: Token) => {
    const prev = tokens.at(-1)
    if (noBreakNext && !t.space) t.glue = true
    noBreakNext = false
    afterHead = false
    if (prev && !prev.space && !t.space) {
      if (kinsoku.starts(t.s ?? '') || (prev.s && kinsoku.ends(prev.s))) t.glue = true
      else if (keptPair(prev.s, t.s)) t.glue = true
      if (!t.brk && t.cls === 'latin' && prev.cls === 'latin' && !prev.crop && !prev.kernW) t.glue = true
      const cjkSide = t.cls === 'cjk' ? t.s : (prev.s ?? '')
      if (
        P.autospace &&
        !prev.kernW &&
        t.cls &&
        prev.cls &&
        t.cls !== prev.cls &&
        /[A-Za-z0-9]/.test((t.cls === 'latin' ? t.s![0] : ((prev.s ?? '').at(-1) ?? '')) as string) &&
        !/^[\u3001\u3002\uFF0C\uFF0E\uFF1A\uFF1B\uFF01\uFF1F\uFF08\uFF09\u300C\u300D\u300E\u300F\u3010\u3011\u3014\u3015\u3008\u3009\u300A\u300B“”‘’]$/.test(
          cjkSide as string,
        )
      )
        t.asp = true
    }
    tokens.push(t)
  }
  const capsK = resolved.capsRatio ?? 0.8,
    upper = upperOf(to)
  type Track = {
    at: Int32Array
    sh: string
    base: number
    map: { from: number[]; span: number[] }
    sm: Int32Array | null
  }
  const pushText = (
    s: string,
    st: TStyle,
    extra: { label?: true; ph?: string; k?: number; math?: true } = {},
    track: Track | null = null,
    smallAt: ((at: number) => boolean) | null = null,
    ratio = capsK,
  ) => {
    for (const m of s.matchAll(/\s+|\S+/g)) {
      const chunk = m[0]
      if (/^\s+$/.test(chunk)) {
        if (tokens.length && !lastIsSpace() && !tokens.at(-1)!.leadEnd && !tokens.at(-1)!.kernEnd) {
          const face = plainOf(faceOf(st, 'latin'))
          tokens.push({ space: true, st, face, w100: 0, ...(afterHead ? { keep: true as const } : {}) })
          if (/[^ \t\n\f\r]/.test(chunk)) hardSpaces.add(tokens.at(-1)!)
        }
        afterHead = false
        continue
      }
      const parts: { cls: 'cjk' | 'latin'; s: string; off: number }[] = []
      let cur: { cls: 'cjk' | 'latin'; s: string; off: number } | null = null,
        off = 0
      // (the chunk walked by its grapheme clusters, what a reader sees as one character (UAX #29: script.ts clustersOf, its code
      // points where none joins another), each classed by its first code point: a run that breaks between its characters is cut
      // between clusters, never inside one: a decomposed Hangul syllable, a kana and its voiced mark, a character and its
      // variation selector stay one token, measured whole. Each part's offset its first unit's, as before)
      for (const ch of clustersOf(chunk)) {
        const cls = cjkLead.test(ch) ? 'cjk' : 'latin'
        if (cls === 'cjk' && !keepAll) {
          cur = null
          parts.push({ cls, s: ch, off })
          off += ch.length
          continue
        }
        if (cur && cur.cls === cls) cur.s += ch
        else {
          cur = { cls, s: ch, off }
          parts.push(cur)
        }
        off += ch.length
      }
      parts.forEach((p, n) => {
        const pieces =
          p.cls !== 'latin'
            ? [p.s]
            : st.fam === 'mono' || /^(?:https?:|www\.)/.test(p.s)
              ? p.s.split(/(?<=[/.\-_#?&=])(?=[^/.\-_#?&=])/)
              : !extra.ph
                ? p.s.split(/(?<=[A-Za-zÀ-ɏЀ-ӿ][-/])(?=[A-Za-zÀ-ɏЀ-ӿ])/)
                : [p.s]
        let po = 0
        pieces.forEach((s, q) => {
          const face0 = faceOf(st, p.cls)
          const from = m.index + p.off + po
          const all = p.cls === 'latin' && !!st.upper
          const runs =
            !all && p.cls === 'latin' && selfCaps(face0)
              ? caseRuns(s, ratio, upper, smallAt && ((x) => smallAt(from + x)))
              : null
          const face = runs || all ? plainOf(face0) : face0
          for (let r = 0, count = runs ? runs.length : 1; r < count; r++) {
            const run = runs?.[r],
              rs = run ? run.s : all ? upper(s) : s,
              k = run ? run.k : 1,
              at = run ? run.at : 0,
              len = run ? run.n : s.length
            const t: Token = {
              s: rs,
              st,
              face,
              cls: p.cls,
              w100: 0,
              ...extra,
              ...(q > 0 && at === 0 ? { brk: true } : {}),
            }
            if (k !== 1) t.sc = k
            if (track && len) {
              const x = from + at,
                last = x + len - 1
              const sm = track.sm,
                a = track.base + track.map.from[x]!,
                z = track.base + track.map.from[last]! + track.map.span[last]! - 1
              if (!sm || /\S/.test(track.sh.slice(sm[a], sm[z]! + 1))) {
                t.at = track.at[sm ? sm[a]! : a]!
                t.end = track.at[sm ? sm[z]! : z]! + 1
              }
            }
            if (at > 0) {
              t.glue = true
              t.cont = true
            } else if (q === 0 && n > 0 && !(!keepAll && (p.cls === 'cjk' || parts[n - 1]!.cls === 'cjk')))
              t.glue = true
            // (a mark's blank half as its face draws it, measured in the face's own file (script.ts markOf): none where its ink
            // crosses its em's middle, nor where an alphabet's target sets a curly quote in its Latin face, which holds no measure)
            if (p.cls === 'cjk' && s.length === 1) t.punct = markOf(s, face.ids)
            if (
              !runs &&
              !all &&
              p.cls === 'latin' &&
              P.hyphen &&
              !extra.ph &&
              st.fam !== 'mono' &&
              s.length >= minWord &&
              unit.kind !== 'heading' &&
              !unit.title
            ) {
              const word = s.replace(/[^A-Za-zÀ-ɏЀ-ӿ]+$/, '').replace(/^[^A-Za-zÀ-ɏЀ-ӿ]+/, '')
              const cyr = /[Ѐ-ӿ]/.test(word)
              if (word.length >= minWord && (cyr ? /^[Ѐ-ӿ]+$/.test(word) : /^[A-Za-zÀ-ɏ][a-zà-ɏß]+$/.test(word)))
                t.hyph = cyr ? cyrLang : latinLang
            }
            push(t)
          }
          po += s.length
        })
      })
    }
  }
  if (lead?.parts?.length) {
    for (const part of lead.parts) {
      pushText(part.text, { ...base, ...part.st }, { label: true })
      // (the glue TeX set after a part another follows on the line: the name's before its joint)
      const t = tokens.at(-1)
      if (t && part.gap !== undefined && part.gap > 0) {
        t.leadGap = 100 * part.gap
        t.kern = true
        if (plain) t.kernEm = part.gap
      }
    }
    const st = { ...base, ...lead.parts.at(-1)!.st }
    if (lead.gap === undefined) pushText(' ', st)
    else if (tokens.length) {
      const t = tokens[tokens.length - 1]!
      t.leadEnd = true
      if (lead.gap > 0) {
        t.leadGap = 100 * lead.gap
        t.kern = true
        if (plain) t.kernEm = lead.gap
      }
    }
  }
  // (U.marks, T16: a mark no line starts with that the translation sets after a display, or after a held line's own mark)
  let after: MarksAfter | null = null
  const marks: MarksTrace = { drops: [], tail: null }
  let headId: unknown = null
  for (const [k, p] of unit.pieces.entries()) {
    if (p.t === 'text') {
      if (/\S/.test(p.s)) break
      continue
    }
    if (p.t === 'ph' && (glueOf(p.src) || ['zero', 'space'].includes(i.cls2[k] ?? ''))) continue
    if (p.t === 'open' && openStyle(p, base, designs)) headId = p.id
    break
  }
  const kernOn = (g: { em?: number; bp?: number; brk: boolean }) => {
    const size = resolved.orig?.size
    const em = g.em ?? (g.bp !== undefined && size! > 0 ? g.bp / size! : 0)
    if (!(em > 0)) return
    while (tokens.at(-1)?.space) tokens.pop()
    const t = tokens.at(-1)
    if (!t || t.newline !== undefined || t.blockTo !== undefined) return
    t.kernW = (t.kernW ?? 0) + 100 * em
    t.kernEnd = true
    if (!g.brk) noBreakNext = true
    if (afterRunin) runinOwn += 100 * em
  }
  // (TeX's infinite glue, glueOf's `fill`: on the token before it (Token.fill), or, while the list holds none, gathered for the
  // unit's first token (Token.fillLead, set once the list is made); none after a forced break or a block, as TeX discards glue
  // at a line's start)
  const fillOn = (o: 1 | 2) => {
    while (tokens.at(-1)?.space) tokens.pop()
    const t = tokens.at(-1)
    if (!t) fillLead = fillWith(fillLead, o)
    else if (t.newline === undefined && t.blockTo === undefined) t.fill = fillWith(t.fill, o)
  }
  // (a script that writes no spaces between its words: Chinese and Japanese, never Korean, which breaks between its characters
  // and writes them (`spaced`), nor the alphabets (keepAll), nor a source that writes its CJK with spaces between (spacedSource))
  const spaceless = !keepAll && !P.spaced && !i.spacedSource
  // (a title its source sets in the line at a paragraph's opening with no mark after it, the part's SpanAt.runin (the display
  // design's F40, docs/PDF-READER.md §18.85): in a script that writes no spaces between its words, the separation between two
  // sentences after it, one character's width (an em of the line's size: a CJK character's advance), a kern on what the title
  // ends with, as the paper's own `\quad` is set (kernOn): no stretch of a justified line's, dropped where a line ends after it.
  // Set before the first thing drawn after the title past the elements between (a tie, a citation, a note's mark): its text, or
  // an element the row begins its sentence with (a formula); the white space the row set there is its place, taken off. None
  // where the title's drawn text ends with a closing mark or the text after it begins with one (a colon, a full stop, a dash:
  // the reply's own separation), nor where a break stands. A script that writes spaces has the reply's own, nothing added.
  // The paper's own horizontal space laid there (its El.glue, kernOn: `\hspace{0.2em}`, `\quad`) counts toward the em: the gap
  // is what it leaves missing up to one em, never negative (after `\quad` nothing).
  // Only where the title still opens a sentence in the row: nothing drawn before it, a break, or a sentence's end (a full stop,
  // past closing brackets and quotes: the paragraph before a group TeX opened one at); a translation that took the title into
  // its sentence (2111.09276v1's "\textbf{wikiHow} We treat wikiHow as …", one sentence in Chinese, the group its object) is laid
  // as before)
  /** the last token drawn (no space), its index */
  const lastDrawn = (): number => {
    let q = tokens.length - 1
    while (q >= 0 && tokens[q]!.space) q--
    return q
  }
  /** whether the last token drawn ends with a mark of `re`, past closing brackets and quotes */
  const endsWith = (re: RegExp): boolean => {
    const s = tokens[lastDrawn()]?.s
    return typeof s === 'string' && re.test(s.replace(CLOSERS_END, ''))
  }
  const opensSentence = (): boolean => {
    const t = tokens[lastDrawn()]
    return !t || t.newline !== undefined || t.blockTo !== undefined || endsWith(SENTENCE_END)
  }
  /** the separation before `s` (the text drawn next, '' for an element): `s` past its white space where it is set */
  const runinGap = (s: string): string => {
    const lead = s.replace(/^\s+/, '')
    const missing = 100 - runinOwn
    const q = lastDrawn()
    const t = tokens[q]
    if (missing <= 0 || !t || t.newline !== undefined || t.blockTo !== undefined || CLOSING_START.test(lead)) return s
    tokens.length = q + 1
    t.kernW = (t.kernW ?? 0) + missing
    t.kernEnd = true
    return lead
  }
  // (two elements the source sets side by side, nothing between them there (consecutive pieces of its unit: `k`, the source's
  // index) and in the row (no token between): one word, as TeX set it, whatever their kinds. The later one's first token is glued
  // and set tight (no slack of a justified line between them); two crops TeX set on one line keep TeX's distance between their
  // starts, the earlier one's advance its box less the margins its crop adds (unit/crops.ts cropOfBox) and what its ink
  // overhangs, a kern after it that a line's end drops (2111.09276v1 p1's `\hlyellow{high}\hlblue{lighted}`, inks 0.25 pt
  // over each other: 0.97 pt of white between the two drawn). The tie's rule (r.tie, below) holds a token to the one before it
  // across a space TeX set; this one where TeX set nothing)
  let prev: { p: V0Piece; from: number; beside: Token | null } | null = null
  const sideBySide = () => {
    if (!prev?.beside || tokens.length <= prev.from) return
    const a = prev.beside,
      b = tokens[prev.from]!
    // (what both set is drawn: a crop or a text, never a control token, a forced break's newline or a kept region's blockTo)
    if (b.space || (b.crop === undefined && typeof b.s !== 'string')) return
    b.glue = true
    b.tight = true
    const qa = a.crop as { page?: number; crop?: number[]; baseline?: number } | undefined
    const qb = b.crop as { page?: number; crop?: number[]; baseline?: number } | undefined
    const size = resolved.orig?.size
    if (qa?.crop && qb?.crop && qa.page === qb.page && qa.baseline === qb.baseline && size! > 0)
      a.kernW = (100 * (qb.crop[0]! - qa.crop[0]! - a.cw!)) / size!
  }
  unit.pieces.forEach((p, k) => {
    sideBySide()
    const last = tokens.at(-1)
    const beside =
      p.t === 'ph' &&
      prev?.p.t === 'ph' &&
      prev.p.k !== undefined &&
      p.k === prev.p.k + 1 &&
      tokens.length > prev.from &&
      (last?.crop !== undefined || typeof last?.s === 'string') &&
      !last.space
        ? last
        : null
    prev = { p, from: tokens.length, beside }
    if (p.t === 'text') {
      const raw = drawnText(p as TextPiece)
      let s = raw
      const sh = plain ? shown(p as TextPiece) : null,
        at = plain?.text(sh!)
      if (after && /\S/.test(s)) {
        s = dropMarks(s, after, marks)
        after = null
      }
      if (afterRunin && /\S/.test(s)) {
        afterRunin = false
        s = runinGap(s)
      }
      const text = s
        .replace(/\n/g, ' ')
        .replace(/---/g, '—')
        .replace(/--/g, '–')
        .replace(/``/g, '“')
        .replace(/''/g, '”')
      const sm = at
        ? sh === raw
          ? true
          : (p as TextPiece).tr && sh!.length === raw.length
            ? Int32Array.from({ length: raw.length }, (_, x) => x)
            : null
        : null
      const map = sm ? transformMap(s, text) : null
      pushText(
        text,
        style(),
        {},
        map && { at: at!, sh: sh!, base: raw.length - s.length, map, sm: sm === true ? null : sm },
      )
      return
    }
    plain?.gap()
    // (a piece TeX opened a paragraph at, U.breaks' openBreaks: a group's open (paragraphBreaks), or an element (El.opens, drawn
    // after it): the text before it ends its block, the piece starts the paragraph's)
    const opened = resolved.openBreaks?.get(k)
    if (opened !== undefined && resolved.referenced?.has(opened)) {
      while (tokens.at(-1)?.space) tokens.pop()
      if (tokens.at(-1)?.blockTo !== opened) tokens.push({ blockTo: opened, w100: 0, brk: true })
    }
    if (p.t === 'open') {
      if (p.runin && spaceless && opensSentence()) runinId = p.id
      const next = openStyle(p, style(), designs)
      const link = LINK_OPEN.test(p.src as string) && p.id !== undefined ? { link: p.id } : {}
      stack.push({ ...(next ?? style()), ...colourRun(k, p), ...link })
      return
    }
    if (p.t === 'close') {
      if (stack.length > 1) stack.pop()
      if (headId !== null && p.id === headId) afterHead = true
      if (runinId !== null && p.id === runinId) {
        afterRunin = !endsWith(CLOSING_END)
        runinOwn = 0
        runinId = null
      }
      return
    }
    if (p.t === 'ph') {
      const glue = glueOf(p.src)
      if (glue) {
        if (glue.fill) fillOn(glue.fill)
        else kernOn(glue)
        return
      }
      const sw = applyCmd(p.src, style(), designs)
      if (sw && /^\\[A-Za-z]+$/.test(p.src)) {
        stack[stack.length - 1] = sw
        return
      }
      const run = colourRun(k, p)
      if (run.colourRun) stack[stack.length - 1] = { ...style(), ...run }
    }
    const r = resolved.get(k)
    if (!r) return
    // (the infinite glue standing before a forced break: TeX's `\break`, \penalty-\@M, discards nothing before it (TeX
    // discards the glue a line breaks at, and what follows a break), so it stays on the line it ends (Token.fillStays); LaTeX's
    // `\\` and `\newline` take it away first (latex.ltx's \@gnewline and \@centercr: \unskip, then `\hfil\break` or \par), and
    // a cell's row end (its template's \unskip): the placement discards it there, as a glue on a line's last item)
    const stays = () => {
      const t = tokens.at(-1)
      if (p.t === 'ph' && p.src === '\\break' && t?.fill) t.fillStays = true
    }
    if (r.brk && r.room !== undefined) {
      while (tokens.at(-1)?.space) tokens.pop()
      stays()
      if (tokens.at(-1)?.newline !== r.brkAt) tokens.push({ newline: r.brkAt!, room: r.room, w100: 0 })
      return
    }
    if (r.brk && r.region !== undefined && resolved.referenced?.has(r.region)) {
      while (tokens.at(-1)?.space) tokens.pop()
      stays()
      if (tokens.at(-1)?.blockTo !== r.region) tokens.push({ blockTo: r.region, w100: 0, brk: true })
      return
    }
    if (r.mode === 'kept' && r.region !== undefined && resolved.referenced?.has(r.region)) {
      while (tokens.at(-1)?.space) tokens.pop()
      tokens.push({ blockTo: r.region, w100: 0 })
      if (r.cls === 'display') after = r
      else if (noStart(r.heldAfter))
        after = { origAfter: null, held: r.heldMarks?.length ? r.heldMarks : [r.heldAfter!] }
      return
    }
    if (r.cls === 'display' && r.inPlace && !tokens.some((t) => !t.space)) {
      after = r
      return
    }
    if (r.mode !== 'none' && r.text !== ' ' && !(r.mode === 'kept' && r.cls === 'display')) after = null
    // (an element drawn first after a title set in the line, no tie, citation or note's mark: the sentence begins with it)
    if (afterRunin && (r.mode === 'crop' || !!r.text) && r.text !== ' ' && !r.mark && p.t !== 'nested') {
      if (!BETWEEN.has(i.cls2[k] ?? '')) {
        afterRunin = false
        runinGap('')
      }
    }
    if (r.mode === 'crop') {
      const pv = tokens.at(-1)
      // (after a CJK character a line may end before the crop where the script writes no spaces between its words, as xeCJK's
      // \CJKecglue allows; Korean, which writes them, holds a crop set against a syllable to it: xetexko sets no glue there,
      // docs/PDF-READER.md §18.91)
      const ecglue =
        !keepAll && !P.spaced && pv?.cls === 'cjk' && !pv.leadEnd && !pv.kernW && !(pv.s && kinsoku.ends(pv.s))
      for (const [n, q] of cropPartsOf(r).entries()) {
        if (n) pushText(' ', style())
        // (a mark's crop glued to what precedes it, as its text was a superscript's: TeX sets no glue between a word and its
        // mark, so no line begins with it; after a CJK character, free to break as between two, a footnote's mark after a
        // sentence's full stop began a line of its own, 1810.04805v2 p7's 12)
        // (and after a tie that set no space token of its own, held to what precedes it: noBreakNext, as push reads it)
        const glue =
          (n === 0 && noBreakNext && tokens.length > 0) ||
          (tokens.length > 0 && !lastIsSpace() && (!!r.mark || !(n === 0 && ecglue)))
        if (n === 0) noBreakNext = false
        const c = q.crop as number[]
        tokens.push({ crop: q, cw: c[2]! - c[0]!, glue, w100: 0 })
      }
      return
    }
    if (!r.text) return
    if (r.text === ' ') {
      pushText(' ', style())
      // (a tie: TeX's `~`, \penalty10000 and its interword glue, a space no line breaks at; the space stays a space, drawn and
      // stretched as TeX draws it, and holds what follows it to what precedes it, a footnote's mark to its word. Where no space
      // token stands for it (one before it already, or none set after a head's or a kern's end), what follows is glued)
      if (r.tie) {
        const t = tokens.at(-1)
        if (t?.space) t.tie = true
        else noBreakNext = true
      }
      return
    }
    // (a rendering of the page's own text in the font state TeX set its glyphs in, where the part states it (El.style, read.ts):
    // its typewriter face, its weight, its slant and its small capitals over the run's. It is text no translation replaces, and
    // the original's style is its own: 2608.06701v1 p5's "Periodic Advisor", italic by the paper's macro, was drawn upright in
    // the run's style, and "LIVEPLAN", in faked small capitals, in full capitals; a group around it that TeX applied is in its
    // glyphs (\emph's italic), and a rendering of no stated style, or an attribute its style does not state, takes the run's)
    const own: TStyle = r.math
      ? { ...style(), italic: /[A-Za-z]/.test(r.text) && r.text.length <= 3, caps: false }
      : r.mode === 'orig-text' && r.st && r.st.fam !== 'math'
        ? {
            ...style(),
            fam: r.st.fam === 'mono' ? 'mono' : style().fam,
            design: r.st.fam === 'mono' ? designs.mono : style().design,
            bold: r.st.bold ?? style().bold,
            italic: r.st.italic ?? style().italic,
            caps: r.st.caps ?? style().caps,
          }
        : style()
    if (r.math && own.upper) own.upper = false
    // (the share its faked small capitals are set at: its own (El.style.sc, its text in TeX's case, each small one a lowercase
    // letter caseRuns draws so), else the unit's)
    const ratio = r.mode === 'orig-text' && typeof r.st?.sc === 'number' ? r.st.sc : capsK
    const fill = i.fillOf(k)
    const st = !own.colourRun && Number.isInteger(fill) && fill! >= 0 ? { ...own, color: hexOf(fill!) } : own
    const fills = r.mode === 'orig-text' && !r.math && !own.colourRun ? (i.fills.get(k) ?? null) : null
    let runs: { text: string; st: TStyle }[] | null = fills ? [] : null
    for (const run of fills ?? []) {
      const rs = run.fill === UNKNOWN ? st : { ...own, color: run.fill > 0 ? hexOf(run.fill) : undefined }
      const last = runs!.at(-1)
      if (last && (last.st.color ?? null) === (rs.color ?? null)) last.text += run.text
      else runs!.push({ text: run.text, st: rs })
    }
    const renamed =
      r.mode === 'orig-text' && !r.math && !r.sup && r.rename?.length
        ? renameRuns(runs ?? [{ text: r.text, st }], r.rename)
        : null
    if (renamed) runs = renamed
    const flags =
      !renamed && r.mode === 'orig-text' && !r.math && own.caps && !own.upper ? (i.smallCaps.get(k) ?? null) : null
    const capsAt = flags ? (x: number) => !!flags[x] : null
    if (r.sup) {
      for (const run of runs ?? [{ text: r.text, st }]) {
        const face = plainOf(faceOf(run.st, 'latin'))
        tokens.push({ s: run.text, st: run.st, face, cls: 'latin', w100: 0, sup: true, glue: true, ph: r.mode, k })
      }
    } else if (runs) {
      let at = 0
      for (const run of runs) {
        const from = at
        pushText(run.text, run.st, { ph: r.mode, k }, null, capsAt && ((x) => capsAt(from + x)), ratio)
        at += run.text.length
      }
    } else pushText(r.text, st, { ph: r.mode, k, ...(r.math ? { math: true as const } : {}) }, null, capsAt, ratio)
  })
  sideBySide()
  // (U.marks, T17: the class's own marks after the unit's text, in place of the translation's of their kinds at its end)
  if (resolved.tail?.length) {
    marks.tail = [resolved.tail.length, mergeTail(tokens, resolved.tail, resolved.tailOwn ?? null)]
    for (const c of resolved.tail) {
      const cs =
        c.st && c.st.fam !== 'math'
          ? {
              fam: c.st.fam,
              bold: !!c.st.bold,
              italic: !!c.st.italic,
              caps: !!c.st.caps,
              ...(c.st.design ? { design: c.st.design } : {}),
            }
          : {}
      pushText(c.ch, { ...base, ...cs })
    }
  }
  while (tokens.at(-1)?.space) tokens.pop()
  // (the infinite glue before the unit's first item is that item's, whatever its kind and whichever way it entered the list: a
  // text, a formula's crop, a script; the first token that takes room, past a forced break's newline or a block's mark, which
  // take none (B.place reads it on the unit's first line's first item). Given only to a token of text, a cell
  // `\hfill $x$ text` set it on the text after the formula, which no line's first item is: the formula stood at the cell's
  // start)
  const first = fillLead
    ? tokens.find((t) => !t.space && t.newline === undefined && t.blockTo === undefined)
    : undefined
  if (first) first.fillLead = fillLead
  // (a space is not set between two characters of a spaceless script, nor beside a full-width mark's blank side whatever
  // stands on its other side (markBlankEdge), nor before a full-width mark no line opens with whatever stands before it
  // (markBarredStart; an ordinary space alone): a space after its head (`keep`) and one in a monospaced run are the text's)
  const drawnAt = (q: number, step: number) => {
    for (; q >= 0 && q < tokens.length; q += step) if (!tokens[q]!.space) return tokens[q]!
    return null
  }
  // (a token set in the target's CJK face: not the face its style sets Latin text in)
  const cjkFace = (t: Token) => !!t.face && !!t.st && t.face.id !== faceOf(t.st, 'latin').id
  const kept = tokens.filter((t, q) => {
    if (!t.space || t.keep || t.st?.fam === 'mono') return true
    const before = drawnAt(q - 1, -1),
      after = drawnAt(q + 1, 1)
    if (markBlankEdge(before, true, cjkFace) || markBlankEdge(after, false, cjkFace)) return false
    if (!hardSpaces.has(t) && markBarredStart(after, cjkFace, barredChar)) return false
    return !(spaceless && spacelessEdge(before, true) && spacelessEdge(after, false))
  })
  if (kept.length < tokens.length) {
    // (a tie's space not set keeps its no-break: what follows it is glued to what precedes it)
    const set = new Set(kept)
    tokens.forEach((t, q) => {
      const after = t.tie && !set.has(t) ? drawnAt(q + 1, 1) : null
      if (after) after.glue = true
    })
    tokens.length = 0
    for (const t of kept) tokens.push(t)
  }
  return { tokens, base, marks }
}
