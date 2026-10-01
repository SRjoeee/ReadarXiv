// tex.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { SourceUnit, UnitMark } from '../latex-front.mjs'
import type { Strategy } from '../scripts.mjs'
import type { Type } from './type.mjs'

export declare const LINES_TEX: string
export declare const FLOAT_TEX: string
export declare const SIZE_TEX: string
export declare const readForced: (log: string | null | undefined) => Set<number>
export declare const readLines: (log: string | null | undefined) => Map<number, { lines: number; bs: number; size?: number }>
export interface TypesetPlan { cjk: boolean; type: Type; leads: Map<number, number>; sizes: Map<number, number>; floatsAt: Map<number, { page: number; col: number }>; tableMin: number }
/** what a typeset plan adds to a compile of the translation (live.mjs translationFiles' `typeset`) */
export interface Typeset {
  head: string
  strategy(s: Strategy): Strategy
  mark(base: (u: SourceUnit) => UnitMark, translated: Map<SourceUnit, unknown[]>): (u: SourceUnit) => UnitMark
}
export declare function typesetting(units: SourceUnit[], plan: TypesetPlan): Typeset
