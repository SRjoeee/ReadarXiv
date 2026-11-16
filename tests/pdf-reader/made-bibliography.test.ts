import { describe, expect, it } from 'vitest'
import { openPaper } from '../../packages/engine/src/compile/live.ts'

// A bibliography BibTeX makes (PDF-READER §19.13; the owner's ruling of 2026-10-28: a .bbl the compile makes is a shipped one):
// a paper that ships a .bib and no .bbl (102 of the 195 local sources) had no entry units, the front end reading only the .bbl
// the package holds. The prepare's first pass, one draft of the unmarked original with BibTeX, writes the job's .bbl; the paper
// opened again with it has its entries after every other unit and every other unit and name the bundle's as before, and every
// compile after it reads it as a shipped one: written back marked, no BibTeX run over it.

const enc = (s: string) => new TextEncoder().encode(s)
const doc = (body: string, pre = '') => `\\documentclass{article}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`
const BODY = '\\section{Intro}\nAttention needs normalization \\cite{ba2016}.\n\\begin{theorem}A claim.\\end{theorem}\n\nThe second paragraph runs into the bibliography.\n\\bibliographystyle{plain}\n\\bibliography{refs}'
const PRE = '\\newtheorem{theorem}{Theorem}\n\\newtheorem{conjecture}{Conjecture}'
const BIB = '@article{ba2016, author={Jimmy Lei Ba}, title={Layer normalization}, year={2016}}\n'
const paperOf = (files: Record<string, string>) => openPaper(new Map(Object.entries(files).map(([k, v]) => [k, enc(v)])))

describe('\\bibliography inside the group of a command the role table does not know: read where TeX reads it', () => {
  // (2608.06007v1: `\\balance{ \\bibliographystyle{unsrt} \\bibliography{ref} }`, balance.sty's \\balance taking no argument,
  // its group TeX's. Read as the command's argument, one placeholder, the walk never met the \\bibliography: no .bbl was
  // made, the printed bibliography no unit's, kept blocks never translated, the References toggle dead on it)
  it('a \\bibliography a comment holds in the group is none', () => {
    const p = paperOf({ 'main.tex': doc(BODY.replace('\\bibliographystyle{plain}\n\\bibliography{refs}', '\\balance{%\\bibliography{refs}\n}'), PRE), 'refs.bib': BIB })
    expect(p.project.bibliography).toEqual([])
  })
})

