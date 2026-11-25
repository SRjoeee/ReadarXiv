// A size declaration at a unit's top level, no group around it, is drawn as TeX sets it: what follows it at its size, to the
// end of the group it stands in. A title and its subtitle in one \title (`A Title\\[4pt] \large a subtitle`, the class setting
// the title at \huge): the part states the unit's base at the title's size and the declaration's element the size its run's
// glyphs share (El.size, the element's statement where it is not the member's); the typesetter reads a bare declaration as its
// command (lay/read.ts srcOfEl) and applies a face's (B.tokens STYLE_CMDS), but no size's: every run was drawn at the member's
// one size, the subtitle as large as the title. RED until a declaration's stated size is drawn from it on. Laid through
// layPage over a hand-made part, the run-in test's metric. Words of our own.
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
const id = 'f'.repeat(64)
type Content = Extract<Row, { ok: true }>['content']
const TITLE = 'A Short Title'
const SUBTITLE = 'and its subtitle'
/** the title on its line at 20.66 pt, the subtitle under it at 11.96, centred on a measure from x 70 to 524; its forced break
 *  `1` and its `\large` `3`, the declaration's run stated at `size` (none: the part says nothing of it) */
const unit = (size: number | undefined): Placed => ({
  ord: 0,
  kind: 'heading',
  text: id,
  lead: 25,
  style: { role: 'sans', size: 20.6625, bold: 1, design: 'NimbusSanL-Bold' },
  align: 'c',
  lines: [
    [1, 0, 220, 374, 740, 755, 736, 70, 524, 0, 20.66],
    [1, 0, 250, 344, 700, 709, 698, 70, 524, 0, 11.96],
  ],
  room: { below: 30, next: 40 },
  els: [
    ['1', { kind: 'space', brk: 1, ink: [] }],
    ['3', { kind: 'zero', cmd: 'large', bare: 1, ink: [], ...(size !== undefined ? { size } : {}) }],
  ],
})
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusSanL-Bold', 100]] }, bases: 1 },
  flows: [[m]],
})
const content: Content = [
  { t: 'text', s: TITLE },
  { t: 'el', id: '1' },
  { t: 'text', s: '\n' },
  { t: 'el', id: '3' },
  { t: 'text', s: ` ${SUBTITLE}` },
]
const rows = (): Rows => {
  const r: Row = { id, ok: true, by: 'test', content }
  return { get: (k) => (k === id ? r : undefined), done: true }
}
/** the size each drawn run is drawn at, by its text */
const sizes = (m: Placed) => {
  const laid = layPage(part(m), rows(), rulesFor('de'), metrics).members[0]!
  expect(laid.state).toBe('laid')
  const runs = laid.lines.flatMap(([, , , items]) => items.flatMap((it) => ('src' in it ? [] : [it])))
  const at = (word: string) => runs.find((it) => it.s.includes(word))!.size
  return { title: at('Short'), subtitle: at('subtitle') }
}

describe('a size declaration at a unit’s top level is drawn at its stated size from where it stands', () => {
  it('the subtitle after `\\large` at 11.96 against the title’s 20.66', () => {
    const s = sizes(unit(11.9552))
    expect(Math.round((s.subtitle / s.title) * 1000) / 1000).toBe(Math.round((11.9552 / 20.6625) * 1000) / 1000)
  })
  it('a declaration the part states no size for leaves the run at the member’s size, as a part made before is laid', () => {
    const s = sizes(unit(undefined))
    expect(s.subtitle).toBe(s.title)
  })
})
