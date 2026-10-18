// kpathsea.mjs's types, for the tests
export declare const FORMAT_VARS: Record<number, string[]>
export declare const PROGRAMS: Record<string, { progname: string; engine: string }>
export declare function parseCnf(text: string): Map<string, { program: string | null; value: string }[]>
export declare function searchPath(vars: Map<string, { program: string | null; value: string }[]>, format: number, program: string): string[]
export declare function braces(s: string): string[]
export declare function inElement(dir: string, element: string): boolean
export declare function lsrCompare(a: string, b: string): number
export declare function searchPaths(vars: Map<string, { program: string | null; value: string }[]>): Record<number, Record<string, string[]>>
