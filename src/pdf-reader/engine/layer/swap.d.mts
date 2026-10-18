// swap.mjs's types: where the reader puts the removed page's pixels in for a drawn unit
/** a drawn unit's swap as rectangles from its glyphs' and rules' outline boxes (`mine`), grown by `pad` and cut away from
 *  the removed ones it does not replace (`avoid`: the boxes, or avoidIndex's function); PDF units, [x0, y0, x1, y1] each */
export declare function swapRects(mine: readonly number[][], avoid?: readonly number[][] | ((r: readonly number[]) => readonly number[][]), pad?: number): number[][]
/** the swap's pad, PDF units */
export declare const SWAP_PAD: number
/** boxes by a coarse grid: those meeting a rectangle (grown by `reach`), each once, the i-th left out where `skip(i)` */
export declare function avoidIndex(boxes: readonly number[][], skip?: ((i: number) => boolean) | null, reach?: number): (r: readonly number[]) => number[][]
