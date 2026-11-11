// X.walk (design-b §1.5, T31): the fit's states, from the most natural, each knob taken to its bound before the next, and a
// unit laid at the first state at which every token is placed. Ported from engine 065c1d973 layer2.mjs L2:4040-4134
// (statesOf, sameState, sharedStates, layoutUnit2; moved first as JavaScript by lab/typeset/move-fit.mjs, now TypeScript),
// held by the walk's, the chain's and the fill's replays on the corpus. The `borrow` knob is today's: a block's lines laid on into
// the room under its last line, before its leading and its size (the owner's ruling of 2026-11-08, borrowing bounded by TeX's
// facts: so that a page's body keeps one size); the room is TeX's (lay/adapt.ts), stated on each block (`free`).
import { breakLines } from '../breaker/break.types.ts'
import { laidOut } from '../breaker/place.types.ts'
import { roomOf, slotsAt } from '../breaker/slots.types.ts'
import type { Token } from '../breaker/tokens.ts'
import type { FitBlock, FitParams, FitState, Layout } from './types.ts'

type RunTrack = { track: number; trackLatin: number; compress: number }

/** the compression a unit's first state sets its marks at (statesOf): 1 where its rules compress them at all (a line's edge
 *  marks without their blank halves, B.break leadOf and hangOf), else 0. A figure text is set at it (S.figures) */
export const firstCompress = (P: { compressMax: number }): number => (P.compressMax > 0 ? 1 : 0)

/** the fit's states, from the most natural, each knob in the order given taken to its bound before the next */
export function* statesOf(P: FitParams, blocks: readonly FitBlock[], s: number): Generator<FitState> {
  // (step 3: the CJK runs' tracking from P.trackStart, a face's size correction given back, run.mjs; down from it)
  const t0 = P.cjk ? (P.trackStart ?? 0) : 0
  // (capScale: the most its lines' room between the rules over and under them leaves it, cellBands: never above)
  const top = Math.min(1, P.capScale ?? 1)
  // (P.runTrack: a run of a unit split by its displays starts from its unit's tracking, the tightest its runs need, layoutRuns)
  const R = P.runTrack as RunTrack | undefined
  const st: FitState = {
    lead: P.leadBase,
    track: R ? R.track : t0,
    trackLatin: R ? R.trackLatin : 0,
    compress: R ? R.compress : firstCompress(P),
    borrow: 0,
    scale: top,
    knob: (P.capScale as number) < 1 ? 'clear' : 'none',
  }
  yield { ...st }
  for (const knob of P.order) {
    if (knob === 'track') {
      if (P.compressMax >= 2 && st.compress < 2) {
        st.compress = 2
        yield { ...st, knob }
      }
      for (let t = (P.cjk ? st.track : st.trackLatin) - 0.01; t >= P.trackMin - 1e-9; t -= 0.01) {
        if (P.cjk) st.track = t
        else st.trackLatin = t
        yield { ...st, knob }
      }
    } else if (knob === 'borrow') {
      if (!P.borrow) continue
      // (the lines its room holds at the original's pitch: one at a time to six, then all of the room. A room under a whole line
      // is offered too: a line TeX's \lineskip rule sets lower than its slot (a tall formula over it) takes a fraction of a
      // line, which the room holds (2602.23285v2 p5 t32: 1.25 pt of 10.82, a pitch 10.96); offered in whole lines alone it was
      // never offered, and the paragraph shrank where TeX's room held it)
      const most = Math.max(0, ...blocks.map((b) => Math.floor((b.free as number) / (b.pitch0 ?? 1.2 * s) + 1e-6)))
      for (let n = 1; n <= Math.min(most, 6); n++) {
        st.borrow = n
        yield { ...st, knob }
      }
      if (blocks.some((b) => (b.free as number) > 0)) {
        st.borrow = 99
        yield { ...st, knob }
      }
    } else if (knob === 'lead') {
      for (let L = st.lead - 0.05; L >= P.leadFloor - 1e-9; L -= 0.05) {
        st.lead = Math.round(L * 1000) / 1000
        yield { ...st, knob }
      }
      if (st.lead > P.leadFloor + 1e-9) {
        st.lead = P.leadFloor
        yield { ...st, knob }
      }
    } else if (knob === 'shrink') {
      // (the borrow past TeX's text block bottom, where the reader asks it (P.pastFoot, docs/PDF-READER.md §18.37, an experiment
      // for the owner's test): before the first step, one state whose last line may stand that far under the bottom, the next
      // ink's bound as it is, where that adds room to a block; one it does not set goes on down the steps as without it)
      const past = (P.pastFoot as number | undefined) ?? 0
      if (past > 0 && P.borrow && blocks.some((b) => roomOf(b, { ...st, over: past }) > roomOf(b, st) + 1e-6))
        yield { ...st, borrow: 99, over: past, knob: 'over' }
      // (on the steps from the size it would start at uncapped, those under the cap: a cap of 0.956 stepping from itself
      // ended at 0.806 short of the floor's 0.8, where 1512.03385's cells fit, and left them the original's)
      for (let k = 1; ; k++) {
        const sc = Math.round((1 - k * P.step) * 1000) / 1000
        if (sc < P.floor - 1e-9) break
        if (sc > top + 1e-9) continue
        st.scale = sc
        yield { ...st, knob }
      }
    }
  }
}
/** how far under its block's text block bottom the lowest of a layout's lines stands (§18.37), 0.01 at least */
function depthOf(lines: readonly { block: number; baseline: number }[], blocks: readonly FitBlock[]): number {
  let need = 0
  for (const l of lines) {
    const b = blocks[l.block]
    if (b?.toFoot !== undefined) need = Math.max(need, (b.B.at(-1) as number) - b.toFoot - l.baseline)
  }
  return Math.max(0.01, Math.ceil(need * 100 - 1e-6) / 100)
}
/** two of the fit's states alike: every knob's value, and the knob that set it */
const sameState = (x: FitState, y: FitState) =>
  x.lead === y.lead &&
  x.track === y.track &&
  x.trackLatin === y.trackLatin &&
  x.compress === y.compress &&
  x.borrow === y.borrow &&
  x.scale === y.scale &&
  x.knob === y.knob
/** how many first states the fits of P and of `failed` share (statesOf), on the same blocks and size */
function sharedStates(P: FitParams, failed: FitParams, blocks: readonly FitBlock[], s: number): number {
  const a = statesOf(P, blocks, s),
    b = statesOf(failed, blocks, s)
  for (let n = 0; ; n++) {
    const x = a.next(),
      y = b.next()
    if (x.done || y.done || !sameState(x.value, y.value)) return n
  }
}
/**
 * A unit laid out: the first state of the fit at which every token is placed; at the last, what fits, clipped (which the
 * host never draws: run.mjs fitFurther).
 * `s`: the original's size (PDF units). Returns { lines, f, s, scale, state, knob, clipped, lostChars, chars, tried }.
 * `failed`: the parameters of a fit of the same tokens on the same blocks that set them at none of its states, strictly or
 * run past a kept region (a clipped layoutUnit2), which differ from P only in what statesOf reads (run.mjs fitFurther's step
 * below the floor: `floor`): the states the two fits share have been laid already, so this fit goes on from the first state of
 * its own. Null where it has no state of its own
 */
export function layoutUnit2(
  tokens: readonly Token[],
  blocks: readonly FitBlock[],
  s: number,
  P: FitParams,
  failed: FitParams | null = null,
): Layout | null {
  type Laid = { r: ReturnType<typeof breakLines>; st: FitState; f: number }
  let last: Laid | null = null,
    tried = 0
  const skip = failed ? sharedStates(P, failed, blocks, s) : 0
  let n = 0
  for (const st of statesOf(P, blocks, s)) {
    if (n++ < skip) continue
    tried++
    const f = s * st.scale
    const r = breakLines(tokens, slotsAt(blocks, st, P, s), f, st, P, st.scale, true, blocks)
    last = { r, st, f }
    if (r.rest >= r.total) break
  }
  if (!last) return null
  // (a state past the bottom that set every token keeps the depth its lines took under their blocks' bottoms alone (to the
  // hundredth, up), so that the page fill, laying it again at a looser leading, spreads it no deeper: §18.37)
  if (last.st.over && last.r.rest >= last.r.total)
    last = { ...last, st: { ...last.st, over: depthOf(last.r.lines, blocks) } }
  // nothing fits in order at the last state: the text may run on past a kept region (all of it shown, out of order), at the
  // most natural state at which it then fits. The walk down to the last state bought nothing the run past keeps: laid at the
  // last, a paragraph that runs on past a display was drawn at the floor's size though it fit far larger (the M1 survey of
  // 2608.16117, German page 10: units 28 and 35 at 0.8 and 0.85 of the original's size). Where it fits at none, the last
  // state's, as far as it goes
  if (last.r.rest < last.r.total && tokens.some((t) => t.blockTo !== undefined)) {
    let past: Laid | null = null,
      m = 0
    for (const st of statesOf(P, blocks, s)) {
      if (m++ < skip) continue
      tried++
      const f = s * st.scale
      past = { r: breakLines(tokens, slotsAt(blocks, st, P, s), f, st, P, st.scale, false, blocks), st, f }
      if (past.r.rest >= past.r.total) break
    }
    if (past!.r.rest >= past!.r.total) last = past!
    else if (past!.r.rest > last.r.rest) last = { ...last, r: past!.r }
  }
  return laidOut(last, s, P, tried, blocks)
}
