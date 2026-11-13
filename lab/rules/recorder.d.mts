// recorder.mjs's types
import type { SiteMap } from './sites.mjs'

export interface Case { d: number; eff: number; x: unknown; b: unknown; k: number; paper: string | null; page?: number | null; test: string | null }
export interface Tests { kept: string[]; more: number }
export interface RawSite { n: number; t: number; f: number; nan?: number; near?: (Case | null)[]; tests?: (Tests | null)[]; hits?: Record<string, number>; reads?: Record<string, number>; ps?: string[] }
export interface Raw { format: string; map: string; input: string; file?: string | null; labRead?: boolean; pid: number; paper: string | null; papers?: string[]; loaded?: string[]; argv: string[]; ms: number; sites: Record<string, RawSite> }
export interface Recorder {
  map: SiteMap
  lt(id: number, a: unknown, b: unknown): boolean
  le(id: number, a: unknown, b: unknown): boolean
  gt(id: number, a: unknown, b: unknown): boolean
  ge(id: number, a: unknown, b: unknown): boolean
  eq(id: number, a: unknown, b: unknown): boolean
  ne(id: number, a: unknown, b: unknown): boolean
  mn(id: number, ...args: number[]): number
  mx(id: number, ...args: number[]): number
  v<T>(id: number, x: T): T
  ls<T>(id: number, arr: T): T
  st<T>(id: number, set: T): T
  re<T>(id: number, rx: T): T
  hush(...sources: unknown[]): void
  ns<T>(set: T, ...sources: unknown[]): T
  loaded(path: string): void
  context(next: { paper?: string | null; test?: string | null; file?: string | null; page?: number | null }): void
  readonly current: { paper: string | null; test: string | null; file: string | null; page: number | null }
  snapshot(extra?: object): Raw
  flush(label?: string | null, extra?: object): string | null
}
export declare const RAW_FORMAT: string
export declare function recorderOf(map: SiteMap, options?: { out?: string | null; paper?: string | null; input?: string }): Recorder
export declare function install(options?: { input?: string | null }): Recorder
