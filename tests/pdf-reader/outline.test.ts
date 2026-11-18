import { describe, expect, it } from 'vitest'
import { inMemory, loadProject } from '../../packages/engine/src/source/latex-front.ts'

const project = (tex: string) => loadProject(inMemory(new Map([['main.tex', new TextEncoder().encode(tex)]])), 'main.tex')
const TEX = '\\documentclass{article}\\begin{document}\\title{The Paper}\\maketitle\n\\section{Introduction}Words here.\n\\subsection{Setting up}More words.\n\\subsubsection{Details}Yet more.\n\\paragraph{Aside}An aside.\n\\section{Results}The end.\\end{document}'

describe('the contents (the reader\'s design, §6.3, §10.4)', () => {
  it('a heading keeps the depth of its sectioning command; a paragraph heading has none', () => {
    const headings = project(TEX).units.filter((u: { kind: string }) => u.kind === 'heading')
    expect(headings.map((u: { depth?: number; title?: boolean }) => [u.title ?? false, u.depth])).toEqual([[true, undefined], [false, 1], [false, 2], [false, 3], [false, undefined], [false, 1]])
  })

})
