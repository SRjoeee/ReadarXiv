// The types of last-lines.mjs (X.lastLines, today's toLastLines moved as it is: lab/typeset/move-fit.mjs).
// @ts-ignore: JavaScript moved as it is, typed by this file alone (a package holds no declaration file)
import * as m from './last-lines.mjs'
import type { Slot } from '../breaker/slots.types.ts'
import type { FitBlock, LaidLine } from './types.ts'

/** a heading set in fewer lines than the original's moved onto its last ones (L2:4291 toLastLines) */
export const toLastLines: (
  lines: LaidLine[],
  blocks: readonly FitBlock[],
  below: number | undefined,
  f: number,
  slots: () => Slot[],
) => void = m.toLastLines
