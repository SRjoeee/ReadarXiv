// census.mjs's types, for its tests (tests/scripts/census.test.ts) and release-check's census rows (gates.mjs)
import type { Scan } from './census-lib.mjs'
type Counts = Record<string, number>
export interface Tree {
  size: { engine: { code: number; all: number; generated: number; byArea: Counts }; generated: { files: number; code: number; list: { file: string; code: number }[] }; product: { modules: number; code: number } }
  graph: { cycles: { count: number; modules: number }; between: Counts; areaPairs: number; betweenStatements: number }
  webImports: { product: Counts; test: Counts; internals: number; extensionSource: number } | null
  chains: { count: number; chains: { file: string; kinds: string[]; builds: string[] }[] }
  gpl: { file: string; code: number; role: string; reachedBy: { build: string; path: string[] }[] }[]
  debt: {
    thresholds: { all: Counts; headline: Counts; headlineTunedNoReason: number; list: unknown[] }
    lists: { headline: Counts; list: { form: string; size: number }[] }
    papers: { id: string; at: string }[]
    texFiles: { name: string; at: string }[]
    versions: { count: number; mirrors: number; list: { name: string; value: string | number; at: string }[] }
  }
  types: { engine: number; engineAll: number; unchecked: number; mjs: number; any: number; nocheck: string[] }
  duplicates: { groups: number; lines: number; copied: string[] }
  dead: { modules: number; moduleList: string[]; deadExportList: string[]; deadExports: number; testOnlyExports: number }
}
export interface Census {
  trees: { TODAY?: Tree; NOW: Tree; AFTER: Tree }
  cutover: { partial: boolean; deleted: { files: number; code: number; list: string[] }; goWith: { files: number; code: number; list: string[] } }
}
export declare const DEFINITIONS: Record<string, string>
export declare function census(trees: { today: Scan[] | null; now: Scan[] }): Promise<Census>
export declare function headlineOf(c: Census): { id: string; measure: string; values: unknown[]; target: string | null }[]
export declare function numbersOf(c: Census): Record<string, unknown>
