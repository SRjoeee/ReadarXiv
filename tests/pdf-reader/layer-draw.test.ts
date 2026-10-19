// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  checkDraw, DRAW_ARGS, DRAW_BYTES, DRAW_DEST, DRAW_FONTS, DRAW_ITEMS, DRAW_LINKS, DRAW_MAPPED, DRAW_MAPPED_CHAR, DRAW_NAME, DRAW_QUADS, DRAW_STRING, DRAW_STRINGS, DRAW_URL, DRAW_ZOOM,
  type Draw, DrawRefusal, drawFontKey, drawInputsOf, type DrawSource, wireOf, wireText,
} from '@/pdf-reader/engine/layer-proto/draw.mjs'
import { BundleRefusal } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { readLeftPart, TOKENS_PAGE, writeLeftPart } from '@/pdf-reader/engine/layer-proto/format.mjs'
import { forged, PAPER, tokenWire } from './helpers/format-paper'

// A page's draw geometry in its left part (the E-C design note): checked by the reader, built and shed by the writer, read back in the
// layer's own input shapes

const font = (i = 0): Draw['fonts'][number] => [`CMR${i}`, 'serif', 0, ['a', 'b']]
const item = (s = 'word', f = 0, fills: number | number[] = 0): Draw['items'][number] => [s, 11.9552, 0, 11.9552, 79.37, 759.068, 453.53844480000004, 11.9552, f, fills]
const link = (): Draw['links'][number] => [[375.043, 348.423, 480.719, 362.371], null, null, 'cite.x', 'Smith', 0, 1, [0, 255, 0]]
const DRAW: Draw = { fonts: [font()], items: [item(), item('', 0, -1), item('x', -1), item('[16]', 0, [0, 0, 1, 0x0000ff, 3, 0])], links: [link()] }
const streamOf = () => 0

const left = (draw: unknown, o: { n?: number } = {}) => writeLeftPart({ paper: PAPER, page: 1, first: 0, tokens: tokenWire(o.n ?? 3), spans: [], pairs: [], draw: draw as never })
const refused = async (draw: unknown) => {
  const w = await left(null)
  const o = JSON.parse(new TextDecoder().decode(w.bytes))
  o.draw = draw
  const f = forged('left', o, { page: 1 })
  try { await readLeftPart(f.bytes, { ref: f.ref as never, streamOf }) } catch (e) { return e as BundleRefusal }
  return null
}

describe('draw in a left part', () => {
  it('round trips: written, read back equal, the key last; null and an empty page read are different', async () => {
    const w = await left(DRAW)
    expect(w.drawShed).toBe(false)
    expect(Object.keys(JSON.parse(new TextDecoder().decode(w.bytes))).at(-1)).toBe('draw')
    const r = await readLeftPart(w.bytes, { ref: w.ref as never, streamOf })
    expect(r.draw).toEqual(DRAW)
    const none = await readLeftPart((await left(null)).bytes, { ref: (await left(null)).ref as never, streamOf })
    expect(none.draw).toBeNull()
    const empty = { fonts: [], items: [], links: [] }
    const e = await left(empty)
    expect((await readLeftPart(e.bytes, { ref: e.ref as never, streamOf })).draw).toEqual(empty)
    expect(e.sha256).not.toBe((await left(null)).sha256)
  })

  it('keeps null and an empty set of mapped characters apart, and a lone surrogate', async () => {
    const d: Draw = { fonts: [['A', null, 0, null], ['B', 'serif', 0, []], ['C', 'serif', 0, ['\ud800', 'x\udc00y', '\u{1F600}']], [null, null, 2, null], ['', 'sans', 1, null]], items: [], links: [] }
    const w = await left(d)
    const r = await readLeftPart(w.bytes, { ref: w.ref as never, streamOf })
    expect(r.draw).toEqual(d)
    expect(r.draw!.fonts[0]![3]).toBeNull()
    expect(r.draw!.fonts[1]![3]).toEqual([])
    expect(r.draw!.fonts[2]![3]![0]).toBe('\ud800')
    const inputs = drawInputsOf(r.draw!)
    const keys = [...inputs.fonts.keys()]
    expect(new Set(keys).size).toBe(5)
    expect(inputs.fonts.get(keys[0]!)!.mapped).toBeNull()
    expect(inputs.fonts.get(keys[1]!)!.mapped).toEqual(new Set())
    expect(inputs.fonts.get(keys[2]!)!.mapped).toEqual(new Set(['\ud800', 'x\udc00y', '\u{1F600}']))
    // a font's key is its content's, in a namespace of its own
    expect(drawFontKey(d.fonts[0]!)).toBe(drawFontKey(['A', null, 0, null]))
    expect(drawFontKey(d.fonts[0]!)).not.toBe(drawFontKey(['A', null, 0, []]))
    expect(keys[0]).toMatch(/^axt-draw-/)
  })

  it('gives the layer its inputs: items with their transform, fonts by content, Link annotations with their dests as PDF.js gives them', () => {
    const d = wireOf({
      fonts: [['F', 'serif', 0, new Set(['a'])]],
      items: [['hi', 1, 0, 1, 10, 20, 5, 6, 0]],
      links: [
        [new Float32Array([1, 2, 3, 4]), new Float32Array(16), null, [{ num: 12, gen: 3 }, { name: 'XYZ' }, 72, 700, null], null, 1, 2, new Uint8ClampedArray([1, 2, 3])],
        [[1, 2, 3, 4], new Float32Array(7), 'https://a.b/', 'sec.1', 'x', null, null, null],
        [[1, 2, 3, 4], null, null, [5, { name: 'Fit' }], null, 0, 0, null],
      ],
    } as never)!
    expect(d.links[0]![3]).toEqual([0, 12, 3, 'XYZ', 72, 700, null])
    expect(d.links[0]![1]).toHaveLength(16)
    expect(d.links[1]![1]).toBeNull() // (7 numbers: not quads: the layer falls back to the rect)
    expect(d.links[2]![3]).toEqual([1, 5, 0, 'Fit'])
    const inputs = drawInputsOf(d)
    expect(inputs.items[0]).toMatchObject({ str: 'hi', transform: [1, 0, 0, 1, 10, 20], width: 5, height: 6 })
    // (an item given no fills: none told)
    expect(inputs.fills).toEqual([-1])
    expect(drawInputsOf(DRAW).fills).toEqual([0, -1, 0, [0, 0, 1, 0x0000ff, 3, 0]])
    expect(inputs.items[0]!.fontName).toBe([...inputs.fonts.keys()][0])
    expect(inputs.styles[inputs.items[0]!.fontName!]).toEqual({ fontFamily: 'serif' })
    expect(inputs.annots[0]).toMatchObject({ subtype: 'Link', dest: [{ num: 12, gen: 3 }, { name: 'XYZ' }, 72, 700, null], color: [1, 2, 3], borderStyle: { width: 1, style: 2 } })
    expect(inputs.annots[1]).toMatchObject({ url: 'https://a.b/', dest: 'sec.1', overlaidText: 'x' })
    expect(inputs.annots[1]!.borderStyle).toBeUndefined()
    expect(inputs.annots[2]!.dest).toEqual([5, { name: 'Fit' }])
  })

  it('writes -0 as 0, and the same bytes whatever the order of the keys the input was built in', async () => {
    const a = wireOf({ ...DRAW, items: [['z', -0, 0, 0, 0, 0, 1, 1, -1]] } as never)!
    expect(Object.is(a.items[0]![1], 0)).toBe(true)
    const swapped = { links: DRAW.links, items: DRAW.items, fonts: DRAW.fonts }
    expect((await left(swapped)).sha256).toBe((await left(DRAW)).sha256)
  })

  describe('the reader refuses, at its path', () => {
    const cases: [string, (d: Draw & Record<string, unknown>) => void, string][] = [
      ['an extra key', d => { d.extra = 1 }, 'draw.extra'],
      ['too many items', d => { d.items = Array.from({ length: DRAW_ITEMS + 1 }, () => item('', -1)) }, 'draw.items'],
      ['an item string past its cap', d => { d.items = [item('x'.repeat(DRAW_STRING + 1))] }, 'draw.items[0][0]'],
      ['all strings past their cap', d => { d.items = Array.from({ length: DRAW_STRINGS / DRAW_STRING + 2 }, () => item('x'.repeat(DRAW_STRING), -1)) }, 'draw.items'],
      ['an item of the wrong arity', d => { d.items = [[...item()].slice(0, 8) as never] }, 'draw.items[0]'],
      ['a number not finite', d => { d.items = [[...item().slice(0, 1), null, ...item().slice(2)] as never] }, 'draw.items[0][1]'],
      ['a number past 1e7', d => { d.items = [[...item().slice(0, 1), 2e7, ...item().slice(2)] as never] }, 'draw.items[0][1]'],
      ['a font index past the table', d => { d.items = [item('a', 5)] }, 'draw.items[0][8]'],
      ['fills that are neither a fill nor runs', d => { d.items = [item('ab', 0, 'red' as never)] }, 'draw.items[0][9]'],
      ['a fill past 0xFFFFFF', d => { d.items = [item('ab', 0, 0x1000000)] }, 'draw.items[0][9]'],
      ['runs not from the first character', d => { d.items = [item('ab', 0, [1, 0, 2, 255])] }, 'draw.items[0][9]'],
      ['runs past the string', d => { d.items = [item('ab', 0, [0, 0, 2, 255])] }, 'draw.items[0][9]'],
      ['runs of one fill twice', d => { d.items = [item('ab', 0, [0, 255, 1, 255])] }, 'draw.items[0][9]'],
      ['too many fonts', d => { d.fonts = Array.from({ length: DRAW_FONTS + 1 }, (_, i) => font(i)) }, 'draw.fonts'],
      ['a font name past its cap', d => { d.fonts = [['x'.repeat(DRAW_NAME + 1), null, 0, null]] }, 'draw.fonts[0][0]'],
      ['a font type3 of 3', d => { d.fonts = [['x', null, 3 as never, null]] }, 'draw.fonts[0][2]'],
      ['mapped too long', d => { d.fonts = [['x', null, 0, Array.from({ length: DRAW_MAPPED + 1 }, () => 'a')]] }, 'draw.fonts[0][3]'],
      ['a mapped element past its cap', d => { d.fonts = [['x', null, 0, ['x'.repeat(DRAW_MAPPED_CHAR + 1)]]] }, 'draw.fonts[0][3][0]'],
      ['a mapped element that is no string', d => { d.fonts = [['x', null, 0, [1 as never]]] }, 'draw.fonts[0][3][0]'],
      ['too many links', d => { d.links = Array.from({ length: DRAW_LINKS + 1 }, link) }, 'draw.links'],
      ['quads not a multiple of 8', d => { d.links = [[[0, 0, 1, 1], [1, 2, 3], null, null, null, null, null, null]] }, 'draw.links[0][1]'],
      ['too many quads', d => { d.links = [[[0, 0, 1, 1], new Array(8 * (DRAW_QUADS + 1)).fill(1), null, null, null, null, null, null]] }, 'draw.links[0][1]'],
      ['a url past its cap', d => { d.links = [[[0, 0, 1, 1], null, 'u'.repeat(DRAW_URL + 1), null, null, null, null, null]] }, 'draw.links[0][2]'],
      ['a named dest past its cap', d => { d.links = [[[0, 0, 1, 1], null, null, 'd'.repeat(DRAW_DEST + 1), null, null, null, null]] }, 'draw.links[0][3]'],
      ['an explicit dest of the wrong kind', d => { d.links = [[[0, 0, 1, 1], null, null, [2, 1, 0, 'XYZ'], null, null, null, null]] }, 'draw.links[0][3][0]'],
      ['an explicit dest with too many arguments', d => { d.links = [[[0, 0, 1, 1], null, null, [0, 1, 0, 'XYZ', ...new Array(DRAW_ARGS + 1).fill(1)], null, null, null, null]] }, 'draw.links[0][3]'],
      ['a zoom name past its cap', d => { d.links = [[[0, 0, 1, 1], null, null, [0, 1, 0, 'z'.repeat(DRAW_ZOOM + 1)], null, null, null, null]] }, 'draw.links[0][3][3]'],
      ['an index dest with a generation', d => { d.links = [[[0, 0, 1, 1], null, null, [1, 1, 7, 'Fit'], null, null, null, null]] }, 'draw.links[0][3][2]'],
      ['a colour out of range', d => { d.links = [[[0, 0, 1, 1], null, null, null, null, null, null, [0, 256, 0]]] }, 'draw.links[0][7][1]'],
    ]
    for (const [name, edit, path] of cases) {
      it(name, async () => {
        const d = JSON.parse(JSON.stringify(DRAW))
        edit(d)
        const e = await refused(d)
        expect(e, name).toBeInstanceOf(BundleRefusal)
        expect(e).toMatchObject({ kind: 'left' })
        expect(e!.path, name).toBe(path)
      })
    }

    it('too many values, counted as JSON counts them', async () => {
      const d = { fonts: [], items: Array.from({ length: DRAW_ITEMS }, () => item('', -1)), links: Array.from({ length: DRAW_LINKS }, () => [[0, 0, 1, 1], new Array(8 * DRAW_QUADS).fill(1), null, null, null, null, null, null]) }
      expect(() => checkDraw(d)).toThrow(DrawRefusal)
    })
    it('a draw that is no object, and a left part with no draw key', async () => {
      expect((await refused([]))!.path).toBe('draw')
      expect((await refused('x'))!.path).toBe('draw')
    })
  })

  describe('the writer sheds (null, drawShed), never throws, for every reason the reader refuses', () => {
    const shed = async (draw: unknown) => {
      const w = await left(draw)
      const r = await readLeftPart(w.bytes, { ref: w.ref as never, streamOf })
      expect(r.draw, JSON.stringify(draw).slice(0, 80)).toBeNull()
      expect(w.drawShed).toBe(true)
      expect(w.emptied).toBe(false)
      expect(r.table.n).toBe(3)
    }
    it('non-finite and huge numbers, long strings, too many rows, a mapped element that is no string, a bad font index', async () => {
      await shed({ ...DRAW, items: [item('a'), [...item('b')].map((v, i) => (i === 3 ? Number.NaN : v))] })
      await shed({ ...DRAW, items: [[...item()].map((v, i) => (i === 2 ? 1e8 : v))] })
      await shed({ ...DRAW, items: [item('x'.repeat(DRAW_STRING + 1))] })
      await shed({ ...DRAW, items: Array.from({ length: DRAW_ITEMS + 1 }, () => item('', -1)) })
      await shed({ ...DRAW, fonts: [['f', null, 0, [1]]] })
      await shed({ ...DRAW, items: [item('a', 9)] })
      await shed({ ...DRAW, links: Array.from({ length: DRAW_LINKS + 1 }, link) })
      await shed({ fonts: 'x', items: [], links: [] })
      await shed({ fonts: [], items: null, links: [] })
    })
    it('text past DRAW_BYTES, and values past DRAW_VALUES', async () => {
      const long = Array.from({ length: 200 }, () => item('é'.repeat(DRAW_STRING - 1), -1))
      expect(JSON.stringify({ fonts: [], items: long, links: [] }).length).toBeGreaterThan(DRAW_BYTES)
      expect(wireOf({ fonts: [], items: long, links: [] } as never)).toBeNull()
      // (within every other cap, past the bytes: 6,000 items of exact doubles)
      const exact = Array.from({ length: DRAW_ITEMS }, (_, i) => ['abcdefghijklmnopqrstuvwxyz', 11.955200000000001 + i / 7, 0.1 + i / 3, 11.9552 + i / 11, 79.37 + i / 13, 759.068 + i / 17, 453.53844480000004 + i / 19, 11.9552 + i / 23, -1, -1])
      expect(JSON.stringify({ fonts: [], items: exact, links: [] }).length).toBeGreaterThan(DRAW_BYTES)
      expect(() => checkDraw({ fonts: [], items: exact, links: [] })).not.toThrow()
      expect(wireOf({ fonts: [], items: exact, links: [] } as never)).toBeNull()
      expect(wireOf({ fonts: [], items: Array.from({ length: DRAW_ITEMS }, () => item('', -1)), links: Array.from({ length: 2000 }, () => [[0, 0, 1, 1], new Array(8 * DRAW_QUADS).fill(1), null, null, null, null, null, null]) } as never)).toBeNull()
    })
    it('sheds the geometry before it empties the tokens', async () => {
      const spans = Array.from({ length: 30_000 }, (_, i) => [i, [0, 1]] as [number, number[]])
      const pairs = spans.slice(0, 5000).map(([id]) => [id, [0, 0, 1]] as [number, number[]])
      const big: Draw = { fonts: [font()], items: Array.from({ length: 5200 }, () => item('w', 0)), links: [] }
      expect(JSON.stringify(big).length).toBeLessThan(DRAW_BYTES)
      const w = await writeLeftPart({ paper: PAPER, page: 1, first: 0, tokens: tokenWire(TOKENS_PAGE), spans, pairs, draw: big })
      expect(w.drawShed).toBe(true)
      expect(w.emptied).toBe(false)
      const none = await writeLeftPart({ paper: PAPER, page: 1, first: 0, tokens: tokenWire(TOKENS_PAGE), spans, pairs, draw: null })
      expect(none.emptied).toBe(false)
      // and a page emptied for its tokens ships no draw either
      const e = await writeLeftPart({ paper: PAPER, page: 1, first: 0, tokens: tokenWire(TOKENS_PAGE + 1), spans: [], pairs: [], draw: DRAW })
      expect([e.emptied, e.drawShed]).toEqual([true, true])
    })
    it('takes PDF.js\'s own shapes: typed arrays, a Set of characters, an explicit dest', async () => {
      const src: DrawSource = {
        fonts: [['n', undefined, 0, new Set(['a', 'b'])]],
        items: [['t', 1, 0, 1, 2, 3, 4, 5, 0]],
        links: [[new Float32Array([1, 2, 3, 4]), new Float32Array(8), undefined, [{ num: 1, gen: 0 }, { name: 'Fit' }], undefined, undefined, undefined, new Uint8ClampedArray([9, 9, 9])]],
      }
      const w = await left(src)
      expect(w.drawShed).toBe(false)
      const r = await readLeftPart(w.bytes, { ref: w.ref as never, streamOf })
      expect(r.draw!.fonts[0]).toEqual(['n', null, 0, ['a', 'b']])
      expect(r.draw!.links[0]).toEqual([[1, 2, 3, 4], [0, 0, 0, 0, 0, 0, 0, 0], null, [0, 1, 0, 'Fit'], null, null, null, [9, 9, 9]])
    })
  })

  it('a draw given as wireText\'s JSON is written as the same bytes as the draw itself: kept, shed for size, emptied with its tokens', async () => {
    const same = async (draw: unknown, o: { n?: number; spans?: [number, number[]][]; pairs?: [number, number[]][] } = {}) => {
      const input = { paper: PAPER, page: 1, first: 0, tokens: tokenWire(o.n ?? 3), spans: o.spans ?? [], pairs: o.pairs ?? [] }
      const w = wireText(draw as never)
      if (!w) throw new Error('no wire')
      expect(w.text).toBe(JSON.stringify(w.draw))
      expect(JSON.stringify(JSON.parse(w.text))).toBe(w.text)
      const a = await writeLeftPart({ ...input, draw: draw as never }), b = await writeLeftPart({ ...input, drawText: w.text })
      expect(b.sha256).toBe(a.sha256)
      expect([...b.bytes]).toEqual([...a.bytes])
      expect([b.emptied, b.drawShed, b.values]).toEqual([a.emptied, a.drawShed, a.values])
      return a
    }
    // (kept, of PDF.js's shapes too: typed arrays, -0, an explicit dest, a string to escape)
    expect((await same(DRAW)).drawShed).toBe(false)
    await same({ fonts: [['n', undefined, 0, new Set(['a', '"\\'])]], items: [['t\u2028"', -0, 0, 1, 2.5e-7, 3, 4, 5, 0]], links: [[new Float32Array([1, 2, 3, 4]), new Float32Array(8), undefined, [{ num: 1, gen: 0 }, { name: 'XYZ' }, 1, null, 0], 'x\ud800', undefined, undefined, new Uint8ClampedArray([9, 9, 9])]] })
    // (shed for the part's size, its tokens kept; emptied with its tokens)
    const spans = Array.from({ length: 30_000 }, (_, i) => [i, [0, 1]] as [number, number[]])
    const pairs = spans.slice(0, 5000).map(([id]) => [id, [0, 0, 1]] as [number, number[]])
    const big: Draw = { fonts: [font()], items: Array.from({ length: 5200 }, () => item('w', 0)), links: [] }
    const shed = await same(big, { n: TOKENS_PAGE, spans, pairs })
    expect([shed.drawShed, shed.emptied]).toEqual([true, false])
    const emptied = await same(DRAW, { n: TOKENS_PAGE + 1 })
    expect([emptied.emptied, emptied.drawShed]).toEqual([true, true])
  })

  it('moves a left part\'s digest when only the draw moves, and ships no draw as the bytes of a part with `draw: null`', async () => {
    const a = await left(DRAW), b = await left({ ...DRAW, items: [item('other')] }), c = await left(null)
    expect(new Set([a.sha256, b.sha256, c.sha256]).size).toBe(3)
    expect(new TextDecoder().decode(c.bytes).endsWith(',"draw":null}')).toBe(true)
  })
})
