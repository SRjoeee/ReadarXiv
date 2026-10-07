// measure.mjs's types, for its tests
export interface OrigLine { x0: number; x1: number; baseline: number; top: number; bottom: number; size: number }
export interface DrawnLine { baseline: number; size: number; x0: number; x1: number }
export interface UnitIn {
  id: number; kind: string; drawn: boolean; why: string | null; orig: OrigLine[]; lines: DrawnLine[]
  erase: number[][]; crops: { k: number; src: number[]; dst: number[] }[]; pageText?: { w: number; segW: number }[]; phs?: { kind: string | null; status: string }[]
}
export interface RefUnit { id: number; kind: string; orig: OrigLine[] }
export interface Item { x0: number; y0: number; x1: number; y1: number; str: string; math: boolean }
export declare const BODY: Set<string>
export declare const MATH_FONT: RegExp
export declare function frameGroups(orig: OrigLine[]): { lines: OrigLine[]; n: number; pitch: number; first: number; last: number; x0: number; x1: number; top: number; bottom: number; size: number }[]
export declare function modelPage(o: { units: UnitIn[]; ref: RefUnit[]; items: Item[]; translated: Set<number> }): {
  units: { textOn: number; textDrawn: number; cellsOn: number; cellsDrawn: number; left: Record<string, number> }
  fills: { kind: string; n: number; fill: number }[]
  geo: { id: number; kind: string; n: number; dTop: number; blank: number; dRight: number; pitch: number | null; onGrid: number; scale: number }[]
  wrongPageText: number; droppedPh: number; cropForeign: number; modelCells: number
}
export declare function pixelPage(o: Record<string, unknown>): Record<string, unknown>
/** the wire formats' syntax left in a translation's text (a marker, its `#`, an escaped `@`, an entity, a tag): the matches */
export declare function markerResidueOf(text: string): string[]
