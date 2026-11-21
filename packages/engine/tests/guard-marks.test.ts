// @vitest-environment node
// The layout guard (compile/guard.ts) reads the marks our TeX writes into a paper's source wherever TeX writes them back: an
// error's line of input and context in the log, the aux and the lists, a class's verbatim copy of the source. Each reader reads
// them by their names (marks/marks.ts MARK_CS): a name missing there is a mark the guard does not see. Here each place is fed the
// marks the marking writes beside a paper's own macros and calls, on a paper of our own as the marked original writes it — a
// paragraph that begins with a paper's macro (\axthpk{p<i>.<k>a} before it, marks.ts layoutMarking), one that ends with a
// paper's macro glued to its last word (\axttg{p<i>.<k>g} after the unit's end mark), an author block of two authors
// (\axtcall{<i>} before the second's \and, CALL_TEX), backref's list after a bibliography entry (\axtbrname{p<i>.<k>},
// BACKREF_TEX) —, then every reader every mark of MARK_CS.
import { describe, expect, it } from 'vitest'
import {
  auxUnits,
  contextUnits,
  cutCopyUnits,
  errorUnits,
  marksOutOfPlace,
  ownErrors,
  preambleUnits,
} from '../src/compile/guard.ts'
import { openPaper, originalFiles, type Spans } from '../src/compile/live.ts'
import { LAYOUT_CLASSES, MARK_CS } from '../src/marks/marks.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const dec = (b: Uint8Array | undefined) => new TextDecoder().decode(b ?? new Uint8Array(0))
const TEX = 'This is pdfTeX, Version 3.141592653-2.6-1.40.27 (TeX Live 2025) (preloaded format=pdflatex)\n'
// (a paper whose own macros raise an error of the paper's own wherever they are used: \foo is defined nowhere)
const SOURCE = [
  '\\documentclass{article}',
  '\\newcommand{\\bert}{BERT\\foo}',
  '\\newcommand{\\etal}{et al.\\foo}',
  '\\title{A Title}',
  '\\author{Ann Lee \\and Bob Ray}',
  '\\begin{document}',
  '\\maketitle',
  '\\bert{} is a model of words.',
  '',
  'We read the words of Smith\\etal',
  '',
  'Another paragraph of words.',
  '\\end{document}',
  '',
].join('\n')
/** the paper, its marked original as the guard's compiles are given it (the layout marks, the line probes) and its units' spans */
const marked = () => {
  const paper = openPaper(new Map([['main.tex', enc(SOURCE)]]))
  const spans: Spans = {}
  const files = originalFiles(paper, { lines: true, layout: LAYOUT_CLASSES, spans })
  const text = dec(files.get('main.tex'))
  /** the marked main file's line that holds `s`, and its number */
  const lineOf = (s: string) => {
    const k = text.split('\n').findIndex((l) => l.includes(s))
    return { n: k + 1, text: text.split('\n')[k]! }
  }
  return { paper, files, lines: spans.lines!(), lineOf }
}
/** an error of TeX's as its log shows it: its message, the level of a macro's expansion it raised it in, its line of input up
 *  to the place and the rest */
const error = (message: string, level: string, line: number, before: string, after: string) =>
  `! ${message}\n${level}\n${' '.repeat(level.length)}\nl.${line} ${before}\n${' '.repeat(`l.${line} `.length + before.length)}${after}\n\n`

describe("the marks our TeX writes beside a paper's own macros and calls, read as ours at each place", () => {
  it('are in the marked original as layoutMarking writes them', () => {
    const { lineOf } = marked()
    expect(lineOf('\\axthpk{p').text).toBe(
      '\\axthpk{p2.2a}\\bert{} \\leavevmode\\axtmark{2s}is a model of words.\\axtend{2e}',
    )
    expect(lineOf('\\axttg{p').text).toBe(
      '\\axtlines{3}\\leavevmode\\axtmark{3s}We read the words of Smith\\axtend{3e}\\axttg{p3.1g}\\etal',
    )
    expect(lineOf('\\axtcall{5}').text).toBe(
      '\\author{\\leavevmode\\axtmark{1s}Ann Lee\\axtend{1e} \\axtcall{5}\\and \\leavevmode\\axtmark{5s}Bob Ray\\axtend{5e}}',
    )
  })

  it("a paper's own error beside \\axthpk or \\axttg is the unmarked original's: errorUnits less ownErrors names no unit", () => {
    const { paper, files, lines, lineOf } = marked()
    const head = lineOf('\\axthpk{p'),
      tail = lineOf('\\axttg{p')
    // (\bert's \foo at the paragraph's head, \etal's at its end, as the unmarked original's log has them, and as the marked one's)
    const original = `${TEX}${error('Undefined control sequence.', '\\bert ->BERT\\foo ', 8, '\\bert', '{} is a model of words.')}${error('Undefined control sequence.', '\\etal ->et al.\\foo ', 10, '...e read the words of Smith\\etal', '')}`
    const log = `${TEX}${error('Undefined control sequence.', '\\bert ->BERT\\foo ', head.n, '\\axthpk{p2.2a}\\bert', '{} \\leavevmode\\axtmark{2s}is a model of words.\\axtend{2e}')}${error('Undefined control sequence.', '\\etal ->et al.\\foo ', tail.n, '...ds of Smith\\axtend{3e}\\axttg{p3.1g}\\etal', '')}`
    // (each stands in its unit's line: read as ours, the unit would be unmarked)
    expect(errorUnits(paper, log, files, lines)).toEqual(new Set([2, 3]))
    expect(errorUnits(paper, log, files, lines, ownErrors(original))).toEqual(new Set())
  })

  it("the aux and the lists: one written by name where no text is set is out of place, in a list entry's text not", () => {
    // (a write that does not expand: each by name, a space after its control word, as \write prints it)
    expect(marksOutOfPlace('\\@writefile{toc}{\\etoc@depthtag {x\\axthpk {p2.2a}\\bert }}\n')).toEqual(['p2.2a'])
    expect(marksOutOfPlace('\\newlabel{k\\axtend {3e}\\axttg {p3.1g}}{{1}{3}}\n')).toEqual(['3e', 'p3.1g'])
    expect(marksOutOfPlace('\\etoc@depthtag {Ann Lee\\axtend {1e} \\axtcall {5}\\and }\n')).toEqual(['1e', '5'])
    expect(marksOutOfPlace('\\@writefile{toc}{\\etoc@depthtag {\\axtbrname {p7.3}}}\n')).toEqual(['p7.3'])
    // (an author block in a contents entry's text, set as text there)
    expect(
      marksOutOfPlace(
        '\\@writefile{toc}{\\contentsline {author}{\\axtmark {1s}Ann Lee\\axtend {1e}\\axtcall {5}\\axthpk {p5.0a}\\me }{1}{}}\n',
      ),
    ).toEqual([])
    const aux =
      '\\@writefile{toc}{\\etoc@depthtag {x\\axthpk {p2.2a}\\bert \\axttg {p3.1g}\\axtcall {5}\\axtbrname {p4.1}}}\n'
    expect(auxUnits({ aux }, 9, 'main')).toEqual(new Set([2, 3, 5, 4]))
  })

  it("a class's verbatim copy of our source cut inside \\axthpk is cut inside our TeX: its unit", () => {
    const { files, lineOf } = marked()
    const ours = lineOf('\\axthpk{p').text
    // (cas-common's abstract: the copy lost the body's first token, our head mark's name, its argument left as text)
    const copy = (text: string) => ({ files: new Map([['x.abs', enc(`${text}\n`)]]) })
    expect(cutCopyUnits(copy(ours.slice('\\axthpk'.length)), files, 9)).toEqual(new Set([2]))
    // (a copy of the whole line loses nothing)
    expect(cutCopyUnits(copy(ours), files, 9)).toEqual(new Set())
  })

  it("MARK_IN_LINE: an error in the marked preamble right after one names its unit, its braces no group of the paper's", () => {
    const range = { first: 1, last: 20 }
    const at = (line: number, before: string, after: string) =>
      `! Missing \\endcsname inserted.\n<to be read again> \n                   \\unhbox \nl.${line} ${before}\n${' '.repeat(before.length + 5)}${after}\n\n`
    // (a class that takes each word's first token as data, at the token right after our mark: an author whose block begins
    // with a paper's macro, and the second author's call)
    expect(
      preambleUnits(
        at(5, '\\author{\\protect\\axthpk{p1.0a}', '\\myname{} \\leavevmode\\axtmark{1s}Lee\\axtend{1e}}'),
        9,
        range,
      ),
    ).toEqual(new Set([1]))
    expect(
      preambleUnits(
        at(5, '\\author{\\leavevmode\\axtmark{1s}Ann Lee\\axtend{1e} \\axtcall{5}', '\\and Bob Ray}'),
        9,
        range,
      ),
    ).toEqual(new Set([1, 5]))
  })

  it('MARK_IN_CONTEXT: the level of context TeX shows reading one names its unit', () => {
    const ctx = (level: string, place: string, rest: string) =>
      `! Undefined control sequence.\n${level}${place}\n${' '.repeat(level.length + place.length)}${rest}\nl.12 }\n\n`
    expect(contextUnits(ctx('<argument> ', '...words of Smith\\axttg {p3.1g}\\etal ', ''), 9)).toEqual(new Set([3]))
    expect(contextUnits(ctx('<argument> ', '\\axthpk {p2.2a}\\bert ', '{} is'), 9)).toEqual(new Set([2]))
    expect(contextUnits(ctx('\\@author ->', '\\axtcall {5}\\and ', 'Bob Ray'), 9)).toEqual(new Set([5]))
  })
})

describe("every reader of the guard reads every mark of ours (marks.ts MARK_CS, the marked original's TeX's: tests/mirrors.test.ts)", () => {
  // (each mark with a placeholder's argument, `p3.1a`: unit 3 whichever mark carries it)
  it.each([...MARK_CS])('\\%s', (name) => {
    const mark = `\\${name}{p3.1a}`,
      written = `\\${name} {p3.1a}`
    // (the aux and the lists, where no text is set)
    expect(marksOutOfPlace(`\\@writefile{toc}{\\etoc@depthtag {x${written}}}\n`)).toEqual(['p3.1a'])
    // (an error's line of input as the unmarked original has it, and the context that shows what TeX read: the paper's own error
    // with the mark taken out, ours without the original's)
    const log = (input: string) =>
      `! Undefined control sequence.\n<argument> ${written}\\foo \n${' '.repeat(`<argument> ${written}\\foo `.length)}\nl.7 ${input}\\foo\n${' '.repeat(`l.7 ${input}\\foo`.length)} words.\n\n`
    expect(contextUnits(log(`Some ${mark}`), 9)).toEqual(new Set([3]))
    expect(contextUnits(log(`Some ${mark}`), 9, ownErrors(log('Some ')))).toEqual(new Set())
    // (the marked preamble: the mark's braces no group of the paper's)
    const at = `! Missing \\endcsname inserted.\n<to be read again> \n                   \\unhbox \nl.5 \\author{${mark}\n${' '.repeat(`l.5 \\author{${mark}`.length)}\\foo Ann}\n\n`
    expect(preambleUnits(at, 9, { first: 1, last: 20 })).toEqual(new Set([3]))
    // (a class's verbatim copy of our line cut inside it)
    const ours = new Map([['main.tex', enc(`${mark}Words \\axtend{3e}\n`)]])
    expect(
      cutCopyUnits({ files: new Map([['x.abs', enc(`${mark.slice(name.length + 1)}Words \\axtend{3e}\n`)]]) }, ours, 9),
    ).toEqual(new Set([3]))
  })
})

describe("a paper's own error beside what the marking writes around a mark keys as the unmarked original's", () => {
  // (an error whose line of input is `input` up to its place, TeX reading an argument that shows unit 3's mark: read as ours,
  // the context names unit 3; read as the paper's own, none)
  const log = (input: string, rest = '') =>
    `! Undefined control sequence.\n<argument> \\axtmark {3s}Words \n${' '.repeat('<argument> \\axtmark {3s}Words '.length)}\nl.7 ${input}\n${' '.repeat(`l.7 ${input}`.length)}${rest}\n\n`
  const ownOf = (input: string, rest = '') => ownErrors(log(input, rest))

  it("the \\protect the marking writes before a front unit's mark", () => {
    // (an author block whose head is a paper's macro, its error at that macro: the head mark robust, `\protect\axthpk`)
    const marked = log('\\author{\\protect\\axthpk{p1.0a}\\myname', '{} \\leavevmode\\axtmark{1s}Lee\\axtend{1e}}')
    expect(contextUnits(marked, 9)).toEqual(new Set([3]))
    expect(contextUnits(marked, 9, ownOf('\\author{\\myname', '{} Lee}'))).toEqual(new Set())
    // (a footnote's call in an author block, `\protect\axtpma` before it)
    const call = log('Ann Lee\\protect\\axtpma{n1.2a}\\thanks', '{A note.}\\axtend{1e}')
    expect(contextUnits(call, 9)).toEqual(new Set([3]))
    expect(contextUnits(call, 9, ownOf('Ann Lee\\thanks', '{A note.}'))).toEqual(new Set())
  })

  it("a babel name's marks, as a style's literal name holds them and as TeX writes them through a file", () => {
    const literal = log('\\section*{\\axtnma{ref}References\\axtnmb{ref}}\\foo')
    expect(contextUnits(literal, 9)).toEqual(new Set([3]))
    expect(contextUnits(literal, 9, ownOf('\\section*{References}\\foo'))).toEqual(new Set())
    const written = log('\\contentsline {section}{\\protect \\axtnma {ref}References\\protect \\axtnmb {ref}}\\foo')
    expect(contextUnits(written, 9, ownOf('\\contentsline {section}{References}\\foo'))).toEqual(new Set())
  })

  it("a paper's own \\protect beside a mark of ours stays the paper's", () => {
    // (the paper's \protect\cite, a placeholder whose opening mark the marking writes before the prefix: in a body unit, and in a
    // front unit, robust, ours before the paper's)
    const body = log('Words \\axtpma{p3.2a}\\protect\\cite', '{x}\\axtpm{p3.2b}.')
    expect(contextUnits(body, 9, ownOf('Words \\protect\\cite', '{x}.'))).toEqual(new Set())
    expect(contextUnits(body, 9, ownOf('Words \\cite', '{x}.'))).toEqual(new Set([3]))
    const front = log('Ann Lee \\protect\\axtpma{p1.2a}\\protect\\cite', '{x}')
    expect(contextUnits(front, 9, ownOf('Ann Lee \\protect\\cite', '{x}'))).toEqual(new Set())
    expect(contextUnits(front, 9, ownOf('Ann Lee \\cite', '{x}'))).toEqual(new Set([3]))
  })
})
