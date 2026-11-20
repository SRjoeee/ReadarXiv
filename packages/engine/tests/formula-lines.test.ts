// A line of TeX's that holds a tall inline formula is one line (lines.ts cutLines, told which glyphs are a formula's): TeX sets
// a line's text on its baseline and a formula inside the line, its parts shifted up and down within the line's box, and stacks a
// paragraph's lines each box under the one before. On ink made by hand.
import { describe, expect, it } from 'vitest'
import type { DocGlyph } from '../src/doc.ts'
import { cutLines } from '../src/locate/lines.ts'

/** a glyph: its ink from 0.2 of its size under its origin to 0.7 over, half a size across (a space none: its outline is
 *  empty); `o` overrides */
const g = (u: string, x: number, y: number, size = 10, o: Partial<DocGlyph> = {}): DocGlyph => ({
  u,
  code: u.codePointAt(0) ?? 0,
  font: 'CMR10',
  base: 'CMR10',
  x0: x,
  x1: x + 0.5 * size,
  y,
  top: u === ' ' ? y : y + 0.7 * size,
  bottom: u === ' ' ? y : y - 0.2 * size,
  size,
  ix0: x,
  ix1: u === ' ' ? x : x + 0.5 * size,
  n: 0,
  k: 0,
  form: false,
  blank: false,
  fill: 0,
  ...o,
})
/** a run of text glyphs on a baseline from x, 5 pt apart */
const words = (s: string, x: number, y: number, size = 10) => [...s].map((u, i) => g(u, x + 5 * i, y, size))
/** the glyphs in order, those of `formula` a formula's: each line's baseline, start and glyph count, and untold */
function cut(parts: { gs: DocGlyph[]; formula?: boolean }[]) {
  const gs = parts.flatMap((p) => p.gs)
  const isFormula = new Set<number>()
  let k = 0
  for (const p of parts)
    for (const _ of p.gs) {
      if (p.formula) isFormula.add(k)
      k++
    }
  const list = gs.map((_, i) => i)
  const at = (i: number) => ({ page: 1, g: gs[i]! })
  const told = cutLines(list, at, (i) => isFormula.has(i)).map((l) => [l.base, l.x0, l.gs.length])
  const untold = cutLines(list, at).map((l) => [l.base, l.x0, l.gs.length])
  return { told, untold }
}

describe('a line holding a tall inline formula', () => {
  it('holds a fraction whose numerator carries a raised exponent, in big delimiters, and the text after them', () => {
    // (the shape of a rate O((a b)/T + (c^{p/3} d)/T), the numerator's exponent 16.9 pt over the baseline, more than 1.5 sizes:
    // its line one, on its text's baseline, the line under it apart)
    const { told, untold } = cut([
      { gs: words('with a rate', 108, 418.68) },
      {
        formula: true,
        gs: [
          g('O', 108, 395.11),
          g('(', 116, 415.13, 10, { bottom: 379.67, top: 415.52 }),
          g('a', 124, 404.82, 7),
          g('b', 128, 404.82, 7),
          g('T', 125, 386.27, 7),
          g('+', 140, 395.11),
          g('c', 152, 404.82, 7),
          g('p', 156, 412.04, 5),
          g('3', 155, 406.68, 5),
          g('d', 162, 404.82, 7),
          g('T', 156, 386.27, 7),
          g(')', 200, 415.13, 10, { bottom: 379.67, top: 415.52 }),
        ],
      },
      { gs: words('. However', 206, 395.11) },
      { gs: words('than the', 108, 363.53) },
    ])
    expect(told).toEqual([
      [418.68, 108, 9],
      [395.11, 108, 20],
      [363.53, 108, 7],
    ])
    // (untold, every glyph text: the rule as before, which cuts that line into pieces)
    expect(untold.length).toBeGreaterThan(3)
  })
  it('holds a cases formula, its rows and its condition column, and opens the next line back at its start', () => {
    // (setting eta = { 6/(mu t) if t <= S ; (T)/(mu) if t > S }, for all t, where: the conditions after the column's gap, each
    // row off the baseline; the next line opens with the formula's last part, [T], at the line's start, under its ink)
    const { told, untold } = cut([
      { gs: words('for any', 108, 192.72) },
      { gs: words('setting', 108, 168.94) },
      {
        formula: true,
        gs: [
          g('η', 150, 168.94),
          g('=', 156, 168.94),
          g('{', 162, 186.37, 10, { bottom: 156.49, top: 186.37 }),
          g('6', 170, 176.22, 7),
          g('μ', 170, 166.19, 7),
          // (the conditions' letters stand on their baseline, no descender: their ink over the line's text band)
          ...[...'t≤S'].map((u, i) => g(u, 200 + 5 * i, 176.22, 10, { bottom: 176.22 })),
          g('T', 168, 166.19, 7),
          g('μ', 168, 158.83, 7),
          ...words('t>S', 200, 160.6),
          g('∀', 220, 168.94),
        ],
      },
      { gs: words('where', 230, 168.94) },
      { formula: true, gs: [g('[', 108, 143.04), g('T', 113, 143.04), g(']', 118, 143.04)] },
      { gs: words('then', 125, 143.04) },
    ])
    expect(told).toEqual([
      [192.72, 108, 6],
      [168.94, 108, 26],
      [143.04, 108, 7],
    ])
    expect(untold.length).toBeGreaterThan(3)
  })
  it('holds a matrix, its entries column by column, and stands on its text’s baseline', () => {
    // (Define X = [ three rows of four columns ] ⊂ V. The entries, twelve, outnumber the line's words: its baseline is still
    // its text's)
    const entries = [0, 1, 2, 3].flatMap((c) => [670.08, 641.38, 612.69].map((y) => g(String(c), 150 + 10 * c, y)))
    const { told, untold } = cut([
      { gs: words('Define', 87, 641.76) },
      {
        formula: true,
        gs: [
          g('X', 120, 641.76),
          g('=', 126, 641.76),
          g('[', 133, 680.12, 10, { bottom: 608.4, top: 680.12 }),
          ...entries,
          g(']', 195, 680.12, 10, { bottom: 608.4, top: 680.12 }),
          g('⊂', 202, 641.76),
          g('V', 208, 641.76),
        ],
      },
      { gs: words('.', 214, 641.76) },
      { gs: words('where', 87, 596) },
    ])
    expect(told).toEqual([
      [641.76, 87, 25],
      [596, 87, 5],
    ])
    expect(untold.length).toBeGreaterThan(2)
  })
})

describe('a line that opens with a formula’s raised part', () => {
  it('holds a fraction’s numerator and the denominator that comes back under it to the line’s start', () => {
    // (1/sqrt(2 pi) opening the line, its numerator 3.84 pt over the baseline and centred right of the denominator's start; the
    // radical back left to the line's start and wholly under the numerator's band; then an integral and the line's words)
    const { told, untold } = cut([
      {
        formula: true,
        gs: [
          g('1', 80, 696.48, 7),
          g('√', 72, 688.08, 10, { bottom: 686, top: 694.5 }),
          g('2', 80, 688.08, 7),
          g('π', 84, 688.08, 7),
          g('∫', 100, 692.64, 10, { bottom: 683, top: 706 }),
          g('e', 108, 692.64),
        ],
      },
      { gs: words('dt where', 116, 692.64) },
      { gs: words('next', 72, 680.64) },
    ])
    expect(told).toEqual([
      [692.64, 72, 13],
      [680.64, 72, 4],
    ])
    expect(untold.length).toBeGreaterThan(2)
  })
  it('holds a fraction whose numerator opens the line and whose denominator comes back under it', () => {
    // (S(x)/l = l - 1 + ...: the numerator 4.83 pt over the line's baseline, the denominator 8.27 pt under the numerator,
    // back left of its end)
    const { told, untold } = cut([
      {
        formula: true,
        gs: [
          ...[...'S(x)'].map((u, i) => g(u, 80 + 3.5 * i, 420.7, 7)),
          g('l', 85, 412.43, 7),
          ...[...'=l-1'].map((u, i) => g(u, 100 + 5 * i, 415.87)),
        ],
      },
      { gs: words('holds', 125, 415.87) },
      { gs: words('next', 72, 403.87) },
    ])
    expect(told).toEqual([
      [415.87, 80, 14],
      [403.87, 72, 4],
    ])
    expect(untold.length).toBeGreaterThan(2)
  })
  it('holds an accented nucleus that opens the line and its subscript back under it', () => {
    // (I-bar with a superscript and a subscript: the nucleus 2.5 pt over the line's baseline, its subscript back to the line's
    // start, 5.26 pt under the nucleus)
    const { told, untold } = cut([
      {
        formula: true,
        gs: [g('Ī', 108, 450.83), ...[...'str'].map((u, i) => g(u, 114 + 3.5 * i, 455, 7)), g('S', 110, 445.57, 7)],
      },
      { gs: words('is the', 130, 448.32) },
      { gs: words('next', 108, 436.32) },
    ])
    expect(told).toEqual([
      [448.32, 108, 10],
      [436.32, 108, 4],
    ])
    expect(untold.length).toBeGreaterThan(2)
  })
})

describe('the near misses: lines that stay as they were', () => {
  it('keeps a paragraph of plain text in its lines', () => {
    const parts = [
      { gs: words('one line', 108, 700) },
      { gs: words('two line', 108, 688) },
      { gs: words('three', 108, 676) },
    ]
    const { told, untold } = cut(parts)
    expect(told).toEqual([
      [700, 108, 7],
      [688, 108, 7],
      [676, 108, 5],
    ])
    expect(told).toEqual(untold)
  })
  it('keeps ordinary inline formulas with their scripts in their lines', () => {
    // (x_i^2 + y on a line of text, its scripts 7 pt, 1.5 under and 3.6 over the baseline; the next line a pitch under)
    const { told, untold } = cut([
      { gs: words('where', 108, 700) },
      {
        formula: true,
        gs: [g('x', 140, 700), g('i', 145, 698.5, 7), g('2', 145, 703.6, 7), g('+', 152, 700), g('y', 160, 700)],
      },
      { gs: words('is', 168, 700) },
      { gs: words('next', 108, 688) },
    ])
    expect(told).toEqual([
      [700, 108, 12],
      [688, 108, 4],
    ])
    expect(told).toEqual(untold)
  })
  it('keeps two lines of text apart whose inks touch, a subscript of one over a superscript of the next', () => {
    // (TeX stacks the boxes touching: the first line's subscript reaches 4.24 pt under its baseline, the next line's squared
    // term 8.24 pt over its own, 12.45 pt lower: their inks meet by 0.03 pt; each line ends or opens with a formula)
    const { told, untold } = cut([
      { gs: words('is the one', 50.74, 233.99) },
      { formula: true, gs: [g('u', 110, 233.99), g('1', 115, 231.79, 7, { bottom: 229.75 })] },
      {
        formula: true,
        gs: [g('(', 50.74, 221.54, 10, { bottom: 217.29 }), g('u', 55, 221.54), g('2', 60, 225.5, 7, { top: 229.78 })],
      },
      { gs: words('then', 70, 221.54) },
    ])
    expect(told).toEqual([
      [233.99, 50.74, 10],
      [221.54, 50.74, 7],
    ])
    expect(told).toEqual(untold)
  })
  it('opens the next line where TeX broke a formula after a relation, its next part at the line’s start', () => {
    // (a row's text and a formula's end on 109.26, the next line opening with a summation sign whose origin TeX's math
    // extension sets at its top, its ink all under the row's text, then the line's text 12 pt under: two lines)
    const { told } = cut([
      { gs: words('text', 72, 109.26) },
      {
        formula: true,
        gs: [g('r', 92, 109.26), g('=', 97, 109.26), g('∑', 72, 104.78, 10, { bottom: 94.82, top: 104.78 })],
      },
      { gs: words('rj. Each', 82, 97.31) },
    ])
    expect(told).toEqual([
      [109.26, 72, 6],
      [97.31, 72, 8],
    ])
  })
  it('opens the next line of a hanging indent where a formula goes on there, its ink under the line before', () => {
    // (x = a + on a line from x 72, the formula going on with b at the hang's indent, x 85, 12 pt under: not back to the line's
    // start, but its ink wholly under the line's: two lines)
    const { told } = cut([
      { gs: words('then', 72, 700) },
      { formula: true, gs: [g('x', 100, 700), g('=', 106, 700), g('a', 112, 700), g('+', 118, 700), g('b', 85, 688)] },
      { gs: words('holds', 92, 688) },
    ])
    expect(told).toEqual([
      [700, 72, 8],
      [688, 85, 6],
    ])
  })
  it('opens a line where an indented continuation of text stands beside a tall formula TeX smashed', () => {
    // (the indented continuation of an item, text, beside a summation whose ink reaches 20 pt under its line: the formula's ink
    // keeps no text glyph on its line)
    const { told } = cut([
      { gs: words('item text', 72, 700) },
      { formula: true, gs: [g('∑', 125, 690, 10, { bottom: 680, top: 708 })] },
      { gs: words('more', 140, 700) },
      { gs: words('continued', 85, 688) },
    ])
    expect(told).toEqual([
      [700, 72, 13],
      [688, 85, 9],
    ])
  })
  it('stands a line on its words’ baseline where an inline cases’ rows outnumber them', () => {
    // (a line's last words, then a cases formula whose two rows of words stand either side of the axis, 17 glyphs to 7)
    const { told, untold } = cut([
      { gs: words('and so on', 108, 300) },
      {
        formula: true,
        gs: [
          g('{', 160, 315, 10, { bottom: 288, top: 315 }),
          ...words('if a holds', 168, 306),
          ...words('otherwise', 168, 294),
        ],
      },
      { gs: words('next', 108, 270) },
    ])
    expect(told).toEqual([
      [300, 108, 25],
      [270, 108, 4],
    ])
    // (untold, the rows' glyphs outvote the words)
    expect(untold[0]![0]).not.toBe(300)
  })
})
