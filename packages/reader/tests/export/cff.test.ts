// The export's CFF subset (export/cff.ts): a served slice's CFF written again with only the glyphs a file draws and the
// subroutines they call, every glyph id and CID kept, every offset written anew. Fonts of our own (cff-build.ts).
import { describe, expect, it } from 'vitest'
import { readCff, subsetCff } from '../../src/export/cff.ts'
import { buildCff, cs } from './cff-build.ts'

const EMPTY_GLYPH = [14]
const EMPTY_SUBR = [11]
const bytes = (b: Uint8Array | undefined) => [...(b ?? [])]

describe('the CFF subset', () => {
  // a name-keyed font: glyph 1 calls local subroutine 0, which calls global 1; glyph 2 calls local 1; glyph 3 nothing
  const nameKeyed = () =>
    buildCff({
      glyphs: [
        cs('endchar'),
        cs(500, 0, 50, 'rmoveto', -107, 'callsubr', 'endchar'),
        cs(500, 0, 50, 'rmoveto', -106, 'callsubr', 'endchar'),
        cs(500, 10, 10, 'rmoveto', 300, 0, 'rlineto', 'endchar'),
      ],
      gsubrs: [cs(1, 1, 'rlineto', 'return'), cs(0, 40, 'rlineto', 'return')],
      lsubrs: [[cs(40, 0, 'rlineto', -106, 'callgsubr', 'return'), cs(0, -40, 'rlineto', 'return')]],
    })

  it('keeps the glyphs asked and glyph 0, empties the others, and keeps every glyph id', () => {
    const font = nameKeyed()
    const out = subsetCff(font, new Set([1]))
    expect(out).not.toBeNull()
    const a = readCff(font),
      b = readCff(out as Uint8Array)
    expect(b.glyphs.length).toBe(a.glyphs.length)
    expect(bytes(b.glyphs[0])).toEqual(bytes(a.glyphs[0]))
    expect(bytes(b.glyphs[1])).toEqual(bytes(a.glyphs[1]))
    expect(bytes(b.glyphs[2])).toEqual(EMPTY_GLYPH)
    expect(bytes(b.glyphs[3])).toEqual(EMPTY_GLYPH)
  })

  it('keeps the subroutines the kept glyphs reach, through other subroutines, and empties the rest', () => {
    const font = nameKeyed()
    const a = readCff(font),
      b = readCff(subsetCff(font, new Set([1])) as Uint8Array)
    // glyph 1 -> local 0 -> global 1; local 1 and global 0 are reached by no kept glyph
    expect(bytes(b.lsubrs[0]?.[0])).toEqual(bytes(a.lsubrs[0]?.[0]))
    expect(bytes(b.lsubrs[0]?.[1])).toEqual(EMPTY_SUBR)
    expect(bytes(b.gsubrs[1])).toEqual(bytes(a.gsubrs[1]))
    expect(bytes(b.gsubrs[0])).toEqual(EMPTY_SUBR)
    expect(b.lsubrs[0]?.length).toBe(2)
    expect(b.gsubrs.length).toBe(2)
  })

  it('is smaller than the font it subsets', () => {
    const font = nameKeyed()
    expect((subsetCff(font, new Set([1])) as Uint8Array).length).toBeLessThan(font.length)
  })

  it("counts a hint mask's stems, its mask bytes never read as an operator", () => {
    // two stems by hstemhm, one more implicit before hintmask: three stems, one mask byte, here 10 (callsubr's code), then a
    // call of local subroutine 1 that must be the one kept
    const font = buildCff({
      glyphs: [
        cs('endchar'),
        cs(0, 10, 20, 10, 'hstemhm', 30, 10, 'hintmask', { mask: [10] }, -106, 'callsubr', 'endchar'),
      ],
      gsubrs: [],
      lsubrs: [[cs(5, 5, 'rlineto', 'return'), cs(6, 6, 'rlineto', 'return')]],
    })
    const b = readCff(subsetCff(font, new Set([1])) as Uint8Array)
    expect(bytes(b.lsubrs[0]?.[0])).toEqual(EMPTY_SUBR)
    expect(bytes(b.lsubrs[0]?.[1])).toEqual(bytes(readCff(font).lsubrs[0]?.[1]))
  })

  it("keeps a CID-keyed font's charset, its Font DICTs and each one's own local subroutines", () => {
    // glyph 1 under Font DICT 0 calls its local 0; glyph 2 under Font DICT 1 calls ITS local 0; glyph 3 under 1, not kept
    const font = buildCff({
      glyphs: [
        cs('endchar'),
        cs(0, 0, 'rmoveto', -107, 'callsubr', 'endchar'),
        cs(0, 0, 'rmoveto', -107, 'callsubr', 'endchar'),
        cs(0, 0, 'rmoveto', -106, 'callsubr', 'endchar'),
      ],
      gsubrs: [],
      lsubrs: [
        [cs(1, 0, 'rlineto', 'return'), cs(2, 0, 'rlineto', 'return')],
        [cs(3, 0, 'rlineto', 'return'), cs(4, 0, 'rlineto', 'return')],
      ],
      cid: { fdOf: [0, 0, 1, 1], cids: [0, 7001, 7002, 7003] },
    })
    const a = readCff(font)
    const b = readCff(subsetCff(font, new Set([2])) as Uint8Array)
    expect(b.cidKeyed).toBe(true)
    expect([...b.cids]).toEqual([...a.cids])
    expect([...b.fds]).toEqual([...a.fds])
    expect(bytes(b.glyphs[2])).toEqual(bytes(a.glyphs[2]))
    expect(bytes(b.glyphs[1])).toEqual(EMPTY_GLYPH)
    expect(bytes(b.lsubrs[1]?.[0])).toEqual(bytes(a.lsubrs[1]?.[0]))
    expect(bytes(b.lsubrs[1]?.[1])).toEqual(EMPTY_SUBR)
    expect(bytes(b.lsubrs[0]?.[0])).toEqual(EMPTY_SUBR)
  })

  it('refuses a glyph that composes others by their standard codes (an endchar with four operands): the font goes whole', () => {
    const font = buildCff({
      glyphs: [cs('endchar'), cs(0, 0, 65, 97, 'endchar')],
      gsubrs: [],
      lsubrs: [[]],
    })
    expect(subsetCff(font, new Set([1]))).toBeNull()
  })

  it('refuses a call whose subroutine number the charstring computes: the font goes whole', () => {
    const font = buildCff({
      glyphs: [cs('endchar'), cs(-108, 1, 'add', 'callsubr', 'endchar')],
      gsubrs: [],
      lsubrs: [[cs('return')]],
    })
    expect(subsetCff(font, new Set([1]))).toBeNull()
  })
})
