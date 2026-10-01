// live.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { inMemory, SourceUnit } from './latex-front.mjs'
import type { analyze } from './paper-meta.mjs'
import type { Strategy } from './scripts.mjs'
import type { Typeset } from './typeset/tex.mjs'

/** a paper's files (path → bytes) → what the pipeline works on */
export interface Paper { fsys: ReturnType<typeof inMemory>; meta: ReturnType<typeof analyze>; project: { main: string; units: SourceUnit[] }; units: SourceUnit[]; kept: Set<SourceUnit> }
export declare function openPaper(files: Map<string, Uint8Array>): Paper
/** the translation so far, with unit marks, set by one of strategiesFor: the files that differ from the paper's */
export declare function translationFiles(paper: Paper, translated: Map<SourceUnit, unknown[]>, options: { strategy: Pick<Strategy, 'engine' | 'pre'> & Partial<Strategy>; fonts: unknown; draft?: boolean; aux?: string | null; bbl?: string | null; typeset?: Typeset | null; note?: (event: string, data: unknown) => void }): Map<string, Uint8Array>
/** the font probe; with `width`, the width and size probes the typesetting rule measures the face by */
export declare function probeFiles(paper: Paper, options?: { width?: boolean }): Map<string, Uint8Array>
/** the original with unit marks; with `lines`, each unit's lines and the forced breaks in its log */
export declare function originalFiles(paper: Paper, options?: { lines?: boolean }): Map<string, Uint8Array>
/** the units a translation into `lang` leaves as they are */
export declare function keptFor(paper: Paper, lang: string): Set<SourceUnit>
/** a compile as the TeX page answers it */
export interface Compiled { ok: boolean; pdf?: Uint8Array | null; aux?: string | null; bbl?: string | null; log?: string; ms?: number; error?: string; network?: string[] }
/** a compile asked of the TeX page */
export interface CompileRequest { main: string; engine: string; rerun: boolean; bibtex: boolean | null; overrides: Map<string, Uint8Array> }
/** the compiler a visit uses, opened when first needed and again after a compile the page failed */
export declare function compilerKeeper(open: () => Promise<{ compile: (req: CompileRequest) => Promise<Compiled>; close: () => void }>): { ready: () => Promise<void>; compile: (req: CompileRequest) => Promise<Compiled> }
/** the reader's run: translation as it comes in, the compiles, the final (the options as the reader passes them) */
export declare function runLive(paper: Paper, options: {
  lang: string
  compile: (req: CompileRequest) => Promise<Compiled>
  translate: (texts: string[], cuts?: number[][]) => Promise<({ text: string; by: string | null } | null)[]>
  format?: 'markers' | 'tags' | 'runs'
  rank?: (i: number) => number
  onUpdate?: (u: { pdf: Uint8Array; texts: unknown[]; translated: number; final: boolean }) => void
  onOriginal?: (o: { pdf: Uint8Array }) => void
  note?: (event: string, data?: Record<string, unknown>) => void
  seed?: Map<number, unknown> | null
  marks?: Map<string, unknown> | null
  identity?: string | null
  pipelineCurrent?: boolean
  /** a PDF's unit marks and page columns (typeset/places.mjs marksOf on a PDF.js document of the bytes): with it, the
   *  typesetting rule sets the translation; without, it is set as today */
  readMarks?: ((pdf: Uint8Array) => Promise<import('./typeset/places.mjs').Marks>) | null
}): Promise<{ settled: boolean; exhausted: boolean; changed: boolean; results: Map<number, unknown>; previews: number; translated: number; units: number; originalOk?: boolean; stopped?: string | null; missing?: number }>
