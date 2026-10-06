import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { type Glyph, OPS_CAP, pageInk } from '@/pdf-reader/engine/layout/ink.mjs'

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
    // a blank glyph is no glyph of the ink
    expect(scaled(show(g(' ', 250, true))).glyphs).toEqual([])
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

  it('a Type 3 font\'s glyph takes 0.75 and −0.22 of its size', () => {
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
    for (const rotate of [90, 180, 270, -90, 450]) expect(ink(page, rotate)).toEqual({ glyphs: [], boxes: [], capped: false, rotated: true })
    expect(ink(page, 360).rotated).toBe(false)
    expect(ink(page, Number.NaN).rotated).toBe(true)
  })

  it('a page past OPS_CAP is capped', () => {
    expect(OPS_CAP).toBe(150_000)
    const head = text('f1', 10, [1, 0, 0, 1, 72, 700], show(g('A')))
    // the tail ends on its showText, so that the cap falls on it
    const tail = text('f1', 10, [1, 0, 0, 1, 72, 600], show(g('Z'))).slice(0, -1)
    const filler = (n: number): Op[] => Array.from({ length: n }, (_, i) => (i % 2 ? [OPS.restore, []] : [OPS.save, []]))
    // the last glyph shown by the 150,001st operation: not read
    const over = [...head, ...filler(OPS_CAP + 1 - head.length - tail.length), ...tail]
    expect(over).toHaveLength(OPS_CAP + 1)
    const a = ink(over)
    expect(a.capped).toBe(true)
    expect(a.glyphs.map(q => q.u)).toEqual(['A'])
    // exactly OPS_CAP operations: all read
    const at = [...head, ...filler(OPS_CAP - head.length - tail.length), ...tail]
    const b = ink(at)
    expect(b.capped).toBe(false)
    expect(b.glyphs.map(q => q.u)).toEqual(['A', 'Z'])
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
