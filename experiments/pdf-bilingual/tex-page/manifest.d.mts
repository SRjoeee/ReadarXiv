// manifest.mjs's types, for the tests
export type Visit = { paper: string; engine: string; script?: string | null; first?: boolean; keys: Set<string> }
export declare function buildManifest(visits: Visit[], options: { threshold: number }): { engines: Record<string, string[]>; fonts: Record<string, string[]> }
export declare function slimSets(basic: string[], opened: Record<string, Set<string>>, options?: { leave?: Record<string, (path: string) => boolean>; always?: (path: string) => boolean }): { common: string[]; pdftex: string[]; xetex: string[]; rest: string[] }
