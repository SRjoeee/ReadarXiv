import { beforeAll, describe, expect, it } from 'vitest'

// A unit's blocks are centred as the layout file has it (layer2.mjs blocks2's `centred`, run.mjs: UNIT_FLAG.CENTRED, TeX's own
// alignment where the marked original tells it, else the maker's reading of arXiv's lines). A unit no file holds (a part laid
// with no layout) is read from its lines, as before: several whose centres agree and whose widths differ, or one in the page's
// middle. 1810.04805's "C.1 Effect of Number of Training Steps" and "5.3 Feature-based Approach with BERT" were set centred by
// the layer's own guess, the title's span after its number in its column's middle by chance; the guess (centredInColumn) is gone

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

const views = [[0, 0, 612, 792]]
/** one line in the page's middle (206 to 406), and a paragraph's two justified lines with its last short */
const middle = [[1, 206, 498, 406, 508]], para = [[1, 72, 498, 540, 508], [1, 72, 486, 300, 496]]

describe('a unit\'s blocks centred as the layout file has it', () => {
  it('the file\'s word: not centred, though its one line is in the page\'s middle; centred, though its lines are not', () => {
    expect(L2.blocks2(middle as never, views, null, new Map(), null, null, null, null, null, false).map(b => b.centred)).toEqual([false])
    const told = L2.blocks2(para as never, views, null, new Map(), null, null, null, null, null, true)
    expect(told.map(b => [b.centred, b.measures ?? null])).toEqual([[true, null]])
  })

  it('no file\'s word (a part laid with no layout): read from its lines, as before', () => {
    expect(L2.blocks2(middle as never, views, null, new Map()).map(b => b.centred)).toEqual([true])
    expect(L2.blocks2(para as never, views, null, new Map()).map(b => b.centred)).toEqual([false])
  })
})
