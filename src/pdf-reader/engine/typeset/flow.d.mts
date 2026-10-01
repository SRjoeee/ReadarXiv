// flow.mjs's types (JavaScript until the engine's port), for the reader's tests
import type { Design, TypeUnit } from './type.mjs'

export interface FlowOptions {
  window?: number
  horizon?: number
  measured?: { drift: Map<number, number>; preview: Map<number, number>; span?: number; snap?: number; breaks?: Set<number> } | null
  rate?: number
  shrink?: { steps: number[]; lines: number; heightAt(i: number, f: number): number } | null
}
/** where the final pass put the text at a unit's start and end, in points behind the original, and the leading it set */
export interface FlowStep { i: number; at: number; end: number; x: number }
export declare function flowType(units: TypeUnit[], design: Design, heights: Map<number, number>, options?: FlowOptions): { leads: Map<number, number>; sizes: Map<number, number>; trace: FlowStep[] }
