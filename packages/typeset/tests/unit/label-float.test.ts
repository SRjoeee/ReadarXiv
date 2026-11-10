// A caption's label drawn by its float's type (the owner's ruling of 2026-11-08: "table and fig need not be translated, but
// it must be uniform"; the target's word everywhere, the number as printed): where the part states the type (Label.float,
// LaTeX's \@captype), a figure's or a table's label is the rules' word for it and its number and punctuation as TeX printed
// them, whatever the number's spelling ("Table A1", "Figure S3", IEEEtran's "TABLE I"); a label of any other type (an
// algorithm's, a sub-figure's "(a)") stays the original's; and where its parts do not hold its every glyph, it stays the
// original's too. A part that states no type is read by the label's spelling, as before (today's labelInTarget).
import type { Ink, Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

const metrics = (): Metrics => ({
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
})
const rules = rulesFor('de')
const id = 'a'.repeat(64)
/** a part's word of a label at x0, 5 pt a character */
const at = (s: string, x0: number): [string, Ink] => [s, [1, x0, 698, x0 + 5 * s.length, 707, 700]]
/** a caption whose label's parts are `parts` (name, num, punct, in order, a space between the name and the number), of float
 *  type `float`; `ink` its label's ink where it is not its parts' */
const caption = (parts: [string, string?, string?], float?: string, ink?: Ink): Placed => {
  const name = at(parts[0], 72)
  const num = parts[1] !== undefined ? at(parts[1], name[1][3] + 3) : undefined
  const punct = parts[2] !== undefined ? at(parts[2], (num ?? name)[1][3]) : undefined
  const end = (punct ?? num ?? name)[1][3]
  return {
    ord: 0,
    kind: 'caption',
    text: id,
    lead: 12,
    style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
    align: 'j',
    lines: [[1, 0, 72, 400, 700, 707, 698, 72, 400, 0, 10]],
    room: { below: 20, next: 24 },
    label: {
      kind: 'float',
      ink: ink ?? [1, 72, 698, end, 707, 700],
      style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
      name,
      ...(num ? { num } : {}),
      ...(punct ? { punct } : {}),
      ...(float ? { float } : {}),
    },
  }
}
const part = (m: Placed): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows: [[m]],
})
const row: Row = { id, ok: true, by: 'test', content: [{ t: 'text', s: 'Die Ergebnisse der Modelle.' }] }
const rows: Rows = { get: (k) => (k === id ? row : undefined), done: true }
/** what the caption's laid lines draw as text, in order */
const drawn = (m: Placed) => {
  const [laid] = layPage(part(m), rows, rules, metrics()).members
  expect(laid!.state).toBe('laid')
  return laid!.lines
    .flatMap((l) => l[3])
    .map((it) => ('face' in it ? it.s : ''))
    .join('')
}

describe('a caption’s label drawn by its float’s type (Label.float)', () => {
  it('names a figure or a table in the target’s word, its number as printed, whatever the number’s spelling', () => {
    // (2610.11256v1's "Table A1:", 2610.16663v1's "Figure S3", kept by the spelling of their numbers beside "Table 1"
    // relabelled; IEEEtran's "TABLE I." in capitals)
    expect(drawn(caption(['Table', 'A1', ':'], 'table'))).toMatch(/^Tabelle A1:/)
    expect(drawn(caption(['Figure', 'S3', '.'], 'figure'))).toMatch(/^Abbildung S3\./)
    expect(drawn(caption(['TABLE', 'I', '.'], 'table'))).toMatch(/^TABELLE I\./)
    expect(drawn(caption(['Fig', '7'], 'figure'))).toMatch(/^Abbildung 7/)
  })
  it('keeps the label of any other type as the original’s, and one whose parts do not hold its every glyph', () => {
    expect(drawn(caption(['Algorithm', '1', ':'], 'algorithm'))).not.toMatch(/Algorithm|Abbildung/)
    expect(drawn(caption(['a', undefined, ')'], 'subfigure'))).not.toMatch(/Abbildung/)
    // (2609.26457v1's "Figure 1": its number set in glyphs no part of its label states, the label's ink past its name)
    expect(drawn(caption(['Figure'], 'figure', [1, 72, 698, 112, 707, 700]))).not.toMatch(/Abbildung/)
  })
  it('reads a label of a part that states no type by its spelling, as before', () => {
    expect(drawn(caption(['Table', '2', ':']))).toMatch(/^Tabelle 2:/)
    expect(drawn(caption(['Table', 'A1', ':']))).not.toMatch(/Tabelle/)
  })
})

describe('a caption’s label on a line of its own (Label with no line: IEEEtran’s TABLE I above its text)', () => {
  // (the marked compile tells the caption's label by TeX's call wherever it stands (own.mjs MR 5); the part states it on none of
  // the caption's lines and that line's own alignment (Label.align). Its relabel is laid as a row of its own on its own baseline,
  // at its place, aligned as TeX set that line, in the label's size; the caption's first line stays where TeX put it)
  /** IEEEtran's table caption: "TABLE I" centred at 697..731 on baseline 712, its text on the line under it */
  const own = (align: 'l' | 'c' | 'r'): Placed => {
    const m = caption(['Accuracy'], 'table')
    const name: [string, Ink] = ['TABLE', [1, 697, 710, 722, 719, 712]]
    const num: [string, Ink] = ['I', [1, 725, 710, 731, 719, 712]]
    return {
      ...m,
      align: 'c',
      label: {
        kind: 'float',
        ink: [1, 697, 710, 731, 719, 712],
        style: m.label!.style,
        name,
        num,
        float: 'table',
        align,
      },
    }
  }
  const laidLines = (m: Placed) => {
    const [laid] = layPage(part(m), rows, rules, metrics()).members
    expect(laid!.state).toBe('laid')
    return laid!.lines.map(([y, x0, x1, items]) => ({
      y,
      x0,
      x1,
      s: items.map((it) => ('face' in it ? it.s : '')).join(''),
    }))
  }
  it('lays its relabel on its own baseline, centred where TeX centred it, and no label before the text', () => {
    const lines = laidLines(own('c'))
    const label = lines.find((l) => l.y === 712)
    expect(label?.s).toBe('TABELLE I')
    // (centred on the original label's middle, 714, as TeX centred that line)
    expect(Math.abs((label!.x0 + label!.x1) / 2 - 714)).toBeLessThan(0.01)
    // (the caption's own line: its text alone, where TeX set it)
    const text = lines
      .filter((l) => l.y === 700)
      .map((l) => l.s)
      .join('')
    expect(text).not.toMatch(/TABELLE/)
    expect(text).toMatch(/^Die Ergebnisse/)
  })
  it('sets the row flush left or flush right as its own line was, never as its unit', () => {
    expect(laidLines(own('l')).find((l) => l.y === 712)!.x0).toBe(697)
    expect(laidLines(own('r')).find((l) => l.y === 712)!.x1).toBe(731)
  })
})
