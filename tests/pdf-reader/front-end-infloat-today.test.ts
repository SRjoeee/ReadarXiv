import { describe, expect, it } from 'vitest'
import { bundleUnitsOf } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'
import { inMemory, loadProject } from '@/pdf-reader/engine/source/latex-front.mjs'
import { sourceHash, unitText } from '../../packages/engine/tests/helpers/unit-harness.ts'

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

describe('inFloat: the indices of the units written inside a float', () => {

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

})

// ---------------------------------------------------------------- the thesis (AXT_LAB): the units rule 5's bound tripped on
