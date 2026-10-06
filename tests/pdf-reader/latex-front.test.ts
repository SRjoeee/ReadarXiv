import { describe, expect, it } from 'vitest'
import { inMemory, lineBreaks, loadProject, localizeNames, markUnits, patch } from '@/pdf-reader/engine/latex-front.mjs'
import { serialize } from '@/pdf-reader/engine/mt.mjs'

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
    expect(authors(p)).toEqual(['Alice', 'Somewhere'])
  })

  it('IEEEtran\'s blocks and acmart\'s parts of an affiliation are names and places; an address, a mark, a key stay', () => {
    const ieee = project('\\documentclass{article}\\begin{document}\\author{\\IEEEauthorblockN{Alice Smith\\IEEEauthorrefmark{1}}\\IEEEauthorblockA{Peking University\\\\ \\texttt{alice@pku.edu.cn}}}\\maketitle\nWords.\\end{document}')
    expect(authors(ieee).join('|')).toMatch(/^Alice Smith.*Peking University$/)
    expect(authors(ieee).join('|')).not.toMatch(/alice@/)
    const acm = project('\\documentclass{article}\\begin{document}\\author{Alice}\\affiliation{\\institution{Peking University}\\city{Beijing}\\country{China}}\\email{alice@pku.edu.cn}\\maketitle\nWords.\\end{document}')
    expect(authors(acm).join('|')).toMatch(/Alice\|Peking University.*Beijing.*China/)
    // elsarticle's keys and values: keys an engine would translate
    const els = project('\\documentclass{article}\\begin{document}\\author{Alice}\\affiliation{organization={Peking University}, city={Beijing}}\\maketitle\nWords.\\end{document}')
    expect(authors(els)).toEqual(['Alice'])
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

  it('a line that holds \\and is left as it is: article ends a table there, which cannot be set inside a box (2608.21180)', () => {
    const tex = marked('\\documentclass{article}\\author{Alice Example \\and Bob Example}\\begin{document}\\maketitle\nWords.\\end{document}')
    expect(tex).not.toContain('\\axtwide')
    expect(marked('\\documentclass{article}\\author{Alice Example \\And Bob Example}\\begin{document}\\maketitle\nWords.\\end{document}')).not.toContain('\\axtwide')
  })

  it('nothing is wrapped where nothing is translated: the original compiles as the paper does', () => {
    const p = project(IEEE)
    expect(new TextDecoder().decode(patch(p, new Map(), { mark: markUnits(p.units) }).get('main.tex'))).not.toContain('\\axtwide')
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

describe('a cell\'s row commands stay where the row has them (1512.03385 into es, 1810.04805 into es and fr: "Misplaced \\noalign")', () => {
  type Piece = { t: string; s?: string; src?: string; tr?: boolean }
  type Cell = { kind: string; pieces: Piece[]; rowLead?: string[]; rowTrail?: string[] }
  const tables = (tex: string) => loadProject(inMemory(new Map([['main.tex', new TextEncoder().encode(tex)]])), 'main.tex', { tables: true })
  const doc = (body: string, preamble = '') => `\\documentclass{article}${preamble}\\begin{document}\n${body}\n\\end{document}\n`
  const cellOf = (p: ReturnType<typeof tables>, word: string) => (p.units as unknown as Cell[]).find(u => u.kind === 'cell' && u.pieces.some(x => x.t === 'text' && x.s?.includes(word))) as Cell
  /** the cell translated as an engine that moved its placeholders sent it back: its words first, then every placeholder */
  const moved = (u: Cell, words: string) => [{ t: 'text', tr: true, s: `${words} ` }, ...u.pieces.filter(x => x.t === 'ph'), { t: 'text', s: ' ' }]
  const written = (p: ReturnType<typeof tables>, translated: Map<Cell, Piece[]>) => new TextDecoder().decode(patch(p, translated as unknown as Map<(typeof p.units)[number], unknown[]>).get('main.tex'))
  const TABLE = doc('\\begin{tabular}{ll}\n\\hline\nlayer name & output size \\\\\n\\toprule\n\\rowcolor{gray}\nSystem & Score \\\\\n\\end{tabular}', '\\usepackage{booktabs,colortbl}')

  it('a cell keeps the rules its row begins with, apart from its pieces: what the engine is sent, and the records are matched by, is as before', () => {
    const p = tables(TABLE)
    const first = cellOf(p, 'layer name'), second = cellOf(p, 'System')
    expect(first.rowLead).toEqual(['\\hline'])
    expect(second.rowLead).toEqual(['\\toprule', '\\rowcolor{gray}'])
    expect(first.pieces.filter(x => x.t === 'ph').map(x => x.src)).toEqual(['\\hline'])
    expect(cellOf(p, 'output size').rowLead).toBeUndefined()
  })

  it('a translation that moved them after its words is written with them first, in the source\'s order, before every word', () => {
    const p = tables(TABLE)
    const first = cellOf(p, 'layer name'), second = cellOf(p, 'System')
    const tex = written(p, new Map([[first, moved(first, 'Nombre de la capa')], [second, moved(second, 'Sistema')]]))
    expect(tex).toContain('\\hline Nombre de la capa')
    expect(tex).toMatch(/\\toprule\\rowcolor\{gray\} Sistema/)
    expect(tex).not.toMatch(/capa\s*\\hline|Sistema\s*\\toprule/)
  })

  it('a translation that has them in place is written byte for byte as before', () => {
    const p = tables(TABLE)
    const first = cellOf(p, 'layer name')
    const inPlace = first.pieces.map(x => (x.t === 'text' && /\S/.test(x.s ?? '') ? { ...x, tr: true, s: (x.s ?? '').replace('layer name', 'Nombre de la capa') } : x))
    expect(written(p, new Map([[first, inPlace]]))).toContain('\\hline\nNombre de la capa & output size')
  })

  it('the paper\'s own rule, a macro that begins with \\noalign, is one (a paper\'s \\thickhline or \\shline)', () => {
    const p = tables(doc('\\begin{tabular}{l}\n\\thickhline\nA cell of words \\\\\n\\end{tabular}', '\\newcommand{\\thickhline}{\\noalign{\\hrule height 1pt}}'))
    const cell = cellOf(p, 'A cell')
    expect(cell.rowLead).toEqual(['\\thickhline'])
    expect(written(p, new Map([[cell, moved(cell, 'Una celda')]]))).toContain('\\thickhline Una celda')
  })

  it('a row\'s own end at a cell\'s end stays last, and a cell\'s other placeholders stay the engine\'s', () => {
    const p = tables(doc('\\begin{tabular}{l}\n\\textbf{A} cell of words \\tabularnewline\n\\end{tabular}'))
    const cell = cellOf(p, 'cell of words')
    expect(cell.rowTrail).toEqual(['\\tabularnewline'])
    const tex = written(p, new Map([[cell, [{ t: 'ph', src: '\\tabularnewline' }, { t: 'text', tr: true, s: 'Una celda ' }, ...cell.pieces.filter(x => x.t === 'open' || x.t === 'close')]]]))
    expect(tex).toMatch(/Una celda \\textbf\{\}\s*\\tabularnewline/)
  })
})
