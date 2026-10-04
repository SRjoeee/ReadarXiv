import { describe, expect, it } from 'vitest'
import { texErrors, unitsAtErrors } from '@/pdf-reader/engine/tex-errors.mjs'

// A compile's TeX errors and the units they stand in (plans/2026-10-04-compile-resilience.md, Task 2): the safety net
// that sets a unit TeX cannot set in the source, so that the rest of the paper is set translated

const enc = (s: string) => new TextEncoder().encode(s)
const MAIN = ['\\documentclass{article}', '\\begin{document}', 'A first paragraph, untouched.', '', 'TRANSLATED with \\cite{}<>[\\url{x}]{ modified _ code } here.', '', 'A last one.', '\\end{document}'].join('\n')
// the lines of main.tex each unit stands on, as translationFiles gives them
const LINES = [{ file: 'main.tex', unit: 'u0', first: 3, last: 3 }, { file: 'main.tex', unit: 'u1', first: 5, last: 5 }, { file: 'main.tex', unit: 'u2', first: 7, last: 7 }]

describe('texErrors: what TeX stopped at, and where it was reading', () => {
  it('reads a block under nonstop and under halt-on-error alike, an inserted text between', () => {
    const log = ['! Missing $ inserted.', '<inserted text> ', '                $', 'l.5 ...cite{}<>[\\url{x}]{ modified _', '                                      code } here.', '', 'No pages of output.'].join('\n')
    expect(texErrors(log)).toEqual([{ message: 'Missing $ inserted.', line: 5, before: 'cite{}<>[\\url{x}]{ modified _', after: 'code } here.' }])
  })
  it('every error of a nonstop log, in order', () => {
    const log = '! Undefined control sequence.\nl.3 A \\foo\n          bar\n! Missing $ inserted.\n<inserted text> \n                $\nl.7 x_\n      y\n'
    expect(texErrors(log).map(e => [e.message, e.line])).toEqual([['Undefined control sequence.', 3], ['Missing $ inserted.', 7]])
  })
  it('a lost letter made an error by \\tracinglostchars=3, its message on two lines, its letter named', () => {
    const log = '! Missing character: There is no \u3067 (U+3067) in font [lmroman10-regular]:mapping\n=tex-text;.\nl.6 Text $x$ and \u3067 \n                   here.\n'
    expect(texErrors(log)[0]).toMatchObject({ line: 6, message: expect.stringMatching(/^Missing character/), char: 0x3067 })
  })
  it('an error with no line of input (the end of the job), or one the output routine or a \\write raised, is none it can place', () => {
    expect(texErrors('! Emergency stop.\n<*> main.tex\n')).toEqual([])
    // a running head typeset at shipout: TeX is reading whatever line it was, in another unit
    expect(texErrors('! Undefined control sequence.\n\\@oddhead ->\\foo \n<output> {\\the \\output }\nl.40 some words of another unit\n   and more\n')).toEqual([])
    expect(texErrors('! Undefined control sequence.\n<write> \\foo \nl.40 some words\n   more\n')).toEqual([])
  })
  it("reads the last TeX pass of the browser compiler's joined log", () => {
    const step = (cmd: string, log: string) => `$ ${cmd}\nEXITCODE: 0\n\nLOG:\n${log}\n==\nSTDOUT:\n${log}\n==\nSTDERR:\n\n======`
    const joined = [step('xelatex main.tex', '! Undefined control sequence.\nl.2 \\foo\n  x'), step('xelatex main.tex', '! Missing $ inserted.\nl.9 a_\n  b')].join('\n\n')
    expect(texErrors(joined).map(e => e.line)).toEqual([9])
  })
})

describe('unitsAtErrors: the units whose lines hold the errors', () => {
  const files = new Map([['main.tex', enc(MAIN)], ['main.aux', enc('\\relax\n'.repeat(9))]])
  it("the unit on the error's line, its context found there; never a line of a file no unit is in", () => {
    const errors = [{ message: 'Missing $ inserted.', line: 5, before: 'cite{}<>[\\url{x}]{ modified _', after: 'code } here.' }]
    expect(unitsAtErrors(errors, files, LINES)).toEqual(['u1'])
  })
  it("a context that line does not hold places nothing (an error in a package's own line 5)", () => {
    expect(unitsAtErrors([{ message: 'Undefined control sequence.', line: 5, before: '\\def\\x{\\y', after: '}' }], files, LINES)).toEqual([])
  })
  it('a blank line between units is in none (a paragraph that ended inside an argument)', () => {
    expect(unitsAtErrors([{ message: 'Paragraph ended before \\@@cite was complete.', line: 6, before: '', after: '' }], files, LINES)).toEqual([])
  })
  it("the context compared as the log writes it: a native log read as Latin-1, its letters past ASCII as ^^ codes or bytes", () => {
    const zh = 'A \u8bba\u6587 sentence with \\foo{} in it.'
    const f = new Map([['main.tex', enc(`\\begin{document}\n${zh}\n\\end{document}`)]])
    const bytes = Array.from(enc('A \u8bba\u6587 sentence with \\foo'), b => String.fromCharCode(b)).join('')
    const carets = 'A ^^e8^^ae^^ba^^e6^^96^^87 sentence with \\foo'
    for (const before of [bytes, carets]) expect(unitsAtErrors([{ message: 'Undefined control sequence.', line: 2, before, after: '{} in it.' }], f, [{ file: 'main.tex', unit: 'u', first: 2, last: 2 }])).toEqual(['u'])
  })
  it('two units on one line: the one whose own text holds the context', () => {
    const f = new Map([['main.tex', enc('\\begin{document}\n\\section{A heading here} The paragraph runs on \\foo{} to its end.\n\\end{document}')]])
    const at = (k: number) => 17 + k
    const lines = [{ file: 'main.tex', unit: 'h', first: 2, last: 2, from: at(9), to: at(23) }, { file: 'main.tex', unit: 'p', first: 2, last: 2, from: at(25), to: at(65) }]
    expect(unitsAtErrors([{ message: 'Undefined control sequence.', line: 2, before: 'The paragraph runs on \\foo', after: '{} to its end.' }], f, lines)).toEqual(['p'])
  })
  it("a lost letter only in a unit that holds it: a heading's letter lost in its running head is not the paragraph's being read", () => {
    const f = new Map([['main.tex', enc('\\begin{document}\nWords and \u8bba here.\n\\end{document}')]])
    const lines = [{ file: 'main.tex', unit: 'p', first: 2, last: 2 }]
    const lost = (char: number) => [{ message: 'Missing character: There is no x in font y', line: 2, before: 'Words and', after: 'here.', char }]
    expect(unitsAtErrors(lost(0x8bba), f, lines)).toEqual(['p'])
    expect(unitsAtErrors(lost(0x6587), f, lines)).toEqual([])
  })
  it("a unit nested in another on the line: the innermost whose own text holds the context — a footnote's error is the footnote's, its paragraph's the paragraph's", () => {
    const line = 'The paragraph says \\bar{} here.\\footnote{The note says \\foo{} in it.} And on.'
    const f = new Map([['main.tex', enc(`\\begin{document}\n${line}\n\\end{document}`)]])
    const at = (k: number) => 17 + k, note = line.indexOf('The note')
    const lines = [{ file: 'main.tex', unit: 'p', first: 2, last: 2, from: at(0), to: at(line.length) }, { file: 'main.tex', unit: 'n', first: 2, last: 2, from: at(note), to: at(line.indexOf('} And')) }]
    expect(unitsAtErrors([{ message: 'Undefined control sequence.', line: 2, before: 'The note says \\foo', after: '{} in it.' }], f, lines)).toEqual(['n'])
    expect(unitsAtErrors([{ message: 'Undefined control sequence.', line: 2, before: 'The paragraph says \\bar', after: '{} here.' }], f, lines)).toEqual(['p'])
    // a context that runs past the note's own text — the twelve characters before the place begin before the note —:
    // the paragraph's, which holds it
    expect(unitsAtErrors([{ message: 'Undefined control sequence.', line: 2, before: 'here.\\footnote{The', after: 'note says \\foo{} in it.' }], f, lines)).toEqual(['p'])
  })
})
