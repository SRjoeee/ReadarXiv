// B.tokens (design-b §1.5): a unit's row as the breaker's tokens, unmeasured, each in the face it is set in (T39, E21):
// the style stack over the row's groups and switches, script chunks, glue, the line-break marks, UAX 14's kept pairs,
// CJK–Latin autospace, punctuation's compression, hyphenation's language, the layer's own small capitals, TeX's explicit glue
// as kerns, crops, the control tokens (a forced break's newline, a kept region's blockTo), the marks dropped after a display or
// a held line's mark and the class's tail marks (U.marks' decisions, T16, T17: unit/marks.ts, called where today decides them,
// its trace in the answer), the spaces a spaceless script does not set and those beside a full-width mark's blank side, and
// each token's place in the unit's plain text (the word table's). Ported from engine 065c1d973 layer2.mjs: tokensOf2
// L2:2524-2890, baseOf L2:2253-2297, STYLE_CMDS and applyCmd L2:2106-2122, glueOf L2:2394-2416, spacelessEdge L2:2417-2430, selfCaps / plainOf / upperOf / caseRuns L2:2448-2483, renameRuns
// L2:1309-1320, cropPartsOf L2:1875-1878, LINK_OPEN L2:2245, hexOf L2:4569.
//
// What it reads, and the field each comes from once the part states it (until then the tap's recorded values):
// - `unit`: the row's pieces in the translation's order (rows.mjs unitOf), its kind and title ← Row + Placed.kind / flags
// - `resolved`: the unit's reading: the elements' resolutions (U.elements, U.breaks' marks, U.rename's names, U.marks' facts),
//   `measured` (the base style and pieces' colours its glyphs hold ← TeX's font state, Placed.style / spans), `capsRatio`
//   (Style.sc), `orig.size` (Style.size), `openBreaks` / `referenced` (U.breaks), `tail` / `tailOwn` (Placed.tail)
// - `colourOf`, `fillOf`: a group's run's fill (a colour piece's, TeX's log; any other's, a link's, its glyphs' on A where it is
//   not the fill around it) and an element's (A's glyphs) ← SpanAt.colour, El.colour, El.style.fill
// - `fills`, `smallCaps`: each rendering's runs of one fill and its faked small capitals (its page characters today, the tap's);
//   a rendering's own weight, slant and small capitals, faked in TeX's case at their share or its face's, ride on its
//   resolution (`st` ← El.style, lay/read.ts)
// - `cls2`: each piece's class ← El.kind; `spacedSource`: the source writes CJK with spaces between ← a unit fact
// - `faces`: B.faces' answers (faceOf over the role table and the paper's family) and whether a face has small capitals
// - `P`: the rule set's fields resolved for the target (Rules.breaking, Rules.fit); `designs`: the paper's (A3)
import { cjkClassRe, fullWidthPunctOf, kinsokuOf, keptPair, markOf, noStart, SPACELESS } from './script.ts'
import { drawnText, plainTracker, shown, type TextPiece, transformMap } from './text.ts'
import { dropMarks, type MarksAfter, type MarksTrace, mergeTail } from '../unit/marks.ts'
import type { V0Piece } from '../unit/breaks.ts'

/** a run's style as the tokens carry it: today's style object (family, weight, slant, small capitals, design, colour, link…) */
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
/** a face as today's faceOf gives it (fonts.mjs roleFaceOf) */
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
  newline?: number
  room?: number
  blockTo?: number
  /** its unit's end mark (El.end, lay/adapt.ts; docs/PDF-READER.md §18.52): a crop the breaker sets at the end of the unit's last
   *  line, `pad` the distance TeX set from its rectangle's right edge to its line's right edge (the slot's, PDF units), a break
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
export type Reading = {
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
/** the tokens, with the unit's base style (today's `tokens.base`) and U.marks' decisions taken while they were made */
export type Tokens = { tokens: Token[]; base: TStyle; marks: MarksTrace }

const hexOf = (rgb: number) => `#${rgb.toString(16).padStart(6, '0')}`
/** a fill not told (layout/fills.mjs UNKNOWN) */
const UNKNOWN = -1
/** a link group's open: \href's, \hyperref's and \hyperlink's (L2:2245), and \url's, which the prepare reads as a link group
 *  too (locate/ink.ts SPAN_STYLES): its tokens tagged with the group, so that its annotation is paired with its drawing (#626's
 *  review: a paragraph's \url beside its text lost its link) */
const LINK_OPEN = /^\\(?:href|hyperref|hyperlink|url)(?![A-Za-z])/

type Designs = TokensInput['designs']
/** the style commands, each with what it sets (L2:2107 STYLE_CMDS) */
const STYLE_CMDS: [RegExp, (s: TStyle, d: Designs) => TStyle][] = [
  [/^\\(?:textbf|bf|bfseries|mathbf|boldsymbol)\b/, (s) => ({ ...s, bold: true })],
  [/^\\(?:textmd|mdseries)\b/, (s) => ({ ...s, bold: false })],
  [/^\\(?:emph|em)\b/, (s) => ({ ...s, italic: !s.italic })],
  [/^\\(?:textit|it|itshape|textsl|sl|slshape|mathit)\b/, (s) => ({ ...s, italic: true })],
  [/^\\(?:textup|upshape)\b/, (s) => ({ ...s, italic: false })],
  [/^\\(?:textsc|sc|scshape)\b/, (s) => ({ ...s, caps: true })],
  [/^\\(?:texttt|tt|ttfamily|url|path|code|lstinline)\b/, (s, d) => ({ ...s, fam: 'mono', design: d.mono })],
  [/^\\(?:textsf|sf|sffamily)\b/, (s, d) => ({ ...s, fam: 'sans', design: d.sans })],
  [/^\\(?:textrm|rm|rmfamily)\b/, (s, d) => ({ ...s, fam: 'serif', design: d.serif })],
  [
    /^\\(?:textnormal|normalfont)\b/,
    (s, d) => ({ ...s, fam: 'serif', bold: false, italic: false, caps: false, design: d.serif }),
  ],
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

const GROUP_ITALIC = 1,
  GROUP_BOLD = 2,
  GROUP_CAPS = 4
/** a string's UTF-16 code units that are no white space (L2:2289 nonSpace) */
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
/** what a declaration sets, as a group's bits: an italic, bold or small capitals switch (\em, \itshape, \bfseries, \sc, …) */
const declared = (src: string | undefined): number =>
  (/^\\(?:em|it|itshape|sl|slshape)$/.test(src ?? '') ? GROUP_ITALIC : 0) |
  (/^\\(?:bf|bfseries)$/.test(src ?? '') ? GROUP_BOLD : 0) |
  (/^\\(?:sc|scshape)$/.test(src ?? '') ? GROUP_CAPS : 0)
/** the unit's base style without what its own groups set (L2:2253 baseOf), and its declarations: a declaration sets its group
 *  from where it stands, at the unit's top level the rest of it (today's \sc rule, for every switch: the part's style is the
 *  state of the unit's glyphs, its declarations' already, so that "{\em …}" read over an italic base toggled it upright where
 *  today's base, its glyphs' outside its styled pieces (measuredOf), was upright) */
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
      // switchesOf), and sets its group's face as the switch inside it did, declared's)
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

/** a length TeX reads as a dimension, in PDF units (L2:2394-2399) */
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
const KERNS: Record<string, number> = {
  '\\enspace': 0.5,
  '\\thinspace': 1 / 6,
  '\\,': 1 / 6,
  '\\:': 2 / 9,
  '\\;': 5 / 18,
}
const SKIPS: Record<string, number> = { '\\quad': 1, '\\qquad': 2 }
/** a placeholder's source that is explicit glue, as TeX sets it: { em } or { bp }, and whether a line may break at it
 *  (L2:2406 glueOf) */
export function glueOf(src: string): { em?: number; bp?: number; brk: boolean } | null {
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
/** a token whose edge is a character a spaceless script sets no space beside (L2:2426 spacelessEdge) */
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
 * full stop or comma in every such place of lane stray-stop's probe), never a CJK writer's. xeCJK and ctex keep this one case, a typed space between a
 * Latin letter or a formula and a full-width closing mark (xeCJK.sty 3.10.4 :3886 `\xeCJK_Boundary_and_FullRight:N`; measured
 * with ctexart 2.6.4: a CJK word, Q, a space and the ideographic full stop 46.84 pt against 43.33 without the space), where it is an author's keystroke; here it is not set, the
 * coordinator's ruling of 2026-11-12 (docs/PDF-READER.md §18.18). A half-width mark keeps the space before it in every target
 */
const markBarredStart = (t: Token | null, cjkFace: (t: Token) => boolean, barred: (ch: string) => boolean) => {
  if (t?.cls !== 'cjk' || typeof t.s !== 'string' || !t.s) return false
  const ch = [...t.s][0]!
  return fullWidthPunctOf(ch, cjkFace(t)) !== null && barred(ch)
}

/** a target's capitals: its language's case mapping, the root's where it names none a locale reads (L2:2454 upperOf) */
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
/** `s` in runs of one case as the layer draws its small capitals (L2:2472 caseRuns) */
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
/** a rendering's runs with the names a package generated in it in the target's (L2:1309 renameRuns) */
export function renameRuns<R extends { text: string }>(
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
/** a crop resolution as its readers take it, one a part (L2:1875 cropPartsOf) */
export function cropPartsOf(r: TRes): Record<string, unknown>[] {
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

/** B.tokens: the unit's row as tokens, unmeasured, each in its face (L2:2524 tokensOf2) */
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
  const cjkRe = cjkClassRe(cjkQuotes)
  const kinsoku = kinsokuOf(P.noStart, P.noEnd)
  /** a character no line opens with: UAX 14's (no-start.mjs) or the target's rules' (P.noStart): break.ts `barred`'s */
  const barredChar = (ch: string) => noStart(ch) || kinsoku.starts(ch)
  const lastIsSpace = () => tokens.length > 0 && !!tokens.at(-1)!.space
  /** the space tokens a chunk of white space made that holds more than ordinary collapsible white space (space, tab, line
   *  ends): a no-break space U+00A0, a narrow one U+202F, the ideographic space U+3000; a text's own, which no rule of the
   *  marks takes (the rule before a full-width mark no line opens with, below) */
  const hardSpaces = new WeakSet<Token>()
  let noBreakNext = false,
    afterHead = false
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
      for (const ch of chunk) {
        const cls = cjkRe.test(ch) ? 'cjk' : 'latin'
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
      const next = openStyle(p, style(), designs)
      const link = LINK_OPEN.test(p.src as string) && p.id !== undefined ? { link: p.id } : {}
      stack.push({ ...(next ?? style()), ...colourRun(k, p), ...link })
      return
    }
    if (p.t === 'close') {
      if (stack.length > 1) stack.pop()
      if (headId !== null && p.id === headId) afterHead = true
      return
    }
    if (p.t === 'ph') {
      const glue = glueOf(p.src)
      if (glue) {
        kernOn(glue)
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
    if (r.brk && r.room !== undefined) {
      while (tokens.at(-1)?.space) tokens.pop()
      if (tokens.at(-1)?.newline !== r.brkAt) tokens.push({ newline: r.brkAt!, room: r.room, w100: 0 })
      return
    }
    if (r.brk && r.region !== undefined && resolved.referenced?.has(r.region)) {
      while (tokens.at(-1)?.space) tokens.pop()
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
    if (r.mode === 'crop') {
      const pv = tokens.at(-1)
      const ecglue = !keepAll && pv?.cls === 'cjk' && !pv.leadEnd && !pv.kernW && !(pv.s && kinsoku.ends(pv.s))
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
  // (a space is not set between two characters of a spaceless script, nor beside a full-width mark's blank side whatever
  // stands on its other side (markBlankEdge), nor before a full-width mark no line opens with whatever stands before it
  // (markBarredStart; an ordinary space alone): a space after its head (`keep`) and one in a monospaced run are the text's)
  const spaceless = !keepAll && !i.spacedSource
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
