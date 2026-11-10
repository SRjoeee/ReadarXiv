// latex-front.mjs's types (JavaScript until the engine's port), for the reader's tests
/** a table cell's place in its table's grid (tableGrid): its table, row, first column, the columns it spans, and whether its row is the header's */
export interface CellPlace { table: number; row: number; col: number; span: number; head: boolean }
export interface SourceUnit { kind: string; title?: boolean; depth?: number; lead?: string; trail?: string; inner?: string; front?: boolean; held?: boolean; stored?: boolean; bracketed?: boolean; pieces: unknown[]; cell?: CellPlace }
/** a table's body as its cells lay it out: each cell's stretch of the source, its row, first column and span, and whether its row is the header's */
export declare function tableGrid(s: string, from: number, to: number, rowEnds?: ReadonlySet<string> | null): (Omit<CellPlace, 'table'> & { start: number; end: number })[]
/** a source tree held in memory: path → bytes */
export declare function inMemory(map: Map<string, Uint8Array>): { list(): string[]; read(path: string): Uint8Array | null }
/** a paper's source read from its main file: its units, the paper's prose in reading order */
/** `inFloat`: the indices in `units` (rising) of the units written inside a float — figure, table (starred or not), wrapfigure,
 *  sidewaystable, algorithm, listing, and whatever they hold; a longtable is none. Beside the units, in no unit's hash, text,
 *  bundle row or patched source. `floatTypes`: each caption's float type, [index, type], LaTeX's \@captype there (its float
 *  environment's, \captionof's, a sub-caption's `sub` type). `pseudocode`: the indices of the units of an algorithm float's
 *  body (not its captions). `texOrder`: the indices in `units` in the order the walk met them, TeX's, where it is not
 *  theirs (an author block's later units and the bibliography's entries are numbered after the rest), else null */
export declare function loadProject(fsys: ReturnType<typeof inMemory>, main: string, options?: { tables?: boolean }): { units: SourceUnit[]; inFloat: number[]; floatTypes: [number, string][]; pseudocode: number[]; texOrder: number[] | null; inputenc: string | null; complete: [string, number][]; bibliography: string[] }
/** the paper's macros that read nothing past their own arguments, as [name, arity], from their definitions in the package's files */
export declare function completeMacros(files: readonly { file?: string; text: string }[]): [string, number][]
/** which definitions stand inside another's body (o.k < d.at < o.e), each { at, k, e }: its match's start, its body's first
 *  character (k > at), the index after its body (-1: none) */
export declare function definitionsNested(defs: readonly { at: number; k: number; e: number }[]): boolean[]
/** a main file's \begin{document} and \end{document} as TeX finds them: -1 for `begin` and `body` where it has none */
export declare function documentBounds(text: string, options?: { lineEnvs?: Set<string> | null; ifs?: Set<string>; ifValues?: Map<string, boolean> | null }): { begin: number; body: number; end: number }
/** the \usepackage[…]{inputenc} TeX acts on: where it stands and its options, or null */
export declare function inputencOf(text: string, options?: { lineEnvs?: Set<string> | null; ifs?: Set<string>; ifValues?: Map<string, boolean> | null }): { start: number; end: number; options: string } | null
/** a file's text with each `%` TeX reads as a character (a web address's at a .bbl entry's top level, or at another file's top level: in no group, bracket, conditional or environment but `document`, of a command the paper does not define) written as a code no source holds, the same length */
export declare function urlPercents(text: string, file: string, scan?: { ifs?: ReadonlySet<string>; lineEnvs?: ReadonlySet<string> | null; defined?: { has(name: string): boolean } | null; skipEnvs?: ReadonlySet<string> | null }): string
/** the placeholder of the list backref sets after a bibliography entry (the pages citing it): an entry's last piece where the package turns the lists on; patch writes nothing for it */
export declare const BACKREF_LIST: string
/** an e-mail address as a text writes it: the source's (keepAddresses) and an ink unit's word (the engine package's copy of ink-units.mjs, rule 4) */
export declare const EMAIL_ADDRESS: RegExp
/** several addresses at one domain written once, a group of their local parts in braces, parentheses or brackets before it, separated by commas and/or white space (`{jyeoj251, bmw5779}@gmail.com`): the source's (keepGroups) and an ink unit's lines' (the engine package's copy of ink-units.mjs) */
export declare const ADDRESS_GROUP: RegExp
/** each identifier of a text, [start, end) code units: a token with no white space that holds two letters or digits joined by underscores (`llm_equal_human`, `CallbackBase.host_label(result)`), the whole token but its leading and trailing sentence punctuation: the source's (keepIdentifiers), an ink unit's word's and a figure text's (the engine package's copies) */
export declare function identifiersIn(s: string): [number, number][]
/** the patched files (path → bytes): each unit's range replaced by its translated pieces, the rest untouched */
/** what goes around a unit when it is written out (markUnits): `whole` puts it around all of the unit, inside the groups that open and close it */
export type UnitMark = { start: string; end: string; before?: string; whole?: boolean; call?: string; callAt?: number } | null
/** `spans`, where given, gets each top-level unit's byte range in the file as written, and each nested unit's inside it
 *  with the top-level unit it is written in (`outer`) and the length of what closes it there (`post`) */
export declare function patch(project: { units: SourceUnit[] }, translated: Map<SourceUnit, unknown[]>, options?: { guardControlWords?: boolean; mark?: (unit: SourceUnit) => UnitMark; spans?: { file: string; unit: SourceUnit; from: number; to: number; post?: number; outer?: SourceUnit }[] | null; pastBegin?: boolean }): Map<string, Uint8Array>
export declare function markUnits(units: SourceUnit[], translated?: Map<SourceUnit, unknown[]> | null): (unit: SourceUnit) => UnitMark
/** the front matter's units' marks in the layout compile alone: an author block's, a front unit's (not a heading, not one a macro only stores), its text no other's */
/** whether a unit is of an author block: its names (kind author) or its places (kind affiliation) */
export declare function inAuthorBlock(unit: { kind?: string } | null | undefined): boolean
export declare function frontMarks(units: readonly SourceUnit[]): (unit: SourceUnit) => UnitMark
/** where the marked compile states an author's call before a unit (its source offset in the unit's file): the command of an
 *  author block right after another's in the document, an \\and inside one; undefined where none */
export declare function calledAt(unit: SourceUnit): number | undefined
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
/** whether a compiler is arXiv's `latex` (pdfTeX in DVI mode, the DVI made a PDF by dvipdfmx), whose marks are DVI_MARK_DEF's */
export declare const dviEngine: (engine: string | null | undefined) => boolean
/** MARK_DEF's destination under `latex`, where pdfTeX writes no PDF: xdvipdfmx's `pdf:dest` special, every destination kept
 *  (dvipdfmx's C 0x0010 at the first page); after MARK_DEF, for such a paper alone */
export declare const DVI_MARK_DEF: string
/** a source file's bytes as TeX reads its lines: latin1, each line's end (CR, LF or CRLF) an LF */
export declare const texText: (bytes: Uint8Array) => string
/** the package's TeX files (.tex, .sty, .cls), each as its characters, decoded as the units' text is */
export declare function texFilesOf(fsys: { list(): string[]; read(p: string): Uint8Array | null }, main: string): string[]
/** a string's code units as bytes, each its low eight bits (source text is read byte for byte) */
export declare const latin1Bytes: (s: string) => Uint8Array
/** a/./b/../c → a/c: a file as the package holds it and as TeX's file system has it, whatever spelling named it */
export declare const normalizePath: (p: string) => string
/** the name TeX gives what it writes for a main file: its own name without the directory and the extension */
export declare const jobName: (main: string) => string
/** bytes as a string of the same code units (latin1, byte for byte): the scanner's view of a source */
export declare const latin1: (bytes: Uint8Array) => string
/** a display's letters as the page sets them, for telling its lines from a float's: the source's letters, the paper's own
 *  macros (`macros`, name → body) put in and the commands left out */
export declare function displayLetters(src: string, macros?: Map<string, string>): string
/** the steps the walk has taken while the module is loaded, dry runs among them: its cost, which a test holds to the source's length */
export declare const walkStepCount: () => number
