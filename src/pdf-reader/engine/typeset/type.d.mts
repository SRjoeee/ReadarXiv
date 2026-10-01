// type.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { SizeStep } from './density.mjs'

type Range = [number, number]
export interface CjkDesign { cjk: true; base: { lead: number; track: number; scale: number }; lead: Range; track: Range; scale: Range }
export interface AlphabetDesign { cjk: false; size: Range; lead: Range }
/** a type: CJK's leading, tracking and scale; an alphabet's leading, size and how wide the face sets there (`h`) */
export interface Type { lead: number; track?: number; scale?: number; size?: number; h?: number; ratio?: number }
/** what the solver needs of a unit (density.mjs MeasuredUnit) */
export interface TypeUnit { i: number; lo: number; bs: number; cap: number; width(type?: { scale?: number; track?: number }): number }
export declare const DESIGN: Record<'Hans' | 'Hant' | 'Jpan' | 'Kore', CjkDesign> & Record<'Latn' | 'Cyrl', AlphabetDesign> & Record<string, CjkDesign | AlphabetDesign>
export declare function heightRatio(units: TypeUnit[], script: string, type: Type): number
export declare function heightAtSize(u: TypeUnit, script: string, type: Type, f?: number): number
export declare function unitHeights(units: TypeUnit[], script: string, type: Type): Map<number, number>
export declare function unitLines(units: TypeUnit[], script: string, type: Type): Map<number, number>
export declare function cjkType(a: number, base: CjkDesign['base'], ranges: { lead: Range; track: Range; scale: Range }): { lead: number; track: number; scale: number; reached: number }
export declare function solveType<U extends TypeUnit>(units: U[], script: string, sizes?: SizeStep[] | null): Type
export declare function correctUnits<U extends TypeUnit>(units: U[], script: string, type: Type, measured: number): U[]
