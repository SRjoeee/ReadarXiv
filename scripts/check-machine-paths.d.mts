// The types of check-machine-paths.mjs, for the TypeScript that calls it (its own tests); the script itself stays plain node
export declare const MACHINE_PATH: RegExp
export declare const PARKED: string
export declare const MADE_UP: Map<string, string[]>
export type MachinePath = { line: number; path: string }
export declare function pathsIn(text: string, allowed?: readonly string[]): MachinePath[]
export declare function check(root?: string, files?: readonly string[]): { held: (MachinePath & { file: string })[]; read: number }
