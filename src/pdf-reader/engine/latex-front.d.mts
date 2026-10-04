// latex-front.mjs's types (JavaScript until the engine's port), for the reader's tests
export interface SourceUnit { kind: string; title?: boolean; depth?: number; lead?: string; trail?: string; inner?: string; pieces: unknown[] }
/** a source tree held in memory: path → bytes */
export declare function inMemory(map: Map<string, Uint8Array>): { list(): string[]; read(path: string): Uint8Array | null }
/** a paper's source read from its main file: its units, the paper's prose in reading order */
export declare function loadProject(root: ReturnType<typeof inMemory>, main: string, options?: { tables?: boolean }): { units: SourceUnit[] }
/** the patched files (path → bytes): each unit's range replaced by its translated pieces, the rest untouched */
/** what goes around a unit when it is written out (markUnits): `whole` puts it around all of the unit, inside the groups that open and close it */
export type UnitMark = { start: string; end: string; before?: string; whole?: boolean } | null
/** `spans`, where given, gets each top-level unit's byte range in the file as written, and each nested unit's inside it
 *  with the top-level unit it is written in (`outer`) */
export declare function patch(project: { units: SourceUnit[] }, translated: Map<SourceUnit, unknown[]>, options?: { guardControlWords?: boolean; mark?: (unit: SourceUnit) => UnitMark; spans?: { file: string; unit: SourceUnit; from: number; to: number; outer?: SourceUnit }[] | null }): Map<string, Uint8Array>
export declare function markUnits(units: SourceUnit[], translated?: Map<SourceUnit, unknown[]> | null): (unit: SourceUnit) => UnitMark
/** a style's abstract heading written out, made to go by \\abstractname */
export declare function localizeNames(text: string): string
/** a translation's pieces with its own line breaks: room to break in long code and formulas, a heading's forced break
 *  kept only where it parts a title from its subtitle */
export declare function lineBreaks<P>(unit: { kind: string; title?: boolean }, pieces: P[]): P[]
/** a compile's log as its last TeX pass wrote it: the browser compiler's joined log cut to that pass, a native .log as it is */
export declare const lastTexLog: (log: string | null | undefined) => string
/** TeX for the unit marks (\axtmark, \axtend) and each page's columns as named destinations */
export declare const MARK_DEF: string
