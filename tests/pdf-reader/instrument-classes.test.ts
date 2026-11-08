// The instrument adapter states each element's class as today's reader reads its source (layer2.mjs phClass2, texToText2,
// resolvePlaceholders' symbol and footnote mark), so that the part carries it and no rule of the typesetter reads a source.
import { describe, expect, it } from 'vitest'
import { glueOf as todayGlue, phClassProven, texToText2 } from '../../src/pdf-reader/engine/layer-proto/layer2.mjs'
import { FORCED_BREAK as todayBreak } from '../../src/pdf-reader/engine/layer-proto/tex.mjs'
import {
  boundedEmpty,
  classesOf,
  FORCED_BREAK,
  glueOf,
  glyphPiecesOf,
  inklessPieces,
  outsidePieces,
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

describe('the piece of a footnote call’s mark TeX gave no point after the unit’s last word (own.mjs MR 4b’s `.p`)', () => {
  // (2610.35877v1's abstract ends `…deployment law\footnotemark`: no mark around the call (TeX's answer), its raised "1" right after
  // the end point claimed `.p` with no point of its unit open, so no piece: the element had no ink, and with an element of no ink
  // and none stated set the abstract was left English. Its glyphs are the one tail piece's)
  const glyphs = (s: string) => [...s].map((u) => ({ u }))
  const unitsOf = (pieces: unknown[]) => {
    const units: unknown[] = []
    units[5] = { kind: 'abstract', pieces }
    return units
  }
  const pg = { points: [{ name: '5s', glyph: 0 }, { name: '5e', glyph: 5 }], glyphs: glyphs('step.1') }
  const row = [...Array(5).fill('u5'), 'u5.p']
  it('gives them to the unit’s one tail piece, a footnote’s call of no point', () => {
    const got = glyphPiecesOf(pg, row, { units: unitsOf([{ t: 'text', s: 'step.' }, ph('\\footnotemark'), { t: 'text', s: '\n' }]), names: new Set(['5s', '5e']) })
    expect([...got]).toEqual([-1, -1, -1, -1, -1, 1])
  })
  it('gives them the call where an earlier piece of the unit closed on the page (S1’s last opened piece is no owner past the end)', () => {
    // (2610.35877v1 p1: the "1" went to the abstract's piece 15, closed long before, its last opened point on the page)
    const units = unitsOf([{ t: 'text', s: 'a ' }, ph('$x$'), { t: 'text', s: '.' }, ph('\\footnotemark')])
    const page = { points: [{ name: '5s', glyph: 0 }, { name: 'p5.1a', glyph: 1 }, { name: 'p5.1b', glyph: 2 }, { name: '5e', glyph: 3 }], glyphs: glyphs('ax.1') }
    const got = glyphPiecesOf(page, ['u5', 'u5.p', 'u5', 'u5.p'], { units, names: new Set(['5s', 'p5.1a', 'p5.1b', '5e']) })
    expect([...got]).toEqual([-1, 1, -1, 3])
  })
  it('gives none where the tail holds two calls, or the call has a point of its own', () => {
    const two = unitsOf([{ t: 'text', s: 'step.' }, ph('\\footnotemark'), ph('\\footnotemark')])
    expect([...glyphPiecesOf(pg, row, { units: two, names: new Set(['5s', '5e']) })]).toEqual(Array(6).fill(-1))
    const marked = unitsOf([{ t: 'text', s: 'step.' }, ph('\\footnotemark')])
    expect([...glyphPiecesOf(pg, row, { units: marked, names: new Set(['5s', '5e', 'n5.1a']) })]).toEqual(Array(6).fill(-1))
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

describe('a piece with no point of its own, between the nearest points TeX shipped around it (Instrument `empty`)', () => {
  // (TeX's points bound what TeX set: every piece of a unit lies between the nearest two in its unit's source order, a piece's
  // own, the unit's start and end, else the page's stream's; nothing of the unit's or of no unit's between them, the pieces
  // between set nothing. 2402.10294v1's ACM references: `\urldef\tempurl` after `\showISBNx`, a macro that may read ahead, have
  // no point; the end point and `\showDOI`'s opening one hold nothing between them, wherever TeX broke the line before the DOI,
  // which a reading of the line beside the end mark took for the entry's ink: 19 of its 86 references English)
  type G = { u: string }
  const glyphs = (s: string): G[] => [...s].map((u) => ({ u }))
  const pt = (name: string, glyph: number, box = 0) => ({ name, glyph, box })
  const owners = (row: (string | null)[]) => {
    const O = { unit: new Int32Array(row.length).fill(-1), role: new Uint8Array(row.length), piece: new Int32Array(row.length).fill(-1) }
    row.forEach((g, j) => {
      const m = /^u(\d+)(?:\.(\d+))?$/.exec(g ?? '')
      if (!m) return
      O.unit[j] = Number(m[1])
      O.role[j] = m[2] === undefined ? 1 : 2
      if (m[2] !== undefined) O.piece[j] = Number(m[2])
    })
    return O
  }
  const unitsOf = (pieces: unknown[], at = 5) => {
    const units: unknown[] = []
    units[at] = { kind: 'reference', pieces }
    return units
  }
  const run = (pages: { glyphs: G[]; boxes?: number[]; points: unknown[] }[], rows: (string | null)[][], units: unknown[]) =>
    boundedEmpty(
      pages.map((pg) => ({ boxes: [], ...pg })) as never,
      units as never,
      { glyphs: rows.map(owners), boxes: pages.map(() => owners([])) } as never,
    )
  // (the entry's last text, then its tail: \newblock, \showISBNx, \urldef, \tempurl and \url with no point, \showDOI's opening point)
  const entry = [
    { t: 'text', s: 'A. Author. 2021. A title. ACM, 14 pages.\n' },
    ph('\\newblock'),
    { t: 'text', s: '\n' },
    ph('\\showISBNx{9781450380966}'),
    { t: 'text', s: '\n' },
    ph('\\urldef'),
    ph('\\tempurl'),
    ph('\\url{https://doi.org/10.1145/1}'),
    { t: 'text', s: '\n' },
    ph('\\showDOI{\\tempurl}'),
  ]
  it('states every piece between the end point and the next piece’s opening point empty where nothing stands between them', () => {
    // (the DOI starts on the line of the entry's last words: its glyphs the unit's, after the opening point)
    const pages = [{ glyphs: glyphs('pages.https://doi.org'), points: [pt('5s', 0), pt('5e', 6), pt('p5.9a', 6), pt('6s', 21)] }]
    const rows = [[...Array(6).fill('u5'), ...Array(15).fill('u5.9')]]
    expect(run(pages, rows, unitsOf(entry))).toEqual(['1', '3', '5', '6', '7'].map((piece) => ({ unit: 5, piece })))
  })
  it('bounds a piece with its opening point alone by that point and the next one', () => {
    // (`\urldef` after `\newblock`, which reads nothing ahead: its opening point, no closing one, nothing between it and
    // `\showURL`'s opening point; one with its own glyphs there has ink, not stated, and what the pieces after it set is in it)
    const pages = [{ glyphs: glyphs('pages.https://x.org'), points: [pt('5s', 0), pt('5e', 6), pt('p5.5a', 6), pt('p5.9a', 6)] }]
    const rows = [[...Array(6).fill('u5'), ...Array(13).fill('u5.9')]]
    expect(run(pages, rows, unitsOf(entry))).toEqual(['1', '3', '5', '6', '7'].map((piece) => ({ unit: 5, piece })))
    const inked = [{ glyphs: glyphs('pages.Xhttps://x.org'), points: [pt('5s', 0), pt('5e', 6), pt('p5.5a', 6), pt('p5.9a', 7)] }]
    const rows2 = [[...Array(6).fill('u5'), 'u5.5', ...Array(13).fill('u5.9')]]
    expect(run(inked, rows2, unitsOf(entry))).toEqual(['1', '3', '6', '7'].map((piece) => ({ unit: 5, piece })))
  })
  it('states none where a glyph of the unit’s or of no unit’s stands between the two, or the unit’s text does', () => {
    const pages = [{ glyphs: glyphs('pages.ISBNhttps://doi.org'), points: [pt('5s', 0), pt('5e', 6), pt('p5.9a', 10), pt('6s', 25)] }]
    expect(run(pages, [[...Array(6).fill('u5'), ...Array(4).fill(null), ...Array(15).fill('u5.9')]], unitsOf(entry))).toEqual([])
    expect(run(pages, [[...Array(10).fill('u5'), ...Array(15).fill('u5.9')]], unitsOf(entry))).toEqual([])
    // (a paper's macro inside the unit's text, its glyphs the text's: between its two nearest points stands text, unknown)
    const sys = unitsOf([{ t: 'text', s: 'We use ' }, ph('\\sys'), { t: 'text', s: ' here.' }])
    const p2 = [{ glyphs: glyphs('WeuseTensorCasthere.'), points: [pt('5s', 0), pt('5e', 20)] }]
    expect(run(p2, [Array(20).fill('u5')], sys)).toEqual([])
    // (a painted box of no unit's between them: TeX set something, an icon)
    const p3 = [{ glyphs: glyphs('pages.https://doi.org'), boxes: [0, 0, 1, 1], points: [pt('5s', 0, 0), pt('5e', 6, 0), pt('p5.9a', 6, 1), pt('6s', 21, 1)] }]
    expect(run(p3, [[...Array(6).fill('u5'), ...Array(15).fill('u5.9')]], unitsOf(entry))).toEqual([])
  })
  it('bounds a tail piece after the unit’s last point by the stream’s next point, of whatever it is, over a page break', () => {
    const tail = unitsOf([{ t: 'text', s: 'a word.' }, ph('\\endgroup')])
    // (the next unit's start point next: nothing between)
    expect(run([{ glyphs: glyphs('aword.Next'), points: [pt('5s', 0), pt('5e', 6), pt('6s', 6)] }], [[...Array(6).fill('u5'), ...Array(4).fill('u6')]], tail)).toEqual([{ unit: 5, piece: '1' }])
    // (a glyph of another unit's between: the ownership may have given it the piece's ink, as 2608.06701v1 p6's run-in heading
    // `Comparison Against \sage` lost its "SAGE" to the next paragraph's label: unknown)
    expect(run([{ glyphs: glyphs('aword.3Next'), points: [pt('5s', 0), pt('5e', 6), pt('h6s', 7)] }], [[...Array(6).fill('u5'), ...Array(5).fill('u6')]], tail)).toEqual([])
    // (a glyph of no unit's there: unknown)
    expect(run([{ glyphs: glyphs('aword.*Next'), points: [pt('5s', 0), pt('5e', 6), pt('6s', 7)] }], [[...Array(6).fill('u5'), null, ...Array(4).fill('u6')]], tail)).toEqual([])
    // (the end point a page's last, the next point the next page's first, its running head's glyph between)
    const two = [{ glyphs: glyphs('aword.'), points: [pt('5s', 0), pt('5e', 6)] }, { glyphs: glyphs('7Next'), points: [pt('6s', 1)] }]
    expect(run(two, [Array(6).fill('u5'), [null, ...Array(4).fill('u6')]], tail)).toEqual([])
    two[1]!.points = [pt('6s', 0)]
    two[1]!.glyphs = glyphs('Next')
    expect(run(two, [Array(6).fill('u5'), Array(4).fill('u6')], tail)).toEqual([{ unit: 5, piece: '1' }])
  })
  it('bounds a head piece before the unit’s start point by the stream’s point before it', () => {
    // (\begingroup and \sloppy before the start, the unit before's end point the stream's last before it)
    const head = unitsOf([ph('\\begingroup'), ph('\\sloppy'), { t: 'text', s: ' We thank.' }])
    expect(run([{ glyphs: glyphs('end.Wethank.'), points: [pt('4s', 0), pt('4e', 4), pt('5s', 4), pt('5e', 12)] }], [[...Array(4).fill('u4'), ...Array(8).fill('u5')]], head)).toEqual([{ unit: 5, piece: '0' }, { unit: 5, piece: '1' }])
    // (\acknowledgments's heading of no unit's between: unknown)
    const ack = unitsOf([ph('\\acknowledgments'), { t: 'text', s: ' We thank.' }])
    const pages = [{ glyphs: glyphs('end.AcknowledgmentsWethank.'), points: [pt('4e', 4), pt('5s', 19), pt('5e', 27)] }]
    expect(run(pages, [[...Array(4).fill('u4'), ...Array(15).fill(null), ...Array(8).fill('u5')]], ack)).toEqual([])
  })
  it('puts what the pieces after an opening point TeX gave no closing one set in that piece’s ink', () => {
    // (`\cite{a}~\cite{b}`: the first citation's opening point alone (a macro that may read ahead follows it), its glyphs and the
    // tie's between it and the next one's opening point, all the citation's by the ownership)
    const cites = unitsOf([{ t: 'text', s: 'see ' }, ph('\\cite{a}'), ph('\\foo'), ph('\\cite{b}'), { t: 'text', s: ' too.' }])
    const pages = [{ glyphs: glyphs('see[1][2]too.'), points: [pt('5s', 0), pt('p5.1a', 3), pt('p5.3a', 6), pt('p5.3b', 9), pt('5e', 13)] }]
    const rows = [[...Array(3).fill('u5'), ...Array(3).fill('u5.1'), ...Array(3).fill('u5.3'), ...Array(4).fill('u5')]]
    expect(run(pages, rows, cites)).toEqual([{ unit: 5, piece: '2' }])
    // (one of them the unit's text: what \\foo set may be it, unknown)
    rows[0]![5] = 'u5'
    expect(run(pages, rows, cites)).toEqual([])
  })
  it('bounds a piece after an opening point alone by the first glyph of the text after it, where the ownership ends that ink', () => {
    // (2610.20848v1's `\DOIprefix\doi{10.1086/304041}.`: the prefix's opening point alone (a macro that may read ahead), `\doi` no
    // point, the end point after the stop; the prefix's ink to the stop (the maker's reading by what follows), the DOI's in it.
    // With the stop the unit's text between, its references were unproven, 48 of the corpus's English)
    const doi = unitsOf([{ t: 'text', s: 'A. Author. 1997. ApJ 1, 386.\n' }, ph('\\DOIprefix'), ph('\\doi{10.1086/304041}'), { t: 'text', s: '.\n' }])
    const pages = [{ glyphs: glyphs('ApJ1,386.doi:10.1086/1.'), points: [pt('5s', 0), pt('p5.1a', 9), pt('5e', 23)] }]
    const rows = [[...Array(9).fill('u5'), ...Array(13).fill('u5.1'), 'u5']]
    expect(run(pages, rows, doi)).toEqual([{ unit: 5, piece: '2' }])
    // (a glyph of the text's that does not begin the next text: the piece's own, which the ownership read as text, unknown)
    rows[0]![21] = 'u5'
    expect(run(pages, rows, doi)).toEqual([])
  })
  it('reads no unit whose points TeX set more than once', () => {
    const pages = [{ glyphs: glyphs('pages.https://doi.org'), points: [pt('5s', 0), pt('5e', 6), pt('p5.9a', 6), pt('5e', 21)] }]
    expect(run(pages, [[...Array(6).fill('u5'), ...Array(15).fill('u5.9')]], unitsOf(entry))).toEqual([])
  })
})

describe('a piece TeX set before its unit’s start point (Instrument `outside`)', () => {
  // (lave.md §2: a piece the marking passes over at the unit's head, before the start point patch sets (latex-front.mjs startOf):
  // whatever TeX set for it stands before the unit's text, which begins at that point, and is never erased with it, as today's
  // OUTSIDE (make.mjs outsideOf): an affiliation's `\textsuperscript{1}`, `\acknowledgments`'s heading on the line above)
  const glyphs = (s: string) => [...s].map((u) => ({ u }))
  const pt = (name: string, glyph: number) => ({ name, glyph, box: 0 })
  const owners = (row: (string | null)[]) => ({
    unit: Int32Array.from(row.map((g) => (g ? Number(/^u(\d+)/.exec(g)![1]) : -1))),
    role: Uint8Array.from(row.map((g) => (!g ? 0 : g.includes('.') ? 2 : 1))),
    piece: Int32Array.from(row.map((g) => (g?.includes('.') ? Number(g.split('.')[1]) : -1))),
  })
  const units: unknown[] = []
  units[5] = { kind: 'affiliation', pieces: [ph('\\textsuperscript{1}'), { t: 'text', s: 'Univ. ' }, ph('\\cite{a}')] }
  const run = (pages: { glyphs: { u: string }[]; points: unknown[] }[], rows: (string | null)[][]) =>
    outsidePieces(pages.map((pg) => ({ boxes: [], ...pg })) as never, units as never, { glyphs: rows.map(owners) } as never)
  it('states the unit’s head pieces outside it where its text begins at its start point', () => {
    expect(run([{ glyphs: glyphs('1Univ.'), points: [pt('5s', 1), pt('5e', 6)] }], [[null, ...Array(5).fill('u5')]])).toEqual([{ unit: 5, piece: '0' }])
  })
  it('states none where TeX set no start point, or the ownership gives the unit text before it', () => {
    expect(run([{ glyphs: glyphs('1Univ.'), points: [pt('5e', 6)] }], [[null, ...Array(5).fill('u5')]])).toEqual([])
    expect(run([{ glyphs: glyphs('1Univ.'), points: [pt('5s', 1), pt('5e', 6)] }], [Array(6).fill('u5')])).toEqual([])
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
