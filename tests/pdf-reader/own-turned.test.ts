// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { type OwnUnit, ownOf } from '../../packages/engine/src/own/own.ts'
import type { SourcePiece } from '../../packages/engine/src/source/latex-front.ts'

// RED (lane turned, the fix not built): units the ownership's spell check refuses (own/own.ts, `unhidden: 'spell'`) though TeX's
// marks bound them, on pages written as a stream of points, level glyphs and glyphs set turned.
// (1) Text TeX set turned (\rotatebox{90}{…} in a table's header, a sideways float's caption): pageInk keeps a glyph that is not
// level apart, a box of its em (kind -4) and, read with `turned`, a turned glyph (ink.ts emit/turnedGlyph); the ownership reads
// the level glyphs alone, so the text between the unit's points spells nothing and the unit is the original's, its English left
// on a page whose other units are drawn translated. A turned glyph between a unit's points is its text, or its placeholder's
// between that placeholder's points, as a level one is (rules MR 2 and 4), each stated by its group (`turned[p - 1][j]`).
// (2) A formula TeX set right after the start point of a cell whose first piece (a colour command) may look ahead: the marking
// gives the formula no mark (marks.ts layoutMarking `reads`), its glyphs stand in the text's range, and the text spells more
// letters than its source. Its ink is what stands between the start point and the glyphs that spell the text after it.

type Item = string | { pt: string } | { turned: string }
/** a page of a stream: a string level glyphs (one unit wide, on the baseline `y`), `{ pt }` a point, `{ turned }` glyphs set a
 *  quarter turned (up the page from x 300), each a box of kind -4 and a turned glyph as pageInk gives them (`at`: the level
 *  glyphs before it; `box`: its box's index) */
function page(items: Item[]) {
  const glyphs: { n: number; k: number; u: string; x0: number; x1: number; y: number; size: number; top: number; bottom: number }[] = []
  const points: { name: string; glyph: number; box: number }[] = [], boxes: number[] = [], paths: number[] = [], boxAt: number[] = []
  const turned: Record<string, unknown>[] = []
  let x = 10, n = 0, up = 400
  const y = 700
  for (const it of items) {
    if (typeof it === 'string') {
      for (const c of it) {
        glyphs.push({ n, k: 0, u: c, x0: x, x1: x + 5, y, size: 10, top: y + 7, bottom: y - 2 })
        boxAt.push(boxes.length / 4)
        n++
        x += 5
      }
    } else if ('pt' in it) points.push({ name: it.pt, glyph: glyphs.length, box: boxes.length / 4 })
    else
      for (const c of it.turned) {
        const box = boxes.length / 4
        boxes.push(298, up, 306, up + 5)
        paths.push(-4)
        turned.push({ u: c, n, k: 0, ox: 300, oy: up, ex: 300, ey: up + 5, ux: 0, uy: 1, size: 10, ascent: 0.7, descent: -0.2, up: 0.7, down: -0.2, font: 'CMR10', fill: 0, box, at: glyphs.length, pt: 0, ...(/\S/.test(c) ? {} : { blank: true }) })
        n++
        up += 5
      }
  }
  return { glyphs, points, boxes, paths, boxAt, turned, view: [0, 0, 612, 792] as const }
}
const text = (s: string): SourcePiece<string | null> => ({ t: 'text', s }) as SourcePiece<string | null>
const ph = (src: string): SourcePiece<string | null> => ({ t: 'ph', src }) as SourcePiece<string | null>
/** each turned glyph's group, by page (the ownership's `turned`, absent before the fix) */
const turnedGroups = (r: ReturnType<typeof ownOf>) => (r as unknown as { turned?: (string | null)[][] }).turned

describe('a unit whose text TeX set turned (RED: the fix is not built)', () => {
  it('owns a header cell set a quarter turned: its turned glyphs between its points are its text', () => {
    const pages = [page(['Method', { pt: 't0s' }, { turned: 'Accuracy' }, { pt: 't0e' }])]
    const units: OwnUnit[] = [{ kind: 'cell', pieces: [text(' Accuracy ')] }]
    const r = ownOf(pages, { units })
    expect(r.units.get(0)?.unhidden).toBeNull()
    expect(r.stats.unhidden.spell).toBe(0)
    expect(turnedGroups(r)?.[0]).toEqual(Array(8).fill('u0'))
    // (no level glyph is the cell's: "Method" before its start point is no unit's)
    expect(r.glyphs[0]!.every((g) => g === null)).toBe(true)
  })
  it('owns a caption set turned with a reference inside it: the reference’s turned glyph between its points is its placeholder’s', () => {
    const pages = [page([{ pt: '0s' }, { turned: 'Steps of the run, Sect. ' }, { pt: 'p0.1a' }, { turned: '4' }, { pt: 'p0.1b' }, { pt: '0e' }])]
    const units: OwnUnit[] = [{ kind: 'caption', pieces: [text('Steps of the run, Sect. '), ph('\\ref{sec:run}')] }]
    const r = ownOf(pages, { units })
    expect(r.units.get(0)?.unhidden).toBeNull()
    const groups = turnedGroups(r)?.[0] ?? []
    expect(groups.at(-1)).toBe('u0.p')
    expect(groups.slice(0, -1).filter((g) => g !== 'u0')).toEqual([])
  })
})

describe('a cell whose formula the marking leaves unmarked after a command that may look ahead (RED: the fix is not built)', () => {
  it('owns the cell: the formula’s glyph between the start point and the text after it is its placeholder’s', () => {
    // (`\cellcolor{gray} $\alpha$ held`: \cellcolor passed over at the cell's head, the formula after it unmarked; TeX set the
    // start point before the formula, its glyph, then the text)
    const pages = [page([{ pt: 't0s' }, 'α', ' held', { pt: 't0e' }])]
    const units: OwnUnit[] = [{ kind: 'cell', pieces: [ph('\\cellcolor{gray}'), text(' '), ph('$\\alpha$'), text(' held\n')] }]
    const r = ownOf(pages, { units })
    expect(r.units.get(0)?.unhidden).toBeNull()
    expect(r.glyphs[0]![0]).toBe('u0.p')
    expect(r.glyphs[0]!.slice(2).every((g) => g === 'u0')).toBe(true)
  })
})
