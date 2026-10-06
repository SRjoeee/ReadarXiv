// check.mjs's types: the prototype's completeness checker (ported from the prototype at 9e56fca)
import type { Placed, Row } from './run.mjs'

/** a region of the copy, described: its page, box (PDF units), pixels, the page's characters there, why */
export interface Region { page: number; box: number[]; px: number; text: string; cats: Record<string, number>; erasedBy: number[]; why?: string }
/** what a finding names: the unit, the placeholder (k), its page and the reason */
export interface Finding { unit: number; k: number | string; page?: number; why?: string; [more: string]: unknown }
export interface CheckResult {
  /** (a) ink lost; (a2) ink under the text; (a3) ink shown in an erased box */
  a: { regions: number; px: number; list: Region[] }
  a2: { regions: number; px: number; list: Region[] }
  a3: { regions: number; list: Region[] }
  /** (b) placeholders missing, drawn twice, in doubled brackets, displays not found, clipped */
  b: { missing: number; duplicated: number; brackets: number; unlocated: number; clipped: number; list: { missing: Finding[]; duplicated: Finding[]; brackets: Finding[]; unlocated: Finding[]; clipped: Finding[] } }
  /** (c) literal duplications, by who made them */
  c: { total: number; layer: number; translation: number; original: number; list: { unit: number; kind: string; page: number; text: string; by: 'layer' | 'translation' | 'original' }[] }
  /** (d) displayed equations' numbers found, and shown once */
  d: { found: number; ok: number; wrong: number; list: Record<string, unknown>[] }
}
export declare function checkAll(o: {
  N: number
  placed: readonly Placed[]
  rows: readonly Row[]
  pxOf: (page: number) => (x: number, y: number) => [number, number]
  toPdf: (page: number, x: number, y: number) => number[]
  chars2: readonly unknown[][]
  audit: readonly Audit[]
  cols: (page: number) => number[][]
  cellRects: (page: number) => number[][]
}): CheckResult
/** paintBase's record of what it did: each erase, crop and restore */
export interface Audit { what: 'erase' | 'crop' | 'restore'; unit: number; page: number; box?: number[]; k?: number; srcPage?: number; src?: number[]; dst?: number[]; boxes?: number }
