// A unit's lay replayed from F2 to the round's last word (TAP.md §3, F2-F8, `out`, L9) by the package's own composition
// (src/lay/member.ts layMember, layFlow's F2-F8 and L9), its trace compared with the round's ledger slots step by step: X.cut
// (F2), S.onLeadRetry (F3), X.numbered (F4), S.overFollower (F5), X.further or X.runs (F6), S.settle (F7), S.share (F8), the
// round's `out`, the unit's fill leadings (L9). The member is prepared from the round's inputs (fit-input.ts) and its slots:
// F1's onLeadOf, U.decor's numbered and keptAfter, X.numbered's crop, X.further's widened blocks (Room.side). Two facts the
// tap does not hold are read off the bundle today's reader opened (today.ts): the page's rules a CJK cell's bands read, and
// the follower's first line in the file. A chain that reaches L9 returns the unit as its lay left it (`lay`), which the
// page's fill takes (pass.ts).
import type { NumberCrop } from '../../src/fit/numbered.ts'
import type { FitBlock, FitParams, Tokens } from '../../src/fit/types.ts'
import { layMember, type Prepared } from '../../src/lay/member.ts'
import { Trace } from '../../src/lay/trace.ts'
import type { FillLaid } from '../../src/shared/fill-page.ts'
import type { RuleParams } from '../../src/types.ts'
import { cellBands } from '../../src/unit/params.ts'
import { blockOfTap, num, type WalkCase } from './fit-input.ts'
import { borrowsAt, firstDifference, inWordOf, ledger, ruledRoom, wordGlued } from './tap.ts'
import { paperOf, todayBundle } from './today.ts'

type Raw = Record<string, unknown>
/** `own`: the port's own lay of the round, where it laid it, whatever step differed (what a ruling's unit is filled from);
 *  `lead`: a round whose fill leadings option (i) moves (the owner's of 2026-11-10: tap.ts borrowsAt), its lay the ruling's */
export type Chain = {
  at: string
  d: string | null
  stopped?: string
  steps: string[]
  lay?: FillLaid
  own?: FillLaid
  lead?: true
}

/** the shared row the follower is laid from, as its F1 slot holds it (the follower's last round that has one) */
const rowOf = (pair: string, follower: number) => {
  const u = ledger(pair).units.find((x) => x.ord === follower)
  const s = u?.slots.filter((x) => x.by === 'S.rowStart' && (x.value as Raw)?.row).at(-1)
  return (s?.value as { row: Raw } | undefined)?.row ?? null
}
const admitOf = (pair: string, ord: number) =>
  ledger(pair)
    .units.find((u) => u.ord === ord)
    ?.slots.find((x) => x.by === 'U.admit' && x.round === 0)?.value as Raw | undefined

/** the member a round's lay starts from, its facts read off the round's slots and today's bundle */
export function prepare(c: WalkCase): Prepared {
  const L = ledger(c.pair)
  const kind = (L.units.find((u) => u.ord === c.ord)?.kind ?? '') as string
  const P = c.P as FitParams
  const blocks = c.blocks as FitBlock[]
  const today = todayBundle(paperOf(c.pair))
  const rulesOf = (pg: number) => today?.rules(pg)
  const decor = c.slot('U.decor', 'numbered')
  const kept = (c.slot('U.decor', 'kept')?.kept ?? null) as Prepared['kept']
  const f1 = c.slot('S.rowStart', 'onLeadOf')?.onLeadOf as { start: number; startY: number | null } | null | undefined
  const f5 = c.slot('S.overFollower'),
    f8 = c.slot('S.share')
  const fid = (f5?.follower ?? f8?.follower) as number | undefined
  const fRow = fid === undefined ? null : (rowOf(c.pair, fid) as { page: number; baseline: number } | null)
  const line = fid === undefined ? undefined : today?.lines(fid)
  // (S.share's row: the follower's F1 row, or, a follower never laid, the row kept after this unit (keptAfter's answer is
  // that row), or, neither, the row as the share names it: its page, baseline and band; F.chains' fact, Placed.join)
  const named = f8?.share as { page: number; y: number; band: number } | null | undefined
  const shareRow = f8
    ? ((fRow as Prepared['shareRow']) ??
      (kept as Prepared['shareRow']) ??
      (named ? { page: named.page, baseline: named.y, size: named.band } : null))
    : null
  const further = c.slot('X.further')
  const wb = further?.widenedBlocks as Raw[] | null | undefined
  return {
    ord: c.ord,
    kind,
    pages: (admitOf(c.pair, c.ord)?.pages ?? []) as number[],
    tokens: c.tokens as Tokens,
    blocks,
    s: c.s,
    P,
    clear: P.cjk && kind === 'cell' ? cellBands(blocks, rulesOf, c.s, P as never) : null,
    rulesOf,
    numbered: !!decor?.numbered,
    numberCrop: (c.slot('X.numbered')?.crop as NumberCrop | undefined) ?? null,
    onLeadOf: f1 ? { start: f1.start, startY: f1.startY ?? undefined } : null,
    kept,
    follower:
      fid === undefined || !f5
        ? null
        : {
            id: fid,
            open: !!admitOf(c.pair, fid)?.ok,
            row: fRow,
            first: line?.length ? { page: line[0]!, x1: line[2]! } : null,
          },
    shareRow,
    wide:
      (further?.furtherLayout as Raw | null)?.knob === 'widen' && wb
        ? (ruledRoom(wb.map(blockOfTap), c.s) as FitBlock[])
        : null,
    noOver: !!f5?.noOver,
  }
}

/** the round replayed from F2 on by layMember: the first step whose answer differs from its slot (`at`, `d`), or where the
 *  round ends otherwise and why */
export function chain(c: WalkCase): Chain {
  const steps: string[] = []
  const p = prepare(c)
  // (the cell's cap, U.params' capScale, which the walk read: the bands over today's rules held to it)
  if (p.clear && p.clear.cap < 1 && p.clear.cap !== p.P.capScale)
    return { at: 'U.params', d: `the cell's cap ${p.clear.cap} against capScale ${p.P.capScale}`, steps }
  if (p.noOver) return { at: 'F5', d: null, stopped: 'S.relay (noOver)', steps }
  const trace = new Trace(c.round)
  const got = layMember(p, c.rules as unknown as RuleParams, trace)
  const r = stepsAfter(c, p, got, trace, steps)
  return got.state === 'laid' ? { ...r, own: got.lay } : r
}
/** the chain's steps after layMember, each against its slot: the first that differs, or where the round ends */
function stepsAfter(
  c: WalkCase,
  p: ReturnType<typeof prepare>,
  got: ReturnType<typeof layMember>,
  trace: Trace,
  steps: string[],
): Chain {
  const mine = (step: string, by: string) => trace.slots.find((s) => s.step === step && s.by === by)?.value as Raw
  // (a round whose tokens hold an item that continues its word: its lines' ends read to a millionth of a point, lane
  // literal-fixes' rule moving a line's slack between its gaps and never its end (tap.ts wordGlued); counted where it decides)
  const inWord = inWordOf(c.tokens as unknown[])
  const glued = (a: unknown, b: unknown, label: string): string | null => {
    const d = firstDifference(a, b, label)
    if (!d || !inWord) return d
    const g = firstDifference(wordGlued(a), wordGlued(b), label)
    if (!g) steps.push(`${label} (no glue in a word)`)
    return g
  }
  const pick = (v: Raw | undefined, keys: string[]) => (v ? Object.fromEntries(keys.map((k) => [k, v[k]])) : v)
  /** a step's answer against its slot, by the fields the tap summarizes; whether it ran on both sides */
  const compare = (step: string, by: string, keys: string[], label: string): string | null => {
    const a = mine(step, by),
      b = c.slot(by)
    if (!!a !== !!b) return `${by} ${a ? 'ran' : 'did not run'}, today's slot ${b ? 'is' : 'is not'} there`
    if (!a) return null
    const d = glued(pick(a, keys), pick(b, keys), label)
    if (!d) steps.push(label)
    return d
  }
  let d = compare('F2', 'X.cut', ['layout', 'layoutLines'], 'F2')
  if (d) return { at: 'F2', d, steps }
  d = compare('F3', 'S.onLeadRetry', ['taken', 'layout', 'layoutLines', 'wasLayout'], 'F3')
  if (d) return { at: 'F3', d, steps }
  d = compare('F4', 'X.numbered', ['taken', 'numberedLayout', 'numberedLayoutLines'], 'F4')
  if (d) return { at: 'F4', d, steps }
  const a5 = mine('F5', 'S.overFollower'),
    b5 = c.slot('S.overFollower')
  if (a5 || b5) {
    const over = ['overLayout', 'overLayoutLines']
    d =
      firstDifference(!!a5?.taken, !!b5?.taken, 'F5 taken') ??
      (a5?.taken ? glued(pick(a5, over), pick(b5, over), 'F5') : null)
    if (d) return { at: 'F5', d, steps }
    steps.push(a5?.taken ? 'F5 taken' : 'F5')
  }
  if (mine('F6', 'X.further') || c.slot('X.further')) {
    d = compare('F6', 'X.further', ['found', 'furtherLayout', 'furtherLayoutLines'], 'F6 further')
    if (d) return { at: 'F6', d, steps }
    if (got.state !== 'laid')
      return { at: 'out', d: null, stopped: 'left the original’s (X.further found none)', steps }
  } else if (p.kind !== 'cell') {
    // (a run's tokens hold the frames' share's cut where the fit set the share's first line in that frame or later (pageCutsOf
    // `share`, the owner's of 2026-11-10), a token today's did not hold and no lay but the page fill's reads: its run's tokens
    // counted without it, the run recorded as the share's)
    const shared = got.state === 'laid' ? (got.lay.runs ?? []).map((q) => q.tokens.filter(isShare).length) : []
    const laid = mine('F6', 'X.runs')?.laidRuns as { runs?: Raw[] } | null | undefined
    const runs = laid?.runs?.map((r, i) => ({ ...r, tokens: (r.tokens as number) - (shared[i] ?? 0) }))
    d = glued(
      laid ? { ...laid, runs } : null,
      (c.slot('X.runs')?.laidRuns as Raw | null | undefined) ?? null,
      'laidRuns',
    )
    if (d) return { at: 'F6', d, steps }
    steps.push(shared.some((n) => n > 0) ? 'F6 runs (share)' : 'F6 runs')
  }
  const a7 = mine('F7', 'S.settle'),
    b7 = c.slot('S.settle')
  if (a7 || b7) {
    d = firstDifference(a7 ?? null, b7 ?? null, 'settle')
    if (d) return { at: 'F7', d, steps }
    steps.push((a7?.moved as number) ? 'F7 moved' : 'F7')
  }
  const a8 = mine('F8', 'S.share'),
    b8 = c.slot('S.share')
  if (a8 || b8) {
    const want = b8?.share as Raw | null | undefined
    d = firstDifference(
      a8?.share ?? null,
      want ? Object.fromEntries(Object.entries(want).map(([k, v]) => [k, num(v)])) : null,
      'share',
    )
    if (d) return { at: 'F8', d, steps }
    steps.push('F8')
  }
  const out = c.slot('X.walk')
  if (!out) return { at: 'out', d: null, stopped: 'no X.walk slot (refused)', steps }
  d = glued(pick(mine('out', 'X.walk'), ['layout', 'lines']), pick(out, ['layout', 'lines']), 'out')
  if (d) return { at: 'out', d, steps }
  steps.push('out')
  const l9 = c.slot('S.fill.leads')
  if (!l9) return { at: 'L9', d: 'no S.fill.leads slot', steps }
  d = firstDifference(mine('L9', 'S.fill.leads'), l9, 'fillLeads')
  // (a round that borrowed room under its lines: its fill leadings option (i)'s, the gap under it measured from the borrow's
  // limit (the owner's of 2026-11-10, tap.ts borrowsAt), recorded as the ruling's, not compared)
  if (d && borrowsAt(c.pair, c.ord, c.round)) {
    steps.push('L9 (i)')
    return { at: 'L9', d: null, steps, lay: got.state === 'laid' ? got.lay : undefined, lead: true }
  }
  if (d) return { at: 'L9', d, steps }
  steps.push('L9')
  return { at: 'L9', d: null, steps, lay: got.state === 'laid' ? got.lay : undefined }
}
/** a cut of the frames' share alone (pageCutsOf `share`), a token today's tokens do not hold */
export const isShare = (t: unknown): boolean => !!(t as { share?: boolean }).share
