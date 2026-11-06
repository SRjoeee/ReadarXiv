// The ledger's values (design-b §1.7, the tap's slots: baseline/tap/TAP.md §3): a layout summarized as the tap summarizes it,
// so that a run's trace is compared with today's ledger slot by slot. Numbers as JSON prints them, a non-finite one as its
// string (the tap's rule).
import type { FitState, Layout } from '../fit/types.ts'
import type { Json, LedgerSlot, RuleId, Step } from '../types.ts'

type Raw = Record<string, unknown>

/** a number as the tap prints it */
export const fin = (v: unknown): Json =>
  typeof v === 'number' ? (Number.isFinite(v) ? v : String(v)) : ((v ?? null) as Json)

/** a state as the tap's stateOf */
export const stateOf = (st: FitState | Raw | null | undefined): Json => {
  if (!st) return null
  const s = st as Raw
  return {
    lead: fin(s.lead),
    scale: fin(s.scale),
    track: fin(s.track),
    trackLatin: fin(s.trackLatin),
    compress: fin(s.compress),
    borrow: fin(s.borrow),
    knob: (s.knob ?? null) as Json,
    ...(s.box ? { box: true } : {}),
    ...(s.next !== undefined ? { next: fin(s.next) } : {}),
    ...(s.fitTrack !== undefined ? { fitTrack: fin(s.fitTrack) } : {}),
  }
}

/** a layout as the tap's layoutOf: its state, size, scale, knob, whether clipped, its lines' count and what it tried and lost */
export function layoutOf(l: Layout | Raw | null | undefined): Json {
  if (!l) return null
  const x = l as Raw
  return {
    state: stateOf(x.state as Raw),
    f: fin(x.f),
    scale: fin(x.scale),
    knob: (x.knob ?? null) as Json,
    clipped: !!x.clipped,
    lines: (x.lines as unknown[] | undefined)?.length ?? 0,
    tried: fin(x.tried),
    lostChars: fin(x.lostChars),
    opened: fin(x.opened),
    unopened: fin(x.unopened),
  }
}

/** a layout's lines as the tap's linesOf: each line's page, baseline, x0, x0 + used, mode, block and item count */
export const linesOf = (l: Layout | Raw | null | undefined): Json =>
  (((l as Raw | null)?.lines as Raw[] | undefined) ?? []).map((x) => [
    x.page as number,
    fin(x.baseline),
    fin(x.x0),
    fin((x.x0 as number) + (x.used as number)),
    (x.mode ?? null) as Json,
    (x.block ?? null) as Json,
    (x.items as unknown[] | undefined)?.length ?? 0,
  ])

/** a member's ledger as its lay writes it, in step order */
export class Trace {
  readonly slots: LedgerSlot[] = []
  readonly round: number
  constructor(round = 1) {
    this.round = round
  }
  put(step: Step, by: RuleId, value: Json): void {
    this.slots.push({ step, by, round: this.round, value })
  }
}
