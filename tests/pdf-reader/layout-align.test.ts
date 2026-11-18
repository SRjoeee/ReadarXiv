import { describe, expect, it } from 'vitest'
import { LAYOUT_TEX } from '../../packages/engine/src/marks/marks.ts'

// A unit's alignment as TeX set its paragraph (marks.mjs LAYOUT_TEX's AXT-ALIGN at its end mark, readAlign): the author's own,
// which the maker's CENTRED is (make.mjs). The logs below are TeX Live 2025's pdfLaTeX, each line written by the probe at a
// construct's end mark, as the marked original writes them (the article, IEEEtran's conference and acmart's sigconf classes)

describe('readAlign: the alignment TeX set a unit\'s paragraph by', () => {

  it('the probe is LAYOUT_TEX\'s: for a unit\'s, a heading\'s and a cell\'s end mark; through \\message, which sets nothing', () => {
    expect(LAYOUT_TEX).toContain('\\def\\axt@align#1{\\axt@ift#1\\relax{\\axt@tcs#1s\\@nil}{\\axt@ifh#1\\relax{}{\\axt@ucs#1s\\@nil}}\\axt@alg#1e\\@nil}')
    // (a unit's that is no cell's, an author block's name or place set in a tabular's cell: its start mark's index carried out
    // through ordinary groups alone (a brace group, \\begingroup: an \\aftergroup past a box, a \\noalign or math would put a token
    // where TeX does not read one) to the innermost alignment entry, and its column's class written at the template's end for each
    // unit that reaches it: several units share the cell's line (2411.13093v4's names apart by \\quad, a \\thanks between two), and
    // the class places that line, which the lay runs as one (rowLinesOf); none where a cell's own unit is there)
    expect(LAYOUT_TEX).toContain('\\def\\axt@us#1{\\ifnum\\currentgrouptype=6 \\axt@uin{#1}\\else\\ifnum\\currentgrouplevel>\\z@\\axt@agplain{')
    expect(LAYOUT_TEX).toContain('\\def\\axt@uin#1{\\ifnum\\axt@clv=\\currentgrouplevel\\else\\ifnum\\axt@ulv=\\currentgrouplevel\\edef\\axt@uc{\\expandafter\\axt@uls\\axt@uc\\@nil,#1 \\the\\currentgrouplevel}\\else')
    expect(LAYOUT_TEX).toContain('\\protected\\def\\axt@te#1{\\ifdefined\\axt@cc\\expandafter\\axt@tec\\axt@cc\\@nil{#1}\\fi\\ifdefined\\axt@uc\\expandafter\\axt@tel\\axt@uc\\@nil{#1}\\fi\\gdef\\axt@clvl{-1}}')
    expect(LAYOUT_TEX).toContain('\\def\\axt@tel#1 #2\\@nil#3{\\ifnum#2=\\currentgrouplevel\\@for\\axt@x:=#1\\do{\\message{^^JAXT-CELL \\axt@x\\space#3^^J}}\\fi}')
    // (and past a box the column's template sets around the content, colortbl's \\setbox\\z@\\hbox it \\unhbox-es into the cell
    // (2411.13093v4's xcolor `table`): a box at or above the content's level, which \\axt@cl notes before each column's content and
    // the template's end forgets; never a box of the paper's, below it, nor after a table set in the cell)
    expect(LAYOUT_TEX).toContain('\\def\\axt@agtbox#1{\\ifnum\\currentgrouptype=2 \\ifnum\\currentgrouplevel>\\axt@clvl\\relax\\else#1\\fi\\fi}\\protected\\def\\axt@cl{\\xdef\\axt@clvl{\\the\\currentgrouplevel}}')
    // (a cell's column: its start mark's index defined in the cell's group, carried out by \\aftergroup to the innermost
    // alignment entry's and no further; each column template of LaTeX's ends in its class, written where the index is defined at
    // the template's own group level)
    expect(LAYOUT_TEX).toContain('\\def\\axt@cs#1{\\edef\\axt@cc{#1 \\the\\currentgrouplevel}\\ifnum\\currentgrouptype=6 \\else')
    // (and there the cell's end point, `t<i>x`: where TeX ends what a piece of the cell stands in, a destination and its point,
    // no pending mark flushed; docs/PDF-READER.md §18.74)
    expect(LAYOUT_TEX).toContain('\\def\\axt@tec#1 #2\\@nil#3{\\ifnum#2=\\currentgrouplevel\\message{^^JAXT-CELL #1 #3^^J}\\axt@cellend{#1}\\fi}')
    expect(LAYOUT_TEX).toContain('\\def\\axt@cellend#1{\\axt@colseen\\ifaxt@off\\else\\axt@dest{t#1x}\\fi}')
    // (the class appended with what the preamble holds left as it is: REVTeX's ltxutil appends tokens unexpanded, its macros
    // run in the cell, and an \\xdef that expanded them again set its alignment box at the build: the table never ended)
    expect(LAYOUT_TEX).toContain('\\def\\axt@ate{\\xdef\\@preamble{\\unexpanded\\expandafter{\\@preamble}\\axt@te{\\the\\@chnum}}}')
    // (a \\@mkpream entered while one runs finds \\@classz wrapped and leaves it: wrapped again, the wrapper would call itself)
    // (\\axt@cl before the column's content: array's \\insert@column, while \\@classz builds the column, \\protected so that a
    // preamble expanded again keeps it)
    expect(LAYOUT_TEX).toContain('\\def\\axt@czw{\\let\\axt@icol\\insert@column\\def\\insert@column{\\noexpand\\axt@cl\\axt@icol}\\axt@cz\\let\\insert@column\\axt@icol\\axt@ate}\\def\\axt@mkw#1{\\let\\axt@cz\\@classz\\let\\@classz\\axt@czw\\axt@mkp{#1}\\let\\@classz\\axt@cz}')
    expect(LAYOUT_TEX).toContain('\\AddToHook{begindocument/end}{\\let\\axt@mkp\\@mkpream\\def\\@mkpream#1{\\ifx\\@classz\\axt@czw\\expandafter\\axt@mkp\\else\\expandafter\\axt@mkw\\fi{#1}}}')
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

