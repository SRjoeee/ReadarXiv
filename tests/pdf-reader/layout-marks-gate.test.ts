import { describe, expect, it } from 'vitest'
import type { Item, Readings, Row } from '../../experiments/pdf-bilingual/spikes/layout-marks-compare.mjs'
import { attribute, boxDiff, causesOf, classOfMark, compareReadings, fileStates, joinRuns, lineAt, linesOf, lostLines, pageBoxes, regressions, strictMoves, switchOffOf, traced, verdictOf, withFitr } from '../../experiments/pdf-bilingual/spikes/layout-marks-compare.mjs'

// The corpus check's comparisons (experiments/pdf-bilingual/spikes/layout-marks-gate.mjs): v0 against v1 of a paper, the
// text items to 0.01 pt, the lines, the files TeX writes, the readings, and TeX's own page boxes where the PDF's items
// moved. What the compiles give is the script's; these are the judgements it makes of them

const item = (str: string, x: number, y: number, w = 10, h = 10): Item => ({ str, x, y, w, h })

describe('strictMoves: every text item of v0 at the same page and place to 0.01 pt in v1', () => {
  const page = [item('We show', 72, 700, 30), item('that', 105, 700, 15), item('that', 72, 688, 15)]
  it('nothing moved, and a move of 0.01 pt is none', () => {
    expect(strictMoves([page], [page.map(i => ({ ...i }))])).toEqual({ moved: [], extra: [] })
    expect(strictMoves([page], [page.map(i => ({ ...i, x: i.x + 0.01 }))]).moved).toEqual([])
  })
  it('a move past 0.01 pt, in x or in y, is a move; a string set twice is matched once each', () => {
    const b = page.map(i => ({ ...i }))
    b[2] = { ...page[2] as Item, y: 688.02 }
    const r = strictMoves([page], [b])
    expect(r.moved).toEqual([{ page: 1, k: 2, str: 'that', x: 72, y: 688 }])
    expect(r.extra).toEqual([{ page: 1, k: 2, str: 'that', x: 72, y: 688.02 }])
    expect(strictMoves([page], [[...b.slice(0, 2), { ...page[2] as Item, x: 72.02 }]]).moved).toHaveLength(1)
  })
  it('an item of another width is a move: a kern lost inside it moves the glyphs after its start', () => {
    expect(strictMoves([page], [page.map((i, k) => ({ ...i, w: k === 0 ? i.w + 0.14 : i.w }))]).moved).toEqual([{ page: 1, k: 0, str: 'We show', x: 72, y: 700 }])
  })
  it('an item v1 cuts in two is a move under this measure (joinRuns tells it apart)', () => {
    const r = strictMoves([[item('et al. While', 72, 700, 50)]], [[item('et al.', 72, 700, 22), item('While', 97, 700, 25)]])
    expect(r.moved).toHaveLength(1)
    expect(r.extra).toHaveLength(2)
  })
  it('a page v1 lacks: its items are moved; a page v1 adds: its items extra', () => {
    expect(strictMoves([page, [item('end', 72, 700)]], [page]).moved).toEqual([{ page: 2, k: 0, str: 'end', x: 72, y: 700 }])
    expect(strictMoves([page], [page, [item('end', 72, 700)]]).extra).toEqual([{ page: 2, k: 0, str: 'end', x: 72, y: 700 }])
  })
})

describe('joinRuns and linesOf: the joined figures, and the lines the layout maker reads', () => {
  it('joinRuns: items that abut on one baseline are one run, at the first item\'s place', () => {
    expect(joinRuns([item('et al.,', 72, 700, 22), item(' 2026).', 94, 700, 30), item('While', 130, 700, 25), item('x', 155.02, 700.5, 5)])).toEqual([
      { str: 'et al., 2026).', x: 72, y: 700, w: 52, k: 0 }, { str: 'While', x: 130, y: 700, w: 25, k: 2 }, { str: 'x', x: 155.02, y: 700.5, w: 5, k: 3 },
    ])
    // a space PDF.js gives as an item of its own joins the runs it stands between; k counts the items with ink
    expect(joinRuns([item('et al., 2026).', 72, 700, 52), item(' ', 124, 700, 6), item('While', 130, 700, 25), item('b', 72, 688)])).toEqual([
      { str: 'et al., 2026). While', x: 72, y: 700, w: 83, k: 0 }, { str: 'b', x: 72, y: 688, w: 10, k: 2 },
    ])
  })
  it('linesOf: a superscript on its line, the next column\'s line apart, the line below apart', () => {
    const { lines, of } = linesOf([item('We show', 72, 700, 40), item('1', 112, 703.5, 4, 7), item('that', 118, 700, 20), item('Right column', 320, 700, 60), item('next', 72, 688, 20)])
    expect(of).toEqual([0, 0, 0, 0, 1])
    expect(lines).toHaveLength(2)
    // the right column's line is on the left one's baseline and to its right: one line, as the maker reads it
    expect(lines[0]).toEqual({ y: 700, h: 10, x0: 72, x1: 380 })
    const two = linesOf([item('Left', 320, 700, 40), item('again', 72, 700, 30)])
    expect(two.of).toEqual([0, 1])
  })
  it('lineAt: a mark on a line\'s baseline and within its extent', () => {
    const { lines } = linesOf([item('We show', 72, 700, 40), item('next', 72, 688, 20)])
    expect(lineAt(lines, 90, 700)).toBe(0)
    expect(lineAt(lines, 80, 688.4)).toBe(1)
    expect(lineAt(lines, 200, 700)).toBe(-1)
    expect(lineAt(lines, 80, 694)).toBe(-1)
  })
})

describe('fileStates: aux, toc, lof, lot and out', () => {
  it('same, differs or none, by bytes', () => {
    expect(fileStates({ aux: 'a', toc: 'b', lof: null, lot: null, out: 'c' }, { aux: 'a', toc: 'x', lof: null, lot: 'y', out: 'c' })).toEqual({ aux: 'same', toc: 'differs', lof: 'none', lot: 'differs', out: 'same' })
  })
})

describe('compareReadings: v1\'s readings against v0\'s, byte for byte but for the caption gate', () => {
  const units = [{ kind: 'para' }, { kind: 'caption' }, { kind: 'para' }, { kind: 'caption' }]
  const r = (marks: [string, number, number, number][], log = 'AXT-LINES 0 3'): Readings => ({ log, cites: '', labels: '\\newlabel{x}{{1}{1}}', bbl: null, marks: { pages: 3, width: 612, height: 792, columns: [1, 1, 1], marks: new Map(marks.map(([n, page, x, y]) => [n, { page, x, y }])) } })
  const base: [string, number, number, number][] = [['0s', 1, 72, 700], ['0e', 1, 300, 650], ['1s', 0, 90, 600], ['1e', 0, 400, 600], ['2s', 2, 72, 700], ['3s', 0, 90, 580]]
  it('the same readings, whatever order the marks came in', () => {
    expect(compareReadings(r(base), r([...base].reverse()), units)).toEqual({ readings: 'same', captions: [] })
  })
  it('a caption\'s marks v0 set on its list page and v1 at its float: captions, each with its pages (1-based)', () => {
    const v1 = base.map(([n, p, x, y]): [string, number, number, number] => (n === '1s' ? [n, 2, 72, 300] : n === '1e' ? [n, 2, 300, 300] : n === '3s' ? [n, 1, 72, 200] : [n, p, x, y]))
    expect(compareReadings(r(base), r(v1), units)).toEqual({ readings: 'captions', captions: [[1, 1, 3], [3, 1, 2]] })
  })
  it('a mark moved along its line alone: offsets, each with its shift, for TeX\'s boxes to judge', () => {
    const along = base.map(([n, p, x, y]): [string, number, number, number] => (n === '2s' ? [n, p, x + 0.43, y] : n === '1s' ? [n, 2, 72, 300] : [n, p, x, y]))
    expect(compareReadings(r(base), r(along), units)).toEqual({ readings: 'offsets', captions: [[1, 1, 3]], offsets: [['2s', 0.43]] })
    const far = base.map(([n, p, x, y]): [string, number, number, number] => (n === '2s' ? [n, p, x + 1.5, y] : [n, p, x, y]))
    expect(compareReadings(r(base), r(far), units).readings).toBe('differs')
  })
  it('any other mark, a line of the log or a reference changed: differs, naming the parts', () => {
    const moved = base.map(([n, p, x, y]): [string, number, number, number] => (n === '2s' ? [n, p, x, y - 12] : [n, p, x, y]))
    expect(compareReadings(r(base), r(moved), units)).toEqual({ readings: 'differs', captions: [], parts: ['marks 2s'] })
    expect(compareReadings(r(base), r(base, 'AXT-LINES 0 4'), units)).toEqual({ readings: 'differs', captions: [], parts: ['log'] })
    expect(compareReadings(r(base), { ...r(base), cites: '\\bibcite{a}{1}' }, units).parts).toEqual(['cites'])
    // a caption's mark moved on the same page is no gate's doing
    const near = base.map(([n, p, x, y]): [string, number, number, number] => (n === '1s' ? [n, p, x, y - 3] : [n, p, x, y]))
    expect(compareReadings(r(base), r(near), units).readings).toBe('differs')
  })
})

/** a log with these pages shipped out, each a box display as \tracingoutput writes it */
const logOf = (...pages: string[][]) => pages.map((lines, i) => `[${i + 1}]\nCompleted box being shipped out [${i + 1}]\n${lines.join('\n')}\n\n`).join('Some warning\n')
const LINE = ['\\vbox(633.0+0.0)x407.0', '.\\hbox(6.94+2.22)x407.0, glue set 0.5', '..\\OT1/cmr/m/n/10 W', '..\\OT1/cmr/m/n/10 e', '..\\glue 3.33333 plus 1.66666 minus 1.11111', '..\\OT1/cmr/m/n/10 g', '..\\kern-0.135', '..\\OT1/cmr/m/n/10 .']

describe('pageBoxes and boxDiff: TeX\'s own page boxes, the marks taken out', () => {
  it('reads each page shipped out as a tree', () => {
    const pages = pageBoxes(logOf(LINE, ['\\vbox(1.0+0.0)x2.0']))
    expect(pages).toHaveLength(2)
    expect(pages[0]?.children[0]?.text).toBe('\\vbox(633.0+0.0)x407.0')
    expect(pages[0]?.children[0]?.children[0]?.children.map(n => n.text)).toEqual(LINE.slice(2).map(l => l.replace(/^\.+/, '')))
  })
  it('the marks\' own nodes are no difference: destinations, an empty \\vadjust, an empty box around a mark, a glue or kern put back', () => {
    const v1 = ['\\vbox(633.0+0.0)x407.0', '.\\hbox(6.94+2.22)x407.0, glue set 0.5', '..\\pdfdest name{axt-p0.1a} fitr width 0.0 height 0.0 depth 0.0', '..\\OT1/cmr/m/n/10 W', '..\\vadjust', '..\\OT1/cmr/m/n/10 e', '..\\hbox(0.0+0.0)x0.0', '...\\pdfdest name{axt-p0.1b} fitr width 0.0 height 0.0 depth 0.0', '..\\glue 3.33333 plus 1.66666 minus 1.11111', '..\\OT1/cmr/m/n/10 g', '..\\kern -0.135', '..\\OT1/cmr/m/n/10 .']
    const v0 = [...LINE.slice(0, 2), '..\\pdfdest name{axt-0s} xyz', ...LINE.slice(2, 4), '..\\kern 0.0', ...LINE.slice(4)]
    expect(boxDiff(pageBoxes(logOf(v0)), pageBoxes(logOf(v1)))).toEqual([])
    // a break not taken, here and not there: nothing set
    const disc = [...LINE.slice(0, 3), '..\\discretionary', '...\\OT1/cmr/m/n/10 -', ...LINE.slice(3)]
    expect(boxDiff(pageBoxes(logOf(LINE)), pageBoxes(logOf(disc)))).toEqual([])
    // a formula's math node at a line's start, which a mark there keeps from being discarded: of no width
    expect(boxDiff(pageBoxes(logOf(LINE)), pageBoxes(logOf([...LINE.slice(0, 2), '..\\mathon', ...LINE.slice(2)])))).toEqual([])
    expect(boxDiff(pageBoxes(logOf(LINE)), pageBoxes(logOf([...LINE.slice(0, 2), '..\\mathon, surrounded 1.0', ...LINE.slice(2)])))).toHaveLength(1)
    const space = (g: string) => [...LINE.slice(0, 4), `..${g}`, ...LINE.slice(5)]
    expect(boxDiff(pageBoxes(logOf(space('\\glue(\\spaceskip) 3.0 plus 1.0'))), pageBoxes(logOf(space('\\glue 3.0 plus 1.0'))))).toEqual([])
  })
  it('the points are no difference: each engine\'s literal beside a destination, around a column\'s body; a literal of the paper\'s own is', () => {
    const v1 = ['\\vbox(633.0+0.0)x407.0', '.\\pdfliteral direct{/axt-bs1 ri}', '.\\hbox(6.94+2.22)x407.0, glue set 0.5', '..\\pdfdest name{axt-p0.1a} fitr width 0.0 height 0.0 depth 0.0', '..\\pdfliteral direct{/axt-p0.1a ri}', ...LINE.slice(2, 4), '..\\special{pdf:code /axt-p0.1b ri}', ...LINE.slice(4), '.\\pdfliteral direct{/axt-be1 ri}']
    expect(boxDiff(pageBoxes(logOf(LINE)), pageBoxes(logOf(v1)))).toEqual([])
    expect(boxDiff(pageBoxes(logOf(LINE)), pageBoxes(logOf([...LINE.slice(0, 3), '..\\pdfliteral direct{0 g}', ...LINE.slice(3)])))).toHaveLength(1)
    // a column's body: the penalty after its opening point is the point's; the glue put back after its closing point has
    // lost its name, no more; any other penalty or name is a difference
    const body = (head: string[], tail: string[]) => ['\\vbox(633.0+0.0)x407.0', '.\\vbox(600.0+0.0)x407.0', ...head, '..\\glue(\\topskip) 3.0', '..\\hbox(6.94+2.22)x407.0', '...\\OT1/cmr/m/n/10 W', ...tail]
    const v0 = body([], ['..\\glue(\\belowdisplayskip) 6.0 plus 2.0', '..\\penalty 150', '..\\glue 0.0 plus 1.0fil'])
    const v1b = body(['..\\pdfliteral direct{/axt-bs3 ri}', '..\\penalty 10000'], ['..\\pdfliteral direct{/axt-be3 ri}', '..\\glue 6.0 plus 2.0', '..\\penalty 150', '..\\glue 0.0 plus 1.0fil'])
    expect(boxDiff(pageBoxes(logOf(v0)), pageBoxes(logOf(v1b)))).toEqual([])
    expect(boxDiff(pageBoxes(logOf(v0)), pageBoxes(logOf(body(['..\\pdfliteral direct{/axt-p0.1a ri}', '..\\penalty 10000'], v0.slice(-3)))))).toHaveLength(1)
    // the run put back after the closing point need not end the list: the footnotes come after it (2608.12333)
    const notes = ['..\\glue 9.0 plus 4.0 minus 2.0', '..\\kern -3.0', '..\\hbox(0.4+0.0)x50.0']
    const v0n = body([], ['..\\penalty 0', '..\\glue(\\belowdisplayskip) 11.0 plus 3.0 minus 6.0', ...notes])
    const v1n = (put: string[]) => body(['..\\pdfliteral direct{/axt-bs4 ri}', '..\\penalty 10000'], ['..\\pdfliteral direct{/axt-be4 ri}', ...put, ...notes])
    expect(boxDiff(pageBoxes(logOf(v0n)), pageBoxes(logOf(v1n(['..\\penalty 0', '..\\glue 11.0 plus 3.0 minus 6.0']))))).toEqual([])
    // put back otherwise, it is a difference
    expect(boxDiff(pageBoxes(logOf(v0n)), pageBoxes(logOf(v1n(['..\\penalty 0', '..\\glue 11.0 plus 3.0 minus 5.0']))))).toHaveLength(1)
    // a name lost anywhere but in the run a closing point put back is a difference: in a list's middle, at its end
    const mid = (g: string) => body([], [g, '..\\hbox(6.94+2.22)x407.0', '..\\penalty 150'])
    expect(boxDiff(pageBoxes(logOf(mid('..\\glue(\\parskip) 6.0'))), pageBoxes(logOf(mid('..\\glue 6.0'))))).toHaveLength(1)
    expect(boxDiff(pageBoxes(logOf(body([], ['..\\glue(\\parskip) 6.0']))), pageBoxes(logOf(body([], ['..\\glue 6.0']))))).toHaveLength(1)
  })
  it('a font kern lost beside a heading\'s end mark: the page, and the mark nearest the difference', () => {
    const v1 = [LINE[0] as string, '.\\hbox(6.94+2.22)x407.0, glue set 0.49', ...LINE.slice(2, 6), '..\\pdfdest name{axt-h3e} fitr width 0.0 height 0.0 depth 0.0', '..\\OT1/cmr/m/n/10 .']
    expect(boxDiff(pageBoxes(logOf(['\\vbox(1.0+0.0)x2.0'], LINE)), pageBoxes(logOf(['\\vbox(1.0+0.0)x2.0'], v1)))).toEqual([{ page: 2, v0: '\\kern-0.135', v1: null, near: 'h3e', line: '0.0', inLine: ['h3e'] }])
  })
  it('every difference of a page, each with its own nearest mark: a heading\'s first, a citation\'s further on', () => {
    const two = (kern: string, word: string, marks: boolean) => ['\\vbox(633.0+0.0)x407.0', '.\\hbox(6.94+2.22)x407.0', '..\\OT1/cmr/m/n/10 g', ...(marks ? ['..\\pdfdest name{axt-h3e} fitr'] : []), ...(kern ? [`..${kern}`] : []), '..\\OT1/cmr/m/n/10 .',
      '.\\glue(\\baselineskip) 2.0', '.\\hbox(6.94+2.22)x407.0', ...Array.from({ length: 6 }, (_, i) => `..\\OT1/cmr/m/n/10 ${'abcdef'[i]}`), ...(marks ? ['..\\pdfdest name{axt-p4.2a} fitr'] : []), `..\\OT1/cmr/m/n/10 ${word}`]
    expect(boxDiff(pageBoxes(logOf(two('\\kern-0.135', 'x', false))), pageBoxes(logOf(two('', 'y', true))))).toEqual([
      { page: 1, v0: '\\kern-0.135', v1: null, near: 'h3e', line: '0.0', inLine: ['h3e'] },
      { page: 1, v0: '\\OT1/cmr/m/n/10 x', v1: '\\OT1/cmr/m/n/10 y', near: 'p4.2a', line: '0.2', inLine: ['p4.2a'] },
    ])
  })
  it('a difference with no mark beside it in its box looks in the boxes around it', () => {
    const v0 = ['\\vbox(633.0+0.0)x407.0', '.\\hbox(6.94+2.22)x407.0', '..\\OT1/cmr/m/n/10 a', '.\\hbox(6.94+2.22)x407.0', '..\\OT1/cmr/m/n/10 b']
    const v1 = ['\\vbox(633.0+0.0)x407.0', '.\\hbox(6.94+2.22)x407.0', '..\\pdfdest name{axt-p7.2b} fitr width 0.0 height 0.0 depth 0.0', '..\\OT1/cmr/m/n/10 a', '.\\hbox(6.94+2.22)x407.0', '..\\OT1/cmr/m/n/10 c']
    expect(boxDiff(pageBoxes(logOf(v0)), pageBoxes(logOf(v1)))).toEqual([{ page: 1, v0: '\\OT1/cmr/m/n/10 b', v1: '\\OT1/cmr/m/n/10 c', near: 'p7.2b', line: '0.1', inLine: [] }])
  })
  it('every difference counted, past fifty a page; a box that differs in its glue set alone is a difference', () => {
    const many = (w: string) => ['\\vbox(633.0+0.0)x407.0', ...Array.from({ length: 60 }, () => ['.\\hbox(6.94+2.22)x407.0', `..\\OT1/cmr/m/n/10 ${w}`]).flat()]
    const diff = boxDiff(pageBoxes(logOf(many('a'))), pageBoxes(logOf(many('b'))))
    expect(diff).toHaveLength(60)
    expect(new Set(diff.map(d => d.line)).size).toBe(60)
    const set = (g: string) => ['\\vbox(633.0+0.0)x407.0', `.\\hbox(6.94+2.22)x407.0, glue set ${g}`, '..\\OT1/cmr/m/n/10 a', '..\\glue 3.33333 plus 1.66666', '..\\OT1/cmr/m/n/10 b']
    expect(boxDiff(pageBoxes(logOf(set('0.5'))), pageBoxes(logOf(set('0.49'))))).toEqual([{ page: 1, v0: '\\hbox(6.94+2.22)x407.0, glue set 0.5', v1: '\\hbox(6.94+2.22)x407.0, glue set 0.49', near: null, line: '0.0', inLine: [] }])
  })
  it('a page v1 has more: a difference of its own', () => {
    expect(boxDiff(pageBoxes(logOf(LINE)), pageBoxes(logOf(LINE, LINE)))).toEqual([{ page: 2, v0: null, v1: '\\vbox(633.0+0.0)x407.0', near: null, line: null, inLine: [] }])
  })
})

describe('causesOf: each line TeX set otherwise, its cause from the evidence', () => {
  const d = (line: string, near: string | null, v0: string | null, v1: string | null) => ({ page: 3, line, near, v0, v1 })
  it('a heading\'s lost kern: every difference beside a heading\'s mark, one of them a kern v0 set and v1 did not', () => {
    expect(causesOf([d('0.1', 'h4e', '\\kern-0.135', null), d('0.1', 'h4s', '\\hbox(6.9+2.2)x400.0, glue set 0.5', '\\hbox(6.9+2.2)x400.0, glue set 0.4')])).toEqual(new Map([['3:0.1', 'heading kern']]))
  })
  it('the line set again at another stretch is the kern\'s doing: the kern paired with a glyph, glyphs expanded otherwise beside another mark (2608.25210)', () => {
    expect(causesOf([d('0.5', 'h189e', '\\kern-0.531', '\\T1/LinuxBiolinumT-TLF/m/it/9 (+5) .'), d('0.5', 'h189s', '\\T1/LinuxBiolinumT-TLF/m/it/9 (+7) C', '\\T1/LinuxBiolinumT-TLF/m/it/9 (+5) C'), d('0.5', '190s', '\\T1/ptm/m/n/9 (+7) a', '\\T1/ptm/m/n/9 (+5) a'), d('0.5', 'h189e', '\\T1/LinuxBiolinumT-TLF/m/it/9 (+7) .', null)]).get('3:0.5')).toBe('heading kern')
    // a glue (or a kern, a box) v1 sets in the kern's place is no lost kern: the re-review's 0.02 pt glue after h84e
    expect(causesOf([d('0.7', 'h84e', '\\kern-0.54993', '\\glue 0.02')]).get('3:0.7')).toBe('unexplained')
    expect(causesOf([d('0.7', 'h84e', '\\kern-0.54993', '\\hbox(0.0+0.0)x5.0')]).get('3:0.7')).toBe('unexplained')
    // nor a glyph v0 does not set elsewhere in the line
    expect(causesOf([d('0.8', 'h1e', '\\kern-0.5', '\\OT1/cmr/m/n/10 x')]).get('3:0.8')).toBe('unexplained')
    // a glyph of another letter beside another mark is no setting again
    expect(causesOf([d('0.6', 'h1e', '\\kern-0.5', null), d('0.6', '2s', '\\T1/ptm/m/n/9 (+7) a', '\\T1/ptm/m/n/9 (+5) b')]).get('3:0.6')).toBe('unexplained')
  })
  it('anything else is unexplained: a placeholder\'s mark beside it, no kern lost, a kern v1 added', () => {
    expect(causesOf([d('0.1', 'h4e', '\\kern-0.135', null), d('0.1', 'p2.3b', 'a', 'b')]).get('3:0.1')).toBe('unexplained')
    expect(causesOf([d('0.2', 'h4e', 'a', 'b')]).get('3:0.2')).toBe('unexplained')
    expect(causesOf([d('0.3', 'h4e', null, '\\kern0.02')]).get('3:0.3')).toBe('unexplained')
    expect(causesOf([d('0.4', null, '\\kern-0.1', null)]).get('3:0.4')).toBe('unexplained')
  })
})

describe('lostLines and classOfMark: the lines lost, and a mark\'s class', () => {
  it('lostLines: a line with an item moved, strict and joined; a run cut elsewhere loses nothing joined', () => {
    const a = [[item('We show', 72, 700, 30), item('that', 105, 700, 15), item('next', 72, 688, 15)]]
    const b = [[item('We show', 72, 700, 30), item('that', 105.5, 700, 15), item('next', 72, 688, 15)]]
    const lines = a.map(linesOf)
    expect(lostLines(a, b, a, b, lines)).toEqual({ strict: new Set(['1:0']), joined: new Set(['1:0']) })
    expect(lostLines(a, a, a, a, lines)).toEqual({ strict: new Set(), joined: new Set() })
    // the same glyphs cut into two items: lost strict, not joined
    const cut = [[item('We', 72, 700, 12), item(' show', 84, 700, 18), item('that', 105, 700, 15), item('next', 72, 688, 15)]]
    expect(lostLines(a, cut.map(p => p.filter(i => i.str.trim())), a, cut, lines).joined.size).toBe(0)
  })
  it('classOfMark: a heading\'s start and end are a heading\'s; columns and image frames none', () => {
    const units = [{ kind: 'heading', pieces: [] }, { kind: 'para', pieces: [{ t: 'text', s: 'A ' }, { t: 'ph', src: '$x$' }] }]
    expect(['h0s', 'h0e', 't2s', '1e', 'p1.1a', 'n1.4b', 'c1-3', 'g2a'].map(n => classOfMark(n, units))).toEqual(['heading', 'heading', 'cell', 'unit', 'math', 'footnote', null, null])
  })
})

describe('the gate\'s own steps: v0\'s destinations, the trace\'s judging, a class to switch off', () => {
  it('withFitr: LAYOUT_TEX\'s destination right after MARK_DEF, on its line; nothing found, it throws', () => {
    const main = 'DRAFT\nMARKDEF\nEND\n\\documentclass{article}\n'
    const tex = 'A\\ifdefined\\XeTeXrevision\\else\\ifdefined\\pdfextension\\def\\axt@dest#1{fitr}\\else x\\fi\\fi\\fiB'
    const out = withFitr(main, 'MARKDEF\n', tex)
    expect(out).toBe('DRAFT\nMARKDEF\n\\makeatletter\\ifdefined\\XeTeXrevision\\else\\ifdefined\\pdfextension\\def\\axt@dest#1{fitr}\\else x\\fi\\fi\\fi\\makeatotherEND\n\\documentclass{article}\n')
    expect(out.split('\n')).toHaveLength(main.split('\n').length)
    expect(() => withFitr(main, 'NOPE', tex)).toThrow('no MARK_DEF')
    expect(() => withFitr(main, 'MARKDEF\n', 'no definition')).toThrow('not found')
  })
  it('traced: both trace compiles whole, each shipping out every page of its PDF, as many as its compile\'s', () => {
    const t = (pages: number, pdfPages: number, ok = true) => ({ ok, pages, pdfPages })
    expect(traced(t(34, 34), t(34, 34), 34, 34)).toBe(true)
    expect(traced(t(30, 30), t(30, 30), 34, 34)).toBe(false)
    expect(traced(t(33, 34), t(34, 34), 34, 34)).toBe(false)
    expect(traced(t(34, 34, false), t(34, 34), 34, 34)).toBe(false)
    expect(traced(null, t(34, 34), 34, 34)).toBe(false)
  })
  it('switchOffOf: a placeholder class whose marks lose more lines than they carry, by either count; not a unit\'s own', () => {
    expect(switchOffOf({ cite: { lines: 3, carried: 1, lost: 2 }, math: { lines: 9, carried: 9 }, macro: { lines: 1, carried: 0, texLost: 1 }, heading: { lines: 1, carried: 0, texLost: 1 } }, ['cite', 'math', 'macro'])).toEqual(['cite', 'macro'])
    expect(switchOffOf(undefined, ['cite'])).toEqual([])
  })
})

describe('attribute: what a mark name is', () => {
  const units = [{ kind: 'heading', pieces: [] }, { kind: 'para', pieces: [{ t: 'text', s: 'A ' }, { t: 'ph', src: '\\cite{a}' }] }]
  it('a heading\'s end, a cell, a unit mark, a placeholder by its class', () => {
    expect(attribute('h0e', units)).toBe('heading end')
    expect(attribute('h0s', units)).toBe('heading start')
    expect(attribute('t4s', units)).toBe('cell')
    expect(attribute('1s', units)).toBe('unit')
    expect(attribute('p1.1b', units)).toBe('cite')
    expect(attribute('n1.1a', units)).toBe('footnote')
    expect(attribute(null, units)).toBe('none')
  })
})

describe('verdictOf and regressions: the check can fail', () => {
  const ok = { v0: 'ok' as const, v1: 'ok' as const, traced: true, lost: { strict: 0, joined: 0, tex: 0 } }
  it('clean, or switched where TeX\'s answers took marks off, while no line is lost', () => {
    expect(verdictOf(ok)).toBe('clean')
    expect(verdictOf({ ...ok, switched: ['\\cite'] })).toBe('switched')
  })
  it('accepted where every loss has an accepted cause: a heading\'s kern, a PDF-only offset', () => {
    expect(verdictOf({ ...ok, lost: { strict: 1, joined: 0, tex: 1 }, cause: 'tex', causes: { accepted: 1, unexplained: 0 } })).toBe('accepted')
    expect(verdictOf({ ...ok, lost: { strict: 1, joined: 0, tex: 0 }, cause: 'pdf-only' })).toBe('accepted')
  })
  it('failing where a loss has no accepted cause, a loss was not traced, v1 did not compile; a switched paper\'s loss is judged too', () => {
    expect(verdictOf({ ...ok, lost: { strict: 0, joined: 0, tex: 1 }, cause: 'tex', causes: { accepted: 0, unexplained: 1 } })).toBe('failing')
    expect(verdictOf({ ...ok, lost: { strict: 30, joined: 30, tex: 8 }, cause: 'tex', causes: { accepted: 2, unexplained: 6 } })).toBe('failing')
    expect(verdictOf({ ...ok, traced: false, lost: { strict: 1, joined: 1, tex: 0 } })).toBe('failing')
    expect(verdictOf({ ...ok, v1: 'failed' })).toBe('failing')
    expect(verdictOf({ ...ok, switched: ['\\cite'], lost: { strict: 46, joined: 46, tex: 14 }, cause: 'tex', causes: { accepted: 0, unexplained: 14 } })).toBe('failing')
    expect(verdictOf({ ...ok, v0: 'failed' })).toBe('passed over')
  })
  it('regressions: a worse verdict, more lines lost, more unit marks moved than the record\'s row', () => {
    const was: Row[] = [{ id: 'a', v0: 'ok', verdict: 'clean', lost: { strict: 0, joined: 0, tex: 0 }, unitMarksMoved: 0 }, { id: 'b', v0: 'ok', verdict: 'accepted', lost: { strict: 1, joined: 1, tex: 1 }, unitMarksMoved: 1 }]
    const [a, b] = was as [Row, Row]
    expect(regressions([{ ...a, verdict: 'accepted', lost: { strict: 0, joined: 0, tex: 1 } }, { ...b }], was)).toEqual(['a: clean → accepted', 'a: lines lost tex 0 → 1'])
    expect(regressions([{ ...b, unitMarksMoved: 2 }, { id: 'c', v0: 'ok', verdict: 'failing' }], was)).toEqual(['b: unit marks moved 1 → 2'])
    expect(regressions([{ ...a, verdict: 'switched' }], was)).toEqual([])
    // a figure the record has not: nothing to regress from
    expect(regressions([{ ...b, lost: { strict: 1, joined: 1, tex: 1, all: 2 } }], was)).toEqual([])
  })
})
