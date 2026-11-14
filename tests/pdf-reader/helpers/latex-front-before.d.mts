// latex-front-before.mjs's types: the source reader as it was at 074329318, the reference its code changes of the typing lane T6
// are held to (tests/pdf-reader/latex-front-bounds.test.ts), each function as the test calls it, on any input
type Fsys = { list(): string[]; read(path: string): Uint8Array | null }
type Unit = { pieces: unknown[]; [field: string]: unknown }
export declare function inMemory(map: Map<string, Uint8Array>): Fsys
export declare const latin1: (bytes: unknown) => string
export declare const texText: (bytes: Uint8Array) => string
export declare const latin1Bytes: (s: string) => Uint8Array
export declare function identifiersIn(s: string): [number, number][]
export declare const identifierSource: (src: unknown) => boolean
export declare function loadProject(fsys: Fsys, main: string, options?: { tables?: boolean }): { units: Unit[]; [field: string]: unknown }
export declare function texFilesOf(fsys: Fsys, main: string): string[]
export declare function documentBounds(s: string, options?: Record<string, unknown>): { begin: number; body: number; end: number }
export declare function inputencOf(s: string, options?: Record<string, unknown>): { start: number; end: number; options: string } | null
export declare function urlPercents(text: string, file: string, scan?: Record<string, unknown>): string
export declare function completeMacros(files: readonly { file?: string; text: string }[]): [string, number][]
export declare function patch(project: unknown, translated: Map<unknown, unknown[]>, options?: Record<string, unknown>): Map<string, Uint8Array>
export declare const markUnits: (units: readonly unknown[], translated?: Map<unknown, unknown> | null) => (unit: unknown) => unknown
export declare function frontMarks(units: readonly unknown[]): (unit: unknown) => unknown
export declare const calledAt: (unit: unknown) => number | undefined
export declare function startOf(pieces: readonly unknown[]): [number, number]
export declare function unitText(unit: unknown): string
