// sites.mjs's types, for the rule ledger's tests (tests/scripts/rules.test.ts) and its other modules' declarations
import type { Scan } from '../release-check/census-lib.mjs'

export interface Rule {
  key: string
  kind: 'threshold' | 'list'
  file: string
  line: number
  fn: string
  name: string | null
  area: string
  after: boolean | null
  class: string
  sites: number[]
  value?: number
  raw?: string
  context?: string
  other?: string | null
  why?: string
  comment?: string
  reason?: boolean
  evidence?: boolean
  cites?: string | null
  form?: string
  size?: number
  entries?: string[]
  unsited?: string
  unwrapped?: number
  /** a list's reads the recorder cannot see (an index, a copy the platform makes), each `<form> <file>:<line>` */
  unseen?: string[]
  wholeReads?: number
}
export interface Bound { rule: string; at?: 'left' | 'right' | number; shape: string; value?: number }
export interface Site {
  id: number
  kind: 'cmp' | 'eq' | 'mm' | 'val' | 'list' | 'set' | 're'
  file: string
  line: number | null
  fn: string
  rules: string[]
  bounds: Bound[]
  op?: string
  call?: string
  args?: number
  entries?: string[]
  flags?: string
}
export interface Edit { at?: number; end?: number; pre?: string; post?: string; replace?: [number, number]; text?: string; listNode?: boolean }
export interface SiteMap {
  format: string
  commit: string | null
  digest: string
  rules: Record<string, Rule>
  sites: Site[]
  files: Record<string, { sha256: string; edits: Edit[]; sites: number[]; importers?: string[] }>
}
export declare const SITES_FORMAT: string
export declare const RULE_AREAS: string[]
export declare function fileKeyOf(path: string): string
export declare function sitesOf(scan: Scan, graph: unknown, options?: { alive?: Set<string> | null; areas?: string[] }): Pick<SiteMap, 'rules' | 'sites' | 'files'>
export declare function sitesOfTree(root: string, profile: unknown, options?: { alive?: Set<string> | null; areas?: string[] }): Pick<SiteMap, 'rules' | 'sites' | 'files'> & { scan: Scan; graph: unknown }
export declare function siteMapOf(s: Pick<SiteMap, 'rules' | 'sites' | 'files'>, options?: { commit?: string | null }): SiteMap
