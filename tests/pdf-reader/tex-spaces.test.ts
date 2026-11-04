import { describe, expect, it } from 'vitest'
import { NEGATIVE_SPACES, SPACE_SYMBOLS, SPACE_WORDS, spaceLead, spaceSource } from '@/pdf-reader/engine/rules/tex-kernel.mjs'
import { displayStop, formulaRuns, isInkless, SPACING } from '@/pdf-reader/engine/translate/mt.mjs'

// TeX's and LaTeX's spaces in text, one table (rules/tex-kernel.mjs) for every reader of a placeholder that is one: the wire's
// three (what stands between a run's formulas, what no space of the wire's goes before, what ends a display) and the layer's
// pieces (layer/pieces.mjs, held equal to mt.mjs's SPACING by layer-pieces.test.ts). Three lists of it had disagreed: a control
// space before a line's end was a space between formulas and none before a marker, `\!` one at a display's end and none elsewhere.

const whole = new RegExp(`^${spaceSource()}$`)
const run = (between: string) => formulaRuns([{ t: 'ph', src: '$\\{a$' }, { t: 'ph', src: between }, { t: 'ph', src: '$b\\}$' }]).size

describe('the table', () => {
  it('holds the tie, the control space and the math spaces, LaTeX\'s named spaces, \\hspace with its length', () => {
    expect(SPACE_SYMBOLS).toEqual(['~', '\\ ', '\\,', '\\:', '\\;', '\\!'])
    expect(SPACE_WORDS).toEqual(['enspace', 'quad', 'qquad', 'thinspace', 'nobreakspace'])
    expect(NEGATIVE_SPACES).toEqual(['\\!'])
    for (const s of ['~', '\\ ', '\\\t', '\\\n', '\\,', '\\:', '\\;', '\\!', '\\quad', '\\qquad{}', '\\enspace', '\\thinspace', '\\nobreakspace', '\\hspace{1em}', '\\hspace*{2pt}', '\\hspace {1em}']) expect(whole.test(s), JSON.stringify(s)).toBe(true)
    for (const s of ['\\quadx', '\\enskip', '\\hspacex', '\\vspace{1em}', '\\>', '\\@', '\\label{a}', '\\\\', '}']) expect(whole.test(s), JSON.stringify(s)).toBe(false)
    expect(new RegExp(`^${spaceSource({ math: true })}$`).test('\\>')).toBe(true)
  })
  it('a symbol\'s backslash is no forced break\'s second, read from a source\'s end as from its start', () => {
    expect(new RegExp(`${spaceLead()}$`).test('x\\\\\n')).toBe(false)
    expect(new RegExp(`${spaceLead()}$`).test('x\\\n')).toBe(true)
  })
})

describe('its readers', () => {
  it('no space of the wire\'s goes before one of positive width, nor before a group\'s end (SPACING)', () => {
    for (const s of ['~', '\\ ', '\\\n', '\\,', '\\quad', '\\hspace{1em}', '}']) expect(SPACING.test(s), JSON.stringify(s)).toBe(true)
    for (const s of ['\\!', '\\>', '\\cite{x}', '\\enskip']) expect(SPACING.test(s), JSON.stringify(s)).toBe(false)
  })
  it('any space, an ellipsis, stands between a run\'s formulas; a word or a citation does not', () => {
    for (const s of ['~', '\\ ', '\\,', '\\!', '\\quad', '\\hspace{1em}', '\\ldots', '\\dots{}']) expect(run(s), JSON.stringify(s)).toBe(1)
    for (const s of ['\\cite{x}', '\\textbf{a}']) expect(run(s), JSON.stringify(s)).toBe(0)
  })
  it('a display\'s end: its spaces are passed over to its own stop, a forced break before a line\'s end too', () => {
    expect(displayStop('\\begin{equation} x = y.\\quad \\label{e}\\end{equation}')).toBe('.')
    expect(displayStop('\\begin{equation} x = y,\\> \\end{equation}')).toBe(',')
    expect(displayStop('\\begin{equation}\\begin{aligned} a &= b\\right).\\\\\n\\end{aligned}\n\\end{equation}')).toBe('.')
  })
  it('a space is no placeholder that sets no ink: it sets where the words around it fall', () => {
    for (const s of ['~', '\\ ', '\\,', '\\quad']) expect(isInkless({ t: 'ph', src: s }), s).toBe(false)
  })
})
