// U.label on synthetic labels: the float's name in the target (T26), the theorem-like head's (T27).
import { describe, expect, it } from 'vitest'
import { type Glyph, headLabelInTarget, label, labelInTarget, spacedText } from '../../src/unit/label.ts'

const glyphs = (text: string, x0 = 72, size = 10, bold = true): Glyph[] =>
  [...text].map((ch, i) => ({
    ch,
    x0: x0 + 5 * i,
    x1: x0 + 5 * i + 4.9,
    size,
    st: { fam: 'serif', bold, italic: false, fill: 0 },
  }))
const words = { figure: 'Abbildung', table: 'Tabelle' }
const both = { figure: 'target', table: 'target' }

describe('U.label', () => {
  it('names a float in the target, in capitals where the original is, its number and punctuation the original’s', () => {
    expect(labelInTarget({ x1: 0, text: 'Table 2:', chars: [] }, words, both, 'de')).toBe('Tabelle 2:')
    expect(labelInTarget({ x1: 0, text: 'TABLE IV', chars: glyphs('TABLE IV.') }, words, both, 'de')).toBe(
      'TABELLE IV.',
    )
    expect(
      labelInTarget({ x1: 0, text: 'Figure 3.', chars: [] }, { figure: 'Figure', table: 'Tableau' }, both, 'fr'),
    ).toBeNull()
    expect(
      labelInTarget({ x1: 0, text: 'Figure 3.', chars: [] }, words, { figure: 'source', table: 'target' }, 'de'),
    ).toBeNull()
  })
  it('reads a head’s glyphs with their spaces, and names it from translator’s heads or the paper’s own names', () => {
    const g = [...glyphs('Theorem'), ...glyphs('2.', 112)]
    expect(spacedText(g)).toBe('Theorem 2.')
    expect(headLabelInTarget(g, { Theorem: 'Satz' }, null)).toEqual({
      text: 'Satz 2.',
      parts: [
        { text: 'Satz 2', st: { bold: true, italic: false, color: undefined } },
        { text: '.', st: { bold: true, italic: false, color: undefined } },
      ],
      open: false,
    })
    expect(headLabelInTarget(glyphs('Claim'), {}, new Map([['Claim', 'Behauptung']]))?.text).toBe('Behauptung')
    expect(headLabelInTarget(glyphs('Proof.'), { Proof: 'Beweis' }, null)).toBeNull()
  })
  it('draws the label anew only where the reader may and its group allows', () => {
    const base = {
      head: null,
      kind: 'caption',
      labels: true,
      to: 'de',
      words,
      captions: both,
      heads: null,
      names: null,
    }
    const l = { x1: 100, text: 'Figure1.', chars: glyphs('Figure1.') }
    expect(label({ ...base, label: l, relabels: true }).label?.drawn).toBe('Abbildung 1.')
    expect(label({ ...base, label: l, relabels: false })).toEqual({ relabel: null, head: null, label: l })
  })
})
