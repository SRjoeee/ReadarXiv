// The PDF download (the translation's and the side-by-side's files, made in the page from what the reader holds): the
// export's lazily loaded entry (`loadExport` in the package's entry), so that none of it, nor the engine's object layer it
// reads with, is in the reader's first load. Its parts: the chain (chain.ts), the bake on the engine's walk (bake.ts), the
// served slices made the file's fonts (woff2.ts, decoded by the reader's own PDF.js: brotli.ts; fonts.ts; cff.ts, the subset).
import { brotliByPdfJs } from './brotli.ts'
import { readSfnt, type SfntFont } from './fonts.ts'
import { sfntOfWoff2, woff2Payload } from './woff2.ts'

export type { BakeStats } from './bake.ts'
export { brotliByPdfJs, type PdfJsLike } from './brotli.ts'
export { ExportRefusal, exportPdf, type ExportForm, type ExportInput, type ExportStats, type Glyphs } from './chain.ts'
export { readSfnt, type SfntFont } from './fonts.ts'
export { canvasMeasure, type Measure, offsetsOf } from './measure.ts'

/** served slices (each its key and its file) made fonts, every brotli stream decoded in one call of `decode` (the reader's
 *  PDF.js: brotliByPdfJs). A slice is WOFF2 as our site serves it, or an sfnt as it stands (a host's own stand-in: the e2e's);
 *  one that is neither, or whose outlines cannot be read, is null (its glyphs not drawn: the export refuses the file) */
export async function fontsOfSlices(
  slices: readonly { key: string; woff2: Uint8Array }[],
  decode: (streams: Uint8Array[]) => Promise<Uint8Array[]>,
): Promise<Map<string, SfntFont | null>> {
  const payloads = slices.map((s) => woff2Payload(s.woff2))
  const decoded = await decode(payloads.filter((p) => p !== null).map((p) => p.stream))
  const out = new Map<string, SfntFont | null>()
  let k = 0
  slices.forEach((s, i) => {
    const p = payloads[i]
    if (p) out.set(s.key, readSfnt(s.key, sfntOfWoff2(p, decoded[k++]!)))
    else out.set(s.key, isSfnt(s.woff2) ? readSfnt(s.key, s.woff2) : null)
  })
  return out
}
/** an sfnt's own first four bytes: TrueType's 1.0, 'true', or CFF's 'OTTO' */
const isSfnt = (b: Uint8Array) => {
  const tag = b.length >= 4 ? ((b[0]! << 24) | (b[1]! << 16) | (b[2]! << 8) | b[3]!) >>> 0 : 0
  return tag === 0x00010000 || tag === 0x74727565 || tag === 0x4f54544f
}

/** the same, decoded by `pdfjs` */
export const fontsByPdfJs = (
  slices: readonly { key: string; woff2: Uint8Array }[],
  pdfjs: Parameters<typeof brotliByPdfJs>[0],
) => fontsOfSlices(slices, brotliByPdfJs(pdfjs))
