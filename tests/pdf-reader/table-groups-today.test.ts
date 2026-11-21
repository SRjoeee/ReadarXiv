import { describe, expect, it } from 'vitest'
import { decideGroups, groupOf, NAMES_SHARE, unchanged } from '@/pdf-reader/engine/translate/groups.mjs'
import { inMemory, loadProject, type SourceUnit } from '@/pdf-reader/engine/source/latex-front.mjs'
import { plainSource as plainOf } from '@/pdf-reader/engine/translate/mt.mjs'

// A table's consistency groups (the table-groups brief, 2026-10-07): the grid the TeX front end reads, each cell's
// group and the decision over what came back (the layer's rows read it: layer-proto/rows.mjs layerRows)

const enc = (s: string) => new TextEncoder().encode(s)
/** a unit's source as plain text (mt.mjs plainSource, over the front end's units) */
const plainSource = (u: SourceUnit) => plainOf(u as unknown as Parameters<typeof plainOf>[0])
const doc = (body: string, prose = 'The prose names AlphaNet and BetaNet in running text.') => `\\documentclass{article}\n\\begin{document}\n${prose}\n\n${body}\n\\end{document}\n`
const unitsOf_ = (tex: string) => loadProject(inMemory(new Map([['main.tex', enc(tex)]])), 'main.tex', { tables: true }).units as (SourceUnit & { file: string; start: number })[]

describe('loadProject: each cell unit carries its place in its table', () => {
  // (a one-column tabular of several rows nested in a cell sets lines of that cell's text, one unit with its forced break, and is
  // no table of its own: the next table is the paper's second, PDF-READER §18.75; it was three units and the third table)
  it('the groups: the header, each column, the cells spanning the same columns; no group outside a table', () => {
    const us = unitsOf_(doc('\\begin{tabular}{lll}\n\\hline\nAa & Bb & Cc \\\\\n\\hline\nx1 one & \\multicolumn{2}{c}{spanning text} \\\\\nx2 two & three & four \\\\\nx3 six & seven & eight \\\\\n\\end{tabular}'))
    expect(us.map(u => [plainSource(u), groupOf(u)])).toEqual([
      ['The prose names AlphaNet and BetaNet in running text.', null],
      ['Aa', '1:h'], ['Bb', '1:h'], ['Cc', '1:h'], ['x1 one', '1:c0'], ['spanning text', '1:c1+2'], ['x2 two', '1:c0'], ['three', '1:c1'], ['four', '1:c2'], ['x3 six', '1:c0'], ['seven', '1:c1'], ['eight', '1:c2'],
    ])
  })
})

describe('unchanged: a translation that is its source but for white space and the case of single letters', () => {
  it('compares so', () => {
    expect(unchanged('GNMT + RL', 'GNMT+RL')).toBe(true)
    expect(unchanged('Model A', 'Model a')).toBe(true)
    expect(unchanged('Deep-Att + PosUnk', 'Deep-att + PosUnk')).toBe(false)
    expect(unchanged('Model', '\u30e2\u30c7\u30eb')).toBe(false)
    expect(unchanged('ResNet-34 B', 'ResNet-34 b')).toBe(true)
  })
})

describe('decideGroups: a group translated whole or kept whole', () => {
  // a table of a header and two columns; `answers` the translator's, by source text (null: none yet)
  const table = doc('\\begin{tabular}{ll}\n\\hline\nModel & Speed \\\\\n\\hline\nOmega one & fast \\\\\nOmega two & slow \\\\\nOmega three & fast enough \\\\\nOmega four & slow enough \\\\\nOmega five & very fast \\\\\n\\end{tabular}')
  const decide = (answers: Record<string, { state: string; text?: string } | null>, keptTexts: string[] = []) => {
    const us = unitsOf_(table), kept = new Set<SourceUnit>(us.filter(u => keptTexts.includes(plainSource(u))))
    const answer = (u: SourceUnit) => { const a = answers[plainSource(u)]; return a ? { state: a.state, pieces: a.text === undefined ? undefined : [{ t: 'text', tr: true, s: a.text }] } : a === null ? undefined : { state: 'whole', pieces: [{ t: 'text', tr: true, s: `<${plainSource(u)}>` }] } }
    const d = decideGroups(us, answer, kept)
    return { us, d, of: (g: string) => d.groups.get(g)?.decision, kept: (t: string) => d.keep.has(us.find(u => plainSource(u) === t) as SourceUnit) }
  }
  it('a column of which at least NAMES_SHARE came back as they went is names, kept whole; the header is translated', () => {
    expect(NAMES_SHARE).toBe(0.4)
    const r = decide({ 'Omega one': { state: 'whole', text: 'Omega one' }, 'Omega two': { state: 'whole', text: 'Omega  two' } })
    expect(r.of('1:c0')).toBe('names')
    expect(['Omega one', 'Omega three', 'Omega five'].every(r.kept)).toBe(true)
    expect(r.of('1:c1')).toBe('translate')
    expect(r.of('1:h')).toBe('translate')
  })
  it('below the share: translated whole, the cells that came back as they went with it', () => {
    const r = decide({ 'Omega one': { state: 'whole', text: 'Omega one' } })
    expect(r.of('1:c0')).toBe('translate')
    expect(r.d.keep.size).toBe(0)
  })
  it('a name kept before asking counts as a cell that came back as it went', () => {
    const r = decide({}, ['Omega one', 'Omega two'])
    expect(r.of('1:c0')).toBe('names')
    // the names themselves are kept already: the decision keeps the rest
    expect(r.d.keep.size).toBe(3)
  })
  it('a cell the translator could not take keeps its group whole; one not in yet, or lost, keeps it waiting', () => {
    expect(decide({ fast: { state: 'none' } }).of('1:c1')).toBe('untranslatable')
    expect(decide({ fast: { state: 'partial', text: 'x' } }).kept('slow')).toBe(true)
    const waiting = decide({ slow: null })
    expect(waiting.of('1:c1')).toBe('waiting')
    expect(waiting.d.wait.has(waiting.us.find(u => plainSource(u) === 'fast') as SourceUnit)).toBe(true)
    expect(decide({ Model: { state: 'lost' } }).of('1:h')).toBe('waiting')
    // whole, but not in the snapshot a compile sets: waiting for that compile
    expect(decide({ Speed: { state: 'whole' } }).of('1:h')).toBe('waiting')
  })
})
