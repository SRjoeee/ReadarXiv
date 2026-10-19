// face-identity.mjs's types, for its tests
export interface Found { sha256: string; bytes: number }
export declare function treeFaces(faces?: Readonly<Record<string, { id: string; file: string; source: string }>>): [id: string, file: string][]
export declare function readFound(stdout: string): Map<string, Found | null>
export declare function compareTrees(byYear: Record<string, Map<string, Found | null>>, faces?: [string, string][], metrics?: Readonly<Record<string, { sha256: string }>>): { same: string[]; differ: { id: string; file: string; years: string[] }[]; missing: { id: string; file: string; years: string[] }[] }
export declare function facesInImage(year: string, files: string[], o?: { env?: Record<string, string | undefined>; ask?: (args: string[]) => Promise<{ stdout: string }> }): Promise<Map<string, Found | null>>
export declare function yearsOf(argv: readonly string[], pins: { default: string; images: Record<string, unknown> }): string[]
