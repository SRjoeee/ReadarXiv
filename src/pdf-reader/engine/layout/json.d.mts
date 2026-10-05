// json.mjs's types (JavaScript until the engine's port), for the reader's tests
/** a file refused: where (a JSON path, e.g. 'lines[3][1][17]') and why */
export declare class LayoutRefusal extends Error {
  constructor(path: string, why: string)
  readonly path: string
  readonly why: string
}
/** the values a JSON text holds (every object, array, string, number, true, false, null), counted outside strings
 *  without parsing, stopped once past `max` (the web's src/shared/json-values.ts valuesOf, written anew here) */
export declare function countValues(text: string, max?: number): number
/** UTF-8 bytes as text, refusing malformed input (TextDecoder fatal) */
export declare function utf8Strict(bytes: Uint8Array): string
/** bytes past `cap` refused before decoding, malformed UTF-8 before counting, values past `values` before JSON.parse */
export declare function boundedJson(bytes: Uint8Array, o: { cap: number; values: number }): unknown
export declare const PAGES_MAX: number
export declare const COORD_MAX: number
export declare const isObject: (v: unknown) => v is Record<string, unknown>
export declare const isNumber: (v: unknown) => v is number
export declare const isInteger: (v: unknown, lo: number, hi: number) => v is number
/** an untrusted string as a refusal names it: its first 20 code units, control and bidi characters escaped; else its type */
export declare const told: (v: unknown) => string
/** an object with exactly `keys` */
export declare function checkKeys<K extends string>(v: unknown, keys: readonly K[], path: string): Record<K, unknown>
/** a page count: an integer 1 to PAGES_MAX */
export declare function checkPages(v: unknown, path: string): number
/** each page's view, x0, y0, x1, y1: exactly 4 × pages numbers within ±COORD_MAX, x0 < x1, y0 < y1 */
export declare function checkViews(v: unknown, pages: number, path: string): number[]
/** whether (x, y) lies within page `page`'s view (1-based) by `slack` (1 when not given) */
export declare const inView: (views: readonly number[], page: number, x: number, y: number, slack?: number) => boolean
