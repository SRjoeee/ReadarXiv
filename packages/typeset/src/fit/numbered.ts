// X.numbered (design-b §1.5, E17): a numbered heading set in fewer lines than the original's, laid again on the original's
// last lines with its number as its first line's start (its ink copied there, a crop: its face, its colour, the space its
// class set after it) and erased where it was; kept where it fits and moves down. Ported from engine 065c1d973 run.mjs
// RUN:2275-2286.
//
// Its inputs: the unit's layout, tokens, blocks, size and parameters as laid; whether U.decor took it as numbered; its
// label's characters (the number TeX set before its first line ← Placed.label), read into the number's crop.
import { median } from '../util.ts'
import { originalLines } from '../unit/decor.ts'
import type { Token } from '../breaker/tokens.ts'
import type { FitBlock, FitParams, Layout } from './types.ts'

type Walk = (tokens: readonly Token[], blocks: readonly FitBlock[], s: number, P: FitParams) => Layout | null
export type NumberCrop = {
  mode: 'crop'
  page: number
  crop: [number, number, number, number]
  baseline: number
  text: string
}

/** the number's crop: its glyphs' box, the space its class set after it to the line's start (RUN:2276-2278) */
export function numberCrop(
  chars: readonly { x0: number; x1: number; yb: number; size: number }[],
  text: string,
  b0: Pick<FitBlock, 'page' | 'x0' | 'indent'>,
): NumberCrop {
  const start = b0.x0 + b0.indent
  const x0 = Math.min(...chars.map((c) => c.x0)) - 0.4,
    x1 = Math.max(Math.max(...chars.map((c) => c.x1)) + 0.4, start - 0.4)
  return {
    mode: 'crop',
    page: b0.page,
    crop: [
      x0,
      Math.min(...chars.map((c) => c.yb - 0.26 * c.size)),
      x1,
      Math.max(...chars.map((c) => c.yb + 0.8 * c.size)),
    ],
    baseline: median(chars.map((c) => c.yb)),
    text,
  }
}

export type NumberedInput = {
  numbered: boolean
  layout: Layout
  tokens: readonly Token[]
  blocks: FitBlock[]
  s: number
  P: FitParams
  crop: NumberCrop | null
}
/** X.numbered: null where the heading is not numbered or not set in fewer lines; else its layout with the number, taken or not */
export function numberedLayout(
  i: NumberedInput,
  layoutUnit2: Walk,
): { taken: boolean; layout: Layout; tokens: Token[]; blocks: FitBlock[]; P: FitParams } | null {
  if (!i.numbered || i.layout.clipped || !(i.layout.lines.length < originalLines(i.blocks[0]!)) || !i.crop) return null
  const crop = i.crop,
    b0 = i.blocks[0]!
  const x0 = crop.crop[0],
    x1 = crop.crop[2]
  const blocks = [{ ...b0, start: x0 + 0.4 }],
    tokens = [{ crop, cw: x1 - x0, glue: false, w100: 0 } as Token, ...i.tokens],
    P = { ...i.P, lastLines: true }
  const laid = layoutUnit2(tokens, blocks, i.s, P)!
  const taken = !laid.clipped && laid.lines.at(-1)!.baseline < i.layout.lines.at(-1)!.baseline - 0.05
  return { taken, layout: laid, tokens, blocks, P }
}
