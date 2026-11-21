import { describe, expect, it } from 'vitest'
import { labelInTarget, labelOnFirstLine } from '@/pdf-reader/engine/layer-proto/layer2.mjs'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// The layer reads the decision the final read (the table-groups brief, 2026-10-07): a float's label in the target's name
// where the final's is

const label = (text: string, last = text.at(-1) ?? '') => ({ text, chars: [{ ch: last }] })
const target = { figure: 'target', table: 'target' } as const
/** a target's names of a figure and a table: the layout rules' labels */
const labelsOf = (lang: string) => resolveRules(BUILTIN_RULES, lang).labels

describe('labelInTarget: a float\'s label as the final sets it', () => {
  it('the target\'s name, a space, the original\'s number and punctuation', () => {
    expect(labelInTarget(label('Table 2:'), labelsOf('ja'), target, 'ja')).toBe('\u8868 2:')
    expect(labelInTarget(label('Figure 1.'), labelsOf('zh'), target, 'zh')).toBe('\u56fe 1.')
    expect(labelInTarget(label('Fig. 3:'), labelsOf('de'), target, 'de')).toBe('Abbildung 3:')
    // the layout file's label, read from its characters without their spaces
    expect(labelInTarget(label('Table2:'), labelsOf('es'), target, 'es')).toBe('Cuadro 2:')
    expect(labelInTarget(label('Table 10'), labelsOf('ru'), target, 'ru')).toBe('\u0422\u0430\u0431\u043b\u0438\u0446\u0430 10')
  })
  it('in capitals where the class sets the original\'s so (TABLE I)', () => {
    expect(labelInTarget(label('TABLE I'), labelsOf('de'), target, 'de')).toBe('TABELLE I')
  })
  it('none where the final keeps the paper\'s name, where the name is the original\'s, or for another label', () => {
    expect(labelInTarget(label('Table 2:'), labelsOf('ja'), { figure: 'target', table: 'source' }, 'ja')).toBeNull()
    expect(labelInTarget(label('Table 2:'), labelsOf('ja'), null, 'ja')).toBeNull()
    expect(labelInTarget(label('Table 2:'), labelsOf('fr'), target, 'fr')).toBeNull()
    expect(labelInTarget(label('Theorem 1.'), labelsOf('ja'), target, 'ja')).toBeNull()
    expect(labelInTarget(label('1.'), labelsOf('ja'), target, 'ja')).toBeNull()
  })
})

describe("labelOnFirstLine: today's layer relabels a float's label only on its unit's first line", () => {
  // (a caption's label the marked compile finds by TeX's call stands on a line of its own above the caption's text where the
  // class sets it so (IEEEtran's "TABLE I"); today's layer sets a relabel as its first line's start, which would carry the label
  // into the text's line and blank its own: there it keeps the label as the original's ink, as before the label was found)
  // (the first line's rectangle: [page, x0, its bottom, x1, its top], tex.mjs texRects)
  const first = [2, 51, 716.0, 295.8, 724.6] as [number, number, number, number, number]
  const chars = (yb: number, page = 2) => [{ ch: 'T', page, yb }, { ch: 'I', page, yb }]
  it('is the first line where its characters stand on that line', () => {
    expect(labelOnFirstLine({ chars: chars(718.6) }, first)).toBe(true)
  })
  it('is not where they stand on a line of their own, or on another page', () => {
    expect(labelOnFirstLine({ chars: chars(727.56) }, first)).toBe(false)
    expect(labelOnFirstLine({ chars: chars(718.6, 3) }, first)).toBe(false)
  })
})
