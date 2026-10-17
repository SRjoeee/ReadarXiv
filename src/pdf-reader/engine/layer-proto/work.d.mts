// work.mjs's types: the layer's deterministic work counters
export type WorkKey = 'fit' | 'measures' | 'breaks' | 'linkTests' | 'inkSteps' | 'ops' | 'edges'
export interface Work { fit: number; measures: number; breaks: number; linkTests: number; inkSteps: number; ops: number; edges: number }
export declare const WORK_KEYS: readonly WorkKey[]
/** the running totals, incremented in place by the engine (never by a host) */
export declare const work: Work
export declare function markWork(): Work
export declare function newWork(): Work
