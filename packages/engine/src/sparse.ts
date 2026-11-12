// B, the marked compile's PDF, stored without the pixels of its images (the performance design's Q3, 2026-11-13). The
// instrument keeps B so that a later prepare need not run TeX again, and every reading of B is PDF.js's worker guarded so that
// no image's pixels are decoded (src/pdf-reader/engine/layout/pdf-lite.mjs; the box's own): an image XObject gives the operator
// list its paint operator, its id, width and height, from its dictionary alone, and its data is read only by the decode the
// guard stops (PDF.js 6.3.289's buildPaintImageXObject, after the operator is added). So the data of those streams is bytes
// nothing reads, and on an image-heavy paper it is nearly all of B (2610.37818v1: 31.43 of 32.23 MB in 412 streams).
//
// `holesOf(bytes, { PL })` gives the byte range of the data of every indirect stream whose dictionary says `/Subtype /Image`
// and is no stencil mask, found by the cross-reference sections and each stream's resolved /Length (xref.mjs openObjects:
// every object read where its entry says), never by a scan. A stencil mask (`/IM` or `/ImageMask` true, PDF.js reading `/IM`
// first, either indirect) is decoded into the operator list itself (a Type 3 glyph's paths, a one-pixel mask's operator, the
// mask's bits): it stays, as does any image whose mask flag is not plainly absent or false. A soft mask is an image of its own
// and goes; PDF.js reads it only in the decode the guard stops. A document `openObjects` refuses, or one where two images'
// data overlap or an object or the cross-reference stands inside one's, has no holes: it is stored whole (`why` says why).
// `pack(bytes, holes)` gives a header, then the bytes outside the holes in order: the magic (PACKED_MAGIC, eight ASCII
// bytes), the size and the number of holes, then each hole's start and length, every number an unsigned 32-bit big-endian
// integer. `unpack(packed)` gives the bytes back with zeros in the holes, and refuses what pack did not make (a PDF stored
// whole before, a header cut short, holes the size does not hold, a byte too many or too few).
//
// What zeros change in PDF.js's reading (read in the worker, held by tests/pdf-reader/sparse.test.ts on an image, a PNG, a soft
// mask, a JPX and a DCT image, stencil masks and a Type 3 glyph's): at fetch, a Flate stream of zeros fails its header and is
// read as an empty stream, its dictionary kept on it; a JPX image's header fails in PDFImage, which the guard's own failure
// would have stopped a step later, in the same `.catch` (a null image). Their warnings are none of the recoveries the engine
// counts (warnings.ts siteOf). The operator lists, the glyph lists, the masks, the text and the recoveries are the same, bit
// for bit. A reading that one day wants B's pixels takes A's: B is the page as TeX set it, never what a reader is shown.
//
// An original module (no port statement); @cantoo/pdf-lib (MIT) is given, as to the wrap and the delta.
import { DELTA_OBJECTS_MAX } from './delta-wire.types.ts'
import { isMemoryError } from './memory.types.ts'
import type { PdfLib } from './remove.types.ts'
import { openObjects, XrefRefusal } from './xref.types.ts'

/** the byte range of one image's data in B: [start, length] */
export type Hole = readonly [start: number, length: number]
/** B's holes, rising and apart; none and `why` for a document stored whole */
export interface Holes {
  holes: Hole[]
  why: string | null
}

/** the most objects, and the most bytes its object and cross-reference streams decode to, holesOf reads of a document: the
 *  wrap's own bounds (wrap.mjs graphWhy). Past either, B is stored whole */
export const SPARSE_OBJECTS_MAX = DELTA_OBJECTS_MAX
export const SPARSE_DECODED_MAX = 48 * 2 ** 20
/** the first eight bytes of a packed B */
export const PACKED_MAGIC = 'sparse/1'
const MAGIC = new TextEncoder().encode(PACKED_MAGIC)
const HEAD = 16
const U32 = 2 ** 32 - 1

/**
 * The holes of `bytes`, a PDF: the data of every image XObject that is no stencil mask, rising, as the cross-reference names
 * them. `PL` @cantoo/pdf-lib's exports; `objectsMax` and `decodedMax` openObjects' bounds. Never throws but a failed
 * allocation: a document it will not read has no holes, and `why`
 */
export function holesOf(
  bytes: Uint8Array,
  {
    PL,
    objectsMax = SPARSE_OBJECTS_MAX,
    decodedMax = SPARSE_DECODED_MAX,
  }: { PL: PdfLib; objectsMax?: number; decodedMax?: number },
): Holes {
  const { PDFRef, PDFRawStream, PDFName, PDFBool } = PL
  const N = (name: string) => PDFName.of(name)
  try {
    const X = openObjects(bytes, { PL, objectsMax, decodedMax })
    const look = (v: unknown) => (v instanceof PDFRef ? X.lookup(v) : v)
    /** PDF.js's own test of an image the operator list does not decode: `/Subtype /Image`, and `dict.get("IM", "ImageMask")`
     *  absent or false (anything else is kept, which costs bytes, never a reading) */
    const isPixels = (dict: { get(k: unknown): unknown }) => {
      if (look(dict.get(N('Subtype'))) !== N('Image')) return false
      const im = dict.get(N('IM'))
      const mask = look(im !== undefined ? im : dict.get(N('ImageMask')))
      return mask === undefined || mask === PDFBool.False
    }
    const holes: [number, number][] = []
    const starts: [number, number][] = []
    for (const n of X.numbers()) {
      const e = X.entryOf(n)
      if (e === null || e.t === 0) continue
      // (every object read where its entry says, so that a document PDF.js would read some other way is refused)
      const ref = PDFRef.of(n, e.g)
      const value = X.lookup(ref)
      if (e.t !== 1) continue
      starts.push([e.off, n])
      if (!(value instanceof PDFRawStream) || !isPixels((value as { dict: { get(k: unknown): unknown } }).dict))
        continue
      const at = X.dataAt(ref)
      if (at !== null && at[1] > 0) holes.push([at[0], at[1]])
    }
    holes.sort((a, b) => a[0] - b[0])
    for (let i = 1; i < holes.length; i++) {
      const [s, l] = holes[i - 1]!
      if (holes[i]![0] < s + l) return { holes: [], why: "two images' data overlap" }
    }
    // (every object's header and the newest cross-reference outside every hole, the two lists walked together)
    starts.push([X.startxref, -1])
    starts.sort((a, b) => a[0] - b[0])
    let h = 0
    for (const [off, n] of starts) {
      while (h < holes.length && holes[h]![0] + holes[h]![1] <= off) h++
      if (h < holes.length && off >= holes[h]![0]) {
        return {
          holes: [],
          why:
            n < 0 ? "the cross-reference stands inside an image's data" : `object ${n} stands inside an image's data`,
        }
      }
    }
    return { holes, why: null }
  } catch (e) {
    if (isMemoryError(e)) throw e
    return {
      holes: [],
      why: e instanceof XrefRefusal ? e.message : `it could not be read: ${String((e as Error)?.message ?? e)}`,
    }
  }
}

/** why `holes` are not holes `pack` may cut from `size` bytes, or null: whole numbers, each at least a byte, rising and apart
 *  (touching is apart), within the size */
function holesWhy(holes: Iterable<Hole>, size: number): string | null {
  let at = 0
  for (const [s, l] of holes) {
    if (!Number.isSafeInteger(s) || !Number.isSafeInteger(l) || l < 1)
      return `a hole [${s}, ${l}] that is no range of bytes`
    if (s < at) return `a hole at ${s} before the end of the one before it (${at})`
    if (s + l > size) return `a hole [${s}, ${l}] past the end (${size})`
    at = s + l
  }
  return null
}

/** `bytes` less its `holes` (holesOf's), behind a header that says the size and the holes. Throws a RangeError for holes that
 *  are not rising and apart within the bytes, or a document past 4 GiB */
export function pack(bytes: Uint8Array, holes: readonly Hole[]): Uint8Array {
  if (bytes.length > U32) throw new RangeError(`a document of ${bytes.length} bytes: a pack holds at most ${U32}`)
  const why = holesWhy(holes, bytes.length)
  if (why !== null) throw new RangeError(why)
  let cut = 0
  for (const [, l] of holes) cut += l
  const kept = HEAD + 8 * holes.length
  const out = new Uint8Array(kept + bytes.length - cut)
  const v = new DataView(out.buffer)
  out.set(MAGIC, 0)
  v.setUint32(8, bytes.length)
  v.setUint32(12, holes.length)
  let w = kept
  let from = 0
  holes.forEach(([s, l], i) => {
    v.setUint32(HEAD + 8 * i, s)
    v.setUint32(HEAD + 8 * i + 4, l)
    out.set(bytes.subarray(from, s), w)
    w += s - from
    from = s + l
  })
  out.set(bytes.subarray(from), w)
  return out
}

/** the bytes `pack` was given, zeros in their holes. Throws a TypeError for anything pack did not make */
export function unpack(packed: Uint8Array): Uint8Array {
  const not = (why: string) => new TypeError(`not a packed B: ${why}`)
  if (packed.length < HEAD || MAGIC.some((c, i) => packed[i] !== c)) throw not(`no ${PACKED_MAGIC} header`)
  const v = new DataView(packed.buffer, packed.byteOffset, packed.byteLength)
  const size = v.getUint32(8)
  const n = v.getUint32(12)
  const kept = HEAD + 8 * n
  if (kept > packed.length) throw not(`a header of ${n} holes cut short`)
  const holes: Hole[] = []
  let cut = 0
  for (let i = 0; i < n; i++) {
    const h: Hole = [v.getUint32(HEAD + 8 * i), v.getUint32(HEAD + 8 * i + 4)]
    holes.push(h)
    cut += h[1]
  }
  const why = holesWhy(holes, size)
  if (why !== null) throw not(why)
  if (packed.length - kept !== size - cut)
    throw not(`${packed.length - kept} bytes kept where its header says ${size - cut}`)
  const out = new Uint8Array(size)
  let r = kept
  let from = 0
  for (const [s, l] of holes) {
    out.set(packed.subarray(r, r + s - from), from)
    r += s - from
    from = s + l
  }
  out.set(packed.subarray(r), from)
  return out
}
