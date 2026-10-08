// rules-gate.mjs's types, for its tests
import type { Totals } from './layer-gate/score.mjs'

export declare const MARK: '<!-- rules-gate -->'
export declare const LAB: string
export declare function labLink(fixture: string, page: number, sha: string): string

export interface Ruling { name: string; date: string | null; by: string; on: string | null; quote: string; english: string | null; scope: string | null; why: string; measures: Set<string>; targets: Set<string> }
export declare function parseRuling(json: unknown, name: string): Ruling

/** a run file of the layer gate as the verdict reads it: the totals and pages of each output, and the inputs that make two runs one instrument */
export interface Run {
  tier: string
  engine?: { commit?: string | null }
  inputs?: Record<string, unknown>
  failed?: { name: string; why?: string }[]
  fixtures: Record<string, { totals: Totals; pages?: { p: number; [key: string]: unknown }[] }>
}
export interface Row { key: string; label: string; cls: string; base: number | null; head: number | null; baseRate: number | null; headRate: number | null; moved: 'worse' | 'better' | null }
export interface Verdict {
  ok: boolean
  problems: string[]
  targets: { target: string; outputs: string[]; rows: Row[]; worse: number; better: number }[]
  regressions: { target: string; measure: string; label: string; from: number | null; to: number | null; ruling: string | null }[]
  improvements: { target: string; measure: string; label: string; from: number | null; to: number | null }[]
  pages: { fixture: string; page: number; worse: string[]; better: string[] }[]
  perFixture: { regressions: { fixture: string; measure: string; label: string }[]; improvements: number }
  rulesFile?: RulesFileCheck
}
export declare function judge(base: Run, head: Run, o?: { rulings?: Ruling[] }): Verdict

export interface RulesFileCheck { changed: boolean; problems: string[]; from?: number | null; to?: number | null }
export declare function checkRulesFile(baseBytes: Uint8Array | null, headBytes: Uint8Array, engine: { readRules(bytes: Uint8Array): Promise<{ set: { version: number; note: string } }>; writeRules(set: never): string }): Promise<RulesFileCheck>
export declare function withRulesFile(report: Verdict, check: RulesFileCheck): Verdict

export declare function textsOf(record: unknown, min?: number): Set<string>
export declare function leaksIn(text: string, strings: Iterable<string>): number
export declare function fragmentsIn(text: string, haystack: string, o?: { size?: number; stride?: number }): number

export interface CommentOptions { headSha?: string; baseSha?: string; pack?: { digest: string; pipeline: string } | null; enginePipeline?: string | null; targets?: readonly string[]; changedTargets?: string[]; rulings?: Ruling[]; label?: string }
export declare function commentOf(report: Verdict, o: CommentOptions): string
export declare function reportJson(report: Verdict, meta?: { base?: { commit?: string | null; rules?: { version: number; sha256: string } }; head?: { commit?: string | null; rules?: { version: number; sha256: string } }; pack?: { digest: string; pipeline: string } | null; changedTargets?: string[] }): Record<string, unknown>

export declare function gateArgs(o: { engine: string; rules: string; pack: string; workers?: number }): { args: string[]; env: Record<string, string> }
export declare function runGate(o: { engine: string; rules: string; pack: string; out?: string; workers?: number }): Promise<string>

export declare function schemaOf(source: string): number | null
export declare function parseEngines(json: unknown): { name: string; ref: string }[]
