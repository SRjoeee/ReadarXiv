// A reference's own text as its page draws it on A (preview/reference-text.ts; link previews' §3.3, D §4.2 "The reference's own
// text"): its text pieces, each element by its copy text (El.text, else El.copy), never its TeX source; an element of neither
// counted lost; white space collapsed; its leading label (a number or a key) apart, for the search's query.
import type { Part, Placed, Unit } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { queryOf, QUERY_MAX, referenceText } from '../../src/preview/reference-text.ts'

const id = 'b'.repeat(64)
const unit: Unit = {
  id,
  kind: 'reference',
  entry: true,
  content: [
    { t: 'text', s: 'A. Author and B.  Writer.\n The ' },
    { t: 'el', id: '1', kind: 'math', src: '\\mathcal{O}(n)' },
    { t: 'text', s: ' bound. ' },
    { t: 'span', id: '2', style: 'italic', content: [{ t: 'text', s: 'Journal' }] },
    { t: 'text', s: ', 2020' },
    { t: 'el', id: '3', kind: 'macro', src: '\\sage' },
    { t: 'el', id: '4', kind: 'macro', src: '\\hl{x}' },
    { t: 'text', s: '.' },
  ],
}
const member = (o: Partial<Placed> = {}): Placed => ({
  ord: 7,
  kind: 'reference',
  text: id,
  lead: 12,
  style: { role: 'serif', size: 9 },
  align: 'j',
  lines: [[4, 0, 72, 300, 500, 507, 498, 72, 300, 0, 9]],
  room: { below: 2, next: 12 },
  els: [
    ['1', { kind: 'math', copy: 'O(n)', ink: [[4, 120, 498, 140, 507, 500]] }],
    ['3', { kind: 'macro', ink: [] }],
    ['4', { kind: 'macro', text: 'x', copy: 'ignored', ink: [[4, 200, 498, 204, 507, 500]] }],
  ],
  label: {
    kind: 'number',
    ink: [4, 60, 498, 70, 507, 500],
    style: { role: 'serif', size: 9 },
    num: ['[12]', [4, 60, 498, 70, 507, 500]],
  },
  ...o,
})
const part = (m: Placed): Part => ({ format: 1, page: 4, paper: { faces: { fonts: [] } }, flows: [[m]] })

describe('referenceText', () => {
  it('an element’s copy text stands in a reference’s text, never its TeX source', () => {
    const r = referenceText(unit, part(member()))!
    expect(r.text).toBe('A. Author and B. Writer. The O(n) bound. Journal, 2020x.')
    expect(r.text).not.toContain('\\')
  })
  it('an element of neither text nor copy is counted lost', () => {
    expect(referenceText(unit, part(member()))!.lost).toBe(1)
  })
  it('the label is apart', () => {
    expect(referenceText(unit, part(member()))!.label).toBe('[12]')
    expect(referenceText(unit, part(member({ label: undefined })))!.label).toBeNull()
  })
  it('a unit the part places no member of reads as none', () => {
    expect(referenceText(unit, part(member({ text: 'c'.repeat(64) })))).toBeNull()
  })
})

describe('queryOf: the search’s query', () => {
  it('drops the label and is cut at a word under 300 characters', () => {
    expect(queryOf('[12] A. Author. A title.', '[12]')).toBe('A. Author. A title.')
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ')
    const q = queryOf(long, null)
    expect(q.length).toBeLessThanOrEqual(QUERY_MAX)
    expect(long.startsWith(q)).toBe(true)
    expect(long[q.length]).toBe(' ')
  })
})
