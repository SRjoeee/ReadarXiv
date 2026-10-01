// live.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { inMemory, SourceUnit } from './latex-front.mjs'
import type { analyze } from './paper-meta.mjs'
/** a paper's files → what the pipeline works on */
export interface Paper { fsys: ReturnType<typeof inMemory>; meta: ReturnType<typeof analyze>; project: { main: string; units: SourceUnit[] }; units: SourceUnit[]; kept: Set<SourceUnit> }
export declare function openPaper(files: Map<string, Uint8Array>): Paper
/** the original with unit marks: the files written over the package's */
export declare function originalFiles(paper: Paper): Map<string, Uint8Array>
/** the translation so far with unit marks, set by a strategy: the files written over the package's */
export declare function translationFiles(paper: Paper, translated: Map<SourceUnit, unknown[]>, options: { strategy: { xe?: boolean; engine: string; pre: (fonts: unknown) => string }; fonts: unknown; draft?: boolean; aux?: string | null; bbl?: string | null }): Map<string, Uint8Array>
