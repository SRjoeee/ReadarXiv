// cache.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { SourceUnit } from '../source/latex-front.mjs'

/** a stored copy's units: each unit's kind, source text and hash, a heading's depth and whether it is the title, and what the run made of it */
export declare function unitsOf(units: SourceUnit[], kept: Set<SourceUnit>, hashes: string[], results: Map<number, unknown>): { kind: string; src: string; hash: string; title?: boolean; depth?: number; lead?: string; trail?: string; inner?: string; pieces?: unknown[]; tr?: string; sentences?: { src: number[]; tr: number[] }; by?: string; tried?: string; state: string; translation?: string; inSource?: true; group?: string }[]
/** the seed for a paper's units from a stored copy, matched by their source's hash, and the hashes */
export declare function seedFrom(record: { units: unknown[] }, units: SourceUnit[]): Promise<{ seed: Map<number, { pieces: unknown[]; by?: string; tried?: string; state: string; translation?: string; sentences?: { src: number[]; tr: number[] }; inSource?: true }>; hashes: string[] }>
/** the state of a unit's translation, whatever is shown of it: a kept cell's `translation`, else its state */
export declare function translationOf(u: { state?: string; translation?: string } | null | undefined): string | undefined
/** a translation's mark that a final set it in the source, as a seed or a run's result carries it: { inSource: true } or {} */
export declare function inSourceOf(u: { inSource?: boolean } | null | undefined): { inSource?: true }
/** the right side's texts of a stored copy, by unit: its translation, or its source where it has none or the final set it in the source */
export declare function copyTexts(units: { src: string; pieces?: unknown[]; tr?: string; sentences?: unknown; inSource?: true; state?: string; lead?: string; trail?: string; inner?: string }[]): { id: number; text: string; gaps?: number[]; lead?: string; trail?: string; inner?: string; sentences?: { src: number[]; tr: number[] } }[]
/** SHA-256 hex of a unit's source pieces */
export declare function sourceHash(u: SourceUnit): Promise<string>

