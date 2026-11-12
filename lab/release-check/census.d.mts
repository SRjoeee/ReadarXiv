// census.mjs's types, for its tests (tests/scripts/census.test.ts) and release-check's census rows (gates.mjs)
import type { Scan } from './census-lib.mjs'
import type { Ledger, Line, Part } from './census-ratchet.mjs'
type Counts = Record<string, number>
export interface Tree {
  size: { engine: { code: number; all: number; generated: number; byArea: Counts }; generated: { files: number; code: number; list: { file: string; code: number }[] }; product: { modules: number; code: number } }
  graph: { cycles: { count: number; modules: number }; between: Counts; areaPairs: number; betweenStatements: number }
  webImports: { product: Counts; test: Counts; internals: number; extensionSource: number } | null
  chains: { count: number; orders: number; chains: { file: string; kinds: string[]; builds: string[]; implementation: string[] }[]; implementations: { id: string; file: string; hosts: string[] }[] }
  gpl: { file: string; repo: string; path: string; code: number; role: string; reachedBy: { build: string; path: string[] }[] }[]
  debt: {
    thresholds: { all: Counts; headline: Counts; headlineTunedNoReason: number; list: { class: string; name: string | null; unit?: string; source?: string | null; at: string }[] }
    budgets: { count: number; unmeasured: number; headline: number; headlineUnmeasured: number; byUnit: Counts; bySource: Counts }
    vocabularies: { count: number; headline: number; list: { form: string; size: number; name: string | null; at: string }[] }
    lists: { headline: Counts; list: { form: string; size: number; name: string | null }[] }
    papers: { id: string; at: string }[]
    texFiles: { name: string; at: string }[]
    versions: { count: number; mirrors: number; schema: number; content: number; list: { name: string; value: string | number; at: string; mirror: boolean; schema: boolean }[] }
  }
  types: { engine: number; engineAll: number; unchecked: number; mjs: number; any: number; nocheck: string[]; suppressions: number; casts: number; unsafeCasts: number; nonNull: number; packages: { suppressions: number; casts: number; unsafeCasts: number; nonNull: number } }
  duplicates: { groups: number; lines: number; copied: string[] }
  dead: { modules: number; moduleList: string[]; deadExportList: string[]; deadExports: number; testOnlyExports: number }
  functions: { count: number; longest: Fn | null; over500: number; over1000: number; over1000List: Fn[]; ten: Fn[]; tenLongest: number; byRepo: Record<string, { longest: Fn | null; over500: number; over1000: Fn[]; ten: Fn[]; tenLongest: number }> }
  history: { files: number; todays: number; dated: number; measuredDates: number; named: number; lines: number; byFile: { repo: string; file: string; lines: number; at: number[] }[] }
}
type Fn = { repo: string; file: string; line: number; name: string; code: number; at: string }
export interface Census {
  trees: { TODAY?: Tree; NOW: Tree; AFTER: Tree }
  cutover: { partial: boolean; deleted: { files: number; code: number; list: string[] }; goWith: { files: number; code: number; list: string[] } }
}
export declare const DEFINITIONS: Record<string, string>
export declare function census(trees: { today: Scan[] | null; now: Scan[] }): Promise<Census>
export declare function headlineOf(c: Census): { id: string; measure: string; values: unknown[]; target: string | null }[]
export declare function numbersOf(c: Census): Record<string, unknown>
type Judged = { current: { NOW: Part; AFTER: Part | null }; lines: Line[] }
export declare function ratchetOf(c: Census, ledgers: { engine: Ledger | null; web?: Ledger | null }, newLines?: { engine?: Map<string, Set<number> | 'all'> | null; web?: Map<string, Set<number> | 'all'> | null }): { engine: Judged; web?: Judged }
