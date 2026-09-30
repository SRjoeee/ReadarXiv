// cache.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { SourceUnit } from './latex-front.mjs'

/** a stored copy's units: each unit's kind, source text and hash, a heading's depth and whether it is the title, and what the run made of it */
export declare function unitsOf(units: SourceUnit[], kept: Set<SourceUnit>, hashes: string[], results: Map<number, unknown>): { kind: string; src: string; hash: string; title?: boolean; depth?: number; state: string }[]

/** whether every unit a run has a translation of was made by `identity`, and there is one: when the untypeset mark may be left */
export declare function allTranslatedBy(results: Map<number, { pieces?: unknown; by?: string }>, identity: string): boolean
