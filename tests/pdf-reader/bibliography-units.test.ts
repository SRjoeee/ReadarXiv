import { describe, expect, it } from 'vitest'
import { bundleUnitsOf } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { toTranslate } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { classOf, LAYOUT_CLASSES } from '@/pdf-reader/engine/layout/marks.mjs'
import { openPaper, originalFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { classesOn, shownTranslated, unitClass, unitShown } from '@/pdf-reader/engine/rules/content-classes.mjs'
import { plainSource } from '@/pdf-reader/engine/translate/mt.mjs'

// The content classes' stage 4 (docs/route/orphan-text.md §5, "References" and "Names"; the owner's rulings of 2026-10-25 and
// 2026-10-28): a bibliography's entries are units of their own, read from the bibliography's TeX the compile reads (the paper's
// thebibliography, or the .bbl its package holds or BibTeX makes) and marked there as the body's units are; each entry one unit
// of the class `references` (kind reference), whole, its names its own: the references and the author names decoupled, "names"
// the author block's alone; its label, numbers, web addresses and formulas the original's ink. Every class is translated once
// whatever the target: the author block's names too, which before this were sent only where the target's script writes names
// its own way.

type Piece = { t: string; s?: string; src?: string }
type Unit = { kind: string; file: string; pieces: Piece[] }
const enc = (s: string) => new TextEncoder().encode(s)
const open = (files: Record<string, string>) => openPaper(new Map(Object.entries(files).map(([k, v]) => [k, enc(v)])))
const doc = (body: string, pre = '') => `\\documentclass{article}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`
const units = (p: ReturnType<typeof open>) => p.units as unknown as Unit[]
const bib = (p: ReturnType<typeof open>) => units(p).filter(u => u.kind === 'reference')
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
  it('makes each entry one unit, whole, its names its own, in order: the label and the key no piece of it', () => {
    expect(bib(p).map(u => [u.kind, shown(u)])).toEqual([
      ['reference', 'Jimmy[~]Lei Ba, Jamie[~]Ryan Kiros, and Geoffrey[~]E Hinton. [\\newblock] Layer normalization. [\\newblock] <[\\em] arXiv preprint arXiv:1607.06450>, [2016.]'],
      ['reference', 'Y.[~]Bengio, P.[~]Simard, and P.[~]Frasconi. [\\newblock] Learning long-term dependencies with gradient descent is difficult. [\\newblock] <[\\em] IEEE Transactions on Neural Networks>, [5(2):157--166,] [1994.]'],
    ])
    for (const u of bib(p)) expect(u.pieces.some(x => /layernorm2016|bengio1994|\\bibitem/.test(x.src ?? x.s ?? '')), shown(u)).toBe(false)
    // (the body's paragraph is the body's, before them)
    expect(units(p)[0]?.kind).toBe('para')
  })
  it('numbers the entries after every other unit, so that a unit after the bibliography keeps the number it had before entries were units', () => {
    const body = `\\section{Intro}\nAttention needs normalization \\cite{layernorm2016}.\n\n${PLAIN}\n\n\\appendix\n\\section{Proofs}\nThe appendix proves the claims.`
    const withBib = units(open({ 'main.tex': doc(body) })), without = units(open({ 'main.tex': doc(body.replace(PLAIN, '')) }))
    const isBib = (u: Unit) => u.kind === 'reference'
    // (the source's other units first, as a front end with no entries numbers them; the two entries' units after them, in order)
    expect(withBib.slice(0, without.length).map(shown)).toEqual(without.map(shown))
    expect(withBib.slice(without.length).every(isBib)).toBe(true)
    expect(withBib.filter(isBib).map(u => u.kind)).toEqual(['reference', 'reference'])
    expect(withBib.map(shown).indexOf('The appendix proves the claims.')).toBe(without.map(shown).indexOf('The appendix proves the claims.'))
  })
  it('keeps an entry\'s numbers the original\'s ink: each a placeholder of the class `number`, both its marks; a word with a digit stays text', () => {
    const nums = bib(p).flatMap(u => u.pieces.filter(x => x.t === 'ph' && classOf(x as never) === 'number').map(x => x.src))
    expect(nums).toEqual(['2016.', '5(2):157--166,', '1994.'])
    // (arXiv:1607.06450 holds letters: the translator's text, which it keeps)
    expect(plainSource(bib(p)[0] as never)).toContain('arXiv:1607.06450')
  })
  it('puts every entry\'s marks in the bibliography\'s TeX, as a body unit\'s: a start and an end mark each, the numbers between their own', () => {
    const tex = marked(p, 'main.tex'), id = (k: number) => units(p).indexOf(bib(p)[k]!)
    for (let k = 0; k < 2; k++) {
      expect(tex, `entry unit ${k}`).toContain(`\\axtmark{${id(k)}s}`)
      expect(tex, `entry unit ${k}`).toContain(`\\axtend{${id(k)}e}`)
    }
    // (the year: its opening and closing marks around it, the full stop the placeholder's)
    const year = bib(p)[1]!.pieces.findIndex(x => x.src === '1994.')
    expect(tex).toContain(`\\axtpma{p${id(1)}.${year}a}1994.\\axtpm{p${id(1)}.${year}b}`)
    // (the label's \\bibitem and its key as the paper wrote them)
    expect(tex).toContain('\\bibitem{bengio1994}\n')
  })
  it('gives the entries their classes, translated once whatever the target, shown by the reader\'s toggles alone', () => {
    const bundle = { units: bundleUnitsOf(p) }
    for (const lang of ['zh', 'de']) for (const u of bib(p)) expect(toTranslate(bundle as never, lang)).toContain(units(p).indexOf(u))
    expect(bib(p).map(u => unitClass(u))).toEqual(['references', 'references'])
    // (the defaults: references off)
    expect(bib(p).map(u => unitShown(u, classesOn(null)))).toEqual([false, false])
    // (references on: each entry whole, its names with it; the names toggle, the author block's alone, shows none of it)
    expect(bib(p).map(u => unitShown(u, classesOn({ references: true })))).toEqual([true, true])
    expect(bib(p).map(u => unitShown(u, classesOn({ names: true })))).toEqual([false, false])
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
  it('reads the .bbl where \\bibliography reads it: its entries units of that file, each whole, the year after the names a placeholder', () => {
    expect(bib(p).map(u => [u.kind, u.file, shown(u)])).toEqual([
      ['reference', 'main.bbl', 'Alan Akbik, Duncan Blythe, and Roland Vollgraf. [2018.] [\\newblock] Contextual string embeddings for sequence labeling. [\\newblock] In <Proceedings of the 27th International Conference on Computational Linguistics>, pages [1638--1649.]'],
      ['reference', 'main.bbl', 'Rie[~]Kubota Ando and Tong Zhang. [2005.] [\\newblock] A framework for learning predictive structures from multiple tasks and unlabeled data. [\\newblock] <Journal of Machine Learning Research>, 6(Nov):1817--1853.'],
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
      ['~', null], ['\\newblock', null], ['\\newblock', null], ['410', 'number'], ['\\penalty0 ', null], ['(19):', 'number'], ['\\penalty0\n  ', null], ['1876--1902,', 'number'], ['2009.', 'number'],
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
    const ref = bib(p)[0]!
    expect(ref.kind).toBe('reference')
    expect(ref.pieces.filter(x => x.t === 'ph' && classOf(x as never) === 'number').map(x => x.src)).toEqual(['2020.'])
    // (the accented word's text and source, which patch writes back, as before the cut)
    const word = ref.pieces.find(x => x.t === 'text' && x.src?.includes('verview'))!
    expect([word.src?.trim(), plainSource(ref as never)]).toEqual(['An \\"{o}verview of proofs,', expect.stringContaining('verview of proofs,')])
    // (the names' accented letter the same way, in the one unit: K.~G{\"o}del)
    expect(plainSource(ref as never)).toMatch(/^K\. G\u00f6del\. An \u00f6verview of proofs,/)
  })
  it('makes an entry with no author one unit of the references, as every entry is: its first block a title or its names alike', () => {
    expect(bib(p).map(u => u.kind)).toEqual(['reference', 'reference', 'reference'])
    expect(shown(bib(p)[1]!)).toBe('The Research Guide. [\\newblock] University Press, [2021.]')
    expect(shown(bib(p)[2]!)).toBe('William Feller. [\\newblock] Probability, [1968.]')
  })
})

describe('an entry\'s first block, whatever it reads as: a title with a comma, editors, others, a name\'s particle', () => {
  const entries = '\\begin{thebibliography}{4}\n\\bibitem{manual}\nA survey of methods, revised edition.\n\\newblock University Press, 2020.\n\n\\bibitem{ed}\nA.~Smith and B.~Jones, editors.\n\\newblock Handbook of Proofs, 2019.\n\n\\bibitem{an}\nAn Wang, Bo Li, and others.\n\\newblock Graphs, 2018.\n\n\\bibitem{van}\nLudwig van Beethoven.\n\\newblock Symphonies, 1808.\n\\end{thebibliography}'
  const p = open({ 'main.tex': doc(`Surveys \\cite{manual,ed,an,van}.\n\n${entries}`) })
  it('keeps each entry one unit: no guess of where its names end, so none is wrong', () => {
    expect(bib(p).map(u => [u.kind, shown(u)])).toEqual([
      ['reference', 'A survey of methods, revised edition. [\\newblock] University Press, [2020.]'],
      ['reference', 'A.[~]Smith and B.[~]Jones, editors. [\\newblock] Handbook of Proofs, [2019.]'],
      ['reference', 'An Wang, Bo Li, and others. [\\newblock] Graphs, [2018.]'],
      ['reference', 'Ludwig van Beethoven. [\\newblock] Symphonies, [1808.]'],
    ])
  })
})

describe('a bibliography the package holds in Latin-1, as its source declares', () => {
  const latin1 = (t: string) => Uint8Array.from(t, c => c.charCodeAt(0))
  const bbl = '\\begin{thebibliography}{1}\n\\bibitem{c}\nJ.~Dupont.\n\\newblock Un caf\u00e9 fran\u00e7ais, 1999.\n\\end{thebibliography}\n'
  const tex = doc('Coffee \\cite{c}.\n\n\\bibliographystyle{plain}\n\\bibliography{refs}', '\\usepackage[latin1]{inputenc}')
  const p = openPaper(new Map([['main.tex', enc(tex)], ['main.bbl', latin1(bbl)]]))
  it('reads the .bbl in the source\'s encoding: its entries\' words the characters the paper sets', () => {
    expect(plainSource(bib(p)[0] as never)).toContain('Un caf\u00e9 fran\u00e7ais')
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
  it('keeps an IEEEtran entry whole, its names and its quoted title one unit, and its address and DOI the original\'s', () => {
    expect(bib(p).map(u => [u.kind, shown(u)])).toEqual([
      ['reference', 'C.[~]Wang, S.[~]Zhou, L.[~]Chen, and S.[~]Shang, ``Building efficient llm pipeline for human mobility prediction,\'\' in <Proceedings of the 33rd ACM International Conference on Advances in Geographic Information Systems>, [2025,] pp. [1230--1233.]'],
      ['reference', '[\\BIBentryALTinterwordspacing] L.[~]A. Agrawal and O.[~]Khattab, ``<GEPA>: Reflective prompt evolution,\'\' [2026.] [Online]. Available: [\\url{https://arxiv.org/abs/2507.19457}], doi: [10.1145/3786335.3813167] [\\BIBentrySTDinterwordspacing]'],
    ])
    const ref = bib(p)[1]!, cls = ref.pieces.filter(x => x.t === 'ph').map(x => [x.src, classOf(x as never)])
    expect(cls).toContainEqual(['\\url{https://arxiv.org/abs/2507.19457}', 'url'])
    expect(cls).toContainEqual(['10.1145/3786335.3813167', 'number'])
    // (IEEEtran's spacing declarations set no ink and take no argument: no mark, nothing of the text after them taken)
    expect(cls).toContainEqual(['\\BIBentrySTDinterwordspacing', null])
  })
  it('keeps a DOI written out the original\'s, letters and all, after "doi: " or glued to "doi:"', () => {
    const q = open({ 'main.tex': doc('See \\cite{x,y}.\n\n\\begin{thebibliography}{2}\n\\bibitem{x}\nA.~Smith.\n\\newblock Diabetes, 2020. doi: 10.1007/s00125-020-05190-9.\n\n\\bibitem{y}\nB.~Jones.\n\\newblock Cells, 2021. doi:10.1016/j.cell.2021.01.001\n\\end{thebibliography}') })
    const kept = bib(q).flatMap(u => u.pieces.filter(x => x.t === 'ph' && classOf(x as never) === 'number').map(x => x.src))
    expect(kept).toEqual(['2020.', '10.1007/s00125-020-05190-9.', '2021.', '10.1016/j.cell.2021.01.001'])
    expect(bib(q).map(u => plainSource(u as never)).join(' ')).not.toMatch(/s00125|j\.cell/)
  })
})

describe('an entry whose web address holds a `%` (2610.21770v1: REVTeX\'s \\href reads it as a character, `%3Fref%3DPDF`)', () => {
  it('reads the address whole, and every entry after it an entry of its own: read as a comment, entry 43\'s ate the next 18', () => {
    const entry = (k: string, extra = '') => `\\bibitem [{\\citenamefont {A}(2025)}]{${k}}%\n  \\BibitemOpen\n  \\bibfield  {author} {\\bibinfo {author} {\\bibfnamefont {X.}~\\bibnamefont {Jiang}},\\ }\\bibfield  {title} {\\bibinfo {title} {Nonlinear photocurrent of ${k}},\\ }${extra}\\BibitemShut {NoStop}%\n`
    const bbl = `\\begin{thebibliography}{3}%\n\\providecommand \\href [0]{\\begingroup \\@sanitize@url \\@href}%\n${entry('a', '\\href\n  {https://doi.org/10.1021/acsnano.5c01421?urlappend=%3Fref%3DPDF&jav=VoR&rel=cite-as}\n  {\\bibfield  {journal} {\\bibinfo  {journal} {ACS Nano}\\ }}')}${entry('b')}${entry('c')}\\end{thebibliography}%\n`
    const p = open({ 'main.tex': doc('Light \\cite{a,b,c}.\n\n\\bibliography{refs}', '\\usepackage{natbib}'), 'main.bbl': bbl })
    expect(bib(p).map(u => plainSource(u as never).match(/photocurrent of (\w)/)?.[1])).toEqual(['a', 'b', 'c'])
    expect(bib(p)[0]!.pieces.some(x => x.t === 'open' && x.src?.includes('urlappend=%3Fref%3DPDF&jav=VoR&rel=cite-as}'))).toBe(true)
    // (the marked original writes the address as the paper does)
    expect(marked(p, 'main.bbl')).toContain('?urlappend=%3Fref%3DPDF&jav=VoR&rel=cite-as}')
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
  it('reads the fields\' text as it stands, the authors\' field the entry\'s own, \\BibitemOpen and \\BibitemShut no piece', () => {
    const [ref] = bib(p)
    expect([ref?.kind, bib(p).length]).toEqual(['reference', 1])
    expect(plainSource(ref as never).replace(/\s+/g, ' ')).toMatch(/M\..*Davis.*and.*R\..*H\..*Price.*Phys\. Rev\. Lett\./)
    for (const u of bib(p)) expect(shown(u)).not.toMatch(/Bibitem(?:Open|Shut)/)
    // (the volume, the page and the year: numbers kept)
    expect(ref!.pieces.filter(x => x.t === 'ph' && classOf(x as never) === 'number').map(x => x.src)).toEqual(['27', '1466', '1971'])
  })
})

describe('REVTeX\'s empty number field opening an entry (2610.20716v1)', () => {
  it('sets no start mark before the empty group: a mark there set the entry\'s text 7 pt right of the original\'s', () => {
    const bbl = '\\begin{thebibliography}{1}%\n\\bibitem [{\\citenamefont {Ishak}(2025)}]{Ishak2025}%\n  \\BibitemOpen\n\\bibfield  {number} {  }\\bibfield  {author} {\\bibinfo {author} {\\bibfnamefont {M.}~\\bibnamefont {Ishak}},\\ }\\bibinfo {title} {Persistent and serious challenge},\\ \\bibinfo {year} {2025}\\BibitemShut {NoStop}%\n\\end{thebibliography}%\n'
    const p = open({ 'main.tex': doc('Energy \\cite{Ishak2025}.\n\n\\bibliography{refs}', '\\usepackage{natbib}'), 'main.bbl': bbl })
    const tex = marked(p, 'main.bbl')
    expect(tex).toContain('\\BibitemOpen\n\\bibfield  {number} {  }')
    expect(tex).not.toMatch(/\\axtmark\{\d+s\}\\bibfield {2}\{number\}/)
  })
})

describe('an author block with affiliations and \\thanks: its names the class names, its places the body\'s, translated for every target', () => {
  const tex = doc('\\maketitle\n\nThe body of the paper says something.', '\\title{A Title}\n\\author{Ada Lovelace\\thanks{Supported by the Analytical Society.}\\\\\nUniversity of London\n\\and\nCharles Babbage\\\\\nCambridge}')
  const p = open({ 'main.tex': tex })
  const bundle = { units: bundleUnitsOf(p) }
  it('sends the author block\'s names and places, and its note, whatever the target writes names as', () => {
    const authors = units(p).flatMap((u, i) => (u.kind === 'author' || u.kind === 'affiliation' ? [i] : []))
    expect(units(p).filter(u => u.kind === 'author').map(u => plainSource(u as never).trim())).toEqual(['Ada Lovelace', 'Charles Babbage'])
    expect(units(p).filter(u => u.kind === 'affiliation').map(u => plainSource(u as never).trim())).toEqual(['University of London', 'Cambridge'])
    // (German writes names as the paper does: until TRANSLATE_VERSION 6 the block stayed in the source for it)
    for (const lang of ['de', 'fr', 'zh', 'ja']) expect(toTranslate(bundle as never, lang), lang).toEqual(expect.arrayContaining(authors))
    const note = units(p).findIndex(u => u.kind === 'footnote' && plainSource(u as never).includes('Analytical Society'))
    expect(note).toBeGreaterThanOrEqual(0)
    expect(toTranslate(bundle as never, 'de')).toContain(note)
  })
  it('shows the names translated under the names toggle alone; the places, the note and the body always', () => {
    const author = units(p).find(u => u.kind === 'author')!, note = units(p).find(u => u.kind === 'footnote')!, place = units(p).find(u => u.kind === 'affiliation')!
    expect([unitClass(author), unitClass(note), unitClass(place)]).toEqual(['names', 'body', 'body'])
    expect([unitShown(place, classesOn(null)), unitShown(place, classesOn({ names: false, references: false }))]).toEqual([true, true])
    expect(shownTranslated('names', classesOn(null))).toBe(false)
    expect(unitShown(author, classesOn({ names: true }))).toBe(true)
    expect(unitShown(author, classesOn({ references: true }))).toBe(false)
    expect(unitShown(note, classesOn(null))).toBe(true)
  })
})

describe('backref\'s lists after the entries (hyperref\'s pagebackref: 2610.37668v1\'s "2, 25" stayed where the entry was drawn translated)', () => {
  const on = open({ 'main.tex': doc(`Attention needs normalization \\cite{layernorm2016}.\n\n${PLAIN}`, '\\usepackage[pagebackref]{hyperref}') })
  it('ends each entry in the list\'s piece, after its numbers are kept: the list is TeX\'s, after the entry\'s text', () => {
    expect(bib(on).map(u => u.pieces.at(-1)?.src)).toEqual(['\\axtbackref', '\\axtbackref'])
    // (the year before it is kept as before, a number at the entry's edge)
    expect(shown(bib(on)[0] as Unit)).toBe('Jimmy[~]Lei Ba, Jamie[~]Ryan Kiros, and Geoffrey[~]E Hinton. [\\newblock] Layer normalization. [\\newblock] <[\\em] arXiv preprint arXiv:1607.06450>, [2016.][\\axtbackref]')
    // (no other unit has one, and a paper that turns no list on has none)
    expect(units(on).filter(u => u.kind !== 'reference').some(u => u.pieces.some(x => x.src === '\\axtbackref'))).toBe(false)
    const off = open({ 'main.tex': doc(`Attention needs normalization \\cite{layernorm2016}.\n\n${PLAIN}`, '\\usepackage{hyperref}') })
    expect(bib(off).some(u => u.pieces.some(x => x.src === '\\axtbackref'))).toBe(false)
  })
  it('turns them on by the package or hyperref\'s option, in any of the package\'s files, never by a command\'s name or under \\backrefparscanfalse', () => {
    const has = (files: Record<string, string>) => bib(open(files)).every(u => u.pieces.at(-1)?.src === '\\axtbackref')
    const body = doc(`See \\cite{layernorm2016}.\n\n${PLAIN}`, '\\usepackage{mystyle}')
    expect(has({ 'main.tex': body, 'mystyle.sty': '\\PassOptionsToPackage{pagebackref=true}{hyperref}\\RequirePackage{hyperref}' })).toBe(true)
    expect(has({ 'main.tex': body, 'mystyle.sty': '\\RequirePackage[hyperpageref]{backref}' })).toBe(true)
    expect(has({ 'main.tex': body, 'mystyle.sty': '\\hypersetup{backref=page}' })).toBe(true)
    // (a class's too: myarxiv.cls, weco_paper.cls; an option set false turns nothing on)
    expect(has({ 'main.tex': doc(`See \\cite{layernorm2016}.\n\n${PLAIN}`).replace('{article}', '{myclass}'), 'myclass.cls': '\\LoadClass{article}\\RequirePackage[pagebackref=true]{hyperref}' })).toBe(true)
    expect(has({ 'main.tex': body, 'mystyle.sty': '\\RequirePackage[pagebackref=false, colorlinks]{hyperref}' })).toBe(false)
    expect(has({ 'main.tex': body, 'mystyle.sty': '\\hypersetup{backref = false}' })).toBe(false)
    expect(has({ 'main.tex': body, 'mystyle.sty': '\\renewcommand*{\\backrefalt}[4]{#2}' })).toBe(false)
    expect(has({ 'main.tex': body, 'mystyle.sty': '% \\usepackage{backref}' })).toBe(false)
    expect(has({ 'main.tex': body, 'mystyle.sty': '\\usepackage{backref}\\backrefparscanfalse' })).toBe(false)
  })
  it('writes nothing of it into any file: the marked original names the list\'s marks after the entry\'s end mark instead', () => {
    const plain = new TextDecoder().decode(originalFiles(on, {}).get('main.tex'))
    expect(plain).not.toContain('axtbackref')
    expect(plain).not.toContain('axtbrname')
    const first = bib(on)[0] as Unit, text = marked(on, 'main.tex'), i = units(on).indexOf(first), k = first.pieces.length - 1
    // (after the entry's end mark and its numbers' marks, last: the list TeX sets after the entry is the next thing it sets)
    expect(text).toMatch(new RegExp(String.raw`\\axtend\{${i}e\}[^\n]*\\axtbrname\{p${i}\.${k}\}\n\n`))
    expect(text).not.toContain('\\axtbackref')
  })
})
