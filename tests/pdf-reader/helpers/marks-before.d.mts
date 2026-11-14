// marks-before.mjs's types: the layout marks as they were at 9461947a4, the reference the code change of the typing lane T6 is
// held to (tests/pdf-reader/marks-bounds.test.ts), each function as the test calls it, on any input
type Unit = { pieces: unknown[]; [field: string]: unknown }
export declare const MARK_CLASSES: readonly string[]
export declare const commandOf: (p: unknown) => string | null
export declare function probeSamples(units: readonly Unit[], complete?: unknown): { command?: string; key?: string; src: string; own?: true; ahead?: true }[]
export declare function aheadSamples(units: readonly Unit[]): { key: string; src: string }[]
export declare function inkSamples(units: readonly Unit[]): string[]
export declare function completeCalled(units: readonly Unit[], complete: unknown): Record<string, number> | null
export declare function layoutMarking(units: readonly Unit[], classes: readonly string[], o?: Record<string, unknown>): { units: Unit[]; mark: (u: Unit) => unknown }
export declare function followsOf(units: readonly Unit[], names: ReadonlySet<string>, texts?: unknown, inkless?: unknown): (name: string) => unknown
export declare function headsOf(units: readonly Unit[], names: ReadonlySet<string>): (start: string) => unknown
