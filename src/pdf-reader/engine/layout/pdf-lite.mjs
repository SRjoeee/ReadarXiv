// PDF.js's worker without the images' pixels, for the server-side reads of arXiv's PDF (the layout maker's ink read, the marks
// read, the add-on's plans): they want each image's PLACEMENT, which is its paint operator under the current transform, and never
// its pixels.
//
// WHY. PDF.js decodes every image of a page in the background after `getOperatorList` has answered: in the worker's
// buildPaintImageXObject the operator is added to the list first, and then `PDFImage.buildImage(...).then(imageObj =>
// imageObj.createImageData(...))` is started and not awaited, so a decode runs on past `page.cleanup()` and `destroy()`. On an
// image-heavy paper (2608.16117) that is 1.5 GB of ArrayBuffers in 40 pages; under RLIMIT_DATA the decodes fail silently and the
// process's own allocations can fail beside them (a memory refusal that depends on timing). There is no stock option that keeps the
// operator and skips the decode: `maxImageSize` returns before `addImageOps`, so it drops the operator and with it the placement,
// which cannot be told afterwards from the bare transform it leaves; the `oplist` intent only turns the queue optimizer off.
//
// WHAT. `liteWorkerSource(source)` takes the text of `pdfjs-dist/legacy/build/pdf.worker.mjs` (the host reads it; this module
// imports nothing) and returns it with one guard added before that single `createImageData` call: a document opened with
// `maxImageSize: NO_IMAGE_PIXELS` throws there, which the evaluator's own `.catch` turns into a null image (a few bytes) and a
// recorded decode failure. The operator list is the same, bit for bit (spikes and tests/pdf-reader/pdf-lite.test.ts hold it). The
// opt-in is per document: Number.MAX_SAFE_INTEGER is "no image is larger than this" to a stock worker, and the patched worker
// applies the guard to a document that passes it and to no other, so a document opened without it in the same process decodes as
// ever. Masks and small inline images are decoded and awaited inside the operator list's own stream; they are not touched.
//
// HOW A HOST USES IT (Node: PDF.js runs its worker on the main thread, taking `globalThis.pdfjsWorker` when one is set):
//   const source = readFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'), 'utf8')
//   globalThis.pdfjsWorker = await import(`data:text/javascript;base64,${Buffer.from(liteWorkerSource(source, { version })).toString('base64')}`)
//   const doc = await getDocument({ data, maxImageSize: NO_IMAGE_PIXELS, ... }).promise
// once, before the first getDocument. Server-side only: the browser layer (the extension, removal.mjs's rendering, copyOf) keeps stock
// PDF.js, which has to decode the images it draws.
//
// BUMPING PDFJS (layout versions.mjs): the anchor is one line of the worker. Install the new version, run
// tests/pdf-reader/pdf-lite.test.ts: it counts the anchor in the installed worker and compares an operator list's digest with and
// without the guard. If the line moved, read buildPaintImageXObject again (is the decode still unawaited, and is `this.options` still
// the evaluator's?), change ANCHOR and GUARD together, and set LITE_PDFJS. Nothing else in the engine knows of the patch.
//
// An original module (no port statement). PDF.js is Apache-2.0 (Mozilla); the host patches a copy of it in memory at run time and
// ships none.

/** the PDF.js this patch was made for */
export const LITE_PDFJS = '6.3.289'
/** `maxImageSize` for a document that is to be read without its images' pixels (a stock worker takes it as "no limit") */
export const NO_IMAGE_PIXELS = Number.MAX_SAFE_INTEGER

/** the one line of buildPaintImageXObject that decodes an image's pixels, in the callback of the unawaited buildImage */
const ANCHOR = 'imgData = await imageObj.createImageData(false, isOffscreenCanvasSupported);'
const GUARD = `if (this.options.maxImageSize === ${NO_IMAGE_PIXELS}) throw new Error("image pixels not decoded");\n      `

/**
 * The worker module's text with the guard before its image decode. `version`, where given, is the PDF.js the text is of (the
 * host's package.json) and must be LITE_PDFJS. Throws unless the anchor stands exactly once.
 */
export function liteWorkerSource(source, { version } = {}) {
  if (typeof source !== 'string') throw new TypeError('source: the text of pdf.worker.mjs')
  if (version !== undefined && version !== LITE_PDFJS) throw new RangeError(`the image guard was made for PDF.js ${LITE_PDFJS}, not ${version}: check buildPaintImageXObject again (pdf-lite.mjs)`)
  const parts = source.split(ANCHOR)
  if (parts.length !== 2) throw new RangeError(`the worker holds the image decode ${parts.length - 1} times, not once: PDF.js changed, check buildPaintImageXObject again (pdf-lite.mjs)`)
  return `${parts[0]}${GUARD}${ANCHOR}${parts[1]}`
}
