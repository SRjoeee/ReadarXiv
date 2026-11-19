// The units born on arXiv's page: text of A that B never printed (no partner on B) on a page our compile never makes (a second
// top-level file arXiv compiles and we do not: align.ts setPagesOf), that no located unit claimed and that the ink makers run on A
// (ink.ts: the ink units, kept blocks and figure texts) make no unit of. On a page our compile sets, a glyph it never printed is
// arXiv's ink (PDF-READER §18.27), no unit's: none is born there. Nor is one shown inside a form XObject (an included figure),
// on any page: text drawn in a figure is the figure reading's (figure-text.ts; the ink makers leave it a line most of whose
// glyphs a form shows, the ledger's class `figures`), and what it makes no unit of (a number, a tick's label, a letter alone,
// a formula's) stays the original's ink, nobody's to translate or to draw (§18.102). The one heuristic part of locate,
// kept in a file of its own so that it can be replaced (OCR lines will take this shape): A's unclaimed glyphs in stream
// order (those no unit holds: the ownership's `free`) cut into lines by the line rule (lines.ts), and consecutive lines of one page gathered into a block where the next one
// stands under the one before within 1.75 of its size and overlaps it across; a block's text is its glyphs' Unicode, a space
// where two stand apart by 0.15 of their size and between its lines. Every unit born is `inkorphan` (the bundle's ink kinds:
// format's Kind).
import type { Piece } from '@readarxiv/format'
import type { Mapping } from '../align/align.ts'
import type { Doc, DocGlyph } from '../doc.ts'
import { cutLines } from './lines.ts'
import type { Owned } from './ownership.ts'

const BLOCK_DY = 1.75
const SPACE_GAP = 0.15

/** the kind of every unit born (format's Kind) */
export const BORN_KIND = 'inkorphan'

interface Born {
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
      !gA(a).form &&
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
      l.x1 > prev.x0
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
    return { content: [{ t: 'text', s: s.normalize('NFKC') }], glyphs: b.flatMap((l) => l.gs) }
  })
}
