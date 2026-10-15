import type { Anchor } from '@/pdf-reader/engine/pipeline/anchors.mjs'

// What a unit's left parts hold of its anchor, cut at page starts, written from design §3 as an oracle apart from the producer:
// `starts` the global index of each page's first token (rising, the first 0), `total` the document's tokens. A page's entry is
// the unit's tokens in [first, first + n) as page-local ranges [first, count, …], and its runs [word, token, count] clipped to the
// page (the token page-local), a run cut at the page end; a page the unit has no token on has no entry

export interface StartPiece { first: number; ranges: number[]; runs?: number[] }

export function piecesOf(a: Anchor, runs: Int32Array | null, starts: readonly number[], total: number): StartPiece[] {
  const out: StartPiece[] = []
  for (let p = 0; p < starts.length; p++) {
    const first = starts[p]!, end = p + 1 < starts.length ? starts[p + 1]! : total
    const ranges: number[] = []
    for (const t of a.tokens) {
      if (t < first || t >= end) continue
      const last = ranges.length - 2
      if (ranges.length && ranges[last]! + ranges[last + 1]! === t - first) ranges[last + 1]!++
      else ranges.push(t - first, 1)
    }
    if (!ranges.length) continue
    const piece: StartPiece = { first, ranges }
    if (runs) {
      const clipped: number[] = []
      for (let j = 0; j < runs.length; j += 3) {
        const w = runs[j]!, t = runs[j + 1]!, c = runs[j + 2]!
        const t2 = Math.max(t, first), w2 = w + t2 - t, c2 = Math.min(t + c, end) - t2
        if (c2 >= 1) clipped.push(w2, t2 - first, c2)
      }
      if (clipped.length) piece.runs = clipped
    }
    out.push(piece)
  }
  return out
}
