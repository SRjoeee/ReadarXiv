// latex-front.mjs's types (JavaScript until the engine's port), for the reader's tests
/** a table cell's place in its table's grid (tableGrid): its table, row, first column, the columns it spans, and whether its row is the header's */
export interface CellPlace { table: number; row: number; col: number; span: number; head: boolean }
export interface SourceUnit { kind: string; title?: boolean; depth?: number; lead?: string; trail?: string; inner?: string; front?: boolean; stored?: boolean; bracketed?: boolean; rowLead?: string[]; rowTrail?: string[]; pieces: unknown[]; cell?: CellPlace }
/** a table's body as its cells lay it out: each cell's stretch of the source, its row, first column and span, and whether its row is the header's */
export declare function tableGrid(s: string, from: number, to: number): (Omit<CellPlace, 'table'> & { start: number; end: number })[]
/** a source tree held in memory: path → bytes */
export declare function inMemory(map: Map<string, Uint8Array>): { list(): string[]; read(path: string): Uint8Array | null }
/** a paper's source read from its main file: its units, the paper's prose in reading order */
export declare function loadProject(root: ReturnType<typeof inMemory>, main: string, options?: { tables?: boolean }): { units: SourceUnit[]; inputenc: string | null }
/** a main file's \begin{document} and \end{document} as TeX finds them: -1 for `begin` and `body` where it has none */
export declare function documentBounds(text: string, options?: { lineEnvs?: Set<string> | null; ifs?: Set<string>; ifValues?: Map<string, boolean> | null }): { begin: number; body: number; end: number }
/** the \usepackage[…]{inputenc} TeX acts on: where it stands and its options, or null */
export declare function inputencOf(text: string, options?: { lineEnvs?: Set<string> | null; ifs?: Set<string>; ifValues?: Map<string, boolean> | null }): { start: number; end: number; options: string } | null
/** the patched files (path → bytes): each unit's range replaced by its translated pieces, the rest untouched */
/** what goes around a unit when it is written out (markUnits): `whole` puts it around all of the unit, inside the groups that open and close it */
export type UnitMark = { start: string; end: string; before?: string; whole?: boolean } | null
/** `spans`, where given, gets each top-level unit's byte range in the file as written, and each nested unit's inside it
 *  with the top-level unit it is written in (`outer`) and the length of what closes it there (`post`) */
export declare function patch(project: { units: SourceUnit[] }, translated: Map<SourceUnit, unknown[]>, options?: { guardControlWords?: boolean; mark?: (unit: SourceUnit) => UnitMark; spans?: { file: string; unit: SourceUnit; from: number; to: number; post?: number; outer?: SourceUnit }[] | null }): Map<string, Uint8Array>
export declare function markUnits(units: SourceUnit[], translated?: Map<SourceUnit, unknown[]> | null): (unit: SourceUnit) => UnitMark
/** a style's abstract heading written out, made to go by \\abstractname */
export declare function localizeNames(text: string): string
/** a translation's pieces with its own line breaks: room to break in long code and formulas, a heading's forced break
 *  kept only where it parts a title from its subtitle */
export declare function lineBreaks<P>(unit: { kind: string; title?: boolean }, pieces: P[]): P[]
/** a compile's log as its last TeX pass wrote it: the browser compiler's joined log cut to that pass, a native .log as it is */
export declare const lastTexLog: (log: string | null | undefined) => string
/** the declarations that take no argument (\centering, \small, \quad …): a brace group after one is a group of its own */
export declare const NO_ARG_COMMANDS: ReadonlySet<string>
/** TeX for the unit marks (\axtmark, \axtend) and each page's columns as named destinations */
export declare const MARK_DEF: string
/** the font probe the original's own compile is given before \begin{document}: the roles' families and the default encoding */
export declare const FONT_PROBE: string
/** the font probe's reading of a log: the roles' NFSS families, the body's, and the default encoding where the probe gave it */
export interface FontProbe { rm: string; sf: string; tt: string; body: string; enc?: string }
export declare function readFontProbe(log: string): FontProbe | null
/** fontspec's \setmainfont, \setsansfont and \setmonofont for a target: each role in the role table's faces for its family */
export declare function roleFontsFor(probe: Partial<FontProbe> | null | undefined, target: string): string
/** after xeCJK: each role in the role table's Latin faces for the paper's family (every family of the table with an OpenType form) */
export declare function latinFontsFor(probe: Partial<FontProbe> | null | undefined): string
