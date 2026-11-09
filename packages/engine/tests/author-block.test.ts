// The author block under the title (src/locate/author-block.ts): what TeX sets after the title until it sets something of
// another kind, or, where the title is drawn inside a picture (a framed title box), the rest of that picture.
import { describe, expect, it } from 'vitest'
import { type BlockPage, authorBlockOf } from '../src/locate/author-block.ts'

const T = { kind: 'heading', title: true as const, front: true as const }
const SUB = { kind: 'heading', front: true as const }
const AU = { kind: 'author' }
const AF = { kind: 'affiliation' }
const ABS = { kind: 'abstract' }
const PARA = { kind: 'para' }
const NAME = { kind: 'name' }

/** a page of `owners` (a glyph's source unit, -1 none), its pictures (`pid`, glyph → picture), its forms, its graphics, its ink of
 *  the names and its lines (`lines`, glyph → its line: glyphs on one baseline; each its own where not given) */
const pageOf = (
  owners: number[],
  o: { pid?: (number | undefined)[]; form?: boolean[]; graphic?: number[]; names?: number[]; lines?: number[] } = {},
): BlockPage => ({
  n: owners.length,
  owner: (j) => owners[j] ?? -1,
  pid: (j) => o.pid?.[j],
  form: (j) => !!o.form?.[j],
  onLine: (j, k) => (o.lines ? o.lines[j] === o.lines[k] : j === k),
  graphicBefore: (j) => !!o.graphic?.includes(j),
  named: (j) => !!o.names?.includes(j),
})
const held = (b: ReturnType<typeof authorBlockOf>, n: number) =>
  Array.from({ length: n }, (_, j) => (b?.has(j) ? 1 : 0)).join('')

describe('the author block under the title', () => {
  it('runs from its first name to the first unit of another kind, the names, places and ink between them its own', () => {
    // (title 0-1, ink 2 (before the names), author 3, ink 4 ("and"), author 5, ink 6-7 (an affiliation no unit is), abstract 8-9)
    const units = [T, AU, AU, ABS]
    const b = authorBlockOf([pageOf([0, 0, -1, 1, -1, 2, -1, -1, 3, 3])], units)
    expect(b?.page).toBe(0)
    // (its ink: the glyphs no unit owns; its stretch, owned glyphs too, where the author block's units stand)
    expect(held(b, 10)).toBe('0000101100')
    expect([3, 5].every((j) => b!.within(j))).toBe(true)
    expect(b!.within(8)).toBe(false)
  })

  it('opens at its names where no unit of the block’s is set in it (a class macro’s own literal lines, 2610.22065v1)', () => {
    // (title 0-1, the names' literal line 2 (an ink unit of the names, its letters an author unit's words), places and notes 3-4)
    const b = authorBlockOf([pageOf([0, 0, -1, -1, -1, 1, 1], { names: [2] })], [T, NAME])
    expect(held(b, 7)).toBe('0011100')
    // (and none where nothing of it is told: no name, no unit of it)
    expect(held(authorBlockOf([pageOf([0, 0, -1, -1, -1, 1, 1])], [T, NAME]), 7)).toBe('0000000')
  })

  it('opens at its first name, a line the class sets between the title and the names not its own (arxiv.sty’s \\undertitle)', () => {
    const b = authorBlockOf([pageOf([0, -1, 1, -1, 2])], [T, AU, ABS])
    expect(held(b, 5)).toBe('00010')
    expect(b!.within(1)).toBe(false)
  })

  it('ends at a graphic no unit owns: an image, a rule, a form’s or a picture’s text (egpubl’s teaser, elsarticle’s \\hrule)', () => {
    // (author 1, ink 2, an image or a rule before glyph 3, what follows 3-4 no unit is (a caption, a heading), abstract 5)
    const b = authorBlockOf([pageOf([0, 1, -1, -1, -1, 2], { graphic: [3] })], [T, AU, ABS])
    expect(held(b, 6)).toBe('001000')
    const f = authorBlockOf(
      [pageOf([0, 1, -1, -1, -1, 2], { pid: [undefined, undefined, undefined, 4, undefined, undefined] })],
      [T, AU, ABS],
    )
    expect(held(f, 6)).toBe('001000')
    // (one a row of the block's sets, an icon before a link of its places, 2610.19159v1's GitHub logo: the block's)
    const icon = authorBlockOf([pageOf([0, 1, -1, 2, -1, 3], { graphic: [3] })], [T, AU, AF, ABS])
    expect(held(icon, 6)).toBe('001010')
  })

  it('ends before the next unit’s run-in label, the glyphs before it on its first line (JCAP’s “Abstract.”)', () => {
    // (author 2, ink 3-4 (an e-mail line); ink 5 ("Abstract.") on the abstract's first line, before it, 6-7)
    const b = authorBlockOf([pageOf([0, 0, 1, -1, -1, -1, 2, 2], { lines: [0, 0, 1, 2, 2, 3, 3, 3] })], [T, AU, ABS])
    expect(held(b, 8)).toBe('00011000')
  })

  it('takes nothing before the title, nor a unit of another kind’s ink after the block ends', () => {
    // (ink 0 before the title (a venue line), title 1, author 2, para 3 (a date), ink 4, abstract 5)
    const b = authorBlockOf([pageOf([-1, 0, 1, 2, -1, 3])], [T, AU, PARA, ABS])
    expect(held(b, 6)).toBe('000000')
    expect(b!.within(2)).toBe(true)
    expect(b!.within(4)).toBe(false)
  })

  it('takes a subtitle as the title’s, before any name', () => {
    const b = authorBlockOf([pageOf([0, 1, -1, 2, -1, 3])], [T, SUB, AU, ABS])
    expect(held(b, 6)).toBe('000010')
  })

  it('is the rest of the picture the title is drawn in, where it is drawn in one (a framed title box, 2604.14228v3)', () => {
    // (one picture 3 holds the title 0, the names 1, the abstract 2-3 and, after it, ink 4-5 (the correspondence line); ink 6
    // after the picture, a figure's picture 9 inside it at 7)
    const pid = [3, 3, 3, 3, 3, 3, undefined, 9]
    const b = authorBlockOf(
      [pageOf([0, 1, 2, 2, -1, -1, -1, -1], { pid, lines: [0, 1, 2, 3, 4, 4, 5, 6] })],
      [T, AU, ABS],
    )
    expect(held(b, 8)).toBe('00001100')
    expect(b!.within(1)).toBe(true)
    expect(b!.within(6)).toBe(false)
  })

  it('leaves inside a framed title box the run-in label of a unit of another kind that unit’s (alta’s “Abstract.”)', () => {
    // (one picture 3: the title 0, the names 1, ink 2 (an e-mail line); ink 3 ("Abstract.") on the abstract's first line, 4;
    // ink 5 ("Keywords:") on the keywords' unit's, 6)
    const pid = [3, 3, 3, 3, 3, 3, 3]
    const b = authorBlockOf(
      [pageOf([0, 1, -1, -1, 2, -1, 3], { pid, lines: [0, 1, 2, 3, 3, 4, 4] })],
      [T, AU, ABS, SUB],
    )
    expect(held(b, 7)).toBe('0010000')
  })

  it('is none where no title is located', () => {
    expect(authorBlockOf([pageOf([-1, 0, -1])], [AU])).toBeNull()
  })
})
