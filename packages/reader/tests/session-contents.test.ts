// The contents and the heading being read, as today's (R engine/view/contents.mjs, outline.ts; PDF-READER §6.3, §11.8): the
// paper's headings, the title left out, three levels ranked among the depths it uses; each at its member's first line once a
// part places it, else the head's outline's page, else the original's outline's; titled by its row once taken; the heading read
// the last at or above the reading line.
import type { Placed, Row, Unit } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { createContents, listedOf, type OutlineDoc, plainOf } from '../src/session/contents.ts'

const id = (c: string) => c.repeat(64)
const unit = (c: string, kind: string, s: string, depth?: number): Unit => ({
  id: id(c),
  kind,
  content: [{ t: 'text', s }],
  ...(depth === undefined ? {} : { depth }),
})
const UNITS: Unit[] = [
  unit('0', 'heading', 'A Paper Title'),
  unit('1', 'author', 'A. Author'),
  unit('2', 'abstract', 'We study things.'),
  unit('3', 'heading', '1 Introduction', 1),
  unit('4', 'para', 'Text.'),
  unit('5', 'heading', '1.1 Setup', 2),
  unit('6', 'heading', 'Proof.'),
  unit('7', 'heading', '2 Method', 1),
  unit('8', 'heading', '2.1.1 Deep', 3),
  unit('9', 'heading', 'Deeper', 4),
]
/** the located headings, by member: Introduction (ord 3, page 1), Method (ord 9, page 2) */
const HEAD = {
  outline: [
    [3, 1, id('3')],
    [9, 2, id('7')],
  ] as [number, number, string][],
}
const placed = (ord: number, line: number[]): Placed =>
  ({ ord, kind: 'heading', text: id('3'), lines: [line] }) as unknown as Placed
const row = (c: string, s: string): Row => ({ id: id(c), ok: true, content: [{ t: 'text', s }], by: 'x' })

describe('the contents', () => {
  it('lists the headings, the title and those with no depth left out, three levels ranked among the depths used', () => {
    const c = createContents(UNITS, HEAD)
    expect(c.entries()).toEqual([
      { id: 0, title: '1 Introduction', original: '1 Introduction', level: 1, page: 1 },
      { id: 1, title: '1.1 Setup', original: '1.1 Setup', level: 2, page: null },
      { id: 2, title: '2 Method', original: '2 Method', level: 1, page: 2 },
      { id: 3, title: '2.1.1 Deep', original: '2.1.1 Deep', level: 3, page: null },
    ])
    // (a paper whose headings have no depth: flat, the front matter's left out)
    const flat = listedOf(UNITS.map(({ depth: _d, ...u }) => u as Unit))
    expect(flat.map((u) => plainOf(u.content))).toEqual([
      '1 Introduction',
      '1.1 Setup',
      'Proof.',
      '2 Method',
      '2.1.1 Deep',
      'Deeper',
    ])
  })
  it("places a heading at its member's first line once its part is read", () => {
    const c = createContents(UNITS, HEAD)
    // (a line: page, column, x0, x1, baseline, top, bottom, …)
    expect(c.place([placed(3, [1, 0, 72, 300, 700, 712, 698, 72, 300, 0])])).toBe(true)
    expect(c.firstRect(0)).toEqual([1, 72, 698, 300, 712])
    expect(c.place([placed(3, [1, 0, 0, 0, 0, 0, 0, 0, 0, 0])])).toBe(false)
    expect(c.pageOf(0)).toBe(1)
  })
  it('titles a heading by its row once taken, the source again where its row is no translation or is let go', () => {
    const c = createContents(UNITS, HEAD)
    expect(c.take([row('3', '1 Einleitung'), row('4', 'Text auf Deutsch.')])).toBe(true)
    expect(c.entries()[0]).toMatchObject({ title: '1 Einleitung', original: '1 Introduction' })
    expect(c.take([row('3', '1 Einleitung')])).toBe(false)
    expect(c.take([{ id: id('3'), ok: false, why: { kind: 'refused' } }])).toBe(true)
    expect(c.entries()[0]?.title).toBe('1 Introduction')
    c.take([row('7', '2 Methode')])
    expect(c.clearTexts()).toBe(true)
    expect(c.entries()[2]?.title).toBe('2 Method')
  })
  it("gives a heading the head does not place the page the original's own outline gives it, matched in order by title", async () => {
    const c = createContents(UNITS, HEAD)
    const doc: OutlineDoc = {
      getOutline: async () => [
        { title: 'Introduction', dest: [0] },
        { title: 'Setup', dest: 'sec:setup', items: [{ title: 'Deep', dest: [{ num: 7 }] }] },
      ],
      getDestination: async () => [{ num: 5 }],
      getPageIndex: async (r) => ((r as { num: number }).num === 5 ? 1 : 3),
    }
    expect(await c.outline(doc)).toBe(true)
    expect(c.entries().map((e) => e.page)).toEqual([1, 2, 2, 4])
  })
  it('the heading being read: the last at or above the reading line of the pane read, null before the first', () => {
    const c = createContents(UNITS, HEAD)
    c.place([placed(3, [1, 0, 72, 300, 700, 712, 698, 72, 300, 0])])
    // (the Introduction's top a fifth down page 1)
    const topOf = () => 0.2
    expect(c.headingAt(1, 0.1, topOf)).toBeNull()
    expect(c.headingAt(1, 0.3, topOf)).toBe(0)
    // (a heading with a page and no line placed is at its page's top: Method on page 2)
    expect(c.headingAt(2, 0, topOf)).toBe(2)
    expect(c.headingAt(5, 0.5, topOf)).toBe(2)
    // (a top that cannot be told counts as read)
    expect(c.headingAt(1, 0.1, () => null)).toBe(0)
  })
})
