// The statements the rebuilt prepare's marked compile makes and today's reader's does not (marks/marks.ts STATEMENTS_TEX: the
// compile move's lane B): their TeX stands apart from every head today's reader writes, so that the marked TeX it makes is the
// bytes it was (point-classes.test.ts holds those bytes as digests); the option that puts them after LAYOUT_TEX is the rebuilt
// prepare's alone.
import { describe, expect, it } from 'vitest'
import { openPaper, originalFiles } from '../../src/compile/live.ts'
import { LINES_TEX } from '../../src/compile/tex.ts'
import { DVI_LAYOUT_TEX, GAPS_TEX, LAYOUT_CLASSES, LAYOUT_TEX, STATEMENTS_TEX } from '../../src/marks/marks.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const PAPER = [
  '\\documentclass{article}',
  '\\begin{document}',
  '\\section{Introduction}',
  'A paragraph of the work.\\footnote{A note.}',
  '',
  '\\begin{figure}[t]\\centering\\rule{2cm}{1cm}\\caption{A figure.}\\end{figure}',
  '\\paragraph{Run in.} Its text.',
  '\\end{document}',
  '',
].join('\n')
/** what the statements write and define: their log lines' tags and their macros */
const OWN = ['AXT-SECT', 'AXT-GLUE', '\\axt@sgset', '\\axt@sgtell', '\\axt@glflt', '\\axt@glcap', '\\axt@glv']

describe('the statements the rebuilt prepare’s compile makes (STATEMENTS_TEX)', () => {
  it('are the separations’ TeX, a text of their own', () => {
    expect(STATEMENTS_TEX).toBe(GAPS_TEX)
    for (const s of OWN) expect(STATEMENTS_TEX).toContain(s)
  })
  it('stand in none of the heads today’s reader writes, nor in the marked files it makes', () => {
    for (const tex of [LAYOUT_TEX, DVI_LAYOUT_TEX, LINES_TEX]) for (const s of OWN) expect(tex).not.toContain(s)
    const paper = openPaper(new Map([['main.tex', enc(PAPER)]]))
    for (const options of [{ lines: true, layout: LAYOUT_CLASSES }, { lines: true }, {}]) {
      const main = new TextDecoder('latin1').decode(originalFiles(paper, options).get('main.tex')!)
      for (const s of OWN) expect(main).not.toContain(s)
    }
  })
})
