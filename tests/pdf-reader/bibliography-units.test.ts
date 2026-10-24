import { describe, expect, it } from 'vitest'
import { bundleUnitsOf } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { toTranslate } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { classOf, LAYOUT_CLASSES } from '@/pdf-reader/engine/layout/marks.mjs'
import { openPaper, originalFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { classesOn, shownTranslated, unitClass, unitShown } from '@/pdf-reader/engine/rules/content-classes.mjs'
import { plainSource } from '@/pdf-reader/engine/translate/mt.mjs'

// The content classes' stage 4 (docs/route/orphan-text.md §5, "References" and "Names"; the owner's rulings of 2026-10-25): a
// bibliography's entries are units of their own, read from the bibliography's TeX the compile reads (the paper's
// thebibliography, or the .bbl its package holds) and marked there as the body's units are; an entry's names, its first block,
// a unit of the class `names` (kind refnames), the rest one of `references` (kind reference); its label, numbers, web
// addresses and formulas the original's ink. Every class is translated once whatever the target: the author block's names
// too, which before this were sent only where the target's script writes names its own way.

type Piece = { t: string; s?: string; src?: string }
type Unit = { kind: string; file: string; pieces: Piece[] }
const enc = (s: string) => new TextEncoder().encode(s)
const open = (files: Record<string, string>) => openPaper(new Map(Object.entries(files).map(([k, v]) => [k, enc(v)])))
const doc = (body: string, pre = '') => `\\documentclass{article}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`
const units = (p: ReturnType<typeof open>) => p.units as unknown as Unit[]
const bib = (p: ReturnType<typeof open>) => units(p).filter(u => u.kind === 'reference' || u.kind === 'refnames')
/** a unit as the translator reads it: its text, each placeholder its source in brackets */
const shown = (u: Unit) => u.pieces.map(x => (x.t === 'text' ? x.s : x.t === 'ph' ? `[${x.src}]` : x.t === 'open' ? '<' : x.t === 'close' ? '>' : '')).join('').replace(/\s+/g, ' ').trim()
/** the marked original's file (live.mjs originalFiles with the layout marks), as TeX reads it */
const marked = (p: ReturnType<typeof open>, file: string) => new TextDecoder().decode(originalFiles(p, { layout: LAYOUT_CLASSES }).get(file))

const PLAIN = `\\begin{thebibliography}{10}

\\bibitem{layernorm2016}
Jimmy~Lei Ba, Jamie~Ryan Kiros, and Geoffrey~E Hinton.
\\newblock Layer normalization.
\\newblock {\\em arXiv preprint arXiv:1607.06450}, 2016.

\\bibitem{bengio1994}
Y.~Bengio, P.~Simard, and P.~Frasconi.
\\newblock Learning long-term dependencies with gradient descent is difficult.
\\newblock {\\em IEEE Transactions on Neural Networks}, 5(2):157--166, 1994.

\\end{thebibliography}`

describe('a numeric \\bibitem bibliography written in the paper (plain, abbrv, unsrt, ieee)', () => {
  const p = open({ 'main.tex': doc(`Attention needs normalization \\cite{layernorm2016}.\n\n${PLAIN}`) })
  it('makes each entry its names and the rest, in order: the label and the key no piece of either', () => {
    expect(bib(p).map(u => [u.kind, shown(u)])).toEqual([
      ['refnames', 'Jimmy[~]Lei Ba, Jamie[~]Ryan Kiros, and Geoffrey[~]E Hinton.'],
      ['reference', '[\\newblock] Layer normalization. [\\newblock] <[\\em] arXiv preprint arXiv:1607.06450>, [2016.]'],
      ['refnames', 'Y.[~]Bengio, P.[~]Simard, and P.[~]Frasconi.'],
      ['reference', '[\\newblock] Learning long-term dependencies with gradient descent is difficult. [\\newblock] <[\\em] IEEE Transactions on Neural Networks>, [5(2):157--166,] [1994.]'],
    ])
    for (const u of bib(p)) expect(u.pieces.some(x => /layernorm2016|bengio1994|\\bibitem/.test(x.src ?? x.s ?? '')), shown(u)).toBe(false)
    // (the body's paragraph is the body's, before them)
    expect(units(p)[0]?.kind).toBe('para')
  })
  it('numbers the entries after every other unit, so that a unit after the bibliography keeps the number it had before entries were units', () => {
    const body = `\\section{Intro}\nAttention needs normalization \\cite{layernorm2016}.\n\n${PLAIN}\n\n\\appendix\n\\section{Proofs}\nThe appendix proves the claims.`
    const withBib = units(open({ 'main.tex': doc(body) })), without = units(open({ 'main.tex': doc(body.replace(PLAIN, '')) }))
    const isBib = (u: Unit) => u.kind === 'reference' || u.kind === 'refnames'
    // (the source's other units first, as a front end with no entries numbers them; the four entries' units after them, in order)
    expect(withBib.slice(0, without.length).map(shown)).toEqual(without.map(shown))
    expect(withBib.slice(without.length).every(isBib)).toBe(true)
    expect(withBib.filter(isBib).map(u => u.kind)).toEqual(['refnames', 'reference', 'refnames', 'reference'])
    expect(withBib.map(shown).indexOf('The appendix proves the claims.')).toBe(without.map(shown).indexOf('The appendix proves the claims.'))
  })
  it('keeps an entry\'s numbers the original\'s ink: each a placeholder of the class `number`, both its marks; a word with a digit stays text', () => {
    const nums = bib(p).flatMap(u => u.pieces.filter(x => x.t === 'ph' && classOf(x as never) === 'number').map(x => x.src))
    expect(nums).toEqual(['2016.', '5(2):157--166,', '1994.'])
    // (arXiv:1607.06450 holds letters: the translator's text, which it keeps)
    expect(plainSource(bib(p)[1] as never)).toContain('arXiv:1607.06450')
  })
  it('puts every entry\'s marks in the bibliography\'s TeX, as a body unit\'s: a start and an end mark each, the numbers between their own', () => {
    const tex = marked(p, 'main.tex'), id = (k: number) => units(p).indexOf(bib(p)[k]!)
    for (let k = 0; k < 4; k++) {
      expect(tex, `entry unit ${k}`).toContain(`\\axtmark{${id(k)}s}`)
      expect(tex, `entry unit ${k}`).toContain(`\\axtend{${id(k)}e}`)
    }
    // (the year: its opening and closing marks around it, the full stop the placeholder's)
    const year = bib(p)[3]!.pieces.findIndex(x => x.src === '1994.')
    expect(tex).toContain(`\\axtpma{p${id(3)}.${year}a}1994.\\axtpm{p${id(3)}.${year}b}`)
    // (the label's \\bibitem and its key as the paper wrote them)
    expect(tex).toContain('\\bibitem{bengio1994}\n')
  })
  it('gives the entries their classes, translated once whatever the target, shown by the reader\'s toggles alone', () => {
    const bundle = { units: bundleUnitsOf(p) }
    for (const lang of ['zh', 'de']) for (const u of bib(p)) expect(toTranslate(bundle as never, lang)).toContain(units(p).indexOf(u))
    expect(bib(p).map(u => unitClass(u))).toEqual(['names', 'references', 'names', 'references'])
    // (the defaults: references off and names off)
    expect(bib(p).map(u => unitShown(u, classesOn(null)))).toEqual([false, false, false, false])
    // (references on alone: an entry's rest, never its names, which follow the names toggle)
    expect(bib(p).map(u => unitShown(u, classesOn({ references: true })))).toEqual([false, true, false, true])
    expect(bib(p).map(u => unitShown(u, classesOn({ names: true })))).toEqual([true, false, true, false])
  })
})

describe('a natbib author-year bibliography the package holds as its .bbl (plainnat, acl_natbib)', () => {
  const BBL = `\\begin{thebibliography}{56}
\\expandafter\\ifx\\csname natexlab\\endcsname\\relax\\def\\natexlab#1{#1}\\fi

\\bibitem[{Akbik et~al.(2018)Akbik, Blythe, and Vollgraf}]{akbik2018contextual}
Alan Akbik, Duncan Blythe, and Roland Vollgraf. 2018.
\\newblock Contextual string embeddings for sequence labeling.
\\newblock In \\emph{Proceedings of the 27th International Conference on
  Computational Linguistics}, pages 1638--1649.

\\bibitem[{Ando and Zhang(2005)}]{ando-zhang:2005}
Rie~Kubota Ando and Tong Zhang. 2005.
\\newblock A framework for learning predictive structures from multiple tasks
  and unlabeled data.
\\newblock \\emph{Journal of Machine Learning Research}, 6(Nov):1817--1853.

\\end{thebibliography}
`
  const p = open({ 'main.tex': doc('Embeddings \\citep{akbik2018contextual} help.\n\n\\bibliographystyle{acl_natbib}\n\\bibliography{refs}', '\\usepackage{natbib}'), 'main.bbl': BBL, 'refs.bib': '@article{x, title={y}}\n' })
  it('reads the .bbl where \\bibliography reads it: its entries units of that file, the year among the names a placeholder', () => {
    expect(bib(p).map(u => [u.kind, u.file, shown(u)])).toEqual([
      ['refnames', 'main.bbl', 'Alan Akbik, Duncan Blythe, and Roland Vollgraf. [2018.]'],
      ['reference', 'main.bbl', '[\\newblock] Contextual string embeddings for sequence labeling. [\\newblock] In <Proceedings of the 27th International Conference on Computational Linguistics>, pages [1638--1649.]'],
      ['refnames', 'main.bbl', 'Rie[~]Kubota Ando and Tong Zhang. [2005.]'],
      ['reference', 'main.bbl', '[\\newblock] A framework for learning predictive structures from multiple tasks and unlabeled data. [\\newblock] <Journal of Machine Learning Research>, 6(Nov):1817--1853.'],
    ])
    // (natbib's label, the author-year one, set only by the citations: no piece; the style's own lines before the first entry none)
    for (const u of bib(p)) expect(shown(u)).not.toMatch(/Akbik et|natexlab|ando-zhang/)
  })
  it('writes the .bbl back marked, the only bibliography TeX reads (the paper ships it: no BibTeX runs over it)', () => {
    expect(p.meta.bbl).toBe(true)
    const tex = marked(p, 'main.bbl'), id = units(p).indexOf(bib(p)[0]!)
    expect(tex).toContain(`\\leavevmode\\axtmark{${id}s}Alan Akbik`)
    expect(tex).toContain(`\\bibitem[{Akbik et~al.(2018)Akbik, Blythe, and Vollgraf}]{akbik2018contextual}\n`)
  })
})

describe('plainnat\'s \\penalty0 between a volume, its issue and its pages', () => {
  // (TeX reads the penalty's number and stops at the line's end: the next line's digits are text, the pages' (2609.26457v1's
  // 15 entries the wrap left the original's, their ink spelling no source)
  const entry = '\\begin{thebibliography}{1}\n\\bibitem[Audibert et~al.(2009)]{a}\nJ.-Y. Audibert and R.~Munos.\n\\newblock Exploration tradeoff.\n\\newblock \\emph{Theoretical Computer Science}, 410\\penalty0 (19):\\penalty0\n  1876--1902, 2009.\n\\end{thebibliography}'
  it('reads the digits after a \\penalty0 at a line\'s end as the text\'s, each number its own placeholder', () => {
    const p = open({ 'main.tex': doc(`Bandits \\citep{a}.\n\n${entry}`, '\\usepackage{natbib}') })
    const ref = bib(p).find(u => u.kind === 'reference')!
    expect(ref.pieces.filter(x => x.t === 'ph').map(x => [x.src, classOf(x as never)])).toEqual([
      ['\\newblock', null], ['\\newblock', null], ['410', 'number'], ['\\penalty0 ', null], ['(19):', 'number'], ['\\penalty0\n  ', null], ['1876--1902,', 'number'], ['2009.', 'number'],
    ])
  })
  it('and so in the body: a penalty\'s number ends where TeX ends it', () => {
    const p = open({ 'main.tex': doc('Some words\\penalty0\n  12 apples are many.') })
    expect(plainSource(units(p)[0] as never)).toContain('12 apples')
  })
})

describe('an entry with an accented word, and one with no author', () => {
  const entries = '\\begin{thebibliography}{3}\n\\bibitem{a}\nK.~G{\\"o}del.\n\\newblock An \\"{o}verview of proofs, 2020.\n\n\\bibitem{guide}\nThe Research Guide.\n\\newblock University Press, 2021.\n\n\\bibitem{b}\nWilliam Feller.\n\\newblock Probability, 1968.\n\\end{thebibliography}'
  const p = open({ 'main.tex': doc(`Proofs \\cite{a,guide,b}.\n\n${entries}`) })
  it('keeps a number the original\'s ink in a piece an accent\'s letter joined: the year its own placeholder, the word its own source', () => {
    const ref = bib(p)[1]!
    expect(ref.kind).toBe('reference')
    expect(ref.pieces.filter(x => x.t === 'ph' && classOf(x as never) === 'number').map(x => x.src)).toEqual(['2020.'])
    // (the accented word's text and source, which patch writes back, as before the cut)
    const word = ref.pieces.find(x => x.t === 'text' && x.src !== undefined)!
    expect([word.src?.trim(), plainSource(ref as never)]).toEqual(['An \\"{o}verview of proofs,', expect.stringContaining('verview of proofs,')])
  })
  it('makes an entry with no author one unit of the references: its first block a title, which no names toggle holds', () => {
    expect(bib(p).map(u => u.kind)).toEqual(['refnames', 'reference', 'reference', 'refnames', 'reference'])
    expect(shown(bib(p)[2]!)).toBe('The Research Guide. [\\newblock] University Press, [2021.]')
    // (a name of two capitalised words is a name, as one with an initial or a tie is)
    expect(shown(bib(p)[3]!)).toBe('William Feller.')
  })
})

describe('a bibliography biblatex sets from biber\'s data (\\printbibliography)', () => {
  // (biber's .bbl holds the entries' fields, no text TeX sets as it stands: \\printbibliography sets each entry from them)
  const BIBER = `% $ biblatex auxiliary file $
\\begingroup
\\makeatletter
\\refsection{0}
  \\datalist[entry]{nty/global//global/global}
    \\entry{vaswani2017}{inproceedings}{}
      \\name{author}{1}{}{%
        {{hash=1}{%
           family={Vaswani},
           given={Ashish},
        }}%
      }
      \\field{title}{Attention is all you need}
      \\field{year}{2017}
    \\endentry
  \\enddatalist
\\endrefsection
\\endgroup
`
  const tex = doc('Attention \\autocite{vaswani2017} is all.\n\n\\printbibliography', '\\usepackage[backend=biber]{biblatex}\n\\bibliography{refs}')
  it('makes no unit of biber\'s data, whatever names it (\\bibliography, biblatex\'s alias of \\addbibresource), and none of \\printbibliography', () => {
    const p = open({ 'main.tex': tex, 'main.bbl': BIBER, 'refs.bib': '@inproceedings{vaswani2017, title={Attention is all you need}}\n' })
    expect(bib(p)).toEqual([])
    expect(units(p).some(u => u.file === 'main.bbl')).toBe(false)
    // (the marked original leaves biber's file as the paper ships it)
    expect(originalFiles(p, { layout: LAYOUT_CLASSES }).has('main.bbl')).toBe(false)
  })
})

describe('an entry with a web address or a DOI', () => {
  const BBL = `% Generated by IEEEtran.bst, version: 1.14 (2015/08/26)
\\begin{thebibliography}{10}
\\providecommand{\\url}[1]{#1}
\\providecommand{\\newblock}{\\relax}
\\providecommand{\\BIBentryALTinterwordspacing}{\\spaceskip=\\fontdimen2\\font plus
\\BIBentryALTinterwordstretchfactor\\fontdimen3\\font minus
  \\fontdimen4\\font\\relax}

\\bibitem{wang2025building}
C.~Wang, S.~Zhou, L.~Chen, and S.~Shang, \`\`Building efficient llm pipeline for
  human mobility prediction,'' in \\emph{Proceedings of the 33rd ACM
  International Conference on Advances in Geographic Information Systems},
  2025, pp. 1230--1233.

\\bibitem{gepa}
\\BIBentryALTinterwordspacing
L.~A. Agrawal and O.~Khattab, \`\`{GEPA}: Reflective prompt evolution,'' 2026.
  [Online]. Available: \\url{https://arxiv.org/abs/2507.19457}, doi: 10.1145/3786335.3813167
\\BIBentrySTDinterwordspacing

\\end{thebibliography}
`
  const p = open({ 'main.tex': doc('Pipelines \\cite{wang2025building} and \\cite{gepa}.\n\n\\bibliographystyle{IEEEtran}\n\\bibliography{refs}'), 'main.bbl': BBL })
  it('ends an IEEEtran entry\'s names at its title\'s quotes, and keeps the address and the DOI the original\'s', () => {
    expect(bib(p).map(u => [u.kind, shown(u)])).toEqual([
      ['refnames', 'C.[~]Wang, S.[~]Zhou, L.[~]Chen, and S.[~]Shang,'],
      ['reference', '``Building efficient llm pipeline for human mobility prediction,\'\' in <Proceedings of the 33rd ACM International Conference on Advances in Geographic Information Systems>, [2025,] pp. [1230--1233.]'],
      ['refnames', '[\\BIBentryALTinterwordspacing] L.[~]A. Agrawal and O.[~]Khattab,'],
      ['reference', '``<GEPA>: Reflective prompt evolution,\'\' [2026.] [Online]. Available: [\\url{https://arxiv.org/abs/2507.19457}], doi: [10.1145/3786335.3813167] [\\BIBentrySTDinterwordspacing]'],
    ])
    const ref = bib(p)[3]!, cls = ref.pieces.filter(x => x.t === 'ph').map(x => [x.src, classOf(x as never)])
    expect(cls).toContainEqual(['\\url{https://arxiv.org/abs/2507.19457}', 'url'])
    expect(cls).toContainEqual(['10.1145/3786335.3813167', 'number'])
    // (IEEEtran's spacing declarations set no ink and take no argument: no mark, nothing of the text after them taken)
    expect(cls).toContainEqual(['\\BIBentrySTDinterwordspacing', null])
  })
})

describe('REVTeX\'s and ACM\'s fields (apsrev4-2, ACM-Reference-Format)', () => {
  const BBL = `\\begin{thebibliography}{170}%
\\providecommand \\bibnamefont  [1]{#1}%
\\bibitem [{\\citenamefont {Davis}\\ \\emph {et~al.}(1971)}]{PhysRevLett.27.1466}%
  \\BibitemOpen
  \\bibfield  {author} {\\bibinfo {author} {\\bibfnamefont {M.}~\\bibnamefont
  {Davis}}, \\ and\\ \\bibinfo {author} {\\bibfnamefont {R.~H.}\\ \\bibnamefont {Price}},\\ }\\href
  {\\doibase 10.1103/PhysRevLett.27.1466} {\\bibfield  {journal} {\\bibinfo
  {journal} {Phys. Rev. Lett.}\\ }\\textbf {\\bibinfo {volume} {27}},\\ \\bibinfo
  {pages} {1466} (\\bibinfo {year} {1971})}\\BibitemShut {NoStop}%
\\end{thebibliography}%
`
  const p = open({ 'main.tex': doc('Waves \\cite{PhysRevLett.27.1466}.\n\n\\bibliography{refs}', '\\usepackage{natbib}'), 'main.bbl': BBL })
  it('reads the fields\' text as it stands: the authors\' field the names, \\BibitemOpen and \\BibitemShut no piece', () => {
    const [names, ref] = bib(p)
    expect([names?.kind, ref?.kind, bib(p).length]).toEqual(['refnames', 'reference', 2])
    expect(plainSource(names as never).replace(/\s+/g, ' ')).toMatch(/M\..*Davis.*and.*R\..*H\..*Price/)
    expect(plainSource(ref as never)).toContain('Phys. Rev. Lett.')
    for (const u of bib(p)) expect(shown(u)).not.toMatch(/Bibitem(?:Open|Shut)/)
    // (the volume, the page and the year: numbers kept)
    expect(ref!.pieces.filter(x => x.t === 'ph' && classOf(x as never) === 'number').map(x => x.src)).toEqual(['27', '1466', '1971'])
  })
})

describe('an author block with affiliations and \\thanks: the class names, translated for every target', () => {
  const tex = doc('\\maketitle\n\nThe body of the paper says something.', '\\title{A Title}\n\\author{Ada Lovelace\\thanks{Supported by the Analytical Society.}\\\\\nUniversity of London\n\\and\nCharles Babbage\\\\\nCambridge}')
  const p = open({ 'main.tex': tex })
  const bundle = { units: bundleUnitsOf(p) }
  it('sends the author block\'s names and places, and its note, whatever the target writes names as', () => {
    const authors = units(p).flatMap((u, i) => (u.kind === 'author' ? [i] : []))
    expect(authors.length).toBeGreaterThan(0)
    // (German writes names as the paper does: until TRANSLATE_VERSION 6 the block stayed in the source for it)
    for (const lang of ['de', 'fr', 'zh', 'ja']) expect(toTranslate(bundle as never, lang), lang).toEqual(expect.arrayContaining(authors))
    const note = units(p).findIndex(u => u.kind === 'footnote' && plainSource(u as never).includes('Analytical Society'))
    expect(note).toBeGreaterThanOrEqual(0)
    expect(toTranslate(bundle as never, 'de')).toContain(note)
  })
  it('shows the names translated under the names toggle alone; the note and the body always', () => {
    const author = units(p).find(u => u.kind === 'author')!, note = units(p).find(u => u.kind === 'footnote')!
    expect([unitClass(author), unitClass(note)]).toEqual(['names', 'body'])
    expect(shownTranslated('names', classesOn(null))).toBe(false)
    expect(unitShown(author, classesOn({ names: true }))).toBe(true)
    expect(unitShown(author, classesOn({ references: true }))).toBe(false)
    expect(unitShown(note, classesOn(null))).toBe(true)
  })
})
