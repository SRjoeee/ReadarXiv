// rows.mjs's types: the rows a language's translation travels as (the layer-only plan §4.1; the web mirrors Row in its
// src/shared/rows.ts)
import type { SourceUnit } from '../latex-front.mjs'
import type { translateUnits } from '../mt.mjs'
import type { ReadBundle } from './bundle.mjs'
import type { Unit } from './run.mjs'

/** what the rows need of a bundle: its units, by index, a dropped one null (the written bundle and the read one both are) */
export type RowsBundle = Pick<ReadBundle, 'units'>
/** a row's state: the unit's translation whole or partial, none (the engine could not take it), lost (to the service,
 *  to be asked again), or kept (a table cell held whole in its source with its group) */
export type RowState = 'whole' | 'partial' | 'none' | 'lost' | 'kept'
/** a unit as one language translates it: each piece a translated text (its TeX-escaped string, as the engine holds it)
 *  or the index k of the bundle unit's source piece; its state, engine, sentence offsets, and, for a cell of a group kept
 *  whole, its own translation's state */
export type Row = [id: number, pieces: (string | number)[], state: RowState, by: string | null, sentences: { src: number[]; tr: number[] } | null, translation?: 'whole' | 'partial' | 'none' | 'lost']
/** one unit's entry of translateUnits' results */
export interface TranslateResult { pieces?: readonly unknown[]; state: string; by?: string | null; sentences?: { src: number[]; tr: number[] } | null }

/** a source piece as the bundle's gives it, with its index `k` among its unit's pieces; a nested piece names its unit */
export interface SourcePiece { t: string; k: number; s?: string; src?: string; id?: number; pre?: string; post?: string; unit?: SourceUnit }
/** a bundle unit as the unit object mt.mjs and groups.mjs work on */
export type RowSourceUnit = SourceUnit & { pieces: SourcePiece[] }
/** the bundle's units as the unit objects mt.mjs and groups.mjs work on, one per bundle unit and the same objects on every
 *  call (each piece carries its index `k`); null where the reader dropped a unit */
export declare function sourceUnitsOf(bundle: RowsBundle): (RowSourceUnit | null)[]
/** a unit's result as its row; a `none` row where it cannot be one (a piece with no source piece, a string past 16,000 code
 *  units, a result of no shape, a unit the bundle has not). Every string a row holds is within §4.1's reader bound
 *  (no C0 control but \n and \t, none of U+007F to U+009F, none of the bidirectional controls): a CRLF source's carriage
 *  returns are written as line feeds and any other control as a space, and the white space the engine puts back at a
 *  unit's ends as the Unicode its source bytes hold. So the hybrid's pieces unitOf gives are those of the result, up to
 *  that normalisation of white space and controls */
export declare function rowOf(bundle: RowsBundle, id: number, result: TranslateResult): Row
/** v0's unit of a row (kind, src = plainSource, title, group, pieces rebuilt, state): the source pieces by identity, each
 *  carrying its k, so that kOfSource and trPiecesOf give the hybrid's TrPiece; null where the row is no unit of the bundle's */
export declare function unitOf(bundle: RowsBundle, row: Row): Unit | null
/** the rows a language's results so far allow: every decided unit; a table cell only once decideGroups has decided its
 *  group, and then every cell of it (kept whole: state 'kept', its own `translation`); the cells waiting are `held` */
export declare function layerRows(bundle: RowsBundle, results: ReadonlyMap<number, TranslateResult>, lang: string): { rows: Row[]; held: number[] }
/** the ids a language translates (keptFor's rule over the flags and kinds), rising, and its batches: 2,500 characters
 *  first, then 12,000, in source order */
export declare function toTranslate(bundle: RowsBundle, lang: string): number[]
export declare function batchesOf(bundle: RowsBundle, lang: string): number[][]
/** runRows' options: the language; the engine's `send` (mt.mjs translateUnits') and its wire format; `rank(id)`, how far a
 *  unit is from the reading place (lower first; the source's order without it); `onRows`, given the rows not given before
 *  or changed, with the cells held now; the signal that stops the run before the next batch */
export interface RunRowsOptions {
  lang: string
  send: Parameters<typeof translateUnits>[1]
  format?: 'markers' | 'tags' | 'runs'
  rank?: (id: number) => number
  onRows: (rows: Row[], held: number[]) => void
  signal?: AbortSignal
}
/** the whole run for the extension: batchesOf's batches (the unit nearest the reading place first where `rank` is
 *  given), translateUnits per batch, layerRows over every result so far; the final rows by id, the units lost to the
 *  service (and, after a refusal, never asked), and why it stopped (a refusal's kind, 'aborted') or null. The signal is
 *  checked before each batch only: `onRows` may be called once more after the abort, for the batch under way, and a caller
 *  that has abandoned the run ignores that call */
export declare function runRows(bundle: RowsBundle, o: RunRowsOptions): Promise<{ rows: Map<number, Row>; lost: number; stopped: string | null }>
