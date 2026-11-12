// The paragraph points' gate (design-display 2a, row F1; lane pairs-91's "the gate that is missing"): each paragraph TeX opened
// inside a member's text that its part states (at a group's open, SpanAt.opens; at an element, El.opens; at its first word,
// Placed.paras) and whose row carries its anchor (the group or the element between the row's texts, else the sentence start
// paired with the point's first word: unit/breaks.ts `pairing`) is laid with its first line on the line TeX opened it on: the
// member's laid line at that line's baseline (the comparator's 0.01 pt) begins with the paragraph's first thing (its first
// letter or digit, NFKC, either case; an element's crop by its piece). Read off the entry's Page (layPage, the product's lay),
// on the page that holds the line; a member not laid there shows the original's (counted apart). A point the row gives no
// anchor flows on (counted, by why). In the lab, the first word of a point stated at a group or an element is read from the
// unit's source (its piece's offset in the source projection, the first of Placed.words at or after it, on the point's line):
// what the part states as Placed.paras once the engine does (design-display 2a: the group's text a reply dropped, the case of
// 2111.09276v1's run-in titles on Microsoft's rows).
import type { Part, Placed, Unit } from '@readarxiv/format'
import { firstWordAt, projectionOf } from '../../src/lay/lit.ts'
import { rowPieces, sourcePieces } from '../../src/lay/read.ts'
import type { Laid, Page, Rows } from '../../src/types.ts'
import { pairing, parasOf, type V0Piece } from '../../src/unit/breaks.ts'

export type ParasGate = {
  /** the points on the pages walked (their line's), by what states them: group, element, word */
  stated: Map<string, number>
  /** each by the anchor its row carries (group, element, sentence), or `none: ` and why, or `no row` (the member's row failed
   *  or none came: the original's) */
  anchor: Map<string, number>
  /** of those with an anchor, their member laid on the page: opened on TeX's line */
  opened: number
  /** of those with an anchor, their member laid: not opened on TeX's line (the gate's fails), each named */
  off: string[]
  /** of those with an anchor, their member not laid on the page (the original's shows), by its state */
  notLaid: Map<string, number>
  /** examples: the opened, the points with no anchor */
  openedEx: string[]
  noneEx: string[]
}
export const newParasGate = (): ParasGate => ({
  stated: new Map(),
  anchor: new Map(),
  opened: 0,
  off: [],
  notLaid: new Map(),
  openedEx: [],
  noneEx: [],
})
const add = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)

/** a string's first four letters and digits, NFKC, lower case; where it holds none, its first character that is no white space */
const firstOf = (s: string): string => {
  const t = s.normalize('NFKC')
  const ls = (t.match(/[\p{L}\p{N}]/gu) ?? []).slice(0, 4).join('')
  return (ls || (/\S/.exec(t)?.[0] ?? '')).toLowerCase()
}
type First = { el?: string; text: string }
/** the first thing the row's pieces draw from piece `q`, character `c` on: an element that draws something (its piece, its
 *  text), or the text from its first character that is no white space, over the pieces after it to the next such element (a
 *  group's text and what follows it: "IER" then "当在…") */
function firstFrom(m: Placed, pieces: readonly V0Piece[], q: number, c: number): First | null {
  const els = new Map(m.els ?? [])
  let text = ''
  for (let i = q; i < pieces.length; i++) {
    const p = pieces[i]!
    if (p.t === 'text') {
      text += p.s.slice(i === q ? c : 0)
      continue
    }
    if (p.t !== 'ph' && p.t !== 'nested') continue
    const e = els.get(String(p.k))
    if (!e || e.kind === 'zero' || e.kind === 'space' || (!e.ink.length && !e.text)) continue
    if (/\S/.test(text)) break
    return { el: String(p.k), text: e.text ?? e.copy ?? '' }
  }
  return /\S/.test(text) ? { text: text.trimStart() } : null
}
/** the piece and the character that hold offset `P` of the row's projection */
function atProjection(pieces: readonly V0Piece[], P: number): [number, number] {
  const { from } = projectionOf(pieces)
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i]!
    const len = p.t === 'text' ? p.s.length : p.t === 'ph' || p.t === 'nested' ? 1 : 0
    if (len && from[i]! <= P && P < from[i]! + len) return [i, P - from[i]!]
  }
  return [pieces.length, 0]
}
/** the first word of a point stated at a group's open or an element (piece `id` of the unit's source): the first of Placed.words
 *  at or after the piece's offset in the source projection, where it stands on the point's line */
function firstWordOf(m: Placed, unit: Unit | undefined, id: string, j: number): number | undefined {
  if (!unit || !m.words) return undefined
  const from = projectionOf(sourcePieces(unit.content)).from[Number(id)]
  if (from === undefined) return undefined
  const w = m.words[firstWordAt(m.words, from)]
  return w && w[1] === j ? w[0] : undefined
}
const textOf = (l: Laid['lines'][number]) => l[3].map((it) => it.s).join('')
/** whether a laid line begins with `f`: its first item a crop of that element, or its text's first four letters and digits
 *  `f`'s (as many as the shorter holds: a line that ends in its first word, a paragraph's text an element follows) */
const begins = (l: Laid['lines'][number], f: First): boolean => {
  const it = l[3][0]
  if (f.el !== undefined && it && 'piece' in it && it.piece === f.el) return true
  const a = firstOf(textOf(l)),
    b = firstOf(f.text)
  return a !== '' && b !== '' && (a.startsWith(b) || b.startsWith(a))
}

/** the gate over one page of the entry's: every member of the part with a point whose line stands on page `pg` */
export function parasGate(
  g: ParasGate,
  pair: string,
  pg: number,
  page: Page,
  part: Part,
  rows: Rows,
  units: ReadonlyMap<string, Unit>,
): void {
  const laidOf = new Map(page.members.map((x) => [x.ord, x]))
  for (const m of part.flows.flat()) {
    if (typeof m.text !== 'string') continue
    // (its points by line: a group's open, an element, a first word's offset; the offset stated of a point a group or an
    // element states is that point's)
    const at = new Map<number, { by: string; id?: string; o?: number }>()
    for (const [id, s] of m.spans ?? []) if (s.opens !== undefined) at.set(s.opens, { by: 'group', id })
    for (const [id, e] of m.els ?? [])
      if (e.opens !== undefined && !at.has(e.opens)) at.set(e.opens, { by: 'element', id })
    for (const [o, j] of parasOf(m)) {
      const x = at.get(j)
      if (x) x.o = o
      else at.set(j, { by: 'word', o })
    }
    if (!at.size) continue
    const row = rows.get(m.text)
    const pieces = row?.ok ? rowPieces(m, row.content) : null
    const x = laidOf.get(m.ord)
    for (const [j, pt] of [...at].sort((a, b) => a[0] - b[0])) {
      const line = m.lines[j]
      if (!line || line[0] !== pg) continue
      add(g.stated, pt.by)
      const name = `${pair} p${pg} ord ${m.ord} line ${j} (${pt.by}${pt.id !== undefined ? ` ${pt.id}` : ''})`
      if (!row?.ok || !pieces) {
        add(g.anchor, 'no row')
        continue
      }
      // (its anchor in the row: the group or the element between the row's texts, else the sentence start of its first word)
      const said = (p: V0Piece) => p.t === 'text' && /\S/.test(p.s)
      const between = (i: number) => i > 0 && pieces.slice(0, i).some(said) && pieces.slice(i + 1).some(said)
      let anchor: string | null = null,
        first: First | null = null
      if (pt.id !== undefined) {
        const i = pieces.findIndex((p) =>
          pt.by === 'group'
            ? p.t === 'open' && p.k === Number(pt.id)
            : (p.t === 'ph' || p.t === 'nested') && p.k === Number(pt.id),
        )
        if (between(i)) {
          anchor = pt.by
          first = firstFrom(m, pieces, i, 0)
        }
      }
      if (!anchor) {
        const o = pt.o ?? (pt.id !== undefined ? firstWordOf(m, units.get(m.text), pt.id, j) : undefined)
        const pair_ = pairing(m, pieces, row.sentences)
        const P = o === undefined ? 'word' : pair_ === 'sentences' ? 'sentences' : pair_(o, j)
        if (typeof P !== 'number') {
          const why = `none: ${P === 'word' ? 'no first word on its line' : P === 'sentences' ? 'no sentences' : 'no start at its word'}`
          add(g.anchor, why)
          if (g.noneEx.length < 12) g.noneEx.push(`${name}: ${why}`)
          continue
        }
        anchor = 'sentence'
        first = firstFrom(m, pieces, ...atProjection(pieces, P))
      }
      add(g.anchor, anchor)
      if (x?.state !== 'laid') {
        add(g.notLaid, x?.state ?? 'absent')
        continue
      }
      // (the laid line at TeX's baseline, the nearest across to TeX's line start where two stand on it)
      const drawn = x.lines
        .filter((l) => Math.abs(l[0] - line[4]) <= 0.01)
        .sort((a, b) => Math.abs(a[1] - line[2]) - Math.abs(b[1] - line[2]))[0]
      const shown = (l?: Laid['lines'][number]) =>
        l ? `"${textOf(l).trim().slice(0, 28)}" at ${l[0]}` : 'no laid line there'
      if (drawn && first && begins(drawn, first)) {
        g.opened++
        if (g.openedEx.length < 12) g.openedEx.push(`${name} by ${anchor}: ${shown(drawn)}`)
        continue
      }
      // (what the member drew where: the line its paragraph's first thing begins, if any)
      const where = first ? x.lines.find((l) => begins(l, first!)) : undefined
      g.off.push(
        `${name} by ${anchor}: TeX's line at ${line[4]}: ${shown(drawn)}; its first thing "${(first?.text ?? '').slice(0, 16)}"${first?.el !== undefined ? ` (element ${first.el})` : ''} ${where ? `begins ${shown(where)}` : 'begins no laid line'}`,
      )
    }
  }
}
