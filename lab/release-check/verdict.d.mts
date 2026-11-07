// verdict.mjs's types, for its tests (tests/scripts/release-check.test.ts)
import type { Finding, Gate, Invariant, Numbers } from './gates.mjs'
export interface Result { status: string; reason?: string; findings?: Record<string, Finding>; numbers?: Numbers }
export interface InvariantLine { id: string; says: string; status: 'GO' | 'NO-GO' | 'beyond this tier'; gates: string[]; why: string[] }
export interface TargetLine { id: string; measure: string; baseline: string; target: string; status: 'met' | 'missed' | 'reported' | 'not measured'; value: string | null; why?: string; from?: string }
type GateLike = Pick<Gate, 'id' | 'tier' | 'stage' | 'holds'>
export declare function gatesOf<G extends GateLike>(gates: G[], tier: string): G[]
export declare function invariantLine(inv: Invariant, gates: GateLike[], tier: string, results: Record<string, Result>): InvariantLine
export declare function targetLines(results: Record<string, Result>): TargetLine[]
export declare function verdictOf(tier: string, gates: GateLike[], results: Record<string, Result>, invariants: { id: string; status: string }[]): { verdict: 'GO' | 'NO-GO'; why: string[] }
export declare function markdownOf(report: Record<string, unknown>): string
