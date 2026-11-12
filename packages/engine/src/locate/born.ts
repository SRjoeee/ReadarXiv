// The units born on arXiv's page: text of A that B never printed (no partner on B) on a page our compile never makes (a second
// top-level file arXiv compiles and we do not: align.ts setPagesOf), that no located unit claimed and that today's rule run on A
// (ink.ts: the ink units, kept blocks and figure texts) makes no unit of. On a page our compile sets, a glyph it never printed is
// arXiv's ink (PDF-READER §18.27), no unit's: none is born there. The one heuristic part of locate (design
// §4.3), kept in a file of its own so that it can be replaced (OCR lines will take this shape): A's unclaimed glyphs in stream
// order (those no unit holds: the ownership's `free`) cut into lines by the line rule (lines.ts), and consecutive lines of one page gathered into a block where the next one
// stands under the one before within 1.75 of its size and overlaps it across; a block's text is its glyphs' Unicode, a space
// where two stand apart by 0.15 of their size and between its lines. Text inside a form XObject (an included figure) is
// `inkfigures`, the rest `inkorphan` (the ink kinds of today's bundle, FORMAT.md §2).
import type { Piece } from '@readarxiv/format'
import type { Mapping } from '../align/align.ts'
import type { Doc, DocGlyph } from '../doc.ts'
import { cutLines } from './lines.ts'
import type { Owned } from './ownership.ts'

const BLOCK_DY = 1.75
const SPACE_GAP = 0.15

export interface Born {
  kind: 'inkfigures' | 'inkorphan'
  content: Piece[]
  /** its glyphs on A (global), stream order */
  glyphs: number[]
}

export function bornOf(
  inkA: Doc,
  m: Mapping,
  owned: Pick<Owned, 'free'>,
  pageA: Int32Array,
  setA: readonly boolean[],
): Born[] {
  const NA = pageA.length
  const gA = (a: number): DocGlyph => {
    const p = (pageA[a] as number) - 1
    return inkA.pages[p]!.glyphs[a - (m.offA[p] as number)]!
  }
  const free: number[] = []
  for (let a = 0; a < NA; a++)
    if (
      (m.aToB[a] as number) < 0 &&
      !setA[(pageA[a] as number) - 1] &&
      owned.free(a) &&
      !m.offpageA[a] &&
      /\S/.test(gA(a).u)
    )
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
