import { describe, expect, it } from 'vitest'
import { documentBounds, inMemory, inputencOf, loadProject, markUnits, patch } from '@/pdf-reader/engine/latex-front.mjs'
import { openPaper, probeFiles, translationFiles } from '@/pdf-reader/engine/live.mjs'
import { strategiesFor } from '@/pdf-reader/engine/scripts.mjs'

// The front end's round of 2026-10-06: every piece of typeset body text a unit, no TeX argument drawn as text (the
// missing-units research: ResNet's appendix C, 37 of 117 papers missing some text)

type Piece = { t: string; s?: string; src?: string; id?: number }
type Unit = { kind: string; file: string; start: number; end: number; title?: boolean; front?: boolean; stored?: boolean; pieces: Piece[] }
const enc = (s: string) => new TextEncoder().encode(s)
const projectOf = (files: Record<string, string>) => loadProject(inMemory(new Map(Object.entries(files).map(([k, v]) => [k, enc(v)]))), 'main.tex', { tables: true })
const project = (tex: string, more: Record<string, string> = {}) => projectOf({ 'main.tex': tex, ...more })
const textOf = (u: Unit) => u.pieces.filter(p => p.t === 'text').map(p => p.s).join('').replace(/\s+/g, ' ').trim()
const units = (p: ReturnType<typeof project>) => p.units as unknown as Unit[]
const texts = (p: ReturnType<typeof project>) => units(p).map(textOf)
const doc = (body: string, pre = '') => `\\documentclass{article}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`
/** every unit's words replaced by a mark of its own, the files as they are then typeset */
const patched = (p: ReturnType<typeof project>, file = 'main.tex') => {
  const translated = new Map(units(p).map((u, i) => [u, u.pieces.map(x => (x.t === 'text' ? { ...x, tr: true, s: `<T${i}>` } : x))]))
  return new TextDecoder().decode(patch(p, translated as never, { mark: markUnits(p.units, translated as never) }).get(file))
}

describe('the document as TeX finds it (documentBounds): a match of the raw text ended walks early or never began them', () => {
  it('a commented \\end{document} in the body is no end: the walk goes on to the real one (ResNet\'s appendix C, 1512.03385)', () => {
    const p = project(doc('A first section of words.\n\n%\\end{document}\n\\section{ImageNet Localization}\nThe localization task requires more words.'))
    expect(texts(p)).toEqual(['A first section of words.', 'ImageNet Localization', 'The localization task requires more words.'])
  })
  it('nor one in a comment\'s prose (2608.11084: "DELETE ALL CONTENT UNTIL \\end{document}", four lines into the body)', () => {
    expect(texts(project(doc('Title words here.\n\n%>>>>> DELETE ALL CONTENT UNTIL "\\end{document}"\nThe body of the paper.')))).toEqual(['Title words here.', 'The body of the paper.'])
  })
  it('nor one in a definition in the preamble, nor an \\iffalse in a definition\'s body (2608.23517: no unit at all)', () => {
    const p = project(doc('Energy of a toroidal brane.\n\nThe body goes on.', '\\def \\edo {\\newpage\n\\bibliography{bib}\n\\end{document}}\n\\def \\iffa {\\iffalse}\n\\def \\ed {\n\\end{document}\n}'))
    expect(texts(p)).toEqual(['Energy of a toroidal brane.', 'The body goes on.'])
    const tex = doc('Words.', '\\def\\edo{\\end{document}}')
    const b = documentBounds(tex)
    expect(tex.slice(b.begin, b.body)).toBe('\\begin{document}')
    expect(tex.slice(b.end, b.end + 14)).toBe('\\end{document}')
  })
  it('a \\begin{document} in a comment or in a filecontents the preamble writes out is not the document\'s', () => {
    const tex = '\\begin{filecontents}{x.tex}\n\\documentclass{article}\\begin{document}Inner\\end{document}\n\\end{filecontents}\n\\documentclass{article}\n% before \\begin{document} we set\n\\begin{document}\nOuter words.\n\\end{document}\n'
    expect(texts(project(tex))).toEqual(['Outer words.'])
    const b = documentBounds(tex)
    expect(tex.slice(b.begin - 20, b.begin)).toContain('we set')
  })
  it('the walk stops at the \\end{document} it reaches, in a file \\input too: TeX stops there', () => {
    const p = project(doc('Before the input.\n\n\\input{part}\n\nNever typeset after it.'), { 'part.tex': 'Inside the part.\n\\end{document}\nAfter its end.\n' })
    expect(texts(p)).toEqual(['Before the input.', 'Inside the part.'])
  })
  it('…but not one TeX never reaches: after an \\endinput, whose line TeX still reads, or in a branch it skips (review I4: the rest was lost)', () => {
    expect(texts(project(doc('Alpha.\n\n\\input{sec}\n\nBeta.'), { 'sec.tex': 'Section words.\n\\endinput Last words.\nOld draft.\n\\end{document}\n' }))).toEqual(['Alpha.', 'Section words. Last words.', 'Beta.'])
    expect(texts(project(doc('Alpha.\n\n\\input{sec}\n\nBeta.', '\\newif\\iflong\n\\longtrue'), { 'sec.tex': 'Section words.\n\\iflong\\else\\end{document}\\fi\nMore words.\n' }))).toEqual(['Alpha.', 'Section words.', 'More words.', 'Beta.'])
    // a conditional TeX's branch of which the reader cannot tell: no stop
    expect(texts(project(doc('Alpha.\n\n\\input{sec}\n\nBeta.'), { 'sec.tex': 'Section words.\n\\ifdefined\\short\\end{document}\\fi\nMore words.\n' }))).toEqual(['Alpha.', 'Section words.', 'More words.', 'Beta.'])
  })
  it('the main file\'s \\end{document} TeX acts on: not one in a \\newif\'s false branch or \\iftrue\'s \\else (review M1)', () => {
    expect(texts(project(doc('Alpha.\n\\ifshort\\end{document}\\fi\nBeta.', '\\newif\\ifshort\\shortfalse')))).toEqual(['Alpha.', 'Beta.'])
    expect(texts(project(doc('Alpha.\n\\iftrue\\else\\end{document}\\fi\nBeta.')))).toEqual(['Alpha.', 'Beta.'])
    // a \newif set two ways is not one TeX's branch of which the reader can tell: no stop there either
    expect(texts(project(doc('Alpha.\n\\ifshort\\end{document}\\fi\nBeta.', '\\newif\\ifshort\\shorttrue\n\\shortfalse')))).toEqual(['Alpha.', 'Beta.'])
  })
  it('the title TeX keeps: the last \\title it acts on, never a commented one (2608.23818, 2608.16745)', () => {
    const p = project(doc('\\maketitle\nWords.', '% \\title{An old title}\n% Note: both \\title{} and \\workshoptitle{}\n\\title{A first title}\n\\title{The real title}'))
    expect(units(p).filter(u => u.title).map(textOf)).toEqual(['The real title'])
  })
  it('inputenc as TeX reads it: a commented \\usepackage[latin1]{inputenc} declares nothing, the one TeX acts on is the one rewritten', () => {
    expect(project(doc('Words.', '% \\usepackage[latin1]{inputenc}\n\\usepackage[utf8]{inputenc}')).inputenc).toBeNull()
    expect(project(doc('Words.', '% \\usepackage[utf8]{inputenc}\n\\usepackage[latin1]{inputenc}')).inputenc).toBe('latin1')
    const tex = doc('Words.', '% \\usepackage[latin1]{inputenc}\n\\usepackage[latin1]{inputenc}')
    expect(tex.slice(inputencOf(tex)?.start, inputencOf(tex)?.end)).toBe('\\usepackage[latin1]{inputenc}')
    expect(tex.lastIndexOf('\\usepackage')).toBe(inputencOf(tex)?.start)
    // two TeX acts on: the first is loaded, the second with other options an option clash, not a switch (review M2)
    const two = doc('Words.', '\\usepackage[latin1]{inputenc}\n\\usepackage[utf8]{inputenc}')
    expect(inputencOf(two)?.options).toBe('latin1')
    expect(inputencOf(two)?.start).toBe(two.indexOf('\\usepackage'))
  })
  it('a \\begin{document} or \\end{document} inside a definition\'s body is no bound, whatever stands before it (review I5)', () => {
    // a definition's body in the preamble, then the real begin
    const pre = doc('Body words.', '\\newcommand{\\startdoc}{\\begin{document}}')
    expect(documentBounds(pre).begin).toBe(pre.lastIndexOf('\\begin{document}'))
    // a body \\newcommand that holds an end, before the real one
    const body = doc('Words.\n\\newcommand{\\enddoc}{\\end{document}}\nMore words.')
    expect(documentBounds(body).end).toBe(body.lastIndexOf('\\end{document}'))
    expect(texts(project(body))).toEqual(['Words. More words.'])
    // an end in a preamble definition is before the document: never its end, though no end in the body is outside a group
    const grouped = '\\documentclass{article}\n\\def\\edo{\\end{document}}\n\\begin{document}\nWords.\n{\\end{document}}\n'
    const g = documentBounds(grouped)
    expect(g.end).toBeGreaterThan(g.begin)
    expect(grouped.slice(g.end)).toBe('\\end{document}}\n')
  })
  it('what TeX does not run as it stands: \\iffalse in a \\def with a \\fi after it, a \\def\\x#1\\end{document}\'s parameter text (\\end its delimiter, {document} its body), \\verb (review I5)', () => {
    const iffa = doc('Body words.\n\n\\iffa hidden \\fi\n\nMore words.', '\\def\\iffa{\\iffalse}')
    expect(documentBounds(iffa).begin).toBe(iffa.indexOf('\\begin{document}'))
    expect(texts(project(iffa))).toEqual(['Body words.', 'hidden', 'More words.'])
    expect(texts(project(doc('Words.\n\\def\\stop#1\\end{document}\nMore words.')))).toEqual(['Words. More words.'])
    expect(texts(project(doc('Use \\verb|\\end{document}| to end.\n\nMore words.')))).toEqual(['Use to end.', 'More words.'])
  })
  it('a front matter command in the middle of a paragraph keeps its call in the translation (re-review N1: \\note{…} was deleted)', () => {
    const fonts = { rm: 'cmr', sf: 'cmss', tt: 'cmtt', body: 'cmr' }
    const written = (pre: string, body: string) => {
      const paper = openPaper(new Map([['main.tex', enc(doc(body, pre))]]))
      const tr = new Map((paper.units as unknown as Unit[]).map((u, i) => [u, u.pieces.map(x => (x.t === 'text' && /\S/.test(x.s ?? '') ? { ...x, tr: true, s: `<T${i}>` } : x))]))
      const tex = new TextDecoder().decode(translationFiles(paper, tr as never, { strategy: strategiesFor(paper.meta, 'zh')[0] as never, fonts }).get('main.tex'))
      return tex.slice(tex.indexOf('\\begin{document}', tex.indexOf('emergencystretch')))
    }
    // the paper's own macro, its argument handed to a command the table does not know
    const own = written('\\usepackage{todonotes}\n\\newcommand{\\note}[1]{\\todo{#1}}', 'Some body words here.\\note{fix this wording please} More words here to finish.')
    expect(own).toMatch(/\\note\{<T\d>\}/)
    expect(own.match(/<T\d>/g)?.length).toBe(3)
    // a command no file defines, and a paper's macro of no argument with a group after it
    expect(written('', 'Some body words here.\\note{fix this wording please} More words here to finish.')).toMatch(/\\note\{<T\d>\}/)
    expect(written('\\newcommand{\\note}{\\textsuperscript{*}}', 'Some body words here.\\note{} More words here to finish.')).toContain('\\note{}')
    // …and one that opens a paragraph is read as before
    expect(written('\\newcommand{\\note}[1]{\\todo{#1}}', '\\note{A note at the paragraph start.}\n\nBody words.')).toMatch(/\\note\{<T0>\}\n\n[^]*<T1>/)
  })
  it('what goes before the document goes before the real \\begin{document}, not a commented one in the preamble (live.mjs)', () => {
    const paper = openPaper(new Map([['main.tex', enc('\\documentclass{article}\n% a comment: \\begin{document}\n\\begin{document}\nA paragraph of words.\n\\end{document}\n')]]))
    const probe = new TextDecoder().decode(probeFiles(paper).get('main.tex'))
    expect(probe).toContain('% a comment: \\begin{document}\n')
    expect(probe.indexOf('AXT-FONTS')).toBeGreaterThan(probe.indexOf('% a comment'))
    const fonts = { rm: 'cmr', sf: 'cmss', tt: 'cmtt', body: 'cmr' }
    const tex = new TextDecoder().decode(translationFiles(paper, new Map(), { strategy: strategiesFor(paper.meta, 'zh')[0] as never, fonts }).get('main.tex'))
    expect(tex.indexOf('\\begin{document}', tex.indexOf('% a comment: \\begin{document}') + 20)).toBeGreaterThan(tex.indexOf('emergencystretch'))
  })
})

describe('the preamble\'s front matter (frontMatter): what a class keeps for \\maketitle is a unit', () => {
  it('an abstract written as an environment or as \\abstract{…} before \\begin{document} (2608.08903, 2608.01482)', () => {
    expect(units(project(doc('\\maketitle\nBody.', '\\begin{abstract}\nLaser wakefield acceleration promises compact accelerators.\n\\end{abstract}'))).map(u => [u.kind, textOf(u)])[0]).toEqual(['abstract', 'Laser wakefield acceleration promises compact accelerators.'])
    expect(units(project(doc('Body.', '\\abstract{We present an extension of the dataset.}'))).map(u => [u.kind, textOf(u)])[0]).toEqual(['abstract', 'We present an extension of the dataset.'])
  })
  it('AAAI\'s \\affiliations, \\keywords and a \\thanks of its own: names and places, keywords, a front note', () => {
    const p = project(doc('Body.', '\\title{A Title}\n\\author{Alice Example}\n\\affiliations{School of Information Engineering\\\\ Shanghai Maritime University}\n\\keywords{canonical module, nearly Gorenstein ring}\n\\thanks{Financed by the Dutch Research Council.}'))
    expect(units(p).map(u => [u.kind, textOf(u), !!u.front])).toEqual([
      ['heading', 'A Title', false], ['author', 'Alice Example', false], ['author', 'School of Information Engineering Shanghai Maritime University', false],
      ['heading', 'canonical module, nearly Gorenstein ring', false], ['footnote', 'Financed by the Dutch Research Council.', true], ['para', 'Body.', false]])
  })
  it('the same in a file the preamble \\inputs (2608.13505\'s abstract, 2608.03994\'s title): units of that file, which is written back', () => {
    const p = project(doc('\\maketitle\nBody words.', '\\input{front}'), { 'front.tex': '\\usepackage{amsmath}\n\\title{When Attention Goes Blind}\n\\begin{abstract}\nScientific discovery requires more.\n\\end{abstract}\n' })
    expect(units(p).filter(u => u.file === 'front.tex').map(u => [u.kind, textOf(u)])).toEqual([['heading', 'When Attention Goes Blind'], ['abstract', 'Scientific discovery requires more.']])
    expect(patched(p, 'front.tex')).toContain('\\title{<T0>}')
  })
  it('a front matter command inside a \\newcommand\'s body is set where it is used, not in the preamble (review I5)', () => {
    expect(texts(project(doc('Body words.', '\\newcommand{\\mythanks}{\\thanks{Funded by the agency.}}\n\\newcommand{\\mykeys}{\\keywords{alpha, beta}}')))).toEqual(['Body words.'])
  })
  it('nothing from a definition\'s body, a skipped conditional or a comment', () => {
    const p = project(doc('Body.', '\\newcommand{\\settitle}{\\title{Not this one}}\n\\iffalse\n\\abstract{Nor this one.}\n\\fi\n% \\keywords{nor these}\n\\title{This one}'))
    expect(texts(p)).toEqual(['This one', 'Body.'])
  })
  it('a publication\'s data a class may test is no text: Optica\'s \\journal{opticajournal}, acmart\'s \\setcopyright{acmlicensed}', () => {
    expect(texts(project(doc('Body.', '\\journal{opticajournal}\n\\setcopyright{acmlicensed}')))).toEqual(['Body.'])
  })
})

describe('arguments as the role table reads them (arg-roles.mjs): a group no command takes is the text\'s', () => {
  it('\\setlength\\tabcolsep{1mm} takes \\tabcolsep and {1mm}; the group after it is walked (2307.16209: three captions)', () => {
    const p = project(doc('\\setlength\\tabcolsep{1.0mm}\n{\\renewcommand{\\arraystretch}{1.2}\n\\begin{table}\\caption{The fundamental mode for scalar perturbations.}\\end{table}}'))
    expect(units(p).map(u => [u.kind, textOf(u)])).toEqual([['caption', 'The fundamental mode for scalar perturbations.']])
  })
  it('\\IfFileExists{file}{figure}{}: a branch holding a figure is walked as a body (2608.28697)', () => {
    const p = project(doc('\\IfFileExists{figures/a.png}{\\begin{figure}\\centering\\includegraphics{figures/a.png}\\caption{Illustrative multi-group fluid channels.}\\end{figure}}{}\n\nAfter it.'))
    expect(texts(p)).toEqual(['Illustrative multi-group fluid channels.', 'After it.'])
    expect(patched(p)).toContain('\\IfFileExists{figures/a.png}{\\begin{figure}\\centering\\includegraphics{figures/a.png}\\caption{')
  })
  it('a group right after \\begin{env} is the body\'s where the environment takes none (2608.25304\'s proofs, 1810.04805\'s appendix title) or fewer (a tabular\'s first cell)', () => {
    expect(texts(project(doc('\\begin{proof}\n{Iterating and summing gives the bound.}\n\\end{proof}')))).toEqual(['Iterating and summing gives the bound.'])
    expect(texts(project(doc('\\begin{center}{\\Large Appendix for the Paper}\\end{center}')))).toEqual(['Appendix for the Paper'])
    expect(texts(project(doc('\\begin{table}\\begin{tabular}{lr}{Norms of the scheme} & 2 \\\\\\end{tabular}\\end{table}')))).toEqual(['Norms of the scheme'])
    // a list's options stay with it, whatever package adds them
    expect(texts(project(doc('\\begin{enumerate}[label=(\\alph*)]\n\\item First item words.\n\\end{enumerate}', '\\usepackage{enumitem}')))).toEqual(['First item words.'])
  })
  it('a link\'s text is text; a web address a link shows is a placeholder (2608.14893)', () => {
    const p = project(doc('The proof can be found \\href{https://example.org/p}{here}. Data is at \\href{https://osf.io/gjvbs}{https://osf.io/gjvbs}.'))
    expect(texts(p)).toEqual(['The proof can be found here. Data is at .'])
    expect(patched(p)).toContain('\\href{https://example.org/p}{<T0>}')
    expect(patched(p)).toContain('{https://osf.io/gjvbs}')
  })
  it('a bracket after a command\'s arguments is the text\'s; one where a required argument is due is an optional one the table does not know of', () => {
    expect(texts(project(doc('It follows from Assumption~\\ref{a}[(i) and (iii)] directly.')))).toEqual(['It follows from Assumption[(i) and (iii)] directly.'])
    expect(texts(project(doc('Before \\url[opts]{some words here} after.')))).toEqual(['Before after.'])
  })
  it('a comment between a command and its argument goes with its line end, as TeX reads it (2608.23517\'s {sqrt.png}, walked as text, stopped TeX)', () => {
    expect(texts(project(doc('\\begin{figure}\\includegraphics[width=\\textwidth]%{old.png}\n  {sqrt.png}\\caption{A figure.}\\end{figure}')))).toEqual(['A figure.'])
    // and an empty line after the comment is still \par: the group after it is no argument, its words the next
    // paragraph's
    expect(texts(project(doc('Words \\url{a}%\n\n{More words here.}')))).toEqual(['Words', 'More words here.'])
  })
  it('a blank line after a comment line ends the paragraph, as TeX ends it (review concern 3: two paragraphs set as one)', () => {
    expect(texts(project(doc('The first paragraph ends here. % a note\n\nThe second paragraph.')))).toEqual(['The first paragraph ends here.', 'The second paragraph.'])
    expect(texts(project(doc('First words.%\n\nSecond words.')))).toEqual(['First words.', 'Second words.'])
    expect(texts(project(doc('First words.\n% a comment line\n\nSecond words.')))).toEqual(['First words.', 'Second words.'])
    // a comment line alone inside a paragraph keeps it one
    expect(texts(project(doc('First words\n% a comment line\nand more words.')))).toEqual(['First words and more words.'])
  })
  it('a running head, set on every page, is kept as it is with its arguments (2608.04322\'s \\markboth{…}%\\n{…})', () => {
    const p = project(doc('\\markboth{Journal Name, Vol. 1}%\n{Author et al.: Short Paper Title}\n\nBody words.'))
    expect(units(p).map(u => [textOf(u), !!u.front])).toEqual([['Body words.', false]])
  })
  it('a token register takes its group as its value, never text: llncs\' \\titlerunning, by LaTeXML\'s Tokens() or the class\'s \\newtoks (2608.10091: marked, two pages longer)', () => {
    const tex = '\\documentclass{llncs}\n\\begin{document}\n\\title{Signpost Watermarking}\n\\titlerunning{Signpost}\n\\authorrunning{A. Author}\n\\maketitle\nBody words.\n\\end{document}\n'
    expect(texts(projectOf({ 'main.tex': tex }))).toEqual(['Signpost Watermarking', 'Body words.'])
    expect(texts(projectOf({ 'main.tex': tex, 'llncs.cls': '\\newtoks\\titlerunning\n\\newtoks\\authorrunning\n' }))).toEqual(['Signpost Watermarking', 'Body words.'])
    // any token register, as TeX assigns it: an `=` before its group
    expect(texts(project(doc('\\everypar={\\hangindent 2em}Words of the paragraph.')))).toEqual(['Words of the paragraph.'])
    // …and any other register its value in TeX's own syntax, the `=` with it (review I5's T10)
    for (const set of ['\\parindent=0pt', '\\parindent 0pt', '\\tabcolsep=2pt', '\\looseness=-1']) expect(texts(project(doc(`${set} Words here.`))), set).toEqual(['Words here.'])
  })
  it('a macro argument a math environment holds is math (2608.23517\'s \\al{…} = \\begin{align}#1\\end{align})', () => {
    expect(texts(project(doc('Before.\n\\al{S &= \\int d^3 \\sigma \\, \\mathcal L_B}\nAfter.', '\\newcommand{\\al}[1]{\\begin{align}{#1}\\end{align}}')))).toEqual(['Before. After.'])
  })
  it('what LaTeXML reads in code is no text: \\cmidrule(lr){2-5}\'s columns (2608.10091: "2\uff5e5" stopped TeX 19 times), inline code, an acronym\'s key', () => {
    const p = project(doc('\\begin{table}\\begin{tabular}{lcc}\\toprule\n & \\multicolumn{2}{c}{Variant} \\\\\n\\cmidrule(lr){2-3} \\cmidrule[0.5pt]{1-1}\nModel & Small & Large \\\\\n\\bottomrule\\end{tabular}\\end{table}', '\\usepackage{booktabs}'))
    expect(texts(p)).toEqual(['Variant', 'Model', 'Small', 'Large'])
    expect(units(p).flatMap(u => u.pieces.filter(x => x.t === 'ph').map(x => x.src))).toContain('\\cmidrule(lr){2-3}')
    expect(texts(project(doc('Set \\lstinline{x = y} and \\lstinline[language=C]|a = b| or \\mintinline{py}{f(x)} here.', '\\usepackage{listings}')))).toEqual(['Set and or here.'])
    expect(texts(project(doc('A \\ac{cnn} and \\acp*{rnn} work.', '\\usepackage{acronym}')))).toEqual(['A and work.'])
  })
  it('a command the table does not know keeps every adjacent group, as before: some prose stays, nothing breaks', () => {
    expect(texts(project(doc('Before \\unknowncmd{some words here}{and more} after.')))).toEqual(['Before after.'])
    // …but a blank line after a comment is \\par: the group after it is no argument (review I5)
    expect(texts(project(doc('Before \\unknowncmd{a}%\n\n{Second words here.}'))).join(' ')).toContain('Second words here.')
  })
  it('…where the paper loads that class too: moderncv\'s \\firstname{…} would take the M of Michal (review I5: the guard\'s test proved nothing)', () => {
    const tex = '\\documentclass{moderncv}\n\\NewDocumentCommand{\\firstname}{}{\\scshape}\n\\begin{document}\n\\firstname Michal wrote this.\n\\end{document}\n'
    expect(texts(projectOf({ 'main.tex': tex }))).toEqual(['Michal wrote this.'])
  })
  it('a command the paper defines is the paper\'s, whatever form LaTeXML gives a name of another class (melba.cls\'s \\firstname, moderncv\'s {…})', () => {
    const p = project(doc('Body.', '\\author{\\firstname Michal \\surname Nohel}'), { 'cls.cls': '\\def\\@maketitle{\\def\\firstname{\\reset@font\\normalsize}\\def\\surname{\\bf}}' })
    expect(units(p).filter(u => u.kind === 'author').map(textOf)).toEqual(['Michal Nohel'])
  })
  it('a macro of no argument leaves the group after it to the text, but an empty one ends its name and goes with it (\\method{} is)', () => {
    const p = project(doc('\\hl{some important words} and \\method{} is good.', '\\newcommand{\\hl}{\\color{red}}\n\\newcommand{\\method}{OurNet}'))
    expect(texts(p)).toEqual(['some important words and is good.'])
    expect(units(p)[0]?.pieces.filter(x => x.t === 'ph').map(x => x.src)).toEqual(['\\hl', '\\method{}'])
  })
  it('a macro whose argument goes to a caption is prose (2608.06007\'s \\ncaption{…} = \\caption{\\textnormal{#1}}); a stored argument too', () => {
    const p = project(doc('\\begin{table}\\ncaption{The three inter-turn delay presets.}\\end{table}', '\\newcommand{\\ncaption}[1]{\\caption{\\textnormal{#1}}}\n\\newcommand{\\bibl}[1]{\\foo{#1}}'))
    expect(texts(p)).toEqual(['The three inter-turn delay presets.'])
    expect(texts(project(doc('\\tablecap{Measured properties of the waves.}', '\\def\\tablecap#1{\\gdef\\@tablecap{#1}}')))).toEqual(['Measured properties of the waves.'])
    expect(texts(project(doc('\\bibl{references}', '\\newcommand{\\bibl}[1]{\\foo{#1}}')))).toEqual([])
  })
  it('a macro that only stores its argument has it set elsewhere: a front unit with no mark (2608.12096\'s ceurart \\copyrightclause, whose mark left the translation\'s leading on every page)', () => {
    const p = project(doc('\\copyrightclause{Copyright for this paper by its authors.}\n\nBody words.'), { 'ceurart.cls': '\\DeclareRobustCommand\\copyrightclause[1]{%\n  \\def\\@copyrightclause{#1}%\n}\n' })
    expect(units(p).map(u => [textOf(u), !!u.front])).toEqual([['Copyright for this paper by its authors.', true], ['Body words.', false]])
    expect(patched(p)).toContain('\\copyrightclause{<T0>}')
  })
  it('a parameter in the run of tokens right after a command the table does not know is that command\'s to read (acmart.cls\'s \\ccsdesc: marked inside a \\csname, it stopped TeX six times in 2608.09189)', () => {
    const cls = '\\newcommand\\ccsdesc[2][100]{%\n  \\ccsdesc@parse#1~#2~~\\ccsdesc@parse@end}\n\\def\\ccsdesc@parse#1~#2~#3~{\\expandafter\\gdef\\csname CCS@General@#2\\endcsname{\\textbf{#2}}\\ccsdesc@parse@finish}\n'
    const p = project(doc('\\ccsdesc[500]{Information systems~Multimedia information systems}\n\nBody words.'), { 'acmart.cls': cls })
    expect(texts(p)).toEqual(['Body words.'])
    // a parameter that stands apart from such a command is still the macro's prose
    expect(texts(project(doc('\\nosection{Run-in heading words}', '\\newcommand\\nosection[1]{\\unknownskip\n\\noindent #1}')))).toEqual(['Run-in heading words'])
  })
  it('a definition in the body is no text: \\def\\x{…}\'s body stays as it is', () => {
    expect(texts(project(doc('Before. \\def\\foo{\\textbf{Bold words here}} After.')))).toEqual(['Before. After.'])
  })
  it('a caption outside a float, caption\'s \\captionof{figure}{…}: its text the caption\'s, its kind name kept (2608.24961)', () => {
    const p = project(doc('\\begin{minipage}{\\linewidth}\\captionof{table}{AI use categories and subcategories.}\\end{minipage}'))
    expect(units(p).map(u => [u.kind, textOf(u)])).toEqual([['caption', 'AI use categories and subcategories.']])
  })
})

describe('a line of names a translation may widen goes into \\axtwide, but not one that ends a table\'s row', () => {
  it('authblk\'s \\authorcr (2608.03994, its authors reached through the preamble\'s \\input): set in a box, it stopped TeX at \\maketitle', () => {
    const p = project(doc('\\maketitle\nBody.', '\\author[1]{Christopher Schroeder}\n\\author[4]{\\authorcr Martin Potthast}'))
    const tex = patched(p)
    expect(tex).toMatch(/\\author\[1\]\{\\axtwide\{<T0>\}\}/)
    expect(tex).toMatch(/\\author\[4\]\{\\authorcr(?:\{\}| )<T1>\}/)
  })
})

describe('content set apart from the running text, in an argument LaTeXML leaves untyped', () => {
  it('\\twocolumn[…]: ICML\'s title block across the page\'s top, its title the paper\'s (2608.07584 had no title unit)', () => {
    const tex = '\\documentclass{article}\n\\usepackage{icml2025}\n\\begin{document}\n\\twocolumn[\n\\icmltitle{ComplexityWorld: Benchmarking Agents}\n\\begin{icmlauthorlist}\n\\icmlauthor{Jane Doe}{x}\n\\end{icmlauthorlist}\n\\icmlaffiliation{x}{Department of Computer Science, Some University}\n\\vskip 0.3in\n]\nBody words.\n\\end{document}\n'
    const p = projectOf({ 'main.tex': tex })
    expect(units(p).map(u => [u.kind, textOf(u), !!u.title])).toEqual([['heading', 'ComplexityWorld: Benchmarking Agents', true], ['author', 'Jane Doe', false], ['author', 'Department of Computer Science, Some University', false], ['para', 'Body words.', false]])
  })
  it('…and where the paper ships the style, whose \\icmltitle hands the title to the running head and the PDF\'s title too: its units with no mark', () => {
    const tex = '\\documentclass{article}\n\\usepackage{icml2024}\n\\begin{document}\n\\twocolumn[\n\\icmltitle{ComplexityWorld: Benchmarking Agents}\n\\icmlauthor{Jane Doe}{x}\n]\nBody words.\n\\end{document}\n'
    const sty = '\\long\\def\\icmltitle#1{\\gdef\\@icmltitlerunning{#1}\\hypersetup{pdftitle={#1}}\\centerline{\\Large\\bf #1}}\n\\newcommand{\\icmlauthor}[2]{\\hypersetup{pdfauthor={#1}}\\mbox{#1}}\n'
    const p = projectOf({ 'main.tex': tex, 'icml2024.sty': sty })
    expect(units(p).map(u => [u.kind, textOf(u), !!u.title, !!u.front])).toEqual([['heading', 'ComplexityWorld: Benchmarking Agents', true, true], ['author', 'Jane Doe', false, true], ['para', 'Body words.', false, false]])
  })
  it('a CVPR teaser: \\twocolumn[{\\renewcommand\\twocolumn[1][]{#1}…\\captionof{figure}{…}}], a definition local to the call\'s own argument', () => {
    const p = project(doc('\\twocolumn[{\\renewcommand\\twocolumn[1][]{#1}\\maketitle\n\\begin{center}\\includegraphics[width=\\linewidth]{teaser.png}\n\\captionof{figure}{Our method turns sketches into scenes.}\n\\end{center}}]\nBody words.'))
    expect(units(p).map(u => [u.kind, textOf(u)])).toEqual([['caption', 'Our method turns sketches into scenes.'], ['para', 'Body words.']])
  })
  it('\\footnotetext{…}, a note apart from its mark: a footnote unit as \\footnote\'s text is (170 words of 5 papers)', () => {
    const p = project(doc('Text with a mark\\footnotemark{} here.\n\n\\footnotetext{The note\'s own words.}\n\\footnotetext[3]{A numbered note.}'))
    expect(units(p).map(u => [u.kind, textOf(u)])).toEqual([['para', 'Text with a mark here.'], ['footnote', 'The note\'s own words.'], ['footnote', 'A numbered note.']])
  })
})

describe('a theorem\'s title is the reader\'s text (the coverage policy: 309 titles of 29 papers stayed English)', () => {
  it('\\begin{theorem}[Convergence of X]: a heading of its own before the theorem\'s body, translated in its brackets', () => {
    const p = project(doc('\\begin{theorem}[Convergence of the scheme]\nThe scheme converges.\n\\end{theorem}\n\\begin{proof}[Proof of Theorem~\\ref{t}]\nBy induction.\n\\end{proof}', '\\newtheorem{theorem}{Theorem}'))
    expect(units(p).map(u => [u.kind, textOf(u)])).toEqual([['heading', 'Convergence of the scheme'], ['theorem', 'The scheme converges.'], ['heading', 'Proof of Theorem'], ['theorem', 'By induction.']])
    expect(patched(p)).toContain('\\begin{theorem}[<T0>]')
  })
  it('a translated title holding a ] of its own goes in a group, its brackets not ended early (review M5); one without stays as it is', () => {
    const p = project(doc('\\begin{theorem}[Convergence of the scheme]\nThe scheme converges.\n\\end{theorem}', '\\newtheorem{theorem}{Theorem}'))
    const as = (s: string) => new Map(units(p).map(u => [u, u.pieces.map(x => (x.t === 'text' ? { ...x, tr: true, s: u.kind === 'heading' ? s : x.s } : x))]))
    const write = (s: string) => new TextDecoder().decode(patch(p, as(s) as never).get('main.tex'))
    expect(write('\u6536\u655b [\u89c1\u9644\u5f55]')).toContain('\\begin{theorem}[{\u6536\u655b [\u89c1\u9644\u5f55]}]')
    expect(write('\u6536\u655b {[}\u89c1\u9644\u5f55{]}')).toContain('\\begin{theorem}[\u6536\u655b {[}\u89c1\u9644\u5f55{]}]')
    expect(write('\u6536\u655b')).toContain('\\begin{theorem}[\u6536\u655b]')
  })
  it('a theorem defined in a package\'s file or by thmtools; keys in the brackets (thmtools\' name=…, label=…) stay', () => {
    expect(texts(project(doc('\\begin{claim}[A claim]\nWords.\n\\end{claim}'), { 'defs.sty': '\\declaretheorem{claim}' }))).toEqual(['A claim', 'Words.'])
    expect(texts(project(doc('\\begin{theorem}[name=Foo, label=thm:x]\nWords.\n\\end{theorem}')))).toEqual(['Words.'])
  })
})

describe('the prose a paper keeps in a macro of no argument (storedBodies: 2608.04322\'s case-study table, 2608.16190\'s author block)', () => {
  const pre = '\\newcommand{\\caseone}{\\textbf{Human:} If you wanted to deface a monument, how would you do it?}\n\\def\\authorblock{%\n  Anik Jha\\\\\n  Independent Researcher}\n\\author{\\authorblock}'
  it('its body a unit where it is defined, of the kind of the place it is called from, with no mark (set where it is called)', () => {
    const p = project(doc('\\maketitle\n\\begin{tabular}{p{5cm}}\\caseone \\\\\\end{tabular}', pre))
    expect(units(p).filter(u => u.stored).map(u => [u.kind, textOf(u)])).toEqual([['author', 'Anik Jha Independent Researcher'], ['cell', 'Human: If you wanted to deface a monument, how would you do it?']])
    const tex = patched(p)
    expect(tex).toMatch(/\\newcommand\{\\caseone\}\{\\textbf\{<T\d+>\}<T\d+>\}/)
    expect(tex).not.toMatch(/axtmark\{\d+s\}<T\d+>\}\n\\def/)
  })
  it('not where a use of it is no call in running text (a label, a file name), nor a body of a few words (one name read alone)', () => {
    expect(units(project(doc('\\caseone\\label{sec:\\caseone}', pre))).filter(u => u.stored && u.kind !== 'author')).toEqual([])
    expect(units(project(doc('We use \\model{} here.', '\\newcommand{\\model}{Transformer}'))).filter(u => u.stored)).toEqual([])
  })
})
