// A size declaration's run through the whole way a translation takes (docs/PDF-READER.md §18.116): the source reader's unit of a
// title (packages/engine sourceUnitsOf), the production wires (the tags wire, Google's and Chrome's codec; the markers wire,
// Microsoft's reader), each read back from an echo of what it sent, and the typesetter laying the row with the part stating the
// declaration's size (El.size). A declaration is silent (contract.ts `silent`: it goes on no wire): beside a placeholder that
// goes as a tag or a marker it rides in it and comes back in its place (`\\[4pt] \large`, 2609.40181v2's title); with text on
// both sides and no such neighbour it comes back at its group's end (the review of #682), its run then empty and the subtitle
// drawn at the title's size. Over the lab's 245 papers no size or face declaration stands so (each opens its group or stands
// beside a placeholder; 7 colour switches of 2 papers do): the second case is recorded as an expected failure, left for later.
// Words of our own.
import { describe, expect, it } from 'vitest'
import type { Part, Placed, Row, Unit } from '@readarxiv/format'
import { openPaper } from '../../packages/engine/src/compile/live.ts'
import { sourceUnitsOf } from '../../packages/engine/src/front.ts'
import { unitInOf } from '../../packages/translate/src/bundle.ts'
import { readMicrosoft } from '../../packages/translate/src/adapters/microsoft.ts'
import { tagsWire } from '../../packages/translate/src/adapters/google.ts'
import { planMarkers } from '../../packages/translate/src/wire/markers.ts'
import { layPage } from '../../packages/typeset/src/lay/entry.ts'
import { rulesFor } from '../../packages/typeset/src/rules-for.ts'
import type { Metrics } from '../../packages/typeset/src/types.ts'

const em = (size: number, t: string) => [...t].reduce((s, ch) => s + size * (/[ .,]/u.test(ch) ? 0.25 : 0.5), 0)
const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => em(size, t),
  ink: (_f, size, t) => [0.7 * size, 0.2 * size, em(size, t)],
}
const enc = (s: string) => new TextEncoder().encode(s)
/** the title unit the source reader cuts from a paper whose \title is `title` */
const titleOf = (title: string): Unit => {
  const tex = `\\documentclass{article}\n\\title{${title}}\n\\author{Ann Lee}\n\\begin{document}\n\\maketitle\nWords of the body.\n\\end{document}\n`
  const unit = sourceUnitsOf(openPaper(new Map([['main.tex', enc(tex)]]))).find((u) => u.kind === 'heading')
  if (!unit) throw new Error('no title unit')
  return unit
}
type Content = Extract<Row, { ok: true }>['content']
/** the row each production wire gives back from an echo of what it sent */
const wires: [string, (u: Unit) => Content | undefined][] = [
  [
    'tags',
    (u) => {
      const ui = unitInOf(u)
      return tagsWire.read(ui, tagsWire.write(ui))?.content as Content | undefined
    },
  ],
  [
    'markers',
    (u) => {
      const ui = unitInOf(u)
      return readMicrosoft(ui, JSON.stringify({ text: planMarkers(ui).wire }))?.content as Content | undefined
    },
  ],
]
/** the unit laid as the part states it (the title at 20.66, the subtitle's declaration at 11.96, El.size) with the row given:
 *  the size the subtitle's words are drawn at over the title's */
const ratioOf = (u: Unit, content: Content): number => {
  const els: NonNullable<Placed['els']> = []
  for (const p of u.content)
    if (p.t === 'el')
      els.push(
        p.kind === 'break'
          ? [p.id, { kind: 'space', brk: 1, ink: [] }]
          : [p.id, { kind: 'zero', cmd: 'large', bare: 1, ink: [], size: 11.9552 }],
      )
  const m: Placed = {
    ord: 0,
    kind: 'heading',
    text: u.id,
    lead: 25,
    style: { role: 'sans', size: 20.6625, bold: 1, design: 'NimbusSanL-Bold' },
    align: 'c',
    lines: [
      [1, 0, 150, 444, 740, 755, 736, 70, 524, 0, 20.66],
      [1, 0, 220, 374, 700, 709, 698, 70, 524, 0, 11.96],
    ],
    room: { below: 30, next: 40 },
    els,
  }
  const part: Part = { format: 1, page: 1, paper: { faces: { fonts: [['NimbusSanL-Bold', 100]] }, bases: 1 }, flows: [[m]] }
  const row: Row = { id: u.id, ok: true, by: 'echo', content }
  const laid = layPage(part, { get: (k) => (k === u.id ? row : undefined), done: true }, rulesFor('de'), metrics).members[0]!
  expect(laid.state).toBe('laid')
  const runs = laid.lines.flatMap(([, , , items]) => items.flatMap((it) => ('src' in it ? [] : [it])))
  const at = (w: string) => runs.find((it) => it.s.includes(w))!.size
  return Math.round((at('subtitle') / at('Title')) * 1000) / 1000
}
const LARGE = Math.round((11.9552 / 20.6625) * 1000) / 1000

describe('a size declaration’s run through the source reader, the production wires and the lay', () => {
  for (const [name, read] of wires) {
    it(`${name}: a declaration beside the title's forced break rides in its placeholder: the subtitle at its size`, () => {
      const u = titleOf('Main Title of Ours\\\\[4pt] \\large and a subtitle of ours')
      expect(ratioOf(u, read(u)!)).toBe(LARGE)
    })
    it.fails(`${name}: a declaration between two texts, no placeholder beside it, comes back at the group's end (left for later)`, () => {
      const u = titleOf('Main Title of Ours \\large and a subtitle of ours')
      expect(ratioOf(u, read(u)!)).toBe(LARGE)
    })
  }
})
