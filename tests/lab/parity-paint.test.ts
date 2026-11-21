// @vitest-environment node
// The parity's replica of the reader's highlight paint (lab/typeset/parity/paint.mjs paintedEntries), read by verdict.mjs's
// highlight fill: a figure text (Laid.lit `band`) painted on its own lines' band alone, as packages/reader compose/highlight.ts
// paints it; any other member padded beside and by the page's half leading over and under.
import { describe, expect, it } from 'vitest'
// @ts-expect-error — a plain node module of the lab
import { paintedEntries } from '../../lab/typeset/parity/paint.mjs'

describe('the highlight paint the parity measures, as the reader paints it', () => {
  const label = [400, 600, 420, 605]
  it('paints a figure text on its band alone', () => {
    const lit = { left: [[label]], right: [[label]], own: [], band: true }
    expect(paintedEntries(lit, 'left', [label], 2.25, 2.71)).toEqual([[label]])
  })
  it('pads any other member beside and by the half leading', () => {
    const lit = { left: [[label]], right: [[label]], own: [] }
    expect(paintedEntries(lit, 'left', [label], 2.25, 2.71)).toEqual([[[397.75, 597.29, 422.25, 607.71]]])
  })
})
