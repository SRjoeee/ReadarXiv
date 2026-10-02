// cache.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { SourceUnit } from './latex-front.mjs'

/** a stored copy's units: each unit's kind, source text and hash, a heading's depth and whether it is the title, and what the run made of it */
export declare function unitsOf(units: SourceUnit[], kept: Set<SourceUnit>, hashes: string[], results: Map<number, unknown>): { kind: string; src: string; hash: string; title?: boolean; depth?: number; lead?: string; trail?: string; inner?: string; tr?: string; sentences?: { src: number[]; tr: number[] }; state: string; inSource?: true }[]
/** the seed for a paper's units from a stored copy, matched by their source's hash, and the hashes */
export declare function seedFrom(record: { units: unknown[] }, units: SourceUnit[]): Promise<{ seed: Map<number, { pieces: unknown[]; by?: string; tried?: string; state: string; sentences?: { src: number[]; tr: number[] }; inSource?: true }>; hashes: string[] }>
/** a run again's seed: the copy's, with what the visit's last run made (its results) over it, sentences included */
export declare function seedAgain(seed: Map<number, unknown> | null | undefined, made: Map<number, { pieces?: unknown[]; by?: string; tried?: string; state?: string; sentences?: { src: number[]; tr: number[] }; inSource?: boolean }> | null | undefined): Map<number, { pieces: unknown[]; by?: string; tried?: string; state: string; sentences?: { src: number[]; tr: number[] }; inSource?: true }>
/** a translation's mark that a final set it in the source, as a seed or a run's result carries it: { inSource: true } or {} */
export declare function inSourceOf(u: { inSource?: boolean } | null | undefined): { inSource?: true }
/** the right side's texts of a stored copy, by unit: its translation, or its source where it has none or the final set it in the source */
export declare function copyTexts(units: { src: string; pieces?: unknown[]; tr?: string; sentences?: unknown; inSource?: true; lead?: string; trail?: string; inner?: string }[]): { id: number; text: string; gaps?: number[]; lead?: string; trail?: string; inner?: string; sentences?: { src: number[]; tr: number[] } }[]
/** what a run writes: the whole record, the units' provenance over the copy's PDF, or nothing */
export declare function decideWrite(options: { result: { changed: boolean; settled: boolean }; cached: { units: { hash: string; state: string; by?: string; tried?: string }[]; marks?: unknown[] } | null | undefined; units: { hash: string; state: string; by?: string; tried?: string }[]; marks: unknown[] | null | undefined; shown: boolean }): 'full' | 'provenance' | null
/** the seeds a run takes as they are (`current`): whole, by `identity`, of the wire sent now — the visit's last run's, or the copy's when `copyWire` */
export declare function reusable<S extends { pieces?: unknown[]; state?: string; by?: string }>(seed: Map<number, S> | null | undefined, options: { identity: string; copyWire: boolean; made?: Map<number, { pieces?: unknown[] }> | null }): Map<number, S & { current: boolean }>
/** SHA-256 hex of a unit's source pieces */
export declare function sourceHash(u: SourceUnit): Promise<string>

/** whether every unit a run tried came back whole from `identity`, and there is one: when the untypeset mark may be left */
export declare function allTranslatedBy(results: Map<number, { pieces?: unknown; state?: string; by?: string }>, identity: string): boolean

/** the versions a write labels its record with, or null where it writes nothing */
export declare function labelOf(how: 'full' | 'provenance' | null, options: { pipeline: string; typesetting: string; passing: boolean; cached?: { pipeline: string; typesetting?: string } | null }): { pipeline: string; typesetting: string | undefined } | null
/** the marked original's readings as a run gives them (live.mjs readingsOf) */
export interface Readings { log: string; cites: string; labels: string; bbl: string | null; marks: import('./typeset/places.mjs').Marks }
/** the readings as the store keeps them, one per paper, with the left side's marks and the versions that made them */
export declare function originalRow(readings: Readings, left: [string, unknown][], made: { pipeline: string; typesetting: string; page: string }): import('@/cache/pdf-record').OriginalReadings
/** a stored original's readings and left marks under these versions, or null */
export declare function knownOriginal(row: import('@/cache/pdf-record').OriginalReadings | undefined, now: { pipeline: string; typesetting: string; page: string }): { readings: Readings; left: [string, unknown][] } | null
