import { describe, expect, it } from 'vitest'
import { bundleUnitsOf } from '@/pdf-reader/engine/layer-proto/bundle.mjs'
import { toTranslate } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { CALL_TEX, LAYOUT_CLASSES } from '@/pdf-reader/engine/layout/marks.mjs'
import { openPaper, originalFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { classesOn, unitClass, unitShown } from '@/pdf-reader/engine/rules/content-classes.mjs'

// The author block's names split from its places (docs/route/orphan-text.md §5, "Names"; the owner's rulings of 2026-10-25,
// 2026-10-28 and 2026-10-30: "names" is the whole author block under the title, its names, affiliations, addresses and e-mail
// line, one toggle): the authors' names stay units of kind `author`, the affiliations, institutions and addresses become units
// of kind `affiliation`, each placed by its own marks, both the reader's "names" (off by default). Read from the TeX the
// source holds (latex-front.mjs frontBlock): which command holds the text, the rows of the tabular LaTeX sets an \author in, the
// numbered list of places, an author's note; an e-mail, a web address and an ORCID stay the original's ink. Each shape a paper
// writes, one test.

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
  it('a row that sets an affiliation\'s mark after a name, or opens with "and", is names, its places set elsewhere (2608.14893\'s and 2610.21880v1\'s second rows of names)', () => {
    const p = open('\\maketitle\nWords.', '\\author{Favio Di Ciocco$^{1,2,\\dagger}$, Sebastian Pinto$^{1}$ \\\\\nMarcelo Kuperman$^{3,4}$, Pablo Balenzuela\\textsuperscript{1,2,*}}\n\\date{}')
    expect(names(p)).toEqual(['Favio Di Ciocco, Sebastian Pinto', 'Marcelo Kuperman, Pablo Balenzuela'])
    expect(places(p)).toEqual([])
    // (a place opens with its mark: a row led by one stays a place, after any rows of names)
    const q = open('\\maketitle\nWords.', '\\author{Alice Smith$^{1}$ \\\\ Bob Jones$^{2}$ \\\\ $^{1}$University of Somewhere, $^{2}$Institute of Elsewhere}')
    expect(names(q)).toEqual(['Alice Smith', 'Bob Jones'])
    expect(places(q)).toEqual(['University of Somewhere, Institute of Elsewhere'])
    // (IEEEtran's journal form: a list of names its row broke, the next row opening with "and", 2610.21880v1)
    const r = open('\\maketitle\nWords.', '\\author{Sohani Hiam, Mohammad Soleymani, \\emph{Senior Member, IEEE}, \\\\and Rafael F. Schaefer, \\emph{Senior Member, IEEE}\n\\\\\n\\thanks{Rafael Schaefer is with TU Dresden.}}', 'IEEEtran')
    expect(places(r)).toEqual([])
    expect(names(r).join('|')).toMatch(/Rafael F\. Schaefer/)
    // (a row with no mark after the first is a place, as the classes set it: a name alone on a later row cannot be told from a
    // place by its TeX)
    expect(places(open('\\maketitle\nWords.', '\\author{Alice Smith \\\\ Department of Physics}'))).toEqual(['Department of Physics'])
  })
  it('a command of the paper\'s that ends the paragraph inside an author block ends its row (IJCAI\'s \\affiliations and \\emails, 2611.00342v1)', () => {
    // (ijcai26.sty, shipped with the paper, defines inside its \@maketitle `\def\affiliations{\egroup\vskip .05in\par\bgroup\rm}`
    // and \emails alike: no argument, the names' paragraph ended and the places' begun. Read as text inside a row, the second
    // place ran on through \emails into the e-mail rows, a unit TeX sets as two paragraphs, never located: English whatever the
    // toggle)
    const sty = `\\def\\@maketitle{{\\centering{\\LARGE\\@title\\par}{\\def\\affiliations{\\egroup\\vskip 0.05in\\par\\bgroup\\rm}%
\\def\\emails{\\egroup\\vskip 0.05in\\par\\bgroup\\rm}\\bgroup\\bf\\@author\\egroup}\\par}}`
    const main = `\\documentclass{article}\n\\usepackage{ijcaitest}\n\\title{A Title}\n\\author{\n  Ann Lee$^1$\n  \\and\n  Bo Wu$^{2}$\\thanks{Corresponding author.}\n  \\affiliations\n  $^1$Hanbat University, Korea\\\\\n  $^2$Korea Institute of Science, Korea\n  \\emails\n  \\{ann, bo\\}@example.com,\\\\\n  bo@example.org\n}\n\\begin{document}\n\\maketitle\nWords of the body.\n\\end{document}\n`
    const p = openPaper(new Map([['main.tex', enc(main)], ['ijcaitest.sty', enc(sty)]]))
    expect(names(p)).toEqual(['Ann Lee', 'Bo Wu'])
    expect(places(p)).toEqual(['Hanbat University, Korea', 'Korea Institute of Science, Korea'])
    expect(units(p).map(textOf).join('|')).not.toMatch(/example\.(com|org)/)
    // (one the paper defines otherwise too, with an argument, is no row's end: its every definition must end the paragraph)
    const other = openPaper(new Map([['main.tex', enc(main)], ['ijcaitest.sty', enc(`${sty}\n\\renewcommand{\\emails}[1]{#1}`)]]))
    expect(places(other).join('|')).not.toBe('Hanbat University, Korea|Korea Institute of Science, Korea')
  })
  it('an e-mail whose local part TeX escapes is one placeholder: `\\_` and the words it joins, never text (2608.11884, 2608.29778)', () => {
    const p = open('\\maketitle\nWords.', '\\author{Alice\\thanks{Equal contribution.} \\\\ School of X \\\\ Write to rgzhou@shmtu.edu.cn, goh\\_siong\\_thye@a-star.edu.sg or a\\_b@c.org.}')
    const all = units(p).flatMap(u => u.pieces)
    expect(all.filter(x => x.t === 'ph' && /@/.test(x.src ?? '')).map(x => x.src)).toEqual(['rgzhou@shmtu.edu.cn', 'goh\\_siong\\_thye@a-star.edu.sg', 'a\\_b@c.org'])
    expect(places(p)).toEqual(['School of X', 'Write to , or .'])
    expect(units(p).map(textOf).join('|')).not.toMatch(/goh|siong|thye/)
    // (a note that is an escaped address alone is no unit: no word of it is prose)
    const q = open('\\maketitle\nWords.', '\\author{Chao Tang\\thanks{\\href{mailto:tang\\_chao@xtu.edu.cn}{tang\\_chao@xtu.edu.cn}.}}')
    expect(units(q).map(textOf).join('|')).not.toMatch(/tang/)
    // (a `\_` in a word that is no address joins an identifier, one placeholder of its own, never sent: keepIdentifiers, lane
    // literal-fixes)
    const r = units(open('Words of snake\\_case here.'))
    expect(r.map(textOf).join('|')).not.toMatch(/snake|case/)
    expect(r.flatMap(u => u.pieces).filter(x => x.t === 'ph').map(x => x.src)).toEqual(['snake\\_case'])
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
  it('ICLR 2021\'s rows each set in a \\centerline: the rows before the one its mark opens names, that one and the rest places (2010.11929v2)', () => {
    // (each row one \\centerline, read as one placeholder: the block had no unit, its names, notes and places one orphan's ink
    // unit, always translated and set in the names' bold)
    const p = open('\\maketitle\nWords of the body.', '\\title{A Title}\n\\author{\n\\centerline{Alexey Dosovitskiy$^{*,\\dagger}$, Lucas Beyer$^{*}$,} \\vspace{1mm}\\\\\n\\centerline{\\textbf{Xiaohua Zhai$^{*}$, Thomas Unterthiner,}} \\vspace{0.5mm} \\\\\n\\centerline{$^*$equal technical contribution, $^\\dagger$equal advising}  \\vspace{0.7mm} \\\\\n\\centerline{Google Research, Brain Team}  \\vspace{0.8mm} \\\\\n\\centerline{\\texttt{\\{adosovitskiy, neilhoulsby\\}@google.com}} \\\\\n}')
    expect(names(p)).toEqual(['Alexey Dosovitskiy, Lucas Beyer,', 'Xiaohua Zhai, Thomas Unterthiner,'])
    expect(places(p)).toEqual(['equal technical contribution, equal advising', 'Google Research, Brain Team'])
    expect(units(p).map(textOf).join('|')).not.toMatch(/google\.com/)
    // (every unit cut there numbered after the others: the body's paragraph keeps its number, PIPELINE 29's walk reading each row's
    // box as one placeholder still (latex-front.mjs LINE_BOXES); a \\centerline outside an author block a line of its own,
    // PDF-READER §18.46)
    expect(units(p).map(u => u.kind)).toEqual(['heading', 'para', 'author', 'author', 'affiliation', 'affiliation'])
    const body = open('Before it.\n\n\\centerline{A centred line of words.}\n\nAfter it.')
    expect(units(body).map(textOf)).toEqual(['Before it.', 'A centred line of words.', 'After it.'])
  })
  it('a class\'s own command of LaTeX\'s \\author form whose text its \\maketitle sets in the author block\'s tabular: of the block, names where it opens the tabular (ICASSP\'s spconf.sty \\name, 2610.20967v1)', () => {
    // (spconf.sty's own definitions: \\name and \\address store their text as LaTeX's \\author does, and \\@maketitle sets both in
    // one tabular, the names its first row. \\name is no command the role table knows: its names were no unit, an ink unit of the
    // notes, translated with the author block off, its affiliations' marks set flat in the translation)
    const sty = [
      '\\def\\maketitle{\\par\\begingroup\\@maketitle\\endgroup\\@thanks}',
      '\\def\\@maketitle{\\newpage\\null\\begin{center}{\\large \\bf \\@title\\par}\\vskip 1.5em {\\large \\begin{tabular}[t]{c}\\@name \\\\ \\@address\\end{tabular}\\par}\\end{center}\\par\\vskip 1.5em}',
      '\\def\\name#1{\\gdef\\@name{{\\em #1}\\\\}}',
      '\\def\\address#1{\\gdef\\@address{#1}}',
      '\\def\\toappear#1{\\gdef\\@toappear{#1}}',
      '\\def\\ps@titlepagestyle{\\def\\@oddfoot{\\@toappear}}',
    ].join('\n')
    const paper = (pre: string) => openPaper(new Map([
      ['main.tex', enc(`\\documentclass{article}\n\\usepackage{spconf}\n\\title{A Title}\n${pre}\n\\begin{document}\n\\maketitle\nWords of the body.\n\\end{document}\n`)],
      ['spconf.sty', enc(sty)],
    ]))
    const p = paper('\\name{Song-Ze Yu$^{1}$, Fang-Duo Tsai$^{1,2}$, Yi-Hsuan Yang$^{1}$}\n\\address{$^1$National Taiwan University $^2$University of California, San Diego}\n\\toappear{To appear in a conference}')
    expect(names(p)).toEqual(['Song-Ze Yu, Fang-Duo Tsai, Yi-Hsuan Yang'])
    expect(places(p)).toEqual(['National Taiwan University University of California, San Diego'])
    // (a unit no engine before cut: numbered after every other, so that no other unit's number moves)
    expect(units(p).map(u => u.kind)).toEqual(['heading', 'affiliation', 'para', 'author'])
    // (its affiliations' marks are the unit's elements, set where TeX set them, raised, never its text)
    const name = units(p).find(u => u.kind === 'author')!
    expect(name.pieces.filter(x => x.t === 'ph').map(x => x.src)).toEqual(['$^{1}$', '$^{1,2}$', '$^{1}$'])
    // (marked where the class sets the stored text, as an \\author's are)
    const tex = new TextDecoder().decode(originalFiles(p, { layout: LAYOUT_CLASSES }).get('main.tex'))
    expect(tex).toMatch(/\\name\{\\leavevmode\\axtmark\{\d+s\}Song-Ze Yu/)
    // (a stored text the class sets elsewhere, \\toappear's in the foot, is none of the block)
    expect(units(p).map(textOf).join('|')).not.toMatch(/To appear/)
    // (a command of the paper's own named the same that stores nothing, a model's name, is no author block)
    const model = open('\\maketitle\nThe \\name{} model.', '\\newcommand{\\name}{MIDI-REPA}\n\\author{Alice Smith}')
    expect(names(model)).toEqual(['Alice Smith'])
    expect(places(model)).toEqual([])
  })
  it('a class\'s own command whose text a list keeps and its title sets in the author block\'s group: of the block, after its places (Meta FAIR\'s \\contribution, 2604.14228v3)', () => {
    // (the class (adapted from Meta FAIR's preprints) keeps each command's text in a list by one helper, \\addtolist, and its
    // title command sets the names', the places' and the contributions' lists as the paragraphs of one group, the metadata's
    // (\\correspondence, \\date) in another after the abstract. Neither \\contribution nor \\correspondence is a command the role
    // table knows: no unit's, their glyphs on the title box's fill were figure texts, translated with the author block off,
    // each run laid at its own anchor)
    const cls = [
      '\\LoadClass{article}',
      '\\renewcommand\\addtolist[5][]{\\begingroup\\if\\relax#3\\relax\\def\\sep{}\\else\\def\\sep{#5}\\fi\\let\\protect\\@unexpandable@protect\\xdef#3{\\expandafter{#3}\\sep #4[#1]{#2}}\\endgroup}',
      '\\newcommand\\authorlist{}',
      '\\newcommand\\authorformat[2][]{{\\sffamily #2$^{#1}$}}',
      '\\renewcommand\\author[2][]{\\addtolist[#1]{#2}{\\authorlist}{\\authorformat}{, }}',
      '\\newcommand\\affiliationlist{}',
      '\\newcommand\\affiliationformat[2][]{{\\normalsize $^{#1}$#2}}',
      '\\newcommand\\affiliation[2][]{\\addtolist[#1]{#2}{\\affiliationlist}{\\affiliationformat}{, }}',
      '\\newcommand\\contributionlist{}',
      '\\newcommand\\contributionformat[2][]{{\\small $^{#1}$#2}}',
      '\\newcommand\\contribution[2][]{\\addtolist[#1]{#2}{\\contributionlist}{\\contributionformat}{, }}',
      '\\newcommand\\metadatalist{}',
      '\\newcommand\\metadataformat[2][]{{\\small {\\sffamily \\bfseries #1:} #2}}',
      '\\newcommand\\metadata[2][]{\\addtolist[#1]{#2}{\\metadatalist}{\\metadataformat}{\\par}}',
      '\\newcommand\\correspondence[1]{\\metadata[Correspondence]{#1}}',
      '\\renewcommand{\\title}[1]{\\newcommand{\\titlelist}{{\\huge\\sffamily #1}}}',
      '\\newcommand{\\mymaketitle}{\\begin{tcolorbox}{\\raggedright{\\titlelist\\par}\\vskip 0.2cm \\authorlist\\par\\vskip 0.2cm \\affiliationlist\\par \\contributionlist\\par}\\abstractlist\\par{\\metadatalist\\par}\\end{tcolorbox}}',
      '\\renewcommand{\\maketitle}{\\mymaketitle}',
    ].join('\n')
    const p = openPaper(new Map([
      ['main.tex', enc('\\documentclass{style}\n\\title{A Title}\n\\author[1,*]{{Jiacheng Liu}}\n\\author[1,\\dagger]{{Zhiqiang Shen}}\n\\affiliation[1]{VILA Lab, Some University}\n\\contribution[*]{These authors contributed equally to this work}\n\\contribution[\\dagger]{Corresponding author}\n\\correspondence{Zhiqiang Shen (\\email{z@some.edu})}\n\\begin{document}\n\\maketitle\nWords of the body.\n\\end{document}\n')],
      ['style.cls', enc(cls)],
    ]))
    expect(names(p)).toEqual(['Jiacheng Liu', 'Zhiqiang Shen'])
    // (its notes the paragraph after its places in their group: the block's places)
    expect(places(p)).toEqual(['VILA Lab, Some University', 'These authors contributed equally to this work', 'Corresponding author'])
    // (the metadata's list the title sets in a group of its own after the abstract, with the date's: none of the block's by TeX's
    // grouping; the rule that took everything the title sets made a venue's line, a licence and a teaser's caption places)
    expect(units(p).map(textOf).join('|')).not.toMatch(/Zhiqiang Shen \(/)
    // (a stored text the title sets that the role table knows keeps its kind: the title a heading; the date none of the block)
    expect(units(p)[0]).toMatchObject({ kind: 'heading' })
  })
  it('an e-mail, a web address and an ORCID written out stay the original\'s ink: placeholders of the place they stand in', () => {
    const p = open('\\maketitle\nWords.', '\\author{Alice Smith \\\\ University of Somewhere, alice@some.edu, ORCID 0000-0002-1825-0097, see https://some.edu/alice}')
    expect(places(p)).toEqual(['University of Somewhere, , ORCID , see'])
    const srcs = units(p).filter(u => u.kind === 'affiliation').flatMap(u => u.pieces.filter(x => x.t === 'ph').map(x => x.src))
    expect(srcs).toEqual(['alice@some.edu', '0000-0002-1825-0097', 'https://some.edu/alice'])
  })
})

describe('whatever TeX sets an author block in, its units are the block\'s: never a table\'s cells, an abstract or a theorem', () => {
  // (the owner's ruling of 2026-10-30: one toggle for the whole block. 2610.35877v1 sets its \author in a tabular of its own, and
  // its names were cells, of the tables' toggle, shown translated with the author block's off; 2608.06007v1's places row and
  // 2610.22214v1's whole block too, the only three of the 190 sources on disk)
  it('a tabular in \\author: each cell a unit of the row\'s kind, cut at & and \\\\ as cells are, at the number it had (2610.35877v1)', () => {
    const p = open('\\maketitle\nThe body.', '\\title{A Title}\n\\author{%\n\\begin{tabular}{c@{\\hspace{16mm}}c}\n\\normalsize Ayush Mittal & \\normalsize Dhruv Gupta\\\\[1.2mm]\n\\small\\href{mailto:a@x.world}{\\texttt{a@x.world}} & \\small\\href{mailto:d@y.in}{\\texttt{d@y.in}}\n\\end{tabular}%\n}')
    expect(units(p).map(u => [u.kind, textOf(u)])).toEqual([['heading', 'A Title'], ['author', 'Ayush Mittal'], ['author', 'Dhruv Gupta'], ['para', 'The body.']])
    expect(units(p).some(u => (u as { cell?: unknown }).cell)).toBe(false)
    expect(['author', 'affiliation'].map(k => unitClass(k))).toEqual(['names', 'names'])
    // (marked as the block's units, inside their cells: the alignment's & and \\\\ outside every unit)
    const tex = new TextDecoder().decode(originalFiles(p, { layout: LAYOUT_CLASSES }).get('main.tex'))
    expect(tex).toMatch(/\\leavevmode\\axtmark\{1s\}[^&]*Ayush Mittal\\axtend\{1e\} &/)
    expect(tex).toMatch(/\\leavevmode\\axtmark\{2s\}[^&]*Dhruv Gupta\\axtend\{2e\}\\\\/)
  })
  it('a row of places set in a tabular, a block in a center or a minipage: the row\'s kind; a table outside the block its cells (2608.06007v1)', () => {
    const p = open('\\maketitle\nThe body.\n\n\\begin{tabular}{cc} Model & Ours \\end{tabular}', '\\author{\\large {Yuhan Zhou, Hao Nie}\n\\\\\n\\large\n\\begin{tabular}{cc}\nPeking University & Stepfun\n\\end{tabular}\n}')
    expect(names(p)).toEqual(['Yuhan Zhou, Hao Nie'])
    expect(places(p)).toEqual(['Peking University', 'Stepfun'])
    expect(of(p, 'cell')).toEqual(['Model', 'Ours'])
    // (a name-only text of a block is no table's kept name: sent, and shown with the block)
    expect(units(p).filter(u => u.kind === 'affiliation').some(u => p.kept.has(u as never))).toBe(false)
    const q = open('\\maketitle\nWords.', '\\author{\\begin{center}\\begin{minipage}{0.4\\textwidth}\\begin{theorem}Jane Doe\\end{theorem}\\end{minipage}\\end{center} \\\\ Some University}', '\\newtheorem{theorem}{Theorem}')
    expect(units(q).map(u => [u.kind, textOf(u)]).filter(([k]) => k !== 'para')).toEqual([['author', 'Jane Doe'], ['affiliation', 'Some University']])
  })
})

describe('an author block\'s rows inside a conditional (Codex on #485: no corpus instance)', () => {
  it('cuts no row inside an \\if…\\fi: the conditional stays in the one unit, its \\if and \\fi together', () => {
    const p = open('\\maketitle\nWords of the body.', '\\newif\\ifanon\n\\author{\\ifanon Anonymous Author \\\\ Anonymous Institution \\else Jane Roe \\\\ Real University \\fi}')
    for (const u of units(p).filter(u => u.kind === 'author' || u.kind === 'affiliation')) {
      const src = u.pieces.map(x => x.src ?? x.s ?? '').join('')
      expect((src.match(/\\ifanon(?![A-Za-z])/g) ?? []).length, src).toBe((src.match(/\\fi(?![A-Za-z])/g) ?? []).length)
    }
    // (outside a conditional, as before: names, then places)
    expect(places(open('\\maketitle\nWords.', '\\author{Jane Roe \\\\ Real University}'))).toEqual(['Real University'])
  })
})

describe('the places\' units: their number, their class, their marks', () => {
  const BIB = '\\begin{thebibliography}{9}\n\\bibitem{a} A.~Author.\n\\newblock A title of a paper.\n\\newblock 2020.\n\\end{thebibliography}'
  const p = open(`\\maketitle\nThe first paragraph.\n\nThe second paragraph.\n\n${BIB}`, '\\title{A Title}\n\\author{Alice Smith \\\\ University of Somewhere}')
  it('the names keep the number the whole block had; the places cut from it are numbered after every other unit, before the entries', () => {
    expect(units(p).map(u => u.kind)).toEqual(['heading', 'author', 'para', 'para', 'affiliation', 'reference'])
  })
  it('keeps every unit\'s number: what was one unit (the text between two notes) the first unit cut from it, of either kind', () => {
    // (before: the names "Alice", the note, then one unit of "Brain", "Bob" and "Univ"; the body's paragraph the fourth unit)
    const q = open('\\maketitle\nThe body.', '\\author{Alice\\thanks{Equal.} \\\\ Brain Lab \\And Bob Jones \\\\ Some University}')
    expect(units(q).map(u => [u.kind, textOf(u)])).toEqual([['author', 'Alice'], ['footnote', 'Equal.'], ['affiliation', 'Brain Lab'], ['para', 'The body.'], ['author', 'Bob Jones'], ['affiliation', 'Some University']])
    // (IEEEtran's blocks were each a unit of their own: each keeps its number, none after the others: 2608.18887, 2608.28941)
    const ieee = open('\\maketitle\nThe body.', '\\author{\\IEEEauthorblockN{Daniel W}\n\\IEEEauthorblockA{Dept. of Computer Science \\\\ Some University}\n\\and\n\\IEEEauthorblockN{Brian E}\n\\IEEEauthorblockA{Dept. of Neurology \\\\ A Hospital}}', 'IEEEtran')
    expect(units(ieee).map(u => u.kind)).toEqual(['author', 'affiliation', 'author', 'affiliation', 'para'])
  })
  it('a place and a name are both the names\', the whole block shown with that toggle and hidden without it', () => {
    expect(['author', 'affiliation'].map(k => unitClass(k))).toEqual(['names', 'names'])
    const block = units(p).filter(u => u.kind === 'author' || u.kind === 'affiliation')
    // (the defaults, names off: the whole block the original's, its institution too)
    expect(block.map(u => unitShown(u, classesOn(null)))).toEqual([false, false])
    expect(block.map(u => unitShown(u, classesOn({ names: false })))).toEqual([false, false])
    // (names on: the whole block translated; another toggle shows none of it)
    expect(block.map(u => unitShown(u, classesOn({ names: true })))).toEqual([true, true])
    expect(block.map(u => unitShown(u, classesOn({ references: true, tables: true, heads: true, figures: true })))).toEqual([false, false])
    // (both sent, once, whatever the toggles)
    const bundle = { units: bundleUnitsOf(p) }
    expect(toTranslate(bundle, 'zh')).toEqual(expect.arrayContaining([1, 4]))
  })
  it('marks every row of one block, equal ones too, where a class sets each; two equal commands (revtex compares them) none', () => {
    // (article sets each row of its \\author where it stands: three "Google Brain" rows, each its own marks, 1706.03762v7's; a row
    // that opens with a letter command in a group, `{\\L}ukasz`, its start mark before the group)
    const q = open('\\maketitle\nWords.', '\\author{Ashish Vaswani \\\\ Google Brain \\And Noam Shazeer \\\\ Google Brain \\And {\\L}ukasz Kaiser \\\\ Google Brain}')
    const tex = new TextDecoder().decode(originalFiles(q, { layout: LAYOUT_CLASSES }).get('main.tex'))
    const ids = units(q).flatMap((u, i) => (u.kind === 'author' || u.kind === 'affiliation' ? [i] : []))
    expect(ids).toHaveLength(6)
    for (const i of ids) expect(tex, `unit ${i}`).toContain(`\\axtmark{${i}s}`)
    expect(tex).toMatch(/\\leavevmode\\axtmark\{\d+s\}\{\\L\}ukasz Kaiser\\axtend/)
    const rev = open('\\maketitle\nWords.', '\\author{Alice Smith}\n\\affiliation{Department of Physics, University of Somewhere}\n\\author{Bob Jones}\n\\affiliation{Department of Physics, University of Somewhere}', 'revtex4-2')
    const revTex = new TextDecoder().decode(originalFiles(rev, { layout: LAYOUT_CLASSES }).get('main.tex'))
    const places = units(rev).flatMap((u, i) => (u.kind === 'affiliation' ? [i] : []))
    expect(places).toHaveLength(2)
    for (const i of places) expect(revTex).not.toContain(`\\axtmark{${i}s}`)
    // (equal as TeX reads them, its tokens: a line's break, a run of spaces and a comment are none of the comparison)
    const ws = open('\\maketitle\nWords.', '\\author{Alice Smith}\n\\affiliation{Department of Physics,\n  University of Somewhere}\n\\author{Bob Jones}\n\\affiliation{Department of Physics, University of Somewhere% the same\n}', 'revtex4-2')
    const wsTex = new TextDecoder().decode(originalFiles(ws, { layout: LAYOUT_CLASSES }).get('main.tex'))
    const wsPlaces = units(ws).flatMap((u, i) => (u.kind === 'affiliation' ? [i] : []))
    expect(wsPlaces).toHaveLength(2)
    for (const i of wsPlaces) expect(wsTex).not.toContain(`\\axtmark{${i}s}`)
  })
  it('keeps what it cuts by beside the units, never in them: a unit that nests a note in a row hashes as its pieces alone (2610.21377v1)', () => {
    const q = open('\\maketitle\nWords.', '\\author{\\texorpdfstring{Christian Clason\\thanks{Supported by a grant.}}{Christian Clason} \\\\ University of Duisburg-Essen \\and Jyrki Jauhiainen}')
    for (const u of units(q)) expect(Object.keys(u).filter(k => k === 'block')).toEqual([])
    const parent = units(q).find(u => u.pieces.some(p => p.t === 'nested'))!
    expect(JSON.stringify(parent.pieces)).not.toMatch(/"block"|"later"|"once"/)
  })
  it('marked as the author block\'s names are, in the layout compile: its own start and end marks', () => {
    const tex = new TextDecoder().decode(originalFiles(p, { layout: LAYOUT_CLASSES }).get('main.tex'))
    expect(tex).toMatch(/\\author\{\\leavevmode\\axtmark\{1s\}Alice Smith\\axtend\{1e\} \\\\ \\leavevmode\\axtmark\{4s\}University of Somewhere\\axtend\{4e\}\}/)
  })
})

describe('the author calls the marked original states (\\axtcall, CALL_TEX: the point `<i>c` before an author\'s call)', () => {
  // (what TeX sets between an author's end mark and the next author's call is the author's, what after it the next author's: no
  // gap tells them apart, ICML's marks after a name a thin space after it, 2611.03953v2; a \thanks mark before an \and)
  const marked = (p: ReturnType<typeof open>) => new TextDecoder().decode(originalFiles(p, { layout: LAYOUT_CLASSES }).get('main.tex'))
  const idOf = (p: ReturnType<typeof open>, name: string) => units(p).findIndex(u => u.kind === 'author' && textOf(u) === name)
  it('before each \\and that opens an author\'s block inside one, its first unit\'s', () => {
    const p = open('\\maketitle\nWords.', '\\author{Ashish Vaswani\\thanks{Equal contribution.} \\\\ Google Brain \\And Noam Shazeer \\\\ Google Research}')
    const tex = marked(p)
    expect(tex).toContain(`\\axtcall{${idOf(p, 'Noam Shazeer')}}\\And `)
    // (and the note's call after the first name, before the place on the next row: two calls stated)
    expect(tex.match(/\\axtcall\{\d+\}/g)).toHaveLength(2)
    expect(tex).toContain(CALL_TEX)
  })
  it('before an author block\'s command right after another\'s, never before the first (ICML\'s \\icmlauthor)', () => {
    const p = open('\\twocolumn[\\icmltitle{A Title}\n\\begin{icmlauthorlist}\n\\icmlauthor{Jane Doe}{x}\n% a comment\n\\icmlauthor{John Roe}{y}\n\\end{icmlauthorlist}\n]\nWords.', '\\usepackage{icml2025}')
    const tex = marked(p)
    expect(tex).toContain(`\\axtcall{${idOf(p, 'John Roe')}}\\icmlauthor{`)
    expect(tex.match(/\\axtcall\{\d+\}/g)).toHaveLength(1)
  })
  it('after a note\'s call inside an author block, before the unit after it: the mark the note set is the text before\'s', () => {
    // (2411.13093v4, NeurIPS: one \\author in the preamble, its names apart by \\quad, Xiawu Zheng's \\thanks between two names
    // of a row: its "∗" was the next unit's label, which kept the row from being laid as one line)
    const p = open('\\maketitle\nWords.', '\\author{Yongdong Luo$^{1}$ \\quad Xiawu Zheng$^{1}$\\thanks{Corresponding author.} \\quad Guilin Li$^{1}$ \\quad Haojia Lin$^{1}$ \\\\ Chaoyou Fu$^{2}$}')
    const id = units(p).findIndex(u => u.kind === 'author' && textOf(u).startsWith('Guilin Li'))
    const tex = marked(p)
    // (the note's own text between its marks in the layout compile)
    expect(tex).toMatch(new RegExp(`Corresponding author\\.\\\\axtend\\{\\d+e\\}\\}\\\\axtcall\\{${id}\\}`))
    expect(tex.match(/\\axtcall\{\d+\}/g)).toHaveLength(1)
    // (the unit after the note begun right where the note's call ends, `\\thanks{…}\\,$^{1,2}$`: the call written there all the
    // same, before the unit's bytes; 2610.17108v1's had none, its "∗" the next unit's label)
    const glued = open('\\maketitle\nWords.', '\\author{\\textbf{Sam Smith}\\,$^{1}$\\quad Vic Vance\\thanks{Corresponding.}\\,\\,$^{1,2}$\\quad \\textbf{Ann Eve}\\,$^{1}$}')
    const gid = units(glued).findIndex((u, k) => u.kind === 'author' && k > 0 && textOf(u).includes('Ann Eve'))
    expect(marked(glued)).toMatch(new RegExp(`Corresponding\\.\\\\axtend\\{\\d+e\\}\\}\\\\axtcall\\{${gid}\\}`))
    // (a note that opens its block marks no text before it: its mark, set before the name, is the name's lead, none stated; a
    // note before an \\and: the \\and's call alone)
    expect(marked(open('\\maketitle\nWords.', '\\author{\\thanks{Equal contribution.}Jane Doe \\\\ The University}'))).not.toContain('\\axtcall{')
    const and = marked(open('\\maketitle\nWords.', '\\author{Jane Doe\\thanks{Equal contribution.} \\and John Roe}'))
    expect(and.match(/\\axtcall\{\d+\}/g)).toHaveLength(1)
    expect(and).toMatch(/\\axtcall\{\d+\}\\and /)
  })
  it('none for one author\'s block, and no definition in the head: the paper\'s bytes as before', () => {
    const p = open('\\maketitle\nWords.', '\\author{Jane Doe \\\\ The University}')
    const tex = marked(p)
    expect(tex).not.toContain('\\axtcall')
  })
})
