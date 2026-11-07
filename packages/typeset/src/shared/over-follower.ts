// S.overFollower (design-b §1.5, E26; the owner's ruling of 2026-11-03: a run-in head's room on its row): a unit whose last row
// another unit's first continues on a shared line, that row the only line of its last block, nothing kept between the two,
// and its fit clipped there: its last block run on to the end of the next unit's first line, as one line of the row, and laid
// again; taken where it fits so. Ported from engine 065c1d973 run.mjs overFollower RUN:1763-1789. Its facts: the follower
// (the next member of its flow) and whether it will be laid (admitted, not laid yet: today's `f.refused`, `f.taken`), the
// shared row (the follower's lead row, F.chains: lane L1's Placed.join), the follower's first line in the file (its page and
// x1: lane L1's first Line of the follower), whether something is kept between the two (keptAfter: Placed.join's kept).
import type { FitBlock, FitParams, Layout, Tokens } from '../fit/types.ts'

type Cut = (tokens: Tokens, blocks: readonly FitBlock[], s: number, P: FitParams) => { layout: Layout; tokens: Tokens }

export type OverFollowerInput = {
  /** the unit's kind; a cell is never laid over a follower */
  kind: string
  /** the follower on its last row: its id, whether it will be laid (admitted and not laid yet), its row and its first line
   *  in the file; null where no unit follows on a shared line */
  follower: {
    id: number
    open: boolean
    row: { page: number; baseline: number } | null
    first: { page: number; x1: number } | null
  } | null
  /** something stays between the two on the row (keptAfter) */
  kept: boolean
  /** the unit's pages */
  pages: readonly number[]
  layout: Layout
  tokens: Tokens
  blocks: readonly FitBlock[]
  s: number
  P: FitParams
}
export type OverFollower = { id: number; blocks: FitBlock[]; layout: Layout; tokens: Tokens } | null

/** S.overFollower (RUN:1763 overFollower) */
export function overFollower(i: OverFollowerInput, layoutCut: Cut): OverFollower {
  const f = i.follower
  if (!f || i.kept || i.kind === 'cell') return null
  if (!i.layout.clipped) return null
  if (!f.open) return null
  const row = f.row,
    fu = f.first
  if (!row || !fu || fu.page !== row.page) return null
  if (i.pages.some((q) => q !== row.page)) return null
  const bi = i.blocks.length - 1,
    b = i.blocks[bi]
  if (!b || b.page !== row.page || b.rects.length !== 1 || b.centred || Math.abs(b.B[0]! - row.baseline) >= 0.05)
    return null
  const x1 = fu.x1
  if (!(x1 > b.x1 + 0.1)) return null
  const blocks = i.blocks.map((q, k) => (k === bi ? { ...q, x1 } : q))
  const laid = layoutCut(i.tokens, blocks, i.s, i.P)
  if (laid.layout.clipped) return null
  return { id: f.id, blocks, layout: laid.layout, tokens: laid.tokens }
}
