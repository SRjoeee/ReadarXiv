import { describe, expect, it } from 'vitest'
import { LAYOUT_CLASSES, layoutMarking } from '@/pdf-reader/engine/layout/marks.mjs'
import { markedOfPaper } from '@/pdf-reader/engine/layout/paper.mjs'
import { type Compiled, type CompileRequest, openPaper, originalFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { fallbackDefinition } from '@/pdf-reader/engine/rules/arg-roles.mjs'
import { latin1Bytes, type SourceUnit } from '@/pdf-reader/engine/source/latex-front.mjs'

// The whole-paper fallbacks of the layer route's release sweep (2026-10-22), each by its general rule: a Latin-1 source's
// marked original keeps the paper's own bytes (2610.20581); no mark of ours stands inside an argument TeX reads verbatim, and
// a class's fallback for a command the role table knows is not read as the command's definition (2610.19860); and, the base
// page asked, the guard takes no marked original of more pages than arXiv's, the unmarked original telling whose fault it is

const enc = (s: string) => new TextEncoder().encode(s)
/** a file's bytes past ASCII, in order */
const high = (b: Uint8Array | undefined) => [...(b ?? [])].filter(x => x >= 0x80)
const PROBE: Compiled = { ok: true, log: ['This is pdfTeX', 'LAYOUT-PROBE 1 lineskip 1.0pt 0.0pt', ''].join('\n') }
function compiler(answers: Compiled[]) {
  const asked: CompileRequest[] = []
  return { asked, compile: async (req: CompileRequest): Promise<Compiled> => { asked.push(req); return answers[asked.length - 1] ?? { ok: false, error: 'not asked for' } } }
}

describe('a Latin-1 source (2610.20581): the layout compile\'s files are the paper\'s own bytes', () => {
  // an é and a no-break space as Latin-1 bytes, under the paper's own \usepackage[latin1]{inputenc}
  const SOURCE = '\\documentclass{article}\n\\usepackage[latin1]{inputenc}\n\\begin{document}\nMat\xe9matiques with $a\xa0b$ here.\n\nAnother paragraph of words.\n\\end{document}\n'
  const paper = () => openPaper(new Map([['main.tex', latin1Bytes(SOURCE)]]))

  it('is the marked original\'s, its inputenc the paper\'s; the live path\'s original is UTF-8 as before', () => {
    const p = paper()
    expect(p.project.transcode.has('main.tex')).toBe(true)
    const marked = originalFiles(p, { lines: true, layout: LAYOUT_CLASSES }).get('main.tex')
    expect(high(marked)).toEqual([0xe9, 0xa0])
    expect(new TextDecoder('latin1').decode(marked)).toContain('\\usepackage[latin1]{inputenc}')
    // (asked for, the layout's files transcoded as the live path's)
    expect(high(originalFiles(p, { lines: true, layout: LAYOUT_CLASSES, transcode: true }).get('main.tex'))).toEqual([0xc3, 0xa9, 0xc2, 0xa0])
    for (const lines of [false, true]) expect(high(originalFiles(p, { lines }).get('main.tex'))).toEqual([0xc3, 0xa9, 0xc2, 0xa0])
    expect(high(originalFiles(p, { lines: true, transcode: false }).get('main.tex'))).toEqual([0xe9, 0xa0])
  })

  it('is CM\'s unmarked drafts\' too, so that the aux they write is the marked passes\'', async () => {
    const files = new Map([['main.aux', enc('\\relax \n')]])
    const c = compiler([PROBE, { ok: true, pdf: null, log: 'AXT-END\n', files }, { ok: true, pdf: enc('%PDF-1.7 marked'), log: 'AXT-END\n', files }])
    const made = await markedOfPaper(paper(), { final: false, compile: c.compile, converge: true })
    expect(made).toMatchObject({ cm: { drafts: 1, marked: 1, settled: true } })
    expect(c.asked.map(r => r.draft)).toEqual([undefined, true, false])
    for (const r of c.asked.slice(1)) expect(high(r.overrides.get('main.tex'))).toEqual([0xe9, 0xa0])
  })

  it('changes no byte of a source that is not transcoded', () => {
    const p = openPaper(new Map([['main.tex', enc('\\documentclass{article}\n\\usepackage[utf8]{inputenc}\n\\begin{document}\nMathématiques here.\n\\end{document}\n')]]))
    expect(p.project.transcode.size).toBe(0)
    for (const layout of [null, LAYOUT_CLASSES]) expect(originalFiles(p, { lines: true, layout, transcode: false })).toEqual(originalFiles(p, { lines: true, layout, transcode: true }))
  })
})

describe('an argument TeX reads verbatim (2610.19860): no mark of ours inside it', () => {
  type Piece = { t: string; s?: string; src?: string; id?: number }
  const text = (s: string): Piece => ({ t: 'text', s })
  const ph = (src: string): Piece => ({ t: 'ph', src })
  const open = (src: string, id = 1): Piece => ({ t: 'open', id, src })
  const close = (id = 1): Piece => ({ t: 'close', id, src: '}' })
  const unit = (pieces: Piece[]) => ({ kind: 'para', file: 'main.tex', start: 0, end: 0, pieces }) as SourceUnit
  const srcs = (u: SourceUnit | undefined) => ((u?.pieces ?? []) as Piece[]).map(p => (p.t === 'text' ? p.t : p.t === 'ph' ? `ph ${p.src}` : `${p.t} ${p.src}`))
  const marked = (pieces: Piece[]) => srcs(layoutMarking([unit(pieces)], LAYOUT_CLASSES).units[0])

  it('a \\url read as a group: its argument has none, the unit\'s other placeholders keep theirs', () => {
    // (llncs.cls' \\AtBeginDocument{\\@ifundefined{url}{\\def\\url#1{#1}}{}} read as \\url's definition: its argument a group,
    // the address in it a placeholder of its own, which hyperref's \\url, in force, would print with its marks)
    expect(marked([text('The code is at '), open('\\url{'), ph('https://github.com/a/b-c'), close(), text(' with '), ph('$x$'), text(' and '), ph('\\cite{k}'), text('.')])).toEqual([
      'text', 'open \\url{', 'ph https://github.com/a/b-c', 'close }', 'text', 'ph \\axtpmm{p0.5a}', 'ph $x$', 'ph \\axtpm{p0.5b}', 'text', 'ph \\axtpma{p0.7a}', 'ph \\cite{k}', 'ph \\axtpm{p0.7b}', 'text'])
    // (as a placeholder, the whole \\url its own marks, around it)
    expect(marked([text('At '), ph('\\url{https://a.b}'), text('.')])).toEqual(['text', 'ph \\axtpma{p0.1a}', 'ph \\url{https://a.b}', 'ph \\axtpm{p0.1b}', 'text'])
  })
  it('\\href: none in its first argument, options or not; its second, the link\'s text, keeps them', () => {
    expect(marked([text('See '), open('\\href{'), ph('https://a.b'), close(), text(' and '), ph('$y$')])).toEqual(['text', 'open \\href{', 'ph https://a.b', 'close }', 'text', 'ph \\axtpmm{p0.5a}', 'ph $y$', 'ph \\axtpm{p0.5b}'])
    expect(marked([text('See '), open('\\href[pdfnewwindow]{'), ph('https://a.b'), close()])).toEqual(['text', 'open \\href[pdfnewwindow]{', 'ph https://a.b', 'close }'])
    expect(marked([text('See '), open('\\href{https://a.b}{'), text('the '), ph('$z$'), text(' site'), close()])).toEqual(['text', 'open \\href{https://a.b}{', 'text', 'ph \\axtpmm{p0.3a}', 'ph $z$', 'ph \\axtpm{p0.3b}', 'text', 'close }'])
  })
  it('\\nolinkurl, \\path and \\burl the same, a group inside too; a command of another name is no such one', () => {
    for (const cmd of ['\\nolinkurl{', '\\path{', '\\burl{', '\\protect\\url{', '\\url {']) {
      expect(marked([text('At '), open(cmd), open('{', 2), ph('$v$'), close(2), ph('a@b.c'), close(), text('.')]), cmd).toEqual(['text', `open ${cmd}`, 'open {', 'ph $v$', 'close }', 'ph a@b.c', 'close }', 'text'])
    }
    for (const cmd of ['\\myurl{', '\\urlx{', '\\textbf{', '{']) {
      expect(marked([text('At '), open(cmd), ph('$v$'), close(), text('.')]), cmd).toEqual(['text', `open ${cmd}`, 'ph \\axtpmm{p0.2a}', 'ph $v$', 'ph \\axtpm{p0.2b}', 'close }', 'text'])
    }
  })
})

describe('a class\'s fallback definition (2610.19860\'s llncs.cls): not the command\'s, where the table knows the command', () => {
  /** each unit's pieces, a placeholder in brackets, a group's opening before < and its close after > */
  const piecesOf = (preamble: string, body: string, more: [string, string][] = []) => openPaper(new Map([['main.tex', enc(`\\documentclass{article}\n${preamble}\n\\begin{document}\n${body}\n\\end{document}\n`)], ...more.map(([p, t]): [string, Uint8Array] => [p, enc(t)])])).units.map(u => (u.pieces as { t: string; s?: string; src?: string }[]).map(q => (q.t === 'text' ? q.s : q.t === 'ph' ? `[${q.src}]` : q.t === 'open' ? `<${q.src}` : q.t === 'close' ? `${q.src}>` : q.t)))
  const URL = 'See \\url{https://github.com/a/b-c} and \\url{github.com/a}.'
  const AS_URL = [['\nSee ', '[\\url{https://github.com/a/b-c}]', ' and ', '[\\url{github.com/a}]', '.\n']]
  const AS_GROUP = [['\nSee ', '<\\url{', '[https://github.com/a/b-c]', '}>', ' and ', '<\\url{', 'github.com/a', '}>', '.\n']]

  it('llncs.cls\' \\@ifundefined{url}{\\def\\url#1{#1}}{} in an \\AtBeginDocument: each \\url one placeholder, marked around it alone', () => {
    const CLS = '\\NeedsTeXFormat{LaTeX2e}\\ProvidesClass{llncs}\\LoadClass{article}\n\\AtBeginDocument{\\@ifundefined{url}{\\def\\url#1{#1}}{}}\n'
    const p = openPaper(new Map([['main.tex', enc(`\\documentclass{llncs}\n\\usepackage{hyperref}\n\\begin{document}\nThe code is available at\\newline\n\\url{https://github.com/a/b-c} with $x$.\n\\end{document}\n`)], ['llncs.cls', enc(CLS)]]))
    const marked = layoutMarking(p.units, LAYOUT_CLASSES).units[0]?.pieces.map(q => q.src ?? q.t)
    expect(marked).toEqual(['text', '\\newline', 'text', '\\axtpma{p0.3a}', '\\url{https://github.com/a/b-c}', '\\axtpm{p0.3b}', 'text', '\\axtpmm{p0.5a}', '$x$', '\\axtpm{p0.5b}', 'text'])
  })
  it('each guard of the name being undefined, and \\providecommand', () => {
    for (const guard of [
      '\\makeatletter\\@ifundefined{url}{\\def\\url#1{#1}}{}\\makeatother',
      '\\makeatletter\\AtBeginDocument{\\@ifundefined{url}{\\def\\url#1{#1}}{}}\\makeatother',
      '\\ifx\\url\\undefined\\def\\url#1{#1}\\fi',
      '\\ifx\\undefined\\url \\newcommand{\\url}[1]{#1}\\fi',
      '\\ifdefined\\url\\else\\def\\url#1{#1}\\fi',
      '\\expandafter\\ifx\\csname url\\endcsname\\relax\n  \\def\\url#1{#1}\n\\fi',
      '\\ifcsname url\\endcsname\\else\\gdef\\url#1{#1}\\fi',
      '\\ifcsundef{url}{\\def\\url#1{#1}}{}',
      '\\ifundef{\\url}{\\def\\url#1{#1}}{}',
      '\\providecommand{\\url}[1]{#1}',
    ]) expect(piecesOf(`\\usepackage{hyperref}\n${guard}`, URL), guard).toEqual(AS_URL)
  })
  it('a definition that stands is the paper\'s, as before: unguarded, in the other branch, under a test of another name or one nested deeper, or in a comment', () => {
    for (const def of [
      '\\def\\url#1{#1}',
      '\\ifx\\url\\undefined\\else\\def\\url#1{#1}\\fi',
      '\\ifdefined\\url\\def\\url#1{#1}\\fi',
      '\\makeatletter\\@ifundefined{urlx}{\\def\\url#1{#1}}{}\\makeatother',
      '\\makeatletter\\@ifundefined{url}{}{\\def\\url#1{#1}}\\makeatother',
      '\\ifx\\url\\undefined\\iftrue\\def\\url#1{#1}\\fi\\fi',
      '% \\makeatletter\\@ifundefined{url}{\n\\def\\url#1{#1}',
    ]) expect(piecesOf(`\\usepackage{hyperref}\n${def}`, URL), def).toEqual(AS_GROUP)
  })
  it('a fallback of a command the table does not know is the paper\'s, as before', () => {
    const MINE = [['\nSee ', '<\\mycmd{', 'these words', '}>', '.\n']]
    expect(piecesOf('\\makeatletter\\@ifundefined{mycmd}{\\def\\mycmd#1{#1}}{}\\makeatother', 'See \\mycmd{these words}.')).toEqual(MINE)
    expect(piecesOf('\\providecommand{\\mycmd}[1]{#1}', 'See \\mycmd{these words}.')).toEqual(MINE)
  })
  it('fallbackDefinition: the definition must stand in the branch TeX takes where the name is undefined', () => {
    const at = (t: string) => t.lastIndexOf('\\def')
    for (const t of ['\\@ifundefined{url}{\\def\\url', '\\@ifundefined { url } {\\relax\\def\\url', '\\ifx\\url\\@undefined\\def\\url']) expect(fallbackDefinition(`${t}#1{#1}}{}`, at(t), 'url', 'def'), t).toBe(true)
    // (the group of \\@ifundefined's first argument closed before the definition: its other branch)
    const other = '\\@ifundefined{url}{}\\def\\url#1{#1}'
    expect(fallbackDefinition(other, at(other), 'url', 'def')).toBe(false)
    expect(fallbackDefinition('\\newcommand{\\url}[1]{#1}', 0, 'url', 'newcommand')).toBe(false)
    expect(fallbackDefinition('\\providecommand{\\url}[1]{#1}', 0, 'url', 'providecommand')).toBe(true)
    // (a test too far before the definition is none)
    const far = `\\ifx\\url\\undefined${' '.repeat(500)}\\def\\url#1{#1}\\fi`
    expect(fallbackDefinition(far, at(far), 'url', 'def')).toBe(false)
  })
})

describe('the guard, the base page asked: no marked original of more pages than arXiv\'s stands', () => {
  const TEX = 'This is pdfTeX, Version 3.141592653-2.6-1.40.27 (TeX Live 2025) (preloaded format=pdflatex)\n'
  const ran = (pdf: Uint8Array, pages: number, ms?: number): Compiled => ({ ok: true, pdf, log: `${TEX}AXT-END\nOutput written on main.pdf (${pages} pages, 9999 bytes).\n`, ...(ms === undefined ? {} : { ms }) })
  const MARKED = enc('%PDF-1.7 the marked original'), AGAIN = enc('%PDF-1.7 the marked original again'), OWN = enc('%PDF-1.7 the paper alone')
  const paper = () => openPaper(new Map([['main.tex', enc('\\documentclass{article}\n\\begin{document}\nA paragraph of words with $x$ here.\n\nAnother paragraph of words.\n\\end{document}\n')]]))
  /** the marked original of 5 pages, again so with the name marks off, then the unmarked original of `own` pages */
  const answers = (own: number) => [PROBE, ran(MARKED, 5), ran(AGAIN, 5), ran(OWN, own)]

  it('the paper\'s own source of more pages too: TeX\'s, the page counts named, and no final pass asked', async () => {
    const c = compiler(answers(5))
    const made = await markedOfPaper(paper(), { compile: c.compile, pages: 4 })
    expect(made).toMatchObject({ refused: 'compile', why: 'the paper\'s own source (article) has 5 pages, arXiv\'s PDF 4 on TeX Live 2025', own: { ran: true, short: false, limit: null, tree: '2025' }, guard: { extra: 2, failed: ['pages'] } })
    expect(made).not.toHaveProperty('base')
    expect(c.asked).toHaveLength(4)
  })
  it('the paper\'s own source of arXiv\'s pages: ours (\'marks\', 2610.20581\'s case before its Latin-1 rule), the page counts named', async () => {
    const c = compiler(answers(4))
    expect(await markedOfPaper(paper(), { compile: c.compile, pages: 4 })).toMatchObject({ refused: 'marks', why: 'the marked original has 5 pages, arXiv\'s PDF 4, nor with the name marks off, where the paper\'s own source makes 4 pages', own: { ran: true, short: false } })
    expect(c.asked).toHaveLength(4)
  })
  it('no compile left: refused as the compile\'s, with the budget\'s limit, rather than a final pass over it', async () => {
    // (the marked compile 1 s of a 1.5 s budget: less than 1.2 times the longest compile left)
    const made = await markedOfPaper(paper(), { compile: compiler([PROBE, ran(MARKED, 5, 1000)]).compile, pages: 4, compileBudgetMs: 1500 })
    expect(made).toMatchObject({ refused: 'compile', why: 'the marked original has 5 pages, arXiv\'s PDF 4, and no compile was left to mend it; the paper\'s own source was not compiled', limit: 'budget', guard: { judged: 'no compile left' } })
  })
  it('without the base page (`final` false), as before: the marked original of more pages stands for the carry to judge', async () => {
    const c = compiler(answers(5))
    expect(await markedOfPaper(paper(), { final: false, compile: c.compile, pages: 4 })).toMatchObject({ pdf: MARKED, guard: { extra: 1, failed: ['pages'] } })
    expect(c.asked).toHaveLength(3)
    expect(await markedOfPaper(paper(), { final: false, compile: compiler([PROBE, ran(MARKED, 5, 1000)]).compile, pages: 4, compileBudgetMs: 1500 })).toMatchObject({ pdf: MARKED, guard: { judged: 'no compile left' } })
  })
  it('a marked original of arXiv\'s pages mended by the guard stands, the base page asked or not', async () => {
    for (const final of [true, false]) {
      const c = compiler([PROBE, ran(MARKED, 5), ran(AGAIN, 4)])
      expect(await markedOfPaper(paper(), { final, compile: c.compile, pages: 4 }), String(final)).toMatchObject({ pdf: AGAIN, guard: { extra: 1, names: false, failed: ['pages'] } })
    }
  })
})
