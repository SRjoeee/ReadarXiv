// The types of place.mjs (B.place, today's placeItems and laidOut moved as they are: lab/typeset/move-fit.mjs).
// @ts-ignore: JavaScript moved as it is, typed by this file alone (a package holds no declaration file)
import * as m from './place.mjs'
import type { FitBlock, FitParams, FitState, Layout } from '../fit/types.ts'
import type { Broken } from './break.ts'

/** a fit's breaking at its state made a layout: its lines placed, what it set and lost counted (L2:4139 laidOut) */
export const laidOut: (
  fit: { r: Broken; st: FitState; f: number },
  s: number,
  P: FitParams,
  tried: number,
  blocks: readonly FitBlock[],
) => Layout = m.laidOut
