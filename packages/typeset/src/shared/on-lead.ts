// S.onLeadRetry (design-b §1.5, E25): a unit laid on from the line before over a shared row (its first line a pitch under that
// line, `onLead`, S.rowStart's) whose first line then stands lower than laid from TeX's row as before: laid again from the row
// as before, and kept so where its last line stands lower laid on, or where only laid as before does it set a line on the
// row's page. Ported from engine 065c1d973 run.mjs RUN:2263-2269 (lowerThan RUN:2263).
//
// Its inputs: the unit's layout at F2 and the tokens and blocks it was laid from, its size and parameters; where it was laid
// on from (`onLeadOf`: the row start S.rowStart set before, F1's); the fit (layoutCut, X.cut).
import type { FitBlock, FitParams, Layout, Tokens } from '../fit/types.ts'

type Cut = (tokens: Tokens, blocks: readonly FitBlock[], s: number, P: FitParams) => { layout: Layout; tokens: Tokens }
export type OnLeadInput = {
  layout: Layout
  /** the unit's tokens as laid at F2, before its cuts */
  tokens: Tokens
  blocks: FitBlock[]
  s: number
  P: FitParams
  onLeadOf: { start: number; startY: number | undefined } | null
}
export type OnLead = {
  /** 'as before': laid again from the row, taken; 'on lead': kept as laid on */
  taken: 'as before' | 'on lead'
  layout: Layout
  tokens: Tokens | null
  blocks: FitBlock[]
  was: Layout
} | null

const lowerThan = (a: { page: number; baseline: number }, b: { page: number; baseline: number | undefined }) =>
  a.page > b.page || (a.page === b.page && a.baseline < b.baseline! - 0.05)

/** S.onLeadRetry: null where the unit is not laid on, or its first line stands no lower than its row start */
export function onLeadRetry(i: OnLeadInput, layoutCut: Cut): OnLead {
  const b0 = i.blocks[0]
  if (!i.onLeadOf || !i.layout.lines[0] || !lowerThan(i.layout.lines[0], { page: b0!.page, baseline: b0!.startY }))
    return null
  const before: FitBlock[] = [
    { ...b0!, start: i.onLeadOf.start, startY: i.onLeadOf.startY, onLead: undefined },
    ...i.blocks.slice(1),
  ]
  const was = layoutCut(i.tokens, before, i.s, i.P),
    lw = was.layout.lines.at(-1),
    lc = i.layout.lines.at(-1)!
  const onPage = (lines: Layout['lines']) => lines.some((l) => l.page === b0!.page)
  if (!lw || lowerThan(lc, lw) || (!onPage(i.layout.lines) && onPage(was.layout.lines)))
    return { taken: 'as before', layout: was.layout, tokens: was.tokens, blocks: before, was: was.layout }
  return { taken: 'on lead', layout: i.layout, tokens: null, blocks: i.blocks, was: was.layout }
}
