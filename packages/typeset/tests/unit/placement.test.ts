// Where layPage sets a member's lines on arXiv's page, over hand-made parts modelled on the maintainer's cases of 2026-11-08
// (staging, 2303.11366v4 p1 and 1706.03762v7 p10): a translation set in fewer lines than its original keeps its first line
// on the original's first baseline, the block anchored at its top as the original's is (the title, a section heading).
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => (size * [...t].length) / 2,
  ink: () => [0.7, 0.2, 0],
}
const rules = rulesFor('de')
const idOf = (n: number) => n.toString(16).padStart(64, '0')
const partOf = (flows: Placed[][]): Part => ({
  format: 1,
  page: 1,
  paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } },
  flows,
})
const rowsOf = (list: [number, string][]): Rows => {
  const by = new Map<string, Row>(
    list.map(([n, s]) => [idOf(n), { id: idOf(n), ok: true, by: 'test', content: [{ t: 'text', s }] }]),
  )
  return { get: (k) => by.get(k), done: true }
}
const laidOf = (p: ReturnType<typeof layPage>, ord: number) => p.members.find((m) => m.ord === ord)!

describe('a translation set in fewer lines than its original', () => {
  // (2303.11366v4 p1's title: two centred lines between two rules, its translation one line)
  const title: Placed = {
    ord: 0,
    kind: 'heading',
    text: idOf(1),
    lead: 19.92,
    style: { role: 'serif', size: 17.2154, bold: 1, design: 'NimbusRomNo9L-Medi' },
    align: 'c',
    lines: [
      [1, 2, 183.78, 428.22, 678.95, 690.85, 675.41, 108, 504, 0, 17.22],
      [1, 2, 188.95, 422.43, 659.03, 670.92, 655.48, 108, 504, 0, 17.22],
    ],
    room: { below: 15.35, next: 55.76, side: [108, 504] },
  }
  it("keeps the title's first line on the original's first baseline (the maintainer's 2303.11366v4 p1)", () => {
    const p = layPage(partOf([[title]]), rowsOf([[1, 'Reflexion: Sprachagenten']]), rules, metrics)
    const laid = laidOf(p, 0)
    expect(laid.state).toBe('laid')
    expect(laid.lines.length).toBe(1)
    expect(laid.lines[0]![0]).toBeCloseTo(678.95, 2)
  })
  it("keeps a section heading's first line on the original's first baseline too: every unit is anchored at its top", () => {
    const heading: Placed = {
      ...title,
      ord: 3,
      text: idOf(2),
      align: 'l',
      style: { role: 'serif', size: 11.9552, bold: 1, design: 'NimbusRomNo9L-Medi' },
      lines: [
        [1, 0, 108, 480, 600, 609, 597, 108, 504, 0, 11.96],
        [1, 0, 108, 300, 585.65, 594.65, 582.65, 108, 504, 0, 11.96],
      ],
      room: { below: 18, next: 26, side: [108, 504] },
    }
    const p = layPage(partOf([[heading]]), rowsOf([[2, 'Einleitung kurz']]), rules, metrics)
    const laid = laidOf(p, 3)
    expect(laid.lines.length).toBe(1)
    expect(laid.lines[0]![0]).toBeCloseTo(600, 2)
  })
})

describe('a URL TeX set whole on one line, its crop the original’s ink', () => {
  // (2303.11366v4 p1's abstract: "… datasets at https://github.com/noahshinn024/reflexion." The translation's line before the URL
  // was letter-spaced to its measure, the URL whole on the next; TeX's url package breaks it at its break points, El.breaks)
  const url: Placed = {
    ord: 2,
    kind: 'para',
    text: idOf(3),
    lead: 12,
    style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
    align: 'j',
    lines: [
      [1, 0, 72, 300, 700, 707, 698, 72, 300, 0, 10],
      [1, 0, 72, 296, 688, 695, 686, 72, 300, 0, 10],
    ],
    els: [
      [
        '1',
        {
          kind: 'other',
          cmd: 'url',
          literal: 1,
          copy: 'https://a.io/abcdefgh/ij',
          text: 'https://a.io/abcdefgh/ij',
          style: { role: 'mono', size: 10, design: 'SFTT1000' },
          ink: [[1, 72, 686, 292, 695, 688]],
          breaks: [
            [120, 8],
            [174, 13],
          ],
        },
      ],
    ],
    room: { below: 20, next: 24, side: [72, 300] },
  }
  const rows: Rows = {
    get: (k) =>
      k === idOf(3)
        ? {
            id: idOf(3),
            ok: true,
            by: 'test',
            content: [
              { t: 'text', s: 'Wir veroeffentlichen es unter ' },
              { t: 'el', id: '1' },
              { t: 'text', s: '.' },
            ],
          }
        : undefined,
    done: true,
  }
  it('breaks the URL at the last of its break points that fits the line, its crop cut between two glyphs there', () => {
    const p = layPage(partOf([[url]]), rows, rules, metrics)
    const laid = laidOf(p, 2)
    expect(laid.state).toBe('laid')
    const crops = laid.lines.map((l) => l[3].filter((it) => 'src' in it).map((it) => (it as { src: number[] }).src))
    // (its head ends the first line at 120, between "https://" and "a.io"; its tail opens the second)
    expect(crops[0]!.length).toBe(1)
    expect(crops[0]![0]![3]).toBeCloseTo(120, 5)
    expect(crops[1]![0]![1]).toBeCloseTo(120, 5)
    expect(crops[1]![0]![3]).toBeCloseTo(292.4, 5)
    // (the cut edges said, which the reader draws with no antialiased margin: the next glyph's ink is a fraction of a point off)
    const cuts = laid.lines.map((l) => l[3].filter((it) => 'src' in it).map((it) => (it as { cut?: number }).cut))
    expect(cuts).toEqual([[2], [1]])
  })
})
