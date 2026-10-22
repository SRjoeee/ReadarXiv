import { describe, expect, it } from 'vitest'
import type { SourceUnit } from '@/pdf-reader/engine/source/latex-front.mjs'
import { completeMacros, inMemory, loadProject } from '@/pdf-reader/engine/source/latex-front.mjs'
import { completeCall, completeCalled, layoutMarking, MARK_CLASSES, readInkApart, symbolText } from '@/pdf-reader/engine/layout/marks.mjs'
import { boundsFromMarks } from '@/pdf-reader/engine/pipeline/anchors.mjs'

// The layout marks a placeholder gets where what stands beside it was guessed at: the paper's own macro taken to look ahead
// (LOOKS_AHEAD: no closing mark on it, no mark at all on the piece after it), a macro glued to the word before taken for that
// word's letters (WORD_END), a unit whose start or end mark stands at no word (boundsFromMarks). Each guess is now read from
// what the paper says: a macro's definition (its arity, whether its body reads on), TeX's own box for a macro (whether it begins
// with a character), the words on the mark's own line (the release-route sweep's 217 unanchored rows: 2610.21098, 2610.21547,
// 2610.21376, 2610.21201)

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

describe('completeMacros: the paper\'s macros that read nothing past their own arguments, from their definitions', () => {
  it('each definition form, its arity', () => {
    expect(defs([
      "\\newcommand{\\dprime}{$d'$}", '\\newcommand\\HarnessLimitShare{91.5}', '\\renewcommand{\\cls}[1]{\\textsc{#1}}', '\\providecommand{\\pv}{x}',
      '\\DeclareRobustCommand{\\rb}{y}', '\\newcommand*{\\st}[2]{#1 and #2}', '\\def\\pair#1#2{(#1,#2)}', '\\gdef\\g{z}',
      '\\NewDocumentCommand{\\nd}{m m}{(#1)}', '\\NewDocumentCommand\\ndp{+m}{#1}',
    ].join('\n'))).toEqual([['HarnessLimitShare', 0], ['cls', 1], ['dprime', 0], ['g', 0], ['nd', 2], ['ndp', 1], ['pair', 2], ['pv', 0], ['rb', 0], ['st', 2]])
  })
  it('none that may read on: an optional first argument, a look ahead or a command at its body\'s end, an argument spec with more than mandatory ones', () => {
    expect(defs([
      '\\newcommand{\\opt}[2][x]{#1#2}', '\\newcommand\\bert{BERT\\xspace}', '\\newcommand\\nx{\\@ifnextchar[{a}{b}}', '\\newcommand\\st{\\@ifstar{a}{b}}',
      '\\newcommand\\fl{\\futurelet\\next\\x}', '\\newcommand\\bf{\\textbf}', '\\NewDocumentCommand{\\ndo}{o m}{#2}', '\\NewDocumentCommand{\\nds}{s m}{#2}',
    ].join('\n'))).toEqual([])
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

describe('layoutMarking with the complete macros: a macro of the paper\'s that reads nothing past its arguments looks at nothing after it', () => {
  // (2610.21098 u15: \HarnessLimitShare{} = 91.5, then a citation right after it)
  const u = unit([text('The limit is '), ph('\\HarnessLimitShare{}'), ph('\\cite{a}'), text(' of all, and '), ph('\\cls{word}'), ph('\\ref{b}'), text('.')])
  it('without them: no closing mark on the macro, no mark on the piece after it', () => {
    expect(marksOf(u, { lines: false })).toEqual({ '\\HarnessLimitShare{}': 'a', '\\cite{a}': '', '\\cls{word}': 'a', '\\ref{b}': '' })
  })
  it('with them: its closing mark, and the piece after it its two', () => {
    expect(marksOf(u, { lines: false, complete: { HarnessLimitShare: 0, cls: 1 } })).toEqual({ '\\HarnessLimitShare{}': 'ab', '\\cite{a}': 'ab', '\\cls{word}': 'ab', '\\ref{b}': 'ab' })
  })
  it('a call short of its arguments looks ahead still; a call ending in a control word gets no closing mark (TeX skips the spaces after it)', () => {
    const v = unit([text('A '), ph('\\cls'), ph('\\cite{a}'), text(' B '), ph('\\dprime'), ph('\\ref{b}'), text('.')])
    expect(marksOf(v, { lines: false, complete: { cls: 1, dprime: 0 } })).toEqual({ '\\cls': 'a', '\\cite{a}': '', '\\dprime': 'a', '\\ref{b}': 'ab' })
  })
  it('completeCalled: the complete macros the units call, by name', () => {
    expect(completeCalled([u], [['HarnessLimitShare', 0], ['cls', 1], ['unused', 2]])).toEqual({ HarnessLimitShare: 0, cls: 1 })
    expect(completeCalled([u], undefined)).toBeNull()
  })
})

describe('the glue rule: a macro glued to the word before is part of it, unless TeX\'s box for it begins with no character', () => {
  // (2610.21547: "0.58\pp", \pp = \,pp; 2610.21924: "Zhou\textsuperscript{1}")
  const u = unit([text('a gap of 0.58'), ph('\\pp'), text(' then '), ph('$x$'), text(' by Zhou'), ph('\\textsuperscript{1}'), text(' and Giessenbachstra'), ph('\\foo'), text('e.')])
  it('without TeX\'s answer, as before: no mark on either', () => {
    expect(marksOf(u, { lines: false })).toMatchObject({ '\\pp': '', '\\textsuperscript{1}': '', '\\foo': '' })
  })
  it('with it: the ones whose box begins with a kern or a formula are marked; one that begins with a character stays the word\'s', () => {
    // (their opening marks: neither is a macro of the paper's that reads nothing past its arguments, so no closing one)
    expect(marksOf(u, { lines: false, apart: ['\\pp', '\\textsuperscript{1}'] })).toMatchObject({ '\\pp': 'a', '\\textsuperscript{1}': 'a', '\\foo': '' })
  })
  it('readInkApart: the samples whose box TeX listed in full and began with no character', () => {
    const row = (tag: string, i: number) => `LAYOUT-PROBE 1 ${tag} ${i}`
    const box = (first: string) => ['> \\box0=', '\\hbox(6.83+0.0)x20.0', first, '.\\OT1/cmr/m/n/10 p', '', '! OK.']
    const log = [
      row('ink-at', 0), ...box('.\\kern1.66667'), row('ink-end', 0),
      row('ink-at', 1), ...box('.\\mathon'), row('ink-end', 1),
      row('ink-at', 2), ...box('.\\OT1/cmr/m/n/10 a'), row('ink-end', 2),
      row('ink-at', 3), ...box('.\\pdfcolorstack 0 push {1 0 0 rg 1 0 0 RG}'), row('ink-end', 3),
      row('ink-at', 4), '! Undefined control sequence.', ...box('.\\kern1.0'), row('ink-end', 4),
      row('ink-at', 5), ...box('..\\kern1.0'), row('ink-end', 5),
    ].join('\n')
    expect(readInkApart(log, ['\\pp', '\\textsuperscript{1}', '\\foo', '\\new{a}', '\\bad', '\\deep'])).toEqual(['\\pp', '\\textsuperscript{1}', '\\new{a}'])
  })
  it('the kernel\'s letters and \\slash are text symbols: drawn as their characters, no mark needed (2610.21037\'s F\\o lner, 2610.21026\'s and\\slash or)', () => {
    expect(['\\o', '\\O', '\\ss', '\\ae', '\\AE', '\\oe', '\\OE', '\\aa', '\\AA', '\\l', '\\L', '\\i', '\\j', '\\slash'].map(s => symbolText(s))).toEqual(['ø', 'Ø', 'ß', 'æ', 'Æ', 'œ', 'Œ', 'å', 'Å', 'ł', 'Ł', 'ı', 'ȷ', '/'])
  })
})

describe('boundsFromMarks with the maker\'s reach: a unit mark that stands at no word', () => {
  // a line: a formula from x 100 to 160 (no token), then words; the unit's end mark after its last word
  const tok = (t: string, x: number, w = 20) => ({ t, page: 1, x, y: 500, w, h: 10 })
  const doc = [tok('Before', 40, 30), tok('is', 165), tok('a', 190, 8), tok('word.', 205, 30)]
  const reach = (mk: { x: number }, start: boolean) => (start ? 1 : null)
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
