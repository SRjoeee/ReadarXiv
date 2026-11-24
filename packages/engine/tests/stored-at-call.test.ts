// A paper's macro that keeps its argument in a definition and sets what it kept at its own call is no front matter command: its
// call stands in the paragraph TeX sets it in, one placeholder of that paragraph's unit (RED until the source reader reads it
// so).
//
// The source reader takes a paper's macro whose prose parameter a definition in its body stores and none of its body typesets
// (source/latex-front.ts paperMacros: `stores`, the parameter in `use.stored` and not in `use.typeset`) for a command that hands
// its text elsewhere, as LaTeX's \author does (`\def\author#1{\gdef\@author{#1}}`, set by \maketitle). The walk then ends the
// unit before the call and makes the argument a unit of its own, `front` and `held` (the `macro.stores` branch). That reading
// does not ask whether the call's own expansion sets the stored text right where it stands. A paper that redefines its
// citation command to read the token after it (`\renewcommand{\citep}[1]{\unskip\def\x@keys{#1}\futurelet\x@next\x@check}`,
// \x@check setting `\x@citep{\x@keys}`, natbib's own \citep kept by a \let) stores the keys and sets them in the same call:
// every citation then cuts its paragraph in two, the keys become a unit of their own that TeX never prints (`unlocated: marks`),
// each piece of the paragraph is laid alone in its own stretch of TeX's lines (blank stretches before the citation numbers,
// a piece too short for its translation left the original's: `unfit`), and the marked original writes the next piece's opening
// marks between the call and the token its \futurelet reads, so the macro reads our mark and sets the punctuation it would
// have taken elsewhere (a line moves; the next unit's first glyph has no partner: `content difference: bonly`). The same
// macro with the store one call deeper (`\renewcommand{\citep}[1]{\unskip\x@cite{#1}}`, \x@cite storing it) is read as TeX
// reads it: one paragraph, the call one placeholder, which the mark probe asks about (its punctuation section), and TeX's
// answer puts the closing mark after the period the macro takes: the marked compile sets every text item where the original
// does (the lane's native case). The property asked here: the reading of the call does not depend on that depth.
import { describe, expect, it } from 'vitest'
import { openPaper } from '../src/compile/live.ts'
import { probeSamples } from '../src/marks/marks.ts'

const enc = (s: string) => new TextEncoder().encode(s)
const paperOf = (tex: string) => openPaper(new Map([['main.tex', enc(tex)]]))
type P = { t: string; s?: string; src?: string }
const shape = (u: { kind: string; pieces: readonly P[] }) =>
  `${u.kind}: ${u.pieces.map((p) => (p.t === 'text' ? p.s : `[${p.src ?? p.t}]`)).join('')}`

const PARA =
  'Our own first sentence names a source \\citep{alpha}. Our second sentence names two more \\citep{beta,gamma} and goes on\nto its end, which is long enough to make a line.'
const docOf = (defs: string) =>
  `\\documentclass{article}\n\\usepackage[numbers,super]{natbib}\n\\makeatletter\n${defs}\n\\makeatother\n\\begin{document}\n${PARA}\n\nOur own last paragraph, long enough to be a unit of its own.\n\\begin{thebibliography}{9}\n\\bibitem{alpha} A. Alpha. One.\n\\bibitem{beta} B. Beta. Two.\n\\bibitem{gamma} C. Gamma. Three.\n\\end{thebibliography}\n\\end{document}\n`
// (the reader of what follows: a period or a comma taken and set under the citation, as such a paper writes it)
const CHECK =
  '\\newcommand{\\our@check}{\\ifx\\our@next.\\let\\our@do\\our@over\\else\\ifx\\our@next,\\let\\our@do\\our@over\\else\\let\\our@do\\our@plain\\fi\\fi\\our@do}\n\\newcommand{\\our@plain}{{\\sffamily\\our@citep{\\our@keys}}}\n\\newcommand{\\our@over}[1]{\\leavevmode\\rlap{#1}{\\sffamily\\our@citep{\\our@keys}}\\spacefactor\\sfcode`#1\\relax}'
const STORED_IN_CALL = `\\AtBeginDocument{\\let\\our@citep\\citep\\renewcommand{\\citep}[1]{\\unskip\\def\\our@keys{#1}\\futurelet\\our@next\\our@check}}\n${CHECK}`
const STORED_ONE_DEEPER = `\\AtBeginDocument{\\let\\our@citep\\citep\\renewcommand{\\citep}[1]{\\unskip\\our@cite{#1}}}\n\\newcommand{\\our@cite}[1]{\\def\\our@keys{#1}\\futurelet\\our@next\\our@check}\n${CHECK}`
const ONE_UNIT =
  'para: \nOur own first sentence names a source [\\citep{alpha}]. Our second sentence names two more [\\citep{beta,gamma}] and goes on\nto its end, which is long enough to make a line.'

describe('a paper macro that stores its argument and sets it at its own call', () => {
  it('the control: with the store one call deeper, the paragraph is one unit, each call one placeholder', () => {
    const paper = paperOf(docOf(STORED_ONE_DEEPER))
    expect(shape(paper.units[0]!)).toBe(ONE_UNIT)
  })
  it('the paragraph is one unit, each call one placeholder, as with the store one call deeper', () => {
    const paper = paperOf(docOf(STORED_IN_CALL))
    expect(paper.units.map(shape).filter((s) => s.startsWith('para'))[0]).toBe(ONE_UNIT)
  })
  it('no unit is made of the keys the call stores', () => {
    const paper = paperOf(docOf(STORED_IN_CALL))
    expect(paper.units.filter((u) => u.held && u.front).map(shape)).toEqual([])
  })
  it('the mark probe asks TeX what each call does before the punctuation after it', () => {
    const paper = paperOf(docOf(STORED_IN_CALL))
    const asked = probeSamples(paper.project.units, paper.project.complete).map((s) => s.src)
    expect(asked).toContain('\\citep{alpha}')
  })
  it('the other side: a macro that stores its argument for another command to set keeps it a held front unit', () => {
    // (as LaTeX's \author: the call sets nothing where it stands; \maketitle, elsewhere, sets the stored text)
    const tex = `\\documentclass{article}\n\\makeatletter\n\\newcommand{\\kicker}[1]{\\gdef\\our@kicker{#1}}\n\\newcommand{\\showkicker}{\\par\\textbf{\\our@kicker}\\par}\n\\makeatother\n\\begin{document}\n\\kicker{A kicker of our own words}\nOur own first paragraph, long enough to be a unit of its own.\n\n\\showkicker\n\\end{document}\n`
    const paper = paperOf(tex)
    expect(paper.units.filter((u) => u.held && u.front).map(shape)).toEqual(['para: A kicker of our own words'])
  })
  // (TeX stores a definition's body unexpanded and \let copies a meaning: neither sets the stored text where the call stands)
  const deferred = (inBody: string) =>
    `\\documentclass{article}\n\\makeatletter\n\\newcommand{\\kicker}[1]{\\gdef\\our@kicker{#1}${inBody}}\n\\makeatother\n\\begin{document}\n\\kicker{A kicker of our own words}\nOur own first paragraph, long enough to be a unit of its own.\n\n\\showkicker\n\\end{document}\n`
  it('the other side: a read inside a definition the call makes is not a read at the call', () => {
    const paper = paperOf(deferred('\\gdef\\showkicker{\\par\\textbf{\\our@kicker}\\par}'))
    expect(paper.units.filter((u) => u.held && u.front).map(shape)).toEqual(['para: A kicker of our own words'])
  })
  it('the other side: a \\let of the stored name is not a read at the call', () => {
    const paper = paperOf(deferred('\\global\\let\\showkicker\\our@kicker'))
    expect(paper.units.filter((u) => u.held && u.front).map(shape)).toEqual(['para: A kicker of our own words'])
  })
})
