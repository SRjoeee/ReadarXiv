// tex-tree.mjs's types, for the tests
export declare const SUFFIXES: Record<number, string[]>
export declare const ALT_SUFFIXES: Record<number, string[]>
export declare const SUFFIX_ONLY: Set<number>
export type SearchPaths = Record<string | number, Record<string, string[]>>
export type Index = { names: Map<string, string[]>; paths: SearchPaths; dependent?: Set<string> }
export declare function candidates(format: number, name: string): string[]
export declare function inElement(dir: string, element: string): boolean
export declare function parseIndex(text: string): Index
export declare function resolve(index: Index, format: number, name: string, program?: string): string | null
export type Fetched = { bytes: Uint8Array; path: string } | { missing: true } | { network: true }
export declare function treeFetcher(options: { index: Index; base: string; get: (url: string) => { status: number; bytes: Uint8Array | null }; program?: () => string }): {
  fetch(name: string, format: number): Fetched
  keyOf(name: string, format: number): string
  failures(): string[]
  takeFailures(): string[]
}
