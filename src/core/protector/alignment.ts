// Sentence alignment in wire coordinates (issue #105, DESIGN §8.6): which sentence of the translation is which sentence
// of the source, as the sentence lengths of the wire sent and of the wire filled back, entry i of each one pair. A
// translator states its sentences as offsets of plain text, and only where they reconstruct both texts
// (@readarxiv/translate `validSentences`); the shim beside the protector turns them into these lengths (units.ts), and the
// renderer's sentence map pairs them. No alignment is only no highlight: the block lights whole.

/** Sentence lengths in **wire-text coordinates**, in order: `source` of the text sent, `target` of the text filled back */
export interface SentenceAlignment {
  source: number[]
  target: number[]
}

export interface SentencePair {
  index: number
  source: { from: number; to: number }
  target: { from: number; to: number }
}

/** Cumulative boundaries of a length list: `[0, l0, l0+l1, …, total]` */
export function boundariesOf(lengths: readonly number[]): number[] {
  const out = [0]
  let at = 0
  for (const len of lengths) {
    at += len
    out.push(at)
  }
  return out
}

/** An alignment as per-sentence intervals */
export function sentencePairs(alignment: SentenceAlignment): SentencePair[] {
  const src = boundariesOf(alignment.source)
  const tgt = boundariesOf(alignment.target)
  return alignment.source.map((_, i) => ({
    index: i,
    source: { from: src[i] as number, to: src[i + 1] as number },
    target: { from: tgt[i] as number, to: tgt[i + 1] as number },
  }))
}
