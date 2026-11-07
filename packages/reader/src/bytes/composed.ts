// The composed document's bytes (design §4.5, interfaces/page DECISION from C, 2): arXiv's bytes followed by the add-on's,
// both by ranges. The add-on is an incremental update over the original (its xref's /Prev the original's startxref), so the
// composed file is the two objects one after the other: a range that spans the seam is split there, its first part read of
// the original's source (the same source, and so the same chunks, the left's document reads), its rest of the add-on's.
import { type Bound, type ByteSource, RangeRefusal } from './source.ts'

export interface ComposedSource extends ByteSource {
  /** the original's length: where the add-on begins */
  readonly seam: number
  readonly bound: Bound
}

/** bytes [begin, end) of `original` (`seam` bytes) followed by `addOn` (`addOnBytes` bytes) */
export function composedSource(
  original: ByteSource,
  seam: number,
  addOn: ByteSource,
  addOnBytes: number,
): ComposedSource {
  const total = seam + addOnBytes
  let gone: RangeRefusal | null = null
  return {
    seam,
    get bound(): Bound {
      return { total, etag: null }
    },
    get refusal() {
      return original.refusal ?? addOn.refusal
    },
    abort() {
      // (the original's source is the reader's, shared with the left: only the add-on's goes with the composed document)
      gone = new RangeRefusal('gone', 'let go')
      addOn.abort()
    },
    async read(begin, end) {
      if (gone) throw gone
      if (begin < 0 || end <= begin || end > total)
        throw new RangeRefusal('bytes', `no range of the composed document: ${begin} to ${end}`)
      if (end <= seam) return original.read(begin, end)
      if (begin >= seam) return addOn.read(begin - seam, end - seam)
      const [a, b] = await Promise.all([original.read(begin, seam), addOn.read(0, end - seam)])
      const out = new Uint8Array(end - begin)
      out.set(a, 0)
      out.set(b, seam - begin)
      return out
    },
  }
}
