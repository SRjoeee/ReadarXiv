/** the marking's texts the fixture's base page was marked with (base.json's `texts`), or null where the record holds none */
export declare function textsOf(base: string): string[] | null
/** the macros TeX said set no ink when the fixture's base page was marked (base.json's `inkless`), or null */
export declare function inklessOf(base: string): string[] | null
/** the wrapped page of a fixture: { file, head } (the gate's own wrap of base.pdf by the engine's wrapFinal) */
export declare function wrapOf(o: { engine: string; out: string; base: string; layoutFile: string; source: string | null; runs?: Map<string, unknown> }): Promise<{ key: string; file: string; head: Record<string, unknown>; headFile: string }>
