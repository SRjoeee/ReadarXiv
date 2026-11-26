// A heading's printed number, read off its label as its part states it (headNumberOf; docs/PDF-READER.md §6.3): the label's
// number where it states one; where a heading's label is a counter alone (IEEEtran's "IV.", an appendix's "A", which the
// label's reading states as its name: no word before it), that counter as LaTeX prints one (\Roman, \roman, \Alph, \alph);
// none for a label of another kind or a name that is a word ("Keywords").
import { describe, expect, it } from 'vitest'
import { headNumberOf, type Label } from '../src/index.ts'

const ink = [1, 72, 698, 80, 712, 700] as Label['ink']
const label = (o: Partial<Label>): Label => ({
  kind: 'head',
  ink,
  style: { role: 'serif', size: 10 },
  ...o,
})

describe('headNumberOf', () => {
  it('the number a heading label states, its spaces trimmed', () => {
    expect(headNumberOf(label({ num: [' 3.2.1 ', ink] }))).toBe('3.2.1')
    expect(headNumberOf(label({ name: ['Appendix', ink], num: ['A', ink] }))).toBe('A')
  })
  it('a counter alone, stated as the name: a Roman numeral or a letter, as LaTeX prints a counter', () => {
    expect(headNumberOf(label({ name: ['IV', ink], punct: ['.', ink] }))).toBe('IV')
    expect(headNumberOf(label({ name: ['xii', ink] }))).toBe('xii')
    expect(headNumberOf(label({ name: ['B', ink] }))).toBe('B')
  })
  it('none for a word, a label of another kind, or no label', () => {
    expect(headNumberOf(label({ name: ['Keywords', ink] }))).toBeNull()
    expect(headNumberOf(label({ kind: 'float', num: ['2', ink] }))).toBeNull()
    expect(headNumberOf(label({}))).toBeNull()
    expect(headNumberOf(undefined)).toBeNull()
  })
})
