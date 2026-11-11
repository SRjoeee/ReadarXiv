import { describe, expect, it } from 'vitest'
import { LAYOUT_CLASSES } from '@/pdf-reader/engine/layout/marks.mjs'
import { openPaper, originalFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { identifierSource, inMemory, lineBreaks, loadProject, localizeNames, markUnits, patch } from '@/pdf-reader/engine/source/latex-front.mjs'
import { serialize } from '@/pdf-reader/engine/translate/mt.mjs'

// The PDF reader's LaTeX front end: what of a paper's source is prose to translate

type Unit = { kind: string; pieces: { t: string; s?: string }[] }

describe('loadProject: a file \\input under another spelling is the file the source package holds', () => {
  const enc = (s: string) => new TextEncoder().encode(s)
  const files = () => inMemory(new Map([
    ['main.tex', enc('\\documentclass{article}\n\\begin{document}\n\\input{./sections/a.tex}\n\\input{sections/b}\n\\input{sections/../sections/a}\n\\end{document}\n')],
    ['sections/a.tex', enc('First paragraph of a.\n')],
    ['sections/b.tex', enc('Second paragraph of b.\n')],
  ]))
  it('names \\input{./sections/a.tex} sections/a.tex, so the translation written back replaces that file rather than sitting beside it under ./sections/a.tex, where the compile set the English over it (2608.08350: every unit past the abstract)', () => {
    const p = loadProject(files(), 'main.tex')
    const units = p.units as (Unit & { file: string })[]
    expect([...new Set(units.map(u => u.file))]).toEqual(['sections/a.tex', 'sections/b.tex'])
    const translated = new Map(units.map((u, i) => [u, u.pieces.map(x => (x.t === 'text' ? { ...x, tr: true, s: `<T${i}>` } : x))]))
    const out = patch(p, translated as Map<(typeof p.units)[number], unknown[]>)
    expect([...out.keys()].sort()).toEqual(['main.tex', 'sections/a.tex', 'sections/b.tex'])
    expect(new TextDecoder().decode(out.get('sections/a.tex'))).toContain('<T0>')
  })
  it('walks a file once, however many spellings name it', () => {
    const p = loadProject(files(), 'main.tex')
    expect((p.units as (Unit & { file: string })[]).filter(u => u.file === 'sections/a.tex')).toHaveLength(1)
  })
})

describe('loadProject: a file named in another case is the one kpathsea opens (texmf_casefold_search)', () => {
  // (2402.10294v1's main.tex reads \input{chapters/prompts}, the package holds chapters/Prompts.tex: TeX's kpathsea, its case
  // fold on in every TeX Live the box serves (texmf_casefold_search = 1; `kpsewhich chapters/prompts.tex` gives
  // ./chapters/Prompts.tex in both pinned images, 2026-11-09), opens it after no file of the name as given; the front end read
  // the name as given only, and the whole appendix, Figure 10's caption among it, had no unit)
  const enc = (s: string) => new TextEncoder().encode(s)
  const filesOf = (input: string, rest: string[]) => {
    const fs = inMemory(new Map([['main.tex', enc(`\\documentclass{article}\n\\begin{document}\n${input}\n\\end{document}\n`)], ...rest.map((f) => [f, enc(`Prose of ${f}.\n`)] as [string, Uint8Array])]))
    return [...new Set((loadProject(fs, 'main.tex').units as (Unit & { file: string })[]).map((u) => u.file))]
  }
  it('reads the file whose last component is the name’s, case aside, where none is of the name as given', () => {
    expect(filesOf('\\input{chapters/prompts}', ['chapters/Prompts.tex'])).toEqual(['chapters/Prompts.tex'])
    expect(filesOf('\\input{c/x}', ['c/x.TEX'])).toEqual(['c/x.TEX'])
    // (written back under the package's name, which TeX opens)
    const p = loadProject(inMemory(new Map([['main.tex', enc('\\documentclass{article}\n\\begin{document}\n\\input{chapters/prompts}\n\\end{document}\n')], ['chapters/Prompts.tex', enc('Prose.\n')]])), 'main.tex')
    const translated = new Map((p.units as Unit[]).map((u) => [u, u.pieces.map((x) => (x.t === 'text' ? { ...x, tr: true, s: '<T>' } : x))]))
    expect([...patch(p, translated as Map<(typeof p.units)[number], unknown[]>).keys()].sort()).toEqual(['chapters/Prompts.tex', 'main.tex'])
  })
  it('takes the name as given first, folds no directory, and reads none where two names fold alike', () => {
    expect(filesOf('\\input{c/prompts}', ['c/Prompts.tex', 'c/prompts.tex'])).toEqual(['c/prompts.tex'])
    expect(filesOf('\\input{Chapters/prompts}', ['chapters/Prompts.tex'])).toEqual([])
    // (kpathsea takes the first its directory lists, an order of the disk's the package does not tell)
    expect(filesOf('\\input{d/two}', ['d/Two.tex', 'd/TWO.tex'])).toEqual([])
  })
})

describe('loadProject: a file named through import.sty or subfiles is the one TeX reads', () => {
  const enc = (s: string) => new TextEncoder().encode(s)
  const fileOf = (u: Unit) => (u as Unit & { file: string }).file
  const filesOf = (main: string, rest: [string, string][]) => [...new Set((loadProject(inMemory(new Map([['main.tex', enc(`\\documentclass{article}\n\\begin{document}\n${main}\n\\end{document}\n`)], ...rest.map(([f, t]) => [f, enc(t)] as [string, Uint8Array])])), 'main.tex').units as Unit[]).map(fileOf))]
  it('\\import{dir/}{file} is dir/file; an \\input in it looks in dir/ before the root (import.sty puts dir/ first on \\input@path), a \\subimport goes on from dir/', () => {
    expect(filesOf('\\import{chapters/}{one}\n\\inputfrom{./chapters}{two.tex}', [
      ['chapters/one.tex', 'Prose of one.\n\n\\input{fig}\n\n\\subimport{deep/}{three}\n\n\\input{root}\n'],
      ['chapters/fig.tex', 'Prose of the chapter\'s figure.\n'],
      ['fig.tex', 'Prose of the root\'s figure, which TeX does not read here.\n'],
      ['chapters/deep/three.tex', 'Prose of three.\n'],
      ['root.tex', 'Prose found at the root, the directory having none.\n'],
      ['chapters/two.tex', 'Prose of two.\n'],
    ])).toEqual(['chapters/one.tex', 'chapters/fig.tex', 'chapters/deep/three.tex', 'root.tex', 'chapters/two.tex'])
  })
  it('\\subfile{chapters/ch1} is chapters/ch1.tex, and an \\input in it looks in chapters/ first (subfiles loads it by \\subimport)', () => {
    expect(filesOf('\\subfile{./chapters/ch1}', [
      ['chapters/ch1.tex', '\\documentclass[../main.tex]{subfiles}\n\\begin{document}\nProse of the chapter.\n\n\\input{table}\n\\end{document}\n'],
      ['chapters/table.tex', 'Prose of the chapter\'s table.\n'],
    ])).toEqual(['chapters/ch1.tex', 'chapters/table.tex'])
  })
})
const project = (tex: string) => loadProject(inMemory(new Map([['main.tex', new TextEncoder().encode(tex)]])), 'main.tex')
const textOf = (u: Unit) => u.pieces.filter(p => p.t === 'text').map(p => p.s).join('')
/** every unit's words replaced by a mark of its own, and the main file as it is then typeset */
const patched = (p: ReturnType<typeof project>) => {
  const units = p.units as Unit[]
  const translated = new Map(units.map((u, i) => [u, u.pieces.map(x => (x.t === 'text' ? { ...x, tr: true, s: `<T${i}>` } : x))]))
  return new TextDecoder().decode(patch(p, translated as Map<(typeof p.units)[number], unknown[]>).get('main.tex'))
}

describe('the front matter: its notes (1706.03762) and its names and places (the owner, 2026-09-28)', () => {
  const AUTHORS = '\\author{Alice\\thanks{Equal contribution. Listing order is random.}\\\\ Bob\\footnotemark[1] \\hspace{1mm}\\thanks{Work performed while at X.}}'
  const authors = (p: ReturnType<typeof project>) => (p.units as Unit[]).filter(u => u.kind === 'author').map(u => textOf(u).trim())
  const places = (p: ReturnType<typeof project>) => (p.units as Unit[]).filter(u => u.kind === 'affiliation').map(u => textOf(u).replace(/\s+/g, ' ').trim())

  it('in the preamble: each \\thanks a footnote of its own, the names between them units of kind author', () => {
    const p = project(`\\documentclass{article}\\title{The Paper}${AUTHORS}\\begin{document}\\maketitle\nWords here.\\end{document}`)
    const units = p.units as Unit[]
    expect(units.filter(u => u.kind === 'footnote').map(textOf)).toEqual(['Equal contribution. Listing order is random.', 'Work performed while at X.'])
    expect(authors(p)).toEqual(['Alice', 'Bob'])
    // typeset: names and notes translated in place, the marks and spacing as the author wrote them
    expect(patched(p)).toMatch(/\\author\{<T\d+>\\thanks\{<T\d+>\}\\\\<T\d+>\\footnotemark\[1\]<T\d+>\\hspace\{1mm\}\\thanks\{<T\d+>\}\}/)
  })

  it('in the body too, where some classes want the author block', () => {
    const p = project(`\\documentclass{article}\\begin{document}\\title{The Paper}${AUTHORS}\\maketitle\nWords here.\\end{document}`)
    expect((p.units as Unit[]).filter(u => u.kind === 'footnote').map(textOf)).toEqual(['Equal contribution. Listing order is random.', 'Work performed while at X.'])
    expect(authors(p)).toEqual(['Alice', 'Bob'])
  })

  it('an affiliation and its note; the title\'s note stays the title\'s, and the title is still the title', () => {
    const p = project('\\documentclass{article}\\title{The Paper\\thanks{Supported by a grant.}}\\author{Alice}\\affil{Somewhere\\thanks{Now elsewhere.}}\\begin{document}\\maketitle\nWords.\\end{document}')
    const units = p.units as (Unit & { title?: boolean })[]
    expect(units.filter(u => u.kind === 'footnote').map(textOf).sort()).toEqual(['Now elsewhere.', 'Supported by a grant.'])
    expect(units.filter(u => u.title).map(textOf)).toEqual(['The Paper'])
    expect(authors(p)).toEqual(['Alice'])
    expect(places(p)).toEqual(['Somewhere'])
  })

  it('an optional argument after an author block\'s text is the command\'s: no unit, no mark between them (2610.21084v1, cas-sc)', () => {
    // (the Elsevier classes read \\author[1]{Name}[orcid=…] by looking past the name: a unit of the bracket, its start mark between
    // the two, hid the option from the class, which set it as text, and the marked original ran a page longer than the paper)
    for (const where of ['preamble', 'body']) {
      const author = '\\author[1]{Matthias Chung}[orcid=0000-0001-7822-4539]\n\\cormark[1]\n\\affiliation[1]{Emory University}[type=edu]'
      const tex = where === 'preamble' ? `\\documentclass{article}\n${author}\n\\begin{document}\n\\maketitle\nWords here.\n\\end{document}` : `\\documentclass{article}\n\\begin{document}\n${author}\n\\maketitle\nWords here.\n\\end{document}`
      const p = openPaper(new Map([['main.tex', new TextEncoder().encode(tex)]]))
      // (the affiliation's place where its unit was: what was one unit keeps its number, latex-front.mjs frontBlock)
      expect((p.units as unknown as Unit[]).map(u => textOf(u).trim()), where).toEqual(['Matthias Chung', 'Emory University', 'Words here.'])
      const marked = new TextDecoder().decode(originalFiles(p, { lines: true, layout: LAYOUT_CLASSES }).get('main.tex'))
      expect(marked, where).toContain('\\axtend{0e}}[orcid=0000-0001-7822-4539]\n\\cormark[1]')
      expect(marked, where).toMatch(/\\axtend\{1e\}\}\[type=edu\]/)
    }
  })

  it('IEEEtran\'s blocks and acmart\'s parts of an affiliation are names and places; an address, a mark, a key stay', () => {
    const ieee = project('\\documentclass{article}\\begin{document}\\author{\\IEEEauthorblockN{Alice Smith\\IEEEauthorrefmark{1}}\\IEEEauthorblockA{Peking University\\\\ \\texttt{alice@pku.edu.cn}}}\\maketitle\nWords.\\end{document}')
    expect(authors(ieee)).toEqual(['Alice Smith'])
    expect(places(ieee)).toEqual(['Peking University'])
    const acm = project('\\documentclass{article}\\begin{document}\\author{Alice}\\affiliation{\\institution{Peking University}\\city{Beijing}\\country{China}}\\email{alice@pku.edu.cn}\\maketitle\nWords.\\end{document}')
    expect(authors(acm)).toEqual(['Alice'])
    expect(places(acm)).toEqual(['Peking UniversityBeijingChina'])
    // elsarticle's keys and values: each value of words a unit of places, the keys (an engine would translate them) as they are
    const els = project('\\documentclass{article}\\begin{document}\\author{Alice}\\affiliation{organization={Peking University}, city={Beijing}}\\maketitle\nWords.\\end{document}')
    expect(authors(els)).toEqual(['Alice'])
    expect(places(els)).toEqual(['Peking University', 'Beijing'])
  })
})

describe('declarations that take no argument (2608.05876: five of eight tables stayed in English)', () => {
  it('a table in a brace group after \\centering: the group is no argument of \\centering, and each cell is a unit', () => {
    const p = loadProject(inMemory(new Map([['main.tex', new TextEncoder().encode('\\documentclass{article}\\begin{document}\n\\begin{table}\\centering\n{\\small\n\\begin{tabular}{ll}\\toprule[1pt]\nFrozen profile & Prompting only \\\\\n\\end{tabular}}\n\\caption{A caption here.}\n\\end{table}\n\\end{document}')]])), 'main.tex', { tables: true })
    const units = p.units as Unit[]
    expect(units.filter(u => u.kind === 'cell').map(u => textOf(u).trim())).toEqual(['Frozen profile', 'Prompting only'])
    // the rule's optional width is still the rule's
    expect(units.some(u => /1pt/.test(textOf(u)))).toBe(false)
    expect(patched(p)).toMatch(/\\centering\n\{\\small\n\\axtfit\{\\begin\{tabular\}\{ll\}\\toprule\[1pt\]<T\d+>&<T\d+>\\\\/)
  })

  it('a size switch before a group in a paragraph: the group\'s words are the paragraph\'s', () => {
    const p = project('\\documentclass{article}\\begin{document}\nWords before \\small{words inside} and after.\n\\end{document}')
    expect((p.units as Unit[]).map(u => textOf(u).trim())).toEqual(['Words before words inside and after.'])
  })
})

describe('the paper\'s own macros (2608.06007: its run-in headings \\nosection{…} stayed in English)', () => {
  const doc = (defs: string, body: string) => project(`\\documentclass{article}${defs}\\begin{document}\n${body}\n\\end{document}`)

  it('an argument the macro typesets as prose is translated, and the macro stays around it', () => {
    const p = doc('\\newcommand{\\nosection}[1]{\\vspace{3pt}\\noindent\\textbf{#1}}', '\\nosection{Contributions.}\n\nThe text of the paragraph.')
    expect((p.units as Unit[]).map(u => textOf(u).trim())).toEqual(['Contributions.', 'The text of the paragraph.'])
    expect(patched(p)).toMatch(/\\nosection\{<T0>\}/)
  })

  it('in a bare group or a box too; one handed to \\label, \\ref or math stays as it is', () => {
    const p = doc(
      '\\newcommand{\\bl}[1]{$\\bullet$\\hspace{1mm}{#1}}\\newcommand{\\hl}[1]{\\color{red}{#1}}\\newcommand\\figref[1]{Figure~\\ref{#1}}\\newcommand{\\vect}[1]{$\\mathbf{#1}$}',
      '\\bl{Bulleted words} and \\figref{fig:alpha} with \\vect{xyz} and \\hl{red words} end.',
    )
    const text = (p.units as Unit[]).map(textOf).join('|')
    expect(text).toContain('Bulleted words')
    expect(text).toContain('red words')
    expect(text).not.toMatch(/fig:alpha|xyz/)
  })

  it('with a key before the prose, or an optional first argument, the other arguments stay as they are', () => {
    const p = doc('\\newcommand{\\tagged}[2]{\\label{#1}\\textbf{#2}}\\newcommand{\\note}[2][red]{\\textcolor{#1}{#2}}', '\\tagged{key:one}{Label words} then \\note[blue]{noted words} end.')
    expect((p.units as Unit[]).map(u => textOf(u).trim()).join('')).toBe('Label words then noted words end.')
    expect(patched(p)).toMatch(/\\tagged\{key:one\}\{<T0>/)
  })

  it('one around whole paragraphs or a figure is walked as an environment is: each paragraph a unit, the call in place (2608.25210)', () => {
    const p = doc('\\newcommand{\\techreport}[1]{#1}', 'Before.\n\n\\techreport{First paragraph inside.\n\nSecond paragraph inside.}\n\nAfter.')
    expect((p.units as Unit[]).map(u => textOf(u).trim())).toEqual(['Before.', 'First paragraph inside.', 'Second paragraph inside.', 'After.'])
    expect(patched(p)).toMatch(/\\techreport\{<T1>\n\n<T2>\}/)
  })

  it('an argument without braces is one token, as TeX takes it (2608.12096: \\inline{\\onenode x})', () => {
    const p = doc('\\newcommand{\\inline}[1]{\\fbox{#1}}\\newcommand{\\onenode}[1]{\\mbox{$#1$}}', 'The graph \\inline{\\onenode x} has one node.')
    // the node's x goes with \\onenode, as a piece no engine sees
    expect((p.units as Unit[]).map(u => textOf(u).trim())).toEqual(['The graph  has one node.'])
    expect(patched(p)).toContain('\\inline{\\onenode x}')
  })

  it('a macro with two prose arguments stays opaque', () => {
    const p = doc('\\newcommand{\\pair}[2]{\\textbf{#1} and \\emph{#2}}', 'Start \\pair{first words}{second words} end.')
    expect((p.units as Unit[]).map(textOf).join('')).not.toMatch(/first words|second words/)
  })
})

describe('a translated line of names that may not fit its box (2608.06701: Japanese names ran 126 pt past the page)', () => {
  const IEEE = '\\documentclass[conference]{IEEEtran}\\author{\\IEEEauthorblockN{Alice Example\\IEEEauthorrefmark{1}, Bob Example\\IEEEauthorrefmark{2}}\n\\IEEEauthorblockA{Somewhere\\\\ Elsewhere}}\\begin{document}\\maketitle\nWords here.\\end{document}'
  const marked = (tex: string) => {
    const p = project(tex)
    const units = p.units as Unit[]
    const translated = new Map(units.map((u, i) => [u, u.pieces.map(x => (x.t === 'text' ? { ...x, tr: true, s: `<T${i}>` } : x))]))
    return new TextDecoder().decode(patch(p, translated as Map<(typeof p.units)[number], unknown[]>, { mark: markUnits(p.units, translated) }).get('main.tex'))
  }

  it('its names go into \\axtwide, their marks with them, the block\'s own braces around it', () => {
    expect(marked(IEEE)).toMatch(/\\IEEEauthorblockN\{\\axtwide\{<T\d+>\\IEEEauthorrefmark\{1\}<T\d+>\\IEEEauthorrefmark\{2\}\}\}/)
  })

  it('a block that breaks its own lines, or holds a note, is left as it is: set twice to be measured, a note would be kept twice', () => {
    const tex = marked(IEEE)
    expect(tex).toMatch(/\\IEEEauthorblockA\{<T\d+>\\\\\s*<T\d+>\}/)
    expect(marked('\\documentclass{article}\\author{Alice\\thanks{A note.}}\\begin{document}\\maketitle\nWords.\\end{document}')).not.toMatch(/\\axtwide\{[^}]*\\thanks/)
  })

  it('an address is not prose: a list of names in escaped braces before @, and a plain e-mail, stay as they are', () => {
    const p = project(IEEE.replace('Somewhere\\\\ Elsewhere', 'Somewhere, \\{sl225, reyhaneh\\}@illinois.edu, or write to jatin@us.ibm.com today'))
    const text = (p.units as Unit[]).map(textOf).join(' | ')
    expect(text).not.toMatch(/reyhaneh|sl225|jatin|illinois|ibm/)
    expect(text).toMatch(/Somewhere/)
    expect(marked(IEEE.replace('Somewhere\\\\ Elsewhere', 'Somewhere, \\{sl225, reyhaneh\\}@illinois.edu, or write to jatin@us.ibm.com today'))).toContain('\\{sl225, reyhaneh\\}@illinois.edu')
  })

  it('a group of local parts before one domain is one address, whatever spaces TeX writes between them and whichever brackets hold them: no word of it sent', () => {
    // (a tie or a thin space between the local parts, `\{kahe,~v-xiangz\}@…` and `\{mph,\,lmb\}@…`, parted the list into text
    // pieces sent one by one; a group in parentheses or brackets, `[first name]@…`, was text)
    const row = 'Somewhere, \\{alpha,~beta-x,\\,gamma\\}@example.org, (delta, eps)@example.net, or [first name]@example.com.'
    const units = project(IEEE.replace('Somewhere\\\\ Elsewhere', row)).units as Unit[]
    const text = units.map(textOf).join(' | ')
    expect(text).not.toMatch(/alpha|beta|gamma|delta|eps|first|name|example/)
    expect(text).toMatch(/Somewhere, .*, or .*\./)
    const kept = units.flatMap(u => u.pieces.filter(p => p.t === 'ph').map(p => (p as { src?: string }).src))
    expect(kept).toEqual(expect.arrayContaining(['\\{alpha,~beta-x,\\,gamma\\}@example.org', '(delta, eps)@example.net', '[first name]@example.com']))
    expect(marked(IEEE.replace('Somewhere\\\\ Elsewhere', row))).toContain('\\{alpha,~beta-x,\\,gamma\\}@example.org')
  })

  it('a paragraph of grouped addresses alone is no unit: nothing of it is prose', () => {
    const units = project('\\documentclass{article}\\begin{document}\nWords here.\n\n\\{alpha,~beta\\}@example.org, gamma@example.net\n\\end{document}').units as Unit[]
    expect(units.filter(u => u.pieces.some(p => /alpha|beta|gamma/.test((p as { s?: string }).s ?? (p as { src?: string }).src ?? '')))).toEqual([])
    expect(units.map(u => textOf(u).trim())).toEqual(['Words here.'])
  })

  it('nothing broader than the group: a bracket after a word, a space before the @, a bracket that is no list of local parts stay text', () => {
    const row = 'Somewhere: mAP@[.5, .95] at f(a, b)@example.org and (a, b) @example.org and [see 2]@'
    const text = (project(IEEE.replace('Somewhere\\\\ Elsewhere', row)).units as Unit[]).map(textOf).join(' | ')
    expect(text).toContain('mAP@[.5, .95] at f(a, b)@example.org and (a, b) @example.org and [see 2]@')
  })

  it('\\and is no unit\'s: article ends a table there, which cannot be set inside a box (2608.21180), so each author\'s block is its own', () => {
    const tex = marked('\\documentclass{article}\\author{Alice Example \\and Bob Example}\\begin{document}\\maketitle\nWords.\\end{document}')
    expect(tex).toMatch(/\\author\{\\axtwide\{<T\d+>\}\s*\\and\s*\\axtwide\{<T\d+>\}\}/)
    expect(marked('\\documentclass{article}\\author{Alice Example \\And Bob Example}\\begin{document}\\maketitle\nWords.\\end{document}')).not.toMatch(/\\axtwide\{[^}]*\\And/)
  })

  it('nothing is wrapped where nothing is translated: the original compiles as the paper does', () => {
    const p = project(IEEE)
    expect(new TextDecoder().decode(patch(p, new Map(), { mark: markUnits(p.units) }).get('main.tex'))).not.toContain('\\axtwide')
  })
})

describe('an identifier is not prose: a token of word characters joined by underscores is one placeholder, as the paper writes it', () => {
  const doc = (body: string, defs = '') => project(`\\documentclass{article}${defs}\\begin{document}\n${body}\n\\end{document}`)
  const kept = (units: Unit[]) => units.flatMap(u => u.pieces.filter(p => p.t === 'ph').map(p => (p as { src?: string }).src))

  it('its parts joined by \\_ (or \\textunderscore) are one element, never sent (2608.25210v2: llm_equal_human came back with its last part in Chinese)', () => {
    const units = doc('The prompt llm\\_equal\\_human asks whether [sentence\\_1] and the run\\textunderscore id agree.') as unknown as { units: Unit[] }
    const text = units.units.map(textOf).join(' | ')
    expect(text).not.toMatch(/llm|equal|human|sentence|run|\bid\b/)
    expect(text).toContain('The prompt ')
    expect(text).toContain(' asks whether  and the  agree.')
    expect(kept(units.units)).toEqual(['llm\\_equal\\_human', '[sentence\\_1]', 'run\\textunderscore id'])
  })

  it('a table cell or a paragraph of identifiers alone is no unit: nothing of it is prose', () => {
    const units = doc('Words here.\n\n{\\em response\\_equal\\_human}\n\n{\\em response\\_equal\\_llm\\_example}\n') as unknown as { units: Unit[] }
    expect(units.units.map(u => textOf(u).trim())).toEqual(['Words here.'])
  })

  it('the whole token is the identifier, its leading and trailing sentence punctuation aside (the coordinator’s, 2026-11-10)', () => {
    // (2608.06701v1's `CallbackBase.host_label(result)` one identifier; 2608.25210v2 Table 2's response_equal_human_example drawn
    // today with its last part translated; a stop, a comma, a quote or a parenthesis the sentence opened is no part of it, a
    // bracket the token answers is)
    const units = doc('Call CallbackBase.host\\_label(result), then llm\\_equal\\_human. See it (as conv5\\_x) for ``x86\\_64\'\' and [sentence\\_1], e.g.\\ here.') as unknown as { units: Unit[] }
    expect(kept(units.units)).toEqual(['CallbackBase.host\\_label(result)', 'llm\\_equal\\_human', 'conv5\\_x', 'x86\\_64', '[sentence\\_1]', '\\ '])
    expect(units.units.map(textOf).join('|').trim()).toBe('Call , then . See it (as ) for ``\'\' and , e.g.here.')
  })

  it('nothing broader: a camelCase word, an underscore with no word character on one side, a formula’s subscript, a hyphen or a dot stay as they were', () => {
    // (a bare _ is TeX's subscript: 2610.21377v1's formulas the walker read as text, `H_0`, are no identifier)
    const units = doc('Keep camelCase and x \\_ y and \\_\\_init\\_\\_ and $x_1$ and a-b and a.b in the text.') as unknown as { units: Unit[] }
    const text = units.units.map(textOf).join(' | ')
    expect(text).toContain('Keep camelCase and x ')
    expect(text).toContain(' y and ')
    expect(text).toContain('init')
    expect(text).toContain(' and a-b and a.b in the text.')
    expect(kept(units.units)).toEqual(expect.arrayContaining(['\\_', '$x_1$']))
    expect(kept(units.units).some(s => /init|camel/.test(s ?? ''))).toBe(false)
  })

  it('a placeholder is an identifier only as text TeX sets as written: a formula never, its math shift TeX’s', () => {
    // (the layout marks read a placeholder's class by it: `$s_i$`, a formula's subscript, is no identifier, nor `\(s_i\)`)
    for (const src of ['$s_i$', '$E_h$', '\\(s_i\\)', 'a $x_1$']) expect(identifierSource(src)).toBe(false)
    for (const src of ['llm\\_equal\\_human', '[sentence\\_1]', '\\$HOME\\_DIR']) expect(identifierSource(src)).toBe(true)
  })

  it('an e-mail address with an underscore stays one address, not an identifier and a rest', () => {
    const units = doc('Write to first\\_last@example.org or to my\\_box at example.net today.') as unknown as { units: Unit[] }
    expect(kept(units.units)).toEqual(['first\\_last@example.org', 'my\\_box'])
  })

  it('a bare _ the walker leaves in a unit’s text is TeX’s subscript, no identifier (2610.21377v1)', () => {
    // (2610.21377v1's formulas the walker read as text: `H_0`, `e_k` were caught as identifiers when a bare _ read as one)
    const units = doc('Then the space H_0 of functions e_k holds here.') as unknown as { units: Unit[] }
    expect(kept(units.units)).toEqual(['_', '_'])
  })
})

describe('what goes around the translation: tables fitted, notes the class compares, a heading written out', () => {
  const withTables = (tex: string) => loadProject(inMemory(new Map([['main.tex', new TextEncoder().encode(tex)]])), 'main.tex', { tables: true })
  const typeset = (p: ReturnType<typeof withTables>, pick: (u: Unit) => boolean) => {
    const units = p.units as Unit[]
    const translated = new Map(units.filter(pick).map((u, i) => [u, u.pieces.map(x => (x.t === 'text' ? { ...x, tr: true, s: `<T${i}>` } : x))]))
    return new TextDecoder().decode(patch(p, translated as Map<(typeof p.units)[number], unknown[]>).get('main.tex'))
  }
  const TABLES = '\\documentclass{article}\\begin{document}\n\\begin{tabular}{ll}\nFrozen profile & Prompting only \\\\\n\\end{tabular}\n\n\\begin{longtable}{l}\nA long cell \\\\\n\\end{longtable}\n\\end{document}'

  it('a table with a translated cell goes into \\axtfit with its original, a table that breaks across pages does not (2608.06701, RT-1)', () => {
    const tex = typeset(withTables(TABLES), () => true)
    expect(tex).toMatch(/\\axtfit\{\\begin\{tabular\}\{ll\}[\s\S]*<T\d+>[\s\S]*\\end\{tabular\}\}\{\\begin\{tabular\}\{ll\}\nFrozen profile & Prompting only \\\\\n\\end\{tabular\}\}/)
    expect(tex).not.toMatch(/\\axtfit\{\\begin\{longtable\}/)
  })

  it('a tabular* goes into \\axtfit too, its body measured at its natural width by \\axtstar (2608.05876\'s Table 1)', () => {
    const tex = typeset(withTables('\\documentclass{article}\\begin{document}\n\\begin{tabular*}{\\linewidth}{@{}l@{\\extracolsep{\\fill}}r@{}}\nTrain & 105 \\\\\n\\end{tabular*}\n\\end{document}'), () => true)
    expect(tex).toMatch(/\\axtfit\{\\axtstar\\begin\{tabular\*\}\{\\linewidth\}\{@\{\}l@\{\\extracolsep\{\\fill\}\}r@\{\}\}[\s\S]*<T\d+>[\s\S]*\\axtstarbody\\end\{tabular\*\}\}\{\\begin\{tabular\*\}\{\\linewidth\}[\s\S]*Train & 105[\s\S]*\\end\{tabular\*\}\}/)
  })

  it('a tabular* with a position argument is left as it is: \\axtstar reads the width and the columns alone', () => {
    const tex = typeset(withTables('\\documentclass{article}\\begin{document}\n\\begin{tabular*}{\\linewidth}[t]{lr}\nTrain & 105 \\\\\n\\end{tabular*}\n\\end{document}'), () => true)
    expect(tex).not.toContain('\\axtfit')
  })

  it('a table set to a width, or holding \\verb, is not boxed (2608.02991\'s tabularx)', () => {
    const tex = typeset(withTables('\\documentclass{article}\\begin{document}\n\\begin{tabularx}{\\textwidth}{lX}\nFrozen profile & Prompting only \\\\\n\\end{tabularx}\n\n\\begin{tabular}{l}\nThe code \\verb|x| here \\\\\n\\end{tabular}\n\\end{document}'), () => true)
    expect(tex).not.toContain('\\axtfit')
  })

  it('a table nothing of which is translated is left as it is', () => {
    expect(typeset(withTables(TABLES), () => false)).not.toContain('\\axtfit')
  })

  it('an author block\'s notes carry no mark, so a class that sets equal notes once still can (2608.06233)', () => {
    const p = project('\\documentclass{article}\\author{Alice\\thanks{Equal contribution.}\\and Bob\\thanks{Equal contribution.}}\\begin{document}\\maketitle\nWords of the paper.\\end{document}')
    const notes = (p.units as (Unit & { front?: boolean })[]).filter(u => u.kind === 'footnote')
    expect(notes.length).toBe(2)
    expect(notes.every(u => u.front)).toBe(true)
  })

  it('a \\thanks written after \\author{…}, as revtex takes it, carries no mark either (2608.06233)', () => {
    const p = project('\\documentclass{article}\\begin{document}\\author{Alice}\\thanks{Equal contribution.}\\author{Bob}\\thanks{Equal contribution.}\\maketitle\nWords of the paper.\\end{document}')
    const notes = (p.units as (Unit & { front?: boolean })[]).filter(u => u.kind === 'footnote')
    expect(notes.length).toBe(2)
    expect(notes.every(u => u.front)).toBe(true)
  })

  it('a style\'s abstract heading written out goes by \\abstractname (RT-1\'s ICLR style)', () => {
    const sty = '\\renewenvironment{abstract}{\\vskip.075in\\centerline{\\large\\sc Abstract}\\vspace{0.5ex}\\begin{quote}}{\\par\\end{quote}}'
    const out = localizeNames(sty)
    expect(out).toContain('\\centerline{\\large\\sc \\ifdefined\\abstractname\\abstractname\\else Abstract\\fi{}}')
    expect(out).toContain('\\begin{quote}}{\\par\\end{quote}}')
    // elsewhere the word is prose, and stays
    expect(localizeNames('\\section{Abstract ideas}')).toBe('\\section{Abstract ideas}')
  })
})

describe('a translation breaks its lines as its own', () => {
  type P = { t: string; s?: string; src?: string; tr?: boolean }
  const text = (s: string): P => ({ t: 'text', s, tr: true })
  const ph = (src: string): P => ({ t: 'ph', src })
  const joined = (ps: P[]) => ps.map(p => (p.t === 'text' ? p.s : `[${p.src}]`)).join('')

  it('a heading\'s forced break inside a phrase goes: nothing between CJK characters, a space between words (2608.06007)', () => {
    expect(joined(lineBreaks({ kind: 'heading' }, [ph('\\sys'), text('：大型语言模型基础设施中缺失的张量管理'), ph('\\\\'), text('层')]))).toBe('[\\sys]：大型语言模型基础设施中缺失的张量管理层')
    expect(joined(lineBreaks({ kind: 'heading' }, [text('Die fehlende Tensorverwaltungs'), ph('\\\\[0.2cm]'), text('schicht')]))).toBe('Die fehlende Tensorverwaltungs schicht')
  })

  it('one after a colon or a stop, or before a change of size, parts a title from its subtitle and stays', () => {
    expect(joined(lineBreaks({ kind: 'heading' }, [text('弱法向双曲不变环面：'), ph('\\\\'), text(' 持久性与平均原理')]))).toBe('弱法向双曲不变环面：[\\\\] 持久性与平均原理')
    expect(joined(lineBreaks({ kind: 'heading' }, [text('论文标题'), ph('\\\\'), text(' '), ph('\\large'), text('补充材料')]))).toBe('论文标题[\\\\] [\\large]补充材料')
  })

  it('a title is set in lines of about the same length; a heading is not, its text set again in the contents', () => {
    expect(joined(lineBreaks({ kind: 'heading', title: true }, [text('A title')]))).toBe('[\\axtbalance ]A title')
    expect(joined(lineBreaks({ kind: 'heading' }, [text('A heading')]))).toBe('A heading')
  })

  it('a title breaks between CJK words, never inside one (2608.06007: "基" over "础")', () => {
    const set = joined(lineBreaks({ kind: 'heading', title: true }, [text('基础设施中的层')]))
    expect(set).toContain('基[\\nobreak ]础')
    expect(set).toContain('设[\\nobreak ]施')
    expect(set).not.toContain('础[\\nobreak ]设')
  })

  it('a line of names breaks between names, never inside one (2608.06701: a katakana name split over two lines)', () => {
    const set = joined(lineBreaks({ kind: 'author' }, [text('マーティン・ハーゼル、レイハネ・ジャバルヴァンド')]))
    expect(set).toContain('レ[\\nobreak ]イ')
    expect(set).not.toContain('、[\\nobreak ]レ')
    expect(set).not.toContain('axtbalance')
  })

  it('a paragraph keeps its forced breaks; long code and formulas get room to break', () => {
    expect(joined(lineBreaks({ kind: 'paragraph' }, [text('输入：'), ph('\\\\'), text('输出')]))).toBe('输入：[\\\\]输出')
    expect(joined(lineBreaks({ kind: 'paragraph' }, [ph('\\texttt{lib/ansible/plugins/callback/__init\\_\\_.py}')]))).toContain('lib/\\allowbreak{}ansible/\\allowbreak{}')
  })
})

describe('a citation is one placeholder, its notes and keys with it (2610.02069: apacite\'s key sent as prose broke TeX)', () => {
  const body = (b: string) => project(`\\documentclass{article}\\begin{document}\n${b}\n\\end{document}`).units as Unit[]
  const phs = (u: Unit) => u.pieces.filter(p => p.t !== 'text').map(p => (p as { src?: string }).src)

  it('apacite\'s \\cite<…>[…]{…}, 2610.02069\'s Open Research sentence as it stands: the call whole, nothing of it on the wire', () => {
    const cite = '\\cite<>[available at \\url{https://doi.org/10.5281/zenodo.21144536}]{modified_code}'
    const p = project(`\\documentclass{article}\\begin{document}\nThe code to reproduce the work in this paper is archived in a public repository ${cite}.\n\\end{document}`)
    const [u] = p.units as Unit[]
    expect(phs(u as Unit)).toEqual([cite])
    expect(textOf(u as Unit).trim()).toBe('The code to reproduce the work in this paper is archived in a public repository .')
    const { wire } = serialize(u as never)
    expect(wire).toBe('The code to reproduce the work in this paper is archived in a public repository @a#.')
    // written back, translated around it, the call byte for byte
    expect(patched(p)).toContain(`<T0>${cite}<T0>`)
  })

  it('every form the rules know, apacite\'s prenote and biblatex\'s multicite notes among them, one placeholder each; a `<` or a `(` no key follows is the text\'s', () => {
    const forms = [
      // apacite
      '\\cite<e.g.,>[p.~5]{key_one}', '\\citeA<see>{a,b}', '\\citeNP<cf.>[ch.~2]{x_y}', '\\citeauthor<>{k}', '\\fullcite<e.g.,>{k}', '\\shortciteNP<see>{k}', '\\cite<e.g.,>{k}',
      // biblatex's notes for all of a multicite's citations
      '\\cites(see)(and more)[p.~2]{a}{b_c}', '\\parencites(cf.)()[12]{a}[3]{b}',
      // natbib, biblatex, the kernel's
      '\\citep[e.g.,][p.~5]{key_one}', '\\citet[p.~3]{k}', '\\citep*[see][]{k}', '\\citealp{a,b}', '\\citeauthor{k}', '\\citeyear{k}', '\\parencite[see][12]{k}', '\\textcite{k}', '\\autocite[p.~2]{k}', '\\cites[a][b]{k1}[c][d]{k2}', '\\cite{a,b}', '\\Citet{k}',
    ]
    for (const f of forms) expect(body(`Words before ${f} and after.`).map(phs)).toEqual([[f]])
    // a prenote that holds a group, and an angle inside it: the prenote closes outside every group
    expect(body('As \\citeA<{\\em e.g.}, {a>b}>{k} said.').map(phs)).toEqual([['\\citeA<{\\em e.g.}, {a>b}>{k}']])
    // no key after the angle: no prenote, the words around it prose as before
    const plain = body('Shown by \\citet{k} that x <5 trials> in all.')
    expect(plain.map(phs)).toEqual([['\\citet{k}']])
    expect(textOf(plain[0] as Unit)).toContain('<5 trials> in all.')
    expect(body('As \\citeyear <five runs> showed.').map(phs)).toEqual([['\\citeyear']])
    expect(body('Both \\cites{a}{b} (see above) agree.').map(phs)).toEqual([['\\cites{a}{b}']])
    expect(body('As \\textcites (that is) the rest.').map(phs)).toEqual([['\\textcites']])
  })
})

describe('an accent inside a word is the letter itself before translation, and the accent again wherever the source is set (2610.02069: "El Ni ñ#")', () => {
  const doc = (body: string, defs = '') => project(`\\documentclass{article}${defs}\\begin{document}\n${body}\n\\end{document}`)
  /** a unit's words as the engine reads them: the wire, its text pieces' UTF-8 */
  const wire = (p: ReturnType<typeof project>) => (p.units as never[]).map(u => serialize(u).wire)
  const source = (p: ReturnType<typeof project>) => new TextDecoder('latin1').decode(patch(p, new Map()).get('main.tex'))

  it('El Ni{\\~n}o, 2610.02069\'s unit 13 as it stands: one word on the wire, no marker inside it; written back byte for byte', () => {
    const body = 'Processes from days (e.g., convection) to years (e.g., the quasi-biennial oscillation and El Ni{\\~n}o southern oscillations), which act on many timescales.'
    const p = doc(body)
    expect(wire(p)).toEqual(['Processes from days (e.g., convection) to years (e.g., the quasi-biennial oscillation and El Niño southern oscillations), which act on many timescales.'])
    expect((p.units as Unit[])[0]?.pieces.map(x => x.t)).toEqual(['text'])
    expect(source(p)).toContain(body)
    // the marks around a unit that ends in such a letter: the end mark after the accent's own bytes, not inside them
    const end = doc('The work of Poincar\\\'e')
    expect(new TextDecoder('latin1').decode(patch(end, new Map(), { mark: markUnits(end.units) }).get('main.tex'))).toContain("\\leavevmode\\axtmark{0s}The work of Poincar\\'e\\axtend{0e}")
  })

  it('every form of the ten accents, with braces or without, in its word; the translation sets the letter itself', () => {
    const forms: [string, string][] = [
      ['Ni\\~no', 'Niño'], ['Ni\\~{n}o', 'Niño'], ['Ni{\\~n}o', 'Niño'], ['Ni{\\~{n}}o', 'Niño'], ['Poincar\\\'e', 'Poincaré'], ['Poincar\\\' e', 'Poincaré'],
      ['Mart\\\'\\i nez', 'Martínez'], ['Mart\\\'{\\i}nez', 'Martínez'], ['na\\"\\i{}ve', 'naïve'], ['Schr\\"odinger', 'Schrödinger'], ['G\\"{o}del', 'Gödel'],
      ['Fran\\c cois', 'François'], ['Fran\\c{c}ois', 'François'], ['Babu\\v{s}ka', 'Babuška'], ['\\v{C}ech', 'Čech'], ['Erdo\\u{g}an', 'Erdoğan'],
      ['Erd\\H{o}s', 'Erdős'], ['Erd\\H os', 'Erdős'], ['\\.{Z}ywiec', 'Żywiec'], ['\\.Istanbul', 'İstanbul'], ['\\^{W}ales', 'Ŵales'], ['caf\\`a', 'cafà'],
    ]
    for (const [tex, word] of forms) {
      const p = doc(`The work of ${tex} matters.`)
      expect(wire(p)).toEqual([`The work of ${word} matters.`])
      expect(source(p)).toContain(`The work of ${tex} matters.`)
    }
    // translated, the unit's text is the translation's, the letter in it as UTF-8
    const p = doc('The work of Poincar\\\'e matters.')
    const u = (p.units as Unit[])[0] as Unit
    const out = new TextDecoder().decode(patch(p, new Map([[u, [{ t: 'text', tr: true, s: 'Die Arbeit von Poincaré ist wichtig.' }]]]) as never).get('main.tex'))
    expect(out).toContain('Die Arbeit von Poincaré ist wichtig.')
  })

  it('a placeholder still where the letter is none every strategy sets, the accent is none of the ten, or the paper defines the accent anew', () => {
    const kept = [
      // fonts that lack it (Latin Modern: Ḃ; CMU's bold and italic: the cedilla's ņ), no letter at all, another accent
      'B\\.{B}c', 'Ru\\c{n}a', 'Ma\\~{x}o', 'B\\=ar', 'B\\r{a}r', 'Ba\\k{a}r', 'Ba\\d{n}r',
      // not one letter
      'Mo\\\'{}r', 'Mo\\\'{ab}r',
    ]
    for (const tex of kept) expect(wire(doc(`The work of ${tex} matters.`))[0]).toMatch(/@a#/)
    // the paper's own \\H and \\v, a math letter each, defined anew in its preamble; a definition commented out is none
    expect(wire(doc('The space \\H{o} and \\v{s} here.', '\\renewcommand{\\H}{\\mathcal{H}}\\def\\v{\\varphi}'))).toEqual(['The space @a# and @b# here.'])
    expect(wire(doc('The space \\H{o} and \\v{s} here.', '\n% \\def\\v{\\varphi}\n'))).toEqual(['The space ő and š here.'])
  })
})

describe('a letter command is the letter itself in its word: TeX\'s skipped spaces, an empty group and a group around it alone none of the wire (2010.11929v2: "Ł ukasz Kaiser")', () => {
  const doc = (body: string, defs = '') => project(`\\documentclass{article}${defs}\\begin{document}\n${body}\n\\end{document}`)
  const wire = (p: ReturnType<typeof project>) => (p.units as never[]).map(u => serialize(u).wire)
  const source = (p: ReturnType<typeof project>) => new TextDecoder('latin1').decode(patch(p, new Map()).get('main.tex'))

  it('{\\L}ukasz, 2010.11929v2\'s entry as its .bbl writes it: one word on the wire, no marker beside it; written back byte for byte', () => {
    const body = 'Aidan~N Gomez, {\\L}ukasz Kaiser, and Illia Polosukhin. Attention is all you need.'
    const p = doc(body)
    expect(wire(p)).toEqual(['Aidan @a# N Gomez, Łukasz Kaiser, and Illia Polosukhin. Attention is all you need.'])
    expect(source(p)).toContain(body)
  })

  it('every form TeX sets as one word: the group around it, an empty group after it, the spaces after its control word', () => {
    const forms: [string, string][] = [
      ['{\\L}ukasz', 'Łukasz'], ['\\L{}ukasz', 'Łukasz'], ['\\L ukasz', 'Łukasz'], ['\\L\nukasz', 'Łukasz'], ['{\\L{}}ukasz', 'Łukasz'],
      ['Bj\\o rn', 'Bjørn'], ['Bj{\\o}rn', 'Bjørn'], ['Stra\\ss e', 'Straße'], ['Stra{\\ss}e', 'Straße'], ['Ny{\\aa}rd', 'Nyård'],
      ['\\O stergaard', 'Østergaard'], ['{\\AE}lfric', 'Ælfric'], ['C{\\ae}sar', 'Cæsar'], ['{\\OE}uvre', 'Œuvre'], ['man{\\oe}uvre', 'manœuvre'],
      ['{\\AA}ngstr{\\"o}m', 'Ångström'], ['W\\l odek', 'Włodek'],
    ]
    for (const [tex, word] of forms) {
      const p = doc(`The work of ${tex} matters.`)
      expect(wire(p), tex).toEqual([`The work of ${word} matters.`])
      expect(source(p), tex).toContain(`The work of ${tex} matters.`)
      expect((p.units as Unit[])[0]?.pieces.map(x => x.t), tex).toEqual(['text'])
    }
  })

  it('after an empty group a space is TeX\'s again, and a letter at a word\'s end keeps the punctuation after it', () => {
    expect(wire(doc('Die Gro\\ss{} Stadt, ein Gru\\ss.'))).toEqual(['Die Groß Stadt, ein Gruß.'])
    expect(wire(doc('Bj{\\o}rn and S{\\o}ren.'))).toEqual(['Bjørn and Søren.'])
  })

  it('only what TeX sets as one word: a blank line after the letter stays a paragraph\'s end, a star stays text, a space inside a group stays a space', () => {
    // (TeX skips the spaces after the control word but not a blank line, its \par)
    expect(wire(doc('Ein Gru\\ss\n\nNext paragraph here.'))).toEqual(['Ein Gruß', 'Next paragraph here.'])
    // (none of these commands has a starred form: the star is the text's)
    expect(wire(doc('The work of Gro\\ss* matters.'))).toEqual(['The work of Groß* matters.'])
    // (a space after `{` or after an empty group is TeX's: the group is walked as a group, its space kept)
    expect(wire(doc('Die Gro{\\ss{} }Stadt.'))).toEqual(['Die Groß Stadt.'])
    const spaced = doc('The work of { \\L}ukasz matters.')
    expect((spaced.units as Unit[])[0]?.pieces.map(x => x.t)).toEqual(['text', 'open', 'text', 'close', 'text'])
  })

  it('a bibliography entry\'s numbers are kept before its letters join their words: a year between two letters stays a placeholder', () => {
    const p = project('\\documentclass{article}\\begin{document}\nText.\n\\begin{thebibliography}{1}\n\\bibitem{a} S{\\o}ren. 2020. The {\\O}resund study.\n\\end{thebibliography}\n\\end{document}')
    const entry = (p.units as Unit[]).find(u => u.kind === 'reference')
    expect(entry?.pieces.filter(x => x.t === 'ph').map(x => (x as { src?: string }).src)).toContain('2020.')
    expect(serialize(entry as never).wire).toMatch(/^Søren\. @a# The Øresund study\.$/)
  })

  it('a group around the letter spends its pair\'s id, as a group around an accent does: the pairs after it keep theirs', () => {
    const ids = (body: string) => ((doc(body).units as Unit[])[0]?.pieces ?? []).filter(x => x.t === 'open').map(x => (x as unknown as { id: number }).id)
    expect(ids('The work of {\\L}ukasz and \\emph{others} matters.')).toEqual(ids('The work of {L}ukasz and \\emph{others} matters.').slice(1))
  })

  it('a placeholder still where the paper defines the command itself, and for the dotless \\i and \\j, which papers make their own', () => {
    expect(wire(doc('The value \\o{} and \\L{} here.', '\\renewcommand{\\o}{\\omega}\\def\\L{\\mathcal{L}}'))).toEqual(['The value @a# and @b# here.'])
    expect(wire(doc('The index \\i{} and \\j{} here.'))).toEqual(['The index @a# and @b# here.'])
  })

  it('\\ifmmode in a paragraph\'s text is its \\else: REVTeX\'s names, an accent written both ways, one word on the wire (2610.20716v1\'s "Louren ç ç o")', () => {
    const forms: [string, string][] = [
      ['Louren\\ifmmode~\\mbox{\\c{c}}\\else \\c{c}\\fi{}o', 'Lourenço'], ['Abell{\\ifmmode\\acute{a}\\else\\\'{a}\\fi}n', 'Abellán'],
      ['\\ifmmode \\check{S}\\else \\v{S}\\fi{}upi\\ifmmode~\\acute{c}\\else \\\'{c}\\fi{}', 'Šupić'], ['Binicio\\ifmmode~\\breve{g}\\else \\u{g}\\fi{}lu', 'Binicioğlu'],
      ['Kurzy\\ifmmode~\\acute{n}\\else \\\'{n}\\fi{}ski', 'Kurzyński'], ['Ta\\ifmmode~\\check{s}\\else \\v{s}\\fi{}evsk\\\'y', 'Taševský'],
      ['Bj\\ifmmode\\varnothing\\else\\o\\fi rn', 'Bjørn'],
    ]
    for (const [tex, word] of forms) {
      const p = doc(`The work of ${tex} matters.`)
      expect(wire(p), tex).toEqual([`The work of ${word} matters.`])
      expect(source(p), tex).toContain(`The work of ${tex} matters.`)
    }
    // (not under \\unless, which inverts it: read as before, neither branch made a letter of; an \\else whose letter a space
    // follows before \\fi is no one letter alone, and its space stays a space)
    expect(wire(doc('The work of \\unless\\ifmmode first\\else\\L\\fi{} done.'))[0]).toMatch(/first/)
    expect(wire(doc('A caf\\ifmmode x\\else\\\'{e} \\fi next.'))[0]).not.toMatch(/énext/)
    // (a star after \\fi is the text's: the branches end at the terminator's name, and the source is written back as it was)
    const starred = doc('Text \\ifmmode x\\else\\L\\fi* next.')
    expect(wire(starred)).toEqual(['Text Ł* next.'])
    expect(source(starred)).toContain('Text \\ifmmode x\\else\\L\\fi* next.')
    // (an \\else that is no one letter: its first branch is math, no text of TeX's, and only the \\else is walked)
    const w = wire(doc('Text \\ifmmode x^2 squared\\else the square\\fi{} here.'))[0] ?? ''
    expect(w).toContain('the square')
    expect(w).not.toContain('squared')
  })

  it('the layout compile\'s marks: a unit that opens with the letter has its start mark before its group, as the source writes it', () => {
    const p = doc('{\\L}ukasz Kaiser wrote it.')
    const tex = new TextDecoder('latin1').decode(patch(p, new Map(), { mark: markUnits(p.units) }).get('main.tex'))
    expect(tex).toContain('\\leavevmode\\axtmark{0s}{\\L}ukasz Kaiser wrote it.\\axtend{0e}')
  })

  it('and a unit whose commands close a group right before its first word has its start mark before that word, where marks.mjs headEnd ends its head (2608.25210v2\'s `\\underline{\\code{…}}: …`, 2610.21477v1\'s cell, which had none)', () => {
    const marked = (body: string, pre = '') => { const p = doc(body, pre); return new TextDecoder('latin1').decode(patch(p, new Map(), { mark: markUnits(p.units) }).get('main.tex')) }
    const pre = '\\newcommand{\\code}[1]{\\texttt{\\small #1}}\n\\usepackage{xcolor}'
    expect(marked('\\noindent\\underline{\\code{LLM-provenance-prompt}}: the placeholders are here.', pre)).toContain('\\underline{\\code{LLM-provenance-prompt}}\\leavevmode\\axtmark{0s}: the placeholders are here.\\axtend{0e}')
    // (two groups closed, the space after them set before the mark, as after a command passed over)
    expect(marked('\\noindent{\\underline{\\code{Top-k}}} and the rest of it.', pre)).toContain('\\code{Top-k}}} \\leavevmode\\axtmark{0s}and the rest of it.')
    // (a group followed by anything else before the word: no start mark, as before — REVTeX's `\\bibfield {number} {  }` and the
    // entry's fields after it)
    const other = marked('\\noindent\\underline{\\code{x}}\\foo{y} then words follow.', `${pre}\n\\newcommand{\\foo}[1]{#1}`)
    expect(other).not.toContain('axtmark{0s}')
  })
})

describe('a character TeX writes escaped is a character of the text, its source beside it (\\%, \\&, \\#, \\$, \\{, \\}, \\textasciitilde, \\textbar, \\textless, \\textgreater, \\textbackslash)', () => {
  // (a placeholder, it went out as a marker and came back where Microsoft split the term, "R&D" as "D … R&"; as text the
  // translator reads the term, and a reply sets "96%" glued as the paper does: Microsoft's Chinese and Japanese, 2026-11-11)
  const doc = (body: string, defs = '') => project(`\\documentclass{article}${defs}\\begin{document}\n${body}\n\\end{document}`)
  const source = (p: ReturnType<typeof project>) => new TextDecoder('latin1').decode(patch(p, new Map()).get('main.tex'))
  const kept = (p: ReturnType<typeof project>) => (p.units as Unit[]).flatMap(u => u.pieces.filter(x => x.t === 'ph').map(x => (x as { src?: string }).src))

  it('each is its character in its word, no placeholder, and written back byte for byte: TeX skips the spaces after a control word, not after a control symbol', () => {
    const forms: [string, string][] = [
      ['5\\% of', '5% of'], ['R\\&D', 'R&D'], ['Task \\#1', 'Task #1'], ['\\$100', '$100'], ['the set \\{a, b\\}', 'the set {a, b}'],
      ['\\textasciitilde 5', '~5'], ['a\\textbar b', 'a|b'], ['\\textless 5', '<5'], ['\\textgreater{} 5', '> 5'], ['C:\\textbackslash{}x', 'C:\\x'],
      ['5\\%{} of', '5% of'], ['{\\%}', '%'],
    ]
    for (const [tex, word] of forms) {
      const p = doc(`We see ${tex} here.`)
      const u = (p.units as Unit[])[0] as Unit
      expect(u.pieces.map(x => x.t), tex).toEqual(['text'])
      expect(textOf(u).trim(), tex).toBe(`We see ${word} here.`)
      expect(source(p), tex).toContain(`We see ${tex} here.`)
    }
  })

  it('a placeholder still where the paper defines the command itself', () => {
    expect(kept(doc('We see a\\textbar b here.', '\\renewcommand{\\textbar}{\\ensuremath{\\vert}}'))).toEqual(['\\textbar'])
    expect(kept(doc('We see 5\\% here.', '\\renewcommand{\\%}{ percent}'))).toEqual(['\\%'])
  })

  it('\\_ stays with the identifier rule, and an identifier that holds one of them is one placeholder as the paper writes it, as before', () => {
    expect(kept(doc('Set \\$HOME\\_DIR and \\{root\\_question\\} and run\\_id here, at 5\\% of it.'))).toEqual(['\\$HOME\\_DIR', '\\{root\\_question\\}', 'run\\_id'])
  })

  it('a group around one alone spends its pair\'s id, as a group around a letter does: the pairs after it keep theirs', () => {
    const ids = (body: string) => ((doc(body).units as Unit[])[0]?.pieces ?? []).filter(x => x.t === 'open').map(x => (x as unknown as { id: number }).id)
    expect(ids('We see {\\%} and \\emph{others} here.')).toEqual(ids('We see {x} and \\emph{others} here.').slice(1))
  })
})

describe('what a command prints as characters is characters: \\enquote\'s quotation marks (the coordinator\'s ruling of 2026-11-11)', () => {
  const doc = (body: string, pre = '') => project(`\\documentclass{article}${pre}\\begin{document}\n${body}\n\\end{document}`)
  const source = (p: ReturnType<typeof project>) => new TextDecoder('latin1').decode(patch(p, new Map()).get('main.tex'))
  const unitsOf = (p: ReturnType<typeof project>) => p.units as Unit[]
  const bib = (entry: string) => `Text.\n\\begin{thebibliography}{1}\n\\bibitem{a} ${entry}\n\\end{thebibliography}`
  /** a unit's text as UTF-8 (the front end holds a source's text as its UTF-8 bytes in a Latin-1 view) */
  const said = (u: Unit) => new TextDecoder().decode(Uint8Array.from([...textOf(u)].map(c => c.charCodeAt(0))))

  it("a paper's own \\enquote{…} that sets its argument between TeX's quotation marks: the marks text, written back byte for byte (2610.10069v1)", () => {
    const entry = 'A. Allen (2019): \\enquote{Hicksian complementarity,} Econometrica.'
    const p = doc(bib(entry), '\\newcommand{\\enquote}[1]{``#1\'\'}')
    const u = unitsOf(p).find(x => x.kind === 'reference') as Unit
    expect(u.pieces.some(x => x.t === 'open')).toBe(false)
    expect(said(u)).toContain('\u201cHicksian complementarity,\u201d Econometrica.')
    expect(source(p)).toContain(entry)
  })
  it("a .bbl's \\providecommand of it, REVTeX's (2307.16209v1), alike; a definition that sets anything else stays as it was", () => {
    const p = project('\\documentclass{article}\\begin{document}\nText.\n\\begin{thebibliography}{1}\n\\providecommand \\enquote  [1]{``#1\'\'}\n\\bibitem{a} B. Berti, \\enquote {Black holes,} 2020.\n\\end{thebibliography}\n\\end{document}')
    const u = unitsOf(p).find(x => x.kind === 'reference') as Unit
    expect(said(u)).toContain('\u201cBlack holes,\u201d')
    expect(u.pieces.some(x => x.t === 'open')).toBe(false)
    const boxed = doc(bib('C. Chu, \\enquote{A title,} 1989.'), '\\newcommand{\\enquote}[1]{\\textit{#1}}')
    expect((unitsOf(boxed).find(x => x.kind === 'reference') as Unit).pieces.some(x => x.t === 'open')).toBe(true)
  })
  it("csquotes' \\enquote: the outer level's double marks, an \\enquote inside one the inner level's single, \\enquote* from the inner level", () => {
    const p = doc('He said \\enquote{yes \\enquote{no} maybe} and \\enquote*{so} here.', '\\usepackage{csquotes}')
    const u = unitsOf(p)[0] as Unit
    expect(u.pieces.some(x => x.t === 'open')).toBe(false)
    expect(said(u).trim()).toBe('He said \u201cyes \u2018no\u2019 maybe\u201d and \u2018so\u2019 here.')
    expect(source(p)).toContain('He said \\enquote{yes \\enquote{no} maybe} and \\enquote*{so} here.')
  })
  it('csquotes with a style the source alone cannot tell (another style, autostyle): \\enquote stays one placeholder, as before', () => {
    // (its marks are the style's, which the compile's glyphs would tell: not read here)
    for (const pre of ['\\usepackage[style=german]{csquotes}', '\\usepackage[autostyle]{csquotes}']) {
      const u = unitsOf(doc('He said \\enquote{yes} here.', pre))[0] as Unit
      expect(u.pieces.map(x => [x.t, (x as { src?: string }).src]), pre).toContainEqual(['ph', '\\enquote{yes}'])
    }
  })
})

describe("a link with no address is its argument: REVTeX's \\href@noop {} {…} (the coordinator's step D, 2026-11-11)", () => {
  // (the .bbl's head as REVTeX's apsrev4-2 writes it, \\href@noop setting its second argument as it stands; 2610.20030v1's entries)
  const HEAD = '\\makeatletter\n\\providecommand \\enquote  [1]{``#1\'\'}%\n\\providecommand \\href@noop [0]{\\@secondoftwo}%\n\\providecommand \\bibinfo  [0]{\\@secondoftwo}%\n\\providecommand \\bibfield  [0]{\\@secondoftwo}%\n\\makeatother\n'
  const bbl = (entry: string) => `\\documentclass{revtex4-2}\\begin{document}\nText.\n\\begin{thebibliography}{2}%\n${HEAD}\\bibitem [{A}]{a}\\BibitemOpen\n  ${entry}\\BibitemShut {NoStop}%\n\\end{thebibliography}\n\\end{document}`
  const said = (u: Unit) => new TextDecoder().decode(Uint8Array.from([...textOf(u)].map(c => c.charCodeAt(0))))
  const source = (p: ReturnType<typeof project>) => new TextDecoder('latin1').decode(patch(p, new Map()).get('main.tex'))
  it('an entry\'s journal part is its text, its groups as they set it, and nothing to link: a pair that sets its argument alone', () => {
    const entry = '\\bibfield  {author} {\\bibinfo {author} {\\bibfnamefont {D.~M.}\\ \\bibnamefont {Sussman}},\\ }\\href@noop {} {\\bibfield  {journal} {\\bibinfo  {journal} {SoftwareX}\\ }\\textbf {\\bibinfo {volume} {6}},\\ \\bibinfo {pages} {16} (\\bibinfo {year} {2017})}'
    const p = project(bbl(entry))
    const u = (p.units as Unit[]).find(x => x.kind === 'reference') as Unit
    const pieces = u.pieces as { t: string; s?: string; src?: string; sets?: number }[]
    expect(pieces.some(x => x.t === 'ph' && (x.src ?? '').startsWith('\\href@noop'))).toBe(false)
    expect(textOf(u)).toContain('SoftwareX')
    const open = pieces.find(x => x.t === 'open' && (x.src ?? '').startsWith('\\href@noop'))
    expect(open?.src).toBe('\\href@noop {} {')
    expect(open?.sets).toBe(0)
    // (\\textbf around its volume a group of its own still)
    expect(pieces.some(x => x.t === 'open' && x.src === '\\textbf {')).toBe(true)
    expect(source(p)).toContain(entry)
  })
  it('an entry that is a link with no address alone is a unit: 2610.20030v1\'s supplemental note, its quotation marks text', () => {
    const p = project(bbl('\\href@noop {} {\\enquote {\\bibinfo {title} {See {S}upplemental {M}aterial at [url will be inserted by publisher] for {F}igures.}}\\ }'))
    const u = (p.units as Unit[]).find(x => x.kind === 'reference')
    expect(u && said(u).replace(/\s+/g, ' ').trim()).toBe('\u201cSee Supplemental Material at [url will be inserted by publisher] for Figures.\u201d')
  })
})

describe("an identifier or a grouped address read after a piece the front end writes as characters (Codex's review of B8, 2026-11-11)", () => {
  // (keepRead's offsets: one per character it reads; a generated piece's characters are its UTF-8 bytes in a Latin-1 view, three
  // for a quotation mark, and one offset for all of them put every match after it on the wrong pieces, or past the end)
  const doc = (body: string, pre = '') => project(`\\documentclass{article}${pre}\\begin{document}\n${body}\n\\end{document}`)
  const phs = (p: ReturnType<typeof project>) => (p.units as Unit[]).flatMap(u => (u.pieces as { t: string; src?: string }[]).filter(x => x.t === 'ph').map(x => x.src))
  it("csquotes' marks, then an identifier (Codex's own input) and a grouped address", () => {
    expect(phs(doc('Use \\enquote{a phrase} and x\\_y.', '\\usepackage{csquotes}'))).toContain('x\\_y')
    expect(phs(doc('Use \\enquote{a phrase} and write to \\{ab,cd\\}@x.org now.', '\\usepackage{csquotes}'))).toContain('\\{ab,cd\\}@x.org')
  })
  it("a paper's \\enquote's marks (wrapOf), an escaped character, then the same", () => {
    expect(phs(doc('Use \\enquote{a phrase} and x\\_y.', '\\newcommand{\\enquote}[1]{``#1\'\'}'))).toContain('x\\_y')
    expect(phs(doc('At 5\\% of R\\&D, x\\_y and \\{ab,cd\\}@x.org.'))).toEqual(expect.arrayContaining(['x\\_y', '\\{ab,cd\\}@x.org']))
  })
  it("a link with no address's argument (\\href@noop), then the same", () => {
    const p = project('\\documentclass{revtex4-2}\\begin{document}\nText.\n\\begin{thebibliography}{1}%\n\\makeatletter\n\\providecommand \\href@noop [0]{\\@secondoftwo}%\n\\makeatother\n\\bibitem{a} \\href@noop {} {Notes on x\\_y}, write to \\{ab,cd\\}@x.org.\n\\end{thebibliography}\n\\end{document}')
    expect(phs(p)).toEqual(expect.arrayContaining(['x\\_y', '\\{ab,cd\\}@x.org']))
  })
})

describe('a display outside a unit\'s marks (the reader\'s anchors take it from beyond them: 211 of 747 displays were lit with no unit)', () => {
  const body = (b: string) => project(`\\documentclass{article}\\begin{document}\n${b}\n\\end{document}`).units as (Unit & { lead?: string; trail?: string })[]
  const flags = (b: string) => body(b).map(u => [textOf(u).trim().split(' ')[0], typeof u.lead === 'string', typeof u.trail === 'string'])

  it('the hint is the display\'s letters, as the page sets them: the words a command sets, and a subscript run on with its letter (the review of A1, I1)', () => {
    const [u] = body('It holds that\n\\begin{equation} N_{\\text{out}} = \\log x + \\softmax(y) \\end{equation}\n\nNext.')
    for (const w of ['nout', 'log', 'softmax', 'x', 'y']) expect(u?.trail).toContain(w)
    expect(u?.trail).not.toContain('model')
  })

  it('a display between a unit\'s words is its inner one, its letters too (the review of A1, M1: the fill across a page break is for these)', () => {
    const [u, v] = body('It holds that \\[ x_{ij} = y \\] for all i.\n\nPlain words, $z$ inline, no display.')
    expect(u).toMatchObject({ inner: expect.stringContaining('xij') })
    expect(v).not.toHaveProperty('inner')
  })

  it('with the paper\'s own macros put in, and ℓ read as l: \\rma_{kk} sets akk, W^\\ell W sets wlw (2608.08350)', () => {
    const [u] = body('\\def\\rma{{\\mathrm{a}}}\\newcommand{\\E}{\\mathbb{E}}\n\nIt holds that\n\\[ \\E\\,\\rma_{kk} = W^\\ell W \\]\n\nNext.')
    for (const w of ['akk', 'wlw', 'e']) expect(u?.trail).toContain(w)
  })

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

describe('a tabularray table whose cells are math is math (2608.29181: every way of setting it failed)', () => {
  const doc = (pre: string, body: string) => project(`\\documentclass{article}\\usepackage{tabularray}\n${pre}\n\\begin{document}\nBefore the table.\n${body}\nAfter the table.\n\\end{document}`)
  const rows = '\\toprule & \\| \\Phi_{t}(x(t))\\| & h(x_{t}) - h(x^{*}) \\\\\n\\midrule \\delta>1 & \\mathcal{O} \\left(\\frac{1}{t}\\right) & \\text{--} \\\\\n\\bottomrule'
  const around = ['Before the table.', 'After the table.']
  const texts = (p: ReturnType<typeof project>) => (p.units as Unit[]).map(u => textOf(u).trim())

  it('cells = {mode = math}: no unit in it, its source as it stands; the paragraphs around it are units', () => {
    const p = doc('', `\\begin{tblr}{\n  colspec = {Q[c,m] X[c,m] X[c,m]},\n  cells = {\n    mode = math,\n  },\n}\n${rows}\n\\end{tblr}`)
    expect(texts(p)).toEqual(around)
    expect(patched(p)).toContain(`}\n${rows}\n\\end{tblr}`)
  })

  it('math by a column, in a longtblr\'s inner specifications after its outer ones, or in dmath', () => {
    expect(texts(doc('', `\\begin{tblr}{colspec = {Q[c,mode=math] Q[c,mode=math]}}\n x(t) & y(t) \\\\\n\\end{tblr}`))).toEqual(around)
    expect(texts(doc('', `\\begin{longtblr}[caption = {A caption}]{colspec = {cc}, cell{2-Z}{1-Z} = {mode=dmath}}\n x(t) & y(t) \\\\\n\\end{longtblr}`))).toEqual(around)
  })

  it('for every table, by \\SetTblrInner in the preamble, and in a table of the paper\'s own (\\NewTblrEnviron)', () => {
    expect(texts(doc('\\SetTblrInner{cells = {mode = imath}}', `\\begin{tblr}{cc}\n x(t) & y(t) \\\\\n\\end{tblr}`))).toEqual(around)
    expect(texts(doc('\\NewTblrEnviron{mytblr}', `\\begin{mytblr}{colspec = {cc}, cells = {mode = math}}\n x(t) & y(t) \\\\\n\\end{mytblr}`))).toEqual(around)
  })

  it('a table of text is walked as before, and a commented-out math mode is no math mode', () => {
    const p = doc('% \\SetTblrInner{cells = {mode = math}}', '\\begin{tblr}{colspec = {ll}, % cells = {mode = math}\n}\nFrozen profile & Prompting only \\\\\n\\end{tblr}')
    expect(texts(p).join('|')).toContain('Frozen profile')
  })
})

// Where patch writes each unit (spans), for the compile's safety net (plans/2026-10-04-compile-resilience.md, Task 2): a
// failure TeX places on a line is located in the unit written there
describe('patch: where each unit is written', () => {
  const enc = (s: string) => new TextEncoder().encode(s)
  const SRC = '\\documentclass{article}\n\\begin{document}\n\\section{Intro}\nA paragraph with a note.\\footnote{The note itself, in a few words.} And more words after it.\n\nA second paragraph of words.\n\\end{document}\n'
  it('one span per top-level unit, in file order, its bytes the unit as written; a footnote inside its paragraph\'s; the bytes the same with spans and without', () => {
    const p = loadProject(inMemory(new Map([['main.tex', enc(SRC)]])), 'main.tex')
    const units = p.units as (Unit & { nested?: boolean })[]
    const translated = new Map(units.map((u, i) => [u, u.pieces.map(x => (x.t === 'text' ? { ...x, tr: true, s: `<T${i}>` } : x))])) as Map<(typeof p.units)[number], unknown[]>
    const all: { file: string; unit: (typeof p.units)[number]; from: number; to: number; outer?: (typeof p.units)[number] }[] = []
    const out = patch(p, translated, { spans: all })
    expect(out.get('main.tex')).toEqual(patch(p, translated).get('main.tex'))
    const spans = all.filter(x => !x.outer)
    expect(spans.map(x => x.unit)).toEqual(units.filter(u => !u.nested))
    expect(spans.every((x, k) => x.file === 'main.tex' && x.from < x.to && (k === 0 || x.from >= (spans[k - 1] as { to: number }).to))).toBe(true)
    const text = new TextDecoder('latin1').decode(out.get('main.tex'))
    for (const x of spans) expect(text.slice(x.from, x.to)).toContain(`<T${units.indexOf(x.unit as unknown as Unit)}>`)
    const note = units.findIndex(u => u.nested)
    expect(note).toBeGreaterThan(-1)
    expect(spans.some(x => (x.unit as unknown) !== units[note] && text.slice(x.from, x.to).includes(`<T${note}>`))).toBe(true)
    // and the footnote's own span, inside its paragraph's: its bytes the note as written, its paragraph named
    const inner = all.filter(x => x.outer)
    expect(inner.map(x => x.unit)).toEqual([units[note]])
    const outer = spans.find(x => x.unit === inner[0]?.outer) as { from: number; to: number }
    expect(text.slice(inner[0]?.from, inner[0]?.to)).toBe(`<T${note}>`)
    expect([outer.from <= (inner[0]?.from ?? -1), (inner[0]?.to ?? Infinity) <= outer.to]).toEqual([true, true])
  })
})

// What the marked originals insert — a unit's start and end marks, its line probe, the layout's marks — goes only where
// the patch can tell it stands between two of TeX's units: before a command and the arguments TeX reads for it, after a
// whole argument, inside a group (a title's braces). A paper's macro whose body ends in a command reads that command's
// arguments after its own (2106.10165: \axtlines between \strangechapter{$\infty$} and the title \chapter took, a book
// of 471 pages that stopped TeX), and math the walker reads as prose has operands a mark would split (2310.20360:
// \bfm_\leavevmode\axtmark{…}1, "Missing { inserted")
describe('nothing is inserted inside a call or between a subscript and its operand (2106.10165, 2310.20360)', () => {
  const enc = (s: string) => new TextEncoder().encode(s)
  const paperOf = (defs: string, body: string, cls = 'book') => openPaper(new Map([['main.tex', enc(`\\documentclass{${cls}}\n${defs}\n\\begin{document}\n${body}\n\\end{document}\n`)]]))
  const dec = (b: Uint8Array | undefined) => new TextDecoder('latin1').decode(b)
  /** the main file of the marked original as the run makes it: unmarked of the layout (lines), and with its marks */
  const marked = (p: ReturnType<typeof paperOf>) => [dec(originalFiles(p, { lines: true }).get('main.tex')), dec(originalFiles(p, { lines: true, layout: LAYOUT_CLASSES }).get('main.tex'))]
  const units = (p: ReturnType<typeof paperOf>) => (p.units as (Unit & { depth?: number })[]).map(u => [u.kind, textOf(u).trim(), ...(u.depth === undefined ? [] : [u.depth])])
  const BOOK = '\\newcommand{\\strangechapter}[1]{\\renewcommand{\\thechapter}{#1}\\chapter}'
  const CHAPTER = 'Words of the chapter before it.\n\n\\strangechapter{$\\infty$}{The End of Training}\\label{ch:eot}\n\\index{end of training}\n\nThe first paragraph of the last chapter.'

  it('2106.10165\'s \\strangechapter{$\\infty$}{The End of Training}: the group after the call is \\chapter\'s title, a heading, and nothing comes between the call and it', () => {
    const p = paperOf(BOOK, CHAPTER)
    expect(units(p)).toEqual([['para', 'Words of the chapter before it.'], ['heading', 'The End of Training', 0], ['para', 'The first paragraph of the last chapter.']])
    const [u, l] = marked(p)
    expect(u).toContain('\\strangechapter{$\\infty$}{The End of Training}\\label{ch:eot}')
    expect(l).toContain('\\strangechapter{$\\infty$}{\\axthmark{h1s}The End of Training\\axthmark{h1e}}\\label{ch:eot}')
    // the units around it keep their marks and their line probes
    expect(u).toMatch(/\\axtlines\{0\}\s*\\leavevmode\\axtmark\{0s\}Words/)
    expect(u).toMatch(/\\axtlines\{2\}\\leavevmode\\axtmark\{2s\}The first/)
  })

  it('a wrapper with two arguments before the title, with an optional one and the heading\'s own, a starred heading, braces inside the title', () => {
    const p = paperOf([
      '\\newcommand{\\numbered}[2]{\\setcounter{chapter}{#1}\\renewcommand{\\thechapter}{#2}\\chapter}',
      '\\newcommand{\\strangesection}[2][]{\\renewcommand{\\thesection}{#2}\\section}',
      '\\newcommand{\\unnumbered}[1]{\\def\\shortname{#1}\\section*}',
    ].join('\n'), [
      '\\numbered{3}{$\\aleph$}{A Chapter Numbered by Hand}', 'Its first words here.',
      '\\strangesection[short]{A}[Short]{The {Long} Title of It}', 'Words of the section.',
      '\\unnumbered{X}{Notes on the Method}', 'Words of the notes.',
    ].join('\n\n'))
    expect(units(p)).toEqual([['heading', 'A Chapter Numbered by Hand', 0], ['para', 'Its first words here.'], ['heading', 'The Long Title of It', 1], ['para', 'Words of the section.'], ['heading', 'Notes on the Method', 1], ['para', 'Words of the notes.']])
    for (const text of marked(p)) {
      expect(text).toMatch(/\\numbered\{3\}\{\$\\aleph\$\}\{(?:\\axthmark\{h0s\})?A Chapter/)
      expect(text).toMatch(/\\strangesection\[short\]\{A\}\[Short\]\{(?:\\axthmark\{h2s\})?The \{Long\} Title of It(?:\\axthmark\{h2e\})?\}/)
      expect(text).toMatch(/\\unnumbered\{X\}\{(?:\\axthmark\{h4s\})?Notes on the Method/)
    }
  })

  it('in a translation too: the title translated as a heading, the call as it stands before it', () => {
    const p = paperOf(BOOK, CHAPTER)
    const all = p.units as Unit[]
    const out = dec(patch(p.project, new Map(all.map((u, i) => [u, u.pieces.map(x => (x.t === 'text' ? { ...x, tr: true, s: `<T${i}>` } : x))])) as Map<(typeof p.units)[number], unknown[]>).get('main.tex'))
    expect(out).toContain('\\strangechapter{$\\infty$}{<T1>}\\label{ch:eot}')
  })

  it('a unit that begins right after an environment\'s \\begin{…} has its line probe after the space \\begin skips (IEEEtran\'s abstract and keywords, run in after their dash: 2608.19431)', () => {
    const p = paperOf('', '\\begin{abstract}\nThis paper investigates a thing.\n\\end{abstract}\n\n\\begin{IEEEkeywords} Integrated sensing.\n\\end{IEEEkeywords}\n\n\\begin{quote}[x]\n  Quoted words.\n\\end{quote}\n\nA paragraph.\n', 'article')
    expect(units(p).map(u => u[1])).toEqual(['This paper investigates a thing.', 'Integrated sensing.', 'Quoted words.', 'A paragraph.'])
    // (the layout compile's, our base page; the live path's original, marked(p)[0], keeps the probe where it was: the pin)
    for (const text of marked(p).slice(1)) {
      // (LaTeX's \\begin ends in \\ignorespaces: a command of ours before the space stopped it, and the space was set after the dash)
      expect(text).toMatch(/\\begin\{abstract\}\n\\axtlines\{0\}(?:\\leavevmode\\axtmark\{0s\})?This/)
      expect(text).toMatch(/\\begin\{IEEEkeywords\} \\axtlines\{1\}(?:\\leavevmode\\axtmark\{1s\})?Integrated/)
      expect(text).not.toMatch(/\\begin\{(?:abstract|IEEEkeywords)\}\\axtlines/)
      // (a paragraph after a blank line keeps its probe where it begins, as before)
      expect(text).toMatch(/\n\n\\axtlines\{3\}(?:\\leavevmode\\axtmark\{3s\})?A paragraph/)
    }
    expect(marked(p)[0]).toContain('\\begin{abstract}\\axtlines{0}')
  })

  it('a call followed by no argument, or a macro that ends in a command that takes none or one the walk does not know, is read as before', () => {
    const p = paperOf(`${BOOK}\\newcommand{\\bfx}[1]{\\textbf{#1}\\relax}\\newcommand{\\sys}[1]{\\textsc{#1}\\xspace}`, '\\strangechapter{$\\infty$}\n\nA paragraph after it.\n\n\\bfx{Bold} {words after} end, \\sys{Name} {words too} end.')
    expect(units(p)).toEqual([['para', 'A paragraph after it.'], ['para', 'Bold words after end, Name words too end.']])
    expect(marked(p)[0]).toContain('\\strangechapter{$\\infty$}\n\n\\axtlines{0}')
  })

  it('a single token after the call is the argument TeX takes for the command it ends in (\\chapter X, \\chapter\\name): it stays with the call, whether the call\'s own argument was walked apart, kept with it or walked in a pair', () => {
    const p = paperOf([
      BOOK, '\\newcommand{\\Title}{The Title}', '\\newcommand{\\plain}[1]{\\setcounter{chapter}{#1}\\chapter}',
      '\\newcommand{\\lead}[1]{\\textbf{#1}\\footnote}', '\\newcommand{\\sys}[1]{\\textsc{#1}\\xspace}',
    ].join('\n'), [
      'Before it.', '\\strangechapter{7}X title body words here.', '\\strangechapter{$\\infty$}\\Title more words here.',
      '\\plain{3}Y and the words of it.', 'We use \\lead{Name}Z words after it, and \\sys{Name} words too.',
    ].join('\n\n'))
    expect(units(p)).toEqual([['para', 'Before it.'], ['para', 'title body words here.'], ['para', 'more words here.'], ['para', 'and the words of it.'], ['para', 'We use Name words after it, and Name words too.']])
    for (const text of marked(p)) {
      for (const call of ['\\strangechapter{7}X', '\\strangechapter{$\\infty$}\\Title', '\\plain{3}Y', '\\lead{Name}Z', '\\sys{Name} words']) expect(text).toContain(call)
      // (the layout compile's head point, \\axthpk, stands before the whole call: none of ours between the call and the token it takes)
      expect(text.replace(/\\axthpk\{[^{}]*\}/g, '')).toContain('\\axtlines{3}\\plain{3}Y')
    }
    expect(marked(p)[1]).toContain('\\axthpk{p3.0a}\\plain{3}Y')
  })

  it('a macro whose last command is an operand of the one before it, which TeX does not run (\\string\\section, \\let\\saved\\section), is read as before', () => {
    const p = paperOf([
      '\\newcommand{\\showname}[1]{#1\\string\\section}', '\\newcommand{\\keep}[1]{#1\\let\\saved\\section}',
      '\\newcommand{\\keepto}[1]{#1\\global\\let\\saved = \\chapter}', '\\newcommand{\\alias}[1]{#1\\renewcommand\\saved\\section}',
      '\\newcommand{\\reset}[1]{#1\\let\\saved\\relax\\section}',
    ].join('\n'), 'Before \\showname{x} {grouped prose} and \\keep{y} {more of it} and \\keepto{z} {the rest}, \\alias{v} {its words} end.\n\n\\reset{Words}{A Section}')
    expect(units(p)).toEqual([['para', 'Before x grouped prose and y more of it and z the rest, v its words end.'], ['para', 'Words'], ['heading', 'A Section', 1]])
  })

  it('an environment of the paper\'s own that sets a display is math, the paragraph around it one unit (2310.20360\'s eqsplit)', () => {
    const p = paperOf([
      '\\newcommand{\\bfm}{\\mathbf{m}}',
      '\\newenvironment{eqsplit}{\\equation\\aligned%\n}{\\endaligned\\endequation%\n}',
      '\\NewDocumentEnvironment{disp}{O{}}{\\[}{\\]}',
      '\\newenvironment{eqn}[1]{\\begin{equation}\\label{#1}}{\\end{equation}}',
    ].join('\n'), [
      'It holds that\n\\begin{eqsplit}\n  \\lvert \\bfm_1 - x \\rvert\n&= \\bfm_1 - x\n\\\\ \\text{and}\\qquad \\Theta_t = x^\\alpha + \\mathbf{x}_{ij}\n\\end{eqsplit}\nwhich ends the proof.',
      'Then \\begin{disp}[a] y_1 = x^\\alpha \\end{disp} and \\begin{eqn}{e} z_t = 1 \\end{eqn} close it.',
    ].join('\n\n'))
    expect(units(p)).toEqual([['para', 'It holds that\n\nwhich ends the proof.'], ['para', 'Then  and  close it.']])
    const [u] = marked(p)
    expect(u).toContain('\\begin{eqsplit}\n  \\lvert \\bfm_1 - x \\rvert\n&= \\bfm_1 - x\n\\\\ \\text{and}\\qquad \\Theta_t = x^\\alpha + \\mathbf{x}_{ij}\n\\end{eqsplit}')
  })

  it('…not one whose begin code closes the display it sets, or opens none (\\\\[2pt] is a line break), nor one defined again as text; \\provideenvironment changes none', () => {
    const p = paperOf([
      '\\usepackage{amsmath}',
      '\\newenvironment{between}{\\begin{equation}a=b\\end{equation}}{\\begin{equation}c=d\\end{equation}}',
      '\\newenvironment{steps}{\\begin{quote}\\\\[2pt]}{\\[x\\]\\end{quote}}',
      '\\newenvironment{foo}{\\[}{\\]}\\renewenvironment{foo}{\\begin{quote}}{\\end{quote}}',
      '\\newenvironment{dd}{\\[}{\\]}\\provideenvironment{dd}{\\begin{quote}}{\\end{quote}}',
    ].join('\n'), '\\begin{between}Words between the two.\\end{between}\n\n\\begin{steps}Words of the steps.\\end{steps}\n\n\\begin{foo}Words of the quote.\\end{foo}\n\nThen \\begin{dd} y_1 = x^2 \\end{dd} ends it.')
    expect(units(p)).toEqual([['para', 'Words between the two.'], ['para', 'Words of the steps.'], ['para', 'Words of the quote.'], ['para', 'Then  ends it.']])
  })

  it('math the walker cannot tell (an environment by \\let): its unit holds a subscript, and nothing is inserted in it — \\bfm_1, x^\\alpha, \\mathbf{x}_{ij}, \\Theta_t', () => {
    const body = '\\begin{myeq}\n\\bfm_1 - x = x^\\alpha + \\mathbf{x}_{ij} + \\Theta_t\n\\end{myeq}'
    const p = paperOf('\\newcommand{\\bfm}{\\mathbf{m}}\\let\\myeq\\equation\\let\\endmyeq\\endequation', `A paragraph of prose.\n\n${body}\n\nAnother paragraph of prose.`)
    // the walker reads the display as prose (a unit of its own)…
    expect(units(p).map(x => x[1])).toEqual(['A paragraph of prose.', '1 - x = x + ij + t', 'Another paragraph of prose.'])
    expect(markUnits(p.units)((p.units as unknown[])[1] as (typeof p.units)[number])).toBeNull()
    for (const text of marked(p)) {
      // …and writes it back as it stands, nothing after an `_` or a `^`; the prose around it is marked
      expect(text).toContain(`\n\n${body}\n\n`)
      expect(text).not.toMatch(/[_^]\s*(?:\\leavevmode|\\axt)/)
      expect(text).toMatch(/\\axtmark\{0s\}A paragraph/)
      expect(text).toMatch(/\\axtmark\{2s\}Another paragraph/)
    }
  })
})
