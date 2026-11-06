// The types of share.mjs (S.share, today's shareOf and keepsShare moved as they are: lab/typeset/move-fit.mjs).
// @ts-ignore: JavaScript moved as it is, typed by this file alone (a package holds no declaration file)
import * as m from './share.mjs'
import type { FitMeasure } from '../breaker/measure.ts'
import type { FitBlock, Layout } from '../fit/types.ts'

/** the shared row as a unit's layout leaves it */
export type Share = {
  page: number
  y: number
  band: number
  x0: number
  x1: number
  end: number | null
  at: number | null
  ink: number | null
  above?: boolean
  kept?: boolean
}
/** the shared row a layout leaves, or null where no block holds it (L2:4363 shareOf) */
export const shareOf: (
  layout: Layout,
  blocks: readonly FitBlock[],
  row: { page: number; baseline: number; size: number; x0?: number; x1?: number },
  measure: FitMeasure,
) => Share | null = m.shareOf
/** whether a layout keeps its shared row as the fit left it (L2:4407 keepsShare) */
export const keepsShare: (share: Share | null, layout: Layout, measure: FitMeasure) => boolean = m.keepsShare
