import type { DocToken } from './anchors.mjs'
/** our base page's lines that stand elsewhere on arXiv's page, from the line check (layout/carry.mjs lineCheckOf) over our base
 *  page's tokens: arXiv's page -> its entries, flat, MOVED_STRIDE each (our page, x0, x1, bottom, top, arXiv's page, dx, dy) */
/**  every page the check read whole and drew (`pages` drawable, not `over`) has a list, empty where none of its lines moved */
export declare function movedLinesOf(check: { lineAt: readonly ({ page: number; dx: number; dy: number } | null)[]; inPlace: ArrayLike<number>; tokenLine: ArrayLike<number>; pages?: readonly { page: number; drawable: boolean }[]; over?: readonly number[] } | null, ours: readonly DocToken[]): Map<number, number[]>
