// @vitest-environment node
// Small capitals in the PDF download (#685's round 3, 4704125899): a run the reader draws in a face's own small capitals (the
// class's font-variant-caps over the face's smcp feature, compose/served.ts partsOf) is drawn in the file with the glyphs the
// feature substitutes, read from the slice's GSUB (fonts.ts readSfnt `smcp`), and its characters placed as the reader measures
// it: cut where the face that holds a character changes, each piece measured alone, in small capitals where its face has its
// own and in lower case where it has none (export/run.ts glyphsFor).
import { describe, expect, it } from 'vitest'
import { readSfnt, type SfntFont } from '../../src/export/fonts.ts'
import { glyphsFor } from '../../src/export/run.ts'
import { cs } from './cff-build.ts'
import { buildSfnt } from './sfnt-build.ts'

const b16 = (n: number) => [(n >> 8) & 255, n & 255]
const tag = (t: string) => [...t].map((c) => c.charCodeAt(0))
const coverage = (gs: number[]) => [...b16(1), ...b16(gs.length), ...gs.flatMap(b16)]
/** a single substitution, format 1 (a delta) or 2 (a glyph each) */
const single1 = (gs: number[], delta: number) => [...b16(1), ...b16(6), ...b16(delta & 0xffff), ...coverage(gs)]
const single2 = (gs: number[], to: number[]) => [
  ...b16(2),
  ...b16(6 + 2 * to.length),
  ...b16(to.length),
  ...to.flatMap(b16),
  ...coverage(gs),
]
/** an extension subtable (lookup type 7) holding a type-1 subtable */
const ext = (sub: number[]) => [...b16(1), ...b16(1), 0, 0, 0, 8, ...sub]
const lookup = (type: number, subs: number[][]) => {
  const head = 6 + 2 * subs.length
  const offs: number[] = []
  let at = head
  for (const x of subs) {
    offs.push(at)
    at += x.length
  }
  return [...b16(type), 0, 0, ...b16(subs.length), ...offs.flatMap(b16), ...subs.flat()]
}
/** a GSUB: its features (tag, lookup indices) and its lookups, no script */
function gsub(features: [string, number[]][], lookups: number[][]): Uint8Array {
  const fHead = 2 + 6 * features.length
  const fBodies = features.map(([, ix]) => [0, 0, ...b16(ix.length), ...ix.flatMap(b16)])
  const fOffs: number[] = []
  let at = fHead
  for (const f of fBodies) {
    fOffs.push(at)
    at += f.length
  }
  const featureList = [
    ...b16(features.length),
    ...features.flatMap(([t], i) => [...tag(t), ...b16(fOffs[i]!)]),
    ...fBodies.flat(),
  ]
  const lHead = 2 + 2 * lookups.length
  const lOffs: number[] = []
  at = lHead
  for (const l of lookups) {
    lOffs.push(at)
    at += l.length
  }
  const lookupList = [...b16(lookups.length), ...lOffs.flatMap(b16), ...lookups.flat()]
  const scriptList = [0, 0]
  return new Uint8Array([
    ...b16(1),
    ...b16(0),
    ...b16(10),
    ...b16(12),
    ...b16(12 + featureList.length),
    ...scriptList,
    ...featureList,
    ...lookupList,
  ])
}
const glyph = cs(0, 0, 'rmoveto', 500, 0, 'rlineto', 'endchar')
/** a face of eight glyphs: a (1), b (2), c (3); their small capitals A.sc (4), B.sc (5), C.sc (6); a ligature (7), a glyph a
 *  second smcp lookup maps B.sc to (8) */
const fontWith = (table: Uint8Array | null): SfntFont =>
  readSfnt(
    'smcp',
    buildSfnt({
      glyphs: [cs('endchar'), glyph, glyph, glyph, glyph, glyph, glyph, glyph, glyph],
      gsubrs: [],
      lsubrs: [[]],
      cid: { fdOf: [0, 0, 0, 0, 0, 0, 0, 0, 0], cids: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
      cmap: [
        [0x61, 1],
        [0x62, 2],
        [0x63, 3],
      ],
      advances: [0, 500, 510, 520, 600, 610, 620, 700, 630],
      ...(table ? { extra: { GSUB: table } } : {}),
    }).sfnt,
  )!

describe("a face's small capitals read from its GSUB (fonts.ts readSfnt)", () => {
  it("maps each glyph its smcp feature's single substitutions reach, lookup after lookup (an extension's too), none another feature's", () => {
    const f = fontWith(
      gsub(
        [
          ['liga', [0]],
          ['smcp', [1, 2]],
        ],
        [
          lookup(1, [single1([1, 2, 3], 6)]),
          // (the first subtable that covers a glyph is its; the third, which covers a again, is not)
          lookup(1, [single1([1], 3), single2([2, 3], [5, 6]), single1([1], 5)]),
          lookup(7, [ext(single2([5], [8]))]),
        ],
      ),
    )
    expect([...f.smcp].sort((x, y) => x[0] - y[0])).toEqual([
      [1, 4],
      [2, 8],
      [3, 6],
      // (B.sc itself, which the second lookup maps on)
      [5, 8],
    ])
  })
  it('reads none where the face has no GSUB, and none from a table cut short', () => {
    expect(fontWith(null).smcp.size).toBe(0)
    expect(fontWith(new Uint8Array([0, 1, 0, 0, 0, 10, 0, 12, 0, 40])).smcp.size).toBe(0)
  })
})

describe('a small capitals run drawn and placed as the reader draws and measures it (run.ts glyphsFor)', () => {
  const own = fontWith(gsub([['smcp', [0]]], [lookup(1, [single1([1, 2, 3], 3)])]))
  const fonts = new Map<string, SfntFont | null>([
    ['own', own],
    ['plain', fontWith(null)],
  ])
  // (Latin in domitian-regular, which has its own small capitals (SMCP); 'c' in a face that has none; digits in a third)
  const served = {
    sliceOf: (_font: string, cp: number) =>
      cp === 0x63
        ? { key: 'p', path: 'plain', face: 'nimbus-roman-regular' }
        : cp >= 0x61
          ? { key: 'o', path: 'own', face: 'domitian-regular' }
          : null,
  }
  const CAPS = 'small-caps 400 10px "axt-domitian-regular", "axt-nimbus-roman-regular"'
  const PLAIN = '400 10px "axt-domitian-regular", "axt-nimbus-roman-regular"'
  it("draws a face's own small capital where the run asks small capitals, its lower case where it does not", () => {
    const g = glyphsFor(served, fonts, () => 0)
    expect(g.glyph(CAPS, 0x61)).toEqual({ font: own, gid: 4 })
    expect(g.glyph(PLAIN, 0x61)).toEqual({ font: own, gid: 1 })
    expect(g.glyph('italic small-caps 400 10px "axt-domitian-regular"', 0x62)).toEqual({ font: own, gid: 5 })
    expect(g.glyph(CAPS, 0x63)?.gid).toBe(3)
  })
  it('places a small capitals run by pieces of one face each, measured alone: small capitals where its face has its own', () => {
    const asked: [string, string][] = []
    // (a width of 10 a character in small capitals, 7 in lower case)
    const measure = (font: string, text: string) => {
      asked.push([font, text])
      return [...text].length * (font.startsWith('small-caps') ? 10 : 7)
    }
    const g = glyphsFor(served, fonts, measure)
    expect(g.offsets(CAPS, 'abcab')).toEqual([0, 10, 20, 27, 37])
    expect(new Set(asked.filter(([, t]) => t.includes('c')).map(([f]) => f))).toEqual(new Set([PLAIN]))
    expect(asked.filter(([, t]) => t.includes('a')).every(([f]) => f === CAPS)).toBe(true)
    // (a run that asks no small capitals is measured whole, as before)
    asked.length = 0
    expect(g.offsets(PLAIN, 'abc')).toEqual([0, 7, 14])
    expect(asked.every(([f]) => f === PLAIN)).toBe(true)
  })
})
