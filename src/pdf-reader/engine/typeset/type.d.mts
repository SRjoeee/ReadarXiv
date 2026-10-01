// type.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { SizeStep } from './density.mjs'

type Range = [number, number]
export interface CjkDesign { cjk: true; base: { lead: number; track: number; scale: number }; lead: Range; track: Range; scale: Range }
/** an alphabet's, or CJK's under CJKutf8 (`scalable`: every size as wide as it is) */
export interface AlphabetDesign { cjk: false; base: number; size: Range; lead: Range; scalable?: boolean }
export type Design = CjkDesign | AlphabetDesign
/** a type: CJK's leading, tracking and scale; an alphabet's leading, size and how wide the face sets there (`h`) */
export interface Type { lead: number; track?: number; scale?: number; size?: number; h?: number; ratio?: number }
/** what the solver needs of a unit (density.mjs MeasuredUnit) */
export interface TypeUnit { i: number; lo: number; bs: number; cap: number; width(type?: { scale?: number; track?: number }): number }
export declare const DESIGN: Record<'Hans' | 'Hant' | 'Jpan' | 'Kore', CjkDesign> & Record<'Latn' | 'Cyrl', AlphabetDesign> & Record<string, Design>
/** the design a strategy can set: its script's, CJK's under CJKutf8 a size and a leading; null for a script with none */
export declare function designFor(script: string, strategy: { name?: string; xe?: boolean } | null | undefined): Design | null
export declare function heightRatio(units: TypeUnit[], design: Design, type: Type): number
export declare function heightAtSize(u: TypeUnit, design: Design, type: Type, f?: number): number
export declare function unitHeights(units: TypeUnit[], design: Design, type: Type): Map<number, number>
export declare function cjkType(a: number, base: CjkDesign['base'], ranges: { lead: Range; track: Range; scale: Range }): { lead: number; track: number; scale: number; reached: number }
export declare function solveType<U extends TypeUnit>(units: U[], design: Design, sizes?: SizeStep[] | null): Type
