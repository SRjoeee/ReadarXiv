// density.mjs's types (JavaScript until the engine's port), for the reader's tests
/** a family's advances in em and its interword space */
export interface Face { space: number; w: Record<string, number> }
export interface Faces { latin: Face; cyrillic: Face }
/** how wide the body face sets the sample at a size (factor of the body's), against the body */
export interface SizeStep { size: number; h: number }
/** the CJK face's scale and the tracking between CJK characters, in em */
export interface CjkSet { scale?: number; track?: number }
/** a translated unit as the rule measures it: its original's lines and leading, the ruler's capacity in em, and its
 *  translation's width in em at a type */
export interface MeasuredUnit { i: number; kind?: string; lo: number; lift?: number; parts?: number; bs: number; cap: number; width(type?: CjkSet): number }
export declare const WIDTH_SAMPLE: string
export declare const SIZE_GRID: number[]
export declare const SIZE_PROBE: string
export declare const WIDTH_PROBE: string
export declare function readWidthProbe(log: string): { wd: number; size: number; columnwidth: number } | null
export declare function readSizeProbe(log: string): SizeStep[] | null
export declare function facesOf(fonts: { rm?: string } | null, probe?: { wd: number; size: number } | null): Faces
export declare function textWidth(s: string, faces: Faces, options?: { script?: string; cjk?: CjkSet; glue?: boolean }): number
export declare function atomWidth(src: string, faces: Faces, options?: { citeStyle?: string }): number
export declare function citeStyleOf(text: string, bbl?: string): string
export declare function piecesWidth(pieces: unknown[], faces: Faces, ctx?: { script?: string; citeStyle?: string; cjk?: CjkSet; glue?: boolean }): number
export declare const linesAt: (w: number, cap: number, parts?: number) => number
export declare function measureUnits(options: { units: unknown[]; translated: Map<number, unknown[]>; lines: Map<number, { lines: number; bs: number }>; fonts: unknown; probe?: unknown; citeStyle?: string; script: string; glue?: boolean }): MeasuredUnit[]
