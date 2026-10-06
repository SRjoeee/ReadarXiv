// run.mjs's types: the layer v0's driver, the prototype's page (main.js, ported at 9e56fca)
import type { Audit, CheckResult } from './check.mjs'
import type { Rect } from './layer1.mjs'
import type { Block2, Char, Layout, Params, Prepared, Token, Unit } from './layer2.mjs'

/** the made output's geometry (schema 1): the pages' views, each unit's [id, stream, rects] on the original, its kind */
export interface Geometry { schema: number; kinds: string[]; left: { pages: number[][]; units: [number, number, Rect[]][] }; right?: unknown }
/** a unit v0 places: its rectangles on the pages shown, its pages, and once laid its reading, tokens, blocks and layout */
export interface Placed { id: number; stream: number; rects: Rect[]; unit: Unit; pages: number[]; cut: boolean; blocks: Block2[]; prep?: Prepared; tokens?: Token[]; layout?: Layout; s?: number; rec?: Rec; local?: Char[][] }
/** a page's canvases (the original, its copy) and its SVG, at `w` × `h` CSS px */
export interface Row { page: number; left: HTMLCanvasElement; right: HTMLCanvasElement; svg: SVGSVGElement; w: number; h: number; base: boolean; view?: number[]; released?: boolean }
/** a laid unit's record, as main.js kept it (each line: page, baseline, target baseline, exact, mode, overflow, x0, x1) */
export interface Rec {
  id: number; kind: string; v: 2; pages: number[]; cut: boolean; s?: number; f?: number; fitScale: number; knob: string; clipped: boolean
  lostChars: number; chars: number; lead: number; lines: (number | string | boolean | null)[][]; match?: { match: number; total: number; base?: boolean }
  sizeRatio?: number; modes: Record<string, number>; [more: string]: unknown
}
export declare const PDF_OPTIONS: { cMapPacked: true; enableHWA: true; disableStream: true }
export declare const PARAM_KEYS: readonly string[]
/** main.js's lay order, by the page whose drawing lays each unit: [page, ids] */
export declare function layGroups(placed: readonly { id: number; pages: readonly number[] }[], batch?: number): [number, number[]][]
export declare const layOrder: (placed: readonly { id: number; pages: readonly number[] }[], batch?: number) => number[]
export interface ProtoRun {
  N: number
  P: Params
  rows: Row[]
  placed: Placed[]
  skipped: { id: number; kind: string; why: string; chars: number; pages?: number[] }[]
  stats: Rec[]
  audit: Audit[]
  order: number[]
  ms: Map<number, number>
  pageMs: number[]
  chars: Char[][]
  views: { convertToViewportPoint(x: number, y: number): number[]; convertToPdfPoint(x: number, y: number): number[] }[]
  readonly designs: { serif: string; sans: string; mono: string }
  doneAt(page: number): number
  until(page: number): Promise<void>
  release(page: number): void
  checkPage(page: number): CheckResult
  check(): CheckResult
}
export declare function openProto(o: {
  doc: { numPages: number; getPage(n: number): Promise<unknown> }
  geometry: Geometry
  units: Unit[]
  target: string
  pages?: number
  scale?: number
  dpr?: number
  params?: Partial<Params>
  batch?: number
  phMode?: 'auto' | 'source'
  restoring?: boolean
  order?: number[] | null
  faces?: 'roles' | 'prototype'
  faceUrl?: (file: string) => string
  fontUrl?: (file: string) => string
  hyphUrl?: (lang: string) => string
}): Promise<ProtoRun>
