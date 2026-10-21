// measure.mjs's types, for its tests
export interface OrigLine { x0: number; x1: number; baseline: number; top: number; bottom: number; size: number }
/** a drawn line; `hangFrom`, where the marks it ends with that may hang begin (hangFromOf), where it ends with any */
export interface DrawnLine { baseline: number; size: number; x0: number; x1: number; block?: number; hangFrom?: number | null }
export interface UnitIn {
  id: number; kind: string; drawn: boolean; why: string | null; orig: OrigLine[]; lines: DrawnLine[]
  erase: number[][]; crops: { k: number; src: number[]; dst: number[] }[]; pageText?: { w: number; segW: number }[]; phs?: { kind: string | null; status: string }[]
}
export interface RefUnit { id: number; kind: string; orig: OrigLine[] }
export interface Item { x0: number; y0: number; x1: number; y1: number; str: string; math: boolean }
export declare const BODY: Set<string>
export declare const MATH_FONT: RegExp
export declare function frameGroups(orig: OrigLine[]): { lines: OrigLine[]; n: number; pitch: number; first: number; last: number; x0: number; x1: number; top: number; bottom: number; size: number }[]
/** a crop cut from a page, whatever page it is drawn on; `clip`: its own ink's boxes it is cut through (device pixels,
 *  [x, y, w, h]), where it has them */
export interface CutCrop { src: number[]; unit: number; plane?: string; clip?: number[][] | null }
/** a page's drawn lines and crops as cropPlacementOf reads them */
export interface Placement {
  lines: { key: string; x0: number; x1: number; baseline: number; a: number; d: number }[]
  crops: { unit: number; line: string; box: number[]; srcTop: number; tex: number | null; sc: number }[]
}
export interface PlacementCounts { cropTextOverlap: number; cropBaselineOff: number; cropNoTex: number; cropWhere: Record<'cropTextOverlap' | 'cropBaselineOff' | 'cropNoTex', number[]> }
/** the audit's entry of a drawn crop: its placeholder's (`k`) and its part's (`part`, a formula TeX broke over lines drawn as one crop a line) */
export declare function cropAuditOf<A extends { k?: number; part?: number }>(audit: readonly A[], crop: { k?: number; part?: number }): A | undefined
export declare function cropPlacementOf(o: Placement): PlacementCounts
export declare function modelPage(o: { units: UnitIn[]; ref: RefUnit[]; items: Item[]; translated: Set<number>; cut?: CutCrop[]; placement?: Placement | null }): {
  units: { textOn: number; textDrawn: number; cellsOn: number; cellsDrawn: number; left: Record<string, number> }
  fills: { kind: string; n: number; fill: number }[]
  geo: { id: number; kind: string; n: number; dTop: number; blank: number; dRight: number; dBody?: number; pitch: number | null; rhythm: number | null; onGrid: number; scale: number }[]
  gaps: ParaGap[]
  wrongPageText: number; droppedPh: number; cropForeign: number; modelCells: number
} & Partial<PlacementCounts>
/** a gap between two drawn body frames of a column with nothing between them: drawn ÷ original, the drawn gap's excess
 *  in the upper frame's original pitches, and whether it is narrower than the lines beside it (paraGapTight; null where
 *  there is no leading to hold it to, or between two frames of one unit) */
export interface ParaGap { ratio: number; extra: number; tight: boolean | null }
export declare function paraGapsOf(drawn: UnitIn[], ref: RefUnit[], items: Item[]): ParaGap[]
export declare function pixelPage(o: Record<string, unknown>): Record<string, unknown>
/** the wire formats' syntax left in a translation's text (a marker, its `#`, an escaped `@`, an entity, a tag): the matches */
export declare function markerResidueOf(text: string): string[]
/** TeX's syntax a placeholder's rendering `text` left of its source `src`: each special character beyond the source's escapes of it */
export declare function markupResidueOf(text: string, src: string): string[]
/** TeX's file as the instrument holds it, by page (the kept layout's rows): each unit's placeholders with ink there, its
 *  lines, the LOST placeholders on its first page; every display's segments. Boxes are [x0, y0, x1, y1] */
export interface FileLine { j: number; box: number[]; baseline: number; size: number; held: boolean }
/** a line end of TeX's that a forced break shapes (fileIndexOf): between the two baselines, the next line's, its column;
 *  `room`, TeX's room between the two lines in pitches (fileIndexOf's; slotsSkippedOf reads it from the gap where it is not given) */
export interface FileBreak { y: number; next: number; x0: number; x1: number; room?: number; tall?: number }   // tall: the opening TeX's \lineskip rule set for a tall next line beyond the pitch
export interface FilePage { units: Map<number, { phs: { k: number; kind: string; segs: number[][] }[]; lines: FileLine[]; lost: number[]; pitch: number | null; breaks: FileBreak[]; breaksAll: number; rows: Map<number, string> }>; displays: number[][] }
export declare function fileIndexOf(layout: { lines?: [number, number[]][]; ph?: number[][]; held?: [number, number[]][]; lineskip?: readonly number[] | null }): Map<number, FilePage>
export declare function displayRowsOf(page: FilePage | undefined): number[][]
/** a rendering of a placeholder by its unit and its piece's source index: a crop's source, or its characters' centres */
export interface Rendering { unit: number; k: number | null; src?: string | null; chars: number[][] }
/** each placeholder of a drawn unit whose ink TeX's file finds shown exactly once, by its own renderings: those shown no time or more, [unit, k, times] */
export declare function contentOf(o: { phs: { unit: number; k: number; src?: string | null; segs: number[][] }[]; crops?: { unit: number; k: number | null; src?: string | null; box: number[] }[]; texts?: { unit: number; k: number | null; src?: string | null }[]; pageTexts?: Rendering[]; kept?: Rendering[]; keptLines?: number[][]; erased?: number[][] }): { contentLost: number; contentWhere: [number, number, number][] }
/** the segments of the placeholders their own kept rendering leaves in place */
export declare function keptSegsOf(o: { phs: { unit: number; k: number; segs: number[][] }[]; kept?: Rendering[] }): number[][]
export declare function overDisplayOf(o: { lines: { unit: number; x0: number; x1: number; baseline: number; a: number; d: number }[]; boxes: number[][] }): { textInDisplay: number; where: number[] }
/** the forced breaks of a unit's source pieces that end a line of it, as the engine counts them: groups with a visible piece
 *  that is no display before and after; `kindOf` a piece's kind ('display', 'text', null: invisible; undefined: cannot tell, -1) */
export declare function forcedBreaksIn(pieces: readonly { t: string; s?: string; src?: string }[] | null | undefined, kindOf?: (i: number, piece: { t: string; s?: string; src?: string }) => 'display' | 'text' | null | undefined): number
/** a unit's line ends on a page set aside as forced breaks: where its source sets exactly as many as the file has, else none */
export declare function forcedBreakRoom(own: { breaks?: FileBreak[]; breaksAll?: number } | null | undefined, sourceBreaks: number): FileBreak[]
export declare function slotsSkippedOf(units: { id: number; orig: OrigLine[]; lines: (DrawnLine & { pitch: number | null })[]; tex?: { baseline: number; x0: number; x1: number }[]; held?: number[][]; texPitch?: number | null; keptRows?: number[]; breaks?: FileBreak[] }[]): { slotsSkipped: number; where: number[] }
/** a character UAX 14 does not let a line start with (CL, CP, IS, EX, NS) */
export declare function noStart(ch: string | null | undefined): boolean
export declare function lineStartsOf(lines: { unit: number; first: string | null; orig: string | null }[]): { lineStartPunct: number; where: number[] }
/** where a drawn line's hanging marks begin: the advance of the first of the tokens ending it that hold only closing marks (noStart's, or a final quotation mark); null where it ends with none */
export declare function hangFromOf(items: readonly { t: { s?: string; space?: boolean; crop?: unknown }; x?: number; shift?: number }[] | null | undefined): number | null
export declare function glyphAccounted(g: { cat: string | undefined; inSeg: boolean; fromSource?: boolean; onLine: boolean; inGap: boolean; used: string | null; drawn: boolean }): boolean
/** each translated piece's source index of a unit, read by the instrument as layer-proto/tex.mjs kOfPieces reads it */
export declare function kOfPiecesOf(pieces: { t: string }[] | undefined, tr: unknown): number[] | null
