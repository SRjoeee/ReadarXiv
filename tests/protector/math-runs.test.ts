import { describe, expect, it } from 'vitest'
import { balancedRuns, delimiterResidue, MAX_RUN, RUN_SEPARATOR, type RunItem } from '@/core/protector/math-runs'

// A formula an author split across several inline formulas, its delimiters opened in one and closed in another
// (2307.16209's `$\{\Phi_0$, $\Phi_1$, $\Phi_2\}$`): one placeholder, so that no translator can move a part of it away

const f = (tex: string): RunItem => ({ tex })
const B = 'between' as const

describe('delimiterResidue: what a formula leaves open or closes of what it did not open', () => {
  it('an escaped brace opened and not closed, closed and not opened, or neither', () => {
    expect(delimiterResidue('\\{\\Phi_0')).toEqual({ closes: [], opens: ['brace'] })
    expect(delimiterResidue('\\Phi_2\\}')).toEqual({ closes: ['brace'], opens: [] })
    expect(delimiterResidue('\\Phi_1')).toEqual({ closes: [], opens: [] })
  })
  it('the named and sized forms are the delimiters they set: \\lbrace, \\langle, \\lVert, \\lfloor, \\bigl(, \\Bigr]', () => {
    expect(delimiterResidue('\\lbrace x \\rangle')).toBeNull()
    expect(delimiterResidue('\\langle x, y')).toEqual({ closes: [], opens: ['angle'] })
    expect(delimiterResidue('\\lVert x \\rVert + \\lfloor y')).toEqual({ closes: [], opens: ['floor'] })
    expect(delimiterResidue('\\bigl( x')).toEqual({ closes: [], opens: ['paren'] })
    expect(delimiterResidue('y \\Bigr]')).toEqual({ closes: ['paren'], opens: [] })
  })
  it('a half-open interval is balanced: ( and [ close each other', () => {
    expect(delimiterResidue('x \\in [0, 1)')).toEqual({ closes: [], opens: [] })
    expect(delimiterResidue('(0, 1]')).toEqual({ closes: [], opens: [] })
  })
  it('\\left and \\right pair with each other whatever delimiter they take, \\right. and \\middle| among them', () => {
    expect(delimiterResidue('\\left\\{ x \\middle| y \\right.')).toEqual({ closes: [], opens: [] })
    expect(delimiterResidue('\\left( \\{ x')).toBeNull()
    expect(delimiterResidue('x \\right)')).toBeNull()
  })
  it('a delimiter closed by one of another kind is no formula a run can take (null)', () => {
    expect(delimiterResidue('\\{ a )')).toBeNull()
  })
  it('a group, an unescaped brace, is no delimiter', () => {
    expect(delimiterResidue('x_{i}^{(2)}')).toEqual({ closes: [], opens: [] })
  })
})

describe('balancedRuns: adjacent formulas whose delimiters balance across them', () => {
  it('2307.16209 p31: `$\\{\\Phi_0$, $\\Phi_1$, $\\Phi_2\\}$` is one run, its commas and spaces inside it', () => {
    expect(balancedRuns([f('\\{\\Phi_0'), B, f('\\Phi_1'), B, f('\\Phi_2\\}')])).toEqual([[0, 4]])
  })
  it('nested pairs, and a run that closes and opens again before it balances (2608.29782\'s tuples)', () => {
    expect(balancedRuns([f('((A,\\circ)'), B, f('(B, \\cdot), l_\\circ,r_\\circ'), B, f('l_\\cdot'), B, f('r_\\cdot)')])).toEqual([[0, 6]])
    expect(balancedRuns([f('\\{a'), B, f('b\\} \\cup \\{c'), B, f('d\\}')])).toEqual([[0, 4]])
  })
  it('ends as soon as it balances: the formulas after it are their own', () => {
    expect(balancedRuns([f('\\{a'), B, f('b\\}'), B, f('c'), B, f('(d'), B, f('e)')])).toEqual([[0, 2], [6, 8]])
  })
  it('a run that never balances is no run: the unit ends, or a closer of another kind comes, or one too many', () => {
    expect(balancedRuns([f('\\{a'), B, f('b')])).toEqual([])
    expect(balancedRuns([f('\\{a'), B, f('b)')])).toEqual([])
    expect(balancedRuns([f('(a'), B, f('b))')])).toEqual([])
  })
  it('anything but a separator between two formulas ends the run: a word, a citation (null)', () => {
    expect(balancedRuns([f('a \\in \\{'), null, f('\\}')])).toEqual([])
    expect(balancedRuns([f('(a'), B, null, B, f('b)')])).toEqual([])
  })
  it('a formula that only closes, or only balances, begins none', () => {
    expect(balancedRuns([f('a)'), B, f('(b')])).toEqual([])
    expect(balancedRuns([f('(a)'), B, f('b')])).toEqual([])
  })
  it(`gives up beyond ${MAX_RUN} formulas`, () => {
    const run = (n: number) => Array.from({ length: n }, (_, k) => [f(`${k === 0 ? '(' : ''}a_${k}${k === n - 1 ? ')' : ''}`), B]).flat().slice(0, -1)
    expect(balancedRuns(run(MAX_RUN))).toEqual([[0, 2 * MAX_RUN - 2]])
    expect(balancedRuns(run(MAX_RUN + 1))).toEqual([])
  })
})

describe('RUN_SEPARATOR: what may stand between the formulas of a run', () => {
  it('white space, a comma, a semicolon, an ellipsis', () => {
    for (const s of [', ', ' ', '\n', ';', ', ..., ', ' \u2026 ', '\u00a0']) expect(RUN_SEPARATOR.test(s)).toBe(true)
  })
  it('not a word, a colon, a full stop', () => {
    for (const s of [' and ', ' for some ', ': ', '. ', 'L, L-O, N']) expect(RUN_SEPARATOR.test(s)).toBe(false)
  })
})
