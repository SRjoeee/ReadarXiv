import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it, vi } from 'vitest'
import { BOXES_PAGE, GLYPHS_PAGE, type Glyph, MERGED, OPS_CAP, outlineBox, pageInk, regionMask, regionsOfPoints, STACK_MAX, STEPS_MAX } from '@readarxiv/engine'
import { figureUnitsOf } from '@/pdf-reader/engine/layout/figure-text.mjs'

// arXiv's ink from a page's operator list, as PDF.js's canvas places it: the lists are written here with pdfjs-dist's own
// operator codes, in the shapes PDF.js 6.3.289 gives them (a text matrix as one argument, a path as [op, data, minMax])

type Op = [number, unknown[]]
const list = (ops: Op[]) => ({ fnArray: ops.map(o => o[0]), argsArray: ops.map(o => o[1]) })
/** a glyph as the operator list holds it: its character, its width in the font's units, whether it is a space */
const g = (unicode: string, width = 500, isSpace = false) => ({ unicode, width, isSpace, fontChar: unicode, vmetric: null })
const FONTS: Record<string, unknown> = {
  f1: { name: 'ABCDEF+CMR10', fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0.7, descent: -0.2, isType3Font: false, vertical: false },
  t3: { name: 'T3Font', fontMatrix: [0.01, 0, 0, 0.01, 0, 0], isType3Font: true, vertical: false },
  v1: { name: 'GHIJKL+Vertical', fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0.88, descent: -0.12, vertical: true, defaultVMetrics: [1000, 500, 880] },
}
const commonObjs = { get: (id: string) => { if (!(id in FONTS)) throw new Error(`no object ${id}`); return FONTS[id] } }
const ink = (ops: Op[], rotate = 0) => pageInk(OPS, list(ops), commonObjs, { rotate })
/** a text object: the font at a size, the text matrix, then what is shown */
const text = (font: string, size: number, tm: number[], ...shown: Op[]): Op[] => [[OPS.beginText, []], [OPS.setFont, [font, size]], [OPS.setTextMatrix, [tm]], ...shown, [OPS.endText, []]]
const show = (...glyphs: unknown[]): Op => [OPS.showText, [glyphs]]
const only = (gs: Glyph[], u: string) => { const x = gs.find(q => q.u === u); if (!x) throw new Error(`no glyph ${u}`); return x }

describe('pageInk reads a font\'s name once', () => {
  // (PDF.js's FontInfo.name decodes a new string from the font's buffer at every read: read once a glyph, each glyph of a page held
  // a string of its own, 19.5 MiB of B's Doc on 2610.19159v1 (lane L9). Read once a font, and with the reader's `names` table once a
  // document, every glyph of a font holds the one string: lane mem-back)
  const counting = () => {
    let reads = 0
    const font = { fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0.7, descent: -0.2, isType3Font: false, vertical: false, get name() { reads++; return `ABCDEF+${'CMR10'}` } }
    return { font, reads: () => reads }
  }
  const page = (font: unknown) => ({ get: (id: string) => { if (id !== 'fc') throw new Error(`no object ${id}`); return font } })
  const shown = text('fc', 10, [1, 0, 0, 1, 72, 700], show(g('a'), g('b'), g('c')), [OPS.setFont, ['fc', 10]], show(g('d'), g('e')))
  it('once a page, every glyph its name', () => {
    const c = counting()
    const { glyphs } = pageInk(OPS, list(shown), page(c.font), { rotate: 0, indices: true })
    expect(glyphs.map(x => x.font)).toEqual(Array(5).fill('ABCDEF+CMR10'))
    expect(c.reads()).toBe(1)
  })
  it('once a document, the reader\'s table across its pages', () => {
    const c = counting(), names = new Map()
    for (let p = 0; p < 3; p++) pageInk(OPS, list(shown), page(c.font), { rotate: 0, indices: true, names })
    expect(c.reads()).toBe(1)
  })
  it('a font of no name its id, as before', () => {
    const none = { fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0.7, descent: -0.2, isType3Font: false, vertical: false, name: '' }
    const { glyphs } = pageInk(OPS, list(shown), page(none), { rotate: 0 })
    expect(glyphs.map(x => x.font)).toEqual(Array(5).fill('fc'))
  })
})

describe('pageInk', () => {
  it('a glyph is placed as the canvas places it', () => {
    const { glyphs, boxes, capped, rotated } = ink([[OPS.save, []], [OPS.transform, [2, 0, 0, 2, 0, 0]], ...text('f1', 10, [1, 0, 0, 1, 72, 700], show(g('A', 722), g('b', 556))), [OPS.restore, []]])
    expect(capped).toBe(false)
    expect(rotated).toBe(false)
    expect(boxes).toEqual([])
    expect(glyphs).toHaveLength(2)
    const a = only(glyphs, 'A'), b = only(glyphs, 'b')
    expect(a.x0).toBeCloseTo(144, 9)
    expect(a.y).toBeCloseTo(1400, 9)
    expect(a.size).toBeCloseTo(20, 9)
    // the advance: the width × the size / 1000 × the scale
    expect(a.x1 - a.x0).toBeCloseTo((722 * 10) / 1000 * 2, 9)
    expect(b.x0).toBeCloseTo(a.x1, 9)
    expect(b.x1 - b.x0).toBeCloseTo((556 * 10) / 1000 * 2, 9)
    // top and bottom from the font's ascent and descent
    expect(a.top).toBeCloseTo(1400 + 0.7 * 20, 9)
    expect(a.bottom).toBeCloseTo(1400 - 0.2 * 20, 9)
    // the PostScript name with its subset tag
    expect(a.font).toBe('ABCDEF+CMR10')
  })

  it('a number in a shown array moves the next glyph back by its thousandths of the size', () => {
    const { glyphs } = ink(text('f1', 10, [1, 0, 0, 1, 72, 700], show(g('A', 500), -250, g('B', 500))))
    expect(only(glyphs, 'B').x0).toBeCloseTo(72 + 5 + 2.5, 9)
  })

  it('spacing, rise and horizontal scale move later glyphs', () => {
    const scaled = (...ops: Op[]) => ink([[OPS.transform, [2, 0, 0, 2, 0, 0]], ...text('f1', 10, [1, 0, 0, 1, 72, 700], ...ops)])
    const plain = only(scaled(show(g(' ', 250, true), g('X', 500))).glyphs, 'X')
    const spaced = only(scaled([OPS.setWordSpacing, [2]], [OPS.setCharSpacing, [0.5]], show(g(' ', 250, true), g('X', 500))).glyphs, 'X')
    // a word space of 2 and a character space of 0.5 after the space: the glyph after it 2.5 further, × the scale
    expect(spaced.x0 - plain.x0).toBeCloseTo(2.5 * 2, 9)
    // a character space alone is not a word space: after a glyph that is no space, only 0.5
    const notSpace = only(scaled([OPS.setWordSpacing, [2]], [OPS.setCharSpacing, [0.5]], show(g('-', 250), g('X', 500))).glyphs, 'X')
    const notSpacePlain = only(scaled(show(g('-', 250), g('X', 500))).glyphs, 'X')
    expect(notSpace.x0 - notSpacePlain.x0).toBeCloseTo(0.5 * 2, 9)
    // a rise of 3 raises the baseline by 3, and the box with it
    const flat = only(ink(text('f1', 10, [1, 0, 0, 1, 72, 700], show(g('X')))).glyphs, 'X')
    const risen = only(ink(text('f1', 10, [1, 0, 0, 1, 72, 700], [OPS.setTextRise, [3]], show(g('X')))).glyphs, 'X')
    expect(risen.y).toBeCloseTo(703, 9)
    expect(risen.top - flat.top).toBeCloseTo(3, 9)
    expect(risen.x0).toBeCloseTo(flat.x0, 9)
    // a horizontal scale of 50 % halves each advance and what the next glyph moves by
    const half = ink(text('f1', 10, [1, 0, 0, 1, 72, 700], [OPS.setHScale, [50]], show(g('A', 500), g('B', 500)))).glyphs
    expect(only(half, 'A').x1 - only(half, 'A').x0).toBeCloseTo(2.5, 9)
    expect(only(half, 'B').x0).toBeCloseTo(74.5, 9)
  })

  it('the text matrix and the line moves: Td, TD, TL, T* and a second showText on from the first', () => {
    const { glyphs } = ink([
      [OPS.beginText, []], [OPS.setFont, ['f1', 10]], [OPS.moveText, [72, 700]], show(g('A', 500)), show(g('B', 500)),
      [OPS.setLeadingMoveText, [0, -12]], show(g('C', 500)), [OPS.nextLine, []], show(g('D', 500)),
      [OPS.setLeading, [20]], [OPS.nextLine, []], show(g('E', 500)), [OPS.endText, []],
    ])
    expect([only(glyphs, 'A').x0, only(glyphs, 'A').y]).toEqual([72, 700])
    // the second showText goes on where the first ended
    expect(only(glyphs, 'B').x0).toBeCloseTo(77, 9)
    // TD moves to the line's start and sets the leading; T* moves down by it; TL sets it
    expect([only(glyphs, 'C').x0, only(glyphs, 'C').y]).toEqual([72, 688])
    expect([only(glyphs, 'D').x0, only(glyphs, 'D').y]).toEqual([72, 676])
    expect([only(glyphs, 'E').x0, only(glyphs, 'E').y]).toEqual([72, 656])
  })

  it('a form XObject\'s matrix applies inside it and is undone after it', () => {
    const { glyphs } = ink([
      [OPS.paintFormXObjectBegin, [Float32Array.from([1, 0, 0, 1, 100, 50]), Float32Array.from([0, 0, 200, 200])]],
      ...text('f1', 10, [1, 0, 0, 1, 10, 10], show(g('I'))),
      [OPS.paintFormXObjectEnd, []],
      ...text('f1', 10, [1, 0, 0, 1, 10, 10], show(g('O'))),
    ])
    expect([only(glyphs, 'I').x0, only(glyphs, 'I').y]).toEqual([110, 60])
    expect([only(glyphs, 'O').x0, only(glyphs, 'O').y]).toEqual([10, 10])
  })

  it('save and restore keep the transform and the text state', () => {
    const { glyphs } = ink([
      [OPS.beginText, []], [OPS.setFont, ['f1', 10]], [OPS.setTextMatrix, [[1, 0, 0, 1, 72, 700]]],
      [OPS.save, []], [OPS.transform, [3, 0, 0, 3, 0, 0]], [OPS.setFont, ['f1', 20]], [OPS.setCharSpacing, [5]], [OPS.restore, []],
      show(g('A', 500), g('B', 500)), [OPS.endText, []],
      // a restore with nothing saved changes nothing
      [OPS.restore, []], ...text('f1', 10, [1, 0, 0, 1, 0, 0], show(g('C'))),
    ])
    expect(only(glyphs, 'A').size).toBe(10)
    expect(only(glyphs, 'B').x0).toBeCloseTo(77, 9)
    expect(only(glyphs, 'C').x0).toBe(0)
  })

  it('a Type 3 glyph is boxed by what its procedure paints, through the font\'s matrix: a "." as a dot, an "M" as an M (#122-1)', () => {
    // (matplotlib's glyphs: d1 and one path, minMax in glyph space; a bitmap font's: d1, a matrix and an image mask; a space: d1
    // alone; a procedure that shows text is not read: its font's ascent and descent)
    const path = (box: number[]) => [OPS.constructPath, [OPS.fill, [Float32Array.from([0])], Float32Array.from(box)]] as const
    const procs = new Map<string, { fnArray: number[]; argsArray: unknown[] }>([
      ['period', { fnArray: [OPS.setCharWidthAndBounds, path([10, 0, 30, 20])[0]], argsArray: [[40, 0, 10, 0, 30, 20], path([10, 0, 30, 20])[1]] }],
      ['M', { fnArray: [OPS.setCharWidthAndBounds, OPS.constructPath], argsArray: [[90, 0, 10, 0, 80, 73], path([10, 0, 80, 73])[1]] }],
      ['bitmap', { fnArray: [OPS.setCharWidthAndBounds, OPS.save, OPS.transform, OPS.paintImageMaskXObject, OPS.restore], argsArray: [[60, 0, 5, -10, 55, 50], [], [50, 0, 0, 60, 5, -10], [{}], []] }],
      // (a small mask PDF.js compiles into its ink's outline in the unit square, rawFillPath: its minMax the bitmap's pixels)
      ['pk', { fnArray: [OPS.setCharWidthAndBounds, OPS.save, OPS.transform, OPS.constructPath, OPS.restore], argsArray: [[50, 0, 0, 0, 40, 60], [], [40, 0, 0, 60, 0, 0], [OPS.rawFillPath, [Float32Array.from([0, 0.25, 0, 1, 1, 0, 1, 1, 0.75, 4])], Float32Array.from([0, 0, 38, 61])], []] }],
      ['space', { fnArray: [OPS.setCharWidthAndBounds], argsArray: [[30, 0, 0, 0, 0, 0]] }],
      ['text', { fnArray: [OPS.setCharWidth, OPS.showText], argsArray: [[50, 0], [[]]] }],
    ])
    FONTS.t3p = { name: 'DejaVuSans', fontMatrix: [0.01, 0, 0, 0.01, 0, 0], isType3Font: true, vertical: false, charProcOperatorList: procs }
    try {
      const t = (u: string, id: string, w: number) => ({ ...g(u, w), operatorListId: id })
      const { glyphs } = ink(text('t3p', 10, [1, 0, 0, 1, 72, 700], show(t('.', 'period', 40), t('M', 'M', 90), t('b', 'bitmap', 60), t('k', 'pk', 50), t(' ', 'space', 30), t('x', 'text', 50))))
      const box = (u: string) => { const x = only(glyphs, u); return [x.ix0, x.bottom, x.ix1, x.top].map(v => Math.round(v * 1000) / 1000) }
      expect(box('.')).toEqual([73, 700, 75, 702])
      expect(box('M')).toEqual([76 + 1, 700, 76 + 8, 707.3])
      expect(box('b')).toEqual([85 + 0.5, 699, 85 + 5.5, 705])
      // (the mask's ink, 0.25 to 1 of its 40 units across and 0 to 0.75 of its 60 up: never the bitmap's whole square)
      expect(box('k')).toEqual([91 + 1, 700, 91 + 4, 704.5])
      // (a space paints nothing: no ink up or down, as an outline font's)
      expect(box(' ')).toEqual([96, 700, 96, 700])
      // (a procedure that shows text: the font's ascent and descent, its advance)
      expect(box('x')).toEqual([99, 697.8, 104, 707.5])
    } finally { delete FONTS.t3p }
  })

  it('Type 3 glyphs are told apart by their procedures, not their character and width: PDF.js gives every one fontChar \'\'', () => {
    // (a "," as wide as a "." keeps its own descender; a procedure holding an operation type3Box does not know is not read)
    const path = (box: number[]) => [OPS.fill, [Float32Array.from([0])], Float32Array.from(box)]
    const procs = new Map<string, { fnArray: number[]; argsArray: unknown[] }>([
      ['period', { fnArray: [OPS.setCharWidthAndBounds, OPS.constructPath], argsArray: [[40, 0, 10, 0, 30, 20], path([10, 0, 30, 20])] }],
      ['comma', { fnArray: [OPS.setCharWidthAndBounds, OPS.constructPath], argsArray: [[40, 0, 10, -30, 30, 20], path([10, -30, 30, 20])] }],
      ['grouped', { fnArray: [OPS.setCharWidthAndBounds, OPS.beginGroup, OPS.constructPath, OPS.endGroup], argsArray: [[40, 0, 10, 0, 30, 20], [{}], path([10, 0, 30, 20]), [{}]] }],
      ['coloured', { fnArray: [OPS.setCharWidth, OPS.setFillRGBColor, OPS.setLineCap, OPS.constructPath], argsArray: [[40, 0], ['#ff0000'], [1], path([10, 0, 30, 20])] }],
    ])
    FONTS.t3k = { name: 'DejaVuSans', fontMatrix: [0.01, 0, 0, 0.01, 0, 0], isType3Font: true, vertical: false, charProcOperatorList: procs }
    try {
      const t = (u: string, id: string) => ({ ...g(u, 40), fontChar: '', operatorListId: id })
      const { glyphs } = ink(text('t3k', 10, [1, 0, 0, 1, 72, 700], show(t('.', 'period'), t(',', 'comma'), t('g', 'grouped'), t('c', 'coloured'))))
      const box = (u: string) => { const x = only(glyphs, u); return [x.ix0, x.bottom, x.ix1, x.top].map(v => Math.round(v * 1000) / 1000) }
      expect(box('.')).toEqual([73, 700, 75, 702])
      expect(box(',')).toEqual([77, 697, 79, 702])
      // (a group: the font's ascent and descent, its advance)
      expect(box('g')).toEqual([80, 697.8, 84, 707.5])
      // (a colour and a line cap paint nothing: the path's box)
      expect(box('c')).toEqual([85, 700, 87, 702])
    } finally { delete FONTS.t3k }
  })

  it('a Type 3 font\'s glyph whose procedure is not given takes 0.75 and −0.22 of its size', () => {
    const { glyphs } = ink(text('t3', 10, [1, 0, 0, 1, 72, 700], show(g('x', 50), g('y', 50))))
    const x = only(glyphs, 'x')
    expect(x.size).toBeCloseTo(10, 9)
    expect(x.top).toBeCloseTo(700 + 0.75 * 10, 9)
    expect(x.bottom).toBeCloseTo(700 - 0.22 * 10, 9)
    expect(x.font).toBe('T3Font')
    // its advance by its own font matrix: 50 × 0.01 × 10
    expect(x.x1 - x.x0).toBeCloseTo(5, 9)
    expect(only(glyphs, 'y').x0).toBeCloseTo(77, 9)
  })

  it('glyphsOnly: the same glyphs (place, size, text, fill) with no boxes, paths or outlines read (the live fills walk)', () => {
    const ops: Op[] = [
      [OPS.setFillRGBColor, ['#0000ff']],
      [OPS.constructPath, [OPS.fill, [Float32Array.from([0])], Float32Array.from([10, 10, 100, 100])]],
      [OPS.save, []], [OPS.transform, [2, 0, 0, 2, 0, 0]], ...text('f1', 10, [1, 0, 0, 1, 72, 700], show(g('A', 722), g('b', 556))), [OPS.restore, []],
      [OPS.paintImageXObject, ['img', 10, 10]],
      ...text('t3', 10, [1, 0, 0, 1, 72, 600], show(g('x', 50))),
      ...text('f1', 10, [0.7, 0.7, -0.7, 0.7, 300, 300], show(g('T', 600))),
    ]
    const full = ink(ops), only = pageInk(OPS, list(ops), commonObjs, { rotate: 0, glyphsOnly: true })
    const key = (x: Glyph) => [x.u, x.x0, x.x1, x.y, x.size, x.fill, !!x.ownColour]
    expect(only.glyphs.map(key)).toEqual(full.glyphs.map(key))
    expect(only.glyphs.length).toBeGreaterThan(0)
    expect(full.boxes.length).toBeGreaterThan(0)
    expect(only.boxes).toEqual([])
    expect([only.capped, only.timedOut]).toEqual([false, false])
  })

  it('a Type 3 glyph that paints its own colours (d0, a colour in its procedure) is marked so; one painted in the fill (d1) is not', () => {
    // (2608.04322's figure fonts: 69 coloured glyphs among 2,308; matplotlib's d1 glyphs take the current fill, as PDF says)
    const procs = new Map([['own', { fnArray: [OPS.setCharWidth, OPS.setFillRGBColor, OPS.constructPath], argsArray: [[], ['#d2555a'], []] }], ['plain', { fnArray: [OPS.setCharWidth, OPS.constructPath], argsArray: [[], []] }], ['stencil', { fnArray: [OPS.setCharWidthAndBounds, OPS.setFillRGBColor, OPS.constructPath], argsArray: [[], ['#d2555a'], []] }]])
    FONTS.t3c = { name: 'T3Coloured', fontMatrix: [0.01, 0, 0, 0.01, 0, 0], isType3Font: true, vertical: false, charProcOperatorList: procs }
    try {
      const t = (u: string, id: string) => ({ ...g(u, 50), operatorListId: id })
      const { glyphs } = ink([[OPS.setFillRGBColor, ['#0000ff']], ...text('t3c', 10, [1, 0, 0, 1, 72, 700], show(t('a', 'own'), t('b', 'plain'), t('c', 'stencil')))])
      expect(glyphs.map(x => [x.u, x.fill, !!x.ownColour])).toEqual([['a', 0x0000ff, true], ['b', 0x0000ff, false], ['c', 0x0000ff, false]])
    } finally { delete FONTS.t3c }
  })

  it('a font with no ascent or descent takes 0.75 and −0.22 of its size', () => {
    FONTS.bare = { name: 'Bare', fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0, descent: 0 }
    const x = only(ink(text('bare', 10, [1, 0, 0, 1, 0, 100], show(g('x')))).glyphs, 'x')
    expect(x.top).toBeCloseTo(107.5, 9)
    expect(x.bottom).toBeCloseTo(97.8, 9)
  })

  it('a vertical font\'s glyphs are passed over', () => {
    expect(ink(text('v1', 10, [1, 0, 0, 1, 72, 700], show(g('\u4e00', 1000), g('\u4e8c', 1000)))).glyphs).toEqual([])
  })

  it('an invisible glyph is no ink; a font not found shows nothing', () => {
    expect(ink(text('f1', 10, [1, 0, 0, 1, 72, 700], [OPS.setTextRenderingMode, [3]], show(g('A')))).glyphs).toEqual([])
    expect(ink(text('f1', 10, [1, 0, 0, 1, 72, 700], [OPS.setTextRenderingMode, [7]], show(g('A')))).glyphs).toEqual([])
    expect(ink(text('f1', 10, [1, 0, 0, 1, 72, 700], [OPS.setTextRenderingMode, [1]], show(g('A')))).glyphs).toHaveLength(1)
    expect(ink(text('missing', 10, [1, 0, 0, 1, 72, 700], show(g('A')))).glyphs).toEqual([])
  })

  it('a glyph set rotated is a box of its em, not a glyph', () => {
    // a quarter turn: the run goes up the page
    const { glyphs, boxes } = ink(text('f1', 10, [0, 1, -1, 0, 300, 100], show(g('R', 500))))
    expect(glyphs).toEqual([])
    expect(boxes).toHaveLength(4)
    const [x0, y0, x1, y1] = boxes
    expect(x0).toBeCloseTo(300 - 7, 9)
    expect(x1).toBeCloseTo(300 + 2, 9)
    expect(y0).toBeCloseTo(100, 9)
    expect(y1).toBeCloseTo(105, 9)
    // a slant keeps its baseline level: still a glyph
    expect(ink(text('f1', 10, [1, 0, 0.2, 1, 72, 700], show(g('S')))).glyphs).toHaveLength(1)
  })

  it('an image and a path are boxes in page space', () => {
    const { glyphs, boxes } = ink([
      [OPS.save, []], [OPS.transform, [100, 0, 0, 50, 10, 20]], [OPS.paintImageXObject, ['img1', 1, 1]], [OPS.restore, []],
      [OPS.save, []], [OPS.transform, [2, 0, 0, 2, 0, 0]], [OPS.constructPath, [OPS.fill, [Float32Array.from([0])], Float32Array.from([1, 2, 11, 7])]], [OPS.restore, []],
      // a stroke's box widened by half the line width
      [OPS.setLineWidth, [2]], [OPS.constructPath, [OPS.stroke, [Float32Array.from([0])], Float32Array.from([100, 100, 200, 100])]],
      // a clip paints nothing; a path of moves alone keeps PDF.js's empty box
      [OPS.constructPath, [OPS.endPath, [Float32Array.from([0])], Float32Array.from([0, 0, 500, 500])]],
      [OPS.constructPath, [OPS.fill, [null], null]],
      [OPS.constructPath, [OPS.fill, [Float32Array.from([0])], Float32Array.from([Infinity, Infinity, -Infinity, -Infinity])]],
    ])
    expect(glyphs).toEqual([])
    expect(boxes).toEqual([10, 20, 110, 70, 2, 4, 22, 14, 99, 99, 201, 101])
  })

  it('images in a group or repeated are each a box', () => {
    const { boxes } = ink([
      [OPS.paintImageXObjectRepeat, ['img1', 10, 20, Float32Array.from([0, 0, 50, 60])]],
      [OPS.paintImageMaskXObjectGroup, [[{ transform: [5, 0, 0, 5, 100, 100] }]]],
      [OPS.paintInlineImageXObjectGroup, [{}, [{ transform: [1, 0, 0, 1, 7, 8] }]]],
      [OPS.save, []], [OPS.transform, [3, 0, 0, 4, 1, 2]], [OPS.paintSolidColorImageMask, []], [OPS.restore, []],
    ])
    expect(boxes).toEqual([0, 0, 10, 20, 50, 60, 60, 80, 100, 100, 105, 105, 7, 8, 8, 9, 1, 2, 4, 6])
  })

  it('a box is cut to the clip in force; a shading is its clip\'s box', () => {
    const { boxes } = ink([
      [OPS.save, []], [OPS.clip, []], [OPS.constructPath, [OPS.endPath, [Float32Array.from([0])], Float32Array.from([0, 0, 50, 50])]],
      [OPS.constructPath, [OPS.fill, [Float32Array.from([0])], Float32Array.from([10, 10, 100, 100])]],
      [OPS.shadingFill, ['sh1']],
      // wholly outside the clip: no box
      [OPS.constructPath, [OPS.fill, [Float32Array.from([0])], Float32Array.from([60, 60, 70, 70])]],
      [OPS.restore, []],
      // the clip ends with its state; a shading with no clip is the page's background, left out
      [OPS.constructPath, [OPS.fill, [Float32Array.from([0])], Float32Array.from([60, 60, 70, 70])]], [OPS.shadingFill, ['sh2']],
      // a form's box clips what it draws
      [OPS.paintFormXObjectBegin, [Float32Array.from([1, 0, 0, 1, 200, 0]), Float32Array.from([0, 0, 10, 10])]],
      [OPS.constructPath, [OPS.fill, [Float32Array.from([0])], Float32Array.from([-5, -5, 5, 5])]], [OPS.paintFormXObjectEnd, []],
    ])
    expect(boxes).toEqual([10, 10, 50, 50, 0, 0, 50, 50, 60, 60, 70, 70, 200, 0, 205, 5])
  })

  it('a rotated page has no glyphs', () => {
    const page = text('f1', 10, [1, 0, 0, 1, 72, 700], show(g('A')))
    for (const rotate of [90, 180, 270, -90, 450]) expect(ink(page, rotate)).toEqual({ glyphs: [], boxes: [], points: [], boxAt: [], regions: [], capped: false, timedOut: false, degraded: false, mergedAt: null, rotated: true })
    expect(ink(page, 360).rotated).toBe(false)
    expect(ink(page, Number.NaN).rotated).toBe(true)
  })

  it('a page past OPS_CAP is capped', () => {
    const head = text('f1', 10, [1, 0, 0, 1, 72, 700], show(g('A')))
    // the tail ends on its showText, so that the cap falls on it
    const tail = text('f1', 10, [1, 0, 0, 1, 72, 600], show(g('Z'))).slice(0, -1)
    // (n operations: the head, saves and restores in turn, the tail; one typed array of codes, the filler's operands none)
    const filled = (n: number) => {
      const fnArray = new Uint16Array(n), argsArray: unknown[] = new Array(n)
      for (let i = head.length; i < n - tail.length; i++) fnArray[i] = (i - head.length) % 2 ? OPS.restore : OPS.save
      head.forEach(([f, a], i) => { fnArray[i] = f; argsArray[i] = a })
      tail.forEach(([f, a], i) => { fnArray[n - tail.length + i] = f; argsArray[n - tail.length + i] = a })
      return { fnArray, argsArray }
    }
    // the last glyph shown by the operation past OPS_CAP: not read
    // (no clock: the cap is what this holds)
    const a = pageInk(OPS, filled(OPS_CAP + 1), commonObjs, { rotate: 0, msMax: Infinity })
    expect(a.capped).toBe(true)
    expect(a.timedOut).toBe(false)
    expect(a.glyphs.map(q => q.u)).toEqual(['A'])
    // exactly OPS_CAP operations: all read
    const b = pageInk(OPS, filled(OPS_CAP), commonObjs, { rotate: 0, msMax: Infinity })
    expect(b.capped).toBe(false)
    expect(b.glyphs.map(q => q.u)).toEqual(['A', 'Z'])
  })

  it('a page past `glyphsMax` glyphs is capped, one operation showing them all (a hostile page): what it read stops there', () => {
    expect(GLYPHS_PAGE).toBe(100_000)
    // one showText of a million glyphs, within OPS_CAP by far: three operations and a text object's
    const run = Array.from({ length: 1_000_000 }, () => g('x', 1))
    const page = [...text('f1', 10, [1, 0, 0, 1, 72, 700], [OPS.showText, [run]]), ...text('f1', 10, [1, 0, 0, 1, 72, 600], show(g('Z')))]
    const capped = pageInk(OPS, list(page), commonObjs, { rotate: 0, glyphsMax: GLYPHS_PAGE })
    expect(capped.capped).toBe(true)
    expect(capped.glyphs).toHaveLength(GLYPHS_PAGE)
    expect(capped.glyphs.some(q => q.u === 'Z')).toBe(false)
    // at the bound exactly: all read; and with none asked, every glyph (the bound is the caller's)
    const at = pageInk(OPS, list(text('f1', 10, [1, 0, 0, 1, 72, 700], [OPS.showText, [run.slice(0, 1000)]])), commonObjs, { rotate: 0, glyphsMax: 1000 })
    expect([at.capped, at.glyphs.length]).toEqual([false, 1000])
    const free = pageInk(OPS, list(page), commonObjs, { rotate: 0 })
    expect([free.capped, free.glyphs.length]).toEqual([false, 1_000_001])
  })

  it('a painted glyph is ink whatever its Unicode: a symbolic font\'s code 32 (2307.16209\'s big left parenthesis) is a glyph', () => {
    // txexs's parenthesis is drawn from code 32, which PDF.js gives the Unicode of a space
    const { glyphs } = ink(text('f1', 10, [1, 0, 0, 1, 72, 700], show(g('a', 500), g(' ', 750, true), g('', 500), g('b', 500))))
    expect(glyphs.map(q => q.u)).toEqual(['a', ' ', '', 'b'])
    expect(only(glyphs, ' ').x0).toBeCloseTo(77, 9)
    expect(only(glyphs, ' ').x1).toBeCloseTo(84.5, 9)
    // an invisible one is still none, and so is a glyph with no Unicode string at all
    expect(ink(text('f1', 10, [1, 0, 0, 1, 72, 700], [OPS.setTextRenderingMode, [3]], show(g(' ', 750, true)))).glyphs).toEqual([])
    expect(ink(text('f1', 10, [1, 0, 0, 1, 72, 700], show({ width: 500, isSpace: false, fontChar: 'x', vmetric: null }))).glyphs).toEqual([])
  })

  it('a rendering intent named axt-… is a point of the marked compile, in stream order among the glyphs and boxes', () => {
    const path = (x: number): Op => [OPS.constructPath, [OPS.fill, [Float32Array.from([0])], Float32Array.from([x, 690, x + 5, 691])]]
    const { glyphs, boxes, points, boxAt } = ink([
      ...text('f1', 10, [1, 0, 0, 1, 72, 700], show(g('A')), [OPS.setRenderingIntent, [{ name: 'axt-p1.2a' }]], show(g('B'))),
      path(100),
      // the operand as a string (PDF.js in a worker gives a name as an object, in Node as either)
      [OPS.setRenderingIntent, ['axt-p1.2b']], [OPS.setRenderingIntent, [{ name: 'Perceptual' }]],
      ...text('f1', 10, [1, 0, 0, 1, 72, 680], show(g('C'))),
      [OPS.setRenderingIntent, [{ name: 'axt-bs1' }]], path(120), [OPS.setRenderingIntent, [{ name: 'axt-be1' }]],
      // not a point: a name too long, of other characters, or none
      [OPS.setRenderingIntent, [{ name: `axt-${'p'.repeat(80)}` }]], [OPS.setRenderingIntent, [{ name: 'axt-p1 2a' }]], [OPS.setRenderingIntent, [{ name: 'axt-' }]], [OPS.setRenderingIntent, []],
    ])
    expect(glyphs.map(q => q.u)).toEqual(['A', 'B', 'C'])
    expect(boxes).toHaveLength(8)
    expect(points).toEqual([{ name: 'p1.2a', glyph: 1, box: 0 }, { name: 'p1.2b', glyph: 2, box: 1 }, { name: 'bs1', glyph: 3, box: 1 }, { name: 'be1', glyph: 3, box: 2 }])
    // each glyph's boxes shown before it
    expect(boxAt).toEqual([0, 0, 1])
  })

  it("keeps a paragraph's point (q<n>) apart from the marks' points, in stream order among the glyphs", () => {
    const { points, paras } = ink([
      [OPS.setRenderingIntent, [{ name: 'axt-q1' }]], ...text('f1', 10, [1, 0, 0, 1, 72, 700], show(g('A')), [OPS.setRenderingIntent, [{ name: 'axt-0s' }]], show(g('B'))),
      [OPS.setRenderingIntent, [{ name: 'axt-q2' }]], ...text('f1', 10, [1, 0, 0, 1, 72, 680], show(g('C'))),
      // (a probe's mark of another shape is no paragraph's)
      [OPS.setRenderingIntent, [{ name: 'axt-q3a' }]],
    ])
    expect(points).toEqual([{ name: '0s', glyph: 1, box: 0 }, { name: 'q3a', glyph: 3, box: 0 }])
    expect(paras).toEqual([{ name: 'q1', glyph: 0, box: 0 }, { name: 'q2', glyph: 2, box: 0 }])
  })

  it('keeps a region\'s points apart (`regions`): each line between its two points of one number, a code line by what TeX was told (#63)', () => {
    const pt = (name: string): Op => [OPS.setRenderingIntent, [{ name: `axt-${name}` }]]
    const { points, regions } = ink([
      ...text('f1', 10, [1, 0, 0, 1, 72, 700], show(g('A')), pt('cds1'), show(g('B'), g('C')), pt('cde1'), pt('0s'), show(g('D'))),
      ...text('f1', 10, [1, 0, 0, 1, 72, 680], pt('cds2'), show(g('E')), pt('cde2')),
      // (a start with no end on its page, an end with no start, and an empty line: no region, never a glyph taken by a guess)
      ...text('f1', 10, [1, 0, 0, 1, 72, 660], pt('cds3'), show(g('F')), pt('cde4'), pt('cds5'), pt('cde5')),
    ])
    expect(regions).toEqual([{ kind: 'code', from: 1, to: 3 }, { kind: 'code', from: 4, to: 5 }])
    // (none of them among the marks' points)
    expect(points).toEqual([{ name: '0s', glyph: 3, box: 0 }])
    expect(regionsOfPoints([{ name: 'cde1', glyph: 2 }, { name: 'cds1', glyph: 0 }], 5)).toEqual([])
    // (a code paragraph TeX broke over a page or a column: its start runs to its column body's end, its end from the next body's
    // start; a running head before the body and a folio after it are no line of it)
    expect(regionsOfPoints([{ name: 'bs1', glyph: 2 }, { name: 'cds7', glyph: 5 }, { name: 'be1', glyph: 9 }], 11)).toEqual([{ kind: 'code', from: 5, to: 9 }])
    expect(regionsOfPoints([{ name: 'bs2', glyph: 2 }, { name: 'cde7', glyph: 6 }, { name: 'cds8', glyph: 6 }, { name: 'cde8', glyph: 8 }, { name: 'be2', glyph: 9 }], 11)).toEqual([{ kind: 'code', from: 2, to: 6 }, { kind: 'code', from: 6, to: 8 }])
    // (a second end of one region, which TeX may set where a group gives a paragraph's state back, closes nothing)
    expect(regionsOfPoints([{ name: 'bs1', glyph: 0 }, { name: 'cds9', glyph: 4 }, { name: 'cde9', glyph: 6 }, { name: 'cde9', glyph: 6 }, { name: 'be1', glyph: 9 }], 11)).toEqual([{ kind: 'code', from: 4, to: 6 }])
    expect([...regionMask([{ kind: 'code', from: 1, to: 3 }, { kind: 'other', from: 0, to: 5 }], 5, 'code')]).toEqual([0, 1, 1, 0, 0])
  })

  it('a hostile list gives no number that is not finite, and never throws', () => {
    const { glyphs, boxes } = ink([
      [OPS.transform, [Number.NaN, 0, 0, 1, 0, 0]], ...text('f1', 10, [1, 0, 0, 1, 72, 700], show(g('A'))), [OPS.constructPath, [OPS.fill, [null], Float32Array.from([0, 0, 1, 1])]],
    ])
    expect(glyphs).toEqual([])
    expect(boxes).toEqual([])
    expect(() => ink([[OPS.setFont, []], [OPS.showText, []], [OPS.showText, [null]], [OPS.setTextMatrix, []], [OPS.transform, []], [OPS.paintImageXObjectRepeat, ['x']], [OPS.constructPath, []], [OPS.paintFormXObjectBegin, []]])).not.toThrow()
  })
})

describe('a glyph\'s own ink (the maker round, Fix 2: the ink band)', () => {
  // PDF.js's glyph outlines as it gives them where it draws glyphs as paths (Node): DrawOPS in em from the origin, y up
  const M = 0, L = 1, C = 2, Z = 4
  const sy: Record<string, number[]> = {
    // CMSY10's calligraphic F: its outline from -0.032 to 0.691 em, the font declaring a descent of 0.96
    F: [M, 0.02, -0.032, L, 0.6, -0.032, C, 0.7, 0.2, 0.7, 0.5, 0.65, 0.691, L, 0.05, 0.691, Z],
    // a space drawn: no outline
    ' ': [],
  }
  const objs = (paths: Record<string, number[]>) => ({
    has: (id: string) => id in FONTS || id.startsWith('cmsy_path_'),
    get: (id: string) => { if (id in FONTS) return FONTS[id]; const ch = id.slice('cmsy_path_'.length); return ch in paths ? { path: new Float32Array(paths[ch]!) } : null },
  })
  FONTS.cmsy = { name: 'MJNQMS+CMSY10', loadedName: 'cmsy', fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0.775, descent: -0.96, isType3Font: false, vertical: false }
  it('outlineBox: the extremes of its points and control points; [] for none drawn; null where no outline is given', () => {
    const o = objs(sy)
    expect(outlineBox(o, FONTS.cmsy, 'F')).toEqual([expect.closeTo(0.02, 6), expect.closeTo(-0.032, 6), expect.closeTo(0.7, 6), expect.closeTo(0.691, 6)])
    expect(outlineBox(o, FONTS.cmsy, ' ')).toEqual([])
    expect(outlineBox(o, FONTS.cmsy, 'Q')).toBeNull()
    expect(outlineBox(commonObjs, FONTS.cmsy, 'F')).toBeNull()
    expect(outlineBox(o, FONTS.f1, 'F')).toBeNull()
  })
  it('a glyph\'s top and bottom are its outline\'s, not its font\'s declared ascent and descent; its ink across is kept apart from its advance', () => {
    const { glyphs } = pageInk(OPS, list(text('cmsy', 10, [1, 0, 0, 1, 72, 700], show(g('F', 600), g(' ', 300)))), objs(sy), { rotate: 0 })
    const f = only(glyphs, 'F')
    expect(f.bottom).toBeCloseTo(700 - 0.32, 4)
    expect(f.top).toBeCloseTo(700 + 6.91, 4)
    expect(f.ix0).toBeCloseTo(72.2, 4)
    expect(f.ix1).toBeCloseTo(79, 4)
    // the declared 0.96 em would reach the next line, 9.6 pt below
    expect(f.bottom).toBeGreaterThan(700 - 9.6 + 1)
    // a space drawn has no ink: nothing up or down
    const sp = glyphs.find(q => q.u === ' ')!
    expect(sp.top).toBe(sp.bottom)
    // no outline given: the declared box, as before
    const declared = only(pageInk(OPS, list(text('cmsy', 10, [1, 0, 0, 1, 72, 700], show(g('F', 600)))), commonObjs, { rotate: 0 }).glyphs, 'F')
    expect(declared.bottom).toBeCloseTo(700 - 9.6, 6)
  })

  // An included figure's box clips what it draws (a form's BBox, which PDF.js gives paintFormXObjectBegin where the form has no
  // transparency group: every included PDF of arXiv's TeX Live 2025, and of our final pass since PIPELINE 44). A glyph set turned
  // is cut by it where its own ink passes it, as a level glyph is: its outline across its advance, up to its top, down to its
  // bottom. A y-axis title or a colour bar's title set at its figure's edge (matplotlib's tight box: 2610.35877v1 p8,
  // 2610.20967v1 p4, 2610.22065v1 p3) stands inside it and is shown whole; a box of its whole size on both sides of its baseline
  // read it as cut and its unit was lost (the sweep of 6e0a8d1c)
  const form = (...inner: Op[]): Op[] => [[OPS.paintFormXObjectBegin, [Float32Array.from([1, 0, 0, 1, 0, 0]), Float32Array.from([0, 0, 100, 100])]], ...inner, [OPS.paintFormXObjectEnd, []]]
  /** "F" set at a quarter turn (its baseline up the page, its top to the left), its baseline across at `x` */
  const up = (font: string, x: number) => text(font, 10, [0, 1, -1, 0, x, 40], show(g('F', 600)))
  const turnedIn = (ops: Op[], o: { get(id: string): unknown; has?(id: string): boolean }) => {
    const r = pageInk(OPS, list(ops), o, { rotate: 0, turned: true })
    expect(r.turned).toHaveLength(1)
    return r.turned![0]!
  }
  it('a glyph set turned is cut by the clip where its own ink passes it, not where a box of its size on both sides would', () => {
    const o = objs(sy)
    // its top 6.91 to the left of its baseline: from 8, its ink starts at 1.09, inside the box (a box of its size: at -2)
    expect(turnedIn(form(...up('cmsy', 8)), o).clipped).toBeUndefined()
    // from 5, its top at -1.91: past the box, cut (its letters' tops are not shown)
    expect(turnedIn(form(...up('cmsy', 5)), o).clipped).toBe(true)
    // the colour bar's title at the right edge: its bottom 0.32 to the right of its baseline at 99, inside (a box of its size: 109)
    expect(turnedIn(form(...up('cmsy', 99)), o).clipped).toBeUndefined()
    expect(turnedIn(form(...up('cmsy', 99.8)), o).clipped).toBe(true)
    // along its baseline, its advance and its ink: from 40 to 46 up the page, inside; past the box's top, cut
    expect(turnedIn(form(...text('cmsy', 10, [0, 1, -1, 0, 50, 95], show(g('F', 600)))), o).clipped).toBe(true)
    // no outline given: its font's declared ascent (0.7) and descent (0.2), as a level glyph's
    expect(turnedIn(form(...up('f1', 7.5)), commonObjs).clipped).toBeUndefined()
    expect(turnedIn(form(...up('f1', 6.5)), commonObjs).clipped).toBe(true)
    expect(turnedIn(form(...up('f1', 98)), commonObjs).clipped).toBeUndefined()
    expect(turnedIn(form(...up('f1', 98.5)), commonObjs).clipped).toBe(true)
    // a glyph that draws nothing (an outline of none: a Type 3 procedure that paints nothing, an invisible text layer): its
    // baseline alone, as a level glyph's, never its font's band
    const blankInk = objs({ ...sy, D: [] })
    expect(turnedIn(form(...text('cmsy', 10, [0, 1, -1, 0, 1, 40], show(g('D', 600)))), blankInk).clipped).toBeUndefined()
    expect(turnedIn(form(...text('cmsy', 10, [0, 1, -1, 0, -1, 40], show(g('D', 600)))), blankInk).clipped).toBe(true)
    // no clip in force: never cut
    expect(turnedIn(up('cmsy', -50), o).clipped).toBeUndefined()
  })
  it('a glyph set turned carries its own ink up and down from its baseline in em, clip or none: its outline\'s, else its font\'s band', () => {
    const o = objs(sy)
    // (CMSY10's F: its outline, -0.032 to 0.691 em, never its declared descent of 0.96)
    const f = turnedIn(up('cmsy', 50), o)
    expect([f.down, f.up]).toEqual([expect.closeTo(-0.032, 5), expect.closeTo(0.691, 5)])
    // (a glyph that draws nothing: its baseline alone)
    const blank = turnedIn(text('cmsy', 10, [0, 1, -1, 0, 50, 40], show(g(' ', 600))), o)
    expect([blank.down, blank.up]).toEqual([0, 0])
    // (no outline given: its font's declared descent and ascent)
    const d = turnedIn(form(...up('f1', 50)), commonObjs)
    expect([d.down, d.up]).toEqual([-0.2, 0.7])
    // (a Type 3 glyph: what its procedure paints, through the font's matrix. OriginLab's faces: glyphs of 2048 units an em under a
    // matrix of 10/2048, an "A" 1466 units tall, so 7.158 of the size it is shown at, its font declaring no band: 2608.08481v1)
    const procs = new Map([['A', { fnArray: [OPS.setCharWidthAndBounds, OPS.constructPath], argsArray: [[1366, 0, -3, 0, 1369, 1466], [OPS.fill, [Float32Array.from([0])], Float32Array.from([-3, 0, 1369, 1466])]] }]])
    FONTS.t3o = { name: 'Type3', fontMatrix: [10 / 2048, 0, 0, 10 / 2048, 0, 0], isType3Font: true, vertical: false, charProcOperatorList: procs }
    try {
      const a = turnedIn(text('t3o', 1.2, [0, 1, -1, 0, 50, 40], show({ ...g('A', 1366), operatorListId: 'A' })), commonObjs)
      expect(a.size).toBeCloseTo(1.2, 9)
      expect([a.ascent, a.descent]).toEqual([0.75, -0.22])
      expect([a.down, a.up]).toEqual([0, expect.closeTo(7.158, 3)])
    } finally { delete FONTS.t3o }
  })
  it('a slanted label is cut by where its own ink\'s corners fall, its band turned with it', () => {
    const o = objs(sy)
    // 30 degrees: its ink's lowest corner is its outline's bottom left, 0.02 along and 0.032 below, turned
    const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6)
    const at = (y: number) => form(...text('cmsy', 10, [c, s, -s, c, 30, y], show(g('F', 600))))
    const low = (y: number) => y + 10 * (0.02 * s - 0.032 * c)
    // (its ink's lowest point a hair above the box's bottom, then a point below it)
    expect(low(0.3)).toBeGreaterThan(0)
    expect(turnedIn(at(0.3), o).clipped).toBeUndefined()
    expect(low(-0.2)).toBeLessThan(-0.05)
    expect(turnedIn(at(-0.2), o).clipped).toBe(true)
  })

  // What the page does not show is no ink to the figures' reading (`turned`): a glyph wholly outside the clip in force, and any
  // paint at an alpha of 0, a constant's or a transparency group's painted at 0. 1706.03762v7's attention figures: each is a
  // crop of a larger plot whose title, "Input-Input Layer5", the form's box hides under the bottom row of labels, and each
  // token's box per head is a group painted at ca 0; both read as ink, they crowded 71 of the paper's 244 labels
  const fill = (x0: number, y0: number, x1: number, y1: number): Op => [OPS.constructPath, [OPS.fill, [Float32Array.from([0])], Float32Array.from([x0, y0, x1, y1])]]
  const stroke = (x0: number, y0: number, x1: number, y1: number): Op => [OPS.constructPath, [OPS.stroke, [Float32Array.from([0])], Float32Array.from([x0, y0, x1, y1])]]
  const alpha = (ca: number, CA = ca): Op => [OPS.setGState, [[['ca', ca], ['CA', CA]]]]
  const figureInk = (ops: Op[]) => pageInk(OPS, list(ops), commonObjs, { rotate: 0, turned: true })
  it('a level glyph wholly outside the clip in force is unseen; one the clip cuts in part is clipped, not unseen', () => {
    const at = (x: number) => only(figureInk(form(...text('f1', 10, [1, 0, 0, 1, x, 40], show(g('A', 600))))).glyphs, 'A')
    expect(at(50).clipped).toBeUndefined()
    expect(at(50).unseen).toBeUndefined()
    expect(at(97)).toMatchObject({ clipped: true })
    expect(at(97).unseen).toBeUndefined()
    expect(at(150)).toMatchObject({ clipped: true, unseen: true })
    // (a turned glyph alike, by its own ink: its box is left out, as every box wholly outside the clip is)
    const t = turnedIn(form(...text('f1', 10, [0, 1, -1, 0, 150, 40], show(g('F', 600)))), commonObjs)
    expect(t).toMatchObject({ clipped: true, unseen: true, box: -1 })
  })
  it('paint at an alpha of 0 is unseen: a fill by ca, a stroke by CA, a glyph by its rendering mode\'s, a group by the ca it is painted with', () => {
    const r = figureInk(form(
      alpha(0), fill(10, 10, 20, 20), stroke(10, 30, 20, 30), alpha(1, 0), fill(10, 40, 20, 50), stroke(10, 60, 20, 60), alpha(1),
      // (a group painted at ca 0, its content at ca 1 inside: nothing of it shows; one painted at 1 with its content at 0 alike)
      alpha(0), [OPS.beginGroup, [{ isolated: false, knockout: false }]], alpha(1), fill(30, 10, 40, 20), [OPS.endGroup, [{}]],
      [OPS.save, []], alpha(1), [OPS.beginGroup, [{}]], alpha(0), fill(30, 30, 40, 40), [OPS.endGroup, [{}]], [OPS.restore, []],
      // (the alpha inside a group starts at 1, as PDF says: its content shows though the page's ca was 0.5 before it)
      alpha(0.5), [OPS.beginGroup, [{}]], fill(30, 50, 40, 60), [OPS.endGroup, [{}]], alpha(1),
      fill(50, 10, 60, 20),
      ...text('f1', 10, [1, 0, 0, 1, 50, 40], [OPS.setGState, [[['ca', 0]]]], show(g('A', 600)), [OPS.setGState, [[['ca', 1]]]], show(g('B', 600))),
      // (a glyph stroked alone, rendering mode 1: PDF.js strokes text at the fill's alpha, PDF at the stroke's; unseen only where
      // both are 0, #555)
      ...text('f1', 10, [1, 0, 0, 1, 50, 60], [OPS.setTextRenderingMode, [1]], [OPS.setGState, [[['CA', 0]]]], show(g('D', 600)), [OPS.setGState, [[['ca', 0]]]], show(g('C', 600))),
    ))
    // (a path's box by its corner, a stroke's widened by half its line width)
    const boxAt = (x0: number, y0: number) => { for (let i = 0; i < r.boxes.length; i += 4) if (Math.abs(r.boxes[i]! - x0) <= 0.5 && Math.abs(r.boxes[i + 1]! - y0) <= 0.5) return i / 4; throw new Error(`no box at ${x0}, ${y0}`) }
    const unseen = (x0: number, y0: number) => r.unseen!.has(boxAt(x0, y0))
    expect([unseen(10, 10), unseen(10, 30), unseen(10, 40), unseen(10, 60)]).toEqual([true, true, false, true])
    expect([unseen(30, 10), unseen(30, 30), unseen(30, 50), unseen(50, 10)]).toEqual([true, true, false, false])
    expect([only(r.glyphs, 'A').unseen, only(r.glyphs, 'B').unseen, only(r.glyphs, 'C').unseen, only(r.glyphs, 'D').unseen]).toEqual([true, undefined, true, undefined])
    // (every box is kept as before, unseen or not, its index and its path's the same: no other reading changes)
    expect(r.boxes.length / 4).toBe(8)
    expect(r.paths).toBeUndefined()
    // (and no reading but the figures' is given any of it)
    const plain = pageInk(OPS, list(form(alpha(0), fill(10, 10, 20, 20), ...text('f1', 10, [1, 0, 0, 1, 150, 40], show(g('A', 600))))), commonObjs, { rotate: 0 })
    expect(plain.unseen).toBeUndefined()
    expect(only(plain.glyphs, 'A').unseen).toBeUndefined()
    expect(plain.boxes).toEqual([10, 10, 20, 20])
  })
  it('a transparency group shows nothing past its box, as PDF.js bounds it: the figures\' reading cuts what it paints to it (#555)', () => {
    // (a group whose box, its matrix applied, is 0 to 50: a fill from 10 to 90 shows to 50, one from 60 to 90 shows nothing, a
    // glyph at 70 neither; the boxes every other reader takes stay as they were)
    const r = figureInk(form([OPS.beginGroup, [{ bbox: [0, 0, 25, 25], matrix: [2, 0, 0, 2, 0, 0] }]], fill(10, 10, 90, 90), fill(60, 60, 90, 90), ...text('f1', 10, [1, 0, 0, 1, 70, 20], show(g('A', 600))), [OPS.endGroup, [{}]], fill(5, 5, 95, 95)))
    expect(r.boxes).toEqual([10, 10, 90, 90, 60, 60, 90, 90, 5, 5, 95, 95])
    expect(r.cut!.get(0)).toEqual([10, 10, 50, 50])
    expect(r.unseen!.has(1)).toBe(true)
    expect(r.cut!.has(2) || r.unseen!.has(2)).toBe(false)
    expect(only(r.glyphs, 'A')).toMatchObject({ clipped: true, unseen: true })
  })
  it('a fill of a tiling pattern is marked as one, a shading pattern\'s and a colour\'s are not (#560)', () => {
    // (a rectangle's path as PDF.js gives it: moveTo, lineTo three times, closePath)
    const rect = (x0: number, y0: number, x1: number, y1: number): Op => [OPS.constructPath, [OPS.fill, [Float32Array.from([0, x0, y0, 1, x1, y0, 1, x1, y1, 1, x0, y1, 4])], Float32Array.from([x0, y0, x1, y1])]]
    const r = figureInk(form([OPS.setFillColorN, ['TilingPattern', null, {}, [1, 0, 0, 1, 0, 0], [0, 0, 4, 4], 4, 4, 1, 1, false]], rect(10, 10, 20, 20), [OPS.setFillColorN, ['Shading', 'sh0', null]], rect(30, 10, 40, 20), [OPS.setFillRGBColor, ['#ff0000']], rect(50, 10, 60, 20)))
    expect([0, 1, 2].map(i => r.shapes!.get(i)!.pattern)).toEqual([true, undefined, undefined])
  })
  it('a fill covers what was painted under it only of a colour at an alpha of 1, under no blend mode but Normal and no soft mask, its groups\' alike: its shape is `opaque` (2609.26457v1)', () => {
    const rect = (x0: number, y0: number, x1: number, y1: number): Op => [OPS.constructPath, [OPS.fill, [Float32Array.from([0, x0, y0, 1, x1, y0, 1, x1, y1, 1, x0, y1, 4])], Float32Array.from([x0, y0, x1, y1])]]
    const gs = (...entries: unknown[][]): Op => [OPS.setGState, [entries]]
    const r = figureInk(form(
      // (0 black, PDF's default; 1 white: both cover)
      rect(10, 10, 20, 20), [OPS.setFillRGBColor, ['#ffffff']], rect(30, 10, 40, 20),
      // (2 at ca 0.8, a legend's frame as matplotlib paints it by default; 3 multiplied; 4 under a soft mask: none covers)
      alpha(0.8), rect(50, 10, 60, 20), alpha(1),
      gs(['BM', 'multiply']), rect(70, 10, 80, 20), gs(['BM', 'source-over']),
      gs(['SMask', true]), rect(10, 30, 20, 40), gs(['SMask', false]),
      // (5 inside a group the page multiplies: the group is blended as a whole; 6 inside a group painted plainly, its own content
      // Normal at its start whatever was set before it: both as their group is)
      [OPS.save, []], gs(['BM', 'multiply']), [OPS.beginGroup, [{}]], rect(30, 30, 40, 40), [OPS.endGroup, [{}]], [OPS.restore, []],
      [OPS.beginGroup, [{}]], rect(50, 30, 60, 40), [OPS.endGroup, [{}]],
      // (7 a tiling pattern's, 8 a shading pattern's, 9 PDF.js's transparent: no colour known to cover)
      [OPS.setFillColorN, ['TilingPattern', null, {}, [1, 0, 0, 1, 0, 0], [0, 0, 4, 4], 4, 4, 1, 1, false]], rect(70, 30, 80, 40),
      [OPS.setFillColorN, ['Shading', 'sh0', null]], rect(10, 50, 20, 60), [OPS.setFillTransparent, []], rect(30, 50, 40, 60),
      // (10 a stroke alone, white: no fill)
      [OPS.setFillRGBColor, ['#ffffff']], stroke(50, 50, 60, 50),
    ))
    expect([...Array(11).keys()].map(i => r.shapes!.get(i)!.opaque ?? false)).toEqual([true, true, false, false, false, false, true, false, false, false, false])
  })
  it('a fill covers what lies under it only where every clip in force is a rectangle on the page\'s axes: the clip is kept as its box (#602\'s review)', () => {
    const rect = (x0: number, y0: number, x1: number, y1: number): Op => [OPS.constructPath, [OPS.fill, [Float32Array.from([0, x0, y0, 1, x1, y0, 1, x1, y1, 1, x0, y1, 4])], Float32Array.from([x0, y0, x1, y1])]]
    const clipTo = (pts: number[], box: number[]): Op[] => [[OPS.clip, []], [OPS.constructPath, [OPS.endPath, [Float32Array.from([0, pts[0]!, pts[1]!, ...pts.slice(2).flatMap((v, i) => (i % 2 ? [v] : [1, v])), 4])], Float32Array.from(box)]]]
    const opaque = (...ops: Op[]) => figureInk(ops).shapes!.get(figureInk(ops).boxes.length / 4 - 1)!.opaque ?? false
    const at = (m: number[], ...inner: Op[]): Op[] => [[OPS.paintFormXObjectBegin, [Float32Array.from(m), Float32Array.from([0, 0, 100, 100])]], ...inner, [OPS.paintFormXObjectEnd, []]]
    // (a rectangle's clip, upright or under a quarter turn: its box is where the fill shows)
    expect(opaque(...at([1, 0, 0, 1, 0, 0], [OPS.save, []], ...clipTo([10, 10, 60, 10, 60, 50, 10, 50], [10, 10, 60, 50]), rect(10, 10, 60, 50), [OPS.restore, []]))).toBe(true)
    expect(opaque(...at([0, 1, -1, 0, 100, 0], rect(10, 10, 60, 50)))).toBe(true)
    // (a triangle's clip, a form turned 30 degrees, text shown in a clipping mode: what shows is less than the box)
    expect(opaque(...at([1, 0, 0, 1, 0, 0], [OPS.save, []], ...clipTo([10, 10, 60, 10, 10, 50], [10, 10, 60, 50]), rect(10, 10, 60, 50), [OPS.restore, []]))).toBe(false)
    const c = Math.cos(Math.PI / 6), sn = Math.sin(Math.PI / 6)
    expect(opaque(...at([c, sn, -sn, c, 50, 0], rect(10, 10, 60, 50)))).toBe(false)
    expect(opaque(...at([1, 0, 0, 1, 0, 0], ...text('f1', 10, [1, 0, 0, 1, 20, 20], [OPS.setTextRenderingMode, [7]], show(g('A', 600))), rect(10, 10, 60, 50)))).toBe(false)
    // (the clip given back at its restore: a fill after it covers again)
    expect(opaque(...at([1, 0, 0, 1, 0, 0], [OPS.save, []], ...clipTo([10, 10, 60, 10, 10, 50], [10, 10, 60, 50]), [OPS.restore, []], rect(10, 10, 60, 50)))).toBe(true)
  })
  it('a label over a gridline that a white fill clipped to a triangle leaves in view is crowded; the same fill clipped to its rectangle covers it (#602\'s review)', () => {
    // (the gridline at x 30 through the word's band; the white fill [10, 30, 60, 55] painted after it, clipped to a triangle whose
    // edge from (60, 30) to (10, 55) passes x 30 at y 45, inside the band: above it the gridline shows; then the word "label")
    const labelOver = (clip: number[]) => figureUnitsOf([pageInk(OPS, list([
      [OPS.paintFormXObjectBegin, [Float32Array.from([1, 0, 0, 1, 0, 0]), Float32Array.from([0, 0, 100, 100])]],
      [OPS.constructPath, [OPS.stroke, [Float32Array.from([0, 30, 0, 1, 30, 100])], Float32Array.from([30, 0, 30, 100])]],
      [OPS.save, []], [OPS.clip, []], [OPS.constructPath, [OPS.endPath, [Float32Array.from([0, clip[0]!, clip[1]!, ...clip.slice(2).flatMap((v, i) => (i % 2 ? [v] : [1, v])), 4])], Float32Array.from([10, 30, 60, 55])]],
      [OPS.setFillRGBColor, ['#ffffff']], [OPS.constructPath, [OPS.fill, [Float32Array.from([0, 10, 30, 1, 60, 30, 1, 60, 55, 1, 10, 55, 4])], Float32Array.from([10, 30, 60, 55])]], [OPS.restore, []],
      [OPS.setFillRGBColor, ['#000000']], ...text('f1', 10, [1, 0, 0, 1, 20, 40], show(g('l'), g('a'), g('b'), g('e'), g('l'))),
      [OPS.paintFormXObjectEnd, []],
    ]), commonObjs, { rotate: 0, turned: true, indices: true })] as never, null).units.find(u => u.text === 'label')!
    expect(labelOver([10, 30, 60, 30, 10, 55]).why).toBe('crowded')
    expect(labelOver([10, 30, 60, 30, 60, 55, 10, 55]).why).toBeNull()
  })
  it('a path filled and stroked keeps what shows of each: an invisible fill under a seen stroke is a stroke, and the reverse (#555)', () => {
    const both = (ca: number, CA: number) => {
      const r = figureInk(form(alpha(ca, CA), [OPS.constructPath, [OPS.fillStroke, [Float32Array.from([0, 10, 10, 1, 40, 10, 1, 40, 40, 1, 10, 40, 4])], Float32Array.from([10, 10, 40, 40])]]))
      const shape = r.shapes!.get(0)!
      return [shape.fill, shape.stroke, r.unseen!.has(0)]
    }
    expect(both(1, 1)).toEqual([true, true, false])
    expect(both(0, 1)).toEqual([false, true, false])
    expect(both(1, 0)).toEqual([true, false, false])
    expect(both(0, 0)).toEqual([false, false, true])
  })
  it('a glyph is unseen by its own ink against the clip, not its advance: an outline wholly past the clip shows nothing (#555)', () => {
    // (an outline from 0.5 to 0.7 em across: at x 97 its advance, 97 to 103, crosses the box's edge at 100; its ink, 102 to 104, does not)
    const o = objs({ ...sy, R: [M, 0.5, 0, L, 0.7, 0, L, 0.7, 0.5, Z] })
    const r = pageInk(OPS, list(form(...text('cmsy', 10, [1, 0, 0, 1, 97, 40], show(g('R', 600))))), o, { rotate: 0, turned: true })
    expect(only(r.glyphs, 'R')).toMatchObject({ clipped: true, unseen: true })
    // (a turned one alike: its outline past the box's top, its advance across it)
    const t = pageInk(OPS, list(form(...text('cmsy', 10, [0, 1, -1, 0, 50, 97], show(g('R', 600))))), o, { rotate: 0, turned: true }).turned![0]!
    expect(t).toMatchObject({ clipped: true, unseen: true })
  })
  it('a glyph is shown whole by its own ink inside the clip, its advance past it or not: a label at the edge of a box its ink bounds (the sweep of 1e01ce14)', () => {
    // (an outline from 0.5 to 0.7 em across: at x -4 its advance, -4 to 2, crosses the box's edge at 0; its ink, 1 to 3, does not)
    const o = objs({ ...sy, R: [M, 0.5, 0, L, 0.7, 0, L, 0.7, 0.5, Z] })
    const level = (...ops: Op[]) => only(pageInk(OPS, list(form(...ops)), o, { rotate: 0, turned: true }).glyphs, 'R')
    expect(level(...text('cmsy', 10, [1, 0, 0, 1, -4, 40], show(g('R', 600)))).clipped).toBeUndefined()
    // (a group's box alike, as PDF.js bounds a group: a plotting program ends its figure's box at its labels' ink, so that the side
    // bearing of the first letter stands past it: 2610.19274v1 p9 "frames", p56's title)
    expect(level([OPS.beginGroup, [{ bbox: [20, 0, 100, 100] }]], ...text('cmsy', 10, [1, 0, 0, 1, 16, 40], show(g('R', 600))), [OPS.endGroup, [{}]]).clipped).toBeUndefined()
    // (its ink across the edge: cut, as before)
    expect(level(...text('cmsy', 10, [1, 0, 0, 1, -6, 40], show(g('R', 600)))).clipped).toBe(true)
    // (a turned one alike: its advance from -4 up the page, past the box's bottom; its ink from 1 to 3)
    const t = pageInk(OPS, list(form(...text('cmsy', 10, [0, 1, -1, 0, 50, -4], show(g('R', 600))))), o, { rotate: 0, turned: true }).turned![0]!
    expect(t.clipped).toBeUndefined()
  })
  it('a Type 3 glyph is seen as PDF.js draws it: a d0 one at alpha 1 whatever the text\'s, a d1 one by what its procedure paints; a group painted at 0 still hides it (#555)', () => {
    const path = [OPS.fill, [Float32Array.from([0])], Float32Array.from([10, 0, 30, 20])]
    const procs = new Map<string, { fnArray: number[]; argsArray: unknown[] }>([
      ['own', { fnArray: [OPS.setCharWidth, OPS.setFillRGBColor, OPS.constructPath], argsArray: [[40, 0], ['#ff0000'], path] }],
      ['stencil', { fnArray: [OPS.setCharWidthAndBounds, OPS.constructPath], argsArray: [[40, 0, 10, 0, 30, 20], path] }],
    ])
    FONTS.t3a = { name: 'T3Alpha', fontMatrix: [0.01, 0, 0, 0.01, 0, 0], isType3Font: true, vertical: false, charProcOperatorList: procs }
    try {
      const t = (u: string, id: string) => ({ ...g(u, 40), fontChar: '', operatorListId: id })
      const shown = (...pre: Op[]) => figureInk([...pre, ...text('t3a', 10, [1, 0, 0, 1, 50, 50], [OPS.setGState, [[['ca', 0]]]], show(t('d', 'own'), t('s', 'stencil')))])
      const r = shown()
      expect([only(r.glyphs, 'd').unseen, only(r.glyphs, 's').unseen]).toEqual([undefined, true])
      const hidden = shown(alpha(0), [OPS.beginGroup, [{}]])
      expect(only(hidden.glyphs, 'd').unseen).toBe(true)
      // (a d1 glyph is what its procedure paints, whatever the text's rendering mode, which PDF.js does not apply to a Type 3
      // glyph: its fill under ca, so stroked text (mode 1) under CA 0 still shows it, and under ca 0 nothing does)
      const moded = (ca: number, CA: number) => only(figureInk(text('t3a', 10, [1, 0, 0, 1, 50, 50], [OPS.setTextRenderingMode, [1]], [OPS.setGState, [[['ca', ca], ['CA', CA]]]], show(t('s', 'stencil')))).glyphs, 's').unseen
      expect([moded(1, 0), moded(0, 1)]).toEqual([undefined, true])
      // (a bitmap glyph's mask, which PDF.js compiles into rawFillPath, is a fill; an operation the scan does not know paints, by
      // the fill's alpha; a procedure of nothing but d1 paints nothing, an invisible text layer)
      procs.set('bitmap', { fnArray: [OPS.setCharWidthAndBounds, OPS.constructPath], argsArray: [[40, 0, 10, 0, 30, 20], [OPS.rawFillPath, [Float32Array.from([0, 0.25, 0, 1, 1, 0, 1, 1, 0.75, 4])], Float32Array.from([0, 0, 38, 61])]] })
      procs.set('shaded', { fnArray: [OPS.setCharWidthAndBounds, OPS.shadingFill], argsArray: [[40, 0, 10, 0, 30, 20], ['sh0']] })
      procs.set('empty', { fnArray: [OPS.setCharWidthAndBounds], argsArray: [[40, 0, 0, 0, 0, 0]] })
      const each = figureInk(text('t3a', 10, [1, 0, 0, 1, 50, 50], show(t('b', 'bitmap'), t('h', 'shaded'), t('e', 'empty')))).glyphs
      expect([only(each, 'b').unseen, only(each, 'h').unseen, only(each, 'e').unseen]).toEqual([undefined, undefined, true])
      // (its procedure's own alpha, as PDF.js keeps a procedure's alpha entries: set to 1 inside it under a text at ca 0 it shows;
      // set to 0 it hides what follows; a restore gives the text's back)
      const fill = [OPS.constructPath, [OPS.fill, [Float32Array.from([0])], Float32Array.from([10, 0, 30, 20])]] as const
      const proc = (...ops: (readonly [number, unknown])[]) => ({ fnArray: [OPS.setCharWidthAndBounds, ...ops.map(o => o[0])], argsArray: [[40, 0, 10, 0, 30, 20], ...ops.map(o => o[1])] })
      procs.set('lit', proc([OPS.setGState, [[['ca', 1]]]], fill))
      procs.set('dark', proc([OPS.setGState, [[['ca', 0]]]], fill))
      procs.set('back', proc([OPS.save, []], [OPS.setGState, [[['ca', 0]]]], [OPS.restore, []], fill))
      const under = (ca: number) => figureInk(text('t3a', 10, [1, 0, 0, 1, 50, 50], [OPS.setGState, [[['ca', ca]]]], show(t('l', 'lit'), t('k', 'dark'), t('r', 'back')))).glyphs
      expect(['l', 'k', 'r'].map(u => only(under(0), u).unseen)).toEqual([undefined, true, true])
      expect(['l', 'k', 'r'].map(u => only(under(1), u).unseen)).toEqual([undefined, true, undefined])
      // (a procedure past the bound type3Box reads, or saves past STACK_MAX, is taken as painting: no scan past the page walk's
      // guards, and no glyph unseen for want of reading it)
      const long = { fnArray: [OPS.setCharWidthAndBounds, ...Array.from({ length: 600 }, () => OPS.save), OPS.setGState], argsArray: [[40, 0, 10, 0, 30, 20], ...Array.from({ length: 600 }, () => []), [[['ca', 0]]]] }
      procs.set('long', long)
      expect(only(figureInk(text('t3a', 10, [1, 0, 0, 1, 50, 50], show(t('o', 'long')))).glyphs, 'o').unseen).toBeUndefined()
    } finally { delete FONTS.t3a }
  })
})

// The walk's guards (the census of 2026-10-16: the 2,793 pages of the 124 papers of data/corpus): each an abuse guard twenty
// times or more above the corpus's heaviest page, so that no real page meets one; a page past the box budget degrades, its
// text whole, and a page past the cap or the stack has no ink; no clock decides it but where a reader asks one (the reader's live fills)
describe('pageInk\'s guards', () => {
  const fill = (x0: number, y0: number, x1: number, y1: number): Op => [OPS.constructPath, [OPS.fill, [Float32Array.from([0])], Float32Array.from([x0, y0, x1, y1])]]
  /** the boxes of a reading as [x0, y0, x1, y1] each, with their kinds */
  const boxesOf = (r: { boxes: number[]; paths?: number[] }) => Array.from({ length: r.boxes.length / 4 }, (_, b) => ({ box: r.boxes.slice(4 * b, 4 * b + 4), kind: r.paths?.[b] }))

  it('are set from the census: twenty times its busiest page, its steps, its most boxes and glyphs, its deepest stack', () => {
    // (2608.12606 page 5: 146,115 operations and 173,861 steps; 2608.27728 page 15: 22,101 boxes; 9,332 glyphs; 2608.04183
    // page 15: 27 levels)
    expect(OPS_CAP).toBeGreaterThanOrEqual(20 * 146_115)
    expect(STEPS_MAX).toBeGreaterThanOrEqual(20 * 173_861)
    expect(STEPS_MAX).toBeGreaterThanOrEqual(OPS_CAP)
    expect(BOXES_PAGE).toBeGreaterThanOrEqual(20 * 22_101)
    expect(GLYPHS_PAGE).toBeGreaterThanOrEqual(10 * 9_332)
    expect(STACK_MAX).toBeGreaterThanOrEqual(20 * 27)
  })

  it('a page past the box budget keeps its glyphs and its first boxes as they are, every box after merged by cell, covering them', () => {
    const skipped = [[300, 300, 302, 302], [301, 305, 303, 306], [10, 10, 100, 12], [500, 40, 510, 90]]
    const page: Op[] = [
      fill(100, 100, 105, 101), fill(200, 200, 260, 201),
      ...skipped.map(b => fill(b[0] as number, b[1] as number, b[2] as number, b[3] as number)),
      ...text('f1', 10, [1, 0, 0, 1, 72, 700], show(g('A'), g('B'))),
      // and past the budget each other kind of box: an image, an image repeated, a mask repeated, a group of masks, of inline
      // images, a shading into a clip, a glyph set turned
      [OPS.save, []], [OPS.transform, [50, 0, 0, 50, 400, 400]], [OPS.paintImageXObject, ['img1', 1, 1]], [OPS.restore, []],
      [OPS.paintImageXObjectRepeat, ['img1', 10, 20, Float32Array.from([600, 600, 620, 640])]],
      [OPS.paintImageMaskXObjectRepeat, [{}, 5, 0, 0, 5, Float32Array.from([700, 100])]],
      [OPS.paintImageMaskXObjectGroup, [[{ transform: [5, 0, 0, 5, 150, 500] }]]],
      [OPS.paintInlineImageXObjectGroup, [{}, [{ transform: [4, 0, 0, 4, 160, 520] }]]],
      [OPS.save, []], [OPS.constructPath, [OPS.endPath, [Float32Array.from([0])], Float32Array.from([30, 600, 40, 610])]], [OPS.clip, []],
      [OPS.constructPath, [OPS.endPath, [Float32Array.from([0])], Float32Array.from([30, 600, 40, 610])]], [OPS.shadingFill, ['sh1']], [OPS.restore, []],
      ...text('f1', 10, [0, 1, -1, 0, 250, 250], show(g('R'))),
      fill(120, 130, 121, 131),
    ]
    const whole = pageInk(OPS, list(page), commonObjs, { rotate: 0, indices: true })
    const cut = pageInk(OPS, list(page), commonObjs, { rotate: 0, indices: true, boxesMax: 2 })
    expect(whole.degraded).toBe(false)
    expect(whole.mergedAt).toBeNull()
    expect(cut.degraded).toBe(true)
    expect(cut.capped).toBe(false)
    // the glyphs read in full, alike: their places, their indices, the boxes shown before them as many as were kept
    expect(cut.glyphs).toEqual(whole.glyphs)
    expect(cut.shows).toBe(whole.shows)
    expect(cut.boxAt).toEqual([2, 2])
    // the first two boxes, and their paths' places, as they were; then from `mergedAt` the merged ones alone
    const kept = boxesOf(cut), all = boxesOf(whole)
    expect(kept.slice(0, 2)).toEqual(all.slice(0, 2))
    expect(cut.mergedAt).toBe(2)
    // (every kind is among the boxes past the budget: paths (the clip's two, 6 and 7, paint nothing), images, the shading and the glyph set)
    expect(new Set(all.slice(2).map(b => b.kind))).toEqual(new Set([2, 3, 4, 5, -3, -2, -4, 8]))
    const merged = kept.slice(2)
    expect(merged.every(m => m.kind === MERGED)).toBe(true)
    // each in one cell of 24 points, and every point of every box past the budget in one of them
    for (const { box } of merged) {
      expect(Math.floor((box[0] as number) / 24)).toBe(Math.min(63, Math.ceil((box[2] as number) / 24) - 1))
      expect(Math.floor((box[1] as number) / 24)).toBe(Math.min(63, Math.ceil((box[3] as number) / 24) - 1))
    }
    const covered = (x: number, y: number) => merged.some(({ box }) => x >= (box[0] as number) && x <= (box[2] as number) && y >= (box[1] as number) && y <= (box[3] as number))
    for (const { box, kind } of all.slice(2)) {
      for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) {
        const x = (box[0] as number) + (i / 8) * ((box[2] as number) - (box[0] as number)), y = (box[1] as number) + (j / 8) * ((box[3] as number) - (box[1] as number))
        expect(covered(x, y), `${kind}: ${x} ${y}`).toBe(true)
      }
    }
    // two boxes in one cell are one merged box, their union; a box across cells is a part in each
    expect(merged.filter(({ box }) => box[0] === 300 && box[1] === 300)).toEqual([{ box: [300, 300, 303, 306], kind: MERGED }])
    expect(merged.filter(({ box }) => box[1] === 10 && box[3] === 12).map(m => m.box)).toEqual([[10, 10, 24, 12], [24, 10, 48, 12], [48, 10, 72, 12], [72, 10, 96, 12], [96, 10, 100, 12]])
    // without indices, the same boxes
    expect(pageInk(OPS, list(page), commonObjs, { rotate: 0, boxesMax: 2 }).boxes).toEqual(cut.boxes)
  })

  it('a box beyond the grid lands in its outermost cells, whole', () => {
    const r = pageInk(OPS, list([fill(0, 0, 1, 1), fill(-500, 2000, -400, 2100), fill(1600, -90, 1700, -80)]), commonObjs, { rotate: 0, indices: true, boxesMax: 1 })
    expect(boxesOf(r)).toEqual([{ box: [0, 0, 1, 1], kind: 0 }, { box: [1600, -90, 1700, -80], kind: MERGED }, { box: [-500, 2000, -400, 2100], kind: MERGED }])
  })

  it('a stack deeper than STACK_MAX is read exactly or not at all: saves left open read on, ink in a state a restore lost caps the page', () => {
    const open = (n: number): Op[] => Array.from({ length: n }, (): Op => [OPS.save, []])
    const restores = (n: number): Op[] => Array.from({ length: n }, (): Op => [OPS.restore, []])
    const A = text('f1', 10, [1, 0, 0, 1, 72, 700], show(g('A')))
    // (saves left open, as a stream that opens one for each thing it draws: every glyph after the cap where the canvas places
    // it, under the transform the deepest level set; and the restores PDF.js closes the list with, after the last ink)
    const left = ink([...open(STACK_MAX + 10), [OPS.transform, [2, 0, 0, 2, 0, 0]], ...A, ...restores(STACK_MAX + 10)])
    expect(left.capped).toBe(false)
    expect(left.glyphs.map(q => [q.u, q.x0, q.y])).toEqual([['A', 144, 1400]])
    // (a level past it restored: the state of its save, which no copy holds, is lost; ink placed then caps the page, a glyph
    // or a box alike, whatever the state says of it, here a glyph its scale would have put at 144)
    const lostAt = (...drawn: Op[]) => ink([...open(STACK_MAX + 1), [OPS.save, []], [OPS.transform, [2, 0, 0, 2, 0, 0]], [OPS.restore, []], ...drawn])
    for (const drawn of [A, [[OPS.constructPath, [OPS.fill, [Float32Array.from([0])], Float32Array.from([10, 10, 20, 20])]] as Op], [[OPS.paintImageXObject, ['img1', 1, 1]] as Op]]) {
      const r = lostAt(...drawn)
      expect(r.capped).toBe(true)
      expect([r.glyphs, r.boxes]).toEqual([[], []])
    }
    // (a restore down to a level that holds a copy gives the state back exactly, and ink after it is read; drawing nothing
    // while it is lost caps nothing)
    const back = ink([...open(STACK_MAX), [OPS.save, []], [OPS.transform, [2, 0, 0, 2, 0, 0]], [OPS.restore, []], [OPS.transform, [3, 0, 0, 3, 0, 0]], [OPS.restore, []], ...A])
    expect(back.capped).toBe(false)
    expect(back.glyphs.map(q => [q.u, q.x0])).toEqual([['A', 72]])
    // (an annotation sets a state of its own, known; its end gives back the lost one)
    const annotated = ink([...open(STACK_MAX), [OPS.save, []], [OPS.restore, []], [OPS.beginAnnotation, ['a1', [0, 0, 600, 800], [1, 0, 0, 1, 0, 0], [1, 0, 0, 1, 0, 0]]], ...A, [OPS.endAnnotation, []]])
    expect(annotated.capped).toBe(false)
    expect(annotated.glyphs.map(q => q.u)).toEqual(['A'])
    expect(ink([...open(STACK_MAX), [OPS.save, []], [OPS.restore, []], [OPS.beginAnnotation, ['a1', [0, 0, 600, 800], [1, 0, 0, 1, 0, 0], [1, 0, 0, 1, 0, 0]]], [OPS.endAnnotation, []], ...A]).capped).toBe(true)
  })

  it('a walk past stepsMax stops and the page is capped, alike on every machine: each operation, element shown, placement a step', () => {
    const many: Op[] = [...Array.from({ length: 3000 }, (_, i): Op => (i % 2 ? [OPS.restore, []] : [OPS.save, []])), ...text('f1', 10, [1, 0, 0, 1, 72, 700], show(g('A')))]
    const cut = pageInk(OPS, list(many), commonObjs, { rotate: 0, stepsMax: 2000, msMax: Infinity })
    expect(cut.capped).toBe(true)
    expect(cut.timedOut).toBe(false)
    expect(cut.glyphs).toEqual([])
    expect(pageInk(OPS, list(many), commonObjs, { rotate: 0, stepsMax: 3010, msMax: Infinity }).capped).toBe(false)
    // inside one operation: a shown array's glyphs, invisible ones and numbers too, and an image's placements
    const shown = (...xs: unknown[]) => list(text('f1', 10, [1, 0, 0, 1, 72, 700], [OPS.setTextRenderingMode, [3]], show(...xs)))
    expect(pageInk(OPS, shown(...Array.from({ length: 5000 }, () => g('x'))), commonObjs, { rotate: 0, stepsMax: 1000 }).capped).toBe(true)
    expect(pageInk(OPS, shown(...new Array(5000).fill(-10)), commonObjs, { rotate: 0, stepsMax: 1000 }).capped).toBe(true)
    expect(pageInk(OPS, shown(...new Array(500).fill(-10)), commonObjs, { rotate: 0, stepsMax: 1000 }).capped).toBe(false)
    const placed = (n: number) => list([[OPS.paintImageXObjectRepeat, ['img1', 1, 1, Float32Array.from({ length: 2 * n }, (_, i) => i)]]])
    const repeated = pageInk(OPS, placed(5000), commonObjs, { rotate: 0, stepsMax: 1000 })
    expect(repeated.capped).toBe(true)
    expect(repeated.boxes.length / 4).toBeLessThan(1000)
    expect(pageInk(OPS, placed(500), commonObjs, { rotate: 0, stepsMax: 1000 }).capped).toBe(false)
  })

  it('a page past glyphsMax stops there and is capped', () => {
    const page = list(text('f1', 10, [1, 0, 0, 1, 72, 700], show(...Array.from({ length: 50 }, () => g('x')))))
    const cut = pageInk(OPS, page, commonObjs, { rotate: 0, glyphsMax: 20 })
    expect(cut.capped).toBe(true)
    expect(cut.glyphs).toHaveLength(20)
    expect(pageInk(OPS, page, commonObjs, { rotate: 0, glyphsMax: 50 }).capped).toBe(false)
  })

  it('a walk past msMax, where a reader asks one, stops and the page is timed out; with none asked no clock is read at all', () => {
    // (the reader's live fills' wait, the one bound that depends on the machine, never the prepare's: more steps than come between
    // two readings of the clock, three thousand operations)
    const many: Op[] = [...Array.from({ length: 3000 }, (_, i): Op => (i % 2 ? [OPS.restore, []] : [OPS.save, []])), ...text('f1', 10, [1, 0, 0, 1, 72, 700], show(g('A')))]
    const late = pageInk(OPS, list(many), commonObjs, { rotate: 0, msMax: -1 })
    expect(late.timedOut).toBe(true)
    expect(late.capped).toBe(false)
    expect(late.glyphs).toEqual([])
    const inTime = pageInk(OPS, list(many), commonObjs, { rotate: 0, msMax: Infinity })
    expect(inTime.timedOut).toBe(false)
    expect(inTime.glyphs.map(q => q.u)).toEqual(['A'])
    // a short page never reads the clock past its start
    expect(pageInk(OPS, list(text('f1', 10, [1, 0, 0, 1, 72, 700], show(g('A')))), commonObjs, { rotate: 0, msMax: -1 }).timedOut).toBe(false)
    // and with no msMax (the prepare's readers) the walk reads no clock: the same page, however slow the machine, is read whole
    const now = vi.spyOn(performance, 'now')
    try {
      const prepared = pageInk(OPS, list(many), commonObjs, { rotate: 0 })
      expect(prepared.timedOut).toBe(false)
      expect(prepared.glyphs.map(q => q.u)).toEqual(['A'])
      expect(now).not.toHaveBeenCalled()
    } finally { now.mockRestore() }
  })
})
