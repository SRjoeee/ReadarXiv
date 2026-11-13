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
export declare const LEDGER_FORMAT: string
export declare const OWN_INPUT: string
export declare const VERDICTS: Record<string, { reason: boolean | null; says: string }>
export declare function citationsOf(comment: string | null | undefined): Citation
export declare function readsOf(sites: { reads?: Record<string, number> }[]): Record<string, number>
export declare function ledgerOf(map: SiteMap, recording: Recording, options?: { holdout?: string[] | null }): Ledger
export declare function recordedOf(row: Row): string
