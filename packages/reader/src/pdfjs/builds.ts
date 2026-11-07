// Which of PDF.js's builds a browser runs (interfaces/host design-a §3: "PDF.js's build choice" carried into the reader; the
// website's pdfjs.ts `buildFor`, the extension's support.ts `readerRuns`): the modern build where every built-in it calls
// unguarded is there, else the legacy build down to its own floor, else none. The reader loads the modern build by default;
// a host that serves older browsers hands it the legacy one (openReader's `pdfjs`, `@readarxiv/reader/pdfjs-legacy`), by
// these checks or by a rule of its own: the choice is the host's.

/** PDF.js 6.3.289's modern build calls these built-ins without a guard and carries no polyfill (a scan of its three modules for
 *  built-ins newer than Chrome 131, which has none of them: measured 2026-09-25); an upgrade of PDF.js scans them again */
export function modernRuns(g: typeof globalThis = globalThis): boolean {
  const u8 = g.Uint8Array as unknown as { fromBase64?: unknown; prototype: { toBase64?: unknown; toHex?: unknown } }
  return [
    (g.Map?.prototype as { getOrInsertComputed?: unknown } | undefined)?.getOrInsertComputed,
    (g.Math as { sumPrecise?: unknown } | undefined)?.sumPrecise,
    u8?.fromBase64,
    u8?.prototype.toBase64,
    u8?.prototype.toHex,
    (g.RegExp as { escape?: unknown } | undefined)?.escape,
    (g as { Float16Array?: unknown }).Float16Array,
  ].every((f) => typeof f === 'function')
}

/** the legacy build's floor (the website's ruling P3-R2, amended): the two built-ins PDF.js calls unguarded and does not
 *  polyfill, Promise.withResolvers (Chrome 119, Safari 17.4, Firefox 121) and AbortSignal.any (Chrome 116, Safari 17.4,
 *  Firefox 124); and Intl.Segmenter (Chrome 87, Safari 14.1, Firefox 125), which the reader's sentences and line breaker
 *  construct (@readarxiv/text, @readarxiv/typeset). No polyfill: a browser below it is told so by its host */
export function legacyRuns(g: typeof globalThis = globalThis): boolean {
  return (
    typeof (g.Promise as { withResolvers?: unknown } | undefined)?.withResolvers === 'function' &&
    typeof (g.AbortSignal as { any?: unknown } | undefined)?.any === 'function' &&
    typeof (g.Intl as { Segmenter?: unknown } | undefined)?.Segmenter === 'function'
  )
}

/** the build a browser runs: none below the legacy floor, else the modern where it runs, else the legacy. The floor is read
 *  first, so that no build is chosen on a list of built-ins that leaves out one the other needs */
export function buildFor(g: typeof globalThis = globalThis): 'modern' | 'legacy' | null {
  if (!legacyRuns(g)) return null
  return modernRuns(g) ? 'modern' : 'legacy'
}
