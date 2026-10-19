import { describe, expect, it } from 'vitest'
import { openPaper, originalFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { LAYOUT_CLASSES, NAMES_TEX } from '@/pdf-reader/engine/layout/marks.mjs'
import { paperParams, readArgs, textless } from '@/pdf-reader/engine/rules/arg-roles.mjs'

// A unit, and a mark, are made only of text TeX typesets where it stands: an argument TeX reads as syntax — a length or
// a number, a key, a label or a file name, a loop's variables and list — is never walked as text and never takes a mark.
// The 50-paper sweep's papers whose marked original stopped TeX or set other pages: 2610.21765's \hrule\n\vspace{0.5mm}
// (\vspace read as \hrule's dimension, its 0.5mm a unit), 2610.21377's pgffor loops (`\foreach \ii in {0,...,3} {`, its
// header a unit and the body's brace written twice), 2610.21201's etoc key (\etocdepthtag.toc{main}, the mark written
// into the contents file), and REVTeX's appendix sections (\appendixname's name marks expanded inside \if!#1!)

type Piece = { t: string; s?: string; src?: string; id?: number }
type Unit = { kind: string; pieces: Piece[] }
const enc = (s: string) => new TextEncoder().encode(s)
const doc = (body: string, pre = '') => `\\documentclass{article}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`
const paper = (tex: string) => openPaper(new Map([['main.tex', enc(tex)]]))
const textOf = (u: Unit) => u.pieces.filter(p => p.t === 'text').map(p => p.s).join('').replace(/\s+/g, ' ').trim()
const texts = (tex: string) => (paper(tex).units as unknown as Unit[]).map(textOf)
const marked = (tex: string) => new TextDecoder().decode(originalFiles(paper(tex), { lines: true }).get('main.tex'))
/** the source's braces, outside comments and escaped braces: the marked original's must be the source's */
const balance = (tex: string) => [...tex.replace(/(^|[^\\])%.*$/gm, '$1').replace(/\\[{}]/g, '')].reduce((n, c) => n + (c === '{' ? 1 : c === '}' ? -1 : 0), 0)
/** the body as the marked original has it, what the reader wrote around the paper's own source taken out */
const body = (tex: string) => tex.slice(tex.indexOf('\\begin{document}'))

describe('a value in TeX\'s own syntax is never a command that reads arguments of its own', () => {
  const read = (src: string, name: string) => {
    const params = paperParams(name, null)
    if (!params) throw new Error(`no parameters for ${name}`)
    const r = readArgs(src, 0, params)
    return r.complete ? r.args.map(a => src.slice(a.start, a.end).trim()) : null
  }
  it('\\hrule\\n\\vspace{0.5mm}: the rule takes no dimension, the space is its own call (2610.21765)', () => {
    expect(read('\n\\vspace{0.5mm}', 'hrule')).toEqual([])
    expect(read('\\baselineskip', 'vskip')).toEqual(['\\baselineskip'])
    expect(read(' 3pt plus 1fil', 'vskip')).toEqual(['3pt plus 1fil'])
  })
  it('nor any command the table reads parameters for (\\vskip, \\kern, \\hskip, \\section): each is a call of its own', () => {
    expect(read('\\vskip 4pt Words', 'hrule')).toEqual([])
    expect(read('\\kern 2pt', 'hrule')).toEqual([])
    expect(read('\\hskip 1em', 'vrule')).toEqual([])
    expect(read('\n\\section{Introduction}', 'hrule')).toEqual([])
    expect(texts(doc('\\hrule\\vskip 4pt Words after the rule.'))).toEqual(['Words after the rule.'])
    const tex = doc('Words before.\n\n\\hrule\n\\section{Introduction}\nWords of the section.')
    expect(texts(tex)).toEqual(['Words before.', 'Introduction', 'Words of the section.'])
    expect(marked(tex)).not.toMatch(/\\vskip 4\\leavevmode|\\section\{[^}]*\\(?:axt|leavevmode)/)
  })
  it('a command whose expansion is the value is still a value: \\number, \\the, \\fontdimen (no unit after it is text)', () => {
    expect(read('\\number\\count0 pt', 'vskip')).toEqual(['\\number'])
    for (const src of ['\\vskip\\number\\count0 pt', '\\vskip\\the\\dimexpr 2pt\\relax', '\\kern\\fontdimen2\\font']) expect(texts(doc(`${src} Words of the paragraph.`)), src).toEqual(['Words of the paragraph.'])
    // and the cut of a command that reads parameters of its own stays
    expect(texts(doc('\\hrule\\vskip 4pt Words after the rule.'))).toEqual(['Words after the rule.'])
    expect(texts(doc('\\hrule\n\\section{Introduction}\nWords of the section.'))).toEqual(['Introduction', 'Words of the section.'])
  })
  it('its group is no unit, and nothing of the reader\'s goes inside it', () => {
    // (as 2610.21765 has it: the rules after a list, the unit that follows beginning at them)
    const tex = doc('\\begin{itemize}\n  \\item[] Ext - a randomness extractor.\n\\end{itemize}\n\\hrule\n\\vspace{0.5mm}\n\\hrule\n\\vspace{0.2cm}\n{\\bf Protocol for the cycle}\n\\vspace{0.2cm}\n\nWords after the rules.')
    expect(texts(tex)).toEqual(['Ext - a randomness extractor.', 'Protocol for the cycle', 'Words after the rules.'])
    expect(marked(tex)).not.toMatch(/\\vspace\{[^}]*\\(?:axt|leavevmode)/)
  })
})

describe('a package\'s delimited syntax the role table knows is syntax: pgffor\'s loop, etoc\'s tag', () => {
  it('\\foreach <variable> in {<list>} {<body>}: the header no unit, the body\'s words its own, the braces as the source has them (2610.21377)', () => {
    const tex = doc('Words before the loop.\n\n\\foreach \\ii in {0,...,3} {\n\n    Words of the loop\'s body, a paragraph of its own.\n\n}\n\nWords after the loop.')
    const got = texts(tex)
    expect(got.filter(t => /\.\.\.|\bin 0/.test(t))).toEqual([])
    expect(got).toContain('Words of the loop\'s body, a paragraph of its own.')
    expect(balance(body(marked(tex)))).toBe(balance(body(tex)))
  })
  it('a sentence of prose with `in` and braces beside a loop is prose; the loop\'s header is none', () => {
    const got = texts(doc('We count the cells in {\\em every} row of the grid, as in {[}3{]}.\n\n\\foreach \\ii in {0,...,3} {\\ii, }\n\nWords after the loop.'))
    expect(got).toEqual(['We count the cells in every row of the grid, as in [3].', 'Words after the loop.'])
  })
  it('a \\foreach over a macro\'s list is not read by the form (its list no brace): no letter of the words after it is taken', () => {
    expect(texts(doc('\\foreach \\x in \\mylist {\\x, }and more words here.'))).toEqual(['in and more words here.'])
    expect(texts(doc('\\foreach \\x in \\mylist {\\x, }\nNext words of the paragraph.')).at(-1)).toMatch(/Next words of the paragraph\.$/)
  })
  it('\\etocdepthtag.toc{<tag>}: no unit, no mark in the tag (2610.21201)', () => {
    const tex = doc('\\etocdepthtag.toc{main}\n\nA first paragraph of the paper.')
    expect(texts(tex)).toEqual(['A first paragraph of the paper.'])
    expect(marked(tex)).toContain('\\etocdepthtag.toc{main}')
  })
})

describe('a unit that ends in a group\'s opening brace holds that brace', () => {
  it('the marked original\'s braces are the source\'s: the brace is written once', () => {
    const tex = doc('Words of a paragraph, and then a group {\n\nWords inside the group, a paragraph of their own.\n\n}\n\nWords after.')
    expect(balance(body(marked(tex)))).toBe(balance(body(tex)))
  })
})

describe('a declaration that takes no argument takes no value: the digits after it are text', () => {
  it('\\bfseries 100, \\noindent 38, \\noindent = 40 (2610.19159)', () => {
    expect(texts(doc('A score of {\\bfseries 100} runs in all.'))).toEqual(['A score of 100 runs in all.'])
    expect(texts(doc('\\noindent 38 papers were read.'))).toEqual(['38 papers were read.'])
    expect(texts(doc('\\noindent = 40 by the count.'))).toEqual(['= 40 by the count.'])
  })
  it('nor a command the table knows to take no parameter: \\S4 in (2608.15334); one it does not know may be a register, and keeps it', () => {
    expect(texts(doc('As in \\S4 in the paper, and \\S6.1 in the appendix.'))).toEqual(['As in 4 in the paper, and 6.1 in the appendix.'])
    expect(paper(doc('\\mylength 2pt Words of the paragraph.')).units.map(u => (u as unknown as Unit).pieces[0])).toEqual([{ t: 'ph', src: '\\mylength 2pt' }])
  })
  it('a register or a primitive that reads a value keeps it', () => {
    for (const src of ['\\looseness=-1', '\\parindent 0pt', '\\penalty-100']) {
      const units = paper(doc(`${src} Words of the paragraph after it.`)).units as unknown as Unit[]
      expect(units.map(textOf), src).toEqual(['Words of the paragraph after it.'])
      expect(units[0]?.pieces.some(p => p.t === 'ph' && p.src?.trim() === src), src).toBe(true)
    }
  })
})

describe('commands that set no ink are textless (the maker\'s and the layer\'s zero)', () => {
  it('a label with cleveref\'s type, a bibliography style, soul\'s highlight colour, a discretionary hyphen', () => {
    for (const src of ['\\label[proposition]{prop:identifiability}', '\\label{sec:intro}', '\\bibliographystyle{unsrtnat}', '\\sethlcolor{BabyBlue}', '\\-']) expect(textless(src), src).toBe(true)
  })
  it('not the bibliography, which sets a list', () => {
    expect(textless('\\bibliography{references}')).toBe(false)
  })
})

describe('a wrapped babel name begins with a token that sets nothing', () => {
  it('a class\'s \\if over the name\'s first token reads \\relax, never the marks\' assignments (REVTeX\'s \\@if@empty\\@svsec over "Appendix A")', () => {
    // the marked original the maker compiles: the name's new text, as \\cs_set:Npx sets it, begins with \\relax
    const head = new TextDecoder().decode(originalFiles(paper(doc('Words.')), { lines: true, layout: [...LAYOUT_CLASSES] }).get('main.tex'))
    const at = head.indexOf('\\cs_set:Npx#1{')
    expect(at).toBeGreaterThan(0)
    const first = /^\\exp_not:N(\\[A-Za-z@:_]+)/.exec(head.slice(at + '\\cs_set:Npx#1{'.length))
    expect(first?.[1]).toBe('\\relax')
    for (const [key, macro] of [['appendix', 'appendixname'], ['ref', 'refname'], ['abstract', 'abstractname']]) expect(NAMES_TEX).toContain(`\\axt@nmwrap{${key}}{${macro}}`)
  })
})
