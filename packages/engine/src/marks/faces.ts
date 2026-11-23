// What TeX set for a unit's groups that their source does not say, read off the unit's text glyphs (B's, in its stream: the
// marked compile's own output, TeX's font state and the characters it set): the face a group's own text is set in, and the
// punctuation TeX set at a group's end. A group's style read off its command's name alone (the front end's tables:
// `\textbf{`, `\emph{`, …) sets nothing for a paper's macro: 2608.25210v2's run-in heads are its
// `\newcommand{\topic}[1]{\vspace{.5pt} \noindent{\bf #1.}}`, the argument bold and then a stop of the macro's own, neither in
// the argument's source, and on staging they came back regular, their stop lost.
//
// The source's letters and the glyphs' letters are matched in order (the longest common subsequence, Myers', as words.ts
// places a unit's words on A), compared folded (compatibility decomposition, marks off, lower case); a text macro's text (the
// marking probe's, its glyphs the unit's text) is the source's there, an element whose ink is its own has no glyph among
// them. A group's face is the face most of the glyphs of its own text are set in (facts.ts faceKeyOf: role, weight, slant; a
// math font's glyphs aside), stated where it is not the face of the text around it: in the nearest group around it that holds
// text outside it (its parent, the unit at last), that one's own text's, or where its text is all in groups (a paragraph's
// body in a group of its own, `\rtwo{…}`; a bibliography entry of `\bibinfo{…}` fields), most of its text's outside the groups
// whose command names their style (an `\emph{…}` journal's face is the command's; none outside: the group is the unit's
// text, nothing stated).
// Its size: the one size its own text's glyphs share (facts.ts oneSize: up the line, math fonts aside, alike to the hundredth
// of a point; a faked small capital aside, a lowercase source letter TeX set as a capital, which NFSS draws at its share of
// the size), stated where it is not the size the group is drawn at by default (a group whose glyphs stand at several sizes
// states none: a median of them is the size of none of its runs): the size of the nearest group around it whose size is stated, else the
// unit's base, its own text's (the glyphs of no group's; where every letter is a group's, all of them). The face compares
// role, weight and slant, never a size, so a kicker `{\small\bfseries #1}` beside a title `{\fontsize{30}{35}\selectfont
// \bfseries …}` (both bold, both sans) and `{\small …}` inside a line stated nothing, and their translations were drawn at the
// unit's one size (2611.23651v2 p1, docs/PDF-READER.md §18.112). A group stated for its size alone keeps its source's style
// name: the statement is the part's (SpanAt.style), never the unit's content.
// Its stop: the glyphs
// TeX set between the glyph of the group's last letter and the glyph of the source's next letter after it, where the source
// between the two writes no character (white space, or an element whose ink is its own) and both words are matched whole
// (each letter's glyph right after the one before: a word matched across TeX's own letters is no proof of where they stand),
// every character of them punctuation that ends a sentence or a clause (Unicode's Terminal_Punctuation; a bracket or a quote is
// the ink a macro sets around its argument); stated on the innermost of the groups whose text ends there. A letter or
// a digit there is TeX's prose (a macro's own words), no stop.
import type { Piece, Style } from '@readarxiv/format'
import { lcs } from '../align/myers.ts'
import {
  changeOf,
  classifyFont,
  faceKeyOf,
  fold,
  mostOf,
  oneSize,
  type StyleGlyph,
  styleOf,
  unitSize,
} from '../locate/facts.ts'

type Span = Extract<Piece, { t: 'span' }>

/** what TeX set for a group that its source does not say: its face (`style` its glyphs' Style, `change` what it changes of
 *  the face around it, LaTeX's names) where it is not that one's; its size where it is not the size it is drawn at by default
 *  (`style` then too, `sized`; `change` absent where its face is the face around it); its stop */
export interface GroupFact {
  style?: Style
  change?: string
  sized?: true
  stop?: string
}

const SPACE = /\s/u
/** the punctuation that ends a sentence or a clause (Unicode's Terminal_Punctuation: `.` `,` `;` `:` `!` `?` and every
 *  script's own), never a bracket or a quote, which a macro sets around its argument (`\ctk{0.5k}`: "[0.5k]", its opening
 *  bracket no stop of the group before, its closing one half a pair whose other half no wire writes) */
const TERMINAL = /^\p{Terminal_Punctuation}+$/u
/** the steps an alignment may take, per letter of the two sides: a resource bound (myers.ts `work`), never a decision about
 *  content; past it the letters not reached are not matched, and their groups state nothing */
const WORK_PER_LETTER = 256

/** the face most of glyphs are set in, a math font's glyphs aside where others are there */
const faceOf = (gs: readonly StyleGlyph[]): string | undefined => {
  const text = gs.filter((g) => classifyFont(g.base).fam !== 'math')
  return mostOf((text.length ? text : gs).map((g) => faceKeyOf(g.base)))
}

/**
 * Each group's facts as TeX set it (a group with none is absent): `glyphs` the unit's text glyphs in B's stream order; `textOf`
 * the text TeX sets for an element whose glyphs are the unit's text (a text macro, the marking probe's), none for one whose
 * ink is its own (its glyphs not among `glyphs`)
 */
export function groupFacts(
  content: readonly Piece[],
  glyphs: readonly StyleGlyph[],
  textOf: (el: Extract<Piece, { t: 'el' }>) => string | undefined = () => undefined,
): Map<Span, GroupFact> {
  // ---- the source's characters, each with its group (the innermost; null the unit's own), its letters' places in P, and
  // whether it is white space or an element whose ink is its own (no glyph of `glyphs`: what may stand between a group's last
  // letter and its stop's glyphs, which the source does not write)
  const group: (Span | null)[] = []
  const quiet: boolean[] = []
  /** inside a group whose command names its style (its `style` not `other`, the caller's: `\emph{…}`): its face the command's */
  const named: boolean[] = []
  const from: number[] = []
  const to: number[] = []
  /** the element a character is of (its text `textOf`'s), by order, -1 the text's own */
  const elOf: number[] = []
  /** each character as the source writes it (its case: a faked small capital's reading) */
  const srcCh: string[] = []
  let els = 0
  const P: number[] = []
  const ranges = new Map<Span, [number, number]>()
  const parent = new Map<Span, Span | null>()
  const depth = new Map<Span, number>()
  {
    type Frame = { span: Span | null; list: readonly Piece[]; k: number; named: boolean }
    const stack: Frame[] = [{ span: null, list: content, k: 0, named: false }]
    while (stack.length) {
      const top = stack[stack.length - 1] as Frame
      if (top.k >= top.list.length) {
        stack.pop()
        if (top.span) (ranges.get(top.span) as [number, number])[1] = group.length
        continue
      }
      const p = top.list[top.k++] as Piece
      if (p.t === 'span') {
        ranges.set(p, [group.length, group.length])
        parent.set(p, top.span)
        depth.set(p, stack.length)
        stack.push({ span: p, list: p.content, k: 0, named: top.named || p.style !== 'other' })
        continue
      }
      const shown = p.t === 'text' ? p.s : p.t === 'el' ? textOf(p) : undefined
      const chars = shown === undefined ? ['\ufffc'] : [...shown]
      const el = p.t === 'el' && shown !== undefined ? els++ : -1
      for (const ch of chars) {
        group.push(top.span)
        srcCh.push(ch)
        named.push(top.named)
        quiet.push(shown === undefined || SPACE.test(ch))
        elOf.push(el)
        from.push(P.length)
        if (shown !== undefined) P.push(...fold(ch))
        to.push(P.length)
      }
    }
  }
  // ---- the glyphs' letters, each with its glyph; matched in order
  const G: number[] = []
  const gOf: number[] = []
  glyphs.forEach((g, q) => {
    for (const c of fold(g.u)) {
      G.push(c)
      gOf.push(q)
    }
  })
  const matched = new Int32Array(P.length).fill(-1)
  if (P.length && G.length) {
    const { pairs } = lcs(Int32Array.from(P), Int32Array.from(G), WORK_PER_LETTER * (P.length + G.length))
    for (let k = 0; k < pairs.length; k += 2) matched[pairs[k] as number] = pairs[k + 1] as number
  }
  // (an element's text with letters none of which is matched: its ink is its own after all, no glyph of `glyphs` (a text macro
  // the ownership gave its marks, 2608.25210v2's `\sys`), white space to the stop's reading; one matched, or of no letter (a text
  // symbol, whose glyph is the text's: own/own.ts), the source's characters)
  const found = new Uint8Array(els)
  const lettered = new Uint8Array(els)
  for (let i = 0; i < group.length; i++) {
    const e = elOf[i] as number
    if (e < 0 || (to[i] as number) <= (from[i] as number)) continue
    lettered[e] = 1
    for (let x = from[i] as number; x < (to[i] as number); x++) if (matched[x]! >= 0) found[e] = 1
  }
  for (let i = 0; i < group.length; i++) {
    const e = elOf[i] as number
    if (e >= 0 && lettered[e] && !found[e]) quiet[i] = true
  }
  const letters = (i: number) => (to[i] as number) > (from[i] as number) && !quiet[i]
  /** the glyphs matched to the letters of the characters from `a` to `b` that `keep` keeps */
  const glyphsIn = (a: number, b: number, keep: (i: number) => boolean): StyleGlyph[] => {
    const qs = new Set<number>()
    for (let i = a; i < b; i++) {
      if (!letters(i) || !keep(i)) continue
      for (let x = from[i] as number; x < (to[i] as number); x++) if (matched[x]! >= 0) qs.add(gOf[matched[x]!]!)
    }
    return [...qs].map((q) => glyphs[q] as StyleGlyph)
  }
  const rangeOf = (s: Span | null): [number, number] => (s ? (ranges.get(s) as [number, number]) : [0, group.length])
  /** the face around a group, in the nearest group around it (the unit at last) that holds text outside it: the face of that
   *  one's own text, or where it has none (its text all in groups), of most of its text outside the groups whose command
   *  names their style (of most of it, where that is all); none where nothing holds text outside the group, nor where a group
   *  between whose command names its style holds the group alone (RevTeX's `\emph{\bibinfo{title}{…}}`: the face the
   *  command's, which the group inherits) */
  const aroundOf = (s: Span): string | undefined => {
    const [sa, sb] = rangeOf(s)
    for (let up = parent.get(s) ?? null; ; up = parent.get(up) ?? null) {
      const [a, b] = rangeOf(up)
      if (glyphsIn(a, b, (i) => i < sa || i >= sb).length) {
        const direct = glyphsIn(a, b, (i) => group[i] === up)
        if (direct.length) return faceOf(direct)
        const plain = glyphsIn(a, b, (i) => !named[i])
        return faceOf(plain.length ? plain : glyphsIn(a, b, () => true))
      }
      if (up === null || up.style !== 'other') return undefined
    }
  }
  /** whether a word's letters (the run of characters with letters from `i` in direction `d`) are matched whole, each letter's
   *  glyph letter right after the one before */
  const whole = (i: number, d: 1 | -1): boolean => {
    let a = i
    let b = i
    while (d === -1 && a - 1 >= 0 && letters(a - 1)) a--
    while (d === 1 && b + 1 < group.length && letters(b + 1)) b++
    let prev = -1
    for (let x = from[a] as number; x < (to[b] as number); x++) {
      const m = matched[x] as number
      if (m < 0 || (prev >= 0 && m !== prev + 1)) return false
      prev = m
    }
    return true
  }

  const out = new Map<Span, GroupFact>()
  const fact = (s: Span): GroupFact => out.get(s) ?? out.set(s, {}).get(s)!
  /** the glyphs of the letters from `a` to `b` that `keep` keeps, a faked small capital aside (a lowercase source letter TeX set
   *  as a capital: NFSS's virtual small capitals, at their share of the size, which is no size of the text's) */
  const sizedIn = (a: number, b: number, keep: (i: number) => boolean): StyleGlyph[] =>
    glyphsIn(a, b, (i) => {
      if (!keep(i)) return false
      const ch = srcCh[i] as string
      const m = matched[from[i] as number] as number
      const u = m >= 0 ? (glyphs[gOf[m] as number] as StyleGlyph).u : ''
      return !(ch !== ch.toUpperCase() && u !== u.toLowerCase() && u === u.toUpperCase())
    })
  /** their size, the median of them (the unit's base: the size most of its text is set at) */
  const sizeIn = (a: number, b: number, keep: (i: number) => boolean): number | undefined =>
    unitSize(sizedIn(a, b, keep))
  /** a size as the page states it, to the hundredth of a point (the coordinates' grid): two sizes TeX set alike */
  const r2 = (v: number) => Math.round(v * 100) / 100
  // (the unit's base size: its own text's, the glyphs of no group's; where every letter is a group's, all of them)
  const base = sizeIn(0, group.length, (i) => group[i] === null) ?? sizeIn(0, group.length, () => true)
  /** each group's size as stated, by which a group inside it is drawn by default */
  const stated = new Map<Span, number>()
  const inherited = (s: Span): number | undefined => {
    for (let up = parent.get(s) ?? null; up; up = parent.get(up) ?? null) if (stated.has(up)) return stated.get(up)
    return base
  }
  /** the stop at each place a group's text ends, the group it is stated on (the innermost of those that end there) */
  const stops = new Map<number, { s: Span; stop: string }>()
  // (in the order the groups open: a group's statement is read before the groups inside it)
  for (const [s, [a, b]] of ranges) {
    // ---- its size: the one its own text's glyphs share, where it is not the size the group is drawn at by default
    const size = oneSize(sizedIn(a, b, (i) => group[i] === s))
    const by = inherited(s)
    // ---- its face: its own text's, where the face around it is another; its size its own where it has one, else the one it
    // is drawn at by default (a group of several sizes states none)
    const gs = glyphsIn(a, b, (i) => group[i] === s)
    const face = gs.length ? faceOf(gs) : undefined
    const around = face === undefined ? undefined : aroundOf(s)
    if (face !== undefined && around !== undefined && face !== around) {
      const { upper: _upper, fill: _fill, ...st } = styleOf(gs)
      void [_upper, _fill]
      fact(s).style = { ...st, size: size ?? by ?? st.size }
      fact(s).change = changeOf(face, around)
    }
    if (size !== undefined && by !== undefined && r2(size) !== r2(by)) {
      stated.set(s, size)
      const f = fact(s)
      if (f.style) f.style = { ...f.style, size }
      else {
        const { upper: _upper, fill: _fill, ...st } = styleOf(gs)
        void [_upper, _fill]
        f.style = { ...st, size }
      }
      f.sized = true
    }
    // ---- its stop: TeX's punctuation between its last letter and the source's next one, the source writing none there
    let last = b - 1
    while (last >= a && !letters(last)) last--
    let next = b
    while (next < group.length && !letters(next)) next++
    let clear = last >= a
    for (let i = last + 1; clear && i < next; i++) clear = quiet[i] as boolean
    const gl = clear ? (matched[(to[last] as number) - 1] as number) : -1
    const gn = next < group.length ? (matched[from[next] as number] as number) : G.length
    if (!clear || gl < 0 || gn < 0 || !whole(last, -1) || (next < group.length && !whole(next, 1))) continue
    const q2 = gn < G.length ? (gOf[gn] as number) : glyphs.length
    let text = ''
    for (let q = (gOf[gl] as number) + 1; q < q2; q++)
      text += (glyphs[q] as StyleGlyph).u.normalize('NFKC').replace(/\s/gu, '')
    if (!text || !TERMINAL.test(text)) continue
    const was = stops.get(last)
    if (!was || (depth.get(s) as number) > (depth.get(was.s) as number)) stops.set(last, { s, stop: text })
  }
  for (const { s, stop } of stops.values()) fact(s).stop = stop
  return out
}
