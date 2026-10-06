import { beforeAll, describe, expect, it } from 'vitest'
import type { Audit } from '@/pdf-reader/engine/layer-proto/check.mjs'
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

describe("v0's drawing as data: recorded in its own device pixels, drawn at any resolution from the page drawn there", () => {
  let L2: typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  beforeAll(async () => {
    const g = globalThis as { OffscreenCanvas?: unknown }
    g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length }) } } }
    L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  })
  // a page 792 units tall at 2.5 device pixels a unit; one block of two lines, a crop of page 1 on the second
  const k = 2.5
  const px = (x: number, y: number): [number, number] => [x * k, (792 - y) * k]
  const rects = [[1, 100, 700, 300, 710], [1, 100, 686, 250, 696]]
  const blocks = [{ page: 1, rects, x1: 300 }] as unknown as Parameters<typeof L2.unitOps>[1]
  const L = { scale: 0.9, lines: [{ page: 1, baseline: 688, items: [{ x: 120, w: 18, t: { crop: { crop: [40, 500, 60, 510], page: 1, baseline: 502, k: 3 } } }] }] } as unknown as Parameters<typeof L2.unitOps>[0]
  /** a 2D context that records its calls */
  const recorder = () => {
    const calls: unknown[][] = []
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_, name: string) => (...args: unknown[]) => { calls.push([name, ...args]) },
      set: (_, name: string, v) => { calls.push([`=${name}`, v]); return true },
    })
    return { ctx: ctx as unknown as CanvasRenderingContext2D, calls }
  }
  it("records v0's erase (its padding: 0.3 before the unit's first line, 1.8 elsewhere, 1.2 above and below) and its crop", () => {
    const audit: Audit[] = []
    const ops = L2.unitOps(L, blocks, 1, { px, k, hasSource: () => true, pxOf: () => px, audit, id: 7 })
    expect(ops.map(o => o.op)).toEqual(['erase', 'erase', 'crop'])
    // the first line from 0.3 before it; the second, not its block's last but the block's own, to its own right edge
    expect(ops[0]).toEqual({ op: 'erase', box: [(100 - 0.3) * k, (792 - 711.2) * k, (300 + 1.8 - (100 - 0.3)) * k, (711.2 - 698.8) * k].map(v => expect.closeTo(v, 9)) })
    expect(ops[1]).toEqual({ op: 'erase', box: [(100 - 1.8) * k, (792 - 697.2) * k, (250 + 1.8 - (100 - 1.8)) * k, (697.2 - 684.8) * k].map(v => expect.closeTo(v, 9)) })
    // the crop: its source's box, laid at the item's place with its baseline on the line's, at the fit's scale
    expect(ops[2]).toEqual({ op: 'crop', page: 1, src: [40 * k, (792 - 510) * k, 20 * k, 10 * k].map(v => expect.closeTo(v, 9)), dst: [120 * k, (792 - (688 + 8 * 0.9)) * k, 18 * k, 10 * 0.9 * k].map(v => expect.closeTo(v, 9)) })
    expect(audit.map(a => (a as { what: string }).what)).toEqual(['erase', 'erase', 'crop'])
  })
  it('leaves out a crop whose page is not drawn, and records it nowhere', () => {
    const audit: Audit[] = []
    const ops = L2.unitOps(L, blocks, 1, { px, k, hasSource: () => false, pxOf: () => px, audit, id: 7 })
    expect(ops.map(o => o.op)).toEqual(['erase', 'erase'])
    expect(audit).toHaveLength(2)
  })
  const ops = [
    { op: 'erase', box: [10, 20, 30, 40] },
    { op: 'restore', page: 1, clip: [[10, 20, 30, 40]], boxes: [[12, 22, 4, 4]] },
    { op: 'crop', page: 2, src: [1, 2, 3, 4], dst: [5, 6, 7, 8] },
  ] as Parameters<typeof L2.drawOps>[1]
  it("draws at v0's own resolution with v0's own calls and numbers: white, the page put back within the erase, the crop darkened in", () => {
    const { ctx, calls } = recorder()
    const page1 = { id: 1 } as unknown as CanvasImageSource, page2 = { id: 2 } as unknown as CanvasImageSource
    L2.drawOps(ctx, ops, 1, p => (p === 1 ? page1 : page2))
    expect(calls).toEqual([
      ['save'], ['=fillStyle', '#fff'], ['fillRect', 10, 20, 30, 40],
      ['save'], ['beginPath'], ['rect', 10, 20, 30, 40], ['clip'], ['drawImage', page1, 12, 22, 4, 4, 12, 22, 4, 4], ['restore'],
      ['=globalCompositeOperation', 'darken'], ['drawImage', page2, 1, 2, 3, 4, 5, 6, 7, 8], ['=globalCompositeOperation', 'source-over'],
      ['restore'],
    ])
  })
  it('draws at any other resolution scaled, cut from the page drawn there; an operation with no page drawn is left out', () => {
    const { ctx, calls } = recorder()
    const page1 = { id: 1 } as unknown as CanvasImageSource
    L2.drawOps(ctx, ops, 2, p => (p === 1 ? page1 : null))
    expect(calls).toEqual([
      ['save'], ['=fillStyle', '#fff'], ['fillRect', 20, 40, 60, 80],
      ['save'], ['beginPath'], ['rect', 20, 40, 60, 80], ['clip'], ['drawImage', page1, 24, 44, 8, 8, 24, 44, 8, 8], ['restore'],
      ['restore'],
    ])
  })
})

describe("v0's first lines: never laid over ink a unit does not erase (step 2)", () => {
  let L2: typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  beforeAll(async () => {
    const g = globalThis as { OffscreenCanvas?: unknown }
    g.OffscreenCanvas ??= class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length }) } } }
    L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  })
  const serif = { fam: 'serif', bold: false, italic: false, caps: false, known: false } as never
  /** a text item's characters, each half its size wide, from x on baseline yb */
  const item = (text: string, x: number, yb: number, size: number, n: number, st = serif) => [...text].map((ch, k) => ({ ch, x0: x + 0.5 * size * k, x1: x + 0.5 * size * (k + 1), yb, size, item: n, ix: x, k, st }))
  it('a far-in first line keeps its start, which extendFirstLines left after another unit\'s line', () => {
    const [b] = L2.blocksOf2([[1, 200, 98, 400, 107], [1, 50, 86, 400, 95]] as never, [[0, 0, 612, 792]])
    expect(b.rects[0][1]).toBe(200)
    expect(b.indent).toBe(150)
  })
  it("a first line that opens with what its source does not write, before its first word, keeps it as a label", () => {
    const page = [...item('Input Representations', 10, 100, 10, 0, { ...serif as object, bold: true } as never), ...item('To make it work', 130, 100, 10, 1)]
    const rect = [1, 10, 97.85, 210, 106.83]
    const unit = { kind: 'para', src: 'To make it work', pieces: [{ t: 'text', s: '\n' }, { t: 'text', s: '\u4E3A\u4E86' }] } as never
    const p = L2.prepareUnit(unit, [rect] as never, [page as never], new Map() as never)
    expect(p.label?.text).toBe('Input Representations')
    // not where it is the source's own text, which the alignment missed
    const own = { kind: 'para', src: 'Input Representations To make it work', pieces: [{ t: 'text', s: '\u4E3A\u4E86' }] } as never
    const pageMissed = [...item('Inputt Representationss', 10, 100, 10, 0), ...item('To make it work', 130, 100, 10, 1)]
    expect(L2.prepareUnit(own, [rect] as never, [pageMissed as never], new Map() as never).label).toBeUndefined()
  })
})

