// ink-before.mjs's types: pageInk's walk as it was at a8cc7da22, the reference its readers of PDF.js's values are held to
type List = { fnArray: ArrayLike<number>; argsArray: ArrayLike<unknown> }
type Objects = { get(objId: string): unknown; has?(objId: string): boolean }
/** a page's ink read whole from its operator list */
export declare function pageInk(OPS: Record<string, number>, ops: List, commonObjs: Objects, o: Record<string, unknown>): Record<string, unknown>
/** the same walk as a reader of the list in pieces */
export declare function inkReader(
  OPS: Record<string, number>,
  commonObjs: Objects,
  o: Record<string, unknown>,
): { read(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>): void; end(): Record<string, unknown> }
export declare function outlineBox(commonObjs: unknown, font: unknown, fontChar: unknown): number[] | null
export declare function type3Box(OPS: Record<string, number>, font: unknown, id: unknown): number[] | null
export declare function outlineKey(font: unknown, fontId: string, g: Record<string, unknown>): string
export declare function outlineTable(collected: ReadonlyMap<string, readonly number[]>): Record<string, (string | number)[]>
export declare function readOutlines(table: unknown): Map<string, number[]>
export declare function regionsOfPoints(
  points: readonly { name: string; glyph: number }[],
  glyphCount: number,
): { kind: string; from: number; to: number }[]
export declare function displayTextMask(regions: unknown, n: number): Uint8Array
export declare function regionMask(regions: unknown, n: number, kind: string): Uint8Array
export declare function unreadOf(ink: unknown): string | null
export declare function packGlyphs(glyphs: readonly unknown[], o?: Record<string, unknown>): Record<string, unknown>
export declare const GLYPH_COLUMNS: readonly string[]
