import { describe, expect, it } from 'vitest'
import { inMemory, loadProject, patch } from '@/pdf-reader/engine/source/latex-front.mjs'
import { plainSource, serialize } from '@/pdf-reader/engine/translate/mt.mjs'

// The source reader's text of 2026-10-24 (S1-S4 of the pin regression's root-cause pass): what the translator is sent is
// what TeX sets, never other words. A paper macro that sets words of its own is expanded, not taken for a wrapper (S1); a
// file that is not UTF-8 is read in its declared input encoding (S2); an accent's letter is decoded once (S3, a check: the
// regression's "J\u00c3\u00a9r\u00c3\u00b4me" was a report printing the units' raw bytes); one branch of a conditional is
// the translator's, never both (S4)

type Piece = { t: string; s?: string; src?: string; tr?: boolean }
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
  it('\\ifdefined of a command the paper defines: the live branch alone, the other left in the source (2610.21098)', () => {
    const p = project(`\\def\\Preprint{1}\n${doc(BRANCHES)}`)
    expect(texts(p)).toEqual(['The public code is at the repository. It contains the generator.'])
    expect(new TextDecoder().decode(untranslated(p))).toContain(BRANCHES)
  })

  it('of one it does not define: neither branch is text, the conditional one placeholder, counted (`ifUnknown`)', () => {
    const p = project(doc(BRANCHES))
    expect(texts(p)).toEqual(['It contains the generator.'])
    expect((p as unknown as { skipped: Record<string, number> }).skipped).toMatchObject({ ifUnknown: 1 })
    expect(new TextDecoder().decode(untranslated(p))).toContain(BRANCHES)
  })

  it('\\ifx\\x\\undefined, a \\newif set once, \\iftrue and \\if 0: the branch TeX sets', () => {
    const pre = '\\newcommand{\\Final}{}\n\\newif\\iflong\\longtrue'
    const body = ['\\ifx\\Final\\undefined Draft words here. \\else Final words here. \\fi', '\\iflong Long words here. \\else Short words here. \\fi', '\\iftrue True words here. \\else False words here. \\fi'].join('\n\n')
    expect(texts(project(doc(body, pre)))).toEqual(['Final words here.', 'Long words here.', 'True words here.'])
    expect(texts(project(doc('Kept words.\n\n\\if 0\nA passage set aside.\n\n\\fi\nMore kept words.')))).toEqual(['Kept words.', 'More kept words.'])
  })

  it('a definition TeX has not read when the body begins decides nothing: a file nothing reads, or one later in the body', () => {
    const body = '\\ifdefined\\Flag Draft branch words. \\else Final branch words. \\fi'
    const unused = projectOf({ 'main.tex': enc(doc(body)), 'unused.tex': enc('\\def\\Flag{1}\n') })
    expect(texts(unused)).toEqual([])
    expect(texts(project(doc(`${body}\n\n\\def\\Flag{1}\nMore words here.`)))).toEqual(['More words here.'])
    // (one the preamble reads: the input file's definition is TeX's before the body)
    expect(texts(projectOf({ 'main.tex': enc(doc(body, '\\input{flags}')), 'flags.tex': enc('\\def\\Flag{1}\n') }))).toEqual(['Draft branch words.'])
  })

  it('a conditional whose branches set no words is left as it was read: its pieces, and its units\' hashes, as before', () => {
    const p = project(doc('We release it at \\ifdefined\\X\\url{a}\\else\\url{b}\\fi today.'))
    expect(units(p)[0]!.pieces.filter(x => x.t === 'ph').map(x => x.src)).toEqual(['\\ifdefined', '\\X', '\\url{a}', '\\else', '\\url{b}', '\\fi'])
  })
})
