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
    // and an empty line after the comment is still \par: the group after it is no argument, its words the text's
    expect(texts(project(doc('Words \\url{a}%\n\n{More words here.}')))).toEqual(['Words More words here.'])
  })
  it('a running head\'s text, set on every page, is a front unit with no mark (2608.04322\'s \\markboth{…}%\\n{…})', () => {
    const p = project(doc('\\markboth{Journal Name, Vol. 1}%\n{Author et al.: Short Paper Title}\n\nBody words.'))
    expect(units(p).map(u => [textOf(u), !!u.front])).toEqual([['Journal Name, Vol. 1', true], ['Author et al.: Short Paper Title', true], ['Body words.', false]])
  })
  it('a macro argument a math environment holds is math (2608.23517\'s \\al{…} = \\begin{align}#1\\end{align})', () => {
    expect(texts(project(doc('Before.\n\\al{S &= \\int d^3 \\sigma \\, \\mathcal L_B}\nAfter.', '\\newcommand{\\al}[1]{\\begin{align}{#1}\\end{align}}')))).toEqual(['Before. After.'])
  })
  it('a command the table does not know keeps every adjacent group, as before: some prose stays, nothing breaks', () => {
    expect(texts(project(doc('Before \\unknowncmd{some words here}{and more} after.')))).toEqual(['Before after.'])
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

describe('a theorem\'s title is the reader\'s text (the coverage policy: 309 titles of 29 papers stayed English)', () => {
  it('\\begin{theorem}[Convergence of X]: a heading of its own before the theorem\'s body, translated in its brackets', () => {
    const p = project(doc('\\begin{theorem}[Convergence of the scheme]\nThe scheme converges.\n\\end{theorem}\n\\begin{proof}[Proof of Theorem~\\ref{t}]\nBy induction.\n\\end{proof}', '\\newtheorem{theorem}{Theorem}'))
    expect(units(p).map(u => [u.kind, textOf(u)])).toEqual([['heading', 'Convergence of the scheme'], ['theorem', 'The scheme converges.'], ['heading', 'Proof of Theorem'], ['theorem', 'By induction.']])
    expect(patched(p)).toContain('\\begin{theorem}[<T0>]')
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
