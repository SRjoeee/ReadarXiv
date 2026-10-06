import { describe, expect, it } from 'vitest'
import { copyTexts, reusable, seedFrom, sourceHash, unitsOf } from '@/pdf-reader/engine/cache.mjs'
import { decideGroups, groupOf, NAMES_SHARE, unchanged } from '@/pdf-reader/engine/groups.mjs'
import { inMemory, loadProject, type SourceUnit, tableGrid } from '@/pdf-reader/engine/latex-front.mjs'
import { type Compiled, keptFor, openPaper, runLive } from '@/pdf-reader/engine/live.mjs'
import { plainSource as plainOf } from '@/pdf-reader/engine/mt.mjs'

// A table's consistency groups (the table-groups brief, 2026-10-07): the grid the TeX front end reads, each cell's
// group, the decision over what came back, and the run that sets the final and keeps the record by it

const enc = (s: string) => new TextEncoder().encode(s)
/** a unit's source as plain text (mt.mjs plainSource, over the front end's units) */
const plainSource = (u: SourceUnit) => plainOf(u as unknown as Parameters<typeof plainOf>[0])
const doc = (body: string, prose = 'The prose names AlphaNet and BetaNet in running text.') => `\\documentclass{article}\n\\begin{document}\n${prose}\n\n${body}\n\\end{document}\n`
const unitsOf_ = (tex: string) => loadProject(inMemory(new Map([['main.tex', enc(tex)]])), 'main.tex', { tables: true }).units as (SourceUnit & { file: string; start: number })[]
const cells = (tex: string) => unitsOf_(tex).filter(u => u.kind === 'cell').map(u => ({ text: plainSource(u), ...u.cell }))
/** a grid's cells of a body, without their offsets */
const grid = (body: string) => tableGrid(body, 0, body.length).map(({ start: _s, end: _e, ...c }) => c)

describe('tableGrid: a table body as its cells lay it out', () => {
  it('reads rows and columns by & and \\\\, a \\multicolumn spanning its columns, outside braces, math and comments', () => {
    expect(grid('a & {b & c} & $x & y$ \\\\ \\multicolumn{2}{c}{d} & e % f & g\n \\\\[2pt] h')).toEqual([
      { row: 0, col: 0, span: 1, head: false }, { row: 0, col: 1, span: 1, head: false }, { row: 0, col: 2, span: 1, head: false },
      { row: 1, col: 0, span: 2, head: false }, { row: 1, col: 2, span: 1, head: false },
      { row: 2, col: 0, span: 1, head: false },
    ])
  })
  it('the header is the rows above the first rule across the table: a \\cmidrule under a spanning heading does not end it', () => {
    const body = '\\toprule\n\\multirow{2}{*}{Model} & \\multicolumn{2}{c}{BLEU} \\\\\n\\cmidrule{2-3}\n& EN-DE & EN-FR \\\\\n\\hline\nByteNet & 1 & 2 \\\\\nGNMT & 3 & 4 \\\\\nMoE & 5 & 6 \\\\\n\\bottomrule'
    expect(grid(body).filter(c => c.head).map(c => [c.row, c.col])).toEqual([[0, 0], [0, 1], [1, 0], [1, 1], [1, 2]])
    expect(grid(body).filter(c => !c.head && c.col === 0).map(c => c.row)).toEqual([2, 3, 4, 5])
  })
  it('a rule\'s own arguments are its, a cell\'s first group after it the cell\'s (\\hline {\\bf Parser})', () => {
    const body = '\\specialrule{1pt}{-1pt}{0pt}\n{\\bf Parser} & {\\bf F1} \\\\ \\cmidrule(lr){1-2}\nA & 1 \\\\\n\\hline\nB & 2 \\\\ C & 3 \\\\ D & 4'
    expect(grid(body).filter(c => c.head).map(c => c.row)).toEqual([0, 0, 1, 1])
  })
  it('no rule after the first rows, or one with no fewer rows below it than above: no header', () => {
    expect(grid('A & B \\\\ c & d \\\\ e & f').some(c => c.head)).toBe(false)
    expect(grid('\\toprule A & B \\\\ c & d \\\\ \\midrule e & f \\\\ \\bottomrule').some(c => c.head)).toBe(false)
    expect(grid('\\toprule A & B \\\\ \\bottomrule').some(c => c.head)).toBe(false)
  })
  it('a nested environment is one cell\'s content, its own & and \\\\ its own', () => {
    expect(grid('\\begin{tabular}{c}a\\\\b\\end{tabular} & c \\\\ \\hline d & e \\\\ f & g').map(c => [c.row, c.col, c.head])).toEqual([[0, 0, true], [0, 1, true], [1, 0, false], [1, 1, false], [2, 0, false], [2, 1, false]])
  })
})

describe('loadProject: each cell unit carries its place in its table', () => {
  const tex = doc('\\begin{tabular}{ll}\n\\toprule\nModel & Training cost \\\\\n\\midrule\nAlphaNet & fast training \\\\\nBetaNet & slow \\begin{tabular}{c}long\\\\training\\end{tabular} \\\\\n\\bottomrule\n\\end{tabular}\n\n\\begin{tabular}{l}\nOne cell of another table \\\\\n\\end{tabular}')
  it('its table, row, column and span, and whether its row is the header\'s; a nested table\'s lines are the outer cell\'s', () => {
    expect(cells(tex)).toEqual([
      { text: 'Model', table: 1, row: 0, col: 0, span: 1, head: true },
      { text: 'Training cost', table: 1, row: 0, col: 1, span: 1, head: true },
      { text: 'AlphaNet', table: 1, row: 1, col: 0, span: 1, head: false },
      { text: 'fast training', table: 1, row: 1, col: 1, span: 1, head: false },
      { text: 'BetaNet', table: 1, row: 2, col: 0, span: 1, head: false },
      { text: 'slow', table: 1, row: 2, col: 1, span: 1, head: false },
      { text: 'long', table: 1, row: 2, col: 1, span: 1, head: false },
      { text: 'training', table: 1, row: 2, col: 1, span: 1, head: false },
      { text: 'One cell of another table', table: 3, row: 0, col: 0, span: 1, head: false },
    ])
  })
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

describe('runLive: the final and the record read the same decision', () => {
  // a column of names (two the reader keeps before asking, a third the translator turns into words) and a column of
  // descriptions with an acronym in it; the translator gives back what holds "Net" and translates the rest
  const tex = doc('\\begin{tabular}{ll}\n\\toprule\nModel & Training cost \\\\\n\\midrule\nAlphaNet & fast training \\\\\nBetaNet & slow training \\\\\nGamma model & XYZ \\\\\n\\bottomrule\n\\end{tabular}', 'The prose names AlphaNet and BetaNet in running text, and XYZ.')
  const translate = async (texts: string[]) => texts.map(text => ({ text: text.replace(/(?<![@a-z])[A-Za-z]{2,}/g, '\u8bba\u6587'), by: 'B' }))
  type Req = { main: string; rerun: boolean; overrides: Map<string, Uint8Array> }
  const compileAll = () => {
    const mains: { rerun: boolean; text: string }[] = []
    const compile = async (q: Req): Promise<Compiled> => {
      const text = new TextDecoder().decode(q.overrides.get(q.main))
      mains.push({ rerun: q.rerun, text })
      return { ok: true, pdf: new Uint8Array([mains.length]), aux: '', bbl: null, log: text.includes('AXT-FONTS') ? 'AXT-FONTS rm=cmr;sf=cmss;tt=cmtt;body=10;\n' : 'AXT-END\n', ms: 1 }
    }
    return { mains, compile }
  }
  it('sets a column of names in the source and keeps it so in the record, with its translation; the rest as translated', async () => {
    const paper = openPaper(new Map([['main.tex', enc(tex)]]))
    const kept = keptFor(paper, 'zh')
    expect([...kept].map(plainSource).sort()).toEqual(['AlphaNet', 'BetaNet', 'XYZ'])
    const c = compileAll()
    const r = await runLive(paper, { lang: 'zh', compile: c.compile, translate, format: 'markers', marks: new Map(), identity: 'B', readMarks: null })
    expect(r.settled).toBe(true)
    // the translated table, as \axtfit takes it before the original it is fitted to
    const final = /\\axtfit\{([\s\S]*?\\end\{tabular\})\}\{/.exec(c.mains.filter(m => m.rerun).at(-1)?.text ?? '')?.[1] ?? ''
    // the names column whole in the source, "Gamma model" though the translator gave words for it; the descriptions
    // translated beside their acronym, which reads as its translation would
    expect(final).toContain('Gamma model')
    expect(final).not.toContain('fast training')
    expect(final).toContain('\u8bba\u6587 \u8bba\u6587 \\\\')
    expect(final).toContain('XYZ')
    const gamma = paper.units.findIndex(u => plainSource(u) === 'Gamma model')
    expect(r.results.get(gamma)).toMatchObject({ state: 'kept', by: 'B' })
    expect(r.shownPartial).toBe(false)
    const hashes = await Promise.all(paper.units.map(sourceHash))
    const record = unitsOf(paper.units, kept, hashes, r.results)
    expect(record[gamma]).toMatchObject({ state: 'kept', group: '1:c0' })
    expect(record[gamma]?.pieces).toBeTruthy()
    expect(record[gamma]?.tr).toBeUndefined()
    expect(record.filter(u => u.group).map(u => u.group)).toEqual(['1:h', '1:h', '1:c0', '1:c1', '1:c0', '1:c1', '1:c0', '1:c1'])
    // the right side anchored by what the final set: the source for a cell kept
    expect(copyTexts(record)[gamma]?.text).toBe('Gamma model')
    // a run again takes the kept cell's translation as it is: nothing asked again for it
    const { seed } = await seedFrom({ units: record }, paper.units)
    expect(reusable(seed, { identity: 'B', copyWire: true }).get(gamma)?.current).toBe(true)
  })
})

