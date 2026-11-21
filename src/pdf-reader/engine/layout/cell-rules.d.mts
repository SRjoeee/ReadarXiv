// cell-rules.mjs's types: the rules near a table's cells, page by page
/** the rules near the page's table cells' lines, x0, y0, x1, y1 stride 4 */
export declare function pageRules(index: { onPage(page: number): Iterable<number>; unit(id: number): { kind?: string; lines: ArrayLike<number> & { subarray?: (a: number, b: number) => ArrayLike<number> } } | null | undefined }, page: number, ink: { boxes: ArrayLike<number>; paths: ArrayLike<number> }): number[]
/** boxes stride 4 on a page, within its view: the boxes, or a LayoutRefusal */
export declare function checkBoxes<T extends readonly number[]>(v: T, page: number, views: readonly number[] | null, path: string, first?: number): T
