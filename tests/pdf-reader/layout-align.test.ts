import { describe, expect, it } from 'vitest'
import { ALIGN_CODES, encodeLayoutMarks, LAYOUT_TEX, parseLayoutMarks, readAlign } from '@/pdf-reader/engine/layout/marks.mjs'
import { LayoutRefusal } from '@/pdf-reader/engine/layout/json.mjs'
import { marksOf, text, unit, type World } from './helpers/make-world'

// A unit's alignment as TeX set its paragraph (marks.mjs LAYOUT_TEX's AXT-ALIGN at its end mark, readAlign): the author's own,
// which the maker's CENTRED is (make.mjs). The logs below are TeX Live 2025's pdfLaTeX, each line written by the probe at a
// construct's end mark, as the marked original writes them (the article, IEEEtran's conference and acmart's sigconf classes)

/** the article: a section heading; a paragraph; centred in a center environment, in a minipage's, in a list's item, in a \parbox;
 *  \raggedright, ragged2e's \RaggedRight, \raggedleft; \centerline's box; a short caption (\@makecaption's box alone), a long one
 *  (measured in a box, then set as a paragraph), a short one after \centering; ragged2e's \Centering */
const ARTICLE = `This is pdfTeX, Version 3.141592653-2.6-1.40.28 (TeX Live 2025)
AXT-ALIGN h0 p 0 0.0pt 0 0.0pt 1 1.0pt
AXT-ALIGN 1 p 0 0.0pt 0 0.0pt 1 1.0pt
AXT-ALIGN 2 p 1 1.0pt 1 1.0pt 0 0.0pt
AXT-ALIGN 3 p 1 1.0pt 1 1.0pt 0 0.0pt
AXT-ALIGN 4 p 1 1.0pt 1 1.0pt 0 0.0pt
AXT-ALIGN 5 p 1 1.0pt 1 1.0pt 0 0.0pt
AXT-ALIGN 6 p 0 0.0pt 1 1.0pt 1 1.0pt
AXT-ALIGN 7 p 0 0.0pt 0 20.00003pt 1 1.0pt
AXT-ALIGN 8 p 1 1.0pt 0 0.0pt 0 0.0pt
AXT-ALIGN 9 h 0 0.0pt 0 0.0pt 1 1.0pt
AXT-ALIGN 10 h 0 0.0pt 0 0.0pt 1 1.0pt
AXT-ALIGN 11 h 0 0.0pt 0 0.0pt 1 1.0pt
AXT-ALIGN 11 p 0 0.0pt 0 0.0pt 1 1.0pt
AXT-ALIGN 12 h 0 0.0pt 0 0.0pt 1 1.0pt
AXT-ALIGN 13 p 0 20.00003pt 0 20.00003pt 0 0.0pt
`
/** IEEEtran: a section heading (centred by its class), a paragraph, a subsection heading, a paragraph, a table's caption */
const IEEE = `AXT-ALIGN h0 p 1 1.0pt 1 1.0pt 0 0.0pt
AXT-ALIGN 1 p 0 0.0pt 0 0.0pt 1 1.0pt
AXT-ALIGN h2 p 0 0.0pt 0 0.0pt 1 1.0pt
AXT-ALIGN 3 p 0 0.0pt 0 0.0pt 1 1.0pt
AXT-ALIGN 4 p 1 1.0pt 1 1.0pt 0 0.0pt
`
/** acmart: a section heading (ragged right), a paragraph, a figure's caption (measured, then set centred) */
const ACM = `AXT-ALIGN h0 p 0 0.0pt 1 1.0pt 1 1.0pt
AXT-ALIGN 1 p 0 0.0pt 0 0.0pt 1 1.0pt
AXT-ALIGN 2 h 0 0.0pt 0 0.0pt 1 1.0pt
AXT-ALIGN 2 p 1 1.0pt 1 1.0pt 0 0.0pt
`

describe('readAlign: the alignment TeX set a unit\'s paragraph by', () => {
  it('centred, flush left, flush right, justified, as each construct sets it; none for a box\'s', () => {
    expect(readAlign(ARTICLE)).toEqual([[0, 'j'], [1, 'j'], [2, 'c'], [3, 'c'], [4, 'c'], [5, 'c'], [6, 'l'], [7, 'l'], [8, 'r'], [11, 'j'], [13, 'c']])
    expect(readAlign(IEEE)).toEqual([[0, 'c'], [1, 'j'], [2, 'j'], [3, 'j'], [4, 'c']])
    expect(readAlign(ACM)).toEqual([[0, 'l'], [1, 'j'], [2, 'c']])
    for (const [, c] of [...readAlign(ARTICLE), ...readAlign(IEEE), ...readAlign(ACM)]) expect(ALIGN_CODES).toContain(c)
  })

  it('a unit\'s last line counts: measured in a box then set as a paragraph, the paragraph\'s; set as a paragraph then in a box, none', () => {
    expect(readAlign('AXT-ALIGN 4 h 0 0.0pt 0 0.0pt 1 1.0pt\nAXT-ALIGN 4 p 1 1.0pt 1 1.0pt 0 0.0pt\n')).toEqual([[4, 'c']])
    expect(readAlign('AXT-ALIGN 4 p 1 1.0pt 1 1.0pt 0 0.0pt\nAXT-ALIGN 4 h 0 0.0pt 0 0.0pt 1 1.0pt\n')).toEqual([])
    // (both sides infinite and a \parfillskip as infinite: its last line not centred)
    expect(readAlign('AXT-ALIGN 4 p 1 1.0pt 1 1.0pt 1 1.0pt\n')).toEqual([[4, 'j']])
  })

  it('reads the last pass alone, and passes over a line not of its form: a log cut short or a template\'s, never a refusal', () => {
    const passes = `$ pdflatex main\nLOG:\nAXT-ALIGN 1 p 1 1.0pt 1 1.0pt 0 0.0pt\n==\nSTDOUT:\n$ pdflatex main\nLOG:\nAXT-ALIGN 1 p 0 0.0pt 0 0.0pt 1 1.0pt\n==\nSTDOUT:\n`
    expect(readAlign(passes)).toEqual([[1, 'j']])
    expect(readAlign('AXT-ALIGN 1 p 1 1.0pt 1 1.0\nAXT-ALIGN 2 p 1 1.0pt 1 1.0pt 0 0.0pt\nAXT-ALIGN 3 p 1 1.0pt\nAXT-ALIGN x p 1 1.0pt 1 1.0pt 0 0.0pt\n')).toEqual([[2, 'c']])
    expect(readAlign('')).toEqual([])
    expect(readAlign(undefined)).toEqual([])
  })

  it('the probe is LAYOUT_TEX\'s: for a unit\'s and a heading\'s end mark, never a cell\'s; through \\message, which sets nothing', () => {
    expect(LAYOUT_TEX).toContain('\\def\\axt@align#1{\\axt@ift#1\\relax{}{\\axt@alg#1e\\@nil}}')
    expect(LAYOUT_TEX).toContain('\\protected\\def\\axtmark#1{\\ifaxt@off\\axt@colseen\\else\\axt@align{#1}')
    expect(LAYOUT_TEX).toContain('\\protected\\def\\axt@hm#1{\\ifaxt@off\\else\\axt@align{#1}')
    // (the skips a paragraph is broken by are those at its \\par, so its own are read once it ends: a one-shot para/after hook set
    // at the mark, at its group level or below, or deeper through ordinary groups back to it; in a box, or after its end, at the
    // mark. Each end mark's reading a serial of its own, its skips taken at the mark, and written once)
    expect(LAYOUT_TEX).toContain('\\def\\axt@agpar#1{\\xdef\\axt@agn{\\the\\numexpr\\axt@agn+1}\\axt@agcap{\\axt@agn}\\edef\\axt@agt{\\noexpand\\AddToHookNext{para/after}{\\noexpand\\axt@agover{#1}{\\the\\currentgrouplevel}{\\axt@agn}}\\noexpand\\axt@agw{#1}{\\axt@agn}}\\axt@agt}')
    expect(LAYOUT_TEX).toContain('\\def\\axt@agover#1#2#3{\\axt@agopen{#3}{\\ifnum\\currentgrouplevel>#2 \\axt@agplain{\\axt@agcap{#3}\\axt@agafter{#1}{#2}{#3}}{\\AddToHookNext{para/after}{\\axt@agover{#1}{#2}{#3}}}\\else\\axt@agcap{#3}\\axt@agmsg{#1}{#3}\\fi}}')
    expect(LAYOUT_TEX).toContain('\\def\\axt@agmsg#1#2{\\ifcsname axt@agd@#2\\endcsname\\else\\expandafter\\gdef\\csname axt@agd@#2\\endcsname{}\\message{^^JAXT-ALIGN #1 p \\csname axt@ag@#2\\endcsname^^J}\\fi}')
    // (a paragraph a box's close ends, where TeX inserts no \\par: the box it is set in watched where it closes, the innermost of
    // a \\vbox, \\vtop, \\insert or \\vcenter, through ordinary groups as the paragraph goes on, none at the bottom level)
    expect(LAYOUT_TEX).toContain('\\def\\axt@agw#1#2{\\ifnum\\currentgrouplevel>\\z@\\axt@agbox{\\axt@agz{#1}{#2}\\axt@agmsg}{\\axt@agplain{\\axt@agz{#1}{#2}\\axt@agup}{}}\\fi}')
    expect(LAYOUT_TEX).toContain('\\def\\axt@agbox{\\ifnum\\ifcase\\currentgrouptype 0\\or0\\or0\\or0\\or1\\or1\\or0\\or0\\or0\\or0\\or0\\or1\\or1\\else0\\fi=1 ')
    expect(LAYOUT_TEX).toContain('\\ifhmode\\ifinner\\axt@agnow{#1}h\\else\\ifdefined\\AddToHookNext\\axt@agpar{#1}\\fi\\fi\\else\\axt@agnow{#1}v\\fi')
  })
})

/** TeX Live 2025's pdfLaTeX, the probe reading each paragraph's skips once it ended: `{\\centering ...}` and a blank line (the
 *  group closed before the paragraph ended: set justified, which the mark's own skips had called centred), `\\noindent\\hfill X
 *  \\hfill\\null` (centred by its glue, the paper's skips: j, which the maker reads by its line), a footnote's paragraph and the
 *  paragraph it is in; and LuaLaTeX's orders, fil 2 (its fi 1) */
const PARAGRAPH_END = `AXT-ALIGN 14 p 0 0.0pt 0 0.0pt 1 1.0pt
AXT-ALIGN 15 p 0 0.0pt 0 0.0pt 1 1.0pt
AXT-ALIGN 16 p 0 0.0pt 0 0.0pt 1 1.0pt
AXT-ALIGN 17 p 0 0.0pt 0 0.0pt 1 1.0pt
`
const LUATEX = `AXT-ALIGN 1 p 0 0.0pt 0 0.0pt 2 1.0pt
AXT-ALIGN 2 p 2 1.0pt 2 1.0pt 0 0.0pt
AXT-ALIGN 6 p 0 0.0pt 2 1.0pt 2 1.0pt
AXT-ALIGN 8 p 2 1.0pt 0 0.0pt 0 0.0pt
AXT-ALIGN 13 p 0 20.0pt 0 20.0pt 0 0.0pt
AXT-ALIGN 18 p 4 1.0pt 4 1.0pt 0 0.0pt
`

/** TeX Live 2023's pdfLaTeX (its LaTeX sets no \\partokencontext, so TeX ends a paragraph a box's close ends with no \\par and no
 *  para/after hook runs for it), the probe watching the box (lab/pdf/spikes/layout-align-cases.mjs): elsarticle's abstract
 *  (`\\global\\setbox\\absbox=\\vbox\\bgroup … \\egroup`) and its \\raggedright keywords; a \\vbox of no \\par, then a \\raggedright
 *  paragraph; the mark in a group inside a \\vbox, then flushright; a \\raggedleft \\vtop, then a centred paragraph; a small
 *  environment in a \\vbox, then \\raggedright; a \\raggedleft \\vbox inside a \\raggedright paragraph, the paragraph; a marginal
 *  note. The probe before it read each boxed paragraph by the next paragraph's \\par: 1 l, 4 l, 6 r, 8 c, 10 l, 12 l */
const BOXED_2023 = `This is pdfTeX, Version 3.141592653-2.6-1.40.25 (TeX Live 2023)
AXT-ALIGN 1 p 0 0.0pt 0 0.0pt 1 1.0pt
AXT-ALIGN 2 p 0 0.0pt 1 1.0pt 1 1.0pt
AXT-ALIGN 4 p 0 0.0pt 0 0.0pt 1 1.0pt
AXT-ALIGN 5 p 0 0.0pt 1 1.0pt 1 1.0pt
AXT-ALIGN 6 p 0 0.0pt 0 0.0pt 1 1.0pt
AXT-ALIGN 7 p 1 1.0pt 0 0.0pt 0 0.0pt
AXT-ALIGN 8 p 1 1.0pt 0 0.0pt 0 0.0pt
AXT-ALIGN 9 p 1 1.0pt 1 1.0pt 0 0.0pt
AXT-ALIGN 10 p 0 0.0pt 0 0.0pt 1 1.0pt
AXT-ALIGN 11 p 0 0.0pt 1 1.0pt 1 1.0pt
AXT-ALIGN 12 p 1 1.0pt 0 0.0pt 0 0.0pt
AXT-ALIGN 13 p 0 0.0pt 1 1.0pt 1 1.0pt
AXT-ALIGN 14 p 0 0.0pt 1 1.0pt 1 1.0pt
`

describe('readAlign: a paragraph a box\'s close ends, under a LaTeX that inserts no \\par there', () => {
  it('reads each boxed paragraph by its own skips, not the next paragraph\'s', () => {
    expect(readAlign(BOXED_2023)).toEqual([[1, 'j'], [2, 'l'], [4, 'j'], [5, 'l'], [6, 'j'], [7, 'r'], [8, 'r'], [9, 'c'], [10, 'j'], [11, 'l'], [12, 'r'], [13, 'l'], [14, 'l']])
  })
})

describe('readAlign: a paragraph\'s own skips, LuaTeX\'s orders', () => {
  it('a centring group closed before its paragraph ended reads justified, as TeX set it', () => {
    expect(readAlign(PARAGRAPH_END)).toEqual([[14, 'j'], [15, 'j'], [16, 'j'], [17, 'j']])
  })
  it('LuaTeX\'s orders, fil 2 and filll 4, read as pdfTeX\'s 1 and 3', () => {
    expect(readAlign(LUATEX)).toEqual([[1, 'j'], [2, 'c'], [6, 'l'], [8, 'r'], [13, 'c'], [18, 'c']])
  })
})

describe('the marks file\'s `align` (MARKS_SCHEMA 8)', () => {
  const w: World = { pages: [{ runs: [{ s: 'a line of words', x: 72, y: 700 }] }], marks: [['0s', 1, 72, 700], ['0e', 1, 147, 700]], units: [unit('para', [text('a line of words')])] }

  it('holds each unit\'s alignment the log tells, ids rising', async () => {
    const m = await marksOf(w, 'AXT-ALIGN 0 p 1 1.0pt 1 1.0pt 0 0.0pt\n')
    expect(m.align).toEqual([[0, 'c']])
    expect((await marksOf(w, '')).align).toEqual([])
  })

  it('refuses an entry out of order, twice, or of no code', async () => {
    const m = await marksOf(w, '')
    const parse = (align: unknown) => () => parseLayoutMarks(new TextEncoder().encode(encodeLayoutMarks({ ...m, align } as never)))
    expect(parse([[2, 'c'], [1, 'l']])).toThrow(LayoutRefusal)
    expect(parse([[1, 'c'], [1, 'l']])).toThrow(/align\[1\]\[0\]/)
    expect(parse([[1, 'x']])).toThrow(/align\[0\]\[1\]/)
    expect(parse([[1]])).toThrow(/align\[0\]/)
    expect(parse(null)).toThrow(/align/)
  })
})

describe('a probe line TeX wrapped', () => {
  it('joined back at its 79 characters (max_print_line): a stretch of five digits on each side', () => {
    const line = 'AXT-ALIGN 123456789 p 2 12345.00003pt 2 12345.00003pt 0 12345.00003pt'
    expect(line.length).toBeLessThan(79)
    const long = 'AXT-ALIGN 123456789 p 1 12345.00003pt 1 12345.00003pt 0 1234567890.00003pt'
    expect(readAlign(`${long.slice(0, 79)}\n${long.slice(79)}\n`)).toEqual([[123456789, 'c']])
    expect(readAlign(`${line}\n`)).toEqual([[123456789, 'c']])
  })
})
