// plan.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { SourceUnit } from '../latex-front.mjs'
import type { Strategy } from '../scripts.mjs'
import type { Paper } from '../live.mjs'
import type { FlowStep } from './flow.mjs'
import type { Marks } from './places.mjs'
import type { Typeset } from './tex.mjs'
import type { Type } from './type.mjs'

export declare const FLOW: { window: number; horizon: number; span: number; snap: number; rate: number; faceLines: number; faces: number[]; tableMin: number }
/** opaque: what finalTypesetting takes from previewTypesetting */
export interface TypesetState { readonly strategy: string }
/** a compile's log and marks */
export interface Compiled { log: string; marks: Marks }
export declare function previewTypesetting(options: { paper: Paper & { fsys: unknown }; translated: Map<SourceUnit, unknown[]>; lang: string; strategy: Strategy; fonts: unknown; fontLog: string; original: Compiled }): { typeset: Typeset; type: Type; state: TypesetState }
export declare function finalTypesetting(state: TypesetState, preview: Compiled): { typeset: Typeset; type: Type; leads: Map<number, number>; faces: Map<number, number>; trace: FlowStep[] }
