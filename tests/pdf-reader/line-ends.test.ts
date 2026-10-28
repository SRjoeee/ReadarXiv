import { describe, expect, it } from 'vitest'
import { openPaper, originalFiles, probeFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { unbalancedUnits } from '@/pdf-reader/engine/layout/guard.mjs'
import { LAYOUT_CLASSES } from '@/pdf-reader/engine/layout/marks.mjs'
import type { SourceUnit } from '@/pdf-reader/engine/source/latex-front.mjs'
import type { UnitLines } from '@/pdf-reader/engine/pipeline/tex-errors.mjs'
import { sourceHash } from '@/pdf-reader/engine/pipeline/cache.mjs'
import { inMemory } from '@/pdf-reader/engine/source/latex-front.mjs'
import { analyze } from '@/pdf-reader/engine/source/paper-meta.mjs'

// A source's line ends as TeX reads them: web2c's input_line takes a CR, an LF or a CRLF for one line's end, so a blank
// line is a paragraph's end whatever the editor wrote. The front end read only LF: 2610.10069v1's CRLF source had its
// introduction (ten paragraphs) and a whole proof (sixteen) cut as one unit each, its p23's translation drawn on p22

type Piece = { t: string; s?: string; src?: string }
type Unit = { kind: string; pieces: Piece[] }
const enc = (s: string) => new TextEncoder().encode(s)
const LF = [
  '\\documentclass{article}',
  '\\newtheorem{lemma}{Lemma}',
  '\\begin{document}',
  '\\section{Introduction}',
  'A first paragraph of the introduction, with words.',
  '',
  'A second paragraph of the introduction, with words.',
  '% a comment line, then a blank line',
  '',
  'A third paragraph after a comment.',
  '\\begin{equation}',
  '  x = y.',
  '\\end{equation}',
  '',
  '\\begin{proof}',
  'A first paragraph of the proof.',
  '',
  'A second paragraph of the proof.',
  '\\end{proof}',
  '\\begin{verbatim}',
  'code line',
  '\\end{verbatim}',
  'The last paragraph.',
  '\\end{document}',
  '',
].join('\n')
const paper = (tex: string) => openPaper(new Map([['main.tex', enc(tex)]]))
const units = (tex: string) => paper(tex).units as unknown as Unit[]
const textOf = (u: Unit) => u.pieces.filter(p => p.t === 'text').map(p => p.s).join('').replace(/\s+/g, ' ').trim()

describe('a source\'s line ends are read as TeX reads them: CRLF and a lone CR are LF', () => {
  for (const [name, end] of [['CRLF', '\r\n'], ['a lone CR', '\r']] as const) {
    const tex = LF.replace(/\n/g, end)
    it(`${name}: the same units as LF, piece for piece and hash for hash`, async () => {
      const a = units(LF), b = units(tex)
      expect(b.map(textOf)).toEqual(a.map(textOf))
      expect(b.length).toBe(7)
      expect(await Promise.all(b.map(u => sourceHash(u)))).toEqual(await Promise.all(a.map(u => sourceHash(u))))
    })
    it(`${name}: the marked original is the LF source's, byte for byte (written with LF, as TeX reads either)`, () => {
      const a = new TextDecoder().decode(originalFiles(paper(LF), { lines: true }).get('main.tex'))
      const b = new TextDecoder().decode(originalFiles(paper(tex), { lines: true }).get('main.tex'))
      expect(b).toBe(a)
      expect(b.includes('\r')).toBe(false)
    })
    it(`${name}: the paper's main file and compiler found as for LF`, () => {
      const meta = (t: string) => { const m = analyze(inMemory(new Map([['main.tex', enc(t)]]))); return [m.main, m.compiler, m.documentclass] }
      expect(meta(tex)).toEqual(meta(LF))
    })
  }
  it('a paragraph of each blank line in a CRLF file a paper inputs (2610.10069v1\'s shape: an introduction, a proof)', () => {
    const p = openPaper(new Map([['main.tex', enc('\\documentclass{article}\r\n\\begin{document}\r\n\\input{intro}\r\n\\end{document}\r\n')], ['intro.tex', enc('First paragraph.\r\n\r\nSecond paragraph.\r\n  \r\nThird paragraph.\r\n')]]))
    expect((p.units as unknown as Unit[]).map(textOf)).toEqual(['First paragraph.', 'Second paragraph.', 'Third paragraph.'])
  })

  it('a class the paper ships with lone CRs defines its author block\'s macros as TeX reads them (2608.02991\'s sn-jnl.cls)', () => {
    // (its first line a comment: read to an LF, it took the whole class, its definitions with it)
    const cls = ['%% a journal class', '\\LoadClass{article}', '\\newcommand{\\fnm}[1]{#1}', '\\newcommand{\\sur}[1]{#1}', '\\newcommand{\\affil}[2][]{#2}', ''].join('\r')
    const main = ['\\documentclass{myj}', '\\title{A title of the paper}', '\\author[1]{\\fnm{Zhang} \\sur{Gongyue}}', '\\affil[1]{An institute of somewhere}', '\\begin{document}', '\\maketitle', 'A paragraph of words in the body.', '\\end{document}', ''].join('\n')
    const p = openPaper(new Map([['main.tex', enc(main)], ['myj.cls', enc(cls)]]))
    // (the \\affil's place where its unit was: what was one unit keeps its number, latex-front.mjs frontBlock)
    expect((p.units as unknown as Unit[]).map(u => u.kind)).toEqual(['heading', 'author', 'affiliation', 'para'])
  })
  it('the main file chosen among candidates by its length as TeX reads it, not by its line ends\' bytes', () => {
    // (each file included by the other: no uncited candidate, the longer body chosen)
    const body = (n: number, other: string) => `\\documentclass{article}\n\\begin{document}\n${'Words of the paper. '.repeat(n)}\n\\input{${other}}\n\\end{document}\n`
    // (a's words broken over lines with CRLF: more bytes than b's, fewer characters as TeX reads them)
    const longer = body(11, 'a'), crlf = body(10, 'b').replace(/\n/g, '\r\n').replace(/ /g, '\r\n')
    expect(crlf.length).toBeGreaterThan(longer.length)
    expect(analyze(inMemory(new Map([['a.tex', enc(crlf)], ['b.tex', enc(longer)]]))).main).toBe('b.tex')
  })
  it('the guard reads a lone-CR file as the marked one is written: its braces balance (a comment ends at the line\'s CR)', () => {
    const tex = '\\documentclass{article}\r\\begin{document}\r\\textbf{Bold % c\r} A first paragraph of the paper.\r\rA second paragraph of the paper.\r\\end{document}\r'
    const p = paper(tex), spans: { lines?: () => UnitLines<SourceUnit>[]; skip?: number } = {}
    const files = originalFiles(p, { lines: true, layout: LAYOUT_CLASSES, spans })
    expect(unbalancedUnits(p, files, spans.lines?.() ?? [], spans.skip)).toEqual({ units: new Set(), other: false })
  })
  it('the probe of a lone-CR main file finds its \\begin{document}: the preamble, one document', () => {
    // (a comment in the preamble: read to its LF, it took the rest of a lone-CR file, \\begin{document} with it)
    const probe = new TextDecoder().decode(probeFiles(paper(LF.replace('\\documentclass{article}', '\\documentclass{article} % the class').replace(/\n/g, '\r'))).get('main.tex'))
    expect(probe.match(/\\begin\{document\}/g)).toHaveLength(1)
    expect(probe).not.toContain('A first paragraph')
  })
})
