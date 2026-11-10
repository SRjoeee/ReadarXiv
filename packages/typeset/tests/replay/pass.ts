// A page's fill replayed (S.fill.page, design-b §1.6 L10): every unit of a pair laid by the chain from F2 to its fill leadings
// (round.ts, its last round), then each of the ledger's passes (TAP.md §3 L10: `passes[]`, every call of the corpus) run by
// fillPass over its begun units in the order they were laid and those running on to the page, each answer against what the
// tap read: the page's target (`told`), each unit's decision (`units`), the page's size (`size`), each unit filled (`filled`),
// and each begun unit's final layout (its L10 slot). A pass any of whose units the chain did not lay is not replayed, and says
// which.
import type { FitState, Layout } from '../../src/fit/types.ts'
import type { FillDecision, FillLaid, PageRules } from '../../src/shared/fill-page.ts'
import { MissingMeasure } from '../../src/metrics/table.ts'
import { fillPass, type PassUnit } from '../../src/shared/fill-pass.ts'
import { layoutOf, linesOf, walkCase } from './fit-input.ts'
import { chain } from './round.ts'
import { derived, firstDifference, flooredIn, inWordOf, ledger, onPagesOf, roomUnderIn, wordGlued } from './tap.ts'

type Raw = Record<string, unknown>
type Pass = {
  page: number
  units: Raw[]
  target: Raw
  filled?: Raw[]
  begun: number[]
  continuing: number[]
  told: Raw | null
  size?: Raw
}
/** a pass replayed: its first difference, the units the chain did not lay, how many it filled; `ruled` a pass that differs and
 *  holds a unit over a page or column break whose frames the port fills each at its own leading (`framed`), or one that differs
 *  where today's held a unit's gap to the next paragraph's leading (tap.ts flooredIn): the owner's 2026-11-08; or one on a page
 *  of a unit a run of which the room ruling lays otherwise (tap.ts roomUnderIn); or one that holds a unit whose fill leadings
 *  option (i) moves (laysOf `lead`: the owner's of 2026-11-10, the page's target reading its vote) */
export type PassResult = { page: number; d: string | null; missing?: number[]; filled: number; ruled?: true }

const fin = (v: unknown) => (typeof v === 'number' ? (Number.isFinite(v) ? v : String(v)) : (v ?? null))
const stateOf = (st: FitState) => (layoutOf({ state: st } as Raw) as { state: unknown }).state
let rules: { targets: Record<string, { params: Raw }> } | null = null

/** a unit over a page or column break, or of paragraphs TeX states inside it, a frame of which the port fills at a leading of
 *  its own (S.fill.leads frameLeadsOf, the owner's word of 2026-11-08: each paragraph fills the original's block, at its own
 *  leading), which today's held to one leading; or whose frames hold TeX's share of its lines where that holds within the
 *  page's band (frameShareOf `fillShare`, the owner's of 2026-11-10), each at the leading that holds it */
export const framed = (p: PassUnit | undefined): boolean =>
  !!p &&
  (!!p.fillLeads ||
    !!p.fillShare ||
    (p.runs ?? []).some((q) => !!(q as PassUnit).fillLeads || !!(q as PassUnit).fillShare))
/** every unit of a pair laid by the chain, at its last round, by ord; and the chains' differences (a unit today laid with a
 *  borrowed line too: the chain borrows from the room today's walk had, its block's `free`), but a unit a run of which the room
 *  ruling changes (tap.ts roomUnderIn), whose lay is the ruling's; `lead` the units whose fill leadings option (i) moves (round.ts
 *  `lead`), the pages they stand on (`pages`) and every unit with a line on one of them (`units`): a pass or a page's drawing
 *  that differs there is the ruling's */
export function laysOf(pair: string): {
  lays: Map<number, PassUnit>
  differ: string[]
  lead: { moved: Set<number>; pages: Set<number>; units: Set<number> }
} {
  const L = ledger(pair)
  const room = roomUnderIn(pair)
  const lays = new Map<number, PassUnit>(),
    differ: string[] = [],
    moved = new Set<number>()
  for (const u of L.units) {
    const rounds = [...new Set(u.slots.filter((s) => s.by === 'X.cut').map((s) => s.round))]
    const last = rounds.at(-1)
    if (last === undefined) continue
    const c = walkCase(pair, u.ord, last)
    if (typeof c === 'string') continue
    const got = chain(c)
    if (got.lead) moved.add(u.ord)
    // (a unit the room ruling lays otherwise: the port's own lay, which its page's pass fills)
    const ruled = !!got.d && room.runs.has(u.ord)
    if (got.d && !ruled) differ.push(`ord ${u.ord}: ${got.at} ${got.d}`)
    const lay = ruled ? got.own : got.lay
    if (!lay) continue
    const admit = u.slots.find((s) => s.by === 'U.admit' && s.round === 0)?.value as Raw | undefined
    lays.set(u.ord, Object.assign(lay, { fillable: true, pages: (admit?.pages ?? []) as number[] }))
  }
  return { lays, differ, lead: { moved, ...onPagesOf(pair, moved) } }
}

/**
 * The cells today's page fill letter-spaced: the units of kind `cell` a pass of the pair's ledger tracked (its decision's
 * `tracked` above 0). The owner's ruling of 2026-11-08 sets no letter spacing on a cell (fill-page.ts: TeX stretches no tabular
 * entry), so each is laid untracked where today's was tracked: its pass's decision is today's but for its tracking (0, and so
 * not full), and its filled layout, its final layout and its drawing differ from today's by that alone
 */
export function trackedCells(pair: string): Set<number> {
  const L = ledger(pair)
  const cells = new Set(L.units.filter((u) => u.kind === 'cell').map((u) => u.ord))
  const out = new Set<number>()
  for (const pass of L.passes as Pass[])
    for (const u of pass.units) if (cells.has(u.id as number) && Number(u.tracked) > 0) out.add(u.id as number)
  return out
}

/** each pass of a pair replayed over the chain's lays (`moved`: laysOf's units whose fill leadings option (i) moves) */
export function passesOf(
  pair: string,
  lays: Map<number, PassUnit>,
  moved: ReadonlySet<number> = new Set(),
): PassResult[] {
  const L = ledger(pair)
  rules ??= derived('rules')
  const R = rules!.targets[L.target]!.params
  const P = { ...R, adaptiveFill: L.info.adaptiveFill } as unknown as PageRules
  const untracked = trackedCells(pair)
  const cells = new Set(L.units.filter((u) => u.kind === 'cell').map((u) => u.ord))
  const out: PassResult[] = []
  const gap = flooredIn(pair)
  const room = roomUnderIn(pair)
  for (const pass0 of L.passes as Pass[]) {
    // (a cell the fill found short: untracked by the ruling, so not full (a cell's `full` is read by nothing: no cell is a
    // body unit the page's size grows), its decision today's but for that; the layouts of one today tracked not compared.
    // Today's decisions told the next paragraph's leading and whether it set the unit closer, which the gap ruling of
    // 2026-11-08 no longer reads: left out)
    const pass: Pass = {
      ...pass0,
      units: pass0.units
        .map(({ next: _next, closer: _closer, ...u }) => u)
        .map((u) => (cells.has(u.id as number) && u.short ? { ...u, tracked: 0, full: false } : u)),
      ...(pass0.filled ? { filled: pass0.filled.filter((f) => !untracked.has(f.id as number)) } : {}),
    }
    const ids = [...pass.begun, ...pass.continuing]
    const missing = ids.filter((id) => !lays.has(id))
    if (missing.length) {
      out.push({ page: pass.page, d: null, missing, filled: 0 })
      continue
    }
    const laid = ids.map((id) => lays.get(id)!)
    const units: Raw[] = [],
      filled: Raw[] = []
    let size: Raw | undefined
    // (a pass the gap ruling changes may lay a unit at states today never tried, no longer set closer and so grown with the
    // page: the table holds no width of them and throws MissingMeasure, the ruling's)
    let got: ReturnType<typeof fillPass>
    try {
      got = fillPass(pass.page, laid, P, {
        unit: (q: FillLaid, v: FillDecision) => units.push({ id: q.id, run: q.run ?? null, ...v }),
        size: (ok, scale, grown) => {
          size = { ok, scale: fin(scale), grown }
        },
        filled: (q: FillLaid, st: FitState, l: Layout, target: number) =>
          filled.push({
            id: q.id,
            run: q.run ?? null,
            state: stateOf(st),
            layout: layoutOf(l as Raw),
            target: fin(target),
          }),
      })
    } catch (e) {
      if (!(e instanceof MissingMeasure) || !gap.pages.has(pass.page)) throw e
      out.push({ page: pass.page, d: null, filled: 0, ruled: true })
      continue
    }
    const { told, filled: took } = got
    const toldOf = told
      ? { own: fin(told.own), anchor: fin(told.anchor), target: fin(told.target), body: !!told.body }
      : null
    let d =
      firstDifference(
        laid.filter((p) => p.pages[0] === pass.page).map((p) => p.id),
        pass.begun,
        'begun',
      ) ??
      firstDifference(toldOf, pass.told, 'told') ??
      firstDifference(units, pass.units, 'units') ??
      firstDifference(size ?? null, pass.size ?? null, 'size') ??
      firstDifference(
        filled.filter((f) => !untracked.has(f.id as number)),
        pass.filled ?? [],
        'filled',
      )
    // (each begun unit's final layout, its L10 slot)
    for (const id of pass.begun) {
      if (d) break
      if (untracked.has(id)) continue
      const p = lays.get(id)!
      const want = L.units.find((u) => u.ord === id)?.slots.find((s) => s.by === 'S.fill.page')?.value
      const mine = {
        page: pass.page,
        target: fin(told?.target ?? null),
        layout: layoutOf(p.layout as unknown as Raw),
        lines: linesOf(p.layout as unknown as Raw),
        leadBase: fin(p.P?.leadBase),
      }
      d = firstDifference(mine, want ?? null, `L10 ord ${id}`)
      // (a unit whose tokens hold an item that continues its word: its lines' ends read to a millionth of a point, lane
      // literal-fixes' rule moving a line's slack between its gaps and never its end, tap.ts wordGlued)
      if (d && inWordOf([...p.tokens, ...(p.runs ?? []).flatMap((q) => q.tokens)]))
        d = firstDifference(wordGlued(mine), wordGlued(want ?? null), `L10 ord ${id}`)
    }
    const ruled =
      !!d &&
      (gap.pages.has(pass.page) || room.pages.has(pass.page) || ids.some((id) => framed(lays.get(id)) || moved.has(id)))
    out.push({ page: pass.page, d: ruled ? null : d, filled: took.length, ...(ruled ? { ruled: true as const } : {}) })
  }
  return out
}
