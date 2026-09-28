// live.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { SourceUnit } from './latex-front.mjs'
import type { Strategy } from './scripts.mjs'

export interface Paper { meta: { main?: string; compiler?: string }; units: SourceUnit[]; kept: Set<SourceUnit> }
/** a paper's files (path → bytes) → what the pipeline works on */
export declare function openPaper(files: Map<string, Uint8Array>): Paper
/** the translation so far, with unit marks, set by one of strategiesFor: the files that differ from the paper's */
export declare function translationFiles(paper: Paper, translated: Map<SourceUnit, unknown[]>, options: { strategy: Strategy; fonts: unknown; draft: boolean; aux?: string | null; bbl?: string | null }): Map<string, Uint8Array>
/** the units a translation into `lang` leaves as they are */
export declare function keptFor(paper: Paper, lang: string): Set<SourceUnit>
