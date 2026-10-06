import { describe, expect, it } from 'vitest'
import * as argRoles from '@/pdf-reader/engine/arg-roles.mjs'
import { bindingsOf, commandParams, environmentParams, readArgs, textArgsOf, textless } from '@/pdf-reader/engine/arg-roles.mjs'

// The role table: what each argument of a command is (text, a dimension, keys, a name …), from LaTeXML's prototypes and
// the commands written out by hand where LaTeXML leaves an argument untyped

const roles = (name: string, bindings: Set<number> | null = null) => commandParams(name, bindings)?.map(p => p.shape + p.role).join('') ?? null

describe('the table: LaTeXML\'s prototypes, and the commands written out where they say less', () => {
  it('a rule, a length set, a row\'s rules: every argument a dimension or a register, as LaTeXML types them', () => {
    expect(roles('rule')).toBe('[d{d{d')
    expect(roles('setlength')).toBe('{r{d')
    expect(roles('vskip')).toBe('_d')
    expect(roles('specialrule', bindingsOf(['\\usepackage{booktabs}']))).toBe('{d{d{d')
    expect(roles('addlinespace', bindingsOf(['\\usepackage{booktabs}']))).toBe('[d')
  })
  it('what LaTeXML leaves untyped written out: a file and two branches, a counter, a link\'s text, a box\'s content', () => {
    expect(roles('IfFileExists')).toBe('{n{c{c')
    expect(roles('setcounter')).toBe('{n{d')
    expect(roles('href')).toBe('[k{n{t')
    expect(roles('raisebox')).toBe('{d[d[d{c')
    expect(roles('multicolumn')).toBe('{d{n{c')
  })
  it('a package\'s form only where the paper loads it: moderncv\'s \\firstname{…} is not melba\'s declaration', () => {
    expect(roles('firstname', bindingsOf(['\\documentclass{moderncv}']))).toBe('{n')
    expect(roles('firstname', bindingsOf(['\\documentclass{article}']))).toBeNull()
    // enumitem's keys after a list's \begin, the kernel's list none
    expect(environmentParams('enumerate', bindingsOf(['\\usepackage{enumitem}']))?.map(p => p.shape + p.role).join('')).toBe('[k')
  })
  it('a class LaTeXML has no binding for is read as the longest one its name begins with (revtex4-2 as revtex4), and what that one loads', () => {
    const b = bindingsOf(['\\documentclass[aps,prl]{revtex4-2}'])
    expect(b.size).toBeGreaterThan(1)
    expect(roles('thanks', b)).not.toBeNull()
  })
  it('a definition of nothing tells nothing: LaTeXML\'s \\IEEEauthorrefmark is \'\', which IEEEtran\'s takes an argument', () => {
    expect(roles('IEEEauthorrefmark', bindingsOf(['\\documentclass{IEEEtran}']))).toBeNull()
  })
  it('arguments LaTeXML reads in code past its prototype are not known: listings\' \\lstinline reads its |…| itself, diagbox looks ahead, acronym\'s \\ac* ends on \\@ac', () => {
    expect(roles('lstinline', bindingsOf(['\\usepackage{listings}']))).toBeNull()
    expect(roles('diagbox', bindingsOf(['\\usepackage{diagbox}']))).toBeNull()
    // …and written out where it matters: \\cmidrule[w]{a-b} after its trim, acronym's key
    expect(roles('cmidrule', bindingsOf(['\\usepackage{booktabs}']))).toBe('[d{n')
    expect(roles('ac', bindingsOf(['\\usepackage{acronym}']))).toBe('*s{n')
    // a replacement that ends on a conditional's end reads nothing more: \\textbf{} is \\ifmmode…\\fi
    expect(roles('textbf')).toBe('{a')
  })
  it('a token register takes a group as its value (llncs\' \\titlerunning, TeX\'s \\everypar, \\toks0=); any other register a value in TeX\'s syntax', () => {
    expect(roles('titlerunning', bindingsOf(['\\documentclass{llncs}']))).toBe('?s{x')
    expect(roles('everypar')).toBe('?s{x')
    expect(roles('toks')).toBe('_d?s{x')
    expect(roles('parindent')).toBe('=r')
  })
  it('an argument LaTeXML takes undigested or as a general text may be typeset (\\centerline, \\uppercase): never code', () => {
    expect(roles('centerline')).toBe('{a')
    expect(roles('uppercase')).toBe('{a')
  })
  it('a package\'s form only for a paper that loads it: with no paper, the kernel\'s and those written out alone (a paper\'s \\degrees is no pstricks \\degrees[…])', () => {
    expect(roles('degrees')).toBeNull()
    expect(roles('degrees', bindingsOf(['\\usepackage{pstricks}']))).toBe('[d')
  })
})

describe('readArgs: the arguments as TeX takes them', () => {
  const params = (name: string) => commandParams(name) ?? []
  it('an undelimited argument is a group or one token: \\setlength\\tabcolsep{1mm} reads \\tabcolsep and {1mm}, the group after them the text\'s (2307.16209)', () => {
    const s = '\\setlength\\tabcolsep{1mm}{the tables}'
    const r = readArgs(s, 10, params('setlength'))
    expect(r.complete).toBe(true)
    expect(r.args.map(a => s.slice(a.start, a.end))).toEqual(['\\tabcolsep', '{1mm}'])
    expect(s.slice(r.end)).toBe('{the tables}')
  })
  it('an optional argument only where it is given; TeX\'s own syntax for a dimension; a required one missing is not complete', () => {
    expect(readArgs('\\rule{1pt}{2pt}', 5, params('rule')).args.map(a => a.role)).toEqual(['d', 'd'])
    const v = readArgs('\\vskip 3pt plus 1fil Text', 6, params('vskip'))
    expect('\\vskip 3pt plus 1fil Text'.slice(v.end)).toBe(' Text')
    expect(readArgs('\\setcounter{x}}', 11, params('setcounter')).complete).toBe(false)
    expect(readArgs('\\setcounter{x}\n\n{3}', 11, params('setcounter')).complete).toBe(false)
  })
})

describe('a placeholder\'s source with its text alone (the layer\'s source fallback, 1706.03762\'s Table 2: "1pt-1pt0pt 0pt2.2ex")', () => {
  it('every argument that is never text goes; what may be text stays, recursively', () => {
    expect(textArgsOf('\\specialrule{1pt}{-1pt}{0pt}')).toBe('\\specialrule')
    expect(textArgsOf('\\rule[-1pt]{0pt}{2.2ex}')).toBe('\\rule')
    expect(textArgsOf('\\raisebox{-1pt}{x}')).toBe('\\raisebox{x}')
    expect(textArgsOf('\\multicolumn{2}{c}{x}')).toBe('\\multicolumn{x}')
    expect(textArgsOf('\\includegraphics[width=5cm]{{berimbau.jpg}}')).toBe('\\includegraphics')
    expect(textArgsOf('\\textbf{A \\rule{0pt}{2ex}B}')).toBe('\\textbf{A \\rule B}')
    // what the table does not know keeps everything
    expect(textArgsOf('\\mymacro{1pt}{x}')).toBe('\\mymacro{1pt}{x}')
  })
  it('textless: one command of those that set no letters, its arguments all there and nothing after; one with no parameter may set text', () => {
    for (const src of ['\\specialrule{1pt}{-1pt}{0pt}', '\\rule{0pt}{2.2ex}', '\\addlinespace[2pt]', '\\setlength{\\tabcolsep}{3pt}', '\\fontsize{9}{11}', '\\noalign{\\vskip 4mm}', '\\tabularnewline[2pt]', '\\vspace*{-2mm}', '\\renewcommand\\arraystretch{1.1}', '\\cmidrule(lr){2-5}', '\\vskip 3pt plus 1fil']) expect(textless(src)).toBe(true)
    for (const src of ['\\LaTeX', '\\raisebox{-1pt}{x}', '\\textbf{x}', '\\cite[p.~5]{key}', '\\rule{0pt}', '\\rule{0pt}{2ex} text', '\\tabcolsep', '\\mymacro{1pt}']) expect(textless(src)).toBe(false)
    // a name may set ink: a reference's number, llncs' \inst mark, an image; a bare token too, \left's delimiter
    for (const src of ['\\ref{sec:a}', '\\inst{1}', '\\includegraphics[width=5cm]{a.png}', '\\left(', '\\section*']) expect(textless(src)).toBe(false)
  })
  it('never textless: a command that prints its argument, a number or a box, whatever its arguments\' types; \\noalign around one of them', () => {
    for (const src of ['\\centerline{Title}', '\\leftline{x}', '\\rightline{x}', '\\uppercase{x}', '\\MakeTextUppercase{x}', '\\romannumeral 3', '\\number 12', '\\char 65', '\\unhbox\\mybox', '\\box0', '\\noalign{\\hbox{Group A}}', '\\detokenize{x}', '\\halign{#\\cr x\\cr}']) expect(textless(src), src).toBe(false)
  })
  it('a command the paper defines is its own: never textless, never read by the table (paperOf)', () => {
    const paper = argRoles.paperOf(['\\renewcommand{\\rule}[2]{#1#2}'])
    expect(textless('\\rule{1pt}{2pt}', paper)).toBe(false)
    expect(textArgsOf('\\rule{1pt}{2pt}', paper)).toBe('\\rule{1pt}{2pt}')
    expect(textless('\\rule{1pt}{2pt}')).toBe(true)
  })
})
