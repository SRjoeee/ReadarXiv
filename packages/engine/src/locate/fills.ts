// The fill TeX set a unit's text in, group by group, read off the unit's text glyphs on A (the original's colours, as an
// element's El.style.fill and a member's Style.fill are read: facts.ts styleOf). A group's source need not say its colour:
// hyperref's colorlinks sets a link's text in its colour by its own macros, and a paper's macro may colour its argument
// (1810.04805v2 p11's `\href{…}{An efficient framework for …}`, blue on arXiv's page), where the marked compile's log states
// the fill of a colour piece alone (`\textcolor`'s, `\color`'s: SpanAt.colour, El.colour). And a member's fill read over all of
// its glyphs is its groups' where they hold most of its letters (p10's Hendrycks entry, its title link: the entry's fill the
// link's, its authors and journal drawn in it). Today's reader read both off the glyphs (layer2.mjs measuredStyle: each piece
// that may set a colour, the colour its own glyphs hold; the unit's, the colour of its glyphs outside them).
//
// The source's letters and the glyphs' letters are matched in order (the longest common subsequence, Myers', as words.ts
// places a unit's words on A and marks/faces.ts reads a group's face on B), compared folded (compatibility decomposition,
// marks off, lower case); a text macro's text (the marking probe's, its glyphs the unit's text) is the source's there, an
// element whose ink is its own has no glyph among them. Each group, and each colour switch's run (the rest of its group: an
// element whose class states the fill TeX set its run in, El.colour), is a scope of its own; the unit's text in no scope is
// the unit's. A scope's fill is the one most of its own text's glyphs are set in (those of no scope within it), where it has
// none, most of all its text's; a glyph whose fill the page does not tell is not read. A group's fill is stated where it is
// not the fill of the scope around it, or not the unit's own: each group set apart carries its fill itself, since a
// translation keeps some groups and not others (a link span is `must`; Microsoft's reply may move an `\emph`'s markers to the
// end, empty: 2501.14787v1's `\emph{\href{…}{…}}`, whose fill the \emph alone stated was drawn on nothing). A vote of glyphs
// and two inequalities, no threshold.
import type { Piece } from '@readarxiv/format'
import { lcs } from '../align/myers.ts'
import type { StyleGlyph } from './facts.ts'

type El = Extract<Piece, { t: 'el' }>

/** the fills a unit's text is set in: its own (undefined where no glyph of it tells one); each group's (by its open piece's
 *  id) that is not the fill around it or not the unit's own; whether any scope's fill (a group's, a colour switch's run's) is
 *  not the one around it */
export interface Fills {
  own: number | undefined
  groups: [id: string, fill: number][]
  apart: boolean
}

const LETTER = /[\p{L}\p{N}]/u
/** a character's letters as both sides are compared: decomposed, marks off, lower case, its letters and digits alone */
const fold = (ch: string): number[] =>
  [...ch.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()]
    .filter((c) => LETTER.test(c))
    .map((c) => c.codePointAt(0) as number)
/** the steps an alignment may take, per letter of the two sides: a resource bound (myers.ts `work`), never a decision about
 *  content; past it the letters not reached are not read */
const WORK_PER_LETTER = 256

/** the value most of `xs` hold, a tie to the one met first; undefined for none */
const mostOf = (xs: readonly number[]): number | undefined => {
  const n = new Map<number, number>()
  let best: number | undefined
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

/** whether a unit's content has a scope a fill may be set in apart from its own: a group, or a colour switch */
export function hasScopes(content: readonly Piece[], switches: (el: El) => boolean): boolean {
  return content.some((p) => p.t === 'span' || (p.t === 'el' && switches(p)))
}

/**
 * The fills `content`'s text is set in on A: `glyphs` the unit's text glyphs on A in stream order; `textOf` the text TeX sets
 * for an element whose glyphs are the unit's text (a text macro's), none for one whose ink is its own; `switches` whether an
 * element is a colour switch (its run, the rest of its group, set in the fill TeX's log states for it)
 */
export function fillsOf(
  content: readonly Piece[],
  glyphs: readonly StyleGlyph[],
  textOf: (el: El) => string | undefined = () => undefined,
  switches: (el: El) => boolean = () => false,
): Fills {
  // ---- the scopes (0 the unit's own), each with the scope around it and the group it is (none: a switch's run, the unit)
  const parent: number[] = [-1]
  const groupOf: (string | null)[] = [null]
  // ---- the source's letters, each with its scope
  const P: number[] = []
  const scopeOf: number[] = []
  const walk = (list: readonly Piece[], scope: number) => {
    let cur = scope
    for (const p of list) {
      if (p.t === 'span') {
        parent.push(cur)
        groupOf.push(p.id)
        walk(p.content, parent.length - 1)
        continue
      }
      if (p.t === 'el' && switches(p)) {
        parent.push(cur)
        groupOf.push(null)
        cur = parent.length - 1
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
  // ---- the glyphs' letters, each with its glyph; matched in order
  const G: number[] = []
  const gOf: number[] = []
  glyphs.forEach((g, q) => {
    for (const c of fold(g.u)) {
      G.push(c)
      gOf.push(q)
    }
  })
  const S = parent.length
  // (each scope's glyphs whose fill is told, its own text's and all its text's, each glyph once)
  const direct: Set<number>[] = Array.from({ length: S }, () => new Set())
  const all: Set<number>[] = Array.from({ length: S }, () => new Set())
  if (P.length && G.length) {
    const { pairs } = lcs(Int32Array.from(P), Int32Array.from(G), WORK_PER_LETTER * (P.length + G.length))
    for (let k = 0; k < pairs.length; k += 2) {
      const q = gOf[pairs[k + 1] as number] as number
      const fill = (glyphs[q] as StyleGlyph).fill
      if (!Number.isInteger(fill) || fill < 0) continue
      const s = scopeOf[pairs[k] as number] as number
      direct[s]!.add(q)
      for (let up = s; up >= 0; up = parent[up] as number) all[up]!.add(q)
    }
  }
  const fillOf = (s: number): number | undefined => {
    const own = direct[s]!.size ? direct[s]! : all[s]!
    return mostOf([...own].sort((x, y) => x - y).map((q) => (glyphs[q] as StyleGlyph).fill))
  }
  const fills = Array.from({ length: S }, (_, s) => fillOf(s))
  const groups: [string, number][] = []
  let apart = false
  for (let s = 1; s < S; s++) {
    const f = fills[s]
    const around = fills[parent[s] as number]
    if (f === undefined || around === undefined) continue
    if (f !== around) apart = true
    const id = groupOf[s]
    if (id !== null && id !== undefined && (f !== around || f !== fills[0])) groups.push([id, f])
  }
  return { own: fills[0], groups, apart }
}
