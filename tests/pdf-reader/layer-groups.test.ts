import { describe, expect, it } from 'vitest'
import { labelInTarget } from '@/pdf-reader/engine/layer-proto/layer2.mjs'
import { type BatchReport, type Compiled, openPaper, runLive } from '@/pdf-reader/engine/pipeline/live.mjs'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// The layer and the final read the same decisions (the table-groups brief, 2026-10-07): a float's label in the target's
// name where the final's is, and the table groups held in the source as the translation comes in

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

describe('runLive: each batch says which table cells the layer holds in the source', () => {
  const tex = '\\documentclass{article}\n\\begin{document}\nThe prose names AlphaNet and BetaNet in running text.\n\n\\begin{tabular}{ll}\n\\toprule\nModel & Training cost \\\\\n\\midrule\nAlphaNet & fast training \\\\\nBetaNet & slow training \\\\\nGamma model & medium \\\\\n\\bottomrule\n\\end{tabular}\n\\end{document}\n'
  const compile = async (q: { main: string; overrides: Map<string, Uint8Array> }): Promise<Compiled> => {
    const text = new TextDecoder().decode(q.overrides.get(q.main))
    return { ok: true, pdf: new Uint8Array([1]), aux: '', bbl: null, log: text.includes('AXT-FONTS') ? 'AXT-FONTS rm=cmr;sf=cmss;tt=cmtt;body=10;\n' : 'AXT-END\n', ms: 1 }
  }
  it('every cell its group; a column of names held whole once it is in', async () => {
    const paper = openPaper(new Map([['main.tex', new TextEncoder().encode(tex)]]))
    const reports: BatchReport[] = []
    await runLive(paper, { lang: 'zh', compile, translate: async texts => texts.map(text => ({ text: text.replace(/(?<![@a-z])[A-Za-z]{2,}/g, '\u8bba\u6587'), by: 'B' })), format: 'markers', marks: new Map(), identity: 'B', readMarks: null, onBatch: b => reports.push(b) })
    const all = reports.flatMap(r => r.units)
    const gamma = paper.units.findIndex(u => (u as { cell?: unknown }).cell && JSON.stringify(u.pieces).includes('Gamma'))
    expect(all.find(u => u.id === gamma)?.group).toBe('1:c0')
    expect(reports.at(-1)?.held).toContain(gamma)
    // the descriptions' column is translated whole: none of it held
    const medium = paper.units.findIndex(u => JSON.stringify(u.pieces).includes('medium'))
    expect(reports.at(-1)?.held).not.toContain(medium)
  })
})
