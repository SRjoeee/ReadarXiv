// merge.mjs's types
import type { Case, Tests } from './recorder.mjs'
import type { SiteMap } from './sites.mjs'

export interface SiteSums { n: number; t: number; f: number; nan: number; near: (Case | null)[]; tests: (Tests | null)[]; hits: Record<string, number> | null; reads: Record<string, number> | null; papers: number }
export interface RuleSums { n: number; t: number; f: number; decisions: number; reads: number }
export interface Recording {
  format: string
  map: string
  commit: string | null
  records: number
  inputs: Record<string, { records: number; papers: string[]; ms: number; loaded?: string[] | null }>
  agreement: { rules: number; ran: number; sites: number; sitesRun: number; line: string }
  sites: Record<string, Record<string, SiteSums>>
  rules: Record<string, Record<string, RuleSums>>
}
export declare const RECORDING_FORMAT: string
export declare function mergeRecords(map: SiteMap, dirs: string[]): Recording
