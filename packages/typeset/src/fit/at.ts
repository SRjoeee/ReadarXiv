// X.at (design-b §1.5): a unit laid at one state of the fit, with no search (the page fill's). Ported from engine 065c1d973
// layer2.mjs layoutAt L2:4259-4267 (moved first as JavaScript by lab/typeset/move-fit.mjs, now TypeScript), held by the
// walk's, the chain's and the fill's replays on the corpus.
import { breakLines } from '../breaker/break.ts'
import { laidOut } from '../breaker/place.types.ts'
import { slotsAt } from '../breaker/slots.ts'
import type { Token } from '../breaker/tokens.ts'
import type { FitBlock, FitParams, FitState, Layout } from './types.ts'

/**
 * A unit laid at one state of the fit, with no search (D6's page fill, run.mjs fillPage: a unit's fitted state at another
 * leading, tracking or size): layoutUnit2's answer, clipped where the state does not set every token in the text's order
 */
export function layoutAt(
  tokens: readonly Token[],
  blocks: readonly FitBlock[],
  s: number,
  P: FitParams,
  st: FitState,
): Layout {
  const f = s * st.scale
  return laidOut(
    { r: breakLines(tokens, slotsAt(blocks, st, P, s), f, st, P, st.scale, true, blocks), st, f },
    s,
    P,
    1,
    blocks,
  )
}
