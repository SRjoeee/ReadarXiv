// ink-units-before.mjs's types: the ink units' maker as it was at 0a3585fd0, the reference its sourceView through latin1 is held to
/** the ink units of a document */
export declare function inkUnitsOf(pages: readonly unknown[], ledger: unknown, o: Record<string, unknown>): unknown[]
/** the kept blocks of what no unit owns */
export declare function keptUnitsOf(pages: readonly unknown[], ledger: unknown, owner: (page: number, glyph: number) => string | null, o: { from: number }): unknown[]
/** the glyphs and rules the ink units claim */
export declare function claimInk(own: unknown, ink: readonly unknown[], pages: readonly unknown[]): number
