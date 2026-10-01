// live.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { SourceUnit } from './latex-front.mjs'
import type { Strategy } from './scripts.mjs'
import type { Typeset } from './typeset/tex.mjs'

export interface Paper { meta: { main?: string; compiler?: string }; units: SourceUnit[]; kept: Set<SourceUnit> }
/** a paper's files (path → bytes) → what the pipeline works on */
export declare function openPaper(files: Map<string, Uint8Array>): Paper & { fsys: { list(): string[]; read(path: string): Uint8Array | null } }
/** the translation so far, with unit marks, set by one of strategiesFor: the files that differ from the paper's */
export declare function translationFiles(paper: Paper, translated: Map<SourceUnit, unknown[]>, options: { strategy: Strategy; fonts: unknown; draft: boolean; aux?: string | null; bbl?: string | null; typeset?: Typeset | null }): Map<string, Uint8Array>
/** the font probe; with `width`, the width and size probes the typesetting rule measures the face by */
export declare function probeFiles(paper: Paper, options?: { width?: boolean }): Map<string, Uint8Array>
/** the original with unit marks; with `lines`, each unit's lines and the forced breaks in its log */
export declare function originalFiles(paper: Paper, options?: { lines?: boolean }): Map<string, Uint8Array>
/** the units a translation into `lang` leaves as they are */
export declare function keptFor(paper: Paper, lang: string): Set<SourceUnit>
