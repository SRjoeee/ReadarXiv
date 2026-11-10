// I10, the sentence cover (the owner's rules of 2026-10-30: both panes always light the same thing; a sentence always lights
// whole, all its pieces, text, elements and labels, across lines, columns and pages): over a laid page (layPage's Page, its
// members' Laid.lit) and the part it was laid from, every piece drawn of a member lit is in exactly one of its sentences on
// each pane, and the two panes have the same sentences. A piece is what a pane draws of the member: on the left, arXiv's page
// (A), each word of its text at its first glyph (Placed.words), each element's ink box and its label's; on the right, as drawn,
// each character of its laid lines' text, each crop, and the ink it keeps where it stands (an element, a label, a held line).
// A piece is in a sentence whose boxes hold its middle; it is left out where none does, in two where two do. Its displays are
// blocks of their own (Laid.lit's `own`), in no sentence: none of their ink is a piece. A member set along a direction (a turned
// figure text, lit whole in its run's frame) is not read. Across the member's pages: each entry of the left a sentence of the
// right (the same count on every page), its element and its label in the same sentence on both panes, and every sentence drawn
// on one pane drawn on the other. Read by the gate's runner (gate-l1.ts's entry) over lane L1's parts or a stage 1a run's
// bundles, and so by the parity's lay of its pairs (lab/typeset/parity/v2.mjs), with no network. AXT_COVER_EX=<n>: examples
// kept a fault (4); AXT_COVER_DBG='<tag> <ord>': that member's lit, row, words, elements, lines and pieces, a JSON line a page.
import type { Box, Part, Placed } from '@readarxiv/format'
import type { Laid, Metrics, Page } from '../../src/types.ts'

type Line = Placed['lines'][number]
const KEPT = 1
/** what a pane draws of a member: a word on A, an element's ink, a label, a character of laid text, a crop, a held line */
export type PieceKind = 'word' | 'line' | 'element' | 'label' | 'text' | 'crop' | 'held'
export type Cover = {
  /** the pieces read on each pane, the members lit */
  pieces: number
  members: number
  /** each fault's count by `${pane} ${fault} ${piece}` */
  faults: Map<string, number>
  /** examples of each (AXT_COVER_EX, 4) */
  ex: Map<string, string[]>
  /** per member (its ord) across its pages: each element's and its label's sentences on each pane, each pane's sentences drawn */
  seen: Map<
    number,
    { left: Map<string, Set<number>>; right: Map<string, Set<number>>; drawn: [Set<number>, Set<number>] }
  >
}
export const newCover = (): Cover => ({ pieces: 0, members: 0, faults: new Map(), ex: new Map(), seen: new Map() })

const fault = (c: Cover, key: string, ex: string) => {
  c.faults.set(key, (c.faults.get(key) ?? 0) + 1)
  const xs = c.ex.get(key) ?? []
  if (xs.length < Number(process.env.AXT_COVER_EX ?? 4)) c.ex.set(key, [...xs, ex])
}
/** the sentences whose boxes hold a point */
const holding = (per: readonly Box[][], x: number, y: number): number[] => {
  const out: number[] = []
  per.forEach((boxes, s) => {
    if (boxes.some((b) => b[0] <= x && x <= b[2] && b[1] <= y && y <= b[3])) out.push(s)
  })
  return out
}
const mid = (b: readonly number[]): [number, number] => [(b[0]! + b[2]!) / 2, (b[1]! + b[3]!) / 2]
const onDisplay = (displays: readonly Box[], x: number, y: number) =>
  displays.some((b) => b[0] <= x && x <= b[2] && b[1] <= y && y <= b[3])

type Piece = { kind: PieceKind; at: [number, number]; id?: string }
/** a full-width closing mark, its ink in the em's first half, and an opening one, in its second (the SC faces': a highlight
 *  box stops at a mark's ink, the parity's highlight measure) */
const CLOSING =
  /[\u3001\u3002\uff0c\uff0e\uff1a\uff1b\uff01\uff1f\uff09\uff3d\uff5d\u3015\u3009\u300b\u300d\u300f\u3011\u3017\u3019\u201d\u2019]/u
const OPENING = /[\uff08\uff3b\uff5b\u3014\u3008\u300a\u300c\u300e\u3010\u3016\u3018\u201c\u2018]/u

/** a member's pieces on A on page `page`: its words, its elements' ink but its displays', its label's */
function piecesOnA(m: Placed, page: number, displays: readonly Box[]): Piece[] {
  const out: Piece[] = []
  const lineMid = (l: Line) => (l[5] + l[6]) / 2
  for (const [, line, x] of m.words ?? []) {
    const l = m.lines[line]
    if (!l || l[0] !== page) continue
    // (a word at its first glyph: a point half a point into it, on its line's middle)
    const at: [number, number] = [x + 0.5, lineMid(l)]
    if (!onDisplay(displays, ...at)) out.push({ kind: 'word', at })
  }
  // (a member whose part places no word, lit whole: each of its lines but a display's row)
  if (!m.words?.length)
    for (const l of m.lines) {
      const at: [number, number] = [(l[2] + l[3]) / 2, lineMid(l)]
      if (l[0] === page && !onDisplay(displays, ...at)) out.push({ kind: 'line', at })
    }
  for (const [id, e] of m.els ?? []) {
    if (e.kind === 'display') continue
    for (const k of e.ink) if (k[0] === page) out.push({ kind: 'element', at: mid(k.slice(1)), id })
  }
  if (m.label && m.label.ink[0] === page) out.push({ kind: 'label', at: mid(m.label.ink.slice(1)), id: 'label' })
  return out
}

/** a laid member's pieces as drawn on page `page`: each character of its lines' text, each crop, and the ink it keeps where it
 *  stands (the original's, its elements' group on or the element kept by TeX outside its text, El.keep; its label where not
 *  drawn anew; its held lines) */
function piecesDrawn(x: Laid, m: Placed, page: number, metrics: Metrics, displays: readonly Box[]): Piece[] {
  // (a crop's element: the one whose ink on A its source was cut from holds, a crop's `piece` being its piece's index in the
  // rows the page was laid from, which the cover is not told)
  const elOf = (src: readonly number[]) => {
    const [x, y] = mid(src.slice(1))
    for (const [id, e] of m.els ?? [])
      if (
        e.kind !== 'display' &&
        e.ink.some(
          (k) => k[0] === src[0] && k[1]! - 0.5 <= x && x <= k[3]! + 0.5 && k[2]! - 0.5 <= y && y <= k[4]! + 0.5,
        )
      )
        return id
    return undefined
  }
  const out: Piece[] = []
  for (const [y, , , items] of x.lines) {
    for (const it of items) {
      if ('src' in it) {
        const [, x0, b0, x1, t0, base] = it.src
        const k = it.k || 1
        const id = it.piece === 'label' ? 'label' : elOf(it.src)
        out.push({
          kind: it.piece === 'label' ? 'label' : 'crop',
          at: [it.x + ((x1 - x0) * k) / 2, y + ((b0 + t0) / 2 - base) * k],
          ...(id ? { id } : {}),
        })
        continue
      }
      if (it.dir) continue
      const chars = [...it.s]
      const rise = it.rise ?? 0
      chars.forEach((ch, i) => {
        if (/\s/u.test(ch)) return
        const from = it.dx?.[i] ?? metrics.advance(it.face, it.size, chars.slice(0, i).join(''))
        const to = it.dx?.[i + 1] ?? from + metrics.advance(it.face, it.size, ch)
        // (its ink's middle: a closing mark's first half, an opening one's second)
        const at = CLOSING.test(ch) ? from + (to - from) / 4 : OPENING.test(ch) ? to - (to - from) / 4 : (from + to) / 2
        out.push({ kind: 'text', at: [it.x + at, y + rise + 0.3 * it.size] })
      })
    }
  }
  // (the ink it keeps where it stands, at its place on A)
  const elementsOff = !!(x.off & 2)
  for (const [id, e] of m.els ?? []) {
    if (e.kind === 'display' || (elementsOff && !e.keep)) continue
    for (const k of e.ink) if (k[0] === page) out.push({ kind: 'element', at: mid(k.slice(1)), id })
  }
  if (m.label && !(x.off & 4) && m.label.ink[0] === page)
    out.push({ kind: 'label', at: mid(m.label.ink.slice(1)), id: 'label' })
  for (const l of m.lines) {
    if (l[0] !== page || !(l[9] & KEPT)) continue
    const at = mid([l[2], l[6], l[3], l[5]])
    if (!onDisplay(displays, ...at)) out.push({ kind: 'held', at })
  }
  return out
}

/** one laid page into the cover: each member lit, each of its pieces on both panes */
export function coverOf(c: Cover, page: Page, part: Part, metrics: Metrics, tag = ''): void {
  if (page.wait.rows.length || page.wait.faces.length) return
  const byOrd = new Map(part.flows.flat().map((m) => [m.ord, m]))
  for (const x of page.members) {
    const m = byOrd.get(x.ord)
    if (!m || x.lit.dir || (!x.lit.left.length && !x.lit.right.length)) continue
    c.members++
    const where = `${tag} p${page.page} ord ${x.ord}`
    if (x.lit.left.length !== x.lit.right.length) {
      fault(c, `both apart ${m.kind}`, `${where}: ${x.lit.left.length} left, ${x.lit.right.length} right`)
      continue
    }
    const displays = x.lit.own.flatMap(([, boxes]) => boxes)
    const seen = c.seen.get(x.ord) ?? {
      left: new Map(),
      right: new Map(),
      drawn: [new Set<number>(), new Set<number>()],
    }
    c.seen.set(x.ord, seen)
    const panes = [
      ['left', x.lit.left, piecesOnA(m, page.page, displays)],
      [
        'right',
        x.lit.right,
        x.state === 'laid' ? piecesDrawn(x, m, page.page, metrics, displays) : piecesOnA(m, page.page, displays),
      ],
    ] as const
    if (process.env.AXT_COVER_DBG === `${tag} ${x.ord}`)
      console.log(
        'COVER',
        JSON.stringify({
          page: page.page,
          lit: x.lit,
          words: m.words,
          els: m.els,
          lines: x.lines.map((l) => [
            l[0],
            l[3].map((it) => ('src' in it ? `[${it.piece}@${it.x.toFixed(1)}]` : `${it.s}@${it.x.toFixed(1)}`)),
          ]),
          pieces: panes.map(([p, , ps]) => [
            p,
            ps.map((q) => [
              q.kind,
              q.id,
              q.at.map((v) => +v.toFixed(1)),
              holding(p === 'left' ? x.lit.left : x.lit.right, ...q.at),
            ]),
          ]),
        }),
      )
    panes.forEach(([pane, per, pieces], side) => {
      for (const p of pieces) {
        c.pieces++
        const s = holding(per, ...p.at)
        if (s.length !== 1) {
          fault(
            c,
            `${pane} ${s.length ? 'two' : 'none'} ${p.kind}`,
            `${where} ${p.kind}${p.id ? ` ${p.id}` : ''} at ${p.at.map((v) => v.toFixed(1)).join(',')}${s.length ? ` in ${s.join('+')}` : ''}`,
          )
          continue
        }
        seen.drawn[side]!.add(s[0]!)
        if (p.id) {
          const ids = seen[pane]
          ids.set(p.id, (ids.get(p.id) ?? new Set()).add(s[0]!))
        }
      }
    })
  }
}

/** the cover's checks across each member's pages: its elements and label in the same sentence on both panes, each sentence drawn
 *  on one pane drawn on the other */
export function coverDone(c: Cover, tag = ''): void {
  for (const [ord, seen] of c.seen) {
    for (const [id, left] of seen.left) {
      const right = seen.right.get(id)
      if (!right) continue
      if ([...left].sort().join() !== [...right].sort().join())
        fault(
          c,
          `both differ ${id === 'label' ? 'label' : 'element'}`,
          `${tag} ord ${ord} ${id}: left ${[...left]}, right ${[...right]}`,
        )
    }
    const [l, r] = seen.drawn
    for (const s of l) if (!r.has(s)) fault(c, 'right missing sentence', `${tag} ord ${ord} sentence ${s}`)
    for (const s of r) if (!l.has(s)) fault(c, 'left missing sentence', `${tag} ord ${ord} sentence ${s}`)
  }
  c.seen.clear()
}
