// mt.mjs's types (JavaScript until the engine's port), for the reader's tests
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
/** a unit's plain text (the translation's where the pieces are translated) and the offsets in it where a placeholder stood */
export declare function unitText(pieces: Piece[]): { text: string; gaps?: number[] }
/** an engine's plain text as TeX sets it: its invisible characters dropped, TeX's special characters escaped */
export declare function texEscape(s: string): string
/** a unit → the wire text of the markers format, and the table from marker id back to the original piece */
export declare function serialize(u: { pieces: Piece[] }): { wire: string; slots: Piece[]; lead: string; trail: string; stops?: Set<number>; numbers?: Set<number>; numbersAfter?: Set<number> }
/** the translation → pieces, or why it cannot be used */
export declare function rehydrate(text: string, ser: ReturnType<typeof serialize>, tolerant?: boolean): { pieces: Piece[] } | { error: string }
/** where each sentence after the first begins: offsets of its first word in the plain source and in the plain translation */
export type Sentences = { src: number[]; tr: number[] }
/** a unit's sentences from its engine's sentence lengths for the wire it was sent (the segment's `alignment`), or null */
export declare function sentencesOf(u: { pieces: Piece[] }, ser: { wire: string }, text: string, alignment: { source: number[]; target: number[] } | undefined, pieces: Piece[], tolerant?: boolean, format?: 'markers' | 'tags'): Sentences | null
/** a unit → the tags wire (an LLM's, Google's): <x id="n"/> for an opaque piece, <t id="n">…</t> around a formatting pair */
export declare function serializeTags(u: { pieces: Piece[] }): { wire: string; slots: unknown[]; lead: string; trail: string }
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
