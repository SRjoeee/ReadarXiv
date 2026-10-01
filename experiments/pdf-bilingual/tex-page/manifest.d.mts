// manifest.mjs's types, for the tests
export type Visit = { paper: string; engine: string; script?: string | null; first?: boolean; keys: Set<string> }
export type Shares = { papers: number; shares: Record<string, number> }
export declare const REFERENCE: { mbit: number; rtt: number }
export declare function worth(link: { mbit: number; rtt: number }): (bytes: number, share: number) => boolean
export declare function sharesOf(visits: Visit[]): { groups: Record<string, Shares>; pooled: Record<string, Shares> }
export declare function buildManifest(shares: { groups: Record<string, Shares>; pooled: Record<string, Shares> }, keep: (key: string, share: number) => boolean): { engines: Record<string, string[]>; fonts: Record<string, string[]> }
export declare function slimSets(basic: string[], kept: Record<string, Set<string>>, options?: { always?: (path: string) => boolean }): { common: string[]; pdftex: string[]; xetex: string[]; rest: string[] }
export declare function scannedOnly(engine: string, path: string): boolean
