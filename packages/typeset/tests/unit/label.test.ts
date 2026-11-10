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
  it('reads a head’s parts with their spaces, and names it from translator’s heads or the paper’s own names', () => {
    const g = [...glyphs('Theorem'), ...glyphs('2.', 112)]
    expect(spacedText(g)).toBe('Theorem 2.')
    const one = (ch: string, x0: number): Glyph => ({ ...glyphs(ch, x0)[0]!, ch, x1: x0 + 5 * ch.length - 0.1 })
    expect(
      headLabelInTarget(
        { name: one('Theorem', 72), num: one('2', 112), punct: one('.', 117) },
        { Theorem: 'Satz' },
        null,
      ),
    ).toEqual({
      text: 'Satz 2.',
      parts: [
        { text: 'Satz 2', st: { bold: true, italic: false, color: undefined } },
        { text: '.', st: { bold: true, italic: false, color: undefined } },
      ],
      open: false,
    })
    expect(headLabelInTarget({ name: one('Claim', 72) }, {}, new Map([['Claim', 'Behauptung']]))?.text).toBe(
      'Behauptung',
    )
    expect(headLabelInTarget({ name: one('Proof', 72), punct: one('.', 97) }, { Proof: 'Beweis' }, null)).toBeNull()
  })
  it('relabels a theorem-like head from its parts as the part states them, whatever its number’s form', () => {
    // (a part's Label.name, num and punct, each one glyph of its ink: 2610.21312v1's IEEEtran heads numbered within \Roman
    // sections, "Corollary VI.2 (", left the original's by a pattern that took one capital before a number's dot and no more)
    const part = (ch: string, x0: number, x1: number): Glyph => ({
      ch,
      x0,
      x1,
      size: 10,
      st: { fam: 'serif', bold: true },
    })
    const de = { Corollary: 'Korollar', Proposition: 'Satz', Definition: 'Definition*', 'Key Lemma': 'Hauptlemma' }
    const base = {
      label: undefined,
      kind: 'heading',
      labels: true,
      relabels: true,
      to: 'de',
      words: null,
      captions: null,
    }
    const head = (name: string, num: string | null, punct: string | null) => ({
      name: part(name, 49, 100),
      ...(num ? { num: part(num, 104, 117) } : {}),
      ...(punct ? { punct: part(punct, punct === '(' ? 121 : 117, 124) } : {}),
    })
    const drawn = (h: ReturnType<typeof head>) => label({ ...base, head: h, heads: de, names: null }).label?.drawn
    expect(drawn(head('Corollary', 'VI.2', '('))).toBe('Korollar VI.2 (')
    expect(drawn(head('Proposition', 'VII.1', '('))).toBe('Satz VII.1 (')
    expect(drawn(head('Proposition', 'V.2', '('))).toBe('Satz V.2 (')
    expect(drawn(head('Definition', '1', '.'))).toBe('Definition* 1.')
    expect(drawn(head('Key Lemma', '2', '.'))).toBe('Hauptlemma 2.')
    // (a name no table holds, nor the paper's name units: the original's; a babel name's head is the names path's)
    expect(drawn(head('Assumption', '1', '.'))).toBeUndefined()
    expect(label({ ...base, head: head('Proof', null, '.'), heads: { Proof: 'Beweis' }, names: null }).head).toBeNull()
    // (the paper's own name unit names it where no table does)
    expect(
      label({ ...base, head: head('Setting', '1', '('), heads: de, names: new Map([['Setting', 'Rahmen']]) }).label
        ?.drawn,
    ).toBe('Rahmen 1 (')
    // (an unnumbered head whose name ends in its own stop, a style that sets no punctuation after it)
    expect(label({ ...base, head: head('Thm', null, '.'), heads: { 'Thm.': 'Satz' }, names: null }).label?.drawn).toBe(
      'Satz',
    )
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
