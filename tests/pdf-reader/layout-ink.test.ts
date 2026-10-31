import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { BOXES_PAGE, GLYPHS_PAGE, type Glyph, INK_MS, MERGED, OPS_CAP, outlineBox, pageInk, STACK_MAX, STEPS_MAX } from '@/pdf-reader/engine/layout/ink.mjs'

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
    for (const rotate of [90, 180, 270, -90, 450]) expect(ink(page, rotate)).toEqual({ glyphs: [], boxes: [], points: [], boxAt: [], capped: false, timedOut: false, degraded: false, mergedAt: null, rotated: true })
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
})

// The walk's guards (the census of 2026-10-16: the 2,793 pages of the 124 papers of data/corpus): each an abuse guard twenty
// times or more above the corpus's heaviest page, so that no real page meets one; a page past the box budget degrades, its
// text whole, and a page past the cap, the stack or the clock has no ink
describe('pageInk\'s guards', () => {
  const fill = (x0: number, y0: number, x1: number, y1: number): Op => [OPS.constructPath, [OPS.fill, [Float32Array.from([0])], Float32Array.from([x0, y0, x1, y1])]]
  /** the boxes of a reading as [x0, y0, x1, y1] each, with their kinds */
  const boxesOf = (r: { boxes: number[]; paths?: number[] }) => Array.from({ length: r.boxes.length / 4 }, (_, b) => ({ box: r.boxes.slice(4 * b, 4 * b + 4), kind: r.paths?.[b] }))

  it('are set from the census: twenty times its busiest page, its steps, its most boxes and glyphs, its deepest stack', () => {
    // (2608.12606 page 5: 146,115 operations and 173,861 steps; 2608.27728 page 15: 22,101 boxes; 9,332 glyphs; 2608.04183
    // page 15: 27 levels; and the backstop a hundred times the slowest walk, 18 ms)
    expect(OPS_CAP).toBeGreaterThanOrEqual(20 * 146_115)
    expect(STEPS_MAX).toBeGreaterThanOrEqual(20 * 173_861)
    expect(STEPS_MAX).toBeGreaterThanOrEqual(OPS_CAP)
    expect(BOXES_PAGE).toBeGreaterThanOrEqual(20 * 22_101)
    expect(GLYPHS_PAGE).toBeGreaterThanOrEqual(10 * 9_332)
    expect(STACK_MAX).toBeGreaterThanOrEqual(20 * 27)
    expect(INK_MS).toBeGreaterThanOrEqual(100 * 18)
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

  it('a walk past msMax stops and the page is timed out', () => {
    // (the backstop, the one bound that depends on the machine: more steps than come between two readings of the clock,
    // three thousand operations)
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
  })
})
