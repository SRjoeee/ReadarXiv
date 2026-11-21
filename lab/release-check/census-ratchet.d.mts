// census-ratchet.mjs's types, for its tests (tests/scripts/census.test.ts)
export interface Item { repo: string; file: string; line: number | null; w: number }
export interface Part { values: Record<string, number>; files: Record<string, Record<string, number>>; items: Record<string, Item[]> }
export interface LedgerTree { values: Record<string, number>; files: Record<string, Record<string, number>> }
export interface Ledger {
  format: string
  about: string
  recorded: { commit: string | null; at: string }
  trees: { NOW?: LedgerTree; AFTER?: LedgerTree }
  raises: { tree: string; measure: string; from: number; to: number; reason: string; commit: string | null; at: string }[]
}
export interface Line { tree: string; measure: string; says: string; status: 'rise' | 'fall' | 'hold' | 'new' | 'skipped'; recorded: number | null; value: number | null; why?: string; added?: { file: string; from: number; to: number; entries: string[] }[] }
export declare const LEDGER_FORMAT: string
export declare const MEASURES: { id: string; says: string; repo?: string; crossRepo?: boolean }[]
export declare function partOf(items: Record<string, Item[]>, repo: string): Part
export declare function newLinesOf(root: string, commit: string): Map<string, Set<number> | 'all'> | null
export declare function judge(ledger: Ledger | null, current: { NOW: Part; AFTER: Part | null }, options: { web: boolean; newLines?: Map<string, Set<number> | 'all'> | null; repo: string }): Line[]
export declare function record(ledger: Ledger | null, current: { NOW: Part; AFTER: Part | null }, lines: Line[], options: { raise?: string[]; reason?: string; commit: string | null; at: string; about: string }): Ledger
export declare function reportOf(repo: string, lines: Line[], ledger: Ledger | null, recorded?: boolean): string[]
