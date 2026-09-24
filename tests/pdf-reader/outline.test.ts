import { describe, expect, it } from 'vitest'
import { unitsOf } from '@/pdf-reader/engine/cache.mjs'
import { inMemory, loadProject } from '@/pdf-reader/engine/latex-front.mjs'
import { outlineOf } from '@/pdf-reader/outline'

const project = (tex: string) => loadProject(inMemory(new Map([['main.tex', new TextEncoder().encode(tex)]])), 'main.tex')
const TEX = '\\documentclass{article}\\begin{document}\\title{The Paper}\\maketitle\n\\section{Introduction}Words here.\n\\subsection{Setting up}More words.\n\\subsubsection{Details}Yet more.\n\\paragraph{Aside}An aside.\n\\section{Results}The end.\\end{document}'

describe('the contents (the reader\'s design, §6.3, §10.4)', () => {
  it('a heading keeps the depth of its sectioning command; a paragraph heading has none', () => {
    const headings = project(TEX).units.filter((u: { kind: string }) => u.kind === 'heading')
    expect(headings.map((u: { depth?: number; title?: boolean }) => [u.title ?? false, u.depth])).toEqual([[true, undefined], [false, 1], [false, 2], [false, 3], [false, undefined], [false, 1]])
  })

  it('keeps the depth in the stored copy', () => {
    const units = project(TEX).units
    const stored = unitsOf(units, new Set(), units.map(() => 'h'), new Map())
    expect(stored.filter((u: { kind: string }) => u.kind === 'heading').map((u: { depth?: number }) => u.depth)).toEqual([undefined, 1, 2, 3, undefined, 1])
  })

  it('ranks the levels among the depths the paper uses, three at most, the title left out', () => {
    const h = (id: number, depth?: number, title = false) => ({ id, depth, title, src: `H${id}` })
    const entries = outlineOf([h(0, undefined, true), h(1, 0), h(2, 1), h(3, 2), h(4, 3), h(5, 0)], id => `T${id}`, id => id)
    expect(entries.map(e => [e.id, e.level, e.title, e.original, e.page])).toEqual([[1, 1, 'T1', 'H1', 1], [2, 2, 'T2', 'H2', 2], [3, 3, 'T3', 'H3', 3], [5, 1, 'T5', 'H5', 5]])
  })

  it('lists a copy stored before depths flat, not empty', () => {
    const entries = outlineOf([{ id: 2, src: 'Intro' }, { id: 5, src: 'Method' }], () => undefined, () => null)
    expect(entries.map(e => [e.level, e.title])).toEqual([[1, 'Intro'], [1, 'Method']])
  })
})
