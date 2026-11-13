// The `startxref` of a PDF read from its bytes (where an incremental update over it names its `/Prev`: the delta's section over
// arXiv's PDF, layout/delta.mjs; the wrap's over our final pass, layout/wrap.mjs), and PDF's bound on an object number. The
// text-removed PDF's add-on tails this module first read are gone (docs/route/ocg-erasure.md §4.2). Imports only the engine's one
// reading of bytes as latin-1 (bounded-reads.ts, a leaf).
import { latin1 } from './bounded-reads.ts'

/** the bytes at the end of a PDF that are looked at for its `startxref` */
const STARTXREF_WINDOW = 1024

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
