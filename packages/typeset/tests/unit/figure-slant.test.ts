// A figure text set in italic is drawn slanted in a CJK target: its CJK runs in a face that states the synthetic italic
// (breaker/faces.ts faceOf: `oblique`, CJK_SLANT_DEG), each item the drawing receives skewed by it, as the names path
// (lay/entry.ts) and the displays (emit/display.ts) state it. Codex's P2 at 225f0959f (verification/open-items R07): the
// figure path pushed its items without the skew, so an italic label's Japanese or Korean words stood upright.
import type { Part, Placed, Row } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { CJK_SLANT_DEG, rolesFor } from '../../src/breaker/faces.ts'
import type { TextItem } from '../../src/emit/display.ts'
import { figuresOf } from '../../src/lay/figures.ts'
import type { PaperReading } from '../../src/lay/read.ts'
import type { Metrics, RuleParams, Rows } from '../../src/types.ts'

const metrics: Metrics = {
  ready: () => true,
  // (each character 50 at 100 px: half its size)
  advance: (_f, size, text) => (50 * [...text].length * size) / 100,
  ink: () => [70, 20, 0],
} as Metrics
const member = (slant: 1 | undefined, turned = false): Placed =>
  ({
    ord: 7,
    kind: 'figure',
    text: 'u7',
    plain: 'Overview of the method',
    lines: [[1, 0, 100, 220, 200, 208, 198, 100, 220]],
    style: { role: 'serif', size: 10, ...(slant ? { slant } : {}) },
    room: { side: [60, 400] },
    align: 'l',
    ...(turned ? { dir: [0, 1], run: [100, 200, 120, 40, 180] } : {}),
  }) as unknown as Placed
const rowsOf = (s: string): Rows =>
  ({ get: () => ({ ok: true, content: [{ t: 'text', s }] }) as unknown as Row }) as unknown as Rows
const R = { cjkQuotes: true, floorMin: 0.6, centredPunct: false, compressMax: 2 } as RuleParams
const itemsOf = (target: string, group: string, s: string, m: Placed) => {
  const paper = {
    designs: { serif: 'times', sans: 'helvetica', mono: 'courier' },
    roles: rolesFor(target, 'times', { group }),
  } as unknown as PaperReading
  const got = figuresOf({ page: 1, ties: [] } as unknown as Part, [m], rowsOf(s), { paper, R, metrics })
  return (got.laid.get(7)?.[0]?.[3] ?? []) as TextItem[]
}
const slants = (items: TextItem[]) => items.map((it) => [it.s, it.skew ?? 0, it.slant ?? 0])

describe("a figure text's italic in a CJK target", () => {
  it('skews the CJK runs of an italic label by the face’s slant, its Latin run in its italic face unskewed', () => {
    expect(slants(itemsOf('ja', 'haranoaji', '手法の概要 LLM', member(1)))).toEqual([
      ['手法の概要', 1, CJK_SLANT_DEG],
      [' LLM', 0, 0],
    ])
    // (Korean's space between words is a Latin run: its italic face, no skew)
    expect(slants(itemsOf('ko', 'shs-k', '방법 개요', member(1)))).toEqual([
      ['방법', 1, CJK_SLANT_DEG],
      [' ', 0, 0],
      ['개요', 1, CJK_SLANT_DEG],
    ])
    expect(slants(itemsOf('zh', 'shs-sc', '方法概述', member(1)))).toEqual([['方法概述', 1, CJK_SLANT_DEG]])
  })
  it('skews a turned italic label’s CJK run along its direction', () => {
    const items = itemsOf('ja', 'haranoaji', '手法の概要', member(1, true))
    expect(items.map((it) => [it.s, it.skew, it.slant, it.dir])).toEqual([['手法の概要', 1, CJK_SLANT_DEG, [0, 1]]])
  })
  it('leaves an upright label upright', () => {
    expect(slants(itemsOf('ja', 'haranoaji', '手法の概要', member(undefined)))).toEqual([['手法の概要', 0, 0]])
  })
})
