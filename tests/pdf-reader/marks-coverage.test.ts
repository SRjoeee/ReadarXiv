import { describe, expect, it } from 'vitest'
import type { SourceUnit } from '@/pdf-reader/engine/source/latex-front.mjs'
import { completeMacros, frontMarks, inMemory, loadProject } from '@/pdf-reader/engine/source/latex-front.mjs'
import { bblProvides, openPaper, probeFiles } from '@/pdf-reader/engine/pipeline/live.mjs'
import { AHEAD_PROBE_MAX, aheadKey, aheadSamples, carriedText, completeCall, completeCalled, ENTRY_INK_MAX, ENTRY_SHARED_MAX, entryShape, followsOf, INK_MAX, inkSamples, inkShared, layoutMarking, leadSamples, MARK_CLASSES, markProbeTex, probeSamples, readInkAnswers, readInkApart, readInkProbe, readInkTexts, readMarkProbe, shareInk, symbolText } from '@/pdf-reader/engine/layout/marks.mjs'
import { boundsFromMarks, tokenizeDocument, uprightToken } from '@/pdf-reader/engine/pipeline/anchors.mjs'

// The layout marks a placeholder gets where what stands beside it was guessed at: the paper's own macro taken to look ahead
// (LOOKS_AHEAD: no closing mark on it, no mark at all on the piece after it), a macro glued to the word before taken for that
// word's letters (WORD_END), a unit whose start mark stands at no word (boundsFromMarks). Each guess is now read from what the
// paper says: a macro's definition (its arity, whether its body reads on) with TeX's answer for what follows a call of it (the
// mark probe), TeX's own box for a macro (whether it begins with a node apart from a word), the words on the mark's own line
// (the release-route sweep's 217 unanchored rows: 2610.21098, 2610.21547, 2610.21376, 2610.21201). Whether a mark so placed
// moves the page is checked under TeX by marks-invariant.test.ts

type Piece = { t: string; s?: string; src?: string }
const text = (s: string): Piece => ({ t: 'text', s })
const ph = (src: string): Piece => ({ t: 'ph', src })
const unit = (pieces: Piece[]): SourceUnit => ({ kind: 'para', file: 'main.tex', start: 0, end: 0, pieces }) as SourceUnit
/** the marks layoutMarking writes round each placeholder of a unit, by its source: 'ab' both, 'a' the opening alone, '' none */
const marksOf = (u: SourceUnit, o: Parameters<typeof layoutMarking>[2]) => {
  const { units } = layoutMarking([u], MARK_CLASSES, o)
  const out: Record<string, string> = {}
  const pieces = (units[0]?.pieces ?? []) as Piece[]
  pieces.forEach((p, j) => {
    if (p.t !== 'ph' || /^\\axt/.test(p.src ?? '')) return
    const before = pieces[j - 1]?.src ?? '', after = pieces[j + 1]?.src ?? ''
    out[p.src ?? ''] = `${/^\\axtpm[am]\{/.test(before) ? 'a' : ''}${/^\\axtpm\{/.test(after) ? 'b' : ''}`
  })
  return out
}
const defs = (tex: string) => completeMacros([{ file: 'main.tex', text: tex }])
/** TeX's answers: every mark safe before each follower (0), for the commands given */
const all = (...cmds: string[]) => Object.fromEntries(cmds.map(c => [c, '00000000']))

describe('completeMacros: the paper\'s macros that read nothing past their own arguments, from their definitions', () => {
  it('each definition form, its arity', () => {
    expect(defs([
      "\\newcommand{\\dprime}{$d'$}", '\\newcommand\\HarnessLimitShare{91.5}', '\\renewcommand{\\cls}[1]{\\textsc{#1}}', '\\providecommand{\\pv}{x}',
      '\\DeclareRobustCommand{\\rb}{y}', '\\newcommand*{\\st}[2]{#1 and #2.}', '\\def\\pair#1#2{(#1,#2)}', '\\gdef\\g{z}',
      '\\NewDocumentCommand{\\nd}{m m}{(#1)}', '\\NewDocumentCommand\\ndp{+m}{[#1]}',
    ].join('\n'))).toEqual([['HarnessLimitShare', 0], ['cls', 1], ['dprime', 0], ['g', 0], ['nd', 2], ['ndp', 1], ['pair', 2], ['pv', 0], ['rb', 0], ['st', 2]])
  })
  it('none that may read on: an optional first argument, a look ahead or a command at its body\'s end, an argument spec with more than mandatory ones', () => {
    expect(defs([
      '\\newcommand{\\opt}[2][x]{#1#2}', '\\newcommand\\bert{BERT\\xspace}', '\\newcommand\\nx{\\@ifnextchar[{a}{b}}', '\\newcommand\\st{\\@ifstar{a}{b}}',
      '\\newcommand\\fl{\\futurelet\\next\\x}', '\\newcommand\\bf{\\textbf}', '\\NewDocumentCommand{\\ndo}{o m}{#2}', '\\NewDocumentCommand{\\nds}{s m}{#2}',
    ].join('\n'))).toEqual([])
  })
  it('none whose body ends in an argument (\\pair[2]{#1#2}: its last may be \\bert = BERT\\xspace), defines a command, or names an argument past its arity (a definition inside another\'s)', () => {
    expect(defs([
      '\\newcommand\\pair[2]{#1#2}', '\\NewDocumentCommand\\ndp{+m}{x #1}', '\\newcommand\\setx[1]{\\renewcommand\\s{#1}}', '\\newcommand\\gl{\\global\\let\\a\\b}',
      '\\newcommand\\sl[1]{\\setlength{\\parskip}{#1}x}', '\\def\\q{\\def\\r{1}}',
    ].join('\n'))).toEqual([])
  })
  it('none that sets more than a piece of a line: an environment, a paragraph\'s end, an alignment\'s row or cell (jnsao.cls\'s \\and)', () => {
    expect(defs([
      '\\def\\and{\\end{tabular}\\hskip1em\\begin{tabular}[t]{c}}', '\\newcommand\\br{a\\\\b}', '\\newcommand\\cell{x & y}', '\\newcommand\\pp{a\\par b}',
      '\\newcommand\\it{\\item x}', '\\newcommand\\rd{R\\&D}', '\\newcommand\\pb{\\parbox{1cm}{x}}',
    ].join('\n'))).toEqual([['pb', 0], ['rd', 0]])
  })
  it('none whose \\def has white space after a parameter, which TeX takes for a delimiter (\\def\\foo#1 #2: the first argument runs to a space)', () => {
    expect(defs(['\\def\\foo#1 #2{(#1,#2)}', '\\gdef\\zdoit#1 {#1}', '\\def\\nl#1\n  {#1}', '\\def\\ok #1#2{(#1,#2)}'].join('\n'))).toEqual([['ok', 2]])
    // (and so a call of one gets no closing mark that TeX would read into its argument: \\foo{one}{two} {three})
    const p = loadProject(inMemory(new Map([['main.tex', new TextEncoder().encode('\\documentclass{article}\\def\\foo#1 #2{(#1,#2)}\\begin{document}\nA \\foo{one}{two} {three} here.\n\\end{document}\n')]])), 'main.tex')
    expect(p.complete).toEqual([])
    const marked = marksOf(p.units[0] as SourceUnit, { lines: false, complete: completeCalled(p.units, p.complete), switches: all('\\foo') })
    expect(Object.entries(marked).filter(([src]) => src.startsWith('\\foo')).map(([, m]) => m)).toEqual(['a'])
  })
  it('none defined in another way too, nor twice with two arities, nor by a delimited \\def, nor in a comment', () => {
    expect(defs(['\\newcommand\\lt{x}', '\\let\\lt\\relax', '\\newcommand\\two{x}', '\\renewcommand\\two[1]{#1}', '\\def\\dl#1.{#1}', '% \\newcommand\\cm{x}', '\\newcommand\\same{a}', '\\renewcommand\\same{b}'].join('\n'))).toEqual([['same', 0]])
  })
  it('the project gives them, of every file of the package (2610.21098\'s data macros, in a .sty of its own)', () => {
    const files = new Map([
      ['main.tex', new TextEncoder().encode('\\documentclass{article}\\usepackage{data}\\begin{document}\nThe share is \\HarnessLimitShare{} of all.\n\\end{document}\n')],
      ['data.sty', new TextEncoder().encode('\\newcommand{\\HarnessLimitShare}{91.5}\n')],
    ])
    expect(loadProject(inMemory(files), 'main.tex').complete).toEqual([['HarnessLimitShare', 0]])
  })
})

describe('completeCall: a call that holds every argument its macro takes', () => {
  const C = new Map([['dprime', 0], ['cls', 1], ['pair', 2]])
  it('its arguments, each a group or one token, and nothing after them', () => {
    expect(['\\dprime', '\\dprime{}', '\\dprime ', '\\cls{abc}', '\\cls x', '\\pair{a}{b}', '\\pair ab', '\\pair{a} {b}', '\\pair\\alpha{b}'].map(s => completeCall(ph(s), C))).toEqual(Array(9).fill(true))
  })
  it('not one short of them, one past them, another macro, or none known', () => {
    expect(['\\cls', '\\pair{a}', '\\cls{a}{b}', '\\dprime{x}', '\\other{a}', '\\clsx{a}'].map(s => completeCall(ph(s), C))).toEqual(Array(6).fill(false))
    expect(completeCall(ph('\\dprime{}'), null)).toBe(false)
    expect(completeCall(text('\\dprime'), C)).toBe(false)
  })
})

describe('the mark probe asks about the complete macros\' calls, apart from the asked classes\' commands', () => {
  it('each complete macro once, by its first call that holds its arguments, after the citations and references', () => {
    const u = unit([ph('\\cls'), text(' a '), ph('\\cls{x}'), text(' b '), ph('\\cite{a}'), text(' c '), ph('\\cls{y}'), ph('\\other{z}')])
    expect(probeSamples([u], [['cls', 1]])).toEqual([{ command: '\\cite', src: '\\cite{a}', call: false }, { command: '\\cls', src: '\\cls{x}', call: false, own: true }])
    expect(probeSamples([u])).toEqual([{ command: '\\cite', src: '\\cite{a}', call: false }])
    // (a call too long for the probe is asked about by none: the marking takes it to look ahead)
    expect(probeSamples([unit([ph(`\\cls{${'x'.repeat(200)}}`)])], [['cls', 1]])).toEqual([])
  })
  it('last, after every other section, numbered on from the asked commands: a call of one runs what its body does, which may stop TeX', () => {
    const u = unit([ph('\\cite{a}'), text(' and '), ph('\\cls{x}')])
    const tex = markProbeTex(probeSamples([u], [['cls', 1]]), ['\\cls{x}'])
    const at = (row: string) => tex.indexOf(row)
    expect(at('LAYOUT-PROBE 1 punct-at 0 0 a')).toBeGreaterThan(-1)
    expect(at('LAYOUT-PROBE 1 ink-at 0')).toBeGreaterThan(at('LAYOUT-PROBE 1 punct-at 0 0 a'))
    expect(at('LAYOUT-PROBE 1 lineskip')).toBeGreaterThan(at('LAYOUT-PROBE 1 ink-at 0'))
    expect(at('LAYOUT-PROBE 1 punct-at 1 0 a')).toBeGreaterThan(at('LAYOUT-PROBE 1 lineskip'))
    expect(tex).toContain('\\axtpma{q1a}\\cls{x}\\axtpm{q1b}')
    // (and a paper with none of its own asks as before)
    expect(markProbeTex(probeSamples([u]), ['\\cls{x}'])).toBe(markProbeTex([{ src: '\\cite{a}', call: false }], ['\\cls{x}']))
    expect(markProbeTex(probeSamples([u]), ['\\cls{x}'])).not.toContain('punct-at 1 ')
  })
})

describe('layoutMarking with the complete macros: a call TeX answered for gets the marks TeX said move nothing', () => {
  // (2610.21098 u15: \HarnessLimitShare{} = 91.5, then a citation after it)
  const u = unit([text('The limit is '), ph('\\HarnessLimitShare{}'), text(' '), ph('\\cite{a}'), text(' of all, and '), ph('\\cls{word}'), text('. Then '), ph('\\ref{b}'), text('.')])
  it('without them: no closing mark on the macro, no mark on the piece after it', () => {
    expect(marksOf(u, { lines: false })).toEqual({ '\\HarnessLimitShare{}': 'a', '\\cite{a}': '', '\\cls{word}': 'a', '\\ref{b}': 'ab' })
  })
  it('with them and TeX\'s answer for each: its closing mark, and the piece after it, past white space, its two', () => {
    expect(marksOf(u, { lines: false, complete: { HarnessLimitShare: 0, cls: 1 }, switches: all('\\HarnessLimitShare', '\\cls', '\\cite', '\\ref') })).toEqual({ '\\HarnessLimitShare{}': 'ab', '\\cite{a}': 'ab', '\\cls{word}': 'ab', '\\ref{b}': 'ab' })
  })
  it('as TeX answered: a closing mark it said moves what follows is none (cite\'s superscripts, a kern after the last letter), and a call it did not answer for looks ahead', () => {
    // (\cls: a mark before the full stop moves it, '1')
    expect(marksOf(u, { lines: false, complete: { HarnessLimitShare: 0, cls: 1 }, switches: { ...all('\\HarnessLimitShare', '\\cite', '\\ref'), '\\cls': '10000000' } })).toEqual({ '\\HarnessLimitShare{}': 'ab', '\\cite{a}': 'ab', '\\cls{word}': 'a', '\\ref{b}': 'ab' })
    // (\cls answered '1' before a word too: the piece after it past white space keeps none of its marks)
    const v = unit([text('A '), ph('\\cls{x}'), text(' '), ph('\\cite{a}'), text('.')])
    expect(marksOf(v, { lines: false, complete: { cls: 1 }, switches: { ...all('\\cite'), '\\cls': '00000010' } })).toEqual({ '\\cls{x}': 'a', '\\cite{a}': '' })
    // (\cls answered '2', no mark, before a word — a call ending in a control word is, TeX skipping the space after it — keeps
    // its opening mark as any macro of the paper's, and the piece after it none)
    expect(marksOf(v, { lines: false, complete: { cls: 1 }, switches: { ...all('\\cite'), '\\cls': '00000020' } })).toEqual({ '\\cls{x}': 'a', '\\cite{a}': '' })
    // (\cls not answered for: as any macro, its opening mark alone, and none on the piece after it)
    expect(marksOf(v, { lines: false, complete: { cls: 1 }, switches: all('\\cite') })).toEqual({ '\\cls{x}': 'a', '\\cite{a}': '' })
    // (no probe at all: as before)
    expect(marksOf(v, { lines: false, complete: { cls: 1 } })).toEqual({ '\\cls{x}': 'a', '\\cite{a}': '' })
  })
  it('no closing mark before a letter or a digit (\\tf{}s: the word\'s hyphenation) or right against the next piece, which keeps none', () => {
    const v = unit([text('Our '), ph('\\tf{}'), text('s and '), ph('\\tf{}'), ph('\\cite{a}'), text(' more '), ph('\\tf{}'), text('2.')])
    expect(marksOf(v, { lines: false, complete: { tf: 0 }, switches: all('\\tf', '\\cite') })).toEqual({ '\\tf{}': 'a', '\\cite{a}': '' })
  })
  it('a call short of its arguments looks ahead still; a call ending in a control word gets no closing mark, nor the piece past its white space any (TeX skips the spaces after it)', () => {
    const v = unit([text('A '), ph('\\cls'), ph('\\cite{a}'), text(' B '), ph('\\dprime'), text(' '), ph('\\ref{b}'), text('.')])
    expect(marksOf(v, { lines: false, complete: { cls: 1, dprime: 0 }, switches: all('\\cls', '\\dprime', '\\cite', '\\ref') })).toEqual({ '\\cls': 'a', '\\cite{a}': '', '\\dprime': 'a', '\\ref{b}': '' })
  })
  it('TeX\'s answer is its probed call\'s: a call with other arguments, or one short of them, has its opening mark alone', () => {
    // (\\fmt{x}{x}. probed; \\fmt{x}{V}. ends in another glyph, which mathptmx kerns with the full stop)
    const v = unit([text('A '), ph('\\fmt{x}{x}'), text('. B '), ph('\\fmt{x}{V}'), text('. C '), ph('\\fmt{x}{x}'), text('.')])
    expect(marksOf(v, { lines: false, complete: { fmt: 2 }, switches: all('\\fmt') })).toEqual({ '\\fmt{x}{x}': 'ab', '\\fmt{x}{V}': 'a' })
    // (a call of no arguments is its probed call whatever braces it has: \\dprime and \\dprime{} set the same)
    const z = unit([text('A '), ph('\\dprime'), text(' and '), ph('\\dprime{}'), text('.')])
    expect(marksOf(z, { lines: false, complete: { dprime: 0 }, switches: all('\\dprime') })).toEqual({ '\\dprime': 'a', '\\dprime{}': 'ab' })
    // (a call short of its arguments keeps its opening mark though the probed call was answered '2', no mark)
    const w = unit([text('A '), ph('\\foo{x}'), text(' and '), ph('\\foo'), text('.')])
    expect(marksOf(w, { lines: false, complete: { foo: 1 }, switches: { '\\foo': '22222222' } })).toEqual({ '\\foo{x}': 'a', '\\foo': 'a' })
  })
  it('completeCalled: the complete macros the units call, by name', () => {
    expect(completeCalled([u], [['HarnessLimitShare', 0], ['cls', 1], ['unused', 2]])).toEqual({ HarnessLimitShare: 0, cls: 1 })
    expect(completeCalled([u], undefined)).toBeNull()
  })
})

describe('the glue rule: a macro glued to the word before is part of it, unless TeX\'s box for it begins with a node apart from it', () => {
  // (2610.21547: "0.58\pp", \pp = \,pp; 2610.21924: "Zhou\textsuperscript{1}", whose box begins with a formula)
  const u = unit([text('a gap of 0.58'), ph('\\pp'), text(' then '), ph('$x$'), text(' by Zhou'), ph('\\textsuperscript{1}'), text(' and Giessenbachstra'), ph('\\foo'), text('e.')])
  it('without TeX\'s answer, as before: no mark on either', () => {
    expect(marksOf(u, { lines: false })).toMatchObject({ '\\pp': '', '\\textsuperscript{1}': '', '\\foo': '' })
  })
  it('with it: the one whose box begins with a kern is marked; one that begins with a character, a box or a formula stays the word\'s', () => {
    // (its opening mark: no macro of the paper's that reads nothing past its arguments, so no closing one)
    expect(marksOf(u, { lines: false, apart: ['\\pp'] })).toMatchObject({ '\\pp': 'a', '\\textsuperscript{1}': '', '\\foo': '' })
  })
  it('readInkApart: the samples whose box TeX listed in full and began with glue, a kern, a penalty or a whatsit', () => {
    const row = (tag: string, i: number) => `LAYOUT-PROBE 1 ${tag} ${i}`
    const box = (first: string) => ['> \\box0=', '\\hbox(6.83+0.0)x20.0', first, '.\\OT1/cmr/m/n/10 p', '', '! OK.']
    const log = [
      row('ink-at', 0), ...box('.\\kern1.66667'), row('ink-end', 0),
      row('ink-at', 1), ...box('.\\mathon'), row('ink-end', 1),
      row('ink-at', 2), ...box('.\\OT1/cmr/m/n/10 a'), row('ink-end', 2),
      row('ink-at', 3), ...box('.\\pdfcolorstack 0 push {1 0 0 rg 1 0 0 RG}'), row('ink-end', 3),
      row('ink-at', 4), '! Undefined control sequence.', ...box('.\\kern1.0'), row('ink-end', 4),
      row('ink-at', 5), ...box('..\\kern1.0'), row('ink-end', 5),
      row('ink-at', 6), ...box('.\\hbox(6.0+0.0)x5.0'), row('ink-end', 6),
      row('ink-at', 7), ...box('.\\rule(1.0+0.0)x1.0'), row('ink-end', 7),
      row('ink-at', 8), ...box('.\\glue 3.33'), row('ink-end', 8),
    ].join('\n')
    // (a formula, a box or a rule first: TeX hyphenates no word one of them follows, and would one a mark follows)
    expect(readInkApart(log, ['\\pp', '\\textsuperscript{1}', '\\foo', '\\new{a}', '\\bad', '\\deep', '\\mbox{x}', '\\rule{1pt}{1pt}', '\\hfil'])).toEqual(['\\pp', '\\new{a}', '\\hfil'])
  })
  it('the kernel\'s letters and \\slash are text symbols: drawn as their characters, no mark needed (2610.21037\'s F\\o lner, 2610.21026\'s and\\slash or)', () => {
    expect(['\\o', '\\O', '\\ss', '\\ae', '\\AE', '\\oe', '\\OE', '\\aa', '\\AA', '\\l', '\\L', '\\slash'].map(s => symbolText(s))).toEqual(['ø', 'Ø', 'ß', 'æ', 'Æ', 'œ', 'Œ', 'å', 'Å', 'ł', 'Ł', '/'])
    // (not the dotless \\i and \\j, which a paper's text writes as its own as often as not: 2608.23818's indices)
    expect(['\\i', '\\j'].map(s => symbolText(s))).toEqual([null, null])
  })
})

describe('boundsFromMarks with the maker\'s reach: a unit start mark that stands at no word', () => {
  // a line: a formula from x 100 to 160 (no token), then words; the unit's end mark after its last word
  const tok = (t: string, x: number, w = 20) => ({ t, page: 1, x, y: 500, w, h: 10 })
  const doc = [tok('Before', 40, 30), tok('is', 165), tok('a', 190, 8), tok('word.', 205, 30)]
  const reach = (_mk: { x: number }) => 1
  it('a start mark at no word, here and in its own compile (its word null): bounded by the word reached; else none, as before', () => {
    const marks = new Map([['7s', { page: 1, x: 100, y: 500, t: null }], ['7e', { page: 1, x: 236, y: 500, t: 'word.' }]])
    expect(boundsFromMarks(doc as never, marks).get('7')).toBeUndefined()
    expect(boundsFromMarks(doc as never, marks, undefined, reach).get('7')).toEqual([1, 3])
  })
  it('not where its own compile had a word there (a carried word that is not the page\'s): unplaced, as before', () => {
    const marks = new Map([['7s', { page: 1, x: 100, y: 500, t: 'Formula' }], ['7e', { page: 1, x: 236, y: 500, t: 'word.' }]])
    expect(boundsFromMarks(doc as never, marks, undefined, reach).get('7')).toBeUndefined()
  })
})

describe('uprightToken: the maker reaches only upright words (2610.19282 p15: a sideways caption, whose word at the mark\'s height is another line\'s)', () => {
  const styles = { F1: { ascent: 0.75, descent: -0.25, fontFamily: 'serif' } }
  const tokensOf = (transform: number[]) => tokenizeDocument([{ page: 1, items: [{ str: 'Bifurcations of the map', transform, width: 110, height: 10, fontName: 'F1', dir: 'ltr' }], styles }] as never) as { t: string }[]
  it('a word of an upright line is; of a line turned a quarter either way, or upside down, none is', () => {
    expect(tokensOf([10, 0, 0, 10, 72, 700]).map(uprightToken)).toEqual([true, true, true, true])
    for (const m of [[0, 10, -10, 0, 300, 400], [0, -10, 10, 0, 300, 400], [-10, 0, 0, -10, 400, 300]]) expect(tokensOf(m).map(uprightToken), JSON.stringify(m)).toEqual([false, false, false, false])
  })
})

describe('a complete macro glued to the placeholder after it (2610.21098\'s \\HarnessLimitShare{}\\%): asked about that follower', () => {
  const u = unit([text('A share of '), ph('\\share{}'), ph('\\%'), text(' and '), ph('\\share{}'), ph('\\%'), text(', then '), ph('\\share{}'), ph('\\cite{a}'), text('.')])
  it('the probe asks its probed call before its glued follower, as the call follower (a percent or hash sign escaped is no comment)', () => {
    const samples = probeSamples([u], [['share', 0]])
    // (and last its call before the citation, a look-ahead pair: a call TeX answered for has its marks by its own answer, but a
    // reader of the probe's log with no complete macros takes the pairs as numbered all the same)
    expect(samples).toEqual([{ command: '\\cite', src: '\\cite{a}', call: false }, { command: '\\share', src: '\\share{}', call: false, own: true, glued: '\\%' }, { key: '\\share{}##\\cite{a}', src: '\\share{}', gap: '', follows: '\\cite{a}', math: false, ahead: true }])
    const tex = markProbeTex(samples)
    expect(tex).toContain('way \\share{}\\% \\unskip')
    expect(tex).toContain('way \\share{}{}\\% \\unskip')
    expect(tex).toContain('way \\axtpma{q1a}\\share{}\\axtpm{q1b}\\% \\unskip')
    // (a follower that is a comment's start, or a call followed by text, asks nothing more)
    expect(probeSamples([unit([ph('\\share{}'), ph('\\\\%x')])], [['share', 0]])).toEqual([{ command: '\\share', src: '\\share{}', call: false, own: true }])
    expect(probeSamples([unit([ph('\\share{}'), text('%')])], [['share', 0]])).toEqual([{ command: '\\share', src: '\\share{}', call: false, own: true }])
  })
  it('its answer read as the call follower\'s, an error in its boxes no answer', () => {
    const samples = probeSamples([u], [['share', 0]])
    expect(readMarkProbe('LAYOUT-PROBE 1 punct 1 00000001\n', samples)).toEqual({ '\\share': '00000001' })
    expect(readMarkProbe('LAYOUT-PROBE 1 punct-at 1 7 a\n! Undefined control sequence.\nLAYOUT-PROBE 1 punct 1 00000000\n', samples)).toEqual({ '\\share': '0000000x' })
  })
  it('layoutMarking: a call glued to that follower gets its closing mark where TeX answered 0 for it; else, and against another placeholder, its opening mark alone', () => {
    const switches = { '\\share': '00000000', '\\cite': '00000000' }
    const marked = (codes: string) => ((layoutMarking([u], MARK_CLASSES, { lines: false, complete: { share: 0 }, switches: { ...switches, '\\share': codes } }).units[0]?.pieces ?? []) as Piece[]).map(p => p.src ?? p.s).join('')
    expect(marked('00000000')).toContain('\\axtpma{p0.1a}\\share{}\\axtpm{p0.1b}\\%')
    expect(marked('00000000')).toContain('\\axtpma{p0.4a}\\share{}\\axtpm{p0.4b}\\%')
    // (before \\cite{a}, a follower the probe did not ask about: no closing mark)
    expect(marked('00000000')).toContain('\\axtpma{p0.7a}\\share{}\\cite{a}')
    for (const codes of ['00000001', '00000002', '0000000x']) expect(marked(codes)).toContain('\\axtpma{p0.1a}\\share{}\\%')
  })
})

describe('a paper\'s macro that looks ahead, before a placeholder (2609.20976\'s \\snr = \\ac{SNR}\\xspace, then $\\geq 50$): the pair asked of TeX', () => {
  // (the abstract's shape, and 2609.20976's u41, u46, u59 and u61: the macro, a space, an inline formula; u19's: the macro, a
  // space, a footnote's call, which \\xspace sees as no other token; and a macro of an argument right against a citation)
  const nested = { t: 'nested', pre: '\\footnote{', post: '}' } as unknown as Piece
  const u = unit([text('with '), ph('\\snr'), text(' '), ph('$\\geq 50$'), text(' and '), ph('\\lgnrm'), text(' '), ph('\\footnote{\\url{https://x.org}}'), text(', and '), ph('\\name{x}'), ph('\\cite{a}'), text(' by '), ph('\\snr'), text('\n'), ph('$\\geq 50$'), text('.')])
  it('aheadSamples: each pair of a paper\'s macro and the placeholder after it, past white space alone or none, once; none past text, a blank line or a tie, nor of a text symbol, a macro, a display or a nested note after it', () => {
    expect(aheadSamples([u])).toEqual([
      { key: '\\snr# #$\\geq 50$', src: '\\snr', gap: ' ', follows: '$\\geq 50$', math: true, ahead: true },
      { key: '\\lgnrm# #\\footnote{\\url{https://x.org}}', src: '\\lgnrm', gap: ' ', follows: '\\footnote{\\url{https://x.org}}', math: false, ahead: true },
      { key: '\\name{x}##\\cite{a}', src: '\\name{x}', gap: '', follows: '\\cite{a}', math: false, ahead: true },
    ])
    expect(aheadKey('\\snr', ' ', '$x$')).toBe('\\snr# #$x$')
    const none = unit([ph('\\snr'), text(' is '), ph('$x$'), ph('\\snr'), text('\n\n'), ph('$x$'), ph('\\snr'), ph('~'), ph('$x$'), ph('\\S'), ph('\\ref{b}'), ph('\\snr'), ph('\\lgnrm'), ph('\\snr'), ph('\\[x\\]'), ph('\\snr'), nested, ph('\\snr'), ph('$x%y$'), ph('\\snr'), ph('\\protect'), ph('\\cite{a}')])
    expect(aheadSamples([none])).toEqual([])
    // (at most AHEAD_PROBE_MAX, in the paper's order)
    const many = unit(Array.from({ length: AHEAD_PROBE_MAX + 2 }, (_, i) => [ph('\\snr'), text(' '), ph(`$${i}$`), text(' and ')]).flat())
    expect(aheadSamples([many]).map(s => s.follows)).toEqual(Array.from({ length: AHEAD_PROBE_MAX }, (_, i) => `$${i}$`))
  })
  it('the probe asks each pair last, after every other section, in boxes of its own rows: the pair as the paper sets it, with every mark, with the two openings', () => {
    const samples = probeSamples([u])
    const tex = markProbeTex(samples, ['\\snr'], ['\\lead'])
    const at = (row: string) => tex.indexOf(row)
    expect(at('LAYOUT-PROBE 1 ahead-at 0 w')).toBeGreaterThan(at('LAYOUT-PROBE 1 ink-at 1'))
    expect(at('LAYOUT-PROBE 1 ahead-at 2 d')).toBeGreaterThan(at('LAYOUT-PROBE 1 ahead-at 0 w'))
    expect(tex).toContain('way \\snr $\\geq 50$ \\unskip')
    expect(tex).toContain('way \\axtpma{q0a}\\snr\\axtpm{q0b} \\axtpmm{q0c}$\\geq 50$ \\unskip')
    expect(tex).toContain('way \\axtpma{q0a}\\snr \\axtpmm{q0c}$\\geq 50$ \\unskip')
    expect(tex).toContain('way \\axtpma{q1a}\\lgnrm \\axtpma{q1c}\\footnote{\\url{https://x.org}} \\unskip')
    expect(tex).toContain('way \\axtpma{q2a}\\name{x}\\axtpm{q2b}\\axtpma{q2c}\\cite{a} \\unskip')
    // (and what the list ends with where the placeholder's mark goes, which no box's width shows: a word there TeX would hyphenate
    // with a whatsit after it, and not with a citation's box — none on the citation; on a formula, whose mark boxes itself, its
    // opening mark alone)
    expect(tex).toContain('way \\axtpma{q2a}\\name{x}\\axt@qat\\axtpma{q2c}\\cite{a} \\unskip')
    const rows = tex.split('\n')
    expect(rows.find(r => r.includes('ahead 0 '))).toContain('\\ifcase\\axt@qend\\relax\\ifx\\axt@qa\\axt@qc\\xdef\\axt@qo{0}\\else\\xdef\\axt@qo{1}\\fi\\or\\xdef\\axt@qo{1}\\else')
    expect(rows.find(r => r.includes('ahead 2 '))).toContain('\\or\\xdef\\axt@qo{2}\\else')
    // (a paper with no pair asks as before)
    const plain = unit([ph('\\snr'), text(' and '), ph('\\cite{a}')])
    expect(markProbeTex(probeSamples([plain]))).toBe(markProbeTex([{ src: '\\cite{a}', call: false }]))
  })
  it('readMarkProbe: each pair\'s code by its key, an error in its boxes no answer or a lesser one, whatever samples before it the reader knows', () => {
    const samples = probeSamples([u])
    const log = 'LAYOUT-PROBE 1 punct 0 00000000\nLAYOUT-PROBE 1 ahead 0 1\nLAYOUT-PROBE 1 ahead 1 2\nLAYOUT-PROBE 1 ahead 2 0\n'
    expect(readMarkProbe(log, samples)).toEqual({ '\\footnote': '00000000', '\\snr# #$\\geq 50$': '1', '\\lgnrm# #\\footnote{\\url{https://x.org}}': '2', '\\name{x}##\\cite{a}': '0' })
    // (a reader with the complete macros, whose own samples come before the pairs, reads the pairs by their own rows)
    expect(Object.entries(readMarkProbe(log, probeSamples([u], [['name', 1]]))).filter(([k]) => k.includes('#'))).toEqual([['\\snr# #$\\geq 50$', '1'], ['\\lgnrm# #\\footnote{\\url{https://x.org}}', '2'], ['\\name{x}##\\cite{a}', '0']])
    const err = (box: string, code: string) => readMarkProbe(`LAYOUT-PROBE 1 ahead-at 0 ${box}\n! Undefined control sequence.\nLAYOUT-PROBE 1 ahead 0 ${code}\n`, samples)['\\snr# #$\\geq 50$']
    expect([err('w', '0'), err('a', '0'), err('d', '0'), err('g', '0'), err('c', '0'), err('c', '2')]).toEqual(['x', 'x', '2', '2', '1', '2'])
    // (a row of no pair, or of another code, is no answer)
    expect(readMarkProbe('LAYOUT-PROBE 1 ahead 3 0\nLAYOUT-PROBE 1 ahead 0 3\n', samples)).toEqual({})
  })
  it('layoutMarking: the placeholder after the macro gets its marks where TeX answered its opening mark there moves nothing, and the macro its closing mark where TeX answered 0', () => {
    const footnote = '\\footnote{\\url{https://x.org}}'
    const sw = (codes: string[]) => ({ ...all('\\cite', '\\footnote'), ...Object.fromEntries(aheadSamples([u]).map((s, i) => [s.key, codes[i] as string])) })
    // (no answer, as before: the macro its opening mark alone, the placeholder after it none — it was LOST, its unit the original's)
    expect(marksOf(u, { lines: false, switches: all('\\cite', '\\footnote') })).toEqual({ '\\snr': 'a', '$\\geq 50$': '', '\\lgnrm': 'a', [footnote]: '', '\\name{x}': 'a', '\\cite{a}': '' })
    // (TeX's answers for 2609.20976: \\snr 1 (its closing mark before the space would set a second one), \\lgnrm before the
    // footnote 2 (\\xspace sets no space before \\footnote, and would before a mark); a macro of an argument before a citation 0)
    expect(marksOf(u, { lines: false, switches: sw(['1', '2', '0']) })).toEqual({ '\\snr': 'a', '$\\geq 50$': 'ab', '\\lgnrm': 'a', [footnote]: '', '\\name{x}': 'ab', '\\cite{a}': 'ab' })
    // (the formula after the second \\snr, past a line's end, is the same pair as the first's: one space to TeX)
    const second = (layoutMarking([u], MARK_CLASSES, { lines: false, switches: sw(['1', '2', '0']) }).units[0]?.pieces ?? []) as Piece[]
    expect(second.map(p => p.src ?? p.s).join('')).toContain('\\axtpma{p0.12a}\\snr\n\\axtpmm{p0.14a}$\\geq 50$\\axtpm{p0.14b}')
    // (every answer 0: the macro ending in a control word closed too, as the probe's box set it)
    expect(marksOf(u, { lines: false, switches: sw(['0', '0', '0']) })).toEqual({ '\\snr': 'ab', '$\\geq 50$': 'ab', '\\lgnrm': 'ab', [footnote]: 'ab', '\\name{x}': 'ab', '\\cite{a}': 'ab' })
    // (2 and no answer: none, as before)
    expect(marksOf(u, { lines: false, switches: sw(['2', 'x', '2']) })).toEqual({ '\\snr': 'a', '$\\geq 50$': '', '\\lgnrm': 'a', [footnote]: '', '\\name{x}': 'a', '\\cite{a}': '' })
  })
  it('layoutMarking: none for a pair TeX was not asked about, after a macro with no opening mark of its own, or in a front unit', () => {
    const sw = { ...all('\\cite'), '\\snr# #$\\geq 50$': '0', '\\snr# #\\cite{a}': '0' }
    // (another formula after \\snr, the same formula after another macro, \\snr right against it)
    const v = unit([text('A '), ph('\\snr'), text(' '), ph('$\\geq 10$'), text(' B '), ph('\\snrx'), text(' '), ph('$\\geq 50$'), text(' C '), ph('\\snr'), ph('$\\geq 50$'), text('.')])
    expect(marksOf(v, { lines: false, switches: sw })).toEqual({ '\\snr': 'a', '$\\geq 10$': '', '\\snrx': 'a', '$\\geq 50$': '' })
    // (a complete call TeX answered for: its closing mark its own answer's, the citation right against it as TeX answered for the
    // pair — 2 where the call ends in a letter or a digit, the word TeX would hyphenate with a whatsit after it)
    const z = unit([text('A '), ph('\\share{}'), ph('\\cite{a}'), text('.')])
    const share = (code: string) => marksOf(z, { lines: false, complete: { share: 0 }, switches: { ...all('\\cite'), '\\share': '00000022', '\\share{}##\\cite{a}': code } })
    expect([share('2'), share('1'), share('0')]).toEqual([{ '\\share{}': 'a', '\\cite{a}': '' }, { '\\share{}': 'a', '\\cite{a}': 'ab' }, { '\\share{}': 'a', '\\cite{a}': 'ab' }])
    // (a macro glued to the word before, part of it, has no mark, and the citation after it none)
    const w = unit([text('word'), ph('\\snr'), text(' '), ph('\\cite{a}'), text('.')])
    expect(marksOf(w, { lines: false, switches: sw })).toEqual({ '\\snr': '', '\\cite{a}': '' })
    // (an author block's unit: its marks robust, `\\protect\\axtpma`, which the probe's box did not set)
    const a = { ...unit([text('Ada, with '), ph('\\snr'), text(' '), ph('$\\geq 50$'), text('.')]), kind: 'author' } as SourceUnit
    expect(layoutMarking([a], MARK_CLASSES, { lines: false, switches: sw }).units[0]?.pieces.map(p => (p as Piece).src ?? (p as Piece).s).join('')).toBe('Ada, with \\protect\\axtpma{p0.1a}\\snr $\\geq 50$.')
  })
})

describe('a placeholder no mark may stand before (\\footnote after \\xspace, TeX\'s answer 2): the maker parts it from the macro by the macro\'s text', () => {
  // (2609.20976v1 u19: `\\lgnrm \\footnote{\\url{…}}~\\citep{…}`, the call between a macro and a marked citation)
  const u = unit([text('The code '), ph('\\lgnrm'), text(' '), ph('\\footnote{\\url{https://x.org}}'), ph('~'), ph('\\citep{a}'), text(', which')])
  const names = new Set(['p0.1a', 'p0.5a', 'p0.5b'])
  it('followsOf: the split where the macro\'s text is known, a letter or a digit in it, and the call is the one unmarked piece before the next marked one', () => {
    expect(followsOf([u], names, ['\\lgnrm', 'lognormal_galaxies'])('p0.1a')).toMatchObject({ blocked: true, through: 'p0.5a', split: { name: 'n0.3a', text: 'lognormal_galaxies' } })
    expect(followsOf([u], names, new Map([['\\lgnrm', 'lognormal_galaxies']]))('p0.1a')?.split).toEqual({ name: 'n0.3a', text: 'lognormal_galaxies' })
    // (a text ending in punctuation, read character for character: "doi:")
    expect(followsOf([u], names, ['\\lgnrm', 'galaxies.'])('p0.1a')?.split).toEqual({ name: 'n0.3a', text: 'galaxies.' })
    // (no texts, as the wrap asked before; no text for the macro, or one of no letter or digit)
    expect(followsOf([u], names)('p0.1a')?.split).toBeUndefined()
    expect(followsOf([u], names, ['\\other', 'x'])('p0.1a')?.split).toBeUndefined()
    expect(followsOf([u], names, ['\\lgnrm', '--'])('p0.1a')?.split).toBeUndefined()
    // (two unmarked pieces before the next marked one: none; a paper's macro after it, the one unmarked piece: as a call)
    const two = unit([ph('\\lgnrm'), text(' '), ph('\\footnote{x}'), ph('$y$'), ph('\\citep{a}')])
    expect(followsOf([two], new Set(['p0.0a', 'p0.4a']), ['\\lgnrm', 'lognormal'])('p0.0a')?.split).toBeUndefined()
    const macro = unit([ph('\\lgnrm'), text(' '), ph('\\mice'), text(' '), ph('\\citep{a}')])
    expect(followsOf([macro], new Set(['p0.0a', 'p0.4a']), ['\\lgnrm', 'lognormal'])('p0.0a')?.split).toEqual({ name: 'p0.2a', text: 'lognormal' })
    // (a text symbol after it, which the layout draws as its character: none)
    const sym = unit([ph('\\lgnrm'), text(' '), ph('\\%'), text(' '), ph('\\citep{a}')])
    expect(followsOf([sym], new Set(['p0.0a', 'p0.4a']), ['\\lgnrm', 'lognormal'])('p0.0a')?.split).toBeUndefined()
  })
  it('followsOf: the split of a piece with text after it, to a piece of its unit\'s ends (an elsarticle .bbl\'s `\\DOIprefix\\doi{…}.` at an entry\'s end)', () => {
    const e = { ...unit([text('Tools of Radio Astronomy. '), ph('\\newblock'), text(' '), ph('\\DOIprefix'), ph('\\doi{10.1007/978-3-642-39950-3}'), text('.')]), kind: 'reference' } as SourceUnit
    expect(followsOf([e], new Set(['p0.3a', '0s', '0e']), ['\\DOIprefix', 'doi:'])('p0.3a')?.split).toEqual({ name: 'p0.4a', text: 'doi:', want: '.', rest: '', ends: ['0e', 't0e', 'h0e'] })
    // (text, then another piece: its opening one of the ends)
    const f = unit([ph('\\DOIprefix'), ph('\\doi{10.1/x}'), text(', see '), ph('\\url{https://x.org}'), text('.')])
    expect(followsOf([f], new Set(['p0.0a', 'p0.3a']), ['\\DOIprefix', 'doi:'])('p0.0a')?.split).toEqual({ name: 'p0.1a', text: 'doi:', want: ',see', rest: 'see', ends: ['p0.3a', '0e', 't0e', 'h0e'] })
    // (no text after it, the unit's end: no point ends its ink, none)
    const g = unit([ph('\\DOIprefix'), ph('\\doi{10.1/x}')])
    expect(followsOf([g], new Set(['p0.0a']), ['\\DOIprefix', 'doi:'])('p0.0a')?.split).toBeUndefined()
  })
})

describe('a sample that leaves TeX\'s state broken (2010.11929v2\'s \\tikz\\fill, cut in two): the groups it left open closed after its box, a box in \\nullfont no answer', () => {
  const u = unit([text('A dot '), ph('\\tikz'), ph('\\fill'), text(' then '), ph('\\natexlab{a}'), text(', with '), ph('\\snr'), text(' '), ph('$\\geq 50$'), text(' by '), ph('\\name{x}'), ph('\\cite{a}'), text('.')])
  it('each box of the punctuation, ink and look-ahead sections ends at the group level it began at: the groups its sample left open closed after it (\\tikz alone opens a picture it never closes, in which pgf\'s \\selectfont selects \\nullfont)', () => {
    const tex = markProbeTex(probeSamples([u]), ['\\tikz', '\\fill', '\\natexlab{a}'], ['\\lead'])
    const boxes = tex.match(/\\setbox\\axt@[qi]box\\hbox\{/g) ?? []
    // (the asked citation's eight followers, three boxes each and two more; four ink boxes; two pairs, five boxes each)
    expect(boxes.length).toBeGreaterThan(40)
    expect(tex.match(/\\xdef\\axt@level\{\\the\\currentgrouplevel\}\\setbox\\axt@[qi]box\\hbox\{/g)?.length).toBe(boxes.length)
    expect(tex).toContain('\\xdef\\axt@level{\\the\\currentgrouplevel}\\setbox\\axt@ibox\\hbox{\\tikz}\\axt@unwind\\begingroup\\showboxbreadth')
    expect(tex.match(/\\unskip\\xdef\\axt@qn\{\\the\\lastnodetype\\ifinner\\ifhmode\/in\\fi\\fi\}\}\\axt@unwind\\xdef\\axt@q[a-gw]\{/g)?.length).toBe(boxes.length - 4)
    // (defined before any box: a \\begingroup's group closed by \\endgroup, a box's or a group of braces' by \\egroup, to the level saved)
    const unwind = '\\gdef\\axt@unwind{\\global\\let\\axt@unwound\\relax\\ifnum\\currentgrouplevel>\\axt@level\\relax\\ifnum\\currentgrouptype=14 \\global\\let\\axt@unwound\\axt@unwind\\endgroup\\else\\ifnum\\currentgrouptype<6 \\ifnum\\currentgrouptype>0 \\global\\let\\axt@unwound\\axt@unwind\\egroup\\fi\\fi\\fi\\fi\\axt@unwound}'
    expect(tex.indexOf(unwind)).toBeGreaterThan(-1)
    expect(tex.indexOf(unwind)).toBeLessThan(tex.indexOf('\\setbox\\axt@qbox\\hbox{'))
  })
  // (the shape of TeX Live 2025's pdfTeX log of 2010.11929v2's probe at next, its ink section: \\fill's errors, the boxes after it
  // in the \\nullfont the picture \\tikz opened left in force; and a box of a font of its own)
  const nullfont = (c: string) => `Missing character: There is no ${c} in font nullfont!`
  const listing = (i: number, ...lines: string[]) => [`LAYOUT-PROBE 1 ink-at ${i}`, ...lines, '', '! OK.', `LAYOUT-PROBE 1 ink-end ${i}`]
  const log = [
    ...listing(0, '! Package tikz Error: Giving up on this path. Did you forget a semicolon?.', '! Missing } inserted.', '> \\box73=void'),
    ...listing(1, nullfont('a'), '> \\box73=', '\\hbox(0.0+0.0)x0.0'),
    ...listing(2, nullfont('B'), nullfont('E'), '> \\box73=', '\\hbox(6.8+0.0)x4.0', '.\\kern1.0', '.\\OT1/cmr/m/n/10 R'),
    ...listing(3, '> \\box73=', '\\hbox(6.8+0.0)x5.0', '.\\OT1/cmr/m/n/10 a'),
  ].join('\n')
  it('readInkProbe, readInkTexts, readInkApart: a box TeX logged a character missing from \\nullfont in has no answer — not a box that sets no ink, no text', () => {
    const samples = ['\\fill', '\\natexlab{a}', '\\bert', '\\nx']
    expect(readInkProbe(log, samples)).toEqual([])
    expect(readInkTexts(log, samples)).toEqual([['\\nx', 'a']])
    expect(readInkApart(log, samples)).toEqual([])
  })
  it('readMarkProbe: a box of a follower\'s or a pair\'s with a character missing from \\nullfont answers as one with an error', () => {
    const samples = probeSamples([u])
    const punct = ['LAYOUT-PROBE 1 punct-at 0 7 a', nullfont('w'), 'LAYOUT-PROBE 1 punct 0 00000000'].join('\n')
    expect(readMarkProbe(punct, samples)['\\cite']).toBe('0000000x')
    const ahead = ['LAYOUT-PROBE 1 ahead-at 0 w', nullfont('w'), 'LAYOUT-PROBE 1 ahead 0 0', 'LAYOUT-PROBE 1 ahead-at 1 d', nullfont('w'), 'LAYOUT-PROBE 1 ahead 1 0'].join('\n')
    expect(Object.entries(readMarkProbe(ahead, samples)).filter(([k]) => k.includes('#'))).toEqual([['\\snr# #$\\geq 50$', 'x'], ['\\name{x}##\\cite{a}', '2']])
  })
})

describe('the ink section\'s cap and a bibliography\'s entries (2608.25210v2: its body\'s 101 macros fill INK_MAX, its entries\' \\natexlab{} never asked)', () => {
  const body = (n: number) => Array.from({ length: n }, (_, i) => unit([text('A '), ph(`\\m${i}{}`), text(' word.')]))
  const entry = (...srcs: string[]) => ({ ...unit(srcs.flatMap(src => [text('Author. 2020'), ph(src), text('. ')])), kind: 'reference' }) as SourceUnit
  it('the entries get a share of their own past the body\'s INK_MAX: a body that fills it leaves them asked', () => {
    const units = [...body(INK_MAX + 5), entry('\\natexlab{}'), entry('\\natexlab{a}')]
    const asked = inkSamples(units)
    expect(asked).toHaveLength(INK_MAX + 2)
    expect(asked.slice(INK_MAX)).toEqual(['\\natexlab{}', '\\natexlab{a}'])
    // (at most ENTRY_INK_MAX of their own: one a shape)
    const many = [...body(2), ...Array.from({ length: ENTRY_INK_MAX + 3 }, (_, i) => entry(`\\e${i}{x}`))]
    expect(inkSamples(many)).toHaveLength(2 + ENTRY_INK_MAX)
  })
  it('the shape of an entry\'s call: \\natexlab{a}, {b} and {c} one, \\natexlab{} another, an argument that is no plain text as it is written', () => {
    expect(['\\natexlab{a}', '\\natexlab{b}', '\\natexlab{ c }', '\\natexlab{}', '\\natexlab{\\emph{a}}'].map(entryShape)).toEqual(['\\natexlab{\u0000}', '\\natexlab{\u0000}', '\\natexlab{\u0000}', '\\natexlab{}', '\\natexlab{\\emph{a}}'])
    // (REVTeX's \href@noop {} {…}: its arguments' shape, the second as written where it holds a command)
    expect(entryShape('\\href@noop {} {Ph.D. thesis}')).toBe('\\href@noop{}{\u0000}')
    expect(entryShape('\\href@noop {} {\\emph {J. Phys.}}')).toBe('\\href@noop{}{\\emph {J. Phys.}}')
    // (OT1's < > | " ' set other glyphs, and -- a dash: no plain text)
    expect(['\\x{a<b}', '\\x{a"b}', "\\x{a'b}", '\\x{1--2}', '\\x{10.1137/0330046}'].map(entryShape)).toEqual(['\\x{a<b}', '\\x{a"b}', "\\x{a'b}", '\\x{1--2}', '\\x{\u0000}'])
  })
  it('the share asks the calls the body\'s room would have asked first, in order, so that no entry is asked less than before; then the entries\' leads; then each call in order', () => {
    // (a bibliography the share holds: every call asked of its own, as before, none shared)
    const few = [entry('\\natexlab{a}', '\\doi{10.1/x}'), entry('\\natexlab{b}', '\\doi{10.2/y}'), entry('\\natexlab{}', '\\natexlab{c}')]
    expect(inkSamples(few)).toEqual(['\\natexlab{a}', '\\doi{10.1/x}', '\\natexlab{b}', '\\doi{10.2/y}', '\\natexlab{}', '\\natexlab{c}'])
    expect(inkShared(few).size).toBe(0)
    // (a body of 60: next asked the first 4 calls, \x{1}…\x{4}, one shape; they are asked still, before other shapes — the reviews
    // of #495: an entry asked by next is never left to a shape's sample)
    const four = [...body(INK_MAX - 4), ...[1, 2, 3, 4].map(i => entry(`\\x{${i}}`)), ...Array.from({ length: ENTRY_INK_MAX + 6 }, (_, i) => entry(`\\y${i}{1}`))]
    expect(inkSamples(four).slice(INK_MAX - 4, INK_MAX)).toEqual(['\\x{1}', '\\x{2}', '\\x{3}', '\\x{4}'])
    // (a body that fills INK_MAX: the entries' leads first, a lead past ENTRY_INK_MAX other calls asked all the same)
    const lead = (src: string) => ({ ...unit([ph(src), text(' Author. A title.')]), kind: 'reference' }) as SourceUnit
    const later = [...body(INK_MAX), ...Array.from({ length: ENTRY_INK_MAX + 2 }, (_, i) => entry(`\\y${i}{1}`)), lead('\\lead{z}')]
    expect(inkSamples(later)).toContain('\\lead{z}')
    expect(inkSamples(later)).toHaveLength(INK_MAX + ENTRY_INK_MAX)
    // (past the share: a call given the text of the first asked call of its shape, where carriedText gives one)
    const dois = Array.from({ length: ENTRY_INK_MAX + 2 }, (_, i) => entry(`\\doi{10.${i}/x}`))
    expect([...inkShared(dois)]).toEqual([[`\\doi{10.${ENTRY_INK_MAX}/x}`, '\\doi{10.0/x}'], [`\\doi{10.${ENTRY_INK_MAX + 1}/x}`, '\\doi{10.0/x}']])
    expect([...inkShared([...body(1), ...dois])].map(([c]) => c)).toEqual([`\\doi{10.${ENTRY_INK_MAX}/x}`, `\\doi{10.${ENTRY_INK_MAX + 1}/x}`])
    // (at most ENTRY_SHARED_MAX calls)
    expect(inkShared(Array.from({ length: ENTRY_INK_MAX + ENTRY_SHARED_MAX + 2 }, (_, i) => entry(`\\doi{10.${i}/x}`))).size).toBe(ENTRY_SHARED_MAX)
  })
  it('a lead past the share is a lead of its own still, its text carried or not (the reviews of #495: \\up uppercases its argument, no text carried)', () => {
    const lead = (src: string) => ({ ...unit([ph(src), text(' Author. A title.')]), kind: 'reference' }) as SourceUnit
    const units = [...body(INK_MAX), ...Array.from({ length: ENTRY_INK_MAX + 1 }, (_, i) => lead(`\\up{word${i}}`))]
    expect(inkSamples(units)).not.toContain(`\\up{word${ENTRY_INK_MAX}}`)
    expect(inkShared(units).get(`\\up{word${ENTRY_INK_MAX}}`)).toBe('\\up{word0}')
    expect(leadSamples(units)).toEqual([`\\up{word${ENTRY_INK_MAX}}`])
    // (its own text read, and kept: no carried one in its place)
    const ink = inkSamples(units), leads = leadSamples(units, ink)
    const listing = (i: number, s: string) => [`LAYOUT-PROBE 1 ink-at ${i}`, '> \\box60=', '\\hbox(6.8+0.0)x40.0', ...[...s].map(c => `.\\OT1/cmr/m/n/10 ${c}`), '', '! OK.', `LAYOUT-PROBE 1 ink-end ${i}`]
    const log = [...listing(INK_MAX, 'WORD0'), ...listing(ink.length, `WORD${ENTRY_INK_MAX}`)].join('\n')
    expect(leads).toHaveLength(1)
    expect(readInkAnswers(log, units).texts).toEqual([['\\up{word0}', 'WORD0'], [`\\up{word${ENTRY_INK_MAX}}`, `WORD${ENTRY_INK_MAX}`]])
  })
  it('carriedText: the sample\'s text with each plain argument the two differ in put in place of the call\'s, where it stands once; none where a macro transforms its argument', () => {
    expect(carriedText('\\natexlab{a}', '\\natexlab{b}', 'a')).toBe('b')
    expect(carriedText('\\doi{10.1/x}', '\\doi{10.22/yz}', 'doi:10.1/x')).toBe('doi:10.22/yz')
    expect(carriedText('\\href@noop {} {Ph.D. thesis}', '\\href@noop {} {M.Sc. thesis}', 'Ph.D.thesis')).toBe('M.Sc.thesis')
    // (an uppercased argument: its text holds no "abc", and nothing is carried)
    expect(carriedText('\\up{abc}', '\\up{def}', 'ABC')).toBeNull()
    // (a call's letters a font sets as one ligature: 2609.26457v1's "findings" in a DOI, which TeX's listing gives as no text)
    expect(carriedText('\\doi{10.1/acl}', '\\doi{10.1/findings}', 'doi:10.1/acl')).toBeNull()
    // (the argument twice in its text, or one that is no plain text: none)
    expect(carriedText('\\twice{a}', '\\twice{b}', 'aa')).toBeNull()
    expect(carriedText('\\x{a}', '\\x{\\emph{b}}', 'a')).toBeNull()
    expect(carriedText('\\x{a}', '\\y{b}', 'a')).toBeNull()
  })
  it('readInkAnswers: the probe\'s log read for the samples, a DOI past the share given its shape\'s text, no ink never carried (2608.25210v2\'s \\natexlab{})', () => {
    const units = [entry('\\natexlab{}'), ...Array.from({ length: ENTRY_INK_MAX }, (_, i) => entry(`\\doi{10.${i}/x}`)), entry('\\natexlab{b}')]
    expect(inkSamples(units).slice(0, 2)).toEqual(['\\natexlab{}', '\\doi{10.0/x}'])
    expect([...inkShared(units)]).toEqual([[`\\doi{10.${ENTRY_INK_MAX - 1}/x}`, '\\doi{10.0/x}']])
    const listing = (i: number, ...nodes: string[]) => [`LAYOUT-PROBE 1 ink-at ${i}`, '> \\box60=', ...nodes, '', '! OK.', `LAYOUT-PROBE 1 ink-end ${i}`]
    const chars = (s: string) => [...s].map(c => `.\\OT1/cmr/m/n/10 ${c}`)
    const log = [...listing(0, '\\hbox(0.0+0.0)x0.0'), ...listing(1, '\\hbox(6.8+0.0)x40.0', ...chars('doi:10.0/x'))].join('\n')
    expect(readInkAnswers(log, units)).toEqual({ inkless: ['\\natexlab{}'], texts: [['\\doi{10.0/x}', 'doi:10.0/x'], [`\\doi{10.${ENTRY_INK_MAX - 1}/x}`, `doi:10.${ENTRY_INK_MAX - 1}/x`]], apart: [] })
  })
  it('shareInk carries a text alone: no ink and a box begun apart never, whose value may hang on the argument (the reviews of #495: \\ifnum#1>64 #1\\fi); a call\'s own text kept; null kept null', () => {
    const shared = new Map([['\\natexlab{b}', '\\natexlab{a}'], ['\\up{def}', '\\up{abc}'], ['\\e{y}', '\\e{x}'], ['\\own{2}', '\\own{1}']])
    expect(shareInk({ inkless: ['\\e{x}'], texts: [['\\natexlab{a}', 'a'], ['\\up{abc}', 'ABC'], ['\\own{1}', '1'], ['\\own{2}', 'two']], apart: ['\\natexlab{a}'] }, shared)).toEqual({
      inkless: ['\\e{x}'], texts: [['\\natexlab{a}', 'a'], ['\\up{abc}', 'ABC'], ['\\own{1}', '1'], ['\\own{2}', 'two'], ['\\natexlab{b}', 'b']], apart: ['\\natexlab{a}'],
    })
    // (a call past the share whose argument holds "fi": no text — TeX's ligature glyph may be no text)
    expect(shareInk({ inkless: [], texts: [['\\doi{10.1/acl}', 'doi:10.1/acl']], apart: [] }, new Map([['\\doi{10.1/findings}', '\\doi{10.1/acl}']]))).toEqual({ inkless: [], texts: [['\\doi{10.1/acl}', 'doi:10.1/acl']], apart: [] })
    expect(shareInk({ inkless: null, texts: null, apart: null }, shared)).toEqual({ inkless: null, texts: null, apart: null })
    expect(shareInk({ inkless: ['\\a'], texts: [], apart: [] }, new Map())).toEqual({ inkless: ['\\a'], texts: [], apart: [] })
  })
})

describe('the mark probe sets a .bbl\'s own definitions first (an elsarticle .bbl\'s \\DOIprefix and \\doi, 2610.20848v1)', () => {
  const tex = '\\documentclass{article}\n\\begin{document}\nA word \\cite{a}.\n\\bibliographystyle{plain}\\bibliography{refs}\n\\end{document}\n'
  const bbl = '\\begin{thebibliography}{1}\n\\providecommand{\\url}[1]{\\texttt{#1}}\n\\providecommand{\\DOIprefix}{doi:}\n\\providecommand{\\doi}[1]{\\href{http://dx.doi.org/#1}{\\path{#1}}}\n\\expandafter\\ifx\\csname natexlab\\endcsname\\relax\\def\\natexlab#1{#1}\\fi\n\\bibitem{a} A. Author. A title. \\newblock \\DOIprefix\\doi{10.1/x}.\n\\end{thebibliography}\n'
  const enc = (t: string) => new TextEncoder().encode(t)
  const probeOf = (files: [string, string][]) => new TextDecoder().decode(probeFiles(openPaper(new Map(files.map(([p, t]) => [p, enc(t)]))), { marks: true }).get('main.tex'))
  it('each \\providecommand before its first \\bibitem, whole, right after \\begin{document}: the probe\'s ink section then knows the entries\' macros', () => {
    expect(bblProvides(inMemory(new Map([['main.tex', enc(tex)], ['main.bbl', enc(bbl)]])), 'main.tex')).toBe('\\providecommand{\\url}[1]{\\texttt{#1}}\\providecommand{\\DOIprefix}{doi:}\\providecommand{\\doi}[1]{\\href{http://dx.doi.org/#1}{\\path{#1}}}\\expandafter\\ifx\\csname natexlab\\endcsname\\relax\\def\\natexlab#1{#1}\\fi')
    const probe = probeOf([['main.tex', tex], ['main.bbl', bbl]])
    expect(probe).toContain('\\begin{document}\\providecommand{\\url}[1]{\\texttt{#1}}\\providecommand{\\DOIprefix}{doi:}')
    // (none past the first \\bibitem)
    expect(probe).not.toContain('\\newblock \\DOIprefix')
    // (a paper with no .bbl asks as before)
    expect(probeOf([['main.tex', tex]])).not.toContain('\\providecommand')
  })
  it('read as TeX reads the .bbl: no definition or \\bibitem in a comment, no brace in one, a comment\'s line end taken with it, and one under \\makeatletter given it again (the reviews of #486)', () => {
    const bbl2 = [
      '\\begin{thebibliography}{2}', '% \\providecommand{\\foo}{wrong}', '% a \\bibitem in a comment', '\\providecommand{\\foo}{right}',
      '\\providecommand{\\bar}{% closing } in a comment', '  hello}', '100\\% \\providecommand{\\pct}{5\\%}', '\\makeatletter',
      '\\providecommand{\\baz}[1]{\\@firstofone{#1}}', '\\makeatother', '\\providecommand{\\qux}{q}', '\\bibitem{a} A. Author.', '\\end{thebibliography}',
    ].join('\n')
    expect(bblProvides(inMemory(new Map([['main.tex', enc(tex)], ['main.bbl', enc(bbl2)]])), 'main.tex')).toBe('\\providecommand{\\foo}{right}\\providecommand{\\bar}{hello}\\providecommand{\\pct}{5\\%}\\makeatletter\\providecommand{\\baz}[1]{\\@firstofone{#1}}\\makeatother \\providecommand{\\qux}{q}')
  })
  const provides = (head: string) => bblProvides(inMemory(new Map([['main.tex', enc(tex)], ['main.bbl', enc(`\\begin{thebibliography}{1}\n${head}\n\\bibitem{a} A. Author.\n\\end{thebibliography}\n`)]])), 'main.tex')
  it('natbib\'s conditionals, whole, both branches (2608.25210v2\'s \\natexlab{a}, 2010.11929v2\'s \\doi: TeX picks the one for a paper that loads url)', () => {
    expect(provides('\\expandafter\\ifx\\csname natexlab\\endcsname\\relax\\def\\natexlab#1{#1}\\fi')).toBe('\\expandafter\\ifx\\csname natexlab\\endcsname\\relax\\def\\natexlab#1{#1}\\fi')
    const doi = '\\expandafter\\ifx\\csname urlstyle\\endcsname\\relax\n  \\providecommand{\\doi}[1]{doi: #1}\\else\n  \\providecommand{\\doi}{doi: \\begingroup \\urlstyle{rm}\\Url}\\fi'
    expect(provides(`\\providecommand{\\natexlab}[1]{#1}\n${doi}`)).toBe(`\\providecommand{\\natexlab}[1]{#1}${doi}`)
  })
  it('a conditional on \\undefined or \\relax, a nested one whole to its own \\fi (Springer\'s \\bisbn)', () => {
    expect(provides('\\ifx \\bisbn   \\undefined \\def \\bisbn  #1{ISBN #1}\\fi')).toBe('\\ifx \\bisbn   \\undefined \\def \\bisbn  #1{ISBN #1}\\fi')
    // (amsplain's, the other way round)
    expect(provides('\\ifx\\undefined\\bysame\n\\newcommand{\\bysame}{\\leavevmode\\hbox to3em{\\hrulefill}\\,}\n\\fi')).toBe('\\ifx\\undefined\\bysame\n\\newcommand{\\bysame}{\\leavevmode\\hbox to3em{\\hrulefill}\\,}\n\\fi')
    expect(provides('\\ifx\\a\\undefined \\ifnum1=1 \\def\\a{x}\\else\\def\\a{y}\\fi \\let\\b\\a\\fi\\ifx\\c\\relax\\def\\c{z}\\fi')).toBe('\\ifx\\a\\undefined \\ifnum1=1 \\def\\a{x}\\else\\def\\a{y}\\fi \\let\\b\\a\\fi\\ifx\\c\\relax\\def\\c{z}\\fi')
    // (a package's conditional or a \\newif's in it, whose \\fi the head alone does not tell from the guard's: not copied whole, its
    // definitions read one by one, each set only where undefined, and what follows read as before — the review of #492)
    expect(provides('\\ifx\\doi\\undefined \\ifpdf \\def\\doi#1{doi: #1}\\fi \\fi\\providecommand{\\x}{y}')).toBe('\\ifx\\doi\\undefined\\def\\doi#1{doi: #1}\\fi \\providecommand{\\x}{y}')
    // (one that defines nothing, or replaces a definition, passed over whole: not even the \\def in it)
    expect(provides('\\ifx\\a\\undefined \\typeout{none}\\fi\\ifx\\b\\undefined \\renewcommand{\\c}{x}\\def\\b{y}\\fi')).toBe('')
  })
  it('\\@ifundefined{X}{…}{…} whole, under \\makeatletter', () => {
    expect(provides('\\makeatletter\n\\@ifundefined{bbl@x}{\\def\\bbl@x#1{#1}}{}\n\\makeatother')).toBe('\\makeatletter\\@ifundefined{bbl@x}{\\def\\bbl@x#1{#1}}{}\\makeatother ')
  })
  it('a \\newcommand, as a \\providecommand (alpha\'s \\etalchar: one the paper defined stands)', () => {
    expect(provides('\\newcommand{\\etalchar}[1]{$^{#1}$}\\newcommand*\\x[2][a]{#1#2}')).toBe('\\providecommand{\\etalchar}[1]{$^{#1}$}\\providecommand*\\x[2][a]{#1#2}')
  })
  it('a \\def or \\let of its own, set only where its name is undefined (MNRAS\'s \\mn@doi under \\makeatletter, REVTeX\'s \\let)', () => {
    expect(provides('\\makeatletter\n\\relax\n\\def\\mn@doi@[#1]#2{\\href{http://dx.doi.org/#2}{#1}}\n\\let\\auto@bib@innerbib\\@empty\n\\makeatother\n\\gdef\\x{y}\\let\\z=\\x')).toBe(
      '\\makeatletter\\ifx\\mn@doi@\\undefined\\def\\mn@doi@[#1]#2{\\href{http://dx.doi.org/#2}{#1}}\\fi \\makeatother \\makeatletter\\ifx\\auto@bib@innerbib\\undefined\\let\\auto@bib@innerbib\\@empty\\fi \\makeatother \\ifx\\x\\undefined\\gdef\\x{y}\\fi \\ifx\\z\\undefined\\let\\z=\\x\\fi ',
    )
  })
  it('anything else passed over: a \\renewcommand, a length, a group with its own definitions, a \\def of a \\csname; and a harvard .bbl\'s head ends at its first \\harvarditem', () => {
    expect(provides('\\renewcommand{\\refname}{R}\\setlength{\\itemsep}{0pt}{\\def\\a{b}}\\baselineskip=9pt\\expandafter\\def\\csname x@y\\endcsname{z}')).toBe('')
    const harvard = '\\begin{thebibliography}{2}\n\\providecommand{\\a}{b}\n\\harvarditem{X}{2020}{x} X. \\def\\c{d}\n\\end{thebibliography}\n'
    expect(bblProvides(inMemory(new Map([['main.tex', enc(tex)], ['main.bbl', enc(harvard)]])), 'main.tex')).toBe('\\providecommand{\\a}{b}')
  })
})

describe('frontMarks: the front matter\'s units, marked in the layout compile as any unit', () => {
  const front = (kind: string, s: string, more: object = {}) => ({ ...unit([text(s)]), kind, ...more }) as SourceUnit
  it('an author block\'s names and places, a front note (\\thanks), a front unit of the role table\'s (a \\date): start and end marks; not a heading, nor one a macro only stores (\\biboptions{semicolon})', () => {
    const units = [front('heading', 'A title', { front: true }), front('author', 'Ada Lovelace'), front('footnote', 'Equal contribution.', { front: true }), front('para', 'October 2026', { front: true }), front('para', 'Body text.'), front('para', 'semicolon', { front: true, held: true })]
    const m = frontMarks(units)
    expect(units.map(u => m(u))).toEqual([null, { start: '\\leavevmode\\axtmark{1s}', end: '\\axtend{1e}' }, { start: '\\leavevmode\\axtmark{2s}', end: '\\axtend{2e}' }, { start: '\\leavevmode\\axtmark{3s}', end: '\\axtend{3e}' }, null, null])
  })
  it('none whose text another one\'s equals (a class compares them: revtex\'s affiliations), none stored or read in math', () => {
    const units = [front('author', 'Dept. of Engines'), front('author', 'Ada'), front('author', 'Dept.  of Engines'), front('footnote', 'Equal.', { front: true }), front('footnote', 'Equal.', { front: true }), front('author', 'Stored', { stored: true }), { ...unit([text('A'), ph('^'), text('1')]), kind: 'author' } as SourceUnit]
    const m = frontMarks(units)
    expect(units.map(u => !!m(u))).toEqual([false, true, false, false, false, false, false])
  })
  it('layoutMarking gives them those marks, and their placeholders theirs', () => {
    const a = { ...unit([text('Ada Lovelace, '), ph('\\texttt{ada@x.org}'), text(' and more')]), kind: 'author' } as SourceUnit
    const { units, mark } = layoutMarking([a], MARK_CLASSES, { lines: true })
    expect(mark(a)).toEqual({ start: '\\leavevmode\\axtmark{0s}', end: '\\axtend{0e}' })
    // (robust: a class may store a front unit's text with \\protected@xdef, \\thanks's, where \\axtpma alone takes itself off)
    expect(((units[0]?.pieces ?? []) as Piece[]).map(p => p.src ?? p.s).join('')).toContain('\\protect\\axtpma{p0.1a}\\texttt{ada@x.org}\\protect\\axtpm{p0.1b}')
  })
  it('a \\thanks\'s placeholders keep their marks through its \\protected@xdef: \\texttt, \\href\'s text and \\protect\\url (2610.20484, 2610.11256, 2610.21880)', () => {
    const note = { ...unit([text('Corresponding author: '), ph('\\texttt{a@b.org}'), text(' or '), ph('\\protect'), ph('\\url{c@d.org}'), text('. Email: '), { t: 'open', id: 1, src: '\\href{mailto:e@f.org}{' } as Piece, ph('e@f.org'), { t: 'close', id: 1, src: '}' } as Piece, text('.')]), kind: 'footnote', front: true } as SourceUnit
    const { units, mark } = layoutMarking([note], MARK_CLASSES, { lines: true })
    expect(mark(note)).toEqual({ start: '\\leavevmode\\axtmark{0s}', end: '\\axtend{0e}' })
    const out = ((units[0]?.pieces ?? []) as Piece[]).map(p => p.src ?? p.s).join('')
    expect(out).toContain('\\protect\\axtpma{p0.1a}\\texttt{a@b.org}\\protect\\axtpm{p0.1b}')
    expect(out).toContain('\\protect\\axtpma{p0.4a}\\protect\\url{c@d.org}\\protect\\axtpm{p0.4b}')
    expect(out).toContain('\\href{mailto:e@f.org}{\\protect\\axtpma{p0.7a}e@f.org')
    // (a body unit's marks are as they were: no \\protect before them)
    const body = unit([text('see '), ph('\\texttt{a@b.org}'), text(' now')])
    const plain = ((layoutMarking([body], MARK_CLASSES, { lines: true }).units[0]?.pieces ?? []) as Piece[]).map(p => p.src ?? p.s).join('')
    expect(plain).toContain('see \\axtpma{p0.1a}\\texttt{a@b.org}\\axtpm{p0.1b}')
  })
})
