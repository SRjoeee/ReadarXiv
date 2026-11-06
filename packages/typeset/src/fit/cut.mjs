// X.cut (design-b §1.5): a unit laid over its frame breaks, kept where it fits at its plain layout's state. Today's
// code (layer2.mjs L2:3944-3962), moved by lab/typeset/move-fit.mjs; typed by cut.types.ts.
import { pageCutsOf, withPageBreaks } from '../breaker/cuts.mjs'
import { layoutAt } from './at.mjs'
import { layoutUnit2 } from './walk.mjs'

/**
 * A unit laid over its frame breaks (a page's, a column's): as without them, the fit's states searched once; where that
 * layout sets more of a run's lines in a frame than its share (pageCutsOf), laid once more with the breaks (withPageBreaks)
 * at that layout's own state, and kept where it fits there. Else as without them: a cut never costs a unit its fit, nor a second search of the
 * fit's states. A break ends the line that holds it where the breaker ends that line, and where that line is its run's last
 * the breaker lays it on the break's page (breakLines' strand), in this lay and in every later one of the tokens it returns.
 * Returns { layout, tokens }, the tokens it was laid from
 */
export function layoutCut(tokens, blocks, s, P) {
  const plain = layoutUnit2(tokens, blocks, s, P)
  if (plain.clipped || plain.spilled || blocks.length < 2) return { layout: plain, tokens }
  const cuts = pageCutsOf(plain.lines, blocks, plain.tokens ?? tokens, P)
  if (!cuts.length) return { layout: plain, tokens }
  const broken = withPageBreaks(tokens, cuts)
  const cut = layoutAt(broken, blocks, s, P, plain.state)
  if (cut.clipped) return { layout: plain, tokens }
  cut.tried = plain.tried
  return { layout: cut, tokens: broken }
}

