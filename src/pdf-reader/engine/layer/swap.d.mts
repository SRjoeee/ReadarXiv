// swap.mjs's types: where the reader puts the removed page's pixels in for each drawn unit
/** each unit's share of where the original (O) and its removed page (Rm) differ, at W x H device pixels (RGBA): per slot,
 *  the rectangles [x, y, w, h] the removed page's pixels go into; `slots` each unit's glyphs' and rules' boxes there */
export declare function swapMasks(O: ArrayLike<number>, Rm: ArrayLike<number>, W: number, H: number, slots: readonly { boxes: readonly number[][] }[]): { rects: number[][][]; unclaimed: number; differing: number }
