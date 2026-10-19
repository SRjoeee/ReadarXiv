import { describe, expect, it } from 'vitest'
import { openPaper, originalFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
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
})
