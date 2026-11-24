// B.tokens: a group TeX set in one box (SpanAt.box: the engine asked TeX, the call set in a paragraph of zero width, and TeX
// set it on one line) is one unbreakable run in the lay, as TeX cannot break inside an \hbox: its spaces are ties. With names
// shown, an author's name set in \mbox stays whole on its line (#679: "Adeen / Flinker"). Laid through layPage over hand-made
// parts, run-in.test.ts's metric: a space 0.25 em, any other Latin character 0.5 em. Words of our own.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

const em = (size: number, t: string) => [...t].reduce((s, ch) => s + size * (/[ .,]/u.test(ch) ? 0.25 : 0.5), 0)
const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => em(size, t),
  ink: (_f, size, t) => [0.7 * size, 0.2 * size, em(size, t)],
}
const id = 'b'.repeat(64)
type Content = Extract<Row, { ok: true }>['content']
/** a paragraph of three lines on a measure of 300 pt from x 72, at 10 pt on a 12 pt pitch, its group `1` stated a box or not */
const para = (box: boolean): Placed => ({
  ord: 0,
  kind: 'para',
  text: id,
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'l',
  lines: [0, 1, 2].map((k) => [1, 0, 72, 372, 700 - 12 * k, 707 - 12 * k, 698 - 12 * k, 72, 372, 0, 10]),
  room: { below: 40, next: 44 },
  spans: [['1', box ? { cmd: 'authorname', box: 1 } : { cmd: 'authorname' }]],
})
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: [[m]],
})
const rowsOf = (content: Content): Rows => {
  const r: Row = { id, ok: true, by: 'test', content }
  return { get: (k) => (k === id ? r : undefined), done: true }
}
/** each line's text as drawn */
const linesOf = (box: boolean): string[] =>
  layPage(
    part(para(box)),
    rowsOf([
      // (52 characters and a space, 266 pt: the name's first word fits on the line, its second does not)
      { t: 'text', s: `${'abcd '.repeat(10)}ab ` },
      { t: 'span', id: '1', content: [{ t: 'text', s: 'Adeen Flinker' }] },
      { t: 'text', s: ' and more words after it.' },
    ]),
    rulesFor('de'),
    metrics,
  ).members[0]!.lines.map((l) =>
    l[3]
      .map((it) => ('s' in it ? it.s : ''))
      .join('')
      .trim(),
  )

describe('a group TeX set in one box is laid unbroken', () => {
  it('the control: a group of no box breaks at its space', () => {
    const lines = linesOf(false)
    expect(lines.some((l) => l.endsWith('Adeen'))).toBe(true)
  })
  it('a box group moves whole to the next line', () => {
    const lines = linesOf(true)
    expect(lines.some((l) => l.endsWith('Adeen'))).toBe(false)
    expect(lines.some((l) => /Adeen\s*Flinker/.test(l))).toBe(true)
  })
})
