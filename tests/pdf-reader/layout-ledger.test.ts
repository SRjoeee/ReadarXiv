import { OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { describe, expect, it } from 'vitest'
import { pageInk } from '@readarxiv/engine'

// The content classes and the ledger of our final pass (docs/route/orphan-text.md, stage 1): every glyph one class, by TeX's
// facts — its owner, its region, the babel names' points, stream order — and its own font

describe('pageInk with indices', () => {
  const FONTS: Record<string, unknown> = { f1: { name: 'ABCDEF+CMR10', fontMatrix: [0.001, 0, 0, 0.001, 0, 0], ascent: 0.7, descent: -0.2, isType3Font: false, vertical: false } }
  const commonObjs = { get: (id: string) => FONTS[id] }
  const g = (unicode: string) => ({ unicode, width: 500, isSpace: false, fontChar: unicode, vmetric: null })
  const text = (x: number, ch: string): [number, unknown[]][] => [[OPS.beginText, []], [OPS.setFont, ['f1', 10]], [OPS.setTextMatrix, [[1, 0, 0, 1, x, 700]]], [OPS.showText, [[g(ch)]]], [OPS.endText, []]]
  it('marks a glyph shown inside a form XObject, and none outside it', () => {
    const ops: [number, unknown[]][] = [...text(72, 'a'), [OPS.paintFormXObjectBegin, [Float32Array.from([1, 0, 0, 1, 0, 0]), Float32Array.from([0, 0, 600, 800])]], ...text(100, 'b'), [OPS.paintFormXObjectEnd, []], ...text(130, 'c')]
    const { glyphs } = pageInk(OPS, { fnArray: ops.map(o => o[0]), argsArray: ops.map(o => o[1]) }, commonObjs, { rotate: 0, indices: true })
    expect(glyphs.map(x => [x.u, !!x.form])).toEqual([['a', false], ['b', true], ['c', false]])
  })
})
