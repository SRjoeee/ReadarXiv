import { describe, expect, it } from 'vitest'
import { cmykToRgb, fillOfColour } from '@/pdf-reader/engine/layout/colour.mjs'

// The fill TeX set a run in, from its driver's colour string (layout/colour.mjs): what the marked original writes at a colour
// piece (marks.mjs AXT-COLOUR), as PDF.js turns a PDF fill to RGB

describe("a driver's colour string as the fill the reader draws", () => {
  it("reads the first PDF fill operator, each component as PDF.js stores it (x 255, nearest, ties to even)", () => {
    expect(fillOfColour('0 0 1 rg 0 0 1 RG')).toBe(0x0000ff)
    // (xcolor's blue!60!black and red!65!black are RGB mixes: 0.65 x 255 = 165.75)
    expect(fillOfColour('0.65 0 0 rg 0.65 0 0 RG')).toBe(0xa60000)
    expect(fillOfColour('0 0 0.6 rg 0 0 0.6 RG')).toBe(0x000099)
    // gray: 127.5 to 128, 76.5 to 76 (a Uint8ClampedArray's rounding)
    expect(fillOfColour('0.5 g 0.5 G')).toBe(0x808080)
    expect(fillOfColour('0.3 g 0.3 G')).toBe(0x4c4c4c)
    expect(fillOfColour('0 g 0 G')).toBe(0)
  })
  it("reads a colour special's own forms (dvips.def, xetex.def)", () => {
    expect(fillOfColour('rgb 0 0 1')).toBe(0x0000ff)
    expect(fillOfColour('gray 0.5')).toBe(0x808080)
    expect(fillOfColour('cmyk 0 1 1 0')).toBe(cmykToRgb(0, 1, 1, 0))
  })
  it("turns CMYK as PDF.js's DeviceCMYK does (its polynomial), not 1 - c", () => {
    expect(fillOfColour('1 0 0 0 k 1 0 0 0 K')).toBe(0x00b9f2)
    expect(cmykToRgb(0, 0, 0, 0)).toBe(0xffffff)
    // (a dvipsnames colour, Orange: 0 0.61 0.87 0)
    expect(fillOfColour('0 0.61 0.87 0 k 0 0.61 0.87 0 K')).toBe(cmykToRgb(0, 0.61, 0.87, 0))
    expect(fillOfColour('0 0 0 1 k 0 0 0 1 K')).toBe(0x2c2e35)
  })
  it('is no colour for a named colour of dvips, a component out of 0 to 1, too few numbers or no string', () => {
    for (const s of ['Red', '', '1.5 0 0 rg', '0 0 rg', 'rgb 0 1', 'x'.repeat(300)]) expect(fillOfColour(s), s).toBeNull()
    expect(fillOfColour(undefined)).toBeNull()
  })
})
