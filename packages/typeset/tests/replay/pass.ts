// A page's fill replayed (S.fill.page, design-b §1.6 L10): every unit of a pair laid by the chain from F2 to its fill leadings
// (round.ts, its last round), then each of the ledger's passes (TAP.md §3 L10: `passes[]`, every call of the corpus) run by
// fillPass over its begun units in the order they were laid and those running on to the page, each answer against what the
// tap read: the page's target (`told`), each unit's decision (`units`), the page's size (`size`), each unit filled (`filled`),
// and each begun unit's final layout (its L10 slot). A pass any of whose units the chain did not lay is not replayed, and says
// which.
import type { FitState, Layout } from '../../src/fit/types.ts'
import type { FillDecision, FillLaid, PageRules } from '../../src/shared/fill-page.types.ts'
import { fillPass, type PassUnit } from '../../src/shared/fill-pass.ts'
import { layoutOf, linesOf, walkCase } from './fit-input.ts'
import { chain } from './round.ts'
import { derived, firstDifference, ledger } from './tap.ts'

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
export type PassResult = { page: number; d: string | null; missing?: number[]; filled: number }

const fin = (v: unknown) => (typeof v === 'number' ? (Number.isFinite(v) ? v : String(v)) : (v ?? null))
const stateOf = (st: FitState) => (layoutOf({ state: st } as Raw) as { state: unknown }).state
let rules: { targets: Record<string, { params: Raw }> } | null = null

/** every unit of a pair laid by the chain, at its last round, by ord; and the chains' differences */
export function laysOf(pair: string): { lays: Map<number, PassUnit>; differ: string[] } {
  const L = ledger(pair)
  const lays = new Map<number, PassUnit>(),
    differ: string[] = []
  for (const u of L.units) {
    const rounds = [...new Set(u.slots.filter((s) => s.by === 'X.cut').map((s) => s.round))]
    const last = rounds.at(-1)
    if (last === undefined) continue
    const c = walkCase(pair, u.ord, last)
    if (typeof c === 'string') continue
    const got = chain(c)
    if (got.d) differ.push(`ord ${u.ord}: ${got.at} ${got.d}`)
    if (!got.lay) continue
    const admit = u.slots.find((s) => s.by === 'U.admit' && s.round === 0)?.value as Raw | undefined
    lays.set(u.ord, Object.assign(got.lay, { fillable: true, pages: (admit?.pages ?? []) as number[] }))
  }
  return { lays, differ }
}

/** each pass of a pair replayed over the chain's lays */
export function passesOf(pair: string, lays: Map<number, PassUnit>): PassResult[] {
  const L = ledger(pair)
  rules ??= derived('rules')
  const R = rules!.targets[L.target]!.params
  const P = { ...R, adaptiveFill: L.info.adaptiveFill } as unknown as PageRules
  const out: PassResult[] = []
  for (const pass of L.passes as Pass[]) {
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
    const { told, filled: took } = fillPass(pass.page, laid, P, {
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
      firstDifference(filled, pass.filled ?? [], 'filled')
    // (each begun unit's final layout, its L10 slot)
    for (const id of pass.begun) {
      if (d) break
      const p = lays.get(id)!
      const want = L.units.find((u) => u.ord === id)?.slots.find((s) => s.by === 'S.fill.page')?.value
      d = firstDifference(
        {
          page: pass.page,
          target: fin(told?.target ?? null),
          layout: layoutOf(p.layout as unknown as Raw),
          lines: linesOf(p.layout as unknown as Raw),
          leadBase: fin(p.P?.leadBase),
        },
        want ?? null,
        `L10 ord ${id}`,
      )
    }
    out.push({ page: pass.page, d, filled: took.length })
  }
  return out
}
