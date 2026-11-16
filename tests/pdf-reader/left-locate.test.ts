import { describe, expect, it } from 'vitest'
import { inMemory, loadProject } from '../../packages/engine/src/source/latex-front.ts'

// Two roots of units the left located nowhere (the owner's report on 1810.04805v2, 2026-10-30): a unit without marks is searched
// between its marked neighbours, which were read in the units' numbers' order, the bibliography's entries numbered after the
// appendix (page 16: its paragraphs the marks did not bound searched between the appendix's last and an entry on page 10, an
// empty window); and a footnote over a page break owned the next page's column between its two parts (page 4: the headings
// there, matched inside it, placed nowhere)

describe('the front end: the units in the order TeX sets them (texOrder)', () => {
  const enc = (s: string) => new TextEncoder().encode(s)
  it('an appendix after the bibliography: its entries are numbered last, set before the appendix', () => {
    const p = loadProject(inMemory(new Map([['main.tex', enc('\\documentclass{article}\\begin{document}\nThe body of the paper.\n\\begin{thebibliography}{1}\n\\bibitem{a} A first entry of the list.\n\\bibitem{b} A second entry of the list.\n\\end{thebibliography}\n\\appendix\n\\section{More}\nThe appendix text here.\n\\end{document}')]])), 'main.tex')
    const kinds = p.units.map(u => u.kind)
    expect(kinds).toEqual(['para', 'heading', 'para', 'reference', 'reference'])
    expect(p.texOrder).toEqual([0, 3, 4, 1, 2])
  })
  it('nothing moved: null', () => {
    const p = loadProject(inMemory(new Map([['main.tex', enc('\\documentclass{article}\\begin{document}\nOne paragraph.\n\n\\section{A head}\nAnother one.\n\\end{document}')]])), 'main.tex')
    expect(p.texOrder).toBeNull()
  })
})

