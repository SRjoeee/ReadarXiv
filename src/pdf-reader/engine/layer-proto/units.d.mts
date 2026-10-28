// units.mjs's types: the paper's units as the layer's files hold them, and base64
import type { CellPlace, SourceUnit } from '../source/latex-front.mjs'

/** a unit's flags (KEPT: openPaper's `kept`, nameCells) */
export declare const UNIT_FLAG_BITS: { readonly TITLE: 1; readonly FRONT: 2; readonly BRACKETED: 4; readonly KEPT: 8 }
/** the display edges a unit may have, in their order */
export declare const EDGES: readonly ['lead', 'trail', 'inner']
/** a table cell's keys, in their order */
export declare const CELL: readonly ['table', 'row', 'col', 'span', 'head']
/** a piece as openPaper reads it, positions dropped: a text (with the source as written where it differs, an accent's
 *  letter), a placeholder, a group's open and close paired by `id`, a nested unit by its id */
export type BundlePiece = [0, s: string] | [0, s: string, src: string] | [1, src: string] | [2, id: number, src: string] | [3, id: number, src: string] | [4, pre: string, unit: number, post: string]
/** a unit: its kind, flags, depth, table cell, display edges and pieces; its id is its index */
export type BundleUnit = [kind: string, flags: number, depth: number | null, cell: CellPlace | null, edges: { lead?: string; trail?: string; inner?: string } | null, pieces: BundlePiece[]]
/** an ink unit (an ink kind, of a chunk of INK_UNITS_FORMAT alone): a unit with the source unit whose row it is drawn with, or null */
export type InkBundleUnit = [kind: string, flags: 0, depth: null, cell: null, edges: null, pieces: BundlePiece[], echo: number | null]
/** the structural name's unit kind (its units after the source's: bundleUnitsOf) */
export declare const NAME_KIND: 'name'
/** the hover's ids of babel's names: one an occurrence, past every bundle id, below 2^31 */
export declare const NAME_ID_FROM: number
export declare const NAME_OCCURRENCE_MAX: number
export declare const nameOccurrenceId: (occurrence: number) => number | null
export declare const isNameOccurrence: (id: number) => boolean
/** the bundle's units from openPaper's paper (its `units` and `kept`, then a unit of kind `name` for each of its `names`);
 *  throws on a piece the front end does not make */
export declare function bundleUnitsOf(paper: { units: readonly SourceUnit[]; kept: ReadonlySet<SourceUnit>; names?: readonly string[] }): BundleUnit[]
/** whether unit `u` (the file's `units[i]`) stands: its shape, strings within STRING_MAX, a nested piece's unit one before it
 *  that stands (`stands`, a flag per unit id) */
export declare function unitStands(u: unknown, i: number, stands: ArrayLike<number>, o?: { ink?: boolean }): boolean
/** the ink units as the bundle holds them (layout/wrap.mjs wrapFinal `ink.units`) */
export declare function inkBundleUnitsOf(ink: readonly { kind: string; echo: number | null; pieces: readonly SourceUnit['pieces'][number][] }[]): InkBundleUnit[]
/** bytes as base64, padded */
export declare function toBase64(bytes: Uint8Array): string
/** base64 as bytes: a byte at least and at most `cap`, one spelling; throws a LayoutRefusal at `path` */
export declare function fromBase64(s: unknown, cap: number, path: string): Uint8Array
