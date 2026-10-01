// tex-tree.mjs's types, for the tests
export declare const SUFFIXES: Record<number, string[]>
export declare const ALT_SUFFIXES: Record<number, string[]>
export declare function candidates(format: number, name: string): string[]
export declare function indexText(paths: string[]): string
export declare function parseIndex(text: string): Map<string, string>
export declare function resolve(index: Map<string, string>, format: number, name: string): string | null
export type Fetched = { bytes: Uint8Array; path: string } | { missing: true } | { network: true }
export declare function treeFetcher(options: { index: Map<string, string>; base: string; get: (url: string) => { status: number; bytes: Uint8Array | null } }): {
  fetch(name: string, format: number): Fetched
  failures(): string[]
  takeFailures(): string[]
}
