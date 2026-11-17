import { describe, expect, it } from 'vitest'
import { formulaRuns, SPACING } from '@/pdf-reader/engine/translate/mt.mjs'

// Today's half of tex-spaces.test.ts (cut 2026-11-16): the cases of today's wire (translate/mt.mjs SPACING, formulaRuns), which
// the cut-over deletes with today's engine; the cases of the kept table and its kept readers stay in tex-spaces.test.ts.

// TeX's and LaTeX's spaces in text, one table (rules/tex-kernel.mjs) for every reader of a placeholder that is one: the wire's
// three (what stands between a run's formulas, what no space of the wire's goes before, what ends a display) and the layer's
// pieces (layer/pieces.mjs, held equal to mt.mjs's SPACING by layer-pieces.test.ts). Three lists of it had disagreed: a control
// space before a line's end was a space between formulas and none before a marker, `\!` one at a display's end and none elsewhere.

const run = (between: string) => formulaRuns([{ t: 'ph', src: '$\\{a$' }, { t: 'ph', src: between }, { t: 'ph', src: '$b\\}$' }]).size

describe('its readers', () => {
  it('no space of the wire\'s goes before one of positive width, nor before a group\'s end (SPACING)', () => {
    for (const s of ['~', '\\ ', '\\\n', '\\,', '\\quad', '\\hspace{1em}', '}']) expect(SPACING.test(s), JSON.stringify(s)).toBe(true)
    for (const s of ['\\!', '\\>', '\\cite{x}', '\\enskip']) expect(SPACING.test(s), JSON.stringify(s)).toBe(false)
  })
  it('any space, an ellipsis, stands between a run\'s formulas; a word or a citation does not', () => {
    for (const s of ['~', '\\ ', '\\,', '\\!', '\\quad', '\\hspace{1em}', '\\ldots', '\\dots{}']) expect(run(s), JSON.stringify(s)).toBe(1)
    for (const s of ['\\cite{x}', '\\textbf{a}']) expect(run(s), JSON.stringify(s)).toBe(0)
  })
})
