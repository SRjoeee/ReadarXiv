import { describe, expect, it } from 'vitest'
import { inMemory, loadProject, patch } from '@/pdf-reader/engine/latex-front.mjs'

// The PDF reader's LaTeX front end: what of a paper's source is prose to translate

type Unit = { kind: string; pieces: { t: string; s?: string }[] }

describe('loadProject: a file \\input under another spelling is the file the source package holds', () => {
  const enc = (s: string) => new TextEncoder().encode(s)
  const files = () => inMemory(new Map([
    ['main.tex', enc('\\documentclass{article}\n\\begin{document}\n\\input{./sections/a.tex}\n\\input{sections/b}\n\\input{sections/../sections/a}\n\\end{document}\n')],
    ['sections/a.tex', enc('First paragraph of a.\n')],
    ['sections/b.tex', enc('Second paragraph of b.\n')],
  ]))
  it('names \\input{./sections/a.tex} sections/a.tex, so the translation written back replaces that file rather than sitting beside it under ./sections/a.tex, where the compile set the English over it (2608.08350: every unit past the abstract)', () => {
    const p = loadProject(files(), 'main.tex')
    const units = p.units as (Unit & { file: string })[]
    expect([...new Set(units.map(u => u.file))]).toEqual(['sections/a.tex', 'sections/b.tex'])
    const translated = new Map(units.map((u, i) => [u, u.pieces.map(x => (x.t === 'text' ? { ...x, tr: true, s: `<T${i}>` } : x))]))
    const out = patch(p, translated as Map<(typeof p.units)[number], unknown[]>)
    expect([...out.keys()].sort()).toEqual(['main.tex', 'sections/a.tex', 'sections/b.tex'])
    expect(new TextDecoder().decode(out.get('sections/a.tex'))).toContain('<T0>')
  })
  it('walks a file once, however many spellings name it', () => {
    const p = loadProject(files(), 'main.tex')
    expect((p.units as (Unit & { file: string })[]).filter(u => u.file === 'sections/a.tex')).toHaveLength(1)
  })
})

describe('loadProject: a file named through import.sty or subfiles is the one TeX reads', () => {
  const enc = (s: string) => new TextEncoder().encode(s)
  const fileOf = (u: Unit) => (u as Unit & { file: string }).file
  const filesOf = (main: string, rest: [string, string][]) => [...new Set((loadProject(inMemory(new Map([['main.tex', enc(`\\documentclass{article}\n\\begin{document}\n${main}\n\\end{document}\n`)], ...rest.map(([f, t]) => [f, enc(t)] as [string, Uint8Array])])), 'main.tex').units as Unit[]).map(fileOf))]
  it('\\import{dir/}{file} is dir/file; an \\input in it looks in dir/ before the root (import.sty puts dir/ first on \\input@path), a \\subimport goes on from dir/', () => {
    expect(filesOf('\\import{chapters/}{one}\n\\inputfrom{./chapters}{two.tex}', [
      ['chapters/one.tex', 'Prose of one.\n\n\\input{fig}\n\n\\subimport{deep/}{three}\n\n\\input{root}\n'],
      ['chapters/fig.tex', 'Prose of the chapter\'s figure.\n'],
      ['fig.tex', 'Prose of the root\'s figure, which TeX does not read here.\n'],
      ['chapters/deep/three.tex', 'Prose of three.\n'],
      ['root.tex', 'Prose found at the root, the directory having none.\n'],
      ['chapters/two.tex', 'Prose of two.\n'],
    ])).toEqual(['chapters/one.tex', 'chapters/fig.tex', 'chapters/deep/three.tex', 'root.tex', 'chapters/two.tex'])
  })
  it('\\subfile{chapters/ch1} is chapters/ch1.tex, and an \\input in it looks in chapters/ first (subfiles loads it by \\subimport)', () => {
    expect(filesOf('\\subfile{./chapters/ch1}', [
      ['chapters/ch1.tex', '\\documentclass[../main.tex]{subfiles}\n\\begin{document}\nProse of the chapter.\n\n\\input{table}\n\\end{document}\n'],
      ['chapters/table.tex', 'Prose of the chapter\'s table.\n'],
    ])).toEqual(['chapters/ch1.tex', 'chapters/table.tex'])
  })
})
const project = (tex: string) => loadProject(inMemory(new Map([['main.tex', new TextEncoder().encode(tex)]])), 'main.tex')
const textOf = (u: Unit) => u.pieces.filter(p => p.t === 'text').map(p => p.s).join('')
/** every unit's words replaced by a mark of its own, and the main file as it is then typeset */
const patched = (p: ReturnType<typeof project>) => {
  const units = p.units as Unit[]
  const translated = new Map(units.map((u, i) => [u, u.pieces.map(x => (x.t === 'text' ? { ...x, tr: true, s: `<T${i}>` } : x))]))
  return new TextDecoder().decode(patch(p, translated as Map<(typeof p.units)[number], unknown[]>).get('main.tex'))
}

describe('the front matter\'s notes (1706.03762: the author block\'s footnotes stayed in English)', () => {
  const AUTHORS = '\\author{Alice\\thanks{Equal contribution. Listing order is random.}\\\\ Bob\\footnotemark[1] \\hspace{1mm}\\thanks{Work performed while at X.}}'

  it('in the preamble: each \\thanks of the author block is a footnote of its own, and the names are no unit', () => {
    const p = project(`\\documentclass{article}\\title{The Paper}${AUTHORS}\\begin{document}\\maketitle\nWords here.\\end{document}`)
    const units = p.units as Unit[]
    expect(units.filter(u => u.kind === 'footnote').map(textOf)).toEqual(['Equal contribution. Listing order is random.', 'Work performed while at X.'])
    expect(units.some(u => /Alice|Bob/.test(textOf(u)))).toBe(false)
    // typeset: the notes translated in place, the names, marks and spacing as the author wrote them
    const tex = patched(p)
    expect(tex).toMatch(/\\author\{Alice\\thanks\{<T\d+>\}\\\\ Bob\\footnotemark\[1\] \\hspace\{1mm\}\\thanks\{<T\d+>\}\}/)
  })

  it('in the body too, where some classes want the author block', () => {
    const p = project(`\\documentclass{article}\\begin{document}\\title{The Paper}${AUTHORS}\\maketitle\nWords here.\\end{document}`)
    expect((p.units as Unit[]).filter(u => u.kind === 'footnote').map(textOf)).toEqual(['Equal contribution. Listing order is random.', 'Work performed while at X.'])
    expect(patched(p)).toContain('\\author{Alice\\thanks{<T')
  })

  it('an affiliation\'s note as well; the title\'s note stays the title\'s, and the title is still the title', () => {
    const p = project('\\documentclass{article}\\title{The Paper\\thanks{Supported by a grant.}}\\author{Alice}\\affil{Somewhere\\thanks{Now elsewhere.}}\\begin{document}\\maketitle\nWords.\\end{document}')
    const units = p.units as (Unit & { title?: boolean })[]
    expect(units.filter(u => u.kind === 'footnote').map(textOf).sort()).toEqual(['Now elsewhere.', 'Supported by a grant.'])
    expect(units.filter(u => u.title).map(textOf)).toEqual(['The Paper'])
    expect(units.some(u => /Somewhere|Alice/.test(textOf(u)))).toBe(false)
  })
})

describe('a display outside a unit\'s marks (the reader\'s anchors take it from beyond them: 211 of 747 displays were lit with no unit)', () => {
  const body = (b: string) => project(`\\documentclass{article}\\begin{document}\n${b}\n\\end{document}`).units as (Unit & { lead?: string; trail?: string })[]
  const flags = (b: string) => body(b).map(u => [textOf(u).trim().split(' ')[0], typeof u.lead === 'string', typeof u.trail === 'string'])

  it('the hint is the display\'s letters, as the page sets them: the words a command sets, and a subscript run on with its letter (the review of A1, I1)', () => {
    const [u] = body('It holds that\n\\begin{equation} N_{\\text{out}} = \\log x + \\softmax(y) \\end{equation}\n\nNext.')
    for (const w of ['nout', 'log', 'softmax', 'x', 'y']) expect(u?.trail).toContain(w)
    expect(u?.trail).not.toContain('model')
  })

  it('a display between a unit\'s words is its inner one, its letters too (the review of A1, M1: the fill across a page break is for these)', () => {
    const [u, v] = body('It holds that \\[ x_{ij} = y \\] for all i.\n\nPlain words, $z$ inline, no display.')
    expect(u).toMatchObject({ inner: expect.stringContaining('xij') })
    expect(v).not.toHaveProperty('inner')
  })

  it('with the paper\'s own macros put in, and ℓ read as l: \\rma_{kk} sets akk, W^\\ell W sets wlw (2608.08350)', () => {
    const [u] = body('\\def\\rma{{\\mathrm{a}}}\\newcommand{\\E}{\\mathbb{E}}\n\nIt holds that\n\\[ \\E\\,\\rma_{kk} = W^\\ell W \\]\n\nNext.')
    for (const w of ['akk', 'wlw', 'e']) expect(u?.trail).toContain(w)
  })

  it('a paragraph that ends with a display trails it; one that opens with a display leads with it', () => {
    expect(flags('It holds that\n\\begin{equation}a = b\\end{equation}\n\n\\[ c = d \\]\nwhere c is given.\n\nPlain words, $x$ inline, and an \\[ e \\] inner display in the middle of it.')).toEqual([
      ['It', false, true], ['where', true, false], ['Plain', false, false]])
  })

  it('a display standing alone after a paragraph is the paragraph\'s; after a heading, or apart from it by a figure, nobody\'s', () => {
    expect(flags('First words here.\n\n\\begin{align}a &= b\\end{align}\n\n\\section{A Heading}\n\n\\[ x \\]\n\nMore words.\n\n\\begin{figure}\\caption{A caption.}\\end{figure}\n\n\\[ y \\]\n\nLast.')).toEqual([
      ['First', false, true], ['A', false, false], ['More', false, false], ['A', false, false], ['Last.', false, false]])
  })

  it('an inline formula, an inline math environment and $$ at the head of a paragraph are no display beyond its marks', () => {
    // $$ counts as inline for the start mark (patch), which goes before it
    expect(flags('\\begin{math}m\\end{math} opens this one.\n\n$$ d $$ and this one.\n\nThis ends inline $x$')).toEqual([
      ['opens', false, false], ['and', false, false], ['This', false, false]])
  })
})
