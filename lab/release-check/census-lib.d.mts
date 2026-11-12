// census-lib.mjs's types, for its tests (tests/scripts/census.test.ts)
export interface Threshold { value: number; raw: string; name: string | null; line: number; context: string; class: 'conversion' | 'structural' | 'code' | 'budget' | 'borderline' | 'tuned'; evidence: boolean; reason: boolean; cites: string | null; other?: string; unit?: 'time' | 'bytes' | 'pixels' | 'count'; source?: 'measured' | 'platform' | null }
export interface Facts {
  path: string
  kind: 'code' | 'decl' | 'style' | 'data' | 'html' | 'other'
  lines: { code: number; comment: number; blank: number }
  generated: boolean
  ported: boolean
  copied: boolean
  parsed: boolean
  thresholds?: Threshold[]
  lists?: { line: number; name: string | null; size: number; form: 'list' | 'regex'; sample: string[]; class: 'defined' | 'listed' }[]
  vocabularies?: { line: number; name: string | null; size: number; form: 'list'; sample: string[]; class: 'vocabulary' }[]
  papers?: { id: string; line: number }[]
  texFiles?: { name: string; line: number }[]
  versions?: { name: string; value: string | number; line: number; schema: boolean }[]
  functions?: { line: number; endLine: number; name: string | null; code: number; tokens?: number; digest?: string | null }[]
  casts?: { cast: number[]; unsafe: number[]; nonNull: number }
  history?: { todays: number[]; dated: number[]; measuredDates: number[]; named: number[] }
  [k: string]: unknown
}
export interface Profile {
  name: string
  areas: { prefix: string; area: string; role: string }[]
  aliases?: { from: string; to: string; importerUnder?: string }[]
  exclude?: string[]
  workspaces?: string[]
  pin?: { prefix: string; repo: string }
  publicEntries?: { packageExports?: string; files?: string[] }
  engineAreas?: string[]
  debtAreas?: string[]
  builds?: { name: string; entries?: unknown; today?: string[]; v2?: string[]; cut?: { switch: string | string[]; seeds: string[]; why: string }; why?: string }[]
}
export interface Scan { repo: string; root: string; profile: Profile; files: Map<string, Facts & { area: string; role: string }> }
export declare function factsOf(path: string, text: string, options?: { tokens?: boolean }): Facts
export declare function lineKinds(text: string, comments: [number, number][]): ('code' | 'comment' | 'blank')[]
export declare function thresholdOf(t: { value: number; raw: string; name: string | null; comment: string; line: number; context: string }): Threshold
export declare function alternativesOf(pattern: string): string[]
export declare function scanTree(repo: string, root: string, profile: Profile, options?: { tokens?: boolean }): Scan
