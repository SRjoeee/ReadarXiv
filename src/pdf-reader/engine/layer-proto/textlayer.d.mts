// textlayer.mjs's types: a laid page's text layer as plain data (docs/PDF-READER.md §11.11)
import type { Layout } from './layer2.mjs'

/** the items a page's layer holds at most */
export declare const TEXT_ITEMS_MAX: number
/** the point-against-rectangle tests a page's ownership may spend */
export declare const TEXT_WORK_MAX: number

/** one item of a page's text layer, in PDF units of the page (its user space, unrotated, y up, as LinkRecord.boxes) */
export interface TextItem {
  /** the text a copy and a search read */
  str: string
  /** its box: left, bottom, width, height (a kept item's from its baseline, size and its font's ascent; a translated line's across
   *  its tokens' bands; a moved one relocated with its crop) */
  x: number
  y: number
  w: number
  h: number
  /** its baseline */
  base: number
  /** 'ltr', or 'rtl' for a kept item PDF.js reads right to left */
  dir: 'ltr' | 'rtl'
  /** the size it is drawn at */
  fontSize: number
  /** kept: the composed page's own text left where it stands; moved: the text under a crop's source, at the crop's drawn place
   *  (or the crop's plain text over its box where none is under it); translated: one drawn line of a unit or a name */
  from: 'kept' | 'moved' | 'translated'
  /** the drawn unit's id (a translated or moved item; none for a babel name's) */
  unit?: number
  /** a copy breaks the line after it */
  eol?: true
}
/** a page's text layer, a new copy on every ask (Layer.textOf) */
export interface TextLayerData {
  items: TextItem[]
  /** the page's size in PDF units */
  page: { w: number; h: number }
  /** what it found: items by kind, the erased items it dropped, the tests it spent, the items merged (a run's pieces, and past
   *  TEXT_ITEMS_MAX a line's neighbours) */
  stats: { kept: number; moved: number; translated: number; dropped: number; work: number; merged: number }
}
/** a page's text content kept compact: per item x, baseline, width, size, ascent, flags (1 a line ends after it, 2 right to left) */
export interface CompactItems { n: number; str: readonly string[]; num: Float32Array }
export declare const NO_ITEMS: CompactItems
/** a text content (PDF.js's, or a draw's) kept compact: upright items alone */
export declare function itemsOf(tc: { items?: readonly unknown[]; styles?: Record<string, { ascent?: number }> } | null | undefined): CompactItems
/** a drawn text segment */
export interface TextSeg { str: string; x: number; y: number; w: number; h: number; base: number; size: number; /** the line's slot across, which reading order reads */ lx0?: number; lx1?: number }
/** a drawn crop: its source page and rectangle there, its drawn box here (PDF units, [x0, y0, x1, y1]), its plain text */
export interface CropSeg { crop: { page: number; src: [number, number, number, number]; dst: [number, number, number, number]; text: string }; space: boolean }
/** a unit's drawn lines on a page as segments, in reading order */
export declare function segsOfUnit(L: Layout, page: number, drawnCrop?: (crop: { page: number }) => boolean): (TextSeg | CropSeg)[]
/** a babel name drawn in the target's word as a segment */
export declare function nameSeg(text: string, x: number, w: number, base: number, size: number): TextSeg
/** a drawn thing of the page: a unit (`unit` its id) or a name, its operations' owner key and its segments */
export interface DrawnText { key: string; unit?: number; segs: readonly (TextSeg | CropSeg)[] }
/** the page's text layer, from its text content, its drawing's operations and the drawn things' segments */
export declare function textLayerOf(
  page: { n: number; items: CompactItems; view: readonly number[] },
  plan: { ops: readonly unknown[]; devOf(x: number, y: number): [number, number] | number[]; owners: readonly (readonly [number, number, string])[] },
  drawn: readonly DrawnText[],
  o?: { sourceOf?: (page: number) => CompactItems | null },
): TextLayerData
