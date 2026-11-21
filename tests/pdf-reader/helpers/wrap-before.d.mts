// wrap-before.mjs's types: the wrap as it was at d453c14ee, the reference its reads by kind are held to
/** our final pass (or arXiv's file) wrapped by optional content, as the test reads it: its result whole, or a refusal */
export declare function wrapOf(finalBytes: Uint8Array, plans: Map<number, unknown>, o: Record<string, unknown>): Promise<unknown>
/** a page's plan as wrapOf takes it, from the groups of its glyphs and boxes */
export declare function planOf(glyphs: { n?: number; k?: number }[], groupOfGlyph: (string | null)[], paths: ArrayLike<number>, groupOfBox: (string | null)[], facts?: unknown): unknown
