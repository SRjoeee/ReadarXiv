// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bundleUnitsOf } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { sourceHash } from '@/pdf-reader/engine/pipeline/cache.mjs'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { inMemory, loadProject } from '@/pdf-reader/engine/source/latex-front.mjs'
import { unpackSource } from '@/pdf-reader/engine/source/tar.mjs'
import { unitText } from '@/pdf-reader/engine/translate/mt.mjs'
import { LAB } from './helpers/lab-data'

// The units written inside a float (`inFloat`, the front end's: their indices in `units`, beside them): TeX sets a float away from
// where the source has it, so a unit of running text's kind written inside one (a figure's note in a paragraph of its own, a
// table's cells, a listing's caption) is no neighbour in the text of the units around it (the page stream's reach, rule 5's bound).
// The floats: figure, table (starred or not), wrapfigure, sidewaystable, algorithm, listing, and whatever they hold (a minipage, a
// subfigure); a longtable breaks across pages where it stands and is none. No unit carries it: its hash, its text, its bundle row
// and the patched source are what they were

type Unit = { kind: string; pieces: { t: string; s?: string; unit?: Unit }[] }
const enc = (s: string) => new TextEncoder().encode(s)
const project = (tex: string) => loadProject(inMemory(new Map([['main.tex', enc(tex)]])), 'main.tex', { tables: true })
const doc = (body: string, pre = '') => `\\documentclass{article}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`
const textOf = (u: Unit) => u.pieces.filter(p => p.t === 'text').map(p => p.s).join('').replace(/\s+/g, ' ').trim()
/** each unit's words and whether it is in the floats' set */
const read = (tex: string) => {
  const p = project(tex), floats = new Set(p.inFloat)
  return (p.units as unknown as Unit[]).map((u, i) => [textOf(u), floats.has(i)] as const)
}

describe('inFloat: the indices of the units written inside a float', () => {
  it('a figure\'s caption and the paragraph of its own beside it, a table\'s cells and caption; the text around them is not', () => {
    const units = read(doc([
      'The text before the figure goes on here.',
      '\\begin{figure}[t]\\centering',
      'Produced by the author from the survey data.',
      '\\caption{A figure of the results.}\\end{figure}',
      'The text after the figure goes on here.',
      '\\begin{table*}\\caption{The scores of the models.}\\begin{tabular}{ll}Model name & Its score here\\\\\\end{tabular}\\end{table*}',
      'The last paragraph of the paper here.',
    ].join('\n\n')))
    expect(units).toEqual([
      ['The text before the figure goes on here.', false],
      ['Produced by the author from the survey data.', true],
      ['A figure of the results.', true],
      ['The text after the figure goes on here.', false],
      ['The scores of the models.', true],
      ['Model name', true],
      ['Its score here', true],
      ['The last paragraph of the paper here.', false],
    ])
  })

  it('every float the parse knows, starred or not, and a minipage or a subfigure inside one', () => {
    const body = [
      '\\begin{figure*}\\caption{Figure star caption words.}\\end{figure*}',
      '\\begin{table}\\caption{Table plain caption words.}\\end{table}',
      '\\begin{wrapfigure}{r}{0.4\\textwidth}\\caption{Wrapped figure caption words.}\\end{wrapfigure}',
      '\\begin{sidewaystable}\\caption{Sideways table caption words.}\\end{sidewaystable}',
      '\\begin{algorithm}\\caption{Algorithm caption words here.}\\end{algorithm}',
      '\\begin{listing}\\caption{Listing caption words here.}\\end{listing}',
      '\\begin{figure}\\begin{minipage}{0.5\\linewidth}Words in a minipage of a figure.\\end{minipage}\\begin{subfigure}{0.4\\linewidth}Words in a subfigure here.\\end{subfigure}\\end{figure}',
    ].join('\n\n')
    const units = read(doc(body, '\\usepackage{wrapfig,rotating,algorithm,minted,subcaption}'))
    expect(units.map(([t]) => t)).toEqual(['Figure star caption words.', 'Table plain caption words.', 'Wrapped figure caption words.', 'Sideways table caption words.', 'Algorithm caption words here.', 'Listing caption words here.', 'Words in a minipage of a figure.', 'Words in a subfigure here.'])
    expect(units.every(([, f]) => f)).toBe(true)
  })

  it('a longtable is no float; a minipage outside a float is none; a float\'s end ends it, nested or not', () => {
    const units = read(doc([
      '\\begin{longtable}{ll}A long cell & Its other cell\\\\\\end{longtable}',
      '\\begin{minipage}{\\linewidth}Words in a minipage alone.\\end{minipage}',
      '\\begin{figure}\\begin{minipage}{\\linewidth}Inside the figure words.\\end{minipage}\\end{figure}',
      'After the figure, running text again.',
    ].join('\n\n'), '\\usepackage{longtable}'))
    expect(units).toEqual([
      ['A long cell', false],
      ['Its other cell', false],
      ['Words in a minipage alone.', false],
      ['Inside the figure words.', true],
      ['After the figure, running text again.', false],
    ])
  })

  it('a footnote nested in a float\'s caption is in the set by its own index, and its parent\'s hash is the hash it has outside a float', async () => {
    const body = (env: string) => doc(`Running text before the figure here.\n\n\\begin{${env}}Produced by the author.\\caption{The figure words\\footnote{A note in the caption here.} here.}\\end{${env}}\n\nRunning text after it.`)
    const inside = project(body('figure')), outside = project(body('center'))
    const units = inside.units as unknown as Unit[]
    const parent = units.findIndex(u => u.pieces.some(p => p.t === 'nested')), note = units.findIndex(u => textOf(u) === 'A note in the caption here.')
    expect(parent).toBeGreaterThanOrEqual(0)
    expect(units[parent]?.pieces.find(p => p.t === 'nested')?.unit).toBe(units[note])
    expect(inside.inFloat).toEqual(expect.arrayContaining([parent, note]))
    expect(outside.inFloat).toEqual([])
    // the units, their hashes, their texts and their bundle rows are those of the same source with the float a plain container
    expect(units.length).toBe(outside.units.length)
    for (let i = 0; i < units.length; i++) {
      expect(await sourceHash(units[i] as never), `unit ${i}`).toBe(await sourceHash(outside.units[i] as never))
      expect(unitText(units[i]?.pieces as never)).toEqual(unitText(outside.units[i]?.pieces as never))
      expect(Object.keys(units[i] as object)).not.toContain('inFloat')
    }
    const files = (env: string) => new Map([['main.tex', enc(body(env))]])
    const a = openPaper(files('figure')), b = openPaper(files('center'))
    expect(a.inFloat).toEqual(inside.inFloat)
    expect(JSON.stringify(bundleUnitsOf(a))).toBe(JSON.stringify(bundleUnitsOf(b)))
  })

  it('a list of numbers, rising: it survives JSON and a copy of the units', () => {
    const p = project(doc('Text before.\n\n\\begin{figure}\\caption{One caption words.}\\end{figure}\n\nText between.\n\n\\begin{table}\\caption{Two caption words.}\\end{table}'))
    expect(p.inFloat).toEqual([1, 3])
    expect(JSON.parse(JSON.stringify(p.inFloat))).toEqual(p.inFloat)
    expect(structuredClone({ units: p.units.map(u => ({ ...u })), inFloat: p.inFloat }).inFloat).toEqual([1, 3])
  })
})

// ---------------------------------------------------------------- the thesis (AXT_LAB): the units rule 5's bound tripped on
describe.skipIf(!LAB)('inFloat on 2307.16209 (the thesis): a figure\'s note is in its float, the text after it is not', () => {
  it('units 165 and 167, 176 and 177', async ({ skip }) => {
    const file = join(LAB as string, 'data/layout/2307.16209v1/source.gz')
    if (!existsSync(file)) skip()
    const source = await unpackSource(new Uint8Array(readFileSync(file)))
    if (!('files' in source)) throw new Error('the source is a PDF')
    const paper = openPaper(source.files), floats = new Set(paper.inFloat)
    const units = paper.units as unknown as Unit[]
    const at = (i: number) => [textOf(units[i] as Unit).slice(0, 40), floats.has(i)]
    // a figure's notes, each a paragraph of its own after its caption, and the text after them: TeX set the float with its note
    // on p52, after the text that follows it in the source (u167, on p51)
    expect(at(165)).toEqual([expect.stringMatching(/^Produced by the author/), true])
    expect(at(167)).toEqual([expect.stringMatching(/^Now we want to investigate/), false])
    expect(at(176)).toEqual([expect.stringMatching(/^Adapted from/), true])
    expect(at(177)).toEqual([expect.stringMatching(/^Now, let us focus/), false])
  })
})
