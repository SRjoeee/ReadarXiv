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
// The same document's Link annotations (getAnnotations) come without their overlaid text: PDF.js makes it by extracting the page's
// whole text a second time for every page that holds a link (through its Intersector, which reads the glyphs as that extraction
// sets them); the marks read and the layout maker never read it (they find the glyphs under a link themselves: layer-proto/links.mjs
// annotsOf), and a second guard skips that extraction for a document that opts in. The draw geometry (pipeline/draw-data.mjs)
// ships it, as the browser's own reading has it: a document read for its draw opts in with `maxImageSize: LINK_TEXT_PIXELS`
// instead, the image guard on and the text guard off (its pages' annotations, read once for the draw and the maker, keep their
// overlaid text exactly as a stock worker makes it). The one extraction cannot be shared with the page's getTextContent: through an
// Intersector PDF.js builds no item's string, and its whitespace reads an item's string's length.
//
// HOW A HOST USES IT (Node: PDF.js runs its worker on the main thread, taking `globalThis.pdfjsWorker` when one is set):
//   const source = readFileSync(require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'), 'utf8')
//   globalThis.pdfjsWorker = await import(`data:text/javascript;base64,${Buffer.from(liteWorkerSource(source, { version })).toString('base64')}`)
//   const doc = await getDocument({ data, maxImageSize: NO_IMAGE_PIXELS, ... }).promise
// once, before the first getDocument. A document whose pages' draw geometry is read (pipeline/draw-data.mjs) is opened with
// `maxImageSize: LINK_TEXT_PIXELS` and `fontExtraProperties: true`: without the latter a font carries no ToUnicode map and every page
// tells its draw as none (`why: 'props'`).
// A third opt-in, `maxImageSize: OCR_IMAGE_PIXELS`, decodes an image of OCR_PIXELS_MAX pixels at most and refuses one larger the
// same way (the bitmap figures' pass, pipeline/ocr-pass.mjs: `w` and `h` are buildPaintImageXObject's own, its image's /Width and
// /Height, in scope at the anchor), and decodes a page's images up to OCR_PAGE_PIXELS_MAX pixels in all, in the order the page
// paints them (PDF.js decodes every image of a page as it builds the page's operator list, before any is read): the sum is kept on
// the page's evaluator (one a getOperatorList, its forms' images among its own) at SYNC_ANCHOR, which buildPaintImageXObject
// reaches in the operators' order before its unawaited decode, so that which image is past the page's sum is the same every run.
// Server-side only: the browser layer (the extension, run.mjs's rendering, copyOf) keeps stock
// PDF.js, which has to decode the images it draws.
//
// BUMPING PDFJS (layout versions.mjs): the anchor is one line of the worker. Install the new version, run
// tests/pdf-reader/pdf-lite.test.ts: it counts the anchor in the installed worker and compares an operator list's digest with and
// without the guard. If the line moved, read buildPaintImageXObject again (is the decode still unawaited, and is `this.options` still
// the evaluator's?), change ANCHOR and GUARD (TEXT_ANCHOR and TEXT_GUARD: read Page.getAnnotationsData again) together, and set LITE_PDFJS. Nothing else in the engine knows of the patch.
//
// An original module (no port statement). PDF.js is Apache-2.0 (Mozilla); the host patches a copy of it in memory at run time and
// ships none.

/** the PDF.js this patch was made for */
export const LITE_PDFJS = '6.3.289'
/** `maxImageSize` for a document that is to be read without its images' pixels (a stock worker takes it as "no limit") */
export const NO_IMAGE_PIXELS = Number.MAX_SAFE_INTEGER
/** `maxImageSize` for a document read without its images' pixels whose Link annotations keep their overlaid text (the draw's); "no
 *  limit" to a stock worker too */
export const LINK_TEXT_PIXELS = Number.MAX_SAFE_INTEGER - 1

/** `maxImageSize` for a document read for its images' pixels up to OCR_PIXELS_MAX each (the bitmap figures' recogniser:
 *  pipeline/ocr-pass.mjs): an image past it keeps its paint operator and gets no pixels, so that it is counted as past the cap
 *  (`big`) rather than lost with its placement as a stock worker's `maxImageSize` drops it; "no limit" to a stock worker */
export const OCR_IMAGE_PIXELS = Number.MAX_SAFE_INTEGER - 2
/** the pixels an image may have to be decoded for the recogniser (PDF-READER §19.15, Bounds: the box's memory) */
export const OCR_PIXELS_MAX = 16_000_000
/** the pixels a page's images may have in all to be decoded for the recogniser: past them its later images get none (`big`).
 *  The box's pass holds some 46 to 50 bytes a pixel of the page it reads (2026-10-29, natively, 2610.16663v1: a page of 20.6
 *  million pixels 950 MiB over the pass at rest, one of 30.3 million 1,500; in the box, 2610.19274v1's page of 14.7 million its
 *  OCR child's data size 1,364 MiB of its 1,472), so that 16 million keeps its peak within 70 % of the child's limit (the web's
 *  budget.ts rule); 64 million let a page of 55.5 take the child past its limit, and every label of the paper with it */
export const OCR_PAGE_PIXELS_MAX = 16_000_000

/** the one line of buildPaintImageXObject that decodes an image's pixels, in the callback of the unawaited buildImage */
const ANCHOR = 'imgData = await imageObj.createImageData(false, isOffscreenCanvasSupported);'
const GUARD = `if (this.options.maxImageSize >= ${LINK_TEXT_PIXELS} || axtOcrOver) throw new Error("image pixels not decoded");\n      `
/** the call of buildPaintImageXObject that starts the decode, reached in the operators' order: the page's sum kept before it */
const SYNC_ANCHOR = '    PDFImage.buildImage({\n      xref: this.xref,'
const syncGuard = (image, page) => `    const axtOcrOver = this.options.maxImageSize === ${OCR_IMAGE_PIXELS} && (w * h > ${image} || (this.axtOcrPixels ?? 0) + w * h > ${page} || ((this.axtOcrPixels = (this.axtOcrPixels ?? 0) + w * h), false));\n`
/** the one condition of Page.getAnnotationsData under which a Link annotation's overlaid text is made: the page's whole text
 *  extracted again, through an Intersector, for every page that holds a link. The server's readers (the marks read, the
 *  layout maker) take an annotation's rectangle and destination and find the glyphs under it themselves: for a document that
 *  opts in with NO_IMAGE_PIXELS, the condition is false and no text is extracted (`overlaidText` stays unset); the annotations are
 *  the same. LINK_TEXT_PIXELS leaves it as it stands */
const TEXT_ANCHOR = '} else if (annotation.overlaysTextContent && isVisible) {'
const TEXT_GUARD = `} else if (annotation.overlaysTextContent && isVisible && this.evaluatorOptions.maxImageSize !== ${NO_IMAGE_PIXELS}) {`

/**
 * The worker module's text with the guard before its image decode and the one on a link's overlaid text. `version`, where given,
 * is the PDF.js the text is of (the host's package.json) and must be LITE_PDFJS; `ocr` the recogniser's bounds, an image's pixels
 * and a page's (OCR_PIXELS_MAX and OCR_PAGE_PIXELS_MAX by default: a test gives its own). Throws unless each anchor stands exactly
 * once.
 */
export function liteWorkerSource(source, { version, ocr = { image: OCR_PIXELS_MAX, page: OCR_PAGE_PIXELS_MAX } } = {}) {
  if (typeof source !== 'string') throw new TypeError('source: the text of pdf.worker.mjs')
  if (version !== undefined && version !== LITE_PDFJS) throw new RangeError(`the image guard was made for PDF.js ${LITE_PDFJS}, not ${version}: check buildPaintImageXObject again (pdf-lite.mjs)`)
  const parts = source.split(ANCHOR)
  if (parts.length !== 2) throw new RangeError(`the worker holds the image decode ${parts.length - 1} times, not once: PDF.js changed, check buildPaintImageXObject again (pdf-lite.mjs)`)
  const before = parts[0].split(SYNC_ANCHOR)
  if (before.length !== 2) throw new RangeError(`the worker starts the image decode ${before.length - 1} times, not once: PDF.js changed, check buildPaintImageXObject again (pdf-lite.mjs)`)
  if (!Number.isSafeInteger(ocr.image) || !Number.isSafeInteger(ocr.page) || ocr.image < 1 || ocr.page < 1) throw new RangeError('ocr: an image\'s and a page\'s pixels, positive integers')
  const text = `${before[0]}${syncGuard(ocr.image, ocr.page)}${SYNC_ANCHOR}${before[1]}${GUARD}${ANCHOR}${parts[1]}`.split(TEXT_ANCHOR)
  if (text.length !== 2) throw new RangeError(`the worker holds the overlaid text's condition ${text.length - 1} times, not once: PDF.js changed, check Page.getAnnotationsData again (pdf-lite.mjs)`)
  return `${text[0]}${TEXT_GUARD}${text[1]}`
}
