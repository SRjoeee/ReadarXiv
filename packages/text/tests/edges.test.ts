// A token's edge punctuation (src/edges.ts): one definition, the identifier's (PDF-READER §18.25) and the flush number's
// (§18.47). Each case: the token, and what is left once every edge mark on that side is taken off, one at a time.
import { describe, expect, it } from 'vitest'
import { edgeMark } from '../src/index.ts'

const strip = (t: string, side: 'start' | 'end'): string => {
  let s = t
  while (s && edgeMark(s, side)) s = side === 'end' ? s.slice(0, -1) : s.slice(1)
  return s
}

describe('the punctuation at an edge of a token, none of it', () => {
  it('at its end: a stop, a comma, a semicolon, a colon, an exclamation or a question mark, a quote', () => {
    expect(strip('2.5,', 'end')).toBe('2.5')
    expect(strip('0.003.', 'end')).toBe('0.003')
    for (const m of [';', ':', '!', '?', "'", '"', '`', '’', '”']) expect(strip(`16${m}`, 'end')).toBe('16')
  })
  it('at its start: a quote, never a stop or a comma (a decimal’s point stays: `.5`)', () => {
    for (const m of ["'", '"', '`', '‘', '“']) expect(strip(`${m}3`, 'start')).toBe('3')
    expect(strip('.5', 'start')).toBe('.5')
    expect(strip(',5', 'start')).toBe(',5')
  })
  it('a bracket no bracket of its pair inside the token answers goes; one answered stays', () => {
    expect(strip('16)', 'end')).toBe('16')
    expect(strip('(16', 'start')).toBe('16')
    expect(strip('(9)', 'end')).toBe('(9)')
    expect(strip('[010]', 'start')).toBe('[010]')
    expect(strip('1).', 'end')).toBe('1')
    expect(strip('host_label(result))', 'end')).toBe('host_label(result)')
  })
  it('a mark inside the token is its own: a per cent sign, a sign, a dash', () => {
    expect(strip('99%', 'end')).toBe('99%')
    expect(strip('=20', 'start')).toBe('=20')
    expect(strip('1.10–1.35', 'end')).toBe('1.10–1.35')
  })
  it('an empty token has no edge', () => {
    expect(edgeMark('', 'end')).toBe(false)
    expect(edgeMark('', 'start')).toBe(false)
  })
})
