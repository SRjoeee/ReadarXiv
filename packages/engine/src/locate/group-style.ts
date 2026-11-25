// The fill and the face TeX set a unit's text in, group by group, read off the unit's text glyphs on A (the original's
// colours and fonts, as an element's El.style and a member's Style are read: facts.ts styleOf). A group's source need not say
// them: hyperref's colorlinks sets a link's text in its colour by its own macros, and a paper's macro may colour its argument
// (1810.04805v2 p11's `\href{…}{An efficient framework for …}`, blue on arXiv's page), where the marked compile's log states
// the fill of a colour piece alone (`\textcolor`'s, `\color`'s: SpanAt.colour, El.colour). And a member's style read over all
// of its glyphs is its groups' where they hold most of its letters: p10's Hendrycks entry, its title link holding most, drawn
// blue whole; 2609.20976v1 p13's references, their \emph titles and journals holding most, drawn italic whole, where the
// translators' replies move an \emph's markers to the end, empty. Both are read off the glyphs: each piece that may set an
// attribute, the value its own glyphs hold; the unit's, the value of its glyphs outside them.
//
// The source's letters and the glyphs' letters are matched in order (the longest common subsequence, Myers', as words.ts
// places a unit's words on A and marks/faces.ts reads a group's face on B), compared folded (compatibility decomposition,
// marks off, lower case, its letters and digits alone); a text macro's text (the marking
// probe's, its glyphs the unit's text) is the source's there, an element whose ink is its own has no glyph among them. The
// unit's own face, its base, reads its marks too (a second alignment, of its letters and its marks alike) and the glyphs of a
// symbol it draws as text where it stands (`$\uparrow$`): a colon, a semicolon, an arrow are glyphs TeX set in a face, and a
// run's face is its own glyphs' (docs/PDF-READER.md §18.114): the colon of `\textbf{While} $j \leq n$:` is TeX's regular, the
// commas between an author line's `\textbf` names too (2602.23285v2).
//
// Each attribute is read by its own scopes: each group, and for the fill each colour switch's run (the rest of its group: an
// element whose class states the fill TeX set its run in, El.colour), for the face each face declaration's run (an element
// that is a bare command the group table names a face for: `\em`, `\bfseries`); the unit's text in no scope is the unit's. A
// scope's value is the one most of its own text's glyphs hold (those of no scope within it), where it has none, most of all
// its text's; a glyph that tells none (a fill the page does not tell, a math font's face) is not read. The unit's own value,
// where it has no text of its own (every letter a group's: RevTeX's `\bibfield{author}{… Weinberg,\ }\href{…}{…}`), is
// its text's outside the groups that set the attribute by their definition (a link's or a colour piece's fill, hyperref's or
// their own; a group whose command names a face, and a declaration's run), never the unit's; only where it has none, all its
// text's.
//
// A group's fill is stated where it is not the fill of the scope around it, or not the unit's own: each group set apart
// carries its fill itself, since a translation keeps some groups and not others (a link span is `must`; Microsoft's reply may
// move an `\emph`'s markers to the end, empty: 2501.14787v1's `\emph{\href{…}{…}}`, whose fill the \emph alone stated was
// drawn on nothing). A group's face likewise, but only a group whose command names no face (a link, a colour piece, a paper's
// macro, a bare group: the typesetter applies a stated face only to those, a named command's own face to the rest) and read
// off its own text alone: a group whose text is all another scope's (a declaration's run, a named group) is drawn in that
// scope's face, and one stated on it too would be applied twice (`{\em …}`: the stated italic, then the switch's toggle).
// Votes of glyphs and inequalities, no threshold.
import type { KnownSpanKind, Piece, Style } from '@readarxiv/format'
import { lcs } from '../align/myers.ts'
import { isLetterOrDigit } from '@readarxiv/text'
import { classifyFont, fold, mostOf, oneSize, type StyleGlyph, styleOf, unitSize } from './facts.ts'

type El = Extract<Piece, { t: 'el' }>
type Span = Extract<Piece, { t: 'span' }>

/** a face's slant and weight */
interface Face {
  bold: boolean
  italic: boolean
}
/** what a unit's text is set in by its groups: for its fill and its face, its own (undefined where no glyph of it tells
 *  one), each group's set apart (by its open piece's id: a fill; a face as the Style its own glyphs are set in), and whether
 *  any scope's value is not the one around it; `text`, the positions in `glyphs` of its own text's letters, those of no group
 *  (its base size's) */
interface GroupStyle {
  fill: { own: number | undefined; groups: [id: string, fill: number][]; apart: boolean }
  /** `own` the letters' base, `marks` the marks' (the face of the unit's marks outside every group, else its letters' base);
   *  `several`: the groups of `groups` whose glyphs stand at several sizes (facts.ts oneSize), which state no size of their
   *  own (their style's size then the median, for the caller to set to the member's) */
  face: {
    own: Face | undefined
    marks: Face | undefined
    groups: [id: string, style: Style][]
    several: string[]
    apart: boolean
  }
  text: number[]
  /** each size declaration's run (sizeSwitch) whose own text's glyphs share one size (facts.ts oneSize): the declaration's
   *  element id and that size, which the caller states where it is not the member's (El.size) */
  sizes: [id: string, size: number][]
}
/** what a group style or a face switch sets of a face: its weight (bold, medium), its slant (italic, upright); a face change a
 *  paper's macro was read to make names each (marks/faces.ts, `sans-bold`) */
const SETS_WEIGHT = /(?:^|-)(?:bold|medium)(?:-|$)/
const SETS_SLANT = /(?:^|-)(?:italic|upright)(?:-|$)/
/** whether a character is a mark: no letter or digit (@readarxiv/text isLetterOrDigit, the one reading of which characters are
 *  letters) and no white space: punctuation, a separator, a symbol */
const isMark = (ch: string): boolean => !/^\s$/u.test(ch) && !isLetterOrDigit(ch)
/** a character's code points as the marks' alignment reads them: its letters and digits folded (facts.ts fold), a mark as itself,
 *  compatibility composed */
const foldMarks = (ch: string): number[] =>
  isMark(ch) ? [...ch.normalize('NFKC')].map((c) => c.codePointAt(0) as number) : fold(ch)
/** what a command the group table names no face for (ink.ts groupStyleOf: `other`) sets of the face by its definition
 *  (latex.ltx's \textup and \upshape the shape, \textmd and \mdseries the series, \textnormal and \normalfont both): a scope of
 *  the attribute it sets, whose text is no reading of the face around it (2608.19071v1's `\textup{Theorem 1.2.}` in an italic
 *  theorem: its upright full stops no reading of the theorem's marks' slant) */
const KERNEL_FACE_SETS: [RegExp, { weight: boolean; slant: boolean }][] = [
  [/^\\(?:textup|upshape)(?![A-Za-z@])/, { weight: false, slant: true }],
  [/^\\(?:textmd|mdseries)(?![A-Za-z@])/, { weight: true, slant: false }],
  [/^\\(?:textnormal|normalfont)(?![A-Za-z@])/, { weight: true, slant: true }],
]
/** LaTeX 2.09's font commands, which latex.ltx defines over \normalfont (\DeclareOldFontCommand{\bf}{\normalfont\bfseries}…):
 *  each sets the weight and the slant both, whatever it names (`\emph{{\bf heading} text}`: its heading upright, no reading
 *  of the slant around it) */
const OLD_FONT_COMMANDS = /^\\(?:bf|it|sl|sc|tt|rm|sf)(?![A-Za-z@])/
/** a group or a switch that turns the slant around it (latex.ltx's \emph, \em): its run is the other slant of the text around it */
const TOGGLES_SLANT = /^\\(?:emph|em)(?![A-Za-z@])/

/** the steps an alignment may take, per letter of the two sides: a resource bound (myers.ts `work`), never a decision about
 *  content; past it the letters not reached are not read */
const WORK_PER_LETTER = 256
/** the group styles whose command names no face (the group table's, ink.ts groupStyleOf: a link, a colour piece, an
 *  underline, any other command or a bare group); every other names one (bold, italic, mono, small capitals, or what a paper's
 *  macro was read to change, marks/faces.ts) */
const NO_FACE = new Set<string>(['other', 'link', 'colour', 'underline'] satisfies readonly KnownSpanKind[])
/** whether a group style (the group table's, or a paper's macro's read face) names a face */
export const namesFace = (style: string): boolean => !NO_FACE.has(style)

/** a size declaration: latex.ltx's size commands (\tiny … \Huge, \normalsize: each \@setfontsize, which ends in
 *  \selectfont) and \selectfont itself, which sets the size a \fontsize before it asked for. Its run is the rest of the group
 *  it stands in, set at the size its glyphs show (groupStyleOf `sizes`) */
export const SIZE_DECLARATION =
  /^(?:tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge|selectfont)$/
/** whether a unit's content has a scope a fill or a face may be set in apart from its own: a group, or a switch */
export function hasScopes(content: readonly Piece[], switches: (el: El) => boolean): boolean {
  return content.some((p) => p.t === 'span' || (p.t === 'el' && switches(p)))
}

/**
 * The fills and faces `content`'s text is set in on A: `glyphs` the unit's text glyphs on A in stream order; `textOf` the text
 * TeX sets for an element whose glyphs are the unit's text (a text macro's), none for one whose ink is its own;
 * `colourSwitch` whether an element is a colour switch (its run, the rest of its group, set in the fill TeX's log states for
 * it); `faceSwitch` whether it is a face declaration (its run set in the face it names), `switchStyle` the group style it
 * names (`bold`, `italic`, `mono`: what its run sets of the face; none told, its weight and its slant both); `symbolGlyphs` the
 * glyphs of an element whose ink is its own and which the typesetter draws as text in the face where it stands (a symbol, the
 * arrow of `$\uparrow$`), which the base reads as it reads the unit's marks
 */
export function groupStyleOf(
  content: readonly Piece[],
  glyphs: readonly StyleGlyph[],
  textOf: (el: El) => string | undefined = () => undefined,
  colourSwitch: (el: El) => boolean = () => false,
  faceSwitch: (el: El) => boolean = () => false,
  switchStyle: (el: El) => string | undefined = () => undefined,
  symbolGlyphs: (el: El) => readonly StyleGlyph[] | undefined = () => undefined,
  spanCmd: (s: Span) => string | undefined = () => undefined,
  sizeSwitch: (el: El) => boolean = () => false,
): GroupStyle {
  // ---- the scopes (0 the unit's own): each with the scope around it, the group it is (null: a switch's run, the unit), the
  // attribute a switch's run sets, and whether it sets the fill or the face by its definition (or stands inside one that does);
  // of the face, whether it sets the weight, the slant, and whether the slant it is set in is turned (an odd count of \emph and
  // \em runs around it: the base's slant read as it would be without them)
  const parent: number[] = [-1]
  const span: (Span | null)[] = [null]
  const sw: ('fill' | 'face' | null)[] = [null]
  const fillSet: boolean[] = [false]
  const faceSet: boolean[] = [false]
  const weightSet: boolean[] = [false]
  const slantSet: boolean[] = [false]
  const turned: boolean[] = [false]
  // ---- the source's letters, each with its scope; its letters and marks, each with its scope (the base's reading); and the
  // glyphs of the symbols it draws as text, each with its scope
  const P: number[] = []
  const scopeOf: number[] = []
  const PM: number[] = []
  const scopeOfM: number[] = []
  const markM: boolean[] = []
  const symbols: [glyph: StyleGlyph, scope: number][] = []
  // ---- the size declarations' runs (`\large` at a unit's top level, no group around it: the rest of the group it stands in,
  // as TeX's declaration holds to its group's end), apart from the scopes above, which they set neither the fill nor the face
  // of: each with its element, the scope it was declared in, and each letter's innermost run (-1 none)
  const sizeEl: string[] = []
  const sizeAt: number[] = []
  const sizeOf: number[] = []
  const open = (
    cur: number,
    s: Span | null,
    kind: 'fill' | 'face' | null,
    setsFill: boolean,
    setsFace: boolean,
    face: { weight: boolean; slant: boolean; toggles: boolean } = { weight: false, slant: false, toggles: false },
  ) => {
    parent.push(cur)
    span.push(s)
    sw.push(kind)
    fillSet.push((fillSet[cur] as boolean) || setsFill)
    faceSet.push((faceSet[cur] as boolean) || setsFace)
    weightSet.push((weightSet[cur] as boolean) || face.weight)
    // (a toggle's slant is the base's turned: its run read back, not set apart)
    slantSet.push((slantSet[cur] as boolean) || (face.slant && !face.toggles))
    turned.push((turned[cur] as boolean) !== face.toggles)
    return parent.length - 1
  }
  /** what a group style sets of the face, by its name, and whether its command turns the slant */
  const faceSets = (style: string | undefined, cmd: string | undefined) => {
    const toggles = TOGGLES_SLANT.test(cmd ?? '')
    if (style === undefined || OLD_FONT_COMMANDS.test(cmd ?? '')) return { weight: true, slant: true, toggles }
    return { weight: SETS_WEIGHT.test(style), slant: SETS_SLANT.test(style) || toggles, toggles }
  }
  const walk = (list: readonly Piece[], scope: number, sizeScope: number) => {
    let cur = scope
    let size = sizeScope
    for (const p of list) {
      if (p.t === 'span') {
        const names = namesFace(p.style)
        // (its command: the span's open, or the declaration a bare group began with that the instrument made its command, its
        // open left `{` (switchesOf: `{\em …}` a group of style italic, SpanAt.cmd `em`), which turns the slant as `\em` does)
        const cmd = spanCmd(p)
        const opening = cmd !== undefined && (p.open ?? '').trimStart().startsWith('{') ? `\\${cmd}{` : p.open
        const kernel = names ? undefined : KERNEL_FACE_SETS.find(([re]) => re.test((opening ?? '').trimStart()))?.[1]
        const s = open(
          cur,
          p,
          null,
          p.style === 'link' || p.style === 'colour',
          names,
          names ? faceSets(p.style, opening) : kernel ? { ...kernel, toggles: false } : undefined,
        )
        walk(p.content, s, size)
        continue
      }
      if (p.t === 'el' && sizeSwitch(p)) {
        sizeEl.push(p.id)
        sizeAt.push(cur)
        size = sizeEl.length - 1
        continue
      }
      if (p.t === 'el' && colourSwitch(p)) {
        cur = open(cur, null, 'fill', true, false)
        continue
      }
      if (p.t === 'el' && faceSwitch(p)) {
        cur = open(cur, null, 'face', false, true, faceSets(switchStyle(p), p.src))
        continue
      }
      const shown = p.t === 'text' ? p.s : p.t === 'el' ? textOf(p) : undefined
      if (shown === undefined) {
        if (p.t === 'el') for (const g of symbolGlyphs(p) ?? []) symbols.push([g, cur])
        continue
      }
      for (const ch of shown) {
        for (const c of fold(ch)) {
          P.push(c)
          scopeOf.push(cur)
          sizeOf.push(size)
        }
        for (const c of foldMarks(ch)) {
          PM.push(c)
          scopeOfM.push(cur)
          markM.push(isMark(ch))
        }
      }
    }
  }
  walk(content, 0, -1)
  const S = parent.length
  // ---- the glyphs' letters, each with its glyph; matched in order
  const G: number[] = []
  const gOf: number[] = []
  glyphs.forEach((g, q) => {
    for (const c of fold(g.u)) {
      G.push(c)
      gOf.push(q)
    }
  })
  const pairs =
    P.length && G.length
      ? lcs(Int32Array.from(P), Int32Array.from(G), WORK_PER_LETTER * (P.length + G.length)).pairs
      : []
  // ---- each attribute read by its own scopes: a switch's run of the other attribute is its group's text
  const read = <V>(
    of: (g: StyleGlyph) => V | undefined,
    mine: 'fill' | 'face',
    sets: readonly boolean[],
  ): { value: (V | undefined)[]; up: number[]; direct: Set<number>[] } => {
    // (a scope's own scope for this attribute: itself, a group or a switch of it; else the one around it)
    const own: number[] = []
    for (let s = 0; s < S; s++) own[s] = s === 0 || span[s] || sw[s] === mine ? s : (own[parent[s] as number] as number)
    const up = Array.from({ length: S }, (_, s) => (s === 0 ? -1 : (own[parent[s] as number] as number)))
    const direct: Set<number>[] = Array.from({ length: S }, () => new Set())
    const all: Set<number>[] = Array.from({ length: S }, () => new Set())
    const outside = new Set<number>()
    for (let k = 0; k < pairs.length; k += 2) {
      const q = gOf[pairs[k + 1] as number] as number
      if (of(glyphs[q] as StyleGlyph) === undefined) continue
      const s = own[scopeOf[pairs[k] as number] as number] as number
      direct[s]!.add(q)
      for (let u = s; u >= 0; u = up[u] as number) all[u]!.add(q)
      if (!sets[s]) outside.add(q)
    }
    const value = Array.from({ length: S }, (_, s) => {
      const from = direct[s]!.size ? direct[s]! : s === 0 && outside.size ? outside : all[s]!
      return mostOf([...from].sort((x, y) => x - y).map((q) => of(glyphs[q] as StyleGlyph) as V))
    })
    return { value, up, direct }
  }
  // ---- the fill
  const fill = read((g) => (Number.isInteger(g.fill) && g.fill >= 0 ? g.fill : undefined), 'fill', fillSet)
  const fills: [string, number][] = []
  let fillApart = false
  for (let s = 1; s < S; s++) {
    if (!span[s] && sw[s] !== 'fill') continue
    const f = fill.value[s]
    const around = fill.value[fill.up[s] as number]
    if (f === undefined || around === undefined) continue
    if (f !== around) fillApart = true
    if (span[s] && (f !== around || f !== fill.value[0])) fills.push([(span[s] as Span).id, f])
  }
  // ---- the face: a glyph's slant and weight by its font's name, a math font's none
  const face = read(
    (g) => {
      const c = classifyFont(g.base)
      return c.fam === 'math' ? undefined : `${c.bold ? 'b' : ''}|${c.italic ? 'i' : ''}`
    },
    'face',
    faceSet,
  )
  // ---- the unit's own faces, its two bases, each attribute by its own scopes, read off TeX's glyphs alone (no count of a
  // translation's characters decides it, docs/PDF-READER.md §18.114). A translated letter stands for the original's letters and a
  // translated mark for its marks (punctuation, separators, symbols), so a run's face is its own glyphs': the letters' base,
  // the face of its letters outside every group and every switch's run; where none, outside every scope that sets that
  // attribute by its definition (its weight outside `\textbf{…}` and a `\bfseries` run, its slant outside `\textit{…}`, a `\emph`
  // run's slant read turned back: TeX's own state around those runs, which their glyphs show for what they do not set); where
  // none, the face its letters share, all of them. The marks' base, the face of its marks outside every group and every switch's
  // run and of the symbols it draws as text there (`\textbf{While} $j \leq n$:`'s colon regular, an author line's commas between
  // its `\textbf` names regular, the arrow of `\textbf{Mean tokens}~$\downarrow$`); where none, outside every scope that sets the
  // attribute (a `\multicolumn`'s or a link's text is in the face around it: the arrow of
  // `\multicolumn{2}{c}{\textbf{Overall}$\uparrow$}`); where none, the letters' base. A unit of marks alone has its letters' base
  // its marks' (all of them where no scope tells one)
  let pm: Int32Array | number[] | null = null
  /** the letters and marks matched to their glyphs: [source index, glyph] by twos (read once, where a base reading asks it) */
  const marksPairs = (): ArrayLike<number> => {
    if (pm) return pm
    const GM: number[] = []
    const gOfM: number[] = []
    glyphs.forEach((g, q) => {
      for (const c of foldMarks(g.u)) {
        GM.push(c)
        gOfM.push(q)
      }
    })
    const raw =
      PM.length && GM.length
        ? lcs(Int32Array.from(PM), Int32Array.from(GM), WORK_PER_LETTER * (PM.length + GM.length)).pairs
        : []
    const out: number[] = []
    for (let k = 0; k < raw.length; k += 2) out.push(raw[k] as number, gOfM[raw[k + 1] as number] as number)
    pm = out
    return pm
  }
  /** a value most of a set of glyphs hold, in their order */
  const most = (from: ReadonlyMap<number, string>) =>
    from.size ? mostOf([...from].sort((x, y) => x[0] - y[0]).map(([, v]) => v)) : undefined
  const basesOf = (
    sets: readonly boolean[],
    val: (g: StyleGlyph, s: number) => string | undefined,
    valSymbol: (g: StyleGlyph, s: number) => string | undefined,
  ): { letters: string | undefined; marks: string | undefined } => {
    // (its letters: in its own scope, outside the scopes that set the attribute, all of them)
    const lDirect = new Map<number, string>(),
      lOutside = new Map<number, string>(),
      lEvery = new Map<number, string>()
    for (let k = 0; k < pairs.length; k += 2) {
      const q = gOf[pairs[k + 1] as number] as number
      const s = scopeOf[pairs[k] as number] as number
      const v = val(glyphs[q] as StyleGlyph, s)
      if (v === undefined) continue
      lEvery.set(q, v)
      if (!sets[s]) lOutside.set(q, v)
      if (s === 0) lDirect.set(q, v)
    }
    // (its marks, and the symbols it draws as text, keyed past the text's glyphs in their order: likewise)
    const mDirect = new Map<number, string>(),
      mOutside = new Map<number, string>(),
      mEvery = new Map<number, string>()
    const mp = marksPairs()
    for (let k = 0; k < mp.length; k += 2) {
      if (!markM[mp[k] as number]) continue
      const q = mp[k + 1] as number
      const s = scopeOfM[mp[k] as number] as number
      const v = val(glyphs[q] as StyleGlyph, s)
      if (v === undefined) continue
      mEvery.set(q, v)
      if (!sets[s]) mOutside.set(q, v)
      if (s === 0) mDirect.set(q, v)
    }
    symbols.forEach(([g, s], k) => {
      const v = valSymbol(g, s)
      if (v === undefined) return
      mEvery.set(glyphs.length + k, v)
      if (!sets[s]) mOutside.set(glyphs.length + k, v)
      if (s === 0) mDirect.set(glyphs.length + k, v)
    })
    const marksOwn = most(mDirect) ?? most(mOutside)
    const letters = most(lDirect) ?? most(lOutside) ?? most(lEvery) ?? marksOwn ?? most(mEvery)
    return { letters, marks: marksOwn ?? letters }
  }
  // (a glyph's weight and slant its font's, a math font's none; a symbol's weight its font's, a math font's too: TeX sets an
  // arrow from cmsy regular, from cmbsy bold; a symbol's slant none, whatever its font: math sets a capital Greek letter from
  // cmr upright and a letter from cmmi italic by its design, not by the text's face (2610.20581v1 p4's italic theorem, its
  // `$\Omega$` upright, its period italic))
  const weightOf = (g: StyleGlyph) => {
    const c = classifyFont(g.base)
    return c.fam === 'math' ? undefined : c.bold ? 'b' : ''
  }
  const symbolWeightOf = (g: StyleGlyph) => (classifyFont(g.base).bold ? 'b' : '')
  const slantOf = (g: StyleGlyph, s: number) => {
    const c = classifyFont(g.base)
    return c.fam === 'math' ? undefined : c.italic !== (turned[s] as boolean) ? 'i' : ''
  }
  const weight = basesOf(weightSet, weightOf, symbolWeightOf),
    slant = basesOf(slantSet, slantOf, () => undefined)
  if (weight.letters !== undefined && slant.letters !== undefined) face.value[0] = `${weight.letters}|${slant.letters}`
  const marksFace =
    weight.marks !== undefined && slant.marks !== undefined ? `${weight.marks}|${slant.marks}` : undefined
  // ---- the unit's own text, its letters in no group (a face's or a fill's switch's run at its top level its own) and in no
  // size declaration's run: its base size's glyphs, the size TeX's paragraph begins at (a title set at the class's \huge, its
  // subtitle after `\large`: the title's). Where every such letter is in a declaration's run (one that opens the unit), the
  // letters in no group, the run's
  const inGroup: boolean[] = []
  for (let s = 0; s < S; s++) inGroup[s] = s > 0 && (!!span[s] || (inGroup[parent[s] as number] as boolean))
  const text = new Set<number>()
  const unsized = new Set<number>()
  for (let k = 0; k < pairs.length; k += 2) {
    if (inGroup[scopeOf[pairs[k] as number] as number]) continue
    const q = gOf[pairs[k + 1] as number] as number
    text.add(q)
    if ((sizeOf[pairs[k] as number] as number) < 0) unsized.add(q)
  }
  // ---- each declaration's run: its own text's glyphs (its letters in no group opened inside it), else all of its letters', at
  // the one size they share (none of several: oneSize)
  const groupOf = (s: number): number => (s <= 0 || span[s] ? s : groupOf(parent[s] as number))
  const sizes: [string, number][] = []
  for (let z = 0; z < sizeEl.length; z++) {
    const own: StyleGlyph[] = []
    const every: StyleGlyph[] = []
    for (let k = 0; k < pairs.length; k += 2) {
      if (sizeOf[pairs[k] as number] !== z) continue
      const g = glyphs[gOf[pairs[k + 1] as number] as number] as StyleGlyph
      every.push(g)
      if (groupOf(scopeOf[pairs[k] as number] as number) === groupOf(sizeAt[z] as number)) own.push(g)
    }
    const one = oneSize(own.length ? own : every)
    if (one !== undefined) sizes.push([sizeEl[z] as string, one])
  }
  const faces: [string, Style][] = []
  const several: string[] = []
  let faceApart = false
  for (let s = 1; s < S; s++) {
    if (!span[s] && sw[s] !== 'face') continue
    const f = face.value[s]
    const around = face.value[face.up[s] as number]
    if (f === undefined || around === undefined) continue
    if (f !== around) faceApart = true
    const sp = span[s]
    if (!sp || namesFace(sp.style) || !face.direct[s]!.size) continue
    const mine = mostOf(
      [...face.direct[s]!]
        .sort((x, y) => x - y)
        .map((q) => {
          const c = classifyFont((glyphs[q] as StyleGlyph).base)
          return `${c.bold ? 'b' : ''}|${c.italic ? 'i' : ''}`
        }),
    )
    // (stated also where it is the face around it but not the marks' base: the marks inside it are the group's, not the base's,
    // 2608.03063v1's `\exfield{Input:}` bold, its colon bold, beside a regular `$\cdots$`)
    if (
      mine === undefined ||
      (mine === around && mine === face.value[0] && (marksFace === undefined || mine === marksFace))
    )
      continue
    const gs = [...face.direct[s]!].sort((x, y) => x - y).map((q) => glyphs[q] as StyleGlyph)
    const { upper: _upper, fill: _fill, ...st } = styleOf(gs)
    void [_upper, _fill]
    // (at the one size its glyphs share; of several, none: the caller states the member's)
    const one = oneSize(gs)
    if (one === undefined) several.push(sp.id)
    faces.push([sp.id, { ...st, size: one ?? unitSize(gs) ?? st.size }])
  }
  const ownFace = face.value[0]
  const faceOf = (v: string | undefined): Face | undefined =>
    v === undefined ? undefined : { bold: v.startsWith('b'), italic: v.endsWith('i') }
  return {
    fill: { own: fill.value[0], groups: fills, apart: fillApart },
    face: {
      own: faceOf(ownFace),
      marks: faceOf(marksFace),
      groups: faces,
      several,
      apart: faceApart,
    },
    text: [...(unsized.size ? unsized : text)].sort((x, y) => x - y),
    sizes,
  }
}

/**
 * The glyphs of each group's letters on A, as groupStyleOf matches them (the longest common subsequence of the source's letters
 * and the glyphs', folded): by its open piece's id, the positions in `glyphs` (the unit's text glyphs in stream order) of the
 * letters its own text and the groups inside it set, in order (`groups`; a group none of whose letters is matched is absent),
 * and those of every letter matched (`all`). `textOf` as groupStyleOf's
 */
export function groupLettersOf(
  content: readonly Piece[],
  glyphs: readonly StyleGlyph[],
  textOf: (el: El) => string | undefined = () => undefined,
): { groups: Map<string, number[]>; all: number[] } {
  const P: number[] = []
  const chainOf: (readonly string[])[] = []
  const walk = (list: readonly Piece[], chain: readonly string[]) => {
    for (const p of list) {
      if (p.t === 'span') {
        walk(p.content, [...chain, p.id])
        continue
      }
      const shown = p.t === 'text' ? p.s : p.t === 'el' ? textOf(p) : undefined
      if (shown === undefined) continue
      for (const ch of shown)
        for (const c of fold(ch)) {
          P.push(c)
          chainOf.push(chain)
        }
    }
  }
  walk(content, [])
  const G: number[] = []
  const gOf: number[] = []
  glyphs.forEach((g, q) => {
    for (const c of fold(g.u)) {
      G.push(c)
      gOf.push(q)
    }
  })
  const groups = new Map<string, number[]>()
  const all: number[] = []
  if (!P.length || !G.length) return { groups, all }
  const { pairs } = lcs(Int32Array.from(P), Int32Array.from(G), WORK_PER_LETTER * (P.length + G.length))
  for (let k = 0; k < pairs.length; k += 2) {
    const q = gOf[pairs[k + 1] as number] as number
    if (all.at(-1) !== q) all.push(q)
    for (const id of chainOf[pairs[k] as number] as readonly string[]) {
      const l = groups.get(id) ?? groups.set(id, []).get(id)!
      if (l.at(-1) !== q) l.push(q)
    }
  }
  return { groups, all }
}
