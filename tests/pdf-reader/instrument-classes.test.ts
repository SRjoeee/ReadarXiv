// The instrument adapter states each element's class as today's reader reads its source (layer2.mjs phClass2, texToText2,
// resolvePlaceholders' symbol and footnote mark), so that the part carries it and no rule of the typesetter reads a source.
import { describe, expect, it } from 'vitest'
import { glueOf as todayGlue, phClassProven, texToText2 } from '../../src/pdf-reader/engine/layer-proto/layer2.mjs'
import { FORCED_BREAK as todayBreak } from '../../src/pdf-reader/engine/layer-proto/tex.mjs'
import {
  besideEmpty,
  classesOf,
  FORCED_BREAK,
  glueOf,
  glyphPiecesOf,
  inklessPieces,
  placesOf,
  spansOf,
  textsOf,
} from '../../src/pdf-reader/engine/pipeline/instrument.mjs'

const ph = (src: string) => ({ t: 'ph', src })
/** a piece's class alone, the source's other facts aside */
const classOnly = ([k, c]: [string, Record<string, unknown>]) => {
  const { glue, cmd, bare, brk, note, same, colour, nested, ...rest } = c
  void [glue, cmd, bare, brk, note, same, colour, nested]
  return [k, rest] as const
}
describe('the instrument adapter’s element classes', () => {
  it('states the class, the copy text, a symbol’s drawing and a footnote’s mark, by piece id', () => {
    const got = new Map(
      (classesOf as unknown as (p: unknown[]) => [string, Record<string, unknown>][])([
        { t: 'text', s: 'see ' },
        ph('\\cite{a,b}'),
        ph('\\ref{fig:1}'),
        ph('$x^2$'),
        ph('$\\times$'),
        ph('$^\\dagger$'),
        ph('\\footnotemark[3]'),
        ph('\\quad'),
        ph('\\ie'),
        ph('$\\dmodel$'),
        ph('\\%'),
      ]).map(classOnly),
    )
    expect(got.get('0')).toBeUndefined()
    expect(got.get('1')).toEqual({ cls: 'cite', copy: '[·]' })
    expect(got.get('2')).toEqual({ cls: 'num', copy: '?' })
    expect(got.get('3')).toEqual({ cls: 'other', copy: 'x²' })
    expect(got.get('4')).toEqual({ cls: 'symbol', copy: '×', sym: ['×'] })
    expect(got.get('5')).toEqual({ cls: 'symbol', copy: '^†', sym: ['†', true] })
    expect(got.get('6')).toEqual({ cls: 'num', copy: '³', mark: true })
    expect(got.get('7')).toEqual({ cls: 'space', copy: ' ' })
    expect(got.get('8')).toEqual({ cls: 'macro', copy: 'i.e.' })
    expect(got.get('9')).toEqual({ cls: 'other', unknown: true })
    expect(got.get('10')).toEqual({ cls: 'symbol', copy: '%', sym: ['%'] })
    expect(new Map((classesOf([ph('\\url{http://a.b/c}')]) as unknown as [string, Record<string, unknown>][]).map(classOnly)).get('0')).toEqual({ cls: 'other', copy: 'http://a.b/c', literal: true })
  })
  it('reads each source as layer2.mjs does (its copy held equal to phClassProven and texToText2)', () => {
    const srcs = ['\\cite{a,b}', '\\citep[p.~3]{a}', '\\ref{x}', '\\eqref{e}', '$x$', '$\\sqrt{\\dmodel}$', '$\\frac{a}{b}$', '$\\sum_{\\alpha}^{\\beta}$', '$\\Sigma$', '\\~{n}', '\\"u', '$\\downarrow$', '\\[ a = b \\]', '\\begin{equation}y=F(x)\\label{eq:1}\\end{equation}', '\\bert{}', '$\\cla$', '\\textbf{x}', '\\hspace{1em}', '\\vspace{-2mm}', '\\&', '\\\\', '$$', '$^{1}$', '\\url{http://a.b}']
    for (const [k, c] of classesOf(srcs.map(ph))) {
      const src = srcs[Number(k)]!
      const want = phClassProven(src)
      expect([c.cls, c.unknown ?? false, c.copy ?? '']).toEqual([want.cls, want.unknown ?? false, texToText2(src) || ''])
    }
  })
  it('states what the other rules read of a source: its glue, command, a forced break, a citation’s note, its identity, its colour', () => {
    const pieces = [
      ph('\\,'),
      ph('\\hspace{2em}'),
      ph('\\bfseries'),
      ph('\\\\'),
      ph('\\citep[see][p.~3]{a}'),
      ph('\\cref*{fig:1}'),
      ph('\\citep[see][p.~3]{a}'),
      { t: 'open', src: '\\href{http://a.b}{' },
      { t: 'text', s: 'x' },
      { t: 'close', src: '}' },
      ph('\\color{red}'),
    ]
    const got = new Map(classesOf(pieces, new Map([[10, 0xff0000]])))
    expect(got.get('0')).toMatchObject({ glue: [1 / 6, 'em'] })
    expect(got.get('1')).toMatchObject({ glue: [2, 'em', 1], cmd: 'hspace' })
    expect(got.get('2')).toMatchObject({ cmd: 'bfseries', bare: true })
    expect(got.get('3')).toMatchObject({ brk: true })
    expect(got.get('4')).toMatchObject({ cmd: 'citep', note: 'p. 3' })
    expect(got.get('4')!.same).toBeUndefined()
    expect(got.get('5')).toMatchObject({ cmd: 'cref*' })
    expect(got.get('6')).toMatchObject({ same: '4' })
    expect(got.get('10')).toMatchObject({ cmd: 'color', colour: 0xff0000 })
    expect(spansOf(pieces, new Map([[7, 0x0000ff]]))).toEqual([
      ['7', { cmd: 'href', colour: 0x0000ff, to: { url: 'http://a.b/' } }],
    ])
  })
  it('states a link group’s target where its source names it, as today’s link match reads it (linkKindOf, urlOf)', () => {
    const open = (src: string) => ({ t: 'open', src })
    const close = { t: 'close', src: '}' }
    const x = { t: 'text', s: 'x' }
    const pieces = [
      // (an \href's address, TeX's escapes undone, in the WHATWG parser's form; with hyperref's options)
      open('\\href{https://Example.org/a\\_b\\#c}{'),
      x,
      close,
      open('\\href[pdfnewwindow]{mailto:a@b.org}{'),
      x,
      close,
      // (a \hyperlink's destination by its name, as the part states a named one: JSON)
      open('\\hyperlink{intro}{'),
      x,
      close,
      // (a \url group's text)
      open('\\url{'),
      { t: 'text', s: 'https://example.org/x' },
      close,
      // (none: a \hyperref, whose destination is its label's anchor; an address written with a command, which only TeX expands;
      // one that is no absolute URL; a style group)
      open('\\hyperref[sec:a]{'),
      x,
      close,
      open('\\href{\\myurl/x}{'),
      x,
      close,
      open('\\href{paper.pdf}{'),
      x,
      close,
      open('\\textbf{'),
      x,
      close,
    ]
    expect(spansOf(pieces).map(([k, c]) => [k, c.to ?? null])).toEqual([
      ['0', { url: 'https://example.org/a_b#c' }],
      ['3', { url: 'mailto:a@b.org' }],
      ['6', { dest: '"intro"' }],
      ['9', { url: 'https://example.org/x' }],
      ['12', null],
      ['15', null],
      ['18', null],
      ['21', null],
    ])
  })
  it('reads glue and forced breaks as today’s functions do (its copies held equal to layer2.mjs glueOf and tex.mjs FORCED_BREAK)', () => {
    const srcs = ['\\,', '\\:', '\\;', '\\enspace', '\\thinspace', '\\quad', '\\qquad', '\\hspace{1em}', '\\hspace*{0.5cm}', '\\hskip 3pt plus 1pt', '\\kern-2pt', '\\kern 2bp', '\\hspace{\\fill}', '\\\\', '\\\\[2pt]', '\\\\*', '\\newline', '\\linebreak', '$x$']
    for (const s of srcs) {
      expect(glueOf(s)).toEqual(todayGlue(s))
      expect(FORCED_BREAK.test(s)).toBe(todayBreak.test(s))
    }
  })
})

describe('the instrument adapter’s places', () => {
  it('closes a head macro’s span at its unit’s start point, opens a trailing one’s at its unit’s end point', () => {
    // (a head macro's point \\axthpk's, p3.0a, closed by 3s; two head pieces, p4.0a and p4.1a, each to the next; a trailing
    // macro's point after its group, p5.2g, its span from 5e; a placeholder's own two points as before; an opening alone after the
    // start no head piece's)
    const pt = (name: string, glyph: number) => ({ name, glyph })
    const pages = [
      { points: [pt('p3.0a', 0), pt('3s', 5), pt('p3.2a', 8), pt('3e', 12), pt('p4.0a', 12), pt('p4.1a', 16), pt('4s', 20)] },
      { points: [pt('5s', 0), pt('p5.1a', 3), pt('p5.1b', 4), pt('5e', 9), pt('p5.2g', 9)] },
    ]
    const by = (u: number, k: string) => placesOf(pages, 6).filter(x => x.unit === u && x.piece === k).map(x => [x.page, x.glyph, x.end])
    expect(by(3, '0')).toEqual([[1, 0, false], [1, 5, true]])
    expect(by(3, '2')).toEqual([[1, 8, false]])
    expect(by(4, '0')).toEqual([[1, 12, false], [1, 16, true]])
    expect(by(4, '1')).toEqual([[1, 16, false], [1, 20, true]])
    expect(by(5, '1')).toEqual([[2, 3, false], [2, 4, true]])
    expect(by(5, '2')).toEqual([[2, 9, false], [2, 9, true]])
    // (no glyph but a painted box between: an icon the macro set, so no span is stated; 2610.19159v1's github logo)
    const icon = [{ points: [{ name: 'p6.0a', glyph: 4, box: 2 }, { name: '6s', glyph: 4, box: 3 }, { name: '6e', glyph: 9, box: 3 }, { name: 'p6.3g', glyph: 9, box: 4 }] }]
    const got = placesOf(icon, 7)
    expect(got.map(x => [x.piece, x.end])).toEqual([['0', false]])
  })
})

describe('the texts the marking’s probe showed, as the adapter reads them', () => {
  // (the box and the lab hand the adapter markedOfPaper's options, whose texts are readInkTexts' [source, text] pairs; the marks
  // file holds them flat. Read as flat, the pairs were an empty map: no macro's text reached the ownership, and a cell that opens
  // with a paper's macro (1810.04805v2's `\bertbase (Single)`, MR 5b) kept its macro's ink in no group, its table the original's)
  it('takes markedOfPaper’s pairs, the marks file’s flat list and a Map alike', () => {
    const want = new Map([
      ['\\bertbase', 'BERTBASE'],
      ['\\natexlab{a}', 'a'],
    ])
    expect(textsOf([...want])).toEqual(want)
    expect(textsOf([...want].flat())).toEqual(want)
    expect(textsOf(want)).toBe(want)
    expect(textsOf(undefined)).toBeNull()
    expect(textsOf([])).toEqual(new Map())
  })
})

describe('the piece of a cell’s lead macro’s glyphs (own.mjs MR 5b’s `.p`, before the start point, no point of its own)', () => {
  // (a cell that opens with a paper's macro: no mark goes before it (a mark before \multicolumn's \omit is refused), so its ink
  // stands before the cell's start point with no point of its unit open; own.mjs claims it `.p` by the text the probe showed the
  // macro sets, and its piece is the lead piece that text spells: 1810.04805v2 p7 `\bertbase (Single)`, whose element had no ink)
  const glyphs = (s: string) => [...s].map((u) => ({ u }))
  const at = (n: number, end: number) => ({ points: [{ name: 't5s', glyph: n }, { name: 't5e', glyph: end }] })
  const cell = (...pieces: unknown[]) => {
    const units: unknown[] = []
    units[5] = { kind: 'cell', pieces }
    return units
  }
  const texts = new Map([
    ['\\bertbase', 'BERTBASE'],
    ['\\cmark', 'OK'],
  ])
  it('gives the lead piece the glyphs its text spells, nearest the start first', () => {
    const units = cell(ph('\\bertbase'), { t: 'text', s: ' (Single)' })
    const row = [...Array(8).fill('u5.p'), ...Array(8).fill('u5')]
    const got = glyphPiecesOf({ ...at(8, 16), glyphs: glyphs('BERTBASE(Single)') }, row, { units, texts, names: new Set(['t5s', 't5e']) })
    expect([...got]).toEqual([...Array(8).fill(0), ...Array(8).fill(-1)])
  })
  it('splits a lead of two macros by their texts, a text symbol between them the text’s', () => {
    const units = cell(ph('\\cmark'), ph('\\#'), ph('\\bertbase'), { t: 'text', s: ' x' })
    const row = ['u5.p', 'u5.p', 'u5', ...Array(8).fill('u5.p'), 'u5']
    const got = glyphPiecesOf({ ...at(11, 12), glyphs: glyphs('OK#BERTBASEx') }, row, { units, texts, names: new Set(['t5s', 't5e']) })
    expect([...got]).toEqual([0, 0, -1, ...Array(8).fill(2), -1])
  })
  it('reads a head piece’s glyphs against its text case aside, as today’s maker finds it (small capitals)', () => {
    // (2608.06701v1 p2: a paragraph that opens with `\\approach`, \\textsc{LivePlan}: the probe shows "LivePlan", the page's
    // small capitals read "LIVEPLAN"; make.mjs besideMarks compares both in lower case (charsOf), so its piece's ink was found
    // and drawn as the page reads it, where the probe's letters stood in for it with none)
    const para: unknown[] = []
    para[5] = { kind: 'para', pieces: [ph('\\approach'), { t: 'text', s: ' has three parts.' }] }
    const row = [...Array(8).fill('u5.p'), ...Array(4).fill('u5')]
    const got = glyphPiecesOf({ ...at(8, 12), glyphs: glyphs('LIVEPLANhas.') }, row, {
      units: para,
      texts: new Map([['\\approach', 'LivePlan']]),
      names: new Set(['t5s', 't5e']),
    })
    expect([...got]).toEqual([...Array(8).fill(0), ...Array(4).fill(-1)])
  })
  it('gives none where the text does not spell the run, or the piece has a point of its own', () => {
    const units = cell(ph('\\bertbase'), { t: 'text', s: ' (Single)' })
    const row = [...Array(9).fill('u5.p'), 'u5']
    const pg = { ...at(9, 10), glyphs: glyphs('BERTLARGEx') }
    expect([...glyphPiecesOf(pg, row, { units, texts, names: new Set() })]).toEqual(Array(10).fill(-1))
    const own = { points: [{ name: 'p5.0a', glyph: 0 }, ...at(8, 16).points], glyphs: glyphs('BERTBASE(Single)') }
    const row2 = [...Array(8).fill('u5.p'), ...Array(8).fill('u5')]
    expect([...glyphPiecesOf(own, row2, { units, texts, names: new Set(['p5.0a']) })]).toEqual([...Array(8).fill(0), ...Array(8).fill(-1)])
  })
})

describe('the piece of a glyph a page after its opening point (TeX’s stream runs on across a page break)', () => {
  // (marks.mjs puts a placeholder's opening point before the glue in front of it, so where TeX breaks the line there and the
  // break is a page's, the point `p<u>.<k>a` stands at the previous page's end and the piece's glyphs on the next: read one page
  // at a time, no point of the unit was open there and every glyph got no piece, held as A's ink in no group, the translation
  // drawn over it (2608.16117v1 p11's 𝒫ᵢ(1) = (α₁, β₁), 2609.36054v2 p13, 2610.20967v1 p4); and a piece TeX broke over the
  // break, its glyphs on both pages (2610.10069v1 p10's citation), lost the next page's)
  const glyphs = (s: string) => [...s].map((u) => ({ u }))
  it('keeps a point opened on one page open on the next, until it closes', () => {
    const open = new Map()
    const p1 = { points: [{ name: 'p5.3a', glyph: 4 }], glyphs: glyphs('With') }
    const p2 = { points: [{ name: 'p5.3b', glyph: 3 }], glyphs: glyphs('x=1 is') }
    expect([...glyphPiecesOf(p1, Array(4).fill('u5'), { open })]).toEqual(Array(4).fill(-1))
    const got = glyphPiecesOf(p2, [...Array(3).fill('u5.p'), ...Array(3).fill('u5')], { open })
    expect([...got]).toEqual([3, 3, 3, -1, -1, -1])
  })
  it('gives a piece broken over the break its glyphs on both pages', () => {
    const open = new Map()
    const p1 = { points: [{ name: 'p5.1a', glyph: 2 }], glyphs: glyphs('a (Mc') }
    const p2 = { points: [{ name: 'p5.1b', glyph: 7 }], glyphs: glyphs('Fadden) is') }
    expect([...glyphPiecesOf(p1, ['u5', 'u5', 'u5.p', 'u5.p', 'u5.p'], { open })]).toEqual([-1, -1, 1, 1, 1])
    const got = glyphPiecesOf(p2, [...Array(7).fill('u5.p'), ...Array(3).fill('u5')], { open })
    expect([...got]).toEqual([...Array(7).fill(1), -1, -1, -1])
  })
})

describe('a head or tail macro that sets nothing on its unit’s line (today’s maker, make.mjs besideMarks)', () => {
  // (the marking gives a paper's macro at a unit's head no point, and one after its last word an opening point alone where its
  // closing one would follow a control word: TeX set its ink, if any, before the start mark or after the end mark, never on the
  // unit's own lines; where no glyph of no unit's stands beside the mark on its line, nothing of it is there, EMPTY. 2610.21880v1
  // p2 u23 `...overhead.\endgroup`, 2609.20976v1 p12 u65 `\acknowledgments` (its heading on the line above), 2610.10069v1 p5
  // u29 `\begingroup`: their units stayed English, unproven)
  type G = { u: string; x0: number; x1: number; y: number; size: number }
  const line = (s: string, x: number, y: number, size = 10): G[] => [...s].map((u, i) => ({ u, x0: x + 5 * i, x1: x + 5 * i + 5, y, size }))
  const pt = (name: string, glyph: number) => ({ name, glyph })
  const unitsOf = (pieces: unknown[]) => {
    const units: unknown[] = []
    units[5] = { kind: 'para', pieces }
    return units
  }
  const classes = (units: unknown[]) => units.map((u) => (u ? new Map(classesOf((u as { pieces: never[] }).pieces)) : null))
  const run = (pages: unknown[], rows: (string | null)[][], units: unknown[], known = new Set<string>()) =>
    besideEmpty(pages as never, rows, units as never, { classes: classes(units) as never, known })
  const para = [{ t: 'text', s: 'a word.' }, ph('\\endgroup')]
  const tail = (after: G[], afterRow: (string | null)[]) => ({
    pages: [{ glyphs: [...line('aword.', 72, 700), ...after], points: [pt('5s', 0), pt('5e', 6), pt('p5.1a', 6)], view: [0, 0, 612, 792] }],
    rows: [[...Array(6).fill('u5'), ...afterRow]],
  })
  it('states a tail macro empty where nothing of no unit’s stands right of the end mark on its line', () => {
    // (the next unit's glyphs on the next line; a glyph of no unit's far right, past two of its em)
    const { pages, rows } = tail([...line('Next', 72, 688), ...line('x', 140, 700)], [...Array(4).fill('u6'), null])
    expect(run(pages, rows, unitsOf(para))).toEqual([{ unit: 5, piece: '1' }])
  })
  it('states none where a glyph of no unit’s stands right of it within two of its em, or the unit took glyphs past its end mark', () => {
    const near = tail(line('xy', 106, 700), [null, null])
    expect(run(near.pages, near.rows, unitsOf(para))).toEqual([])
    // (closing punctuation TeX set after the end mark, the unit's own (MR 4c): the tail is not looked at)
    const past = tail(line(')', 102, 700), ['u5'])
    expect(run(past.pages, past.rows, unitsOf(para))).toEqual([])
  })
  it('reads only the end mark’s column on a page of two', () => {
    // (2610.21880v1 p2: a column's last line ends near the column's edge; the glyphs of no unit's beside it, within two em, are
    // the other column's, past the page's middle)
    const two = tail(line('seq', 312, 700), [null, null, null])
    two.pages[0]!.glyphs = [...line('aword.', 272, 700), ...line('seq', 312, 700)]
    expect(run(two.pages, two.rows, unitsOf(para))).toEqual([])
    two.pages[0]!.points.push(pt('c2-1', 0))
    expect(run(two.pages, two.rows, unitsOf(para))).toEqual([{ unit: 5, piece: '1' }])
  })
  it('states a head macro empty where nothing of no unit’s stands left of the start mark on its line', () => {
    // (\acknowledgments, its heading of no unit's on the line above; \sloppy, which the marking gives no class at all)
    const units = unitsOf([ph('\\acknowledgments'), ph('\\sloppy'), { t: 'text', s: '\nWe thank.' }])
    const pages = [{ glyphs: [...line('Acknowledgments', 72, 724, 12), ...line('Wethank.', 72, 700)], points: [pt('5s', 15), pt('5e', 23)], view: [0, 0, 612, 792] }]
    const rows = [[...Array(15).fill(null), ...Array(8).fill('u5')]]
    expect(run(pages, rows, units)).toEqual([{ unit: 5, piece: '1' }, { unit: 5, piece: '0' }])
    // (glyphs of no unit's right before the start: TeX set the macro's text there, which its probe did not spell: not known)
    const sys = [{ glyphs: [...line('TensorCast', 22, 700), ...line('Wethank.', 72, 700)], points: [pt('5s', 10), pt('5e', 18)], view: [0, 0, 612, 792] }]
    expect(run(sys, [[...Array(10).fill(null), ...Array(8).fill('u5')]], units)).toEqual([])
  })
  it('passes over pieces whose ink or text is known, and stops at inline code or a footnote’s call', () => {
    const pages = [{ glyphs: line('Wethank.', 72, 700), points: [pt('5s', 0), pt('5e', 8)], view: [0, 0, 612, 792] }]
    const rows = [Array(8).fill('u5')]
    const units = unitsOf([ph('\\begingroup'), ph('\\texttt{x}'), ph('\\sloppy'), { t: 'text', s: ' We thank.' }])
    // (nearest the mark first: \sloppy, then the code, which ends the look)
    expect(run(pages, rows, units)).toEqual([{ unit: 5, piece: '2' }])
    expect(run(pages, rows, units, new Set(['5|2']))).toEqual([])
    const probed = unitsOf([ph('\\sys'), { t: 'text', s: ' We thank.' }])
    const cs = classes(probed)
    ;(cs[5] as Map<string, { text?: string }>).get('0')!.text = 'TensorCast'
    expect(besideEmpty(pages as never, rows, probed as never, { classes: cs as never, known: new Set() })).toEqual([])
  })
})

describe('the pieces TeX sets no ink for, as the instrument states them (Instrument `empty`)', () => {
  const units: unknown[] = []
  units[3] = {
    kind: 'reference',
    pieces: [
      { t: 'text', s: '\nA. Author and B. Author.\n' },
      ph('\\newblock'),
      { t: 'text', s: ' A title.\n' },
      ph('\\newblock'),
      { t: 'text', s: ' In ' },
      ph('\\sys'),
      ph('~'),
      ph('\\ttfamily'),
      { t: 'text', s: ', 2019.' },
    ],
  }
  const classes = units.map((u) => (u ? new Map(classesOf((u as { pieces: never[] }).pieces)) : null))
  it('states a text macro the marking never marks, its rendering never ink (marks.mjs classOf null), as today’s reader drew it', () => {
    // (a .bbl's \newblock, a declaration: today's file held no row of it and its reader drew it as nothing, proven (tex.mjs
    // inklessOf); stated nothing, the typesetter left every BibTeX entry unproven, English: 2010.11929v2 p10, 20 of 20)
    expect(classes[3]!.get('1')).toMatchObject({ cls: 'umacro', unknown: true })
    expect(inklessPieces(units as never, { classes: classes as never })).toEqual([
      { unit: 3, piece: '1' },
      { unit: 3, piece: '3' },
      { unit: 3, piece: '7' },
    ])
  })
  it('states a paper’s macro the marking marks only where its probe said it sets none; a space never', () => {
    // (\sys is marked: TeX may set its glyphs as the unit's text, which only the probe tells)
    expect(inklessPieces(units as never, { classes: classes as never, inkless: ['\\sys'] })).toEqual([
      { unit: 3, piece: '1' },
      { unit: 3, piece: '3' },
      { unit: 3, piece: '5' },
      { unit: 3, piece: '7' },
    ])
  })
})
