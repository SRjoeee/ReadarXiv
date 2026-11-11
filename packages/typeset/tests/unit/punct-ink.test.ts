// A full-width mark's blank half is the face's that draws it (script.ts markOf, data/marks.ts; docs/PDF-READER.md §18.47): the
// ink of each CJK face's own glyph, measured in the very files the reader draws (lab/typeset/marks-data.py), never a class by
// character. The owner's staging case (2611.03953v2 p13, 2026-11-12): in Japanese the colon of "粒度：144" lost half its em to
// the compression, and Harano Aji Mincho draws it in the middle of its em, so the digits after it stood on its ink; Source Han
// Serif TC draws its comma, full stop and colon in the middle too. Laid through layPage over a hand-made part, a metric of whole
// ems: a CJK character 1 em, a digit 0.5 em.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { markOf } from '../../src/breaker/script.ts'
import { FACES } from '../../src/data/faces.ts'
import { MARK_INK, MARK_SOURCES } from '../../src/data/marks.ts'
import { layPage } from '../../src/lay/entry.ts'
import { rulesFor } from '../../src/rules-for.ts'
import type { Metrics, Rows } from '../../src/types.ts'

const classes = (id: string, marks: string) => [...marks].map((ch) => markOf(ch, [id]))

describe('the marks’ measure', () => {
  it('holds every CJK face of the catalogue, measured in the files the engine binds', () => {
    const cjk = Object.keys(FACES).filter((id) => /^axt-(shs-|mincho$|fandolkai$|bkai00mp$)/.test(FACES[id]!.family))
    expect(Object.keys(MARK_INK).sort()).toEqual(cjk.sort())
    // (each file's SHA-256 the engine's binding one: rules/font-coverage.mjs METRICS, read as the generator reads it)
    const coverage = readFileSync(
      join(import.meta.dirname, '../../../../src/pdf-reader/engine/rules/font-coverage.mjs'),
      'utf8',
    )
    const bound = Object.fromEntries(
      [...coverage.matchAll(/'([a-z0-9-]+)': Object\.freeze\(\{ unitsPerEm: [^}]*?sha256: '([0-9a-f]{64})' \}\)/g)].map(
        (m) => [m[1], m[2]],
      ),
    )
    for (const [id, sha] of Object.entries(MARK_SOURCES)) expect([id, sha]).toEqual([id, bound[id]])
  })
  it('gives a mark the blank half its face draws no ink in, and none where its ink crosses the middle', () => {
    // (Simplified: every mark in one half; Traditional: the comma, stops, colon, semicolon and marks of exclamation and question
    // in the middle, the brackets one-sided; Harano Aji Mincho and Source Han Serif K: the colon, semicolon, exclamation and
    // question marks in the middle, the comma and stops in the first half)
    const marks = '、。，．：；！？（）「」“”'
    expect(classes('shs-sc-regular', marks)).toEqual([
      ...Array(8).fill('close'),
      'open',
      'close',
      'open',
      'close',
      'open',
      'close',
    ])
    expect(classes('shs-tc-regular', marks)).toEqual([
      ...Array(8).fill(null),
      'open',
      'close',
      'open',
      'close',
      'open',
      'close',
    ])
    expect(classes('haranoaji-regular', marks)).toEqual([
      ...Array(4).fill('close'),
      ...Array(4).fill(null),
      'open',
      'close',
      'open',
      'close',
      null,
      null,
    ])
    expect(classes('shs-k-regular', marks)).toEqual([
      ...Array(4).fill('close'),
      ...Array(4).fill(null),
      'open',
      'close',
      'open',
      'close',
      null,
      null,
    ])
    // (a bold face its own: the same classes)
    expect(classes('haranoaji-bold', marks)).toEqual(classes('haranoaji-regular', marks))
  })
  it('reads the first measured face of a run’s faces, and nothing of an alphabet’s', () => {
    expect(markOf('：', ['shs-tc-regular', 'shs-sc-regular'])).toBe(null)
    expect(markOf('：', ['nimbus-roman-regular', 'shs-sc-regular'])).toBe('close')
    expect(markOf('“', ['nimbus-roman-regular'])).toBe(null)
    expect(markOf('：', undefined)).toBe(null)
    expect(markOf('字', ['shs-sc-regular'])).toBe(null)
  })
})

const CJK = /[⺀-鿿　-〿＀-￯]/u
const metrics: Metrics = {
  ready: () => true,
  advance: (_f, size, t) => [...t].reduce((s, ch) => s + size * (CJK.test(ch) ? 1 : 0.5), 0),
  ink: (_f, size, t) => [0.7 * size, 0.2 * size, [...t].reduce((s, ch) => s + size * (CJK.test(ch) ? 1 : 0.5), 0)],
}
const id = 'c'.repeat(64)
/** a paragraph of five lines on a measure of 100 pt from x 72, at 10 pt on a 12 pt pitch, and no room under it */
const para: Placed = {
  ord: 0,
  kind: 'paragraph',
  text: id,
  lead: 12,
  style: { role: 'serif', size: 10, design: 'NimbusRomNo9L-Regu' },
  align: 'j',
  lines: [0, 1, 2, 3, 4].map((k) => [1, 0, 72, 172, 700 - 12 * k, 707 - 12 * k, 698 - 12 * k, 72, 172, 0, 10]),
  room: { below: 0, next: 0 },
}
const part: Part = { format: 1, page: 1, paper: { faces: { fonts: [['NimbusRomNo9L-Regu', 100]] } }, flows: [[para]] }
const rowsOf = (s: string): Rows => {
  const r: Row = { id, ok: true, by: 'test', content: [{ t: 'text', s }] }
  return { get: (k) => (k === id ? r : undefined), done: true }
}
/** each colon's box as laid: from its place to the next item's, em of the line's size */
const colonBoxes = (tag: string) => {
  const m = layPage(part, rowsOf('粒度：4'.repeat(16)), rulesFor(tag), metrics).members[0]!
  const f = m.fit!.size
  const out: number[] = []
  for (const [, , , items] of m.lines)
    items.forEach((it, k) => {
      if (!('src' in it) && it.s.endsWith('：') && items[k + 1])
        out.push(+((items[k + 1]!.x - (it.x + (it.dx?.at(-1) ?? 0))) / f).toFixed(3))
    })
  return out
}

describe('a crowded paragraph’s colons (2611.03953v2 p13: "粒度：144")', () => {
  it('keeps a colon Harano Aji Mincho draws in the middle of its em whole, where Simplified’s loses its blank half', () => {
    // (sixteen "粒度：4" are 56 em at a whole colon, 48 at half: past the five lines' 50 em at the first state, so the fit
    // compresses the marks as far as the rules let it, every mark that has a blank half losing it)
    const ja = colonBoxes('ja'),
      zh = colonBoxes('zh')
    expect(ja.length).toBeGreaterThan(8)
    expect(zh.length).toBeGreaterThan(8)
    expect(Math.min(...ja)).toBeGreaterThan(0.9)
    expect(Math.max(...zh)).toBeLessThan(0.6)
  })
})
