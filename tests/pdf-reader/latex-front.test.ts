import { describe, expect, it } from 'vitest'
import { inMemory, lineBreaks, loadProject, localizeNames, patch } from '@/pdf-reader/engine/latex-front.mjs'

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

  it('a paragraph keeps its forced breaks; long code and formulas get room to break', () => {
    expect(joined(lineBreaks({ kind: 'paragraph' }, [text('输入：'), ph('\\\\'), text('输出')]))).toBe('输入：[\\\\]输出')
    expect(joined(lineBreaks({ kind: 'paragraph' }, [ph('\\texttt{lib/ansible/plugins/callback/__init\\_\\_.py}')]))).toContain('lib/\\allowbreak{}ansible/\\allowbreak{}')
  })
})
