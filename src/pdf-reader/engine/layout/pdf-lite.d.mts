// pdf-lite.mjs's types: PDF.js's worker without the images' pixels, for the server-side reads
/** the PDF.js the guard was made for */
export declare const LITE_PDFJS: string
/** `maxImageSize` of a document read without its images' pixels */
export declare const NO_IMAGE_PIXELS: number
/** `maxImageSize` of a document read without its images' pixels whose Link annotations keep their overlaid text (the draw's) */
export declare const LINK_TEXT_PIXELS: number
/** `maxImageSize` of a document read for its images' pixels, each of OCR_PIXELS_MAX pixels at most (the bitmap figures' pass) */
export declare const OCR_IMAGE_PIXELS: number
/** the pixels an image may have to be decoded for the recogniser */
export declare const OCR_PIXELS_MAX: number
/** the pixels a page's images may have in all to be decoded for the recogniser, in the order the page paints them */
export declare const OCR_PAGE_PIXELS_MAX: number
/** the text of pdf.worker.mjs with the guard before its image decode; `version` (the host's pdfjs-dist) must be LITE_PDFJS; throws
 *  a RangeError unless the decode stands exactly once, a TypeError for a source that is no string */
export declare function liteWorkerSource(source: string, o?: { version?: string; ocr?: { image: number; page: number } }): string
