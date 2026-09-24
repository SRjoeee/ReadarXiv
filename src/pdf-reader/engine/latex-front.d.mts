// latex-front.mjs's types (JavaScript until the engine's port), for the reader's tests
export interface SourceUnit { kind: string; title?: boolean; depth?: number; pieces: unknown[] }
/** a source tree held in memory: path → bytes */
export declare function inMemory(map: Map<string, Uint8Array>): { list(): string[]; read(path: string): Uint8Array | null }
/** a paper's source read from its main file: its units, the paper's prose in reading order */
export declare function loadProject(root: ReturnType<typeof inMemory>, main: string, options?: { tables?: boolean }): { units: SourceUnit[] }
