// mt.mjs's types (JavaScript until the engine's port), for the reader's tests
type Piece = { t: string; s?: string; src?: string; tr?: boolean; id?: number }
/** a unit's plain text in the source, placeholders dropped */
export declare function plainSource(u: { pieces: Piece[] }): string
/** a unit's plain text in its translation, as the compiled PDF shows it */
export declare function plainTranslated(pieces: Piece[]): string
/** a unit's plain text (the translation's where the pieces are translated) and the offsets in it where a placeholder stood */
export declare function unitText(pieces: Piece[]): { text: string; gaps?: number[] }
/** a unit → the wire text of the markers format, and the table from marker id back to the original piece */
export declare function serialize(u: { pieces: Piece[] }): { wire: string; slots: Piece[]; lead: string; trail: string; stops?: Set<number> }
/** the translation → pieces, or why it cannot be used */
export declare function rehydrate(text: string, ser: ReturnType<typeof serialize>, tolerant?: boolean): { pieces: Piece[] } | { error: string }
/** where each sentence after the first begins: offsets of its first word in the plain source and in the plain translation */
export type Sentences = { src: number[]; tr: number[] }
/** a unit's sentences from its engine's sentence lengths for the wire it was sent (the segment's `alignment`), or null */
export declare function sentencesOf(u: { pieces: Piece[] }, ser: ReturnType<typeof serialize>, text: string, alignment: { source: number[]; target: number[] } | undefined, pieces: Piece[], tolerant?: boolean): Sentences | null
/** each unit's text as a compile has it: translated where `done` has its pieces, with the sentences of those pieces */
export declare function textsShown<U extends { pieces: Piece[] }>(units: U[], done: Map<U, Piece[]>, sentencesOf: (pieces: Piece[]) => Sentences | undefined): ({ id: number; text: string; gaps?: number[]; lead?: string; trail?: string; inner?: string; sentences?: Sentences })[]
type Sent = { text: string; by: string | null; alignment?: { source: number[]; target: number[] } } | null
/** units → their translations, by unit: pieces, how they came back, the identity that answered, and a whole unit's sentences */
export declare function translateUnits<U extends { pieces: Piece[] }>(units: U[], send: (texts: string[]) => Promise<Sent[]>, format?: 'markers' | 'tags' | 'runs'): Promise<{ results: Map<U, { pieces?: Piece[]; state: string; by?: string; sentences?: Sentences }>; how: Record<string, number> }>
