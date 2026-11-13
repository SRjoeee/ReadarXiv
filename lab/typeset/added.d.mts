// added.mjs's types, for its tests (tests/lab/added.test.ts, tests/scripts/release-check.test.ts)
export declare const ADDED: readonly string[]
export declare const ADDED_HEADING: string
export declare const ADDED_DIR: string
export declare function isAdded(pair: string): boolean
export declare function addedEnv(lab?: string): { AXT_LAB_DATA: string; AXT_SWEEP_CACHE: string }
export declare function apartOf(listed: readonly string[], o: { named: boolean; argv?: readonly string[] }): { pairs: string[]; later: string[]; apart: boolean }
export declare function runApart(script: string, later: readonly string[], o?: { argv?: readonly string[]; dirs?: Record<string, string> }): number
