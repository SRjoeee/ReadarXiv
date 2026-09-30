import { describe, expect, it } from 'vitest'
import { inMemory, loadProject, patch } from '@/pdf-reader/engine/latex-front.mjs'

// The PDF reader's LaTeX front end: what of a paper's source is prose to translate

type Unit = { kind: string; pieces: { t: string; s?: string }[] }
const project = (tex: string) => loadProject(inMemory(new Map([['main.tex', new TextEncoder().encode(tex)]])), 'main.tex')
const textOf = (u: Unit) => u.pieces.filter(p => p.t === 'text').map(p => p.s).join('')
/** every unit's words replaced by a mark of its own, and the main file as it is then typeset */
const patched = (p: ReturnType<typeof project>) => {
  const units = p.units as Unit[]
  const translated = new Map(units.map((u, i) => [u, u.pieces.map(x => (x.t === 'text' ? { ...x, tr: true, s: `<T${i}>` } : x))]))
  return new TextDecoder().decode(patch(p, translated as Map<(typeof p.units)[number], unknown[]>).get('main.tex'))
}

describe('the front matter\'s notes (1706.03762: the author block\'s footnotes stayed in English)', () => {
  const AUTHORS = '\\author{Alice\\thanks{Equal contribution. Listing order is random.}\\\\ Bob\\footnotemark[1] \\hspace{1mm}\\thanks{Work performed while at X.}}'

  it('in the preamble: each \\thanks of the author block is a footnote of its own, and the names are no unit', () => {
    const p = project(`\\documentclass{article}\\title{The Paper}${AUTHORS}\\begin{document}\\maketitle\nWords here.\\end{document}`)
    const units = p.units as Unit[]
    expect(units.filter(u => u.kind === 'footnote').map(textOf)).toEqual(['Equal contribution. Listing order is random.', 'Work performed while at X.'])
    expect(units.some(u => /Alice|Bob/.test(textOf(u)))).toBe(false)
    // typeset: the notes translated in place, the names, marks and spacing as the author wrote them
    const tex = patched(p)
    expect(tex).toMatch(/\\author\{Alice\\thanks\{<T\d+>\}\\\\ Bob\\footnotemark\[1\] \\hspace\{1mm\}\\thanks\{<T\d+>\}\}/)
  })

  it('in the body too, where some classes want the author block', () => {
    const p = project(`\\documentclass{article}\\begin{document}\\title{The Paper}${AUTHORS}\\maketitle\nWords here.\\end{document}`)
    expect((p.units as Unit[]).filter(u => u.kind === 'footnote').map(textOf)).toEqual(['Equal contribution. Listing order is random.', 'Work performed while at X.'])
    expect(patched(p)).toContain('\\author{Alice\\thanks{<T')
  })

  it('an affiliation\'s note as well; the title\'s note stays the title\'s, and the title is still the title', () => {
    const p = project('\\documentclass{article}\\title{The Paper\\thanks{Supported by a grant.}}\\author{Alice}\\affil{Somewhere\\thanks{Now elsewhere.}}\\begin{document}\\maketitle\nWords.\\end{document}')
    const units = p.units as (Unit & { title?: boolean })[]
    expect(units.filter(u => u.kind === 'footnote').map(textOf).sort()).toEqual(['Now elsewhere.', 'Supported by a grant.'])
    expect(units.filter(u => u.title).map(textOf)).toEqual(['The Paper'])
    expect(units.some(u => /Somewhere|Alice/.test(textOf(u)))).toBe(false)
  })
})

describe('a display outside a unit\'s marks (the reader\'s anchors take it from beyond them: 211 of 747 displays were lit with no unit)', () => {
  const body = (b: string) => project(`\\documentclass{article}\\begin{document}\n${b}\n\\end{document}`).units as (Unit & { lead?: true; trail?: true })[]
  const flags = (b: string) => body(b).map(u => [textOf(u).trim().split(' ')[0], u.lead ?? false, u.trail ?? false])

  it('a paragraph that ends with a display trails it; one that opens with a display leads with it', () => {
    expect(flags('It holds that\n\\begin{equation}a = b\\end{equation}\n\n\\[ c = d \\]\nwhere c is given.\n\nPlain words, $x$ inline, and an \\[ e \\] inner display in the middle of it.')).toEqual([
      ['It', false, true], ['where', true, false], ['Plain', false, false]])
  })

  it('a display standing alone after a paragraph is the paragraph\'s; after a heading, or apart from it by a figure, nobody\'s', () => {
    expect(flags('First words here.\n\n\\begin{align}a &= b\\end{align}\n\n\\section{A Heading}\n\n\\[ x \\]\n\nMore words.\n\n\\begin{figure}\\caption{A caption.}\\end{figure}\n\n\\[ y \\]\n\nLast.')).toEqual([
      ['First', false, true], ['A', false, false], ['More', false, false], ['A', false, false], ['Last.', false, false]])
  })

  it('an inline formula, an inline math environment and $$ at the head of a paragraph are no display beyond its marks', () => {
    // $$ counts as inline for the start mark (patch), which goes before it
    expect(flags('\\begin{math}m\\end{math} opens this one.\n\n$$ d $$ and this one.\n\nThis ends inline $x$')).toEqual([
      ['opens', false, false], ['and', false, false], ['This', false, false]])
  })
})
