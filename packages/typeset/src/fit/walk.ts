// X.walk (design-b §1.5, T31): the fit's states, from the most natural, each knob taken to its bound before the next, and a
// unit laid at the first state at which every token is placed. Ported from engine 065c1d973 layer2.mjs L2:4040-4134
// (statesOf, sameState, sharedStates, layoutUnit2; moved first as JavaScript by lab/typeset/move-fit.mjs, now TypeScript),
// held by the walk's, the chain's and the fill's replays on the corpus. The `borrow` knob is today's: a block's lines laid on into
// the room under its last line, before its leading and its size (the owner's ruling of 2026-11-08, borrowing bounded by TeX's
// facts: so that a page's body keeps one size); the room is TeX's (lay/adapt.ts), stated on each block (`free`).
import { type Broken, breakLines, lineExtent } from '../breaker/break.ts'
import { laidOut } from '../breaker/place.ts'
import { roomOf, type Slot, slotsAt } from '../breaker/slots.ts'
import type { Token } from '../breaker/tokens.ts'
import type { FitBlock, FitParams, FitState, Layout } from './types.ts'

type RunTrack = { track: number; trackLatin: number; compress: number }

/** the compression a unit's first state sets its marks at (statesOf): 1 where its rules compress them at all (a line's edge
 *  marks without their blank halves, B.break leadOf and hangOf), else 0. A figure text is set at it (S.figures) */
export const firstCompress = (P: { compressMax: number }): number => (P.compressMax > 0 ? 1 : 0)

/**
 * How far under TeX's text block bottom a unit's last line may stand, in points, where that keeps the unit from a step down
 * the size ladder (docs/PDF-READER.md §18.37, the owner's ruling of 2026-11-12). Production borrows past the bottom; 1.5 is the
 * value the owner looked at the pages with on the test site before he ruled. Over the 22 parity pairs it keeps six units
 * larger, each needing 0.08 to 1.36 pt while laid (2608.16117v1-de unit 86 1.36, unit 99 1.05; 2602.23285v2-ja unit 29 1.22,
 * unit 90 0.99: the four production keeps at their size with a line past the bottom); a borrowed line's ink stays inside its
 * class's `\maxdepth`, the depth TeX itself lets a last line hang under the bottom (deepest 3.73 pt, elsarticle at 12 pt's 6)
 */
export const PAST_FOOT = 1.5

/** the fit's states, from the most natural, each knob in the order given taken to its bound before the next */
function* statesOf(P: FitParams, blocks: readonly FitBlock[], s: number): Generator<FitState> {
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
      // (the borrow past TeX's text block bottom, docs/PDF-READER.md §18.37: before each step down, at the size it would leave,
      // one state more whose last line may stand PAST_FOOT under the bottom (the reader's P.pastFoot where it sets one, 0 off),
      // the next ink's bound as it is, where that adds room to a block. So at every size but the floor the unit is tried
      // without that room first, then with it, and it borrows past the bottom only where that keeps it larger than the steps
      // would; one that fits at none goes on down the steps, and on to the knobs after them)
      const past = (P.pastFoot as number | undefined) ?? PAST_FOOT
      const pastHere = () =>
        past > 0 && !!P.borrow && blocks.some((b) => roomOf(b, { ...st, over: past }) > roomOf(b, st) + 1e-6)
      // (on the steps from the size it would start at uncapped, those under the cap: a cap of 0.956 stepping from itself
      // ended at 0.806 short of the floor's 0.8, where 1512.03385's cells fit, and left them the original's)
      for (let k = 1; ; k++) {
        const sc = Math.round((1 - k * P.step) * 1000) / 1000
        if (sc < P.floor - 1e-9) break
        if (sc > top + 1e-9) continue
        if (pastHere()) yield { ...st, borrow: 99, over: past, knob: 'over' }
        st.scale = sc
        yield { ...st, knob }
      }
    }
  }
}
/**
 * The walk's tries, from its `skip`th state on: each state of statesOf as it comes. For a merged table cell the lay fills
 * (P.words, docs/PDF-READER.md §18.75) the size never gives way to whole words (the owner's answer of 2026-11-16): each size's
 * states (a run of statesOf's at one scale) are laid between words first, then the same states as before, `split` (a word cut
 * where a line must end), before the next size's; the size steps down only where neither sets it
 */
function* triesOf(P: FitParams, blocks: readonly FitBlock[], s: number, skip: number): Generator<FitState> {
  let size: FitState[] = []
  let n = 0
  for (const st of statesOf(P, blocks, s)) {
    if (n++ < skip) continue
    if (P.words && size.length && size[0]!.scale !== st.scale) {
      for (const q of size) yield { ...q, split: true }
      size = []
    }
    yield st
    if (P.words) size.push(st)
  }
  for (const q of size) yield { ...q, split: true }
}
/** how far under its block's text block bottom the lowest of `lines` stands (§18.37), to the hundredth, up; 0 where none does
 *  (the Page member states it, lay/page.ts) */
export function depthUnder(lines: readonly { block: number; baseline: number }[], blocks: readonly FitBlock[]): number {
  let need = 0
  for (const l of lines) {
    const b = blocks[l.block]
    if (b?.toFoot !== undefined) need = Math.max(need, (b.B.at(-1) as number) - b.toFoot - l.baseline)
  }
  return Math.max(0, Math.ceil(need * 100 - 1e-6) / 100)
}
/** the depth a state past the bottom keeps (depthUnder), 0.01 at least: the state stays one past the bottom */
const depthOf = (lines: readonly { block: number; baseline: number }[], blocks: readonly FitBlock[]) =>
  Math.max(0.01, depthUnder(lines, blocks))
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
/** two of the fit's states alike but in their leading and the knob that set it: what B.break reads of a state but the slots */
const butLead = (x: FitState, y: FitState) =>
  x.track === y.track &&
  x.trackLatin === y.trackLatin &&
  x.compress === y.compress &&
  x.borrow === y.borrow &&
  x.scale === y.scale &&
  x.fitTrack === y.fitTrack &&
  x.box === y.box &&
  x.head === y.head &&
  x.share === y.share &&
  x.over === y.over &&
  x.split === y.split &&
  JSON.stringify(x.leads) === JSON.stringify(y.leads)
/** a slot as B.break reads it apart from where it stands: the measure and the frame of the line laid on it. Where the slot
 *  stands (its baseline, pitch and foot) B.break reads in TeX's \lineskip rule alone (settle, pushDown, a forced break's room)
 *  and in overLast; `target` rides on to the placement (toLastLines), which B.break never reads */
const sameAcross = (a: Slot, b: Slot) =>
  a.block === b.block &&
  a.page === b.page &&
  a.x0 === b.x0 &&
  a.x1 === b.x1 &&
  a.centred === b.centred &&
  a.after === b.after &&
  a.flow === b.flow &&
  a.hangGap === b.hangGap &&
  a.hung === b.hung &&
  a.flush === b.flush
/** whether no slot stands over an earlier one of its page and column: overLast, which passes such a slot over, then passes
 *  none over at any leading */
const inOrder = (S: readonly Slot[]) => {
  for (let q = 1; q < S.length; q++)
    for (let p = 0; p < q; p++) {
      const a = S[p]!,
        b = S[q]!
      if (a.page === b.page && b.baseline > a.baseline + 0.05 && Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0))
        return false
    }
  return true
}
/** a lay of the fit's: its state, its slots, B.break's lines, the size */
type Lay = { st: FitState; S: Slot[]; r: Broken; f: number }
/**
 * The leading knob re-breaks nothing where the breaks cannot change (the coordinator's ruling of 2026-11-16, docs/PDF-READER.md
 * §18.81). What B.break sets on each line is a function of the text, the size, the tracking, the word rule and each line's
 * measure and frame (sameAcross); the leading says where the lines stand, which B.break reads only in TeX's \lineskip rule
 * (settle, pushDown) and in overLast. The knob's states (statesOf: one state, its leading 0.05 closer each, to the floor) are
 * laid once the knob's first state failed by the floor's lay (`leadFloor`: the most slots) where a state's slots are the floor's
 * first ones, measure for measure and frame for frame, no slot over an earlier one of its column, and TeX's rule opens no line
 * of the floor's where the state's slots stand: a state that lacks a slot a line of the floor's stands on fails as surely (null,
 * not laid); one that holds them all, and the next slot as the floor does (B.break looks at it: a boundary, a URL kept whole, a
 * label alone), is laid as the floor's lines on its own slots, the same breaks, every item its own. Every other state is laid by
 * B.break as before: one whose measures change with the leading (a line beside a wrapped figure, a stay, a shared row's stop), a
 * unit with a frame break (strand lays a line again) or a forced break's room, a floor's lay TeX's rule opened. The walk takes
 * the floor's lay at the floor. The lays, and the state the walk stops at, are B.break's own
 */
function leadLays(tokens: readonly Token[], blocks: readonly FitBlock[], s: number, P: FitParams, strict: boolean) {
  const layOn = (st: FitState, S: Slot[]): Lay => {
    const f = s * st.scale
    return { st, S, f, r: breakLines(tokens, S, f, st, P, st.scale, strict, blocks) }
  }
  const lay = (st: FitState) => layOn(st, slotsAt(blocks, st, P, s))
  // (a frame break (strand lays a line again) or a forced break's room (pushDown) moves lines by where they stand)
  const free = !tokens.some((t) => t.pageBreak !== undefined || (t.newline !== undefined && (t.room ?? 0) > 0))
  type Floor = Lay & { at: number[] | null; extents: ReturnType<typeof lineExtent>[] }
  let floor: Floor | null = null
  const misses: FitState[] = []
  /** the floor's lay of state `st`'s knob, each of its lines' slot (none where a line opened, or stands on no slot of its own) */
  const floorOf = (st: FitState): Floor => {
    if (floor && butLead(floor.st, st)) return floor
    const F = lay({ ...st, lead: P.leadFloor })
    const at =
      F.r.lines.every((l) => !l.opened) && inOrder(F.S)
        ? F.r.lines.map((l) =>
            F.S.findIndex((sl) => sl.page === l.page && sl.block === l.block && sl.baseline === l.baseline),
          )
        : null
    floor = {
      ...F,
      at: at?.every((j) => j >= 0) ? at : null,
      extents: F.r.lines.map((l) => lineExtent(l, F.f, F.st.scale, P.measure)),
    }
    return floor
  }
  /** how a state of the floor's knob on slots `S` is laid, as the floor's lay `F` shows: 'fails' where a line of the floor's stands
   *  on a slot the state lacks; 'same' where the state holds every slot the floor's lines stand on, and the slot after the last
   *  of them as the floor holds it (B.break looks at the next slot: a boundary, a URL kept whole, a label alone); else null, laid */
  const asFloor = (F: Floor, S: readonly Slot[]): 'fails' | 'same' | null => {
    if (!F.at || S.length > F.S.length || !inOrder(S)) return null
    for (let j = 0; j < S.length; j++) if (!sameAcross(S[j]!, F.S[j]!)) return null
    // (TeX's rule where the state's slots stand: no two of the lines they hold nearer than \lineskiplimit, so it opens none)
    if (P.lineskip) {
      const limit = P.lineskip[1]
      const L = F.r.lines
      for (let k = 1; k < L.length; k++) {
        const p = F.at[k - 1]!,
          q = F.at[k]!
        if (p >= S.length || q >= S.length || L[k - 1]!.flow !== L[k]!.flow) continue
        const pb = S[p]!.baseline,
          lb = S[q]!.baseline
        if (pb > lb && pb - F.extents[k - 1]!.d - (lb + F.extents[k]!.a) < limit) return null
      }
    }
    const u = Math.max(-1, ...F.at)
    if (u >= S.length) return 'fails'
    return S.length > u + 1 || S.length === F.S.length ? 'same' : null
  }
  /** the floor's lay on the state's slots: its lines where the state's slots stand, each item its own */
  const moved = (F: Floor, st: FitState, S: readonly Slot[]): Lay => {
    const lines = F.r.lines.map((l, k) => {
      const sl = S[F.at![k]!]!
      return {
        ...l,
        baseline: sl.baseline,
        target: sl.target,
        pitch: sl.pitch,
        foot: sl.foot,
        items: l.items.map((it) => ({ ...it })),
      }
    })
    return { st, S: S as Slot[], f: F.f, r: { ...F.r, lines } }
  }
  /** a state's lay: B.break's, or the floor's lines on its slots; null where the floor's lay shows it fails */
  const at = (st: FitState): Lay | null => {
    const S = slotsAt(blocks, st, P, s)
    if (!free || st.knob !== 'lead') return layOn(st, S)
    if (floor && st.lead === floor.st.lead && butLead(floor.st, st)) return floor.at ? moved(floor, st, S) : floor
    if (st.lead > P.leadFloor && misses.some((x) => butLead(x, st))) {
      const F = floorOf(st)
      const as = asFloor(F, S)
      if (as === 'fails') {
        misses.push(st)
        return null
      }
      if (as === 'same') {
        const L = moved(F, st, S)
        if (L.r.rest < L.r.total) misses.push(st)
        return L
      }
    }
    const L = layOn(st, S)
    if (L.r.rest < L.r.total) misses.push(st)
    return L
  }
  return { at, lay }
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
  // (the leading knob's states laid where their lines can differ: leadLays)
  const lays = leadLays(tokens, blocks, s, P, true)
  let passed: FitState | null = null
  for (const st of triesOf(P, blocks, s, skip)) {
    tried++
    const L = lays.at(st)
    passed = L ? null : st
    if (!L) continue
    last = { r: L.r, st, f: L.f }
    if (L.r.rest >= L.r.total) break
  }
  // (the walk's last state one the knob passed unlaid: laid, the clipped layout's)
  if (passed) {
    const L = lays.lay(passed)
    last = { r: L.r, st: passed, f: L.f }
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
      passedPast: FitState | null = null
    const run = leadLays(tokens, blocks, s, P, false)
    for (const st of triesOf(P, blocks, s, skip)) {
      tried++
      const L = run.at(st)
      passedPast = L ? null : st
      if (!L) continue
      past = { r: L.r, st, f: L.f }
      if (past.r.rest >= past.r.total) break
    }
    if (passedPast) {
      const L = run.lay(passedPast)
      past = { r: L.r, st: passedPast, f: L.f }
    }
    if (past!.r.rest >= past!.r.total) last = past!
    else if (past!.r.rest > last.r.rest) last = { ...last, r: past!.r }
  }
  return laidOut(last, s, P, tried, blocks)
}
