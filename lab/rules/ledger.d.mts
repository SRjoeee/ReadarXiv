// ledger.mjs's types
import type { Recording } from './merge.mjs'
import type { SiteMap } from './sites.mjs'

export interface Citation { flag: 'paper' | 'definition' | 'measurement' | 'tuned' | null; papers: string[]; definition: string | null; section: string | null; measurement: boolean; tuned: boolean }
export interface SiteRow {
  id: number
  file: string
  line: number | null
  fn: string
  kind: string
  op?: string
  shape: string | null
  state: 'decides' | 'test' | 'one' | 'never' | 'read'
  outcome?: boolean
  outcomes: Record<string, { n: number; t: number; f: number }>
  reads?: Record<string, number>
  hits?: Record<string, number>
  margin?: { false: object | null; true: object | null; units: 'rule' | 'slack' }
  tests?: { false: string[]; true: string[] }
}
export interface Row {
  key: string
  file: string
  line: number
  area: string
  kind: 'threshold' | 'list'
  name: string | null
  entries?: string[]
  value?: number
  raw?: string
  context?: string
  class: string
  after: boolean | null
  comment: string
  citation: Citation
  sites: SiteRow[]
  folds: number[]
  verdict: string
  removeEntries?: string[]
  entriesExempt?: boolean
  hits?: Record<string, number>
  reads?: number
  listReads?: Record<string, number>
  handedWhole?: number
  foldedToValue?: boolean
  module?: { loaded: boolean | null; importers: string[] | null }
}
export interface Ledger { format: string; about: string; recorded: { commit: string | null; sites: string; inputs: Recording['inputs'] }; holdoutAdds: string[]; rules: Record<string, Row> }
/** a test by its file and its ordinal there */
export type TestRef = [string, number]
export interface Case { d: number; eff: number; x: number; b: number; k: number; paper?: string; page?: number; test?: TestRef }
export interface TrackedRow {
  line: number
  kind: 'threshold' | 'list'
  value?: number
  size?: number
  entriesDigest?: string
  otherDigest?: string
  verdict: string
  cites?: { flag: string; papers?: string[] }
  runs?: Record<string, [number, number, number]>
  reads?: Record<string, number>
  margin?: { units: 'rule' | 'slack'; false: Case | null; true: Case | null }
  hits?: number[]
  tests?: { false?: Record<string, number[]>; true?: Record<string, number[]> }
  folds?: number
  module?: { loaded: boolean | null; importers: string[] | null }
}
export interface Tracked { format: string; about: string; recorded: { commit: string | null; sites: string; full: string; inputs: Record<string, { records: number; papers: number }> }; holdoutAdds: string[]; rules: Record<string, TrackedRow> }
export interface Resolved { rules: Record<string, { verdict: string; tests: { false?: (string | null)[]; true?: (string | null)[] }; margin: { units: string; false: (Omit<Case, 'test'> & { test?: string | null }) | null; true: (Omit<Case, 'test'> & { test?: string | null }) | null } | null }> }
export declare const LEDGER_FORMAT: string
export declare const TRACKED_FORMAT: string
export declare function digestOf(x: unknown): string
export declare function testsOf(full: Ledger): Record<string, string[]>
export declare function marginOf(row: Row): { units: 'rule' | 'slack'; false: Record<string, unknown> | null; true: Record<string, unknown> | null } | null
export declare function trackedOf(full: Ledger, options: { digest: string; map?: SiteMap | null }): Tracked
export declare function trackedText(tracked: Tracked): string
export declare function resolveTracked(tracked: Tracked, fullText: string): Resolved
export declare const OWN_INPUT: string
export declare const VERDICTS: Record<string, { reason: boolean | null; says: string }>
export declare function citationsOf(comment: string | null | undefined): Citation
export declare function readsOf(sites: { reads?: Record<string, number> }[]): Record<string, number>
export declare function ledgerOf(map: SiteMap, recording: Recording, options?: { holdout?: string[] | null }): Ledger
export declare function recordedOf(row: Row): string
