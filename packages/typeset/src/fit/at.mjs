// X.at (design-b §1.5): a unit laid at one state of the fit, with no search (the page fill's). Today's code
// (layer2.mjs L2:4259-4267), moved by lab/typeset/move-fit.mjs; typed by at.types.ts.
import { breakLines } from '../breaker/break.mjs'
import { laidOut } from '../breaker/place.mjs'
import { slotsAt } from '../breaker/slots.mjs'

/**
 * A unit laid at one state of the fit, with no search (D6's page fill, run.mjs fillPage: a unit's fitted state at another
 * leading, tracking or size): layoutUnit2's answer, clipped where the state does not set every token in the text's order
 */
export function layoutAt(tokens, blocks, s, P, st) {
  const f = s * st.scale
  return laidOut({ r: breakLines(tokens, slotsAt(blocks, st, P, s), f, st, P, st.scale, true, blocks), st, f }, s, P, 1, blocks)
}

