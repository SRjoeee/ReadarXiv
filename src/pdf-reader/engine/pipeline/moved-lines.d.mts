import type { DocToken } from './anchors.mjs'
/** the share of a page's lines the line check must have found a partner for, for the page to have a map */
export declare const MAP_FOUND: number
/** our base page's lines that stand elsewhere on arXiv's page, from the line check (layout/carry.mjs lineCheckOf) over our base
 *  page's tokens: arXiv's page -> its entries, flat, MOVED_STRIDE each (our page, x0, x1, bottom, top, arXiv's page, dx, dy). Only
 *  a page the check placed has a list (MAP_FOUND of its lines found; `pages` drawable and not `over` where given), empty where
 *  none of its lines moved */
export declare function movedLinesOf(check: { lineAt: readonly ({ page: number; dx: number; dy: number } | null)[]; inPlace: ArrayLike<number>; tokenLine: ArrayLike<number>; pages?: readonly { page: number; drawable: boolean }[]; over?: readonly number[] } | null, ours: readonly DocToken[]): Map<number, number[]>
