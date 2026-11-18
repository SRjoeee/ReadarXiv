import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { pageInk } from '@readarxiv/engine'
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
/** a text object: the font at a size, the text matrix, then what is shown */
const text = (font: string, size: number, tm: number[], ...shown: Op[]): Op[] => [[OPS.beginText, []], [OPS.setFont, [font, size]], [OPS.setTextMatrix, [tm]], ...shown, [OPS.endText, []]]
const show = (...glyphs: unknown[]): Op => [OPS.showText, [glyphs]]

describe('a glyph\'s own ink (the maker round, Fix 2: the ink band)', () => {
  FONTS.cmsy = { name: 'MJNQMS+CMSY10', loadedName: 'cmsy', fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0.775, descent: -0.96, isType3Font: false, vertical: false }

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
})

// The walk's guards (the census of 2026-10-16: the 2,793 pages of the 124 papers of data/corpus): each an abuse guard twenty
// times or more above the corpus's heaviest page, so that no real page meets one; a page past the box budget degrades, its
// text whole, and a page past the cap or the stack has no ink; no clock decides it but where a reader asks one (the reader's live fills)
