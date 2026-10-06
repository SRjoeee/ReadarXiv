import { beforeAll, describe, expect, it } from 'vitest'
import { breakPoints, patternsOfTex } from '@/pdf-reader/engine/layer-proto/hyph.mjs'
import { layGroups, layOrder } from '@/pdf-reader/engine/layer-proto/run.mjs'

// The layer's v0: the approved prototype ported into the engine (layer-proto/, from readarxiv-web's exp/instant-layer
// at 9e56fca). Its drawing is measured by the layer gate against the prototype's own floor (--engine-kind=proto); these
// are its pure parts: the order the prototype's page laid units in, the hyphenation patterns it read from TeX's files,
// and how it reads a placeholder's source

describe("v0's lay order: main.js's promises when every page after the first is drawn after the last batch", () => {
  const u = (id: number, pages: number[]) => ({ id, pages })
  it('a page-one unit is laid in its batch; a unit on later pages when its last page is drawn, in the order it began to wait', () => {
    // a [1] lays at once; b [1, 2] waits on page 2 only after a turn of the queue, behind c and e, which waited at once;
    // e [2, 3] then waits on page 3 behind f
    const placed = [u(0, [1]), u(1, [1, 2]), u(2, [2]), u(3, [1]), u(4, [2, 3]), u(5, [3])]
    expect(layGroups(placed)).toEqual([[1, [0, 3]], [2, [2, 1]], [3, [5, 4]]])
    expect(layOrder(placed)).toEqual([0, 3, 2, 1, 5, 4])
  })
  it('batches: a later batch waits behind the units of earlier ones', () => {
    const placed = [u(0, [1, 2]), u(1, [2]), u(2, [1, 2]), u(3, [2])]
    // batch 2: 1 waits, then 0 after its turn; batch 2's 3 waits, then 2
    expect(layOrder(placed, 2)).toEqual([1, 0, 3, 2])
    // one batch: 1 and 3 wait at once, 0 and 2 after their turn
    expect(layOrder(placed, 8)).toEqual([1, 3, 0, 2])
  })
  it('a paper with no units lays nothing on its first page', () => {
    expect(layGroups([])).toEqual([[1, []]])
  })
})

describe("v0's hyphenation: TeX's pattern files read as the prototype's host read them", () => {
  it('reads the patterns and exceptions, comments out first', () => {
    const tex = '% \\patterns{not these}\n\\patterns{ % the real ones\n.ach4 a1b\n2bc }\n\\hyphenation{ ta-ble pro-ject }\n'
    expect(patternsOfTex(tex)).toEqual({ patterns: ['.ach4', 'a1b', '2bc'], exceptions: ['ta-ble', 'pro-ject'] })
  })
  it("reads dehyphn.tex's T1 umlauts and its \\3, and leaves out the OT1 repeats", () => {
    const tex = '\\patterns{\n\\n{"a1b} 1\\3e \\c{x1y}\n}\n'
    expect(patternsOfTex(tex).patterns).toEqual(['\u00E41b', '1\u00DFe'])
  })
  it('breaks a word where the patterns allow, and an exception as written', () => {
    const data = { pats: new Map([['ab', [0, 1, 0]]]), exceptions: new Map([['table', 'ta-ble']]), maxLen: 2 }
    expect(breakPoints('xxabxx', 'de', data)).toEqual([3])
    expect(breakPoints('table', 'en', data)).toEqual([2])
    // Russian by its rules: never a single letter left
    for (const at of breakPoints('\u043F\u0440\u043E\u0433\u0440\u0430\u043C\u043C\u0430', 'ru', true)) expect(at >= 2 && at <= 7).toBe(true)
  })
})

describe("v0's reading of a placeholder's source", () => {
  let L2: typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  beforeAll(async () => {
    // layer2.mjs measures with a canvas made when it loads; the test environment has none, and these functions measure nothing
    const g = globalThis as { OffscreenCanvas?: unknown }
    g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length }) } } }
    L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  })
  it('a symbol and an accent as their characters', () => {
    expect(L2.texToText2('\\%')).toBe('%')
    expect(L2.texToText2('\\~{n}')).toBe('\u00F1')
    expect(L2.texToText2('$\\dagger$')).toBe('\u2020')
  })
  it("a paper's own macro is looked for on the page: in math a crop's, in text the page's text", () => {
    expect(L2.phClass2('$\\sqrt{\\dmodel}$')).toEqual({ cls: 'other', unknown: true })
    expect(L2.phClass2('\\bert')).toEqual({ cls: 'umacro', unknown: true })
    expect(L2.phClass2('\\cite{he2016}')).toEqual({ cls: 'cite' })
  })
})
