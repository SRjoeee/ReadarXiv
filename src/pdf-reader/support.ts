// Whether this browser can run the reader. PDF.js 6.3.289's modern build (pdfjs.ts) calls built-ins newer than the
// extension's floor without a guard and carries no polyfills: Chrome 131 has none of them (measured 2026-09-25, the
// final review of the reader's Part 1), and there the session throws as its first viewer is made. Where they are
// missing, the reader is not offered and arXiv's PDF stays in the browser's viewer; the modern build is kept for every
// browser that has them. The list is a scan of PDF.js's three modules for built-ins newer than Chrome 131: an upgrade of
// PDF.js scans them again
export function readerRuns(g: typeof globalThis = globalThis): boolean {
  const u8 = g.Uint8Array as unknown as { fromBase64?: unknown; prototype: { toBase64?: unknown; toHex?: unknown } }
  return [
    (g.Map.prototype as { getOrInsertComputed?: unknown }).getOrInsertComputed,
    (g.Math as { sumPrecise?: unknown }).sumPrecise,
    u8.fromBase64,
    u8.prototype.toBase64,
    u8.prototype.toHex,
    (g.RegExp as { escape?: unknown }).escape,
    (g as { Float16Array?: unknown }).Float16Array,
  ].every(f => typeof f === 'function')
}
