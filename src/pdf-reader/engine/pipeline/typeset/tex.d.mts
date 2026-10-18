// tex.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { SourceUnit, UnitMark } from '../../source/latex-front.mjs'
import type { Strategy } from '../scripts.mjs'
import type { AlphabetDesign, CjkDesign, Type } from './type.mjs'

/** once the last page is out, AXT-END in the log (completeLog): every compile carries it */
export declare const END_TEX: string
export declare const LINES_TEX: string
export declare const FLOAT_TEX: string
export declare const SIZE_TEX: string
/** whether a compile's last pass reached the document's end (END_TEX's AXT-END) */
export declare const completeLog: (log: string | null | undefined) => boolean
export declare const readForced: (log: string | null | undefined) => Set<number>
export declare const readLines: (log: string | null | undefined) => Map<number, { lines: number; bs: number; size?: number }>
export interface TypesetPlan { design: CjkDesign | AlphabetDesign; strategy: string; type: Type; leads: Map<number, number>; sizes: Map<number, number>; floatsAt: Map<number, { page: number; col: number }>; tableMin: number }
/** what a typeset plan adds to a compile of the translation (live.mjs translationFiles' `typeset`) */
export interface Typeset {
  head: string
  /** the name of the strategy the plan was made for */
  for: string
  strategy(s: Strategy): Strategy
  mark(base: (u: SourceUnit) => UnitMark, translated: Map<SourceUnit, unknown[]>): (u: SourceUnit) => UnitMark
  /** the same for the final: no line probes, which nothing reads there */
  final?: Typeset
}
export declare function typesetting(units: SourceUnit[], plan: TypesetPlan): Typeset & { final: Typeset }
