// The fill and the face TeX set a unit's text in, group by group, read off the unit's text glyphs on A (the original's
// colours and fonts, as an element's El.style and a member's Style are read: facts.ts styleOf). A group's source need not say
// them: hyperref's colorlinks sets a link's text in its colour by its own macros, and a paper's macro may colour its argument
// (1810.04805v2 p11's `\href{…}{An efficient framework for …}`, blue on arXiv's page), where the marked compile's log states
// the fill of a colour piece alone (`\textcolor`'s, `\color`'s: SpanAt.colour, El.colour). And a member's style read over all
// of its glyphs is its groups' where they hold most of its letters: p10's Hendrycks entry, its title link holding most, drawn
// blue whole; 2609.20976v1 p13's references, their \emph titles and journals holding most, drawn italic whole, where the
// translators' replies move an \emph's markers to the end, empty. Today's reader read both off the glyphs (layer2.mjs
// measuredStyle: each piece that may set an attribute, the value its own glyphs hold; the unit's, the value of its glyphs
// outside them).
//
// The source's letters and the glyphs' letters are matched in order (the longest common subsequence, Myers', as words.ts
// places a unit's words on A and marks/faces.ts reads a group's face on B), compared folded (compatibility decomposition,
// marks off, lower case, its letters and digits alone, as today's measuredStyle read them); a text macro's text (the marking
// probe's, its glyphs the unit's text) is the source's there, an element whose ink is its own has no glyph among them. Its
// punctuation is no reading of its own: TeX sets the commas between an author line's `\textbf` names regular, and a unit
// read off them was drawn regular where a translation drops the names' groups (2602.23285v2's author line).
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
import type { Piece, Style } from '@readarxiv/format'
import { lcs } from '../align/myers.ts'
import { classifyFont, type StyleGlyph, styleOf, unitSize } from './facts.ts'

type El = Extract<Piece, { t: 'el' }>
type Span = Extract<Piece, { t: 'span' }>

/** a face's slant and weight */
export interface Face {
  bold: boolean
  italic: boolean
}
/** what a unit's text is set in by its groups: for its fill and its face, its own (undefined where no glyph of it tells
 *  one), each group's set apart (by its open piece's id: a fill; a face as the Style its own glyphs are set in), and whether
 *  any scope's value is not the one around it */
export interface GroupStyle {
  fill: { own: number | undefined; groups: [id: string, fill: number][]; apart: boolean }
  face: { own: Face | undefined; groups: [id: string, style: Style][]; apart: boolean }
}

const LETTER = /[\p{L}\p{N}]/u
/** a character's letters as both sides are compared: decomposed, marks off, lower case, its letters and digits alone (a
 *  ligature its letters) */
const fold = (ch: string): number[] =>
  [...ch.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()]
    .filter((c) => LETTER.test(c))
    .map((c) => c.codePointAt(0) as number)
/** the steps an alignment may take, per letter of the two sides: a resource bound (myers.ts `work`), never a decision about
 *  content; past it the letters not reached are not read */
const WORK_PER_LETTER = 256
/** the group styles whose command names no face (the group table's, ink.ts groupStyleOf: a link, a colour piece, an
 *  underline, any other command or a bare group); every other names one (bold, italic, mono, small capitals, or what a paper's
 *  macro was read to change, marks/faces.ts) */
const NO_FACE = new Set(['other', 'link', 'colour', 'underline'])
/** whether a group style (the group table's, or a paper's macro's read face) names a face */
export const namesFace = (style: string): boolean => !NO_FACE.has(style)

/** the value most of `xs` hold, a tie to the one met first; undefined for none */
const mostOf = <T>(xs: readonly T[]): T | undefined => {
  const n = new Map<T, number>()
  let best: T | undefined
  let k = 0
  for (const x of xs) {
    const c = (n.get(x) ?? 0) + 1
    n.set(x, c)
    if (c > k) {
      k = c
      best = x
    }
  }
  return best
}

/** whether a unit's content has a scope a fill or a face may be set in apart from its own: a group, or a switch */
export function hasScopes(content: readonly Piece[], switches: (el: El) => boolean): boolean {
  return content.some((p) => p.t === 'span' || (p.t === 'el' && switches(p)))
}

/**
 * The fills and faces `content`'s text is set in on A: `glyphs` the unit's text glyphs on A in stream order; `textOf` the text
 * TeX sets for an element whose glyphs are the unit's text (a text macro's), none for one whose ink is its own;
 * `colourSwitch` whether an element is a colour switch (its run, the rest of its group, set in the fill TeX's log states for
 * it); `faceSwitch` whether it is a face declaration (its run set in the face it names)
 */
export function groupStyleOf(
  content: readonly Piece[],
  glyphs: readonly StyleGlyph[],
  textOf: (el: El) => string | undefined = () => undefined,
  colourSwitch: (el: El) => boolean = () => false,
  faceSwitch: (el: El) => boolean = () => false,
): GroupStyle {
  // ---- the scopes (0 the unit's own): each with the scope around it, the group it is (null: a switch's run, the unit), the
  // attribute a switch's run sets, and whether it sets the fill or the face by its definition (or stands inside one that does)
  const parent: number[] = [-1]
  const span: (Span | null)[] = [null]
  const sw: ('fill' | 'face' | null)[] = [null]
  const fillSet: boolean[] = [false]
  const faceSet: boolean[] = [false]
  // ---- the source's letters, each with its scope
  const P: number[] = []
  const scopeOf: number[] = []
  const open = (cur: number, s: Span | null, kind: 'fill' | 'face' | null, setsFill: boolean, setsFace: boolean) => {
    parent.push(cur)
    span.push(s)
    sw.push(kind)
    fillSet.push((fillSet[cur] as boolean) || setsFill)
    faceSet.push((faceSet[cur] as boolean) || setsFace)
    return parent.length - 1
  }
  const walk = (list: readonly Piece[], scope: number) => {
    let cur = scope
    for (const p of list) {
      if (p.t === 'span') {
        const s = open(cur, p, null, p.style === 'link' || p.style === 'colour', namesFace(p.style))
        walk(p.content, s)
        continue
      }
      if (p.t === 'el' && colourSwitch(p)) {
        cur = open(cur, null, 'fill', true, false)
        continue
      }
      if (p.t === 'el' && faceSwitch(p)) {
        cur = open(cur, null, 'face', false, true)
        continue
      }
      const shown = p.t === 'text' ? p.s : p.t === 'el' ? textOf(p) : undefined
      if (shown === undefined) continue
      for (const ch of shown)
        for (const c of fold(ch)) {
          P.push(c)
          scopeOf.push(cur)
        }
    }
  }
  walk(content, 0)
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
  const faces: [string, Style][] = []
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
    if (mine === undefined || (mine === around && mine === face.value[0])) continue
    const gs = [...face.direct[s]!].sort((x, y) => x - y).map((q) => glyphs[q] as StyleGlyph)
    const { upper: _upper, fill: _fill, ...st } = styleOf(gs)
    void [_upper, _fill]
    faces.push([sp.id, { ...st, size: unitSize(gs) ?? st.size }])
  }
  const ownFace = face.value[0]
  return {
    fill: { own: fill.value[0], groups: fills, apart: fillApart },
    face: {
      own: ownFace === undefined ? undefined : { bold: ownFace.startsWith('b'), italic: ownFace.endsWith('i') },
      groups: faces,
      apart: faceApart,
    },
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
