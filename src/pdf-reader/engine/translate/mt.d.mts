// mt.mjs's types (JavaScript until the engine's port), for the reader's tests
/** the translation rules' version (translate/version.mjs), re-exported: what is sent for a unit and how a reply is read back */
export { TRANSLATE_VERSION } from './version.mjs'
type Piece = { t: string; s?: string; src?: string; tr?: boolean; id?: number }
/** a unit's plain text in the source, placeholders dropped */
export declare function plainSource(u: { pieces: Piece[] }): string
/** the unit's displays beyond its marks and between its words (`lead`, `trail`, `inner`): those it has, as strings */
export declare function displayEdges(u: { lead?: unknown; trail?: unknown; inner?: unknown }): { lead?: string; trail?: string; inner?: string }
/** a unit's plain text in its translation, as the compiled PDF shows it */
export declare function plainTranslated(pieces: Piece[]): string
/** a text piece as the compiled PDF shows it: a translation's TeX escapes undone, the source's bytes as UTF-8 */
export declare const shown: (p: Piece) => string
/** a piece a space never goes before: one that is a space itself (a tie, a control space, a kern), a group's end */
export declare const SPACING: RegExp
/** backref's list after a bibliography entry (latex-front.mjs BACKREF_LIST): on no wire, put back after the translation with an en space before it */
export declare const BACKREF_LIST: string
/** a unit's plain text (the translation's where the pieces are translated) and the offsets in it where a placeholder stood */
export declare function unitText(pieces: Piece[]): { text: string; gaps?: number[] }
/** an engine's plain text as TeX sets it: its invisible characters dropped, TeX's special characters escaped */
export declare function texEscape(s: string): string
/** a run of formulas a marker stands for (or a pair that holds placeholders alone): the unit's own pieces, read back in their order */
export type RunSlot = { t: 'run'; pieces: Piece[] }
/** a kept pair's open or close with the pieces that went on no wire beside it (switches at its head, merged pairs' ends) */
export type EdgeSlot = { t: 'edge'; pieces: Piece[] }
/** a kept pair's places in read pieces, by which one that came back empty takes back the text set just outside it */
export type Refill = { open: Piece; a: Piece; b: Piece; close: Piece }
/** a display's own stop the wire wrote after its marker or tag: the stop and its offset in the wire */
export type OwnStop = { stop: string; at: number }
/** a displayed formula's source */
export declare const DISPLAY: RegExp
/** the punctuation a display's source sets at its end, its sentence's, or null */
export declare function displayStop(src: unknown): string | null
/** whether a unit's wire carries a display's own stop: the units a copy made before the rule is asked again for */
export declare function displayStopChanges(u: { pieces: readonly unknown[] } | null | undefined): boolean
/** whether a piece is a placeholder that sets no ink (a switch, a strut, a skip): it goes on no wire */
export declare const isInkless: (p: unknown) => boolean
/** whether a unit's pieces hold a pair, or a placeholder that sets no ink between two stretches of text */
export declare function holdsStyle(pieces: unknown[]): boolean
/** whether the boundary rule changes what a unit sends (its markers plan with the rule and without it) */
export declare function boundaryChanges(u: { pieces: readonly unknown[] } | null | undefined): boolean
/** a formula split across inline formulas: each run's first piece's index → its last's */
export declare function formulaRuns(pieces: Piece[]): Map<number, number>
/** whether translated pieces hold an inline formula whose delimiters do not balance on its own */
export declare function holdsUnbalanced(pieces: Piece[]): boolean
/** a unit → the wire text of the markers format, and the table from marker id back to the original piece (a run's
 *  pieces for a run's marker, an edge's for a kept pair's; `hidden`, the characters of a run's text a marker stands for;
 *  `front` and `back`, what went on no wire before and after the translation; `refill`, the kept pairs) */
export declare function serialize(u: { pieces: Piece[] }): { wire: string; slots: (Piece | RunSlot | EdgeSlot)[]; lead: string; trail: string; stops?: Set<number>; numbers?: Set<number>; numbersAfter?: Set<number>; hidden?: Map<string, number>; front?: Piece[]; back?: Piece[]; refill?: Refill[]; own?: Map<number, OwnStop> }
/** the translation → pieces, or why it cannot be used */
export declare function rehydrate(text: string, ser: ReturnType<typeof serialize>, tolerant?: boolean): { pieces: Piece[] } | { error: string }
/** where each sentence after the first begins: offsets of its first word in the plain source and in the plain translation */
export type Sentences = { src: number[]; tr: number[] }
/** a unit's sentences from its engine's sentence lengths for the wire it was sent (the segment's `alignment`), or null */
export declare function sentencesOf(u: { pieces: Piece[] }, ser: { wire: string }, text: string, alignment: { source: number[]; target: number[] } | undefined, pieces: Piece[], tolerant?: boolean, format?: 'markers' | 'tags'): Sentences | null
/** a unit → the tags wire (an LLM's, Google's): <x id="n"/> for an opaque piece, <t id="n">…</t> around a formatting pair */
export declare function serializeTags(u: { pieces: Piece[] }): { wire: string; slots: unknown[]; lead: string; trail: string; hidden?: Map<string, number>; front?: Piece[]; back?: Piece[]; refill?: Refill[]; own?: Map<number, OwnStop> }
/** the translation → pieces, or why it cannot be used */
export declare function rehydrateTags(text: string, ser: ReturnType<typeof serializeTags>): { pieces: Piece[] } | { error: string }
/** a unit's sentence cuts on its tags wire */
export declare function cutsOf(u: { pieces: Piece[] }, ser?: { wire: string; slots: unknown[] }): number[]
/** each unit's text as a compile has it: translated where `done` has its pieces, with the sentences of those pieces */
/** a record's sentences where they are of their shape, else null */
export declare function sentencesKept(s: unknown, src: string, tr: string): Sentences | null
export declare function textsShown<U extends { pieces: Piece[] }>(units: U[], done: Map<U, Piece[]>, sentencesOf: (pieces: Piece[]) => Sentences | undefined): ({ id: number; text: string; gaps?: number[]; lead?: string; trail?: string; inner?: string; sentences?: Sentences })[]
type Sent = { text: string; by: string | null; alignment?: { source: number[]; target: number[] } } | null
/** units → their translations, by unit: pieces, how they came back, the identity that answered, and a whole unit's sentences */
export declare function translateUnits<U extends { pieces: Piece[] }>(units: U[], send: (texts: string[], cuts?: number[][]) => Promise<Sent[]>, format?: 'markers' | 'tags' | 'runs'): Promise<{ results: Map<U, { pieces?: Piece[]; state: string; by?: string; sentences?: Sentences }>; how: Record<string, number> }>
/** the characters of plain source a batch of units holds at most: the first, then the rest */
export declare const FIRST_BATCH: 2500
export declare const NEXT_BATCH: 12000
/** a batch from the front of `order`: units as many as hold `max` characters (`sizeOf(i)` each), a unit never split, a
 *  batch never empty (a unit over the limit goes alone) */
export declare function batchOf(order: Iterable<number>, sizeOf: (id: number) => number, max: number): number[]
/** source text is read byte for byte (latin1); its characters are UTF-8 */
export declare const utf8: (s: string) => string
/** a text with `@`, `&`, `<` and `>` escaped as a unit's text is on the wire */
export declare const escape: (s: string) => string
/** the entities of a reply (`&amp;`, `&#x41;`, `&nbsp;` …) as their characters */
export declare const decode: (s: string) => string
/** the wire formats as the chain negotiates them, by `renderPath`: a unit's wire, a reply's reading back, a run's text out and in */
export declare const WIRE: {
  markers: { serialize: typeof serialize; rehydrate: (text: string, ser: ReturnType<typeof serialize>) => ReturnType<typeof rehydrate>; tolerant: (text: string, ser: ReturnType<typeof serialize>) => ReturnType<typeof rehydrate>; run: (s: string) => string; unrun: (s: string) => string }
  tags: { serialize: typeof serializeTags; rehydrate: typeof rehydrateTags; run: (s: string) => string; unrun: (s: string) => string }
  runs: { run: (s: string) => string; unrun: (s: string) => string }
}
/** whether a short text (a table cell, a figure label) is only a name, judged against the paper's prose */
export declare function isName(text: string, prose: string): boolean
/** the running text isName reads a short text against: every unit's text but a table cell's and a figure's */
export declare function proseOf(units: readonly ({ kind: string; pieces: Piece[] } | null | undefined)[]): string
/** the table cells and figure texts that are only names: they keep their source */
export declare function nameCells<U extends { kind: string; pieces: Piece[] }>(units: U[]): Set<U>
