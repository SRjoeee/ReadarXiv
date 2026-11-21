// A page's glyphs as readPdf makes them (glyph.ts PageGlyph): each glyph's eight coordinates in its page's one Float64Array, read
// by getters, every other field its own; and a glyph with a field changed made by glyphWith, never a spread, which copies a page
// glyph's own fields alone (lane mem-back: the coordinates were 16-byte heap numbers each, 8 a glyph, in two Docs of a paper).
import { describe, expect, it } from 'vitest'
import type { DocGlyph } from '../src/doc.ts'
import { glyphWith } from '../src/glyph.ts'
import { textOf } from '../src/locate/facts.ts'
import { pageGlyphsOf } from './helpers/doc.ts'

const plain = (u: string, x = 72, y = 700, o: Partial<DocGlyph> = {}): DocGlyph => {
  const size = o.size ?? 10
  return {
    u,
    code: u.codePointAt(0) ?? 0,
    font: 'ABCDEF+CMR10',
    base: 'CMR10',
    x0: x,
    x1: x + 0.6 * size,
    y,
    top: y + 0.7 * size,
    bottom: y - 0.2 * size,
    size,
    ix0: x + 0.1,
    ix1: x + 0.5 * size,
    n: 3,
    k: 1,
    form: false,
    blank: !/\S/.test(u),
    fill: 0,
    fid: undefined,
    pid: undefined,
    clipped: undefined,
    unseen: undefined,
    ...o,
  }
}
const FIELDS = [
  'u',
  'code',
  'font',
  'base',
  'x0',
  'x1',
  'y',
  'top',
  'bottom',
  'size',
  'ix0',
  'ix1',
  'n',
  'k',
  'form',
  'blank',
  'fill',
  'fid',
  'pid',
  'clipped',
  'unseen',
  'nu',
  'along',
] as const
const read = (g: DocGlyph) => FIELDS.map((f) => g[f])

describe('a page glyph', () => {
  const list = [
    plain('a'),
    plain('b', 78.25, 700.5, { fill: 0xff, fid: 2, pid: 1, clipped: true }),
    plain('c', -0, 650, { nu: true, along: 9.5, form: true, unseen: true }),
  ]
  const page = pageGlyphsOf(list)
  it('reads every field as the glyph it was made of', () => {
    expect(page.map(read)).toEqual(list.map(read))
    expect(Object.is(page[2]!.x0, -0)).toBe(true)
  })
  it("holds its coordinates in its page's one array", () => {
    const arrays = new Set(page.map((g) => (g as unknown as { c: Float64Array }).c))
    expect(arrays.size).toBe(1)
    expect([...arrays][0]).toBeInstanceOf(Float64Array)
    expect([...arrays][0]!.length).toBe(8 * list.length)
  })
  it('changed by glyphWith keeps its coordinates and its kind; a plain one as a spread would', () => {
    const w = glyphWith(page[1]!, { u: 'é' })
    expect(read(w)).toEqual(read({ ...list[1]!, u: 'é' }))
    expect(Object.getPrototypeOf(w)).toBe(Object.getPrototypeOf(page[1]))
    expect(page[1]!.u).toBe('b')
    expect(glyphWith(list[0]!, { u: 'x' })).toEqual({ ...list[0]!, u: 'x' })
  })
  it('reads as text as a plain glyph does, an accent joined to its letter', () => {
    const run = (s: string, x: number) => [...s].map((ch, i) => plain(ch, x + 6 * i))
    const kl = [plain('('), plain('K', 78), plain('l', 84), plain('¨', 90), plain('o', 90), ...run('tergens', 96)]
    expect(textOf(pageGlyphsOf(kl))).toBe(textOf(kl))
    expect(textOf(pageGlyphsOf(kl))).toBe('(Klötergens')
  })
})
