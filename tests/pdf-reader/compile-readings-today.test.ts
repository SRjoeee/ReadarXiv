import { describe, expect, it } from 'vitest'
import { citationLines } from '@/pdf-reader/engine/pipeline/live.mjs'

// The readings of a compile the prepare takes (live.mjs): whether its last pass stopped short or ran through, an aux's citation
// lines, and where each unit stands in the files a compile is given. Kept from live-sequence.test.ts, whose run of the compiled
// translation went with it (2026-11-04, the rules audit's F4)

describe('citationLines: every line of an aux for a key it cites, in its order', () => {
  it("apacite's second line, harvard's, backref's; not \\citation, not a label, not a list's line, not a line cut short", () => {
    const aux = ['\\relax', '\\citation{smith,jones}', '\\bibcite{smith}{\\citeauthoryear{Smith}{Smith}{{\\APACyear{2001}}}}', '\\APACbibcite{smith}{\\citeauthoryear{Smith}{Smith}{{\\APACyear{2001}}}}', '\\harvardcite{jones}{Jones}{Jones}{1999}', '\\backcite{smith}{{1}{1}{section.1}}', '\\newlabel{sec:a}{{1}{1}}', '\\newlabel{smith}{{2}{3}}', '\\@writefile{toc}{x}', '\\bibcite{cut}{{1}'].join('\n')
    expect(citationLines(aux).split('\n')).toEqual(aux.split('\n').slice(2, 6))
  })
  it('\\nocite{*}: the keys \\bibcite names', () => {
    expect(citationLines('\\citation{*}\n\\bibcite{a}{1}\n\\APACbibcite{a}{1}\n')).toBe('\\bibcite{a}{1}\n\\APACbibcite{a}{1}')
  })
  it("biblatex's lines name a refsection first, and are none; an aux with no citation, nothing", () => {
    expect(citationLines('\\abx@aux@cite{0}{a}\n\\abx@aux@segm{0}{0}{a}\n')).toBe('')
    expect(citationLines(null)).toBe('')
  })
})

