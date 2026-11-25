// The head's outline and its numbers (docs/PDF-READER.md §6.3): each located heading member at its first line's page, and its
// printed number where its label states one, so that the reader's contents number every heading at open, the parts of the
// far pages unread. A heading TeX set no number for, a label of another kind, a heading not located: no number.
import { Head } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { outlineOf } from '../src/bundle/bundle.ts'
import type { Member } from '../src/locate/locate.ts'

const label = (kind: string, num?: string) => ({
  kind,
  ink: [3, 72, 698, 80, 712, 700],
  style: { font: 0, size: 10 },
  ...(num === undefined ? {} : { num: [num, [3, 72, 698, 78, 712, 700]] }),
})
const member = (ord: number, kind: string, page: number, labelAt?: unknown, located = true) =>
  ({
    ord,
    kind,
    id: String(ord).repeat(64).slice(0, 64),
    located,
    lines: [[page]],
    ...(labelAt ? { labelAt } : {}),
  }) as unknown as Member

describe("the head's outline numbers", () => {
  it('states each located heading its printed number by its ord, and none where TeX set none or the label is no heading one', () => {
    const { outline, numbers } = outlineOf([
      member(2, 'heading', 1, label('head', '1')),
      member(5, 'para', 1),
      member(9, 'heading', 3, label('head', ' 3.2.1 ')),
      member(12, 'heading', 4),
      member(14, 'heading', 4, label('head')),
      member(16, 'heading', 5, label('float', '2')),
      member(18, 'heading', 6, label('head', 'A'), false),
      member(20, 'heading', 7, { ...label('head'), name: ['IV', [7, 72, 698, 80, 712, 700]] }),
    ])
    expect(outline.map(([ord, page]) => [ord, page])).toEqual([
      [2, 1],
      [9, 3],
      [12, 4],
      [14, 4],
      [16, 5],
      [20, 7],
    ])
    expect(numbers).toEqual([
      [2, '1'],
      [9, '3.2.1'],
      [20, 'IV'],
    ])
  })
  it('is optional in the head: a head of before reads, and a reader of before strips it', () => {
    const base = {
      format: 1,
      paper: { id: '2501.00001', version: 1, pages: 1 },
      made: 'test',
      original: { bytes: 0, sha256: '0'.repeat(64), chunk: 65536, chunks: '' },
      addOn: null,
      units: [],
      parts: [],
    }
    expect(Head.safeParse(base).success).toBe(true)
    expect(Head.parse({ ...base, numbers: [[2, '1']] }).numbers).toEqual([[2, '1']])
    expect(Head.safeParse({ ...base, numbers: [[2, '']] }).success).toBe(false)
  })
})
