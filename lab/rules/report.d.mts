// report.mjs's types
import type { Ledger } from './ledger.mjs'

export interface AreaCounts { rules: number; thresholds: number; lists: number; verdicts: Record<string, number>; folds: number; entries: number }
export declare function reportOf(ledger: Ledger, options?: { budgets?: { class: string; source?: string | null; file: string; line: number; name: string | null; value: number; unit?: string }[] | null; profile?: string | null; deferred?: string[] }): { byArea: string; byFile: string; counts: Record<string, AreaCounts> }
