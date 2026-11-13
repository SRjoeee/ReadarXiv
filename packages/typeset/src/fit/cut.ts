// X.cut (design-b §1.5, T23): a unit laid over its frame breaks, kept where it fits at its plain layout's state. Ported from
// engine 065c1d973 layer2.mjs layoutCut L2:3944-3962 (moved first as JavaScript by lab/typeset/move-fit.mjs, now
// TypeScript), held by the walk's, the chain's and the fill's replays on the corpus.
import { pageCutsOf, withPageBreaks } from '../breaker/cuts.ts'
import { layoutAt } from './at.ts'
import type { FitBlock, FitParams, Layout, Tokens } from './types.ts'
import { layoutUnit2 } from './walk.ts'

/**
 * A unit laid over its frame breaks (a page's, a column's): as without them, the fit's states searched once; where that
 * layout sets more of a run's lines in a frame than its share (pageCutsOf), laid once more with the breaks (withPageBreaks)
 * at that layout's own state, and kept where it fits there. Else as without them: a cut never costs a unit its fit, nor a
 * second search of the fit's states. A break ends the line that holds it where the breaker ends that line, and where that
 * line is its run's last the breaker lays it on the break's page (breakLines' strand), in this lay and in every later one of
 * the tokens it returns. Returns { layout, tokens }, the tokens it was laid from
 */
export function layoutCut(
  tokens: Tokens,
  blocks: readonly FitBlock[],
  s: number,
  P: FitParams,
): { layout: Layout; tokens: Tokens } {
  const plain = layoutUnit2(tokens, blocks, s, P)!
  if (plain.clipped || plain.spilled || blocks.length < 2) return { layout: plain, tokens }
  const cuts = pageCutsOf(plain.lines, blocks, plain.tokens ?? tokens, P)
  if (!cuts.length) return { layout: plain, tokens }
  // (the share's cuts (pageCutsOf `share`) go with the tokens, and a lay keeps them only at a state that holds the share: the
  // fit's own lay, and every lay at another state, as without them)
  const broken = withPageBreaks(tokens, cuts)
  const cut = layoutAt(broken, blocks, s, P, plain.state)
  if (cut.clipped) return { layout: plain, tokens }
  cut.tried = plain.tried
  return { layout: cut, tokens: broken }
}
