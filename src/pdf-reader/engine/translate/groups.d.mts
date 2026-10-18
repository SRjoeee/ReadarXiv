// groups.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { SourceUnit } from '../source/latex-front.mjs'

/** the share of a column's cells that must come back as they went for the column to be kept as names */
export declare const NAMES_SHARE: number
/** a cell's consistency group, or null for a unit outside a table read by its structure */
export declare function groupOf(u: SourceUnit | null | undefined): string | null
/** whether a translation is its source but for white space and the case of single letters */
export declare function unchanged(src: string, tr: string): boolean
export type GroupDecision = 'translate' | 'names' | 'untranslatable' | 'waiting'
/** the table groups decided over what has come in */
export declare function decideGroups(units: SourceUnit[], answer: (u: SourceUnit) => { state?: string; pieces?: unknown[] | null } | undefined | null, kept?: Set<SourceUnit>): { keep: Set<SourceUnit>; wait: Set<SourceUnit>; groups: Map<string, { decision: GroupDecision; cells: number; same: number; units: SourceUnit[] }> }
