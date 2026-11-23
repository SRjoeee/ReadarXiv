// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { type OwnTurned, type OwnUnit, ownOf } from '../../packages/engine/src/own/own.ts'
import type { SourcePiece } from '../../packages/engine/src/source/latex-front.ts'

// Units the ownership's spell check refused (own/own.ts, `unhidden: 'spell'`) though TeX's marks bound them, on pages written as a
// stream of points, level glyphs and glyphs set turned.
// (1) Text TeX set turned (\rotatebox{90}{…} in a table's header, a sideways float's caption; own.ts TURNED): pageInk keeps a
// glyph that is not level apart, a box of its em (kind -4) and, read with `turned`, a turned glyph (ink.ts emit/turnedGlyph).
// A turned glyph between the points of a unit whose range holds no level text is its text, or its placeholder's between that
// placeholder's points, as a level one is (rules MR 2 and 4), each stated by its group (`turned[p - 1][j]`), and the unit's
// turn is their one direction.
// (2) A formula TeX set right after the start point of a cell whose first piece (a colour command) may look ahead: the marking
// gives the formula no mark (marks.ts layoutMarking `reads`), its glyphs stand in the text's range, and the text spells more
// letters than its source. Its ink is what stands between the start point and the glyphs that spell the text after it. NOT
// BUILT (another lane's: the pieces TeX gives no mark), held here as it fails today (`it.fails`)

type Item = string | { pt: string } | { turned: string; dir?: [number, number] }
/** a page of a stream: a string level glyphs (one unit wide, on the baseline `y`), `{ pt }` a point, `{ turned }` glyphs set a
 *  quarter turned (up the page from x 300), each a box of kind -4 and a turned glyph as pageInk gives them (`at`: the level
 *  glyphs before it; `box`: its box's index) */
function page(items: Item[]) {
  const glyphs: { n: number; k: number; u: string; x0: number; x1: number; y: number; size: number; top: number; bottom: number }[] = []
  const points: { name: string; glyph: number; box: number }[] = [], boxes: number[] = [], paths: number[] = [], boxAt: number[] = []
  const turned: (OwnTurned & Record<string, unknown>)[] = []
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
        const [ux, uy] = it.dir ?? [0, 1]
        turned.push({ u: c, n, k: 0, ox: 300, oy: up, ex: 300, ey: up + 5, ux, uy, size: 10, ascent: 0.7, descent: -0.2, up: 0.7, down: -0.2, font: 'CMR10', fill: 0, box, at: glyphs.length, pt: 0, ...(/\S/.test(c) ? {} : { blank: true }) })
        n++
        up += 5
      }
  }
  return { glyphs, points, boxes, paths, boxAt, turned, view: [0, 0, 612, 792] as const }
}
const text = (s: string): SourcePiece<string | null> => ({ t: 'text', s }) as SourcePiece<string | null>
const ph = (src: string): SourcePiece<string | null> => ({ t: 'ph', src }) as SourcePiece<string | null>
/** each turned glyph's group, by page (the ownership's `turned`) */
const turnedGroups = (r: ReturnType<typeof ownOf>) => r.turned

describe('a unit whose text TeX set turned', () => {
  it('owns a header cell set a quarter turned: its turned glyphs between its points are its text, its turn theirs', () => {
    const pages = [page(['Method', { pt: 't0s' }, { turned: 'Accuracy' }, { pt: 't0e' }])]
    const units: OwnUnit[] = [{ kind: 'cell', pieces: [text(' Accuracy ')] }]
    const r = ownOf(pages, { units, turned: true })
    expect(r.units.get(0)?.unhidden).toBeNull()
    expect(r.units.get(0)?.turn).toEqual([0, 1])
    expect(r.stats.unhidden.spell).toBe(0)
    expect(r.stats.turned).toEqual({ units: 1, mixed: 0 })
    expect(turnedGroups(r)?.[0]).toEqual(Array(8).fill('u0'))
    // (no level glyph is the cell's: "Method" before its start point is no unit's)
    expect(r.glyphs[0]!.every((g) => g === null)).toBe(true)
  })
  it('owns a caption of a sideways float with its label: from TeX’s label point to its start, a label’s form', () => {
    const pages = [page([{ pt: 'ka1' }, { turned: 'Table 3: ' }, { pt: '0s' }, { turned: 'Runs of the second set' }, { pt: '0e' }])]
    const units: OwnUnit[] = [{ kind: 'caption', pieces: [text('Runs of the second set')] }]
    const r = ownOf(pages, { units, turned: true })
    expect(r.units.get(0)?.unhidden).toBeNull()
    expect(r.units.get(0)?.labelKept).toBe(false)
    const groups = turnedGroups(r)?.[0] ?? []
    expect(groups.slice(0, 9)).toEqual(Array(9).fill('u0.l'))
    expect(groups.slice(9).every((g) => g === 'u0')).toBe(true)
  })
  it('leaves a unit whose turned glyphs stand in two turns as it was, counted', () => {
    const pages = [page([{ pt: 't0s' }, { turned: 'Re' }, { turned: 'call', dir: [0, -1] }, { pt: 't0e' }])]
    const r = ownOf(pages, { units: [{ kind: 'cell', pieces: [text('Recall')] }], turned: true })
    expect(r.units.get(0)?.unhidden).toBe('spell')
    expect(r.units.get(0)?.turn).toBeUndefined()
    expect(r.stats.turned).toEqual({ units: 0, mixed: 1 })
    expect(turnedGroups(r)?.[0]?.every((g) => g === null)).toBe(true)
  })
  it('reads as before where the turned reading is not asked (today’s layout maker, which has no frame to lay a unit in)', () => {
    const pages = [page(['Method', { pt: 't0s' }, { turned: 'Accuracy' }, { pt: 't0e' }])]
    const r = ownOf(pages, { units: [{ kind: 'cell', pieces: [text(' Accuracy ')] }] })
    expect(r.units.get(0)?.unhidden).toBe('spell')
    expect(r.stats.turned).toEqual({ units: 0, mixed: 0 })
    expect(turnedGroups(r)?.[0]?.every((g) => g === null)).toBe(true)
  })
  it('reads a unit with level text as before: a turned glyph TeX set in its range (an axis title) is none of its', () => {
    // (a paragraph whose range holds a figure TeX set inside it, its y-axis title turned: the paragraph spells its level glyphs,
    // the title stays no unit's, the figure reading's)
    const pages = [page([{ pt: '0s' }, 'Some text', { turned: 'Loss' }, ' here', { pt: '0e' }])]
    const r = ownOf(pages, { units: [{ kind: 'para', pieces: [text('Some text here')] }], turned: true })
    expect(r.units.get(0)?.unhidden).toBeNull()
    expect(r.units.get(0)?.turn).toBeUndefined()
    expect(turnedGroups(r)?.[0]?.every((g) => g === null)).toBe(true)
  })
  it('owns a caption set turned with a reference inside it: the reference’s turned glyph between its points is its placeholder’s', () => {
    const pages = [page([{ pt: '0s' }, { turned: 'Steps of the run, Sect. ' }, { pt: 'p0.1a' }, { turned: '4' }, { pt: 'p0.1b' }, { pt: '0e' }])]
    const units: OwnUnit[] = [{ kind: 'caption', pieces: [text('Steps of the run, Sect. '), ph('\\ref{sec:run}')] }]
    const r = ownOf(pages, { units, turned: true })
    expect(r.units.get(0)?.unhidden).toBeNull()
    const groups = turnedGroups(r)?.[0] ?? []
    expect(groups.at(-1)).toBe('u0.p')
    expect(groups.slice(0, -1).filter((g) => g !== 'u0')).toEqual([])
  })
})

describe('a cell whose formula the marking leaves unmarked after a command that may look ahead (not built: another lane’s)', () => {
  it.fails('owns the cell: the formula’s glyph between the start point and the text after it is its placeholder’s', () => {
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
