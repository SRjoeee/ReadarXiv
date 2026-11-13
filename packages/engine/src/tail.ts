// The `startxref` of a PDF read from its bytes (where an incremental update over it names its `/Prev`: the delta's section over
// arXiv's PDF, layout/delta.mjs; the wrap's over our final pass, layout/wrap.mjs), and PDF's bound on an object number. The
// text-removed PDF's add-on tails this module first read are gone (docs/route/ocg-erasure.md §4.2). Also the engine's one
// reading of bytes as latin-1 (latin1: the cross-reference reader's, the delta's wire's and the remover's). Imports nothing.
/** the bytes at the end of a PDF that are looked at for its `startxref` */
const STARTXREF_WINDOW = 1024

/** bytes as a string, one character a byte (ISO 8859-1, which TextDecoder's 'latin1', windows-1252, is not), in slices that
 *  fit an argument list. (A slice's end past the bytes needs no Math.min: subarray clamps its end to the length.) (Reflect.apply,
 *  which TypeScript lets take a typed array, not a spread, which it also does: the spread read 10 MB 6 times slower, 160 ms
 *  against 27 on Node 22) */
export function latin1(b: Uint8Array): string {
  let s = ''
  for (let i = 0; i < b.length; i += 8192) {
    const part: string = Reflect.apply(String.fromCharCode, null, b.subarray(i, i + 8192))
    s += part
  }
  return s
}

/**
 * The `startxref` of a PDF: in the last 1024 bytes, the number before the final `%%EOF`, else the number after the last
 * `startxref`. null where there is none
 */
export function startxrefOf(pdf: Uint8Array): number | null {
  const text = latin1(pdf.subarray(Math.max(0, pdf.length - STARTXREF_WINDOW)))
  const last =
    /startxref\s+(\d+)\s+%%EOF\s*$/.exec(text)?.[1] ??
    /startxref\s+(\d+)/.exec(text.slice(text.lastIndexOf('startxref')))?.[1]
  const n = Number(last)
  return last !== undefined && Number.isSafeInteger(n) ? n : null
}

/** an object number at most (ISO 32000-1, annex C: 8,388,607) */
export const OBJECT_MAX: number = 8_388_607
