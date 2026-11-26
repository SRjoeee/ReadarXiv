// The PDF download (the translation's and the side-by-side's files, made in the page from what the reader holds): the
// export's lazily loaded entry (`loadExport` in the package's entry), so that none of it, nor the engine's object layer it
// reads with, is in the reader's first load. Its parts: the chain (chain.ts), the bake on the engine's walk (bake.ts), the
// served slices made the file's fonts (woff2.ts, decoded by the reader's own PDF.js: brotli.ts; fonts.ts; cff.ts, the subset).
import { brotliByPdfJs } from './brotli.ts'
import { readSfnt, type SfntFont } from './fonts.ts'
import { sfntOfWoff2, woff2Payload } from './woff2.ts'

export type { BakeStats } from './bake.ts'
export { brotliByPdfJs, type PdfJsLike } from './brotli.ts'
export { exportPdf, type ExportForm, type ExportInput, type ExportStats, type Glyphs } from './chain.ts'
export { readSfnt, type SfntFont } from './fonts.ts'

/** served slices (each its key and its WOFF2) made fonts, every brotli stream decoded in one call of `decode` (the reader's
 *  PDF.js: brotliByPdfJs); a slice that is no CFF-flavoured font with no transformed table is null (its glyphs not drawn) */
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
    out.set(s.key, p ? readSfnt(s.key, sfntOfWoff2(p, decoded[k++]!)) : null)
  })
  return out
}

/** the same, decoded by `pdfjs` */
export const fontsByPdfJs = (
  slices: readonly { key: string; woff2: Uint8Array }[],
  pdfjs: Parameters<typeof brotliByPdfJs>[0],
) => fontsOfSlices(slices, brotliByPdfJs(pdfjs))
