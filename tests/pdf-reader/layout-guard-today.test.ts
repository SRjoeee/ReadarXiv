import { describe, expect, it } from 'vitest'
import { layoutMarksOfPaper, markedOfPaper } from '@/pdf-reader/engine/layout/paper.mjs'
import { type Compiled, type CompileRequest, openPaper } from '@/pdf-reader/engine/pipeline/live.mjs'

// The layout guard (layout/guard.mjs, layout/paper.mjs markedOfPaper; R1 of 2026-10-19): the marked original must be the paper.
// Each check on synthetic answers (a brace a unit's writing doubled, a mark of ours a compile wrote into a file where no
// text is set, an error count above the unmarked original's, a page count not arXiv's), each blame (the units at the errors'
// lines, at the line TeX ignored all text after, the units a mark out of place names; none, the name marks off), the order of
// the compiles the guard asks and their bound, and the refusal's why: TeX's ('compile', 'texlive', 'engine') or ours ('marks')

const enc = (s: string) => new TextEncoder().encode(s)
const SOURCE = '\\documentclass{article}\n\\newcommand{\\bert}{BERT}\n\\begin{document}\nWe use \\bert{} as in \\cite{a} with $x$ and \\ref{s} here.\\footnote{A note.}\n\nAnother paragraph of words.\n\\end{document}\n'
const paperOf = (source = SOURCE, more: [string, string][] = []) => openPaper(new Map([['main.tex', enc(source)], ...more.map(([p, t]): [string, Uint8Array] => [p, enc(t)])]))

const CITE = 'LAYOUT-PROBE 1 punct 0 22220000', REF = 'LAYOUT-PROBE 1 punct 1 00000000', FOOTNOTE = 'LAYOUT-PROBE 1 punct 2 00220000'
const PROBE_LOG = ['This is pdfTeX', CITE, REF, FOOTNOTE, 'LAYOUT-PROBE 1 lineskip 1.0pt 0.0pt', ''].join('\n')
const PROBE: Compiled = { ok: true, log: PROBE_LOG }
const TEX = 'This is pdfTeX, Version 3.141592653-2.6-1.40.27 (TeX Live 2025) (preloaded format=pdflatex)\n'
const PDF = enc('%PDF-1.7 the marked original')
/** a compile TeX ran that stopped short of the document's end */
const stopped = (body: string): Compiled => ({ ok: true, pdf: PDF, log: `${TEX}${body}! Emergency stop.\n*** (job aborted, no legal \\end found)\n` })

function compiler(answers: (Compiled | Error)[]) {
  const asked: CompileRequest[] = []
  return {
    asked,
    compile: async (req: CompileRequest): Promise<Compiled> => {
      asked.push(req)
      const a = answers[asked.length - 1] ?? { ok: false, error: 'not asked for' }
      if (a instanceof Error) throw a
      return a
    },
  }
}

describe('the refusal names the unmarked original\'s verdict and the trees tried; handoverOf, the host\'s rule over it', () => {
  const fail = stopped('! Undefined control sequence.\nl.3 \\newcommand{\\bert}{\\foo}\n')
  const ERR = '! Undefined control sequence. (l.3 \\newcommand{\\bert}{\\foo})'
  const TEX23 = 'This is pdfTeX, Version 3.141592653-2.6-1.40.25 (TeX Live 2023) (preloaded format=pdflatex)\n'
  const fail23: Compiled = { ok: true, pdf: PDF, log: `${TEX23}! Undefined control sequence.\nl.3 \\newcommand{\\bert}{\\foo}\n! Emergency stop.\n` }
  const declaring = (year: string) => paperOf(SOURCE, [['00README.json', JSON.stringify({ sources: [{ usage: 'toplevel', filename: 'main.tex' }], texlive_version: year, process: { compiler: 'pdflatex' } })]])

  it('takes the host\'s `tried` for its why: every tree tried, then the box\'s; texlive where the paper declares a year none of them is', async () => {
    // (undeclared: the compile's, on both trees)
    const plain = compiler([PROBE, fail, fail, fail])
    expect(await markedOfPaper(paperOf(), { compile: plain.compile, tried: ['2023'] })).toMatchObject({ refused: 'compile', why: `the paper's own source (article) does not run through on TeX Live 2023 or 2025: ${ERR}` })
    // (declares 2023, tried there first and then here: its own year was tried, so the compile's)
    const routed = compiler([PROBE, fail, fail, fail])
    expect(await markedOfPaper(declaring('2023'), { compile: routed.compile, tried: ['2023'] })).toMatchObject({ refused: 'compile', why: `the paper (article) declares TeX Live 2023; its own source does not run through on TeX Live 2023 or 2025: ${ERR}`, own: { tree: '2025' } })
    // (and through layoutMarksOfPaper, which takes the same options: refused before anything is opened)
    const whole = compiler([PROBE, fail, fail, fail])
    const open = async () => { throw new Error('nothing to open') }
    expect(await layoutMarksOfPaper(declaring('2023'), { compile: whole.compile, open, OPS: {}, tried: ['2023'] })).toMatchObject({ refused: 'compile', why: `the paper (article) declares TeX Live 2023; its own source does not run through on TeX Live 2023 or 2025: ${ERR}`, own: { tree: '2025' } })
    // (declares a year no tree tried is: TeX Live's, every tree named)
    const other = compiler([PROBE, fail23, fail23, fail23])
    expect(await markedOfPaper(declaring('2022'), { compile: other.compile, tried: ['2025'] })).toMatchObject({ refused: 'texlive', why: `the paper (article) declares TeX Live 2022; on TeX Live 2025 or 2023 its own source does not run through: ${ERR}`, own: { tree: '2023' } })
    // (none tried, or the box's own year among them, or no year: today's whys)
    for (const tried of [[], ['2025'], null, ['x', 2025]]) {
      const c = compiler([PROBE, fail, fail, fail])
      expect(await markedOfPaper(declaring('2023'), { compile: c.compile, tried: tried as string[] | null })).toMatchObject({ refused: 'texlive', why: `the paper (article) declares TeX Live 2023; on TeX Live 2025 its own source does not run through: ${ERR}` })
    }
  })

})

describe('markedOfPaper: the compiler a package does not name is arXiv\'s PDF\'s, when the host reads it', () => {
  // (1007.0072v1: no 00README, no figure, so the compiler is a guess, pdflatex; arXiv made the PDF with latex and dvips, Letter,
  // where our pdfTeX base is A4)
  const ENGINES = (asked: CompileRequest[]) => asked.map(r => r.engine)

  it('layoutMarksOfPaper passes it on', async () => {
    const paper = paperOf()
    const c = compiler([PROBE])
    await layoutMarksOfPaper(paper, { compile: c.compile, open: async () => null as never, OPS: {} as never, compilerOf: async () => 'latex' }).catch(() => {})
    expect(ENGINES(c.asked)[0]).toBe('latex')
  })
})
