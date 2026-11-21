// pdf-lite.mjs's types: PDF.js's worker without the images' pixels, for the server-side reads
/** the PDF.js the guard was made for */
export declare const LITE_PDFJS: string
/** `maxImageSize` of a document read without its images' pixels */
export declare const NO_IMAGE_PIXELS: number
/** `maxImageSize` of a document read without its images' pixels whose Link annotations keep their overlaid text (the draw's) */
export declare const LINK_TEXT_PIXELS: number
/** the text of pdf.worker.mjs with the guard before its image decode and its FeatureTest exported; `version` (the host's pdfjs-dist)
 *  must be LITE_PDFJS; throws a RangeError unless each anchor stands exactly once, a TypeError for a source that is no string */
export declare function liteWorkerSource(source: string, o?: { version?: string }): string
/** PDF.js's glyph outlines in Float32 on both sides, whatever the runtime: `api` the host's pdfjs-dist/legacy/build/pdf.mjs, `worker`
 *  the module of liteWorkerSource's text; once, before the first document; a TypeError, neither changed, unless both export a
 *  FeatureTest */
export declare function float32Outlines(api: { FeatureTest?: unknown }, worker: { FeatureTest?: unknown }): void
