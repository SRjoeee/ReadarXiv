// The instrument adapter states what TeX set for a unit's groups that their source does not say (marks/faces.ts over the unit's
// text glyphs on B): the face TeX set a group in where its command names no style the tables know, and the stop TeX set at a
// group's end; then the unit's run-in labels `must` (marks/run-ins.ts), a group of such a face a style group. 2608.25210v2's
// heads are the paper's `\newcommand{\topic}[1]{\vspace{.5pt} \noindent{\bf #1.}}` (staging, 2026-11-09: back regular, the stop
// lost); words of our own.
import { describe, expect, it } from 'vitest'
import { marksOf, piecesOf, spansOf, textGlyphsOf } from '../../src/pdf-reader/engine/pipeline/instrument.mjs'

const BOLD = 'LinLibertineTB'
const REGULAR = 'LinLibertineT'
/** a text as TeX sets it: a glyph for each character that is no white space, in one font */
const set = (s: string, base: string) =>
  [...s].filter((c) => !/\s/.test(c)).map((u) => ({ u, base, size: 8.97, fill: -1 }))
const head = (open: string, text: string, after: string) => [
  { t: 'open', src: open },
  { t: 'text', s: text },
  { t: 'close', src: '}' },
  { t: 'text', s: after },
]

describe('a unit’s groups as TeX set them, stated by the adapter', () => {
  it('a paper’s macro TeX set bold with a stop of its own: its face and stop stated, a run-in head kept', () => {
    const pieces = head('\\topic{', 'Current methods are not reliable', '  \nTo infer the source, one could rank sentences.')
    const content = piecesOf(pieces) as { must?: number; style: string; stop?: string }[]
    const glyphs = [
      ...set('Current methods are not reliable.', BOLD),
      ...set('To infer the source, one could rank sentences.', REGULAR),
    ]
    const spans = marksOf(content, glyphs, spansOf(pieces))
    expect(content[0]).toMatchObject({ style: 'bold', must: 1, stop: '.' })
    expect(spans).toEqual([['0', { cmd: 'topic', style: { role: 'serif', size: 8.97, bold: 1, design: BOLD } }]])
  })
  it('as before where the macro is not read: no glyphs, the group no style group, nothing stated', () => {
    const pieces = head('\\topic{', 'Current methods are not reliable', '  \nTo infer the source.')
    const content = piecesOf(pieces) as { must?: number; style: string }[]
    expect(marksOf(content, [], spansOf(pieces))).toEqual([['0', { cmd: 'topic' }]])
    expect(content[0]).toMatchObject({ style: 'other' })
    expect(content[0]).not.toHaveProperty('must')
  })
  it('no face read for a group whose command the tables name (\\textbf), nor for a bare group a face switch opens: its switch its style and command', () => {
    const named = head('\\textbf{', 'Setup', '  \nWe use eight GPUs.')
    const c1 = piecesOf(named) as { must?: number; style: string }[]
    const g1 = [...set('Setup', BOLD), ...set('We use eight GPUs.', REGULAR)]
    expect(marksOf(c1, g1, spansOf(named))).toEqual([['0', { cmd: 'textbf' }]])
    expect(c1[0]).toMatchObject({ style: 'bold', must: 1 })
    // (a bare group a face switch opens: the switch its style and command, no element of its text (switchesOf); one with no
    // declaration of its own is no group, instrument-groups.test.ts)
    const bare = [{ t: 'text', s: 'It holds. ' }, { t: 'open', src: '{' }, { t: 'ph', src: '\\bfseries' }, { t: 'text', s: 'Remark' }, { t: 'close', src: '}' }, { t: 'text', s: ' it also holds.' }]
    const c2 = piecesOf(bare) as unknown[]
    expect(marksOf(c2, [...set('It holds.', REGULAR), ...set('Remark', BOLD), ...set('it also holds.', REGULAR)], spansOf(bare))).toEqual([['1', { cmd: 'bfseries' }]])
    expect(c2[1]).toMatchObject({ style: 'bold', content: [{ t: 'text', s: 'Remark' }] })
  })
  it('a paper’s macro TeX set in the face around it: nothing stated, no style group (\\revised{…} inside a sentence)', () => {
    const pieces = [{ t: 'text', s: 'One could leverage ' }, ...head('\\revised{', 'retrieval approaches', ' ranking them.')]
    const content = piecesOf(pieces) as unknown[]
    const glyphs = set('One could leverage retrieval approaches ranking them.', REGULAR)
    expect(marksOf(content, glyphs, spansOf(pieces))).toEqual([['1', { cmd: 'revised' }]])
    expect(content[1]).toMatchObject({ style: 'other' })
    expect(content[1]).not.toHaveProperty('stop')
  })
})

describe('a unit’s text glyphs on B, in stream order (the owners’ ROLE.text of the unit)', () => {
  it('takes each page’s glyphs the unit owns as text, its elements’ and its label’s aside', () => {
    const doc = { pages: [{ glyphs: [{ u: 'a' }, { u: 'b' }, { u: 'c' }] }, { glyphs: [{ u: 'd' }, { u: 'e' }] }] }
    const owners = [
      { unit: Int32Array.from([0, 0, 1]), role: Uint8Array.from([1, 2, 1]), piece: Int32Array.from([-1, 3, -1]) },
      { unit: Int32Array.from([0, 0]), role: Uint8Array.from([4, 1]), piece: Int32Array.from([-1, -1]) },
    ]
    const by = textGlyphsOf(doc, owners)
    expect(by.get(0)?.map((g: { u: string }) => g.u)).toEqual(['a', 'e'])
    expect(by.get(1)?.map((g: { u: string }) => g.u)).toEqual(['c'])
  })
})
