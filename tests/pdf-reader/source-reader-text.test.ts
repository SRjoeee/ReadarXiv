import { describe, expect, it } from 'vitest'
import { inMemory, loadProject, patch, walkStepCount } from '@/pdf-reader/engine/source/latex-front.mjs'
import { plainSource, serialize } from '@/pdf-reader/engine/translate/mt.mjs'

// The source reader's text of 2026-10-24 (S1-S4 of the pin regression's root-cause pass): what the translator is sent is
// what TeX sets, never other words. A paper macro that sets words of its own is expanded, not taken for a wrapper (S1); a
// file that is not UTF-8 is read in its declared input encoding (S2); an accent's letter is decoded once (S3, a check: the
// regression's "J\u00c3\u00a9r\u00c3\u00b4me" was a report printing the units' raw bytes); one branch of a conditional is
// the translator's, never both (S4)

type Piece = { t: string; s?: string; src?: string; tr?: boolean; id?: number }
type Unit = { kind: string; file: string; start: number; end: number; pieces: Piece[] }
const enc = (s: string) => new TextEncoder().encode(s)
/** a string of byte values as the bytes themselves (a Latin-1 file's) */
const bytes = (s: string) => Uint8Array.from(s, c => c.charCodeAt(0))
const projectOf = (files: Record<string, Uint8Array>) => loadProject(inMemory(new Map(Object.entries(files))), 'main.tex', { tables: true })
const project = (tex: string) => projectOf({ 'main.tex': enc(tex) })
const units = (p: ReturnType<typeof projectOf>) => p.units as unknown as Unit[]
/** each unit as the translator reads it: its text, decoded (mt.mjs plainSource) */
const texts = (p: ReturnType<typeof projectOf>) => units(p).map(u => plainSource(u as never))
const doc = (body: string, pre = '') => `\\documentclass{article}\n${pre}\n\\begin{document}\n${body}\n\\end{document}\n`
/** the main file written back with no unit translated */
const untranslated = (p: ReturnType<typeof projectOf>) => patch(p, new Map()).get('main.tex')

describe('S1: a paper macro that sets words of its own is its expansion, never a wrapper of its argument', () => {
  it('\\newcommand{\\nb}[1]{Notebook~#1}: the call is "Notebook 4", one text with the call as its source (2610.21547)', () => {
    const p = project(doc('The federated notebooks (\\nb{4}--\\nb{6}) evaluate the global accuracy.', '\\newcommand{\\nb}[1]{Notebook~#1}'))
    expect(texts(p)).toEqual(['The federated notebooks (Notebook 4--Notebook 6) evaluate the global accuracy.'])
    // the source as it stands wherever the unit is not translated
    expect(new TextDecoder().decode(untranslated(p))).toContain('(\\nb{4}--\\nb{6})')
    expect(units(p)[0]!.pieces.every(x => x.t === 'text')).toBe(true)
  })

  it('a body of more than text around its words is one placeholder: its argument is not sent as though it were all', () => {
    const p = project(doc('A remark \\todo{fix this} stays in the sentence.', '\\newcommand{\\todo}[1]{TODO: \\textbf{#1}}'))
    expect(texts(p)).toEqual(['A remark stays in the sentence.'])
    expect(units(p)[0]!.pieces.filter(x => x.t === 'ph').map(x => x.src)).toEqual(['\\todo{fix this}'])
  })

  it('a wrapper stays a pair around its argument: \\textbf{#1}, \\textcolor{red}{#1}, a box\'s [c][14.5pt] and a colour\'s gray!8 are no words', () => {
    const pre = '\\newcommand{\\key}[1]{\\textbf{#1}}\n\\newcommand{\\red}[1]{\\textcolor{red}{#1}}\n\\newcommand{\\lab}[1]{\\parbox[c][14.5pt][c]{2cm}{#1}}'
    const p = project(doc('The \\key{main} result and the \\red{second} one and \\lab{third} words.', pre))
    expect(texts(p)).toEqual(['The main result and the second one and third words.'])
    expect(units(p)[0]!.pieces.filter(x => x.t === 'open').map(x => x.src)).toEqual(['\\key{', '\\red{', '\\lab{'])
  })
})

describe('S1 under review (#457, Codex): an address, a formula, a Latin-1 macros file', () => {
  it('an expansion holding an address is one placeholder: the untranslated file is its own bytes', () => {
    const tex = doc('Please use \\contact{a@b.com} today.', '\\newcommand{\\contact}[1]{Email #1}')
    const p = project(tex)
    expect(new TextDecoder().decode(untranslated(p))).toBe(tex)
    expect(units(p)[0]!.pieces.filter(x => x.t === 'ph').map(x => x.src)).toEqual(['\\contact{a@b.com}'])
  })

  it('a formula\'s letters are no words of the macro (\\(xy\\)): it stays the pair around its argument', () => {
    const p = project(doc('The \\tagged{important result} follows.', '\\newcommand{\\tagged}[1]{#1 \\(xy\\)}'))
    expect(texts(p)).toEqual(['The important result follows.'])
  })

  it('the body is read in the encoding of the file that defines it, the argument in the caller\'s', () => {
    const p = projectOf({
      'main.tex': enc(doc('The \\nb{4} is open.', '\\usepackage[latin1]{inputenc}\n\\input{macros}')),
      'macros.tex': bytes('\\newcommand{\\nb}[1]{Caf\xe9~#1}\n'),
    })
    expect(texts(p)).toEqual(['The Caf\u00e9 4 is open.'])
  })
})

describe('S1 under review, round 5: a macro inside its own expansion never takes the reader down', () => {
  it('a recursive call in a branch TeX never takes: the paper loads, the call one placeholder', () => {
    const p = project(doc('An \\example{important result} here.', '\\newcommand{\\example}[1]{Word #1\\ifnum0=1\\relax\\example{}\\fi.}'))
    expect(units(p)[0]!.pieces.filter(x => x.t === 'ph').map(x => x.src)).toEqual(['\\example{important result}'])
  })
  it('mutual recursion, \\a calling \\b calling \\a: the paper loads, the call one placeholder', () => {
    const pre = '\\newcommand{\\aa}[1]{Alpha #1 \\bb{x}}\n\\newcommand{\\bb}[1]{Beta #1 \\aa{y}}'
    const p = project(doc('Some \\aa{words} here.', pre))
    expect(units(p)[0]!.pieces.filter(x => x.t === 'ph').map(x => x.src)).toEqual(['\\aa{words}'])
  })
})

describe('S2: a file that is not UTF-8 is read in the encoding it declares, latin1 where it declares none', () => {
  const LATIN1 = '\\documentclass{article}\n\\usepackage[latin1]{inputenc}\n\\begin{document}\nUniversit\xe9 Gustave Eiffel and Meeks-P\xe9rez-Ros wrote it.\n\\end{document}\n'
  it('\\usepackage[latin1]{inputenc}: each byte its Latin-1 letter, none a U+FFFD (2610.20581); the file written back is its own bytes', () => {
    const p = projectOf({ 'main.tex': bytes(LATIN1) })
    expect(texts(p)).toEqual(['Universit\u00e9 Gustave Eiffel and Meeks-P\u00e9rez-Ros wrote it.'])
    expect(serialize(units(p)[0] as never).wire).not.toContain('\ufffd')
    // (the file is transcoded where it is written, as since #435: its letters UTF-8 under its own inputenc option)
    expect(new TextDecoder().decode(untranslated(p))).toContain('Universit\u00e9 Gustave')
  })

  it('cp1252: Windows\' quotes and dashes; undeclared and not UTF-8: latin1, as pdfTeX reads a byte', () => {
    const cp = projectOf({ 'main.tex': bytes('\\documentclass{article}\n\\usepackage[cp1252]{inputenc}\n\\begin{document}\nA \x93quoted\x94 word \x96 and caf\xe9 here.\n\\end{document}\n') })
    expect(texts(cp)).toEqual(['A \u201cquoted\u201d word \u2013 and caf\u00e9 here.'])
    const bare = projectOf({ 'main.tex': bytes(doc('The na\xefve caf\xe9 is open.')) })
    expect(texts(bare)).toEqual(['The na\u00efve caf\u00e9 is open.'])
    expect(untranslated(bare)).toEqual(bytes(doc('The na\xefve caf\xe9 is open.')))
  })

  it('a UTF-8 file is UTF-8 whatever it declares: never decoded twice', () => {
    const p = projectOf({ 'main.tex': enc(doc('Universit\u00e9 Gustave Eiffel is here.', '\\usepackage[latin1]{inputenc}')) })
    expect(texts(p)).toEqual(['Universit\u00e9 Gustave Eiffel is here.'])
  })
})

describe('S3: an accent command is its Unicode letter, decoded once (2610.20595, 2610.19274, 2610.19282)', () => {
  it.each([
    ['\\\'{a} in a word', 'J. Fern\\\'{a}ndez-Rossier and F\\\'{i}sica wrote it.', 'J. Fern\u00e1ndez-Rossier and F\u00edsica wrote it.'],
    ['\\\'e and \\^o bare', 'J\\\'er\\^ome Gilles received an M.S. degree.', 'J\u00e9r\u00f4me Gilles received an M.S. degree.'],
    ['literal UTF-8', 'We acknowledge Jo\u00e3o Henriques for discussions.', 'We acknowledge Jo\u00e3o Henriques for discussions.'],
    ['\\v, \\c and \\\'\\i', 'Anca R\\v{a}dulescu of Timi\\c{s}oara and Mar\\\'{\\i}a.', 'Anca R\u01cedulescu of Timi\u015foara and Mar\u00eda.'],
  ])('%s', (_, body, want) => {
    const p = project(doc(body))
    expect(texts(p)).toEqual([want])
    const wire = serialize(units(p)[0] as never).wire
    expect(wire).toContain(want.split(' ').find(w => /[^ -~]/.test(w)))
    expect(wire).not.toMatch(/\u00c3|\ufffd/)
  })
})

describe('S4: one branch of a conditional is the translator\'s, never both', () => {
  const BRANCHES = '\\ifdefined\\Preprint\nThe public code is at the repository.\n\\else\nAn anonymized copy is provided at the link.\n\\fi\nIt contains the generator.'
  it('\\ifdefined, whatever the paper defines: neither branch is text, the conditional one placeholder, counted (2610.21098)', () => {
    for (const tex of [`\\def\\Preprint{1}\n${doc(BRANCHES)}`, doc(BRANCHES)]) {
      const p = project(tex)
      expect(texts(p)).toEqual(['It contains the generator.'])
      expect((p as unknown as { skipped: Record<string, number> }).skipped).toMatchObject({ ifUnknown: 1 })
      expect(new TextDecoder().decode(untranslated(p))).toBe(tex)
    }
  })

  it('what the paper\'s definitions decide is not worked out (#457 review: a file nothing reads, a group, a \\let in the body): neither branch', () => {
    const body = '\\ifdefined\\Flag Draft branch words. \\else Final branch words. \\fi'
    for (const tex of [`{\\def\\Flag{1}}\n${doc(body)}`, `\\def\\Flag{1}\n${doc(`\\let\\Flag\\undefined${body}`)}`, `\\def\\Flag{1}\n${doc(body)}`]) expect(texts(project(tex))).toEqual([])
    expect(texts(projectOf({ 'main.tex': enc(doc(body)), 'unused.tex': enc('\\def\\Flag{1}\n') }))).toEqual([])
    expect(texts(project(doc('\\newif\\iflong\\longtrue\n\\iflong Long words here. \\else Short words here. \\fi')))).toEqual([])
  })

  it('a test its own text decides: \\iftrue, \\if 0, \\ifx of two characters: the branch TeX sets', () => {
    const body = ['\\iftrue True words here. \\else False words here. \\fi', '\\ifx aa Same words here. \\else Other words here. \\fi'].join('\n\n')
    expect(texts(project(doc(body)))).toEqual(['True words here.', 'Same words here.'])
    expect(texts(project(doc('Kept words.\n\n\\if 0\nA passage set aside.\n\n\\fi\nMore kept words.')))).toEqual(['Kept words.', 'More kept words.'])
  })

  it('a span TeX reads otherwise than as tokens (\\verb, a definition, a verbatim environment): neither branch is text, the file written back its own bytes (#457 review)', () => {
    for (const body of ['\\iftrue Visible \\verb|\\else| example words.\\else Hidden branch words.\\fi', '\\iftrue Visible words \\def\\unused{\\else} here.\\else Hidden branch words.\\fi', '\\iftrue Visible words here.\n\\begin{verbatim}\n\\else\n\\end{verbatim}\nMore visible words.\\else Hidden branch words.\\fi']) {
      const tex = doc(`Before words.\n\n${body}\n\nAfter words.`), p = project(tex)
      expect(new TextDecoder().decode(untranslated(p))).toBe(tex)
      expect(texts(p).join(' ')).not.toMatch(/Hidden/)
      expect(texts(p)).toContain('After words.')
    }
  })

  it('\\unless before a test: not taken, neither branch is text (#457 review)', () => {
    const tex = doc('Before words.\n\n\\unless\\iftrue Hidden branch words. \\else Visible branch words. \\fi\n\nAfter words.')
    const p = project(tex)
    expect(texts(p).join(' ')).not.toMatch(/Hidden|Visible/)
    expect(new TextDecoder().decode(untranslated(p))).toBe(tex)
  })

  it('a conditional whose branches set no words is one placeholder, counted: what TeX sets for it is its ink (2610.21098v1\'s abstract)', () => {
    const tex = doc('We release it at \\ifdefined\\X\\url{a}\\else\\url{b}\\fi today.'), p = project(tex)
    // (as its parts, every one after the paper's command had no mark, and neither URL's ink was known: the abstract stayed English)
    expect(units(p)[0]!.pieces.filter(x => x.t === 'ph').map(x => x.src)).toEqual(['\\ifdefined\\X\\url{a}\\else\\url{b}\\fi'])
    expect((p as unknown as { skipped: Record<string, number> }).skipped).toMatchObject({ ifUnknown: 1 })
    expect(new TextDecoder().decode(untranslated(p))).toBe(tex)
  })

  it('…ending where its \\fi\'s placeholder ended, its pairs\' ids spent as when its parts were read: every pair after it keeps its id', () => {
    // (as its parts: `\\textbf{` 1 and `\\textit{` 2 inside it, `\\fi{}` one placeholder, and the `\\textbf{` after it 3)
    const p = project(doc('A \\ifdefined\\X\\textbf{a}\\else\\textit{b}\\fi{} and \\textbf{bold} here.'))
    expect(units(p)[0]!.pieces.filter(x => x.t !== 'text').map(x => [x.t, x.src, x.id])).toEqual([['ph', '\\ifdefined\\X\\textbf{a}\\else\\textit{b}\\fi{}', undefined], ['open', '\\textbf{', 3], ['close', '}', 3]])
  })

  it('…but one branch of words, or one that is not inline (a block, an environment\'s end, a display), has its pieces as it had', () => {
    const phs = (body: string) => units(project(doc(body))).flatMap(u => u.pieces.filter(x => x.t === 'ph').map(x => x.src))
    expect(phs('We release it at \\ifdefined\\X the public link\\else\\url{b}\\fi today.')).toEqual(['\\ifdefined', '\\X', '\\else', '\\url{b}', '\\fi'])
    expect(phs('We release it at \\ifdefined\\X\\[x\\]\\else\\url{b}\\fi today.')).toContain('\\fi')
    expect(phs('Words here \\ifdefined\\X\\url{a}\n\n\\url{b}\\fi more words.')).toContain('\\fi')
  })
})

// A branch holds words, and is inline, as the walk itself reads it: a dry run of the walk over each branch (latex-front.mjs
// probeConditional), never a second reading beside it. Each case below is one the review of #594 found where a reading beside
// the walk differed from it; each is read as next read it before the rule, its parts kept, byte for byte (076269f44's units)
describe('S4: a conditional\'s branches as the walk reads them, in a dry run (review of #594)', () => {
  const read = (p: ReturnType<typeof projectOf>) => units(p).map(u => ({ file: u.file, inner: (u as { inner?: string }).inner, pieces: u.pieces.map(x => x.s ?? x.src) }))
  const nest = (n: number, core: string) => `${'\\mbox{'.repeat(n)}${core}${'}'.repeat(n)}`

  it('a link\'s label is a word the walk sets (\\href{url}{label}, its text argument by the role table)', () => {
    expect(read(project(doc('We release it at \\ifdefined\\X\\href{https://a.example/x}{the public repository}\\else\\url{b}\\fi today.')))).toEqual([
      { file: 'main.tex', inner: undefined, pieces: ['\nWe release it at ', '\\ifdefined', '\\X', '\\href{https://a.example/x}{', 'the public repository', '}', '\\else', '\\url{b}', '\\fi', ' today.\n'] },
    ])
  })

  it('a display the paper writes by a shorthand (\\be … \\ee, ctx.envMacros) is read as a display: its parts, and the unit\'s display metadata', () => {
    const pre = '\\newcommand{\\be}{\\begin{equation}}\n\\newcommand{\\ee}{\\end{equation}}'
    expect(read(project(doc('Words here \\ifdefined\\X\\be x=1\\ee\\else\\be x=2\\ee\\fi more words.', pre)))).toEqual([
      { file: 'main.tex', inner: 'equationxequation begin end equationxequation begin end', pieces: ['\nWords here ', '\\ifdefined', '\\X', '\\be x=1\\ee', '\\else', '\\be x=2\\ee', '\\fi', ' more words.\n'] },
    ])
  })

  it('a file it includes (\\input, \\include, \\subfile, \\import) is visited by the inclusion\'s handler: its prose its units', () => {
    for (const call of ['\\input{content}', '\\include{content}', '\\subfile{content}', '\\import{./}{content}']) {
      const p = projectOf({ 'main.tex': enc(doc(`Words before. \\ifdefined\\X${call}\\fi`)), 'content.tex': enc('The file holds a paragraph of prose words.\n') })
      expect(read(p), call).toEqual([
        { file: 'main.tex', inner: undefined, pieces: ['\nWords before. ', '\\ifdefined', '\\X'] },
        { file: 'content.tex', inner: undefined, pieces: ['The file holds a paragraph of prose words.\n'] },
      ])
    }
  })

  it('a paper macro whose expansion is prose (\\newcommand{\\nb}[1]{Notebook~#1}) sets its words: "Notebook 4" stays text', () => {
    expect(read(project(doc('Some words \\ifdefined\\X\\nb{4}\\fi more words.', '\\newcommand{\\nb}[1]{Notebook~#1}')))).toEqual([
      { file: 'main.tex', inner: undefined, pieces: ['\nSome words ', '\\ifdefined', '\\X', 'Notebook 4', '\\fi', ' more words.\n'] },
    ])
  })

  it('a command inside math is no prose: $$x=\\hbox{first}$$ in both branches is two displays, the conditional\'s parts and the unit\'s display metadata kept', () => {
    expect(read(project(doc('Some words \\ifdefined\\X $$x=\\hbox{first}$$\\else $$x=\\hbox{second}$$\\fi more words.')))).toEqual([
      { file: 'main.tex', inner: 'xfirst hbox xsecond hbox', pieces: ['\nSome words ', '\\ifdefined', '\\X', ' ', '$$x=\\hbox{first}$$', '\\else', ' ', '$$x=\\hbox{second}$$', '\\fi', ' more words.\n'] },
    ])
  })

  it('18 nested \\mbox{…} around 1 are read once each: the walk\'s steps grow with the nesting by the same count per level, its parts kept', () => {
    const body = (n: number) => doc(`Some words \\ifdefined\\X ${nest(n, '1')}\\else other words\\fi more words.`)
    expect(read(project(body(18)))).toEqual([
      { file: 'main.tex', inner: undefined, pieces: ['\nSome words ', '\\ifdefined', '\\X', ' ', ...Array(18).fill('\\mbox{'), '1', ...Array(18).fill('}'), '\\else', ' other words', '\\fi', ' more words.\n'] },
    ])
    // (the branch of no word read to its end, as one of no word is, each level of the nest the same number of steps more: linear,
    // where the reading beside the walk read each argument again for every command around it)
    const steps = (tex: string) => { const n = walkStepCount(); project(tex); return walkStepCount() - n }
    for (const tail of ['\\else other words', '\\else\\url{b}']) {
      const at = (n: number) => steps(doc(`Some words \\ifdefined\\X ${nest(n, '1')}${tail}\\fi more words.`))
      const [a, b, c] = [at(9), at(18), at(36)]
      expect(c - b, tail).toBe(2 * (b - a))
    }
  })

  it('a word the walk joins from an accent\'s letters and the text between them (\\\'{e}t\\\'{e}, "été") is a word: its parts kept', () => {
    expect(read(project(doc("Some words \\ifdefined\\X \\'{e}t\\'{e} \\fi more words.")))).toEqual([
      { file: 'main.tex', inner: undefined, pieces: ['\nSome words ', '\\ifdefined', '\\X', ' Ã©tÃ© ', '\\fi', ' more words.\n'] },
    ])
  })

  it('a call of the paper\'s macro of no argument in one read whole is counted all the same: the macro\'s prose stays a unit of its own (storedBodies)', () => {
    const p = project(doc('Words before \\ifdefined\\X\\notice\\fi more words.', '\\newcommand{\\notice}{This notice has several important words.}'))
    expect(units(p).map(u => [u.pieces.map(x => x.s ?? x.src), (u as { stored?: boolean }).stored])).toEqual([
      [['\nWords before ', '\\ifdefined\\X\\notice\\fi', ' more words.\n'], undefined],
      [['This notice has several important words.'], true],
    ])
  })

  it('a conditional inside a conditional is read once, however deep it stands: the walk\'s steps grow by the same count per level', () => {
    const steps = (tex: string) => { const n = walkStepCount(); project(tex); return walkStepCount() - n }
    for (const core of ['\\url{b}', '$$x$$']) {
      const at = (n: number) => steps(doc(`Some words ${'\\ifdefined\\X '.repeat(n)}${core}${'\\fi '.repeat(n)}more words.`))
      const [a, b, c] = [at(9), at(18), at(36)]
      expect(c - b, core).toBe(2 * (b - a))
    }
    // (and read as next read it: a display inside keeps every part)
    expect(read(project(doc('Some words \\ifdefined\\X \\ifdefined\\X $$x$$\\fi \\fi more words.')))[0]!.pieces).toEqual(['\nSome words ', '\\ifdefined', '\\X', ' ', '\\ifdefined', '\\X', ' ', '$$x$$', '\\fi', ' ', '\\fi', ' more words.\n'])
  })
})
