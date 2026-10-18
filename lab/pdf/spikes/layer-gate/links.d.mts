// links.mjs's types, for its tests
export interface Point { x: number; y: number; ch: string; size?: number }
export type Target = { dest: string | unknown[]; url?: undefined } | { url: string; dest?: undefined }
/** a Link annotation as the measures read it: `i` its rank among the page's Link annotations, `ok` whether it is in T */
export interface Annot { i: number; ok: boolean; rect: number[] | null; boxes: number[][]; target: Target | null; ov: string; border: { width: number; rgb: number[]; style: string } | null }
export interface Annots { links: Annot[]; byIndex: Map<number, Annot>; total: number; unsupported: number }
/** a record of a laid page (reader.d.mts LinkRecord) */
export interface LinkRec { boxes: number[]; dest?: string | unknown[]; url?: string; name: string; moved: boolean; order: number; border?: { width: number; rgb: number[]; style?: string } }
/** the engine's attribution of a record: its source annotations [page, i] and its tier */
export interface LinkSource { annots: [number, number][]; tier?: string }
export declare const LINK_SCHEMES: string[]
export declare const BOX_TOLERANCE: number
export declare const BORDER_STYLES: Record<number, string>
export declare function urlAllowed(url: unknown): boolean
export declare function annotationsOf(raw: unknown[] | null | undefined): Annots
export declare function glyphPointsOf(items: { str?: string; width?: number; transform?: number[] }[] | null | undefined): Point[]
export declare function pointsIn(points: Point[], boxes: number[][]): Point[]
export declare function glyphsOfLink(a: Annot, points: Point[]): Point[]
export type Op = { op: 'erase'; box: number[] } | { op: 'paper' | 'swap'; rects: number[][] } | { op: 'restore'; boxes: number[][]; clip: number[][] } | { op: 'crop' }
export declare function erasedOf(ops: Op[] | null | undefined, devOf: (x: number, y: number) => number[]): (x: number, y: number) => boolean
export declare function sameTarget(rec: { dest?: unknown; url?: string }, target: Target | null): boolean
export declare function sameText(a: string, b: string): boolean
export declare function textUnder(chars: Point[], boxes: number[][]): string
/** a crop drawn on a page, the drawing's own: its source page and box, its drawn box (PDF units), its clip on the source page */
export interface CropDrawn { srcPage: number; src: number[]; dst: number[]; clip: number[][] | null }
/** what the crops drawn on a page show: their source pages' glyphs inside their source boxes, carried to where they are drawn */
export declare function cropsShown(crops: CropDrawn[] | null | undefined, glyphsOf: (page: number) => Point[] | null | undefined): { srcPage: number; src: number[]; chars: Point[] }[]
export interface Piece { t: string; s?: string; id?: number; src?: string }
/** a unit's translated pairs, each with its open's index in the source (null where unknown), in the source's order where all are known */
export declare function pairsOf(pieces: Piece[] | null | undefined, kOf?: readonly number[] | null): { src: string; text: string; k: number | null }[]
/** the destination a \hyperlink's source names, or null */
export declare function hyperlinkNameOf(src: string): string | null
export declare function hrefUrlOf(src: string): string | null
/** what the reference reads of a page: its glyph points (with their size, where known), whether a point is in a placeholder's
 *  segment (within `d` across), the unit whose line it is on, a unit's pairs, the page's annotations of T */
export interface ReferenceContext { points(a: Annot): Point[]; segment(x: number, y: number, d?: number): boolean; owner(x: number, y: number): number | null; pairsOf(id: number): { src: string; text: string; k?: number | null }[] | null | undefined; all: Annot[] }
/** the reference of a moved record's annotations; `ctx` one page's, or each annotation's page's (`a.page`): null where none is found */
export declare function referenceOf(annots: (Annot & { page?: number })[], ctx: ReferenceContext | ((page: number | undefined) => ReferenceContext | null)): string | null
export interface LinksIn {
  page: number
  parsed(q: number): Annots | null | undefined
  glyphs: Point[]
  erased(x: number, y: number): boolean
  records?: LinkRec[]
  sources?: (LinkSource | null | undefined)[] | null
  claims?: Map<string, { page: number; label: string; credited: boolean; flagged: boolean }>
  counted?(q: number): boolean
  drawn(record: LinkRec): string
  crops?: { srcPage: number; src: number[]; chars: Point[] }[]
  /** the reference text, null where none is found, undefined where none can be had (the record is counted unverified) */
  reference(record: LinkRec, annots: Annot[]): string | null | undefined
}
export interface LinksOut {
  linksTotal: number; linksUnsupported: number; linksPlaceable: number; linksKeptN: number; linksMoved: number; linksInPlace: number; linksTrueN: number; linksUnverified: number; linksWrong: number
  where: { linksWrong: string[]; linksTrue: string[] }
}
export declare function linksPage(o: LinksIn): LinksOut
export declare function linkSetOf(raw: unknown[] | null | undefined): unknown[]
export declare function composedDiff(a: (unknown[] | null | undefined)[], b: (unknown[] | null | undefined)[]): number[]
export declare function drawnCharsOf(svg: SVGSVGElement, at: (x: number, y: number) => { x: number; y: number }): Point[]
