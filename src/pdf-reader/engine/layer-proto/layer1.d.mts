// layer1.mjs's types: iteration 1's helpers the layer v0 calls (ported from the prototype at 9e56fca)

/** a line rectangle on the original: [page, x0, y0 (its foot), x1, y1 (its top)], PDF units, y up */
export type Rect = [number, number, number, number, number]
/** a run of a unit's line rectangles on one page and column, each below the last */
export interface Block {
  page: number
  rects: Rect[]
  x0: number
  x1: number
  top: number
  bottom: number
  h: number
  pitch: number
  indent: number
  centred: boolean
  [more: string]: unknown
}
/** the upper median (the middle value, the higher of two) of a list; 0 for none */
export declare const median: (xs: readonly number[]) => number
/** a unit's line rectangles as blocks; split around the lines `keep` names (`page|x0,y0,x1,y1`) */
export declare function blocksOf(rects: readonly Rect[], pageViews: readonly number[][], keep?: ReadonlySet<string> | null): Block[]
export declare const CITE: RegExp
export declare const NUM: RegExp
export declare const DISPLAY: RegExp
/** the macros whose text is fixed (\ie: "i.e.") */
export declare const MACROS: Readonly<Record<string, string>>
export declare const SUP: Readonly<Record<string, string>>
/** a placeholder's source as plain text: what the layer draws where it finds no rendering */
export declare function texToText(src: string): string
/** what a placeholder draws as: 'macro', 'zero', 'space', 'cite', 'num', 'display', 'other' or 'symbol' */
export declare function phClass(src: string): string
/** a gap's kind by its text: 'cite', 'num' or 'other' */
export declare const gapClass: (text: string) => 'cite' | 'num' | 'other'
/** letters and digits only, lower case, accents off */
export declare const norm: (s: string) => string
/** a run of characters' words: each { w, start, end } over the characters' indices */
export declare function wordsOf(chars: readonly { ch: string; sep?: boolean }[], joined?: ReadonlySet<string> | null): { w: string; start: number; end: number; hyphen?: boolean }[]
/** which of O's words a longest common subsequence with S's takes (1 each) */
export declare function lcsMatched(S: readonly string[], O: readonly string[]): Uint8Array
export declare const CJK: RegExp
/** what may not start a line, and what may not end one */
export declare const NO_START: RegExp
export declare const NO_END: RegExp
