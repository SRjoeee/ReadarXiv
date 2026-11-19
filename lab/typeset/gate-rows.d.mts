// gate-rows.mjs's types, for its tests (tests/lab/gate-rows.test.ts)
import type { OutPiece, Unit } from '@readarxiv/format'

/** a row the judge withheld: its pair, its unit's kind and id, and why the rule refused it (the rule's Refusal) */
export type JudgedRow = { pair: string; kind: string; id: string; why: string }
export declare function rowJudge(): {
  takes(pair: string, unit: Unit, content: readonly OutPiece[]): boolean
  withheld(): JudgedRow[]
}
