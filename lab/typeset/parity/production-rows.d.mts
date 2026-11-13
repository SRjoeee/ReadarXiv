// production-rows.mjs's types, for its tests (tests/scripts/release-check.test.ts)
export type Row = [id: number, pieces: (string | number)[], state: string, ...more: unknown[]]
export interface RowsAgainst { rows: number; same: number; missing: number[]; extra: number[]; moved: { id: number; from: string; to: string }[]; differ: number[]; held: number[] }
export declare function rowsAgainst(stored: readonly Row[], made: readonly Row[], held?: readonly number[]): RowsAgainst
export declare function isProduction(c: RowsAgainst): boolean
export declare function lineOf(pair: string, c: RowsAgainst): string
