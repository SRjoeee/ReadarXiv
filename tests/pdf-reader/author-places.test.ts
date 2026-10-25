import { describe, expect, it } from 'vitest'
import { bundleUnitsOf } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { toTranslate } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { LAYOUT_CLASSES } from '@/pdf-reader/engine/layout/marks.mjs'
import { openPaper, originalFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { classesOn, unitClass, unitShown } from '@/pdf-reader/engine/rules/content-classes.mjs'

// The author block's names split from its places (docs/route/orphan-text.md §5, "Names"; the owner's rulings of 2026-10-25): the
// authors' names stay units of kind `author` (the reader's "names", off by default), the affiliations, institutions and addresses
// become units of kind `affiliation`, prose of the body, always translated. Read from the TeX the source holds (latex-front.mjs
// frontBlock): which command holds the text, the rows of the tabular LaTeX sets an \author in, the numbered list of places, an
// author's note; an e-mail, a web address and an ORCID stay the original's ink. Each shape a paper writes, one test.

type Piece = { t: string; s?: string; src?: string }
type Unit = { kind: string; pieces: Piece[] }
const enc = (s: string) => new TextEncoder().encode(s)
const open = (body: string, pre = '', cls = 'article') => openPaper(new Map([['main.tex', enc(`\\documentclass{${cls}}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`)]]))
const units = (p: ReturnType<typeof open>) => p.units as unknown as Unit[]
const textOf = (u: Unit) => u.pieces.filter(x => x.t === 'text').map(x => x.s).join('').replace(/\s+/g, ' ').trim()
const of = (p: ReturnType<typeof open>, kind: string) => units(p).filter(u => u.kind === kind).map(textOf)
const names = (p: ReturnType<typeof open>) => of(p, 'author'), places = (p: ReturnType<typeof open>) => of(p, 'affiliation')

describe('an author block\'s names and its places, by the TeX that sets them', () => {
  it('LaTeX\'s \\author, NeurIPS\'s \\And: each author\'s block the rows of a tabular, its names the first, its places the rest', () => {
    const p = open('\\maketitle\nWords of the body.', '\\author{Ashish Vaswani\\thanks{Equal contribution.} \\\\ Google Brain \\\\ \\texttt{avaswani@google.com} \\And Noam Shazeer \\\\ Google Research \\\\ \\texttt{noam@google.com}}')
    expect(names(p)).toEqual(['Ashish Vaswani', 'Noam Shazeer'])
    expect(places(p)).toEqual(['Google Brain', 'Google Research'])
    // (the note a footnote of its own; the e-mail rows no unit: an address is no prose)
    expect(of(p, 'footnote')).toEqual(['Equal contribution.'])
    expect(units(p).map(textOf).join('|')).not.toMatch(/google\.com/)
  })
  it('a numbered list of places (each row opening with its mark): every row before it names, however many', () => {
    const p = open('\\maketitle\nWords.', '\\author{Alice Smith$^{1}$, Bob Jones$^{2}$, \\\\ Carol White$^{1}$ \\\\[2mm] $^{1}$University of Somewhere \\\\ {\\small $^{2}$Institute of Elsewhere}}')
    expect(names(p)).toEqual(['Alice Smith, Bob Jones,', 'Carol White'])
    expect(places(p)).toEqual(['University of Somewhere', 'Institute of Elsewhere'])
  })
  it('a row that holds an author\'s note is names (\\thanks, \\footnotemark), whatever row it is', () => {
    const p = open('\\maketitle\nWords.', '\\author{Alice\\thanks{Equal contribution.} \\\\ Bob\\footnotemark[1] \\\\ The University}')
    expect(names(p)).toEqual(['Alice', 'Bob'])
    expect(places(p)).toEqual(['The University'])
  })
  it('authblk: \\author[n] names, a row of them begun by \\authorcr, \\affil[n] places, a row each', () => {
    const p = open('\\maketitle\nWords.', '\\usepackage{authblk}\n\\author[1]{Alice Smith}\n\\author[2]{Bob Jones \\authorcr Carol White}\n\\affil[1]{University of Somewhere}\n\\affil[2]{Institute of Elsewhere \\\\ A City}')
    expect(names(p)).toEqual(['Alice Smith', 'Bob Jones Carol White'])
    expect(places(p)).toEqual(['University of Somewhere', 'Institute of Elsewhere', 'A City'])
  })
  it('IEEEtran: \\IEEEauthorblockN names, \\IEEEauthorblockA places, an e-mail in it kept', () => {
    const p = open('\\maketitle\nWords.', '\\author{\\IEEEauthorblockN{Alice Smith\\IEEEauthorrefmark{1}, Bob Jones\\IEEEauthorrefmark{2}}\n\\IEEEauthorblockA{\\IEEEauthorrefmark{1}Peking University, Beijing, China \\\\ alice@pku.edu.cn}}', 'IEEEtran')
    expect(names(p)).toEqual(['Alice Smith, Bob Jones'])
    expect(places(p)).toEqual(['Peking University, Beijing, China'])
  })
  it('acmart and REVTeX: \\author names, \\affiliation places (acmart\'s \\institution, \\city and \\country in it), \\email kept', () => {
    const acm = open('\\maketitle\nWords.', '\\author{Alice Smith}\n\\affiliation{\\institution{Peking University}\\city{Beijing}\\country{China}}\n\\email{alice@pku.edu.cn}')
    expect(names(acm)).toEqual(['Alice Smith'])
    // (one unit, its parts' pairs inside it: their texts joined as the pieces are)
    expect(places(acm)).toEqual(['Peking UniversityBeijingChina'])
    const rev = open('\\maketitle\nWords.', '\\author{Alice Smith}\n\\email{alice@x.org}\n\\affiliation{Department of Physics, University of Somewhere}\n\\altaffiliation{Also at the Institute of Elsewhere}')
    expect(names(rev)).toEqual(['Alice Smith'])
    expect(places(rev)).toEqual(['Department of Physics, University of Somewhere', 'Also at the Institute of Elsewhere'])
    expect(units(rev).map(textOf).join('|')).not.toMatch(/x\.org/)
  })
  it('elsarticle: \\author[a] names, \\address[a] places, and an affiliation of keys and values each value of words a place, a postcode kept', () => {
    const p = open('\\maketitle\nWords.', '\\author[a]{Alice Smith}\n\\address[a]{Department of Physics, University of Somewhere}\n\\affiliation[b]{organization={Institute of Elsewhere},\n  addressline={1 Long Street}, city={Paris}, postcode={75005}, country={France}}')
    expect(names(p)).toEqual(['Alice Smith'])
    expect(places(p)).toEqual(['Department of Physics, University of Somewhere', 'Institute of Elsewhere', '1 Long Street', 'Paris', 'France'])
    // (each value's unit inside its braces, the keys and the postcode as they are)
    expect(new TextDecoder().decode(originalFiles(p, { layout: LAYOUT_CLASSES }).get('main.tex'))).toMatch(/organization=\{\\leavevmode\\axtmark\{\d+s\}Institute of Elsewhere\\axtend\{\d+e\}\}/)
  })
  it('llncs: \\author with \\inst and \\and names, \\institute places, an institute each, its e-mail kept', () => {
    const p = open('\\maketitle\nWords.', '\\author{Alice Smith\\inst{1} \\and Bob Jones\\inst{2}}\n\\institute{University of Somewhere \\and Institute of Elsewhere \\email{bob@else.org}}', 'llncs')
    expect(names(p)).toEqual(['Alice Smith', 'Bob Jones'])
    expect(places(p)).toEqual(['University of Somewhere', 'Institute of Elsewhere'])
  })
  it('ICML\'s \\icmlauthor names and \\icmlaffiliation places; AAAI\'s \\affiliations places, a row each', () => {
    const icml = open('\\twocolumn[\\icmltitle{A Title}\\icmlauthor{Jane Doe}{x}\\icmlaffiliation{x}{Department of Computer Science, Some University}]\nWords.', '\\usepackage{icml2025}')
    expect(names(icml)).toEqual(['Jane Doe'])
    expect(places(icml)).toEqual(['Department of Computer Science, Some University'])
    const aaai = open('\\maketitle\nWords.', '\\author{Alice Example}\n\\affiliations{School of Information Engineering\\\\ Shanghai Maritime University}')
    expect(places(aaai)).toEqual(['School of Information Engineering', 'Shanghai Maritime University'])
  })
  it('an e-mail, a web address and an ORCID written out stay the original\'s ink: placeholders of the place they stand in', () => {
    const p = open('\\maketitle\nWords.', '\\author{Alice Smith \\\\ University of Somewhere, alice@some.edu, ORCID 0000-0002-1825-0097, see https://some.edu/alice}')
    expect(places(p)).toEqual(['University of Somewhere, , ORCID , see'])
    const srcs = units(p).filter(u => u.kind === 'affiliation').flatMap(u => u.pieces.filter(x => x.t === 'ph').map(x => x.src))
    expect(srcs).toEqual(['alice@some.edu', '0000-0002-1825-0097', 'https://some.edu/alice'])
  })
})

describe('the places\' units: their number, their class, their marks', () => {
  const BIB = '\\begin{thebibliography}{9}\n\\bibitem{a} A.~Author.\n\\newblock A title of a paper.\n\\newblock 2020.\n\\end{thebibliography}'
  const p = open(`\\maketitle\nThe first paragraph.\n\nThe second paragraph.\n\n${BIB}`, '\\title{A Title}\n\\author{Alice Smith \\\\ University of Somewhere}')
  it('the names keep the number the whole block had; the places are numbered after every other unit, before the entries', () => {
    expect(units(p).map(u => u.kind)).toEqual(['heading', 'author', 'para', 'para', 'affiliation', 'refnames', 'reference'])
  })
  it('a place is the body\'s, always translated and shown; a name the names\', shown with that toggle alone', () => {
    expect(['author', 'affiliation'].map(k => unitClass(k))).toEqual(['names', 'body'])
    const on = classesOn(null)
    expect(units(p).filter(u => u.kind === 'author' || u.kind === 'affiliation').map(u => unitShown(u, on))).toEqual([false, true])
    // (both sent, once, whatever the toggles)
    const bundle = { units: bundleUnitsOf(p) }
    expect(toTranslate(bundle, 'zh')).toEqual(expect.arrayContaining([1, 4]))
  })
  it('marked as the author block\'s names are, in the layout compile: its own start and end marks', () => {
    const tex = new TextDecoder().decode(originalFiles(p, { layout: LAYOUT_CLASSES }).get('main.tex'))
    expect(tex).toMatch(/\\author\{\\leavevmode\\axtmark\{1s\}Alice Smith\\axtend\{1e\} \\\\ \\leavevmode\\axtmark\{4s\}University of Somewhere\\axtend\{4e\}\}/)
  })
})
