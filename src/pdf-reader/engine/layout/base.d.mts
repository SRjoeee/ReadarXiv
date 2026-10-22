// base.mjs's types: the checks a base page of ours passes (the layer route's step 2)
/** a mark's place in two compiles of one page is the same within this, PDF units */
export declare const MARK_TOL: 0.01
/** a page box's corner in two PDFs is the same within this, PDF units */
export declare const BOX_TOL: 0.01
/** what the checks read of a PDF.js document */
export interface PdfLike {
  numPages: number
  getPage(p: number): Promise<{ view?: number[]; rotate?: number; userUnit?: number; getTextContent(): Promise<{ items?: { str?: string }[] }> }>
  getDestinations(): Promise<Record<string, unknown[] | null> | Map<string, unknown[] | null>>
  getPageIndex(ref: unknown): Promise<number>
  getMetadata?(): Promise<{ info?: { CreationDate?: string } | null } | null>
}
/** a document's `axt-` destinations: name → [page, x, y] */
export declare function marksOfPdf(doc: PdfLike): Promise<Map<string, [page: number | null, x: number | null, y: number | null]>>
/** each page's box as PDF.js reads it: [x0, y0, x1, y1, rotate, userUnit] */
export declare function boxesOfPdf(doc: PdfLike): Promise<[number, number, number, number, number, number][]>
/** the final pass against the draft (design §3.1): the same pages, boxes and marks, each within MARK_TOL */
export declare function finalCheck(draft: PdfLike, final: PdfLike): Promise<{ ok: true; marks: number } | { ok: false; why: string }>
/** our base page against arXiv's PDF (design §3.3.4): the same page count, every page's box the same */
export declare function boxesCheck(ours: PdfLike, arxiv: PdfLike): Promise<{ equal: true; pages: [number, number] } | { equal: false; pages: [number, number]; why: string }>
/** mark text in each page's text (design §3.3.2): the pages it is on, the units its names name, the first hits */
export declare function markTextOf(pages: readonly (string | null | undefined)[] | null | undefined): { pages: number[]; units: Set<number>; samples: [page: number, text: string][] }
/** whether a text holds a mark of ours printed */
export declare const hasMarkText: (text: unknown) => boolean
/** a page's text as markTextOf reads it: its text items' strings joined */
export declare const pageTextOf: (tc: { items?: { str?: string }[] } | null | undefined) => string
/** every page's text of a document, as markTextOf reads it */
export declare function textOfPdf(doc: PdfLike): Promise<string[]>
/** a PDF date (D:YYYYMMDDHHmmSSOHH'mm') as seconds since the epoch, null for what is not one */
export declare function pdfDateEpoch(s: unknown): number | null
/** a document's /CreationDate as seconds since the epoch, null where it has none */
export declare function creationEpochOf(doc: PdfLike): Promise<number | null>
