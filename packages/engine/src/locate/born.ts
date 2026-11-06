// The units born on arXiv's page: text of A that B never printed (no partner on B) and that no located unit claimed inside its
// span (a supplement our compile did not set, a figure's text where B is a draft). The one heuristic part of locate (design
// §4.3), kept in a file of its own so that it can be replaced (OCR lines will take this shape): A's unclaimed glyphs in stream
// order (those no unit holds: claimedA -1, locate's FREE) cut into lines by the line rule (lines.ts), and consecutive lines of one page gathered into a block where the next one
// stands under the one before within 1.75 of its size and overlaps it across; a block's text is its glyphs' Unicode, a space
// where two stand apart by 0.15 of their size and between its lines. Text inside a form XObject (an included figure) is
// `inkfigures`, the rest `inkorphan` (the ink kinds of today's bundle, FORMAT.md §2).
import type { Piece } from '@readarxiv/format'
import type { Mapping } from '../align/align.ts'
import type { Doc, DocGlyph } from '../doc.ts'
import { cutLines } from './lines.ts'

const BLOCK_DY = 1.75
const SPACE_GAP = 0.15

export interface Born {
  kind: 'inkfigures' | 'inkorphan'
  content: Piece[]
  /** its glyphs on A (global), stream order */
  glyphs: number[]
}

export function bornOf(inkA: Doc, m: Mapping, claimedA: Int32Array, pageA: Int32Array): Born[] {
  const NA = claimedA.length
  const gA = (a: number): DocGlyph => {
    const p = (pageA[a] as number) - 1
    return inkA.pages[p]!.glyphs[a - (m.offA[p] as number)]!
  }
  const free: number[] = []
  for (let a = 0; a < NA; a++)
    if ((m.aToB[a] as number) < 0 && (claimedA[a] as number) === -1 && !m.offpageA[a] && /\S/.test(gA(a).u))
      free.push(a)
  if (!free.length) return []
  const lines = cutLines(free, (a) => ({ page: pageA[a] as number, g: gA(a) }))
  const blocks: (typeof lines)[] = []
  for (const l of lines) {
    const prev = blocks.at(-1)?.at(-1)
    const near =
      !!prev &&
      prev.page === l.page &&
      prev.base - l.base > 0 &&
      prev.base - l.base <= BLOCK_DY * Math.max(prev.size, l.size) &&
      l.x0 < prev.x1 &&
      l.x1 > prev.x0 &&
      prev.gs.every((a) => gA(a).form) === l.gs.every((a) => gA(a).form)
    if (near) blocks.at(-1)!.push(l)
    else blocks.push([l])
  }
  return blocks.map((b) => {
    let s = ''
    b.forEach((l, q) => {
      if (q) s += ' '
      let prev: DocGlyph | null = null
      for (const a of l.gs) {
        const g = gA(a)
        if (prev && g.x0 - prev.x1 > SPACE_GAP * Math.max(g.size, prev.size)) s += ' '
        s += g.u
        prev = g
      }
    })
    const glyphs = b.flatMap((l) => l.gs)
    return {
      kind: glyphs.every((a) => gA(a).form) ? 'inkfigures' : 'inkorphan',
      content: [{ t: 'text', s: s.normalize('NFKC') }],
      glyphs,
    }
  })
}
