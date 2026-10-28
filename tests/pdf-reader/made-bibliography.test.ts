import { describe, expect, it } from 'vitest'
import { bundleUnitsOf } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { bibliographyKept, madeBibliography, markedOfPaper } from '@/pdf-reader/engine/layout/paper.mjs'
import { LAYOUT_CLASSES } from '@/pdf-reader/engine/layout/marks.mjs'
import { openPaper, originalFiles, type CompileRequest } from '@/pdf-reader/engine/pipeline/live.mjs'

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
const BBL = '\\begin{thebibliography}{1}\n\n\\bibitem{ba2016}\nJimmy~Lei Ba.\n\\newblock Layer normalization.\n\\newblock 2016.\n\n\\end{thebibliography}\n'
const paperOf = (files: Record<string, string>) => openPaper(new Map(Object.entries(files).map(([k, v]) => [k, enc(v)])))
const source = (more: Record<string, string> = {}) => paperOf({ 'main.tex': doc(BODY, PRE), 'refs.bib': BIB, ...more })
/** a host's compile of the draft with BibTeX: TeX ran through (AXT-END), and the files the pass and BibTeX wrote */
const host = (files: Record<string, string>, { ok = true, end = true, returned = true } = {}) => {
  const asked: CompileRequest[] = []
  const compile = async (req: CompileRequest) => {
    asked.push(req)
    return { ok, log: end ? 'This is pdfTeX\nAXT-END\n' : 'This is pdfTeX\n', ...(returned ? { files: new Map(Object.entries(files).map(([k, v]) => [k, enc(v)])) } : {}) }
  }
  return { asked, compile }
}
const AUX = '\\relax\n\\citation{ba2016}\n\\bibstyle{plain}\n\\bibdata{refs}\n'
const kinds = (p: ReturnType<typeof paperOf>) => (p.units as unknown as { kind: string }[]).map(u => u.kind)

describe('\\bibliography ends the paragraph before it, with the job\'s .bbl and without', () => {
  it('cuts the same source units whether the package holds the .bbl or not: none of them moves when BibTeX writes it', () => {
    const without = source(), withBbl = source({ 'main.bbl': BBL })
    const n = without.units.length
    expect(JSON.stringify(bundleUnitsOf(withBbl).slice(0, n))).toBe(JSON.stringify(bundleUnitsOf(without).slice(0, n)))
    // (the paragraph before it holds no placeholder of \\bibliography's; the entry after every other unit)
    expect(kinds(withBbl).slice(n)).toEqual(['reference'])
    expect(JSON.stringify(without.units.at(-1))).not.toContain('bibliography{')
    expect(without.project.bibliography).toEqual(['refs'])
  })
})

describe('madeBibliography: the job\'s .bbl BibTeX makes in the prepare\'s first pass, the paper opened again with it', () => {
  it('asks one draft of the unmarked original with BibTeX, its files, and opens the paper with the .bbl it wrote: its entries last', async () => {
    const paper = source(), { asked, compile } = host({ 'main.aux': AUX, 'main.bbl': BBL })
    const r = await madeBibliography(paper, { compile })
    expect('made' in r && r.made.path).toBe('main.bbl')
    expect(asked).toHaveLength(1)
    expect(asked[0]).toMatchObject({ main: 'main.tex', engine: 'pdflatex', rerun: false, bibtex: true, draft: true, files: true })
    // (the unmarked original: the paper's own main file with graphicx's draft and the end marker, nothing else of ours)
    expect(new TextDecoder().decode(asked[0]!.overrides.get('main.tex'))).toMatch(/^\\PassOptionsToPackage\{draft\}\{graphicx\}.*AXT-END/)
    if (!('paper' in r)) throw new Error('no paper')
    const again = r.paper, n = paper.units.length
    // (every unit before the entries and every name after them the bundle's as before, byte for byte; the entry after them)
    const was = bundleUnitsOf(paper), now = bundleUnitsOf(again)
    expect(JSON.stringify(now.slice(0, n))).toBe(JSON.stringify(was.slice(0, n)))
    expect(JSON.stringify(now.slice(n + 1))).toBe(JSON.stringify(was.slice(n)))
    expect(now[n]?.[0]).toBe('reference')
    expect(again.names).toEqual(paper.names)
    // (a shipped .bbl from here on: the marked original writes it back marked, and asks no BibTeX)
    expect(again.meta.bbl).toBe(true)
    expect(new TextDecoder().decode(originalFiles(again, { layout: LAYOUT_CLASSES }).get('main.bbl'))).toContain(`\\leavevmode\\axtmark{${n}s}Jimmy`)
    const marked = host({})
    await markedOfPaper(again, { compile: async req => { marked.asked.push(req); return { ok: false, log: '' } }, final: false })
    expect(marked.asked.length).toBeGreaterThan(0)
    expect(marked.asked.every(q => q.bibtex === false)).toBe(true)
  })
  it('asks the host which compiler made arXiv\'s PDF first, where the package names none, and the paper opened again keeps it', async () => {
    const paper = source()
    expect(paper.meta.compilerGuessed).toBe(true)
    const { asked, compile } = host({ 'main.aux': AUX, 'main.bbl': BBL })
    const r = await madeBibliography(paper, { compile, compilerOf: async () => 'xelatex' })
    expect(asked[0]?.engine).toBe('xelatex')
    expect('paper' in r && [r.paper.meta.compiler, r.paper.meta.compilerGuessed]).toEqual(['xelatex', false])
  })
  it('makes none where the package ships the .bbl, names no \\bibliography, loads biblatex, or lacks a .bib it names: no compile', async () => {
    const cases: [ReturnType<typeof paperOf>, string][] = [
      [source({ 'main.bbl': BBL }), 'shipped'],
      [paperOf({ 'main.tex': doc('Words with no bibliography.'), 'refs.bib': BIB }), 'none'],
      [paperOf({ 'main.tex': doc('Words \\cite{ba2016}.\n\n\\printbibliography', '\\usepackage[backend=bibtex]{biblatex}\n\\addbibresource{refs.bib}'), 'refs.bib': BIB }), 'none'],
      [paperOf({ 'main.tex': doc(BODY, '\\usepackage{biblatex}'), 'refs.bib': BIB }), 'biblatex'],
      [paperOf({ 'main.tex': doc(BODY, PRE) }), 'bib-missing'],
    ]
    for (const [paper, why] of cases) {
      const { asked, compile } = host({ 'main.aux': AUX, 'main.bbl': BBL })
      // (and said before, for a host that orders its steps by it)
      expect(bibliographyKept(paper), why).toBe(why)
      expect(await madeBibliography(paper, { compile }), why).toMatchObject({ kept: why })
      expect(asked, why).toHaveLength(0)
    }
    expect(bibliographyKept(source())).toBeNull()
  })
  it('keeps the paper as it was where the pass fails or says the bibliography is none BibTeX makes for this job alone', async () => {
    const cases: [Parameters<typeof host>, string][] = [
      [[{ 'main.aux': AUX, 'main.bbl': BBL }, { ok: false }], 'compile'],
      [[{ 'main.aux': AUX, 'main.bbl': BBL }, { end: false }], 'compile'],
      [[{ 'main.aux': AUX, 'main.bbl': BBL }, { returned: false }], 'no-files'],
      // (chapterbib's or bibunits' job beside the main one's, which a one-pass request never runs BibTeX on)
      [[{ 'main.aux': AUX, 'chap1.aux': '\\bibdata{refs}\n', 'main.bbl': BBL }], 'aux-jobs'],
      // (an aux naming a .bib the package lacks: latexmk -norc runs no BibTeX then)
      [[{ 'main.aux': '\\citation{ba2016}\n\\bibdata{refs,other}\n', 'main.bbl': BBL }], 'bib-missing'],
      [[{ 'main.aux': AUX, 'main.bcf': '<bcf:controlfile/>', 'main.bbl': BBL }], 'biber'],
      [[{ 'main.aux': AUX }], 'no-bbl'],
      [[{ 'main.aux': AUX, 'main.bbl': '\\begin{thebibliography}{0}\n\\end{thebibliography}\n' }], 'no-bbl'],
      // (a .bbl that is more than a bibliography: a heading of its own among the source's units moves the units after it)
      [[{ 'main.aux': AUX, 'main.bbl': `\\section*{Notes}\nA note BibTeX never writes.\n\n${BBL}` }], 'moved'],
    ]
    for (const [args, why] of cases) {
      const paper = source(), { compile } = host(...args)
      const r = await madeBibliography(paper, { compile })
      expect(r, why).toMatchObject({ kept: why })
      expect(paper.meta.bbl, why).toBe(false)
    }
  })
  it('takes a host\'s throw for the pass\'s failure, and a host that runs no such compiler for none', async () => {
    const paper = source()
    expect(await madeBibliography(paper, { compile: async () => { throw new Error('the jail is down') } })).toMatchObject({ kept: 'compile' })
    expect(await madeBibliography(paper, { compile: host({}).compile, engines: ['xelatex'] })).toMatchObject({ kept: 'engine' })
  })
})
