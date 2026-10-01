// cache.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { SourceUnit } from './latex-front.mjs'

/** a stored copy's units: each unit's kind, source text and hash, a heading's depth and whether it is the title, and what the run made of it */
export declare function unitsOf(units: SourceUnit[], kept: Set<SourceUnit>, hashes: string[], results: Map<number, unknown>): { kind: string; src: string; hash: string; title?: boolean; depth?: number; lead?: string; trail?: string; inner?: string; tr?: string; sentences?: { src: number[]; tr: number[] }; state: string }[]
/** the seed for a paper's units from a stored copy, matched by their source's hash, and the hashes */
export declare function seedFrom(record: { units: unknown[] }, units: SourceUnit[]): Promise<{ seed: Map<number, { pieces: unknown[]; by?: string; tried?: string; state: string; sentences?: { src: number[]; tr: number[] } }>; hashes: string[] }>
/** a run again's seed: the copy's, with what the visit's last run made (its results) over it, sentences included */
export declare function seedAgain(seed: Map<number, unknown> | null | undefined, made: Map<number, { pieces?: unknown[]; by?: string; tried?: string; state?: string; sentences?: { src: number[]; tr: number[] } }> | null | undefined): Map<number, { pieces: unknown[]; by?: string; tried?: string; state: string; sentences?: { src: number[]; tr: number[] } }>
/** the seeds a run takes as they are (`current`): whole, by `identity`, of the wire sent now — the visit's last run's, or the copy's when `copyWire` */
export declare function reusable<S extends { pieces?: unknown[]; state?: string; by?: string }>(seed: Map<number, S> | null | undefined, options: { identity: string; copyWire: boolean; made?: Map<number, { pieces?: unknown[] }> | null }): Map<number, S & { current: boolean }>
/** SHA-256 hex of a unit's source pieces */
export declare function sourceHash(u: SourceUnit): Promise<string>

/** whether every unit a run tried came back whole from `identity`, and there is one: when the untypeset mark may be left */
export declare function allTranslatedBy(results: Map<number, { pieces?: unknown; state?: string; by?: string }>, identity: string): boolean
