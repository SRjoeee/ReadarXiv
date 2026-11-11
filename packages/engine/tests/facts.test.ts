import { type Line, type Piece, unitId } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { align } from '../src/align/align.ts'
import type { DocGlyph } from '../src/doc.ts'
import { type Instrument, type InstrumentUnit, ownersOf, ROLE } from '../src/instrument.ts'
import {
  alignOf,
  bandOf,
  breakEnd,
  cellCentred,
  classifyFont,
  fillOfGlyphs,
  labelParts,
  pinnedOf,
  shortSkipLines,
  sideOf,
  staysOf,
  centredByBlock,
  sourceEndMarks,
  styleOf,
  fillRunsOf,
  fixedFacesOf,
  oneFamily,
  tailOf,
  textOf,
  urlCopyOf,
} from '../src/locate/facts.ts'
import { locate, urlBreaks } from '../src/locate/locate.ts'
import { mappedOf, unmapped } from '../src/read.ts'
import { docOf, type PageSpec } from './helpers/doc.ts'

const g = (u: string, x = 72, y = 700, o: Partial<DocGlyph> = {}): DocGlyph => {
  const size = o.size ?? 10
  const base = o.base ?? 'CMR10'
  return {
    u,
    code: u.codePointAt(0) ?? 0,
    font: base,
    base,
    x0: x,
    x1: x + 0.6 * size,
    y,
    top: y + 0.7 * size,
    bottom: y - 0.2 * size,
    size,
    ix0: x,
    ix1: x + 0.6 * size,
    n: 0,
    k: 0,
    form: false,
    blank: !/\S/.test(u),
    fill: 0,
    ...o,
  }
}
const run = (s: string, x = 72, y = 700, o: Partial<DocGlyph> = {}) =>
  [...s].map((u, i) => g(u, x + 0.6 * (o.size ?? 10) * i, y, o))
/** a line: page, column, x0, x1, base, top, bottom, m0, m1, flags */
const L = (x0: number, x1: number, base: number, flags = 0, page = 1): Line => [
  page,
  0,
  x0,
  x1,
  base,
  base + 7,
  base - 2,
  x0,
  x1,
  flags,
]

describe('a unit’s style read off its glyphs (C5)', () => {
  it('takes the fonts’ class, weight and slant by their names, math glyphs aside, and the most common size', () => {
    expect(classifyFont('ABCDEF+CMBX10')).toMatchObject({ fam: 'serif', bold: true, italic: false })
    expect(classifyFont('NimbusSanL-Regu')).toMatchObject({ fam: 'sans' })
    expect(classifyFont('CMTT10')).toMatchObject({ fam: 'mono' })
    expect(classifyFont('CMMI10')).toMatchObject({ fam: 'math' })
    const gs = [...run('Theorem', 72, 700, { base: 'CMBX10' }), ...run('xy', 120, 700, { base: 'CMMI10' })]
    expect(styleOf(gs)).toMatchObject({ role: 'serif', size: 10, bold: 1 })
    expect(styleOf(run('ABSTRACT'))).toMatchObject({ upper: 1 })
    expect(styleOf(run('text', 72, 700, { base: 'CMTI10' }))).toMatchObject({ slant: 1 })
  })
  it('gives an element its fill where more than half its glyphs share one that is not black (B14)', () => {
    expect(fillOfGlyphs(run('[12]', 72, 700, { fill: 0x0000ff }))).toBe(0x0000ff)
    expect(fillOfGlyphs([...run('[1', 72, 700, { fill: 0x0000ff }), ...run('2]', 90, 700)])).toBeUndefined()
    expect(fillOfGlyphs(run('[12]'))).toBeUndefined()
  })
})

describe('the class’s tail (C20)', () => {
  const p = (s: string): Piece[] => [{ t: 'text', s }]
  it('takes the marks after the text that its source does not write, at most three', () => {
    // (amsthm's note: the source writes "the note", the class sets ")." after it)
    expect(tailOf(run(').'), sourceEndMarks(p('the note')))?.map(([t]) => t)).toEqual([')', '.'])
    // (a sentence's own stop is the source's: what is left is none)
    expect(tailOf(run('.'), sourceEndMarks(p('a sentence.')))).toBeNull()
    // (a reference's year bracket is the source's, the style's stop after it the class's)
    expect(tailOf(run(').'), sourceEndMarks(p('Smith (2025)')))?.map(([t]) => t)).toEqual(['.'])
    expect(tailOf(run('))).'), sourceEndMarks(p('x')))).toBeNull()
    expect(tailOf(run('.', 72, 700, { base: 'CMMI10' }), sourceEndMarks(p('x')))).toBeNull()
  })
  it('reads the source’s end marks through ligatures, spaces and inkless elements', () => {
    expect(sourceEndMarks(p("as ``said''."))).toEqual(['”', '.'])
    expect(sourceEndMarks([...p('word.'), { t: 'el', id: '1', kind: 'other', src: '\\label{x}' }])).toEqual(['.'])
    // (a forced break and a tie set no ink either, stated `break` and `space`)
    expect(sourceEndMarks([...p('Ltd.'), { t: 'el', id: '1', kind: 'break', src: '\\\\' }])).toEqual(['.'])
    expect(sourceEndMarks([...p('Inc.'), { t: 'el', id: '1', kind: 'space', src: '~' }])).toEqual(['.'])
    expect(sourceEndMarks([...p('cost'), { t: 'el', id: '1', kind: 'symbol', src: '\\%' }])).toBeNull()
  })
})

describe('a label’s parts (B16)', () => {
  it('cuts a float’s or a head’s label into its name, its number and its punctuation, each with its ink', () => {
    const parts = labelParts(run('Figure 3:'), 1)
    expect(parts.name?.[0]).toBe('Figure')
    expect(parts.num?.[0]).toBe('3')
    expect(parts.punct?.[0]).toBe(':')
    expect(labelParts(run('Theorem 2.1.'), 1)).toMatchObject({
      name: ['Theorem', expect.anything()],
      num: ['2.1', expect.anything()],
      punct: ['.', expect.anything()],
    })
    expect(labelParts(run('Table A.4'), 1).num?.[0]).toBe('A.4')
    expect(labelParts(run('[12]'), 1).num?.[0]).toBe('12')
    expect(labelParts(run('Proof.'), 1)).toMatchObject({
      name: ['Proof', expect.anything()],
      punct: ['.', expect.anything()],
    })
    expect(labelParts(run('Proof.'), 1).num).toBeUndefined()
  })
  it("holds every glyph of a label in its parts: a number's opening bracket is the number's, and a named label whose parts leave a glyph out says how many (Codex on round 8's pull request)", () => {
    // (a number TeX printed in brackets: "Figure (1).", "Theorem (1).", "Proposition (2.1)"; read with its bracket in no part, a
    // relabel drew "Abbildung 1).", "Satz 1).")
    expect(labelParts(run('Figure (1).'), 1)).toMatchObject({
      name: ['Figure', expect.anything()],
      num: ['(1', expect.anything()],
      punct: [').', expect.anything()],
    })
    expect(labelParts(run('Theorem (1).'), 1)).toMatchObject({
      name: ['Theorem', expect.anything()],
      num: ['(1', expect.anything()],
      punct: [').', expect.anything()],
    })
    expect(labelParts(run('Proposition (2.1)'), 1)).toMatchObject({
      name: ['Proposition', expect.anything()],
      num: ['(2.1', expect.anything()],
      punct: [')', expect.anything()],
    })
    for (const s of ['Figure (1).', 'Theorem (1).', 'Proposition (2.1)', 'Theorem 2 (', 'Figure 1.', 'Fig. 4.'])
      expect(labelParts(run(s), 1).unheld, s).toBeUndefined()
    // (a head that holds its note whole, its parts the name and the closing marks: "2 (Main result" in no part, said)
    const note = labelParts(run('Theorem 2 (Main result).'), 1)
    expect(note).toMatchObject({ name: ['Theorem', expect.anything()], punct: [').', expect.anything()] })
    expect(note.unheld).toBe(12)
    // (a label of no name is never drawn anew, and says nothing: a reference's "[12]", an item's "(3)")
    expect(labelParts(run('(3)'), 1).unheld).toBeUndefined()
  })
  it('gives an abbreviated name its own stop, which stands between no digits of the number (Fig., Tab., Eq., Thm., Def., Sec.)', () => {
    // (2610.21880v1's IEEE captions, "Fig. 4.": the name "Fig" and the number ".4" drew no target word)
    const fig = labelParts(run('Fig. 4.'), 1)
    expect(fig.name?.[0]).toBe('Fig.')
    expect(fig.num?.[0]).toBe('4')
    expect(fig.punct?.[0]).toBe('.')
    // (the name's ink takes its stop in, the number's begins at its digit)
    const gs = run('Fig. 4.')
    expect(fig.name?.[1][3]).toBe(Math.round(gs[3]!.x1 * 100) / 100)
    expect(fig.num?.[1][1]).toBe(Math.round(gs[5]!.x0 * 100) / 100)
    expect(labelParts(run('FIG. 3:'), 1)).toMatchObject({
      name: ['FIG.', expect.anything()],
      num: ['3', expect.anything()],
      punct: [':', expect.anything()],
    })
    expect(labelParts(run('Tab. 2'), 1)).toMatchObject({
      name: ['Tab.', expect.anything()],
      num: ['2', expect.anything()],
    })
    expect(labelParts(run('Thm. 2.1.'), 1)).toMatchObject({
      name: ['Thm.', expect.anything()],
      num: ['2.1', expect.anything()],
      punct: ['.', expect.anything()],
    })
    expect(labelParts(run('Def. 3'), 1)).toMatchObject({
      name: ['Def.', expect.anything()],
      num: ['3', expect.anything()],
    })
    expect(labelParts(run('Sec. A.4'), 1)).toMatchObject({
      name: ['Sec.', expect.anything()],
      num: ['A.4', expect.anything()],
    })
    expect(labelParts(run('Fig.S1'), 1)).toMatchObject({
      name: ['Fig.', expect.anything()],
      num: ['S1', expect.anything()],
    })
    // (a bracket before the number is no mark of the name's word, and is the number's as TeX printed it: "Eq. (3)". Read as
    // neither part's, as before, it was a glyph the parts left out, and a relabel drew the number without it, "Gl. 3)")
    expect(labelParts(run('Eq. (3)'), 1)).toMatchObject({
      name: ['Eq.', expect.anything()],
      num: ['(3', expect.anything()],
      punct: [')', expect.anything()],
    })
    expect(labelParts(run('Eq. (3)'), 1).unheld).toBeUndefined()
    // (a number of no name before it keeps its marks, and a sub-figure's letter stays the name's, as before)
    expect(labelParts(run('.5'), 1).num?.[0]).toBe('.5')
    expect(labelParts(run('(a)'), 1).name?.[0]).toBe('a')
    // (a ligature's one glyph, whose text is two letters: amsthm's "Deﬁnition 3." of 2501.14787v1, which the first stage 1a
    // of this rule read as "De")
    const lig = run('Definition 3.')
    lig.splice(2, 2, { ...lig[2]!, u: 'fi', x1: lig[3]!.x1 })
    expect(labelParts(lig, 1)).toMatchObject({ name: ['Definition', expect.anything()], num: ['3', expect.anything()] })
  })
})

describe('a float label’s parts: TeX’s \\fnum@<type>, its name, a tie, its number', () => {
  it('reads its number as its last word: a roman one, and one whose tie a justified line set tight', () => {
    // (IEEEtran's "TABLE I.": no digit, so no number was read and the name was "TABLEI"; 2610.30875v1 p15's "Table S2:", its tie
    // 0.19 em on a justified line, under the 0.2 em that keeps a capital before a digit the name's: name "TableS". The tie on
    // the 87 papers' float labels measured 0.19 to 0.48 em, a kern inside their words -0.09 to 0)
    const any = expect.anything()
    expect(labelParts(run('TABLE I.'), 1)).toMatchObject({
      name: ['TABLE', any],
      num: ['I', any],
      punct: ['.', any],
    })
    const tight = run('TableS2:').map((x, k) => (k >= 5 ? { ...x, x0: x.x0 + 1.9, x1: x.x1 + 1.9 } : x))
    expect(labelParts(tight, 1)).toMatchObject({ name: ['Table', any], num: ['S2', any], punct: [':', any] })
    expect(labelParts(run('Table IV:'), 1)).toMatchObject({ name: ['Table', any], num: ['IV', any] })
    // (as before where the number is no last word of its own: one word, a number with a digit read already)
    expect(labelParts(run('Fig. 4.'), 1)).toMatchObject({
      name: ['Fig.', any],
      num: ['4', any],
      punct: ['.', any],
    })
    expect(labelParts(run('Figure 1.1 –'), 1)).toMatchObject({ name: ['Figure', any], num: ['1.1', any] })
    expect(labelParts(run('Fig.S1'), 1)).toMatchObject({ name: ['Fig.', any], num: ['S1', any] })
    expect(labelParts(run('(a)'), 1).name?.[0]).toBe('a')
    expect(labelParts(run('(a)'), 1).num).toBeUndefined()
    // (an unnumbered label's last word is its name's: no number)
    expect(labelParts(run('Figure:'), 1).num).toBeUndefined()
    // (a head's label as before)
    expect(labelParts(run('Theorem 2.1.'), 1)).toMatchObject({ name: ['Theorem', any], num: ['2.1', any] })
  })
})

describe('a head’s label parts: amsthm’s \\thmname, a space, \\thmnumber, as a float’s', () => {
  it('reads its number as its last word, whatever its counter prints: a roman section’s number before its own', () => {
    // (2610.21312v1, IEEEtran with \newtheorem{theorem}{Theorem}[section]: "Corollary VI.2 (" was read "CorollaryVI." and "2",
    // the I abutting the V; "Proposition V.2 (" was read right, its one capital standing a space after the name)
    const any = expect.anything()
    expect(labelParts(run('Corollary VI.2 ('), 1)).toMatchObject({
      name: ['Corollary', any],
      num: ['VI.2', any],
      punct: ['(', any],
    })
    expect(labelParts(run('Proposition VII.1 ('), 1)).toMatchObject({ name: ['Proposition', any], num: ['VII.1', any] })
    expect(labelParts(run('Proposition V.2 ('), 1)).toMatchObject({ name: ['Proposition', any], num: ['V.2', any] })
    expect(labelParts(run('Theorem II'), 1)).toMatchObject({ name: ['Theorem', any], num: ['II', any] })
    expect(labelParts(run('Appendix A'), 1)).toMatchObject({ name: ['Appendix', any], num: ['A', any] })
    // (the number the word as TeX printed it, a bracket before its first digit with it: in neither part, as this rule first had
    // it, a relabel drew the number without its bracket)
    expect(labelParts(run('Eq. (3)'), 1)).toMatchObject({ name: ['Eq.', any], num: ['(3', any] })
    // (a word that is no counter's ends no number: the name is the whole)
    expect(labelParts(run('Main Theorem.'), 1).num).toBeUndefined()
  })
  it('reads its name as letters, a ligature’s glyph its letters, its words spaced as TeX set them', () => {
    // (2610.21765v1's "Deﬁnition 1.": PDF.js gave the ligature as one character, U+FB01, which no head name holds)
    const lig = run('Definition 1.')
    lig.splice(2, 2, { ...lig[2]!, u: 'ﬁ', x1: lig[3]!.x1 })
    expect(labelParts(lig, 1)).toMatchObject({ name: ['Definition', expect.anything()], num: ['1', expect.anything()] })
    expect(labelParts(run('Key Lemma 2.'), 1)).toMatchObject({ name: ['Key Lemma', expect.anything()] })
    expect(labelParts(run('Main Theorem.'), 1)).toMatchObject({ name: ['Main Theorem', expect.anything()] })
  })
})

describe('forced breaks and the room after them (C14)', () => {
  it('states the line TeX ended and its room in pitches, by the unit’s other lines', () => {
    const lines = [L(72, 300, 700), L(72, 200, 688), L(72, 300, 664), L(72, 300, 652)]
    expect(breakEnd(lines, 1, new Set([1]))).toEqual([1, 1])
    expect(breakEnd(lines, 0, new Set([0]))).toEqual([0, 0])
    expect(breakEnd(lines, 3, new Set([3]))).toBeNull()
  })
  it('reads its room against TeX’s \\baselineskip where the paragraph states it, not the median of its gaps', () => {
    // (a frame whose other gaps are TeX's \lineskip rule's (14 pt, tall lines) and its \baselineskip 12: the break's gap of 24
    // is one line of room at 12, under one at the median's 14)
    const lines = [L(72, 300, 700), L(72, 300, 686), L(72, 200, 672), L(72, 300, 648), L(72, 300, 636)]
    expect(breakEnd(lines, 2, new Set([2]))).toEqual([2, 0.714])
    expect(breakEnd(lines, 2, new Set([2]), undefined, 12)).toEqual([2, 1])
  })
})

describe('short skips (E15)', () => {
  it('flags the line a display stands under with TeX’s short skip: its top under the baseline by less than 0.3 of a size, the line ending 2 em before it', () => {
    const lines = [L(72, 150, 700), L(72, 300, 640)]
    expect([...shortSkipLines(lines, [[1, 180, 680, 260, 698, 690]], () => 10)]).toEqual([0])
    expect([...shortSkipLines(lines, [[1, 160, 680, 260, 698, 690]], () => 10)]).toEqual([])
    expect([...shortSkipLines(lines, [[1, 180, 680, 260, 690, 685]], () => 10)]).toEqual([])
  })
})

describe('room beside a line, a cell’s band, a line pinned (E13, E24, E23)', () => {
  it('reads the free paper on the line’s baseline to the nearest glyph not its own, within its block', () => {
    // (glyphs on its baseline left and right of it; a glyph of the line under it; a rule across its band, which today's
    // widening does not read; a glyph whose box reaches into its band from a baseline 5 pt over it)
    const ink = [
      { x0: 40, x1: 60, y0: 698, y1: 706, y: 700 },
      { x0: 400, x1: 420, y0: 698, y1: 706, y: 700.5 },
      { x0: 200, x1: 300, y0: 600, y1: 610, y: 602 },
      { x0: 300, x1: 380, y0: 699, y1: 701 },
      { x0: 250, x1: 260, y0: 703, y1: 712, y: 705 },
    ]
    expect(
      sideOf(
        [L(100, 200, 700)],
        () => ink,
        () => [50, 500],
      ),
    ).toEqual({ side: [60, 400], wall: 0 })
    expect(
      sideOf(
        [L(100, 200, 700)],
        () => [],
        () => [50, 500],
      ),
    ).toEqual({ side: [50, 500], wall: 0 })
  })
  it('reads a cell’s room to its column’s rules too: a painted box beside its line whose height meets its band', () => {
    // (1706.03762v7 p10's Table 4: the "Training" column's cell between the rules at 296.4 and 409, its neighbours' ink at
    // 290.6 and 429; a rule across the line's band above it and the table's horizontal rule under it are no wall)
    const glyphs = [
      { x0: 280, x1: 290.6, y0: 676, y1: 685, y: 678.91 },
      { x0: 429.01, x1: 440, y0: 676, y1: 685, y: 678.91 },
    ]
    const walls = [
      { x0: 296, x1: 296.4, y0: 555.6, y1: 686.6 },
      { x0: 409, x1: 409.4, y0: 555.6, y1: 686.6 },
      { x0: 107.5, x1: 505.6, y0: 686.5, y1: 686.9 },
      { x0: 107.5, x1: 505.6, y0: 676.6, y1: 677 },
    ]
    const line = [L(302.56, 402.52, 678.91)]
    expect(
      sideOf(
        line,
        () => glyphs,
        () => [107.5, 505.6],
      ),
    ).toEqual({ side: [290.6, 429.01], wall: 0 })
    // (and says which sides stop at a wall, not a glyph: today's further widening keeps a quarter of its size off a rule and
    // goes half way to another's text (run.mjs paperTo), so the typesetter must tell them apart)
    expect(
      sideOf(
        line,
        () => glyphs,
        () => [107.5, 505.6],
        () => walls,
      ),
    ).toEqual({ side: [296.4, 409], wall: 3 })
    expect(
      sideOf(
        line,
        () => [{ x0: 380, x1: 392, y0: 676, y1: 685, y: 678.91 }].map((g) => ({ ...g, x0: 404, x1: 408 })),
        () => [107.5, 505.6],
        () => walls,
      ),
    ).toEqual({ side: [296.4, 404], wall: 1 })
  })
  it('reads the ink that stays beside each text line, rules and images too: a QED box at the end of a proof’s last line', () => {
    // (2610.40645v1 p12 t80: amsthm's \openbox, four rules after the last line's text (it ends at 430.87), owned by no unit;
    // the line over it full. A rule across the last line's band under its text, a glyph left of its start and one in the
    // margin out of its column, one on the line over it, and ink beside a kept line (a display's row))
    const qed = [
      { x0: 532.09, x1: 532.48, y0: 361.01, y1: 368.77 },
      { x0: 532.29, x1: 539.23, y0: 368.17, y1: 368.57 },
      { x0: 532.29, x1: 539.23, y0: 361.21, y1: 361.6 },
      { x0: 539.03, x1: 539.43, y0: 361.01, y1: 368.77 },
    ]
    const lines = [L(72, 540, 376.66), L(100, 430.87, 361.21), L(150, 300, 346, 1)]
    const block = () => [72, 540] as [number, number]
    expect(staysOf(lines, () => qed, block)).toEqual([[1, 532.09, 361.01, 539.43, 368.77]])
    const more = [
      ...qed,
      { x0: 72, x1: 540, y0: 360.5, y1: 360.9 },
      { x0: 80, x1: 86, y0: 359, y1: 366, y: 361.21 },
      { x0: 40, x1: 46, y0: 359, y1: 366, y: 361.21 },
      { x0: 300, x1: 306, y0: 365, y1: 372, y: 367 },
      { x0: 320, x1: 330, y0: 344, y1: 352, y: 346 },
    ]
    expect(staysOf(lines, () => more, block)).toEqual([
      [1, 80, 359, 86, 366],
      [1, 532.09, 361.01, 539.43, 368.77],
    ])
    expect(staysOf(lines, () => [], block)).toBeUndefined()
  })
  it('reads a cell’s band between the rules over and under its lines', () => {
    const rules = [
      { x0: 50, x1: 400, y0: 712, y1: 712.4 },
      { x0: 50, x1: 400, y0: 695, y1: 695.4 },
      { x0: 500, x1: 600, y0: 705, y1: 705.4 },
    ]
    expect(bandOf([L(100, 200, 700)], () => rules)).toEqual({ band: [695.4, 712] })
    expect(bandOf([L(100, 200, 700)], () => [])).toBeUndefined()
  })
  it('pins a line whose baseline holds ink that stays beside it', () => {
    expect(pinnedOf(L(100, 200, 700), 10, [{ x0: 300, x1: 320, y: 700 }], [50, 500])).toBe(true)
    expect(pinnedOf(L(100, 200, 700), 10, [{ x0: 300, x1: 320, y: 690 }], [50, 500])).toBe(false)
    expect(pinnedOf(L(100, 200, 700), 10, [{ x0: 150, x1: 160, y: 700 }], [50, 500])).toBe(false)
  })
})

describe('alignment where TeX did not tell (B3, E8)', () => {
  it('reads a unit centred where every line’s centre is its column’s and one is short of it by an em', () => {
    const edges = (): [number, number] => [72, 540]
    expect(alignOf([L(200, 412, 700)], () => 10, edges)).toBe('c')
    expect(alignOf([L(72, 540, 700), L(72, 300, 688)], () => 10, edges)).toBe('j')
    // (TeX's justified one-line paragraph, centred by its own glue, off both edges by more than 2 em)
    expect(alignOf([L(200, 412, 700)], () => 10, edges, 'j')).toBe('c')
    expect(alignOf([L(80, 532, 700)], () => 10, edges, 'j')).toBe('j')
  })
  it('reads a unit centred on its own block’s middle, off its column’s: its lines, or a single line’s stack, share a middle and not their edges', () => {
    // (2303.11366v4 p1's author block, NeurIPS's centred tabulars on a one-column page: "Ashwin Gopinath" over "Massachusetts
    // Institute of Technology" over "agopi@mit.edu", their middles at 393.83, the column's at 306; the row above 28 pt off)
    const name = L(356.32, 431.34, 553.27)
    const place = L(317.4, 470.27, 542.36)
    const mail = L(359.84, 427.82, 531.45)
    const rowAbove = L(321.7, 457.65, 581.45)
    const page = [rowAbove, name, place, mail, L(108, 504, 413.51), L(143.87, 469.79, 402.6)]
    expect(
      alignOf(
        [place],
        () => 10,
        () => [108, 504],
      ),
    ).toBe('j')
    expect(centredByBlock([place], page, 11.96)).toBe(true)
    expect(centredByBlock([name], page, 11.96)).toBe(true)
    // (a paragraph's short last line stays its own: its lines share their left edge; a lone line, nothing to read it by)
    expect(centredByBlock([L(108, 504, 413.51), L(108, 300, 402.6)], page, 10.91)).toBe(false)
    expect(centredByBlock([L(108, 300, 300)], page, 10.91)).toBe(false)
    // (two lines of one unit centred off the column: a centred block of its own)
    expect(centredByBlock([L(320, 470, 600), L(345, 445, 588)], page, 12)).toBe(true)
  })
  it('centres a single-line cell by its column’s cells: middles within 2 pt, widths spread over 4', () => {
    expect(
      cellCentred([
        [100, 120],
        [95, 125],
        [105, 115],
      ]),
    ).toBe(true)
    expect(
      cellCentred([
        [100, 120],
        [100, 140],
      ]),
    ).toBe(false)
    expect(
      cellCentred([
        [100, 120],
        [101, 121],
      ]),
    ).toBeNull()
    expect(cellCentred([[100, 120]])).toBeNull()
  })
})

// ---------------------------------------------------------------- through locate, on a page made by hand
const text = (s: string): Piece => ({ t: 'text', s })
function instrument(
  B: ReturnType<typeof docOf>,
  units: InstrumentUnit[],
  own: (p: number, n: number, k: number) => [number, number, number],
): Instrument {
  return {
    ink: B,
    units,
    glyphs: B.pages.map((pg, p) => {
      const O = ownersOf(pg.glyphs.length)
      pg.glyphs.forEach((gl, j) => {
        const [u, role, piece] = own(p, gl.n, j)
        O.unit[j] = u
        O.role[j] = role
        O.piece[j] = piece
      })
      return O
    }),
    boxes: B.pages.map((pg) => ownersOf(pg.kinds.length)),
    tex: {},
    made: { compiler: 'pdflatex', tree: '2025', front: 'test' },
  }
}

describe('locate states the facts on arXiv’s page', () => {
  it('states where a URL TeX set on one line may break: after a run of url.sty’s break characters, between two glyphs', () => {
    // (2303.11366v4 p1's abstract ends "datasets at https://github.com/noahshinn024/reflexion.", the URL whole on its last
    // line: TeX's url package may break it after its . / : _ and the rest of \UrlBreaks and \UrlBigBreaks, never inside a run
    // of them ("https:/" + "/…"); the typesetter breaks the URL's crop there as TeX would its text)
    const B = docOf([{ lines: ['We release it at https://a.io/b_c.'] }])
    const content: Piece[] = [
      text('We release it at '),
      { t: 'el', id: '1', kind: 'url', src: '\\url{https://a.io/b_c}' },
      text('.'),
    ]
    const u: InstrumentUnit = { id: unitId('para', content), kind: 'para', content }
    const ins = instrument(B, [u], (_, _n, j) => (j >= 17 && j < 33 ? [0, ROLE.element, 1] : [0, ROLE.text, -1]))
    const M = locate(ins, B, align(B, B)).members[0]!
    const el = new Map(M.elements).get('1')!
    expect(el.ink.length).toBe(1)
    expect(el.breaks).toEqual([
      [222, 8],
      [234, 10],
      [252, 13],
      [264, 15],
    ])
  })
  it('reads a piece the instrument states sets a URL as a URL whatever its command: a \\urldef’d one shown by a macro', () => {
    // (ACM's references: `\urldef\tempurl\url{…}` stores the URL, `\showDOI{\tempurl}` sets it; the piece is a paper's macro by its
    // command, read as a text macro, its copy the glyphs with a space at a line's end and no break point, drawn as text: its
    // link annotations could not pair with what it drew, 2610.22065v1 p7 t126's \showURL)
    const B = docOf([{ lines: ['We release it at https://a.io/b_c.'] }])
    const content: Piece[] = [
      text('We release it at '),
      { t: 'el', id: '1', kind: 'macro', src: '\\showDOI{\\tempurl}' },
      text('.'),
    ]
    const u: InstrumentUnit = {
      id: unitId('para', content),
      kind: 'para',
      content,
      classes: [['1', { cls: 'other', literal: true, url: true, copy: 'https://a.io/b_c', cmd: 'showDOI' }]],
    }
    const ins = instrument(B, [u], (_, _n, j) => (j >= 17 && j < 33 ? [0, ROLE.element, 1] : [0, ROLE.text, -1]))
    const el = new Map(locate(ins, B, align(B, B)).members[0]!.elements).get('1')!
    expect(el.copy).toBe('https://a.io/b_c')
    expect(el.breaks).toEqual([
      [222, 8],
      [234, 10],
      [252, 13],
      [264, 15],
    ])
  })
  it('counts what stands before a URL’s break in its copy text’s code units: an astral character two, a ligature its letters (Devin on #630)', () => {
    // (the typesetter cuts the crop's copy text with String.slice: a count of glyphs put every cut after "𠮷" (U+20BB7, two
    // code units) or "ﬁ" (one glyph, two letters in a copy that holds its letters) a character early)
    const copy = 'https://𠮷.io/profile/x'
    const glyphs = run('https://𠮷.io/proﬁle/x')
    const asLetters = glyphs.map((x) => (x.u === 'ﬁ' ? { ...x, u: 'fi' } : x))
    const want = [
      [120, 8],
      [132, 11],
      [150, 14],
      [192, 22],
    ]
    expect(urlBreaks(glyphs, copy)).toEqual(want)
    expect(urlBreaks(asLetters, copy)).toEqual(want)
    // (and the page's own text, which holds the ligature as PDF.js gives it: its one code unit)
    expect(urlBreaks(glyphs, textOf(glyphs)).map(([, n]) => textOf(glyphs).slice(0, n))).toEqual([
      'https://',
      'https://𠮷.',
      'https://𠮷.io/',
      'https://𠮷.io/proﬁle/',
    ])
    expect(want.map(([, n]) => copy.slice(0, n))).toEqual([
      'https://',
      'https://𠮷.',
      'https://𠮷.io/',
      'https://𠮷.io/profile/',
    ])
  })
  it('counts a URL’s break offsets in the copy text it states, a space the glyphs stand apart by counted (Devin on #630)', () => {
    // (2610.22197v1's DOI and the eprint after it, one crop: a gap on a line stays a space in the copy (urlCopyOf), a rule TeX
    // drew for an underscore or a macro's own space. A count of the glyphs alone put every cut after the space a character
    // early; an astral character's two code units and both separators after it, before and after the space)
    const glyphs = [...run('https://𠮷.io/a'), ...run('b/c', 72 + 0.6 * 10 * 15 + 4)]
    const copy = urlCopyOf(glyphs)
    expect(copy).toBe('https://𠮷.io/a b/c')
    const breaks = urlBreaks(glyphs, copy)
    expect(breaks.map(([, n]) => copy.slice(0, n))).toEqual([
      'https://',
      'https://𠮷.',
      'https://𠮷.io/',
      'https://𠮷.io/a b/',
    ])
    // (a copy the glyphs are not, the source's reading of the URL: no break point stated, rather than one cutting elsewhere)
    expect(urlBreaks(glyphs, 'https://𠮷.io/a₁b/c')).toEqual([])
  })
  it('states a URL TeX set over two lines as one word, no space at the line’s end (#633 review)', () => {
    // (\url{https://a.io/lo/ng/path} broken after its "/": textOf reads the end of a line as PDF.js does, a space, which the
    // copy of a URL cannot hold. A break after a url.sty break character leaves no hyphen of TeX's: the url package sets
    // its characters as written)
    const B = docOf([{ lines: ['See https://a.io/lo/', 'ng/path ok.'] }])
    const content: Piece[] = [
      text('See '),
      { t: 'el', id: '1', kind: 'url', src: '\\url{https://a.io/lo/ng/path}' },
      text(' ok.'),
    ]
    const u: InstrumentUnit = { id: unitId('para', content), kind: 'para', content }
    const ins = instrument(B, [u], (_, _n, j) => (j >= 4 && j < 27 ? [0, ROLE.element, 1] : [0, ROLE.text, -1]))
    const el = new Map(locate(ins, B, align(B, B)).members[0]!.elements).get('1')!
    expect(el.ink.length).toBe(2)
    // (its text too: the line's end TeX set inside it is a join, as its copy reads it (lane url-join, 2026-11-10: 301 URLs of
    // the 88 drawn with a space where TeX broke them))
    expect(el.text).toBe('https://a.io/lo/ng/path')
    expect(el.copy).toBe('https://a.io/lo/ng/path')
    expect(el.copy).not.toMatch(/\s/)
  })
  it('states a URL TeX broke after its "/" with no space in its text (1706.03762v7: https://github.com/ tensorflow/…)', () => {
    // (the typesetter draws a URL over lines as its text, El.text: the space PDF.js reads at a line's end was drawn inside the
    // URL. Its copy, urlCopyOf, never held one; the text is read by the same rule: a line's end inside a URL is a join)
    const B = docOf([{ lines: ['is at https://github.com/', 'tensorflow/tensor2tensor.'] }])
    const content: Piece[] = [
      text('is at '),
      { t: 'el', id: '1', kind: 'url', src: '\\url{https://github.com/tensorflow/tensor2tensor}' },
      text('.'),
    ]
    const u: InstrumentUnit = { id: unitId('para', content), kind: 'para', content }
    const ins = instrument(B, [u], (_, _n, j) => (j >= 6 && j < 49 ? [0, ROLE.element, 1] : [0, ROLE.text, -1]))
    const el = new Map(locate(ins, B, align(B, B)).members[0]!.elements).get('1')!
    expect(el.ink.length).toBe(2)
    expect([el.text, el.copy]).toEqual([
      'https://github.com/tensorflow/tensor2tensor',
      'https://github.com/tensorflow/tensor2tensor',
    ])
  })
  it('states a literal mark its copy reads as one word with no space where TeX broke it (a DOI: 2610.19274v1’s)', () => {
    // (a DOI a macro sets as written, broken after its "022-" (TeX's url-like break, no hyphen of its own): its copy, the source's
    // reading, holds no space, so its line's end holds none; 9 such elements of the 88 kept the space after the URL rule alone)
    const B = docOf([{ lines: ['doi 10.1007/s10489-022-', '03676-0 here.'] }])
    const content: Piece[] = [
      text('doi '),
      { t: 'el', id: '1', kind: 'other', src: '\\doi{10.1007/s10489-022-03676-0}' },
      text(' here.'),
    ]
    const u: InstrumentUnit = {
      id: unitId('para', content),
      kind: 'para',
      content,
      classes: [['1', { cls: 'other', literal: true, copy: '10.1007/s10489-022-03676-0' }]],
    }
    const ins = instrument(B, [u], (_, _n, j) => (j >= 4 && j < 30 ? [0, ROLE.element, 1] : [0, ROLE.text, -1]))
    const el = new Map(locate(ins, B, align(B, B)).members[0]!.elements).get('1')!
    expect(el.ink.length).toBe(2)
    expect(el.text).toBe('10.1007/s10489-022-03676-0')
  })
  it('keeps a code mark’s line end a space where its copy holds one (TeX broke it at a space)', () => {
    // (\texttt{…} breaks at its spaces: a line's end inside it is the space TeX dropped there)
    const B = docOf([{ lines: ['run make all', 'targets now.'] }])
    const content: Piece[] = [
      text('run '),
      { t: 'el', id: '1', kind: 'code', src: '\\texttt{make all targets}' },
      text(' now.'),
    ]
    const u: InstrumentUnit = { id: unitId('para', content), kind: 'para', content }
    const ins = instrument(B, [u], (_, _n, j) => (j >= 4 && j < 19 ? [0, ROLE.element, 1] : [0, ROLE.text, -1]))
    const el = new Map(locate(ins, B, align(B, B)).members[0]!.elements).get('1')!
    expect(el.ink.length).toBe(2)
    expect(el.text).toBe('make all targets')
  })
  it('states a URL’s copy text as its glyphs on the page, not the source’s reading of it (#630’s 30 URLs: "_1" read as a subscript)', () => {
    // (2609.26457v1's "…/3-540-44668-0_13": the instrument's copy, texToText2 over \url{…}, read "_1" as the subscript "₁"; the
    // crop shows the page's glyphs and copies them, its breaks cut that text after its separators)
    const B = docOf([{ lines: ['See https://a.io/x_13.'] }])
    const content: Piece[] = [
      text('See '),
      { t: 'el', id: '1', kind: 'url', src: '\\url{https://a.io/x_13}' },
      text('.'),
    ]
    const u: InstrumentUnit = {
      id: unitId('para', content),
      kind: 'para',
      content,
      classes: [['1', { cls: 'other', copy: 'https://a.io/x₁3' }]],
    }
    const ins = instrument(B, [u], (_, _n, j) => (j >= 4 && j < 21 ? [0, ROLE.element, 1] : [0, ROLE.text, -1]))
    const el = new Map(locate(ins, B, align(B, B)).members[0]!.elements).get('1')!
    expect(el.copy).toBe('https://a.io/x_13')
    expect(el.breaks!.map(([, n]) => el.copy!.slice(0, n))).toEqual([
      'https://',
      'https://a.',
      'https://a.io/',
      'https://a.io/x_',
    ])
  })
  it('keeps a line inside a unit that no unit owns (a held line) as KEPT, in its place', () => {
    const pages: PageSpec[] = [{ lines: ['first line of it', 'a held line here', 'last line of it'] }]
    const B = docOf(pages)
    const u: InstrumentUnit = {
      id: unitId('para', [text('x')]),
      kind: 'para',
      content: [text('first line of it last line of it')],
    }
    const ins = instrument(B, [u], (_, n) => (n === 1 ? [-1, 0, -1] : [0, ROLE.text, -1]))
    const M = locate(ins, B, align(B, B)).members[0]!
    expect(M.lines.map((l) => [l[4], l[9] & 1])).toEqual([
      [700, 0],
      [688, 1],
      [676, 0],
    ])
  })
  it('takes no held line of glyphs no unit owns that stand on one of its own text lines (L1’s first held-line fault)', () => {
    // (the middle line: its first and last glyphs the unit's, its middle five owned by no unit: they stand on the unit's own
    // line, ink in no group, never a KEPT line over it (2610.20595v1 ord 55's case))
    const pages: PageSpec[] = [{ lines: ['first line of it', 'a held line here', 'last line of it'] }]
    const B = docOf(pages)
    const u: InstrumentUnit = {
      id: unitId('para', [text('x')]),
      kind: 'para',
      content: [text('first line of it a line here last line of it')],
    }
    const ins = instrument(B, [u], (_, n, j) => (n === 1 && j >= 18 && j <= 22 ? [-1, 0, -1] : [0, ROLE.text, -1]))
    const M = locate(ins, B, align(B, B)).members[0]!
    expect(M.lines.map((l) => [l[4], l[9] & 1])).toEqual([
      [700, 0],
      [688, 0],
      [676, 0],
    ])
  })
  it('keeps no element with a held line of another column at its height (L1’s 6 elements kept)', () => {
    // (2610.20595v1 p9 ord 55: a paragraph across two columns, a display row KEPT in the left one; its formulas on the right
    // column's text lines at that height were kept with it: an element's line is the one its ink stands on, across and along)
    const pages: PageSpec[] = [
      {
        lines: ['first line of it', 'a held line here', 'last line of it', { text: 'more of it x', x: 320, y: 688 }],
      },
    ]
    const B = docOf(pages)
    const content: Piece[] = [
      text('first line of it last line of it more of it '),
      { t: 'el', id: '1', kind: 'other', src: '$x$' },
    ]
    const u: InstrumentUnit = { id: unitId('para', content), kind: 'para', content }
    const ins = instrument(B, [u], (_, n, j) =>
      n === 1 ? [-1, 0, -1] : n === 3 && j === 58 ? [0, ROLE.element, 1] : [0, ROLE.text, -1],
    )
    const M = locate(ins, B, align(B, B)).members[0]!
    expect(M.lines.map((l) => [l[2], l[4], l[9] & 1])).toEqual([
      [72, 700, 0],
      [72, 688, 1],
      [72, 676, 0],
      [320, 688, 0],
    ])
    expect(M.elements.find(([id]) => id === '1')?.[1].keep).toBeUndefined()
  })
  it('states a forced break’s line from its point on B, and the class’s tail', () => {
    const pages: PageSpec[] = [
      {
        lines: ['one line', 'two lines', 'three end).'],
        points: [
          ['p0.1a', 7],
          ['p0.1b', 7],
        ],
      },
    ]
    const B = docOf(pages)
    const content: Piece[] = [
      text('one line'),
      { t: 'el', id: '1', kind: 'other', src: '\\\\' },
      text('two lines three end'),
    ]
    const u: InstrumentUnit = { id: unitId('para', content), kind: 'para', content }
    const ins: Instrument = {
      ...instrument(B, [u], () => [0, ROLE.text, -1]),
      places: [
        { unit: 0, piece: '1', page: 1, glyph: 8, end: false },
        { unit: 0, piece: '1', page: 1, glyph: 8, end: true },
      ],
    }
    const located = locate(ins, B, align(B, B))
    const M = located.members[0]!
    expect(M.elements.find(([id]) => id === '1')?.[1].ends).toEqual([0, 0])
    expect(M.tail?.map(([t]) => t)).toEqual([')', '.'])
  })
  it('cuts a label into its parts and keeps an element outside the unit’s lines in no group', () => {
    const pages: PageSpec[] = [{ lines: ['Figure 1: a caption', { text: '*', x: 400, y: 600 }] }]
    const B = docOf(pages)
    const content: Piece[] = [text('a caption'), { t: 'el', id: '1', kind: 'footnote', src: '\\footnotemark' }]
    const u: InstrumentUnit = { id: unitId('caption', content), kind: 'caption', content }
    const ins = instrument(B, [u], (_, n, j) =>
      n === 1 ? [0, ROLE.element, 1] : j < 9 ? [0, ROLE.label, -1] : [0, ROLE.text, -1],
    )
    const located = locate(ins, B, align(B, B))
    const M = located.members[0]!
    expect(M.labelAt).toMatchObject({
      name: ['Figure', expect.anything()],
      num: ['1', expect.anything()],
      punct: [':', expect.anything()],
    })
    const el = M.elements.find(([id]) => id === '1')?.[1]
    expect(el?.keep).toBe(1)
    expect(located.groups[0]!.glyphs.at(-1)).toBeNull()
  })
})

describe('an element’s own brackets (T12’s stated half)', () => {
  it('states the ink of a citation’s brackets, its first and last glyphs where they pair', () => {
    const B = docOf([{ lines: ['see [12] here'] }])
    const content: Piece[] = [text('see '), { t: 'el', id: '1', kind: 'cite', src: '\\cite{a}' }, text(' here')]
    const u: InstrumentUnit = { id: unitId('para', content), kind: 'para', content }
    const ins = instrument(B, [u], (_, _n, j) => (j >= 4 && j <= 7 ? [0, ROLE.element, 1] : [0, ROLE.text, -1]))
    const el = locate(ins, B, align(B, B)).members[0]!.elements.find(([id]) => id === '1')?.[1]
    expect(el?.text).toBe('[12]')
    expect(el?.brackets?.map((b) => b[1])).toEqual([72 + 4 * 6, 72 + 7 * 6])
  })
})

describe('a forced break with no point on B', () => {
  it('takes today’s reading: its own line that ends short of its column, where they are as many as such breaks', () => {
    const B = docOf([{ lines: ['a long first line of it here', 'short', 'a long third line of it here', 'end'] }])
    const content: Piece[] = [
      text('a long first line of it here short'),
      { t: 'el', id: '1', kind: 'other', src: '\\\\' },
      text('a long third line of it here end'),
    ]
    const u: InstrumentUnit = { id: unitId('para', content), kind: 'para', content }
    const M = locate(
      instrument(B, [u], () => [0, ROLE.text, -1]),
      B,
      align(B, B),
    ).members[0]!
    expect(M.elements.find(([id]) => id === '1')?.[1].ends).toEqual([1, 0])
    expect(M.read).toContain('breaks')
  })
})

describe('a display’s rows through locate', () => {
  it('states a fraction’s display as one KEPT row and one box of ink, its parts not rows of their own', () => {
    // (the numerator 6.8 pt over the row's baseline, the denominator 6.9 pt under it and set back left: the text line rule
    // cuts the denominator off as a line of its own)
    const B = docOf([
      {
        lines: [
          'a sum',
          { text: 'x=', x: 200, y: 680 },
          { text: 'ab', x: 224, y: 686.8 },
          { text: 'c', x: 222, y: 673.1 },
          { text: 'and so on', y: 660 },
        ],
      },
    ])
    const content: Piece[] = [
      text('a sum '),
      { t: 'el', id: '1', kind: 'display', src: '\\[x=\\frac{ab}{c}\\]' },
      text(' and so on'),
    ]
    const u: InstrumentUnit = { id: unitId('para', content), kind: 'para', content }
    const ins = instrument(B, [u], (_, n) => (n >= 1 && n <= 3 ? [0, ROLE.element, 1] : [0, ROLE.text, -1]))
    const M = locate(ins, B, align(B, B)).members[0]!
    expect(M.lines.map((l) => [l[4], l[9] & 1])).toEqual([
      [700, 0],
      [680, 1],
      [660, 0],
    ])
    expect(M.elements.find(([id]) => id === '1')?.[1].ink).toHaveLength(1)
  })
})

describe('forced breaks with no point on B, set one after the other', () => {
  it('reads two breaks that end one line as one short line (TeX ends the line at the first, the second sets an empty one)', () => {
    const B = docOf([
      { lines: ['a long first line of it here', 'short', { text: 'a long third line of it here', y: 664 }, 'end'] },
    ])
    const content: Piece[] = [
      text('a long first line of it here short'),
      { t: 'el', id: '1', kind: 'other', src: '\\\\' },
      { t: 'el', id: '2', kind: 'other', src: '\\\\' },
      text('\na long third line of it here end'),
    ]
    const u: InstrumentUnit = { id: unitId('para', content), kind: 'para', content }
    const M = locate(
      instrument(B, [u], () => [0, ROLE.text, -1]),
      B,
      align(B, B),
    ).members[0]!
    const ends = (id: string) => M.elements.find(([k]) => k === id)?.[1].ends
    expect(ends('1')?.[0]).toBe(1)
    expect(ends('2')?.[0]).toBe(1)
    expect(ends('1')?.[1]).toBeCloseTo(1, 1)
  })
})

describe('forced breaks with no point on B, placed by TeX’s points around them', () => {
  it('places a break by the next piece’s point, nothing that sets ink between, whatever a break at the unit’s end reads', () => {
    // (2608.16117v1 p3 t11: "… concludes our paper.\\\\ \n$\textbf{Notation}$: …from 1 to 2.\\\\": the author's empty line
    // before "Notation", and two more breaks at the paragraph's end on its last line. One short line against two groups paired
    // nothing, and the translation ran on through the blank line)
    const B = docOf([
      {
        lines: [
          'a long first line of it here',
          'short',
          { text: 'Notation and a third line ok', y: 664 },
          { text: 'end', y: 652 },
        ],
      },
    ])
    const content: Piece[] = [
      text('a long first line of it here short'),
      { t: 'el', id: '1', kind: 'other', src: '\\\\' },
      { t: 'el', id: '2', kind: 'other', src: '\\\\' },
      text('\n'),
      { t: 'el', id: '3', kind: 'math', src: '$\\textbf{Notation}$' },
      text(' and a third line ok end'),
      { t: 'el', id: '4', kind: 'other', src: '\\\\' },
      { t: 'el', id: '5', kind: 'other', src: '\\\\' },
    ]
    const u: InstrumentUnit = { id: unitId('para', content), kind: 'para', content }
    const ins: Instrument = {
      ...instrument(B, [u], (_, _n, j) => (j >= 33 && j <= 40 ? [0, ROLE.element, 3] : [0, ROLE.text, -1])),
      places: [
        { unit: 0, piece: '3', page: 1, glyph: 33, end: false },
        { unit: 0, piece: '3', page: 1, glyph: 41, end: true },
      ],
    }
    const M = locate(ins, B, align(B, B)).members[0]!
    const ends = (id: string) => M.elements.find(([k]) => k === id)?.[1].ends
    expect(ends('1')?.[0]).toBe(1)
    expect(ends('2')?.[0]).toBe(1)
    expect(ends('1')?.[1]).toBeCloseTo(1, 1)
    // (the breaks at the end end its last line: no line after them to state)
    expect(ends('4')).toBeUndefined()
    expect(ends('5')).toBeUndefined()
    // (TeX's point placed it: no line read by its short end)
    expect(M.read).not.toContain('breaks')
  })
  it('places a break by the point before it, across a page, where its line fills the measure', () => {
    // (the text before the break fills its line, the last of page 1, and the formula after it opens page 2: no short end to
    // read, the formula's point states the line)
    const B = docOf([
      { lines: ['a long first line of it here', 'a long second one fills it x'] },
      { lines: ['xy and more text of the unit', 'end'] },
    ])
    const content: Piece[] = [
      text('a long first line of it here a long second one fills it x'),
      { t: 'el', id: '1', kind: 'other', src: '\\\\' },
      { t: 'el', id: '2', kind: 'math', src: '$xy$' },
      text(' and more text of the unit end'),
    ]
    const u: InstrumentUnit = { id: unitId('para', content), kind: 'para', content }
    const ins: Instrument = {
      ...instrument(B, [u], (p, _n, j) => (p === 1 && j <= 1 ? [0, ROLE.element, 2] : [0, ROLE.text, -1])),
      places: [
        { unit: 0, piece: '2', page: 2, glyph: 0, end: false },
        { unit: 0, piece: '2', page: 2, glyph: 2, end: true },
      ],
    }
    const M = locate(ins, B, align(B, B)).members[0]!
    expect(M.elements.find(([k]) => k === '1')?.[1].ends).toEqual([1, 0])
  })
  it('pairs the breaks between two of TeX’s points with the lines that end there, where every one of them ends at a break', () => {
    // (a centred title "A Much Longer First Title Line\\ Second": its first line the longest, no short end to read; the
    // unit's start and end bound one line end and one break)
    const B = docOf([{ lines: ['A Much Longer First Title Line', { text: 'Second', x: 144 }] }])
    const content: Piece[] = [
      text('A Much Longer First Title Line'),
      { t: 'el', id: '1', kind: 'other', src: '\\\\' },
      text('Second'),
    ]
    const u: InstrumentUnit = { id: unitId('heading', content), kind: 'heading', content }
    const M = locate(
      instrument(B, [u], () => [0, ROLE.text, -1]),
      B,
      align(B, B),
    ).members[0]!
    expect(M.elements.find(([k]) => k === '1')?.[1].ends).toEqual([0, 0])
    expect(M.read).not.toContain('breaks')
  })
  it('takes a paragraph’s end TeX states at the break for the break’s own line end (a centred `\\\\`, \\@centercr)', () => {
    // (2610.30034v1 p1's title: in a centred block LaTeX's `\\` is \@centercr, which ends a paragraph, so TeX's paragraph end
    // stands at the break; 2608.25210v2 t8's second `\\`, after \raggedright, the same)
    const B = docOf([{ lines: ['A Much Longer First Title Line', { text: 'Second', x: 144 }] }])
    const content: Piece[] = [
      text('A Much Longer First Title Line'),
      { t: 'el', id: '1', kind: 'other', src: '\\\\' },
      text('Second'),
    ]
    const u: InstrumentUnit = { id: unitId('heading', content), kind: 'heading', content }
    const ins: Instrument = { ...instrument(B, [u], () => [0, ROLE.text, -1]), tex: { paragraphEnds: [[30]] } }
    const M = locate(ins, B, align(B, B)).members[0]!
    expect(M.elements.find(([k]) => k === '1')?.[1].ends).toEqual([0, 0])
  })
  it('places a break at TeX’s paragraph end in a block TeX set centred, past a line TeX wrapped itself', () => {
    // (2610.21504v1 p1's title "Receiver-Specific Interventional Valuation of / Semantic Atoms for\\ Budget-…": TeX wraps the
    // first line, the break ends the second; centred, every line short, two line ends for one break. TeX states the title
    // centred (`c`), where `\\` is \@centercr and its paragraph end, qe, stands at the break)
    const B = docOf([
      {
        lines: [
          { text: 'Receiver Specific Valuation of', x: 90 },
          { text: 'Semantic Atoms for', x: 126 },
          'Budget Constrained Multi Agent Talk',
        ],
      },
    ])
    const content: Piece[] = [
      text('Receiver Specific Valuation of Semantic Atoms for'),
      { t: 'el', id: '1', kind: 'other', src: '\\\\' },
      text('\nBudget Constrained Multi Agent Talk'),
    ]
    const unit = (align?: 'c'): InstrumentUnit => ({
      id: unitId('heading', content),
      kind: 'heading',
      content,
      ...(align ? { align } : {}),
    })
    const ends = (u: InstrumentUnit) => {
      const ins: Instrument = { ...instrument(B, [u], () => [0, ROLE.text, -1]), tex: { paragraphEnds: [[48]] } }
      return locate(ins, B, align(B, B)).members[0]!.elements.find(([k]) => k === '1')?.[1].ends
    }
    expect(ends(unit('c'))).toEqual([1, 0])
    // (TeX states no alignment: the paragraph's end may be the source's own, and the window states nothing)
    expect(ends(unit())).toBeUndefined()
  })
  it('reads short ends between two points only, where the breaks there are as many: one window’s count is not another’s', () => {
    // (a paragraph with a natural line end and a break, text on both sides of it, between the unit's start and a formula's
    // point, then a break at the unit's end: the window holds two line ends and one break, read by the short one; the break at
    // the end is no window's, and paired nothing before)
    const B = docOf([{ lines: ['a long first line of it here', 'short', 'ab xy a long third line of i', 'end'] }])
    const content: Piece[] = [
      text('a long first line of it here short'),
      { t: 'el', id: '1', kind: 'other', src: '\\\\' },
      text('ab '),
      { t: 'el', id: '2', kind: 'math', src: '$xy$' },
      text(' a long third line of i end'),
      { t: 'el', id: '3', kind: 'other', src: '\\\\' },
    ]
    const u: InstrumentUnit = { id: unitId('para', content), kind: 'para', content }
    const ins: Instrument = {
      ...instrument(B, [u], (_, _n, j) => (j >= 36 && j <= 37 ? [0, ROLE.element, 2] : [0, ROLE.text, -1])),
      places: [{ unit: 0, piece: '2', page: 1, glyph: 36, end: false }],
    }
    const M = locate(ins, B, align(B, B)).members[0]!
    expect(M.elements.find(([k]) => k === '1')?.[1].ends?.[0]).toBe(1)
    expect(M.read).toContain('breaks')
    expect(M.elements.find(([k]) => k === '3')?.[1].ends).toBeUndefined()
  })
})

describe('a glyph whose Unicode is no reading of it (A17, today’s nu)', () => {
  it('reads a font’s own map and tells a glyph it gives no character of, or one no Unicode stands for', () => {
    const map = mappedOf({ toUnicode: { _map: [undefined, 'a', 'ﬁ', '∑'] } })
    expect(map && [...map].sort()).toEqual(['a', 'f', 'i', 'ﬁ', '∑'].sort())
    expect(unmapped('a', map)).toBe(false)
    expect(unmapped('Í', map)).toBe(true)
    expect(unmapped('', null)).toBe(true)
    expect(unmapped(' ', map)).toBe(false)
    expect(mappedOf({ toUnicode: { firstChar: 0, lastChar: 255 } })).toBeNull()
  })
  it('states no text of an element one of whose glyphs is nu: the typesetter crops it (TEX:420)', () => {
    const B = docOf([{ lines: ['see 12 here'] }])
    B.pages[0]!.glyphs[5]!.nu = true
    const content: Piece[] = [text('see '), { t: 'el', id: '1', kind: 'ref', src: '\\ref{a}' }, text(' here')]
    const u: InstrumentUnit = { id: unitId('para', content), kind: 'para', content }
    const ins = instrument(B, [u], (_, _n, j) => (j >= 4 && j <= 5 ? [0, ROLE.element, 1] : [0, ROLE.text, -1]))
    const el = locate(ins, B, align(B, B)).members[0]!.elements.find(([id]) => id === '1')?.[1]
    expect(el?.ink).toHaveLength(1)
    expect(el?.text).toBeUndefined()
  })
})

describe('an element’s text as the page’s text layer reads it (PDF.js’s spaces)', () => {
  it('sets a space where a glyph starts past the one before by more than 0.102 of the size, or on another line', () => {
    // "[22," then TeX's interword glue (3.3 pt at 10 pt), "21]" (each glyph 6 pt wide in the helper)
    const gs = [g('['), g('2', 78), g('2', 84), g(',', 90), g('2', 99.3), g('1', 105.3), g(']', 111.3)]
    expect(textOf(gs)).toBe('[22, 21]')
    // a kern under 1.02 pt is no space; an expanded font's size along the line is the one PDF.js reads
    expect(textOf([g('a'), g('b', 78.9)])).toBe('ab')
    expect(textOf([g('a'), g('b', 79.1)])).toBe('a b')
    expect(textOf([g('a', 72, 700, { along: 12 }), g('b', 79.1)])).toBe('ab')
    // the next line's first glyph, left of the last one's end
    expect(textOf([g('a', 300), g('b', 72, 688)])).toBe('a b')
  })
})

describe('an element’s text across a line TeX ended inside a word', () => {
  // 1810.04805v2 p1, arXiv's PDF as the engine reads it: the citation "(Peters et al., 2018a; Rad- ford et al., 2018)", whose
  // "Rad-" ends the abstract's fifth line and "ford" begins the sixth; staging drew "Rad- ford" in the translation
  const nimbus = (u: string, x0: number, x1: number, y: number, fill = 128): DocGlyph => ({
    ...g(u, x0, y, { base: 'NimbusRomNo9L-Regu', size: 9.96, fill }),
    x1,
    ix1: x1,
  })
  const radford = [
    nimbus('a', 242.37, 246.8, 540.69),
    nimbus(';', 246.8, 249.57, 540.69, 0),
    nimbus('R', 253.89, 260.53, 540.69),
    nimbus('a', 260.53, 264.96, 540.69),
    nimbus('d', 264.96, 269.94, 540.69),
    nimbus('-', 269.94, 273.26, 540.69),
    nimbus('f', 89.01, 92.33, 528.74),
    nimbus('o', 92.33, 97.31, 528.74),
    nimbus('r', 97.31, 100.62, 528.74),
    nimbus('d', 100.62, 105.61, 528.74),
    nimbus('e', 109.54, 113.96, 528.74),
    nimbus('t', 113.96, 116.73, 528.74),
  ]
  it('takes out the hyphen TeX set to break a word at a line’s end, and the line’s end with it', () => {
    expect(textOf(radford)).toBe('a; Radford et')
    expect(fillRunsOf(radford)).toEqual([
      ['a', 128],
      ['; ', 0],
      ['Radford et', 128],
    ])
  })
  it('keeps a word’s own hyphen, joined across the line’s end: before a capital, in a typewriter face, in a URL', () => {
    const word = (s: string, x: number, y: number, o: Partial<DocGlyph> = {}) =>
      [...s].map((c, i) => g(c, x + 6 * i, y, o))
    // (Lee-Thorp: a capital after it starts the name's own part)
    expect(textOf([...word('Lee-', 270, 700), ...word('Thorp', 72, 688)])).toBe('Lee-Thorp')
    // (a typewriter face's \hyphenchar is −1 under LaTeX: TeX sets no hyphen of its own in it)
    const tt = { base: 'CMTT10' }
    expect(textOf([...word('google-', 270, 700, tt), ...word('research', 72, 688, tt)])).toBe('google-research')
    // (a URL or a code mark: TeX sets its characters as written)
    expect(textOf([...word('google-', 270, 700), ...word('research', 72, 688)], { literal: true })).toBe(
      'google-research',
    )
    // (one letter before it: under \lefthyphenmin, no break of TeX's)
    expect(textOf([...word('e-', 270, 700), ...word('mail', 72, 688)])).toBe('e-mail')
    // (a hyphen after no letter is no word's: the line's end a space, as before)
    expect(textOf([...word('3 -', 270, 700), ...word('x', 72, 688)])).toBe('3 - x')
  })
  it('keeps a hyphen with a digit on either side, joined across the line’s end: TeX hyphenates letters alone', () => {
    // (2609.19644v1's included pages "128-|bit", "DeepSeek-|3.2"; production drew "DeepSeek- V3" on a sheet's pane)
    const word = (s: string, x: number, y: number) => [...s].map((c, i) => g(c, x + 6 * i, y))
    expect(textOf([...word('128-', 270, 700), ...word('bit', 72, 688)])).toBe('128-bit')
    expect(textOf([...word('DeepSeek-', 240, 700), ...word('3.2', 72, 688)])).toBe('DeepSeek-3.2')
  })
  it('keeps the hyphens the corpus showed are a word’s own: TeX hyphenates the first word after a space alone, to its minimums', () => {
    // (the stage 1a corpus, the parts' element texts: 2307.16209v1 p138 "arXiv:gr- qc/0511111", p140 "[hep- th]", p146
    // "imrn/article- pdf/2015/18/", 2608.06701v1 p5 "SWE- bench Pro"; each was taken for TeX's break and joined)
    const line = (s: string, x: number, y: number) => {
      const out: DocGlyph[] = []
      let at = x
      for (const c of s) {
        if (c === ' ') at += 3.3
        else {
          out.push(g(c, at, y))
          at += 6
        }
      }
      return out
    }
    // (not the first word after its space: TeX hyphenates no other)
    expect(textOf([...line('see arXiv:gr-', 200, 700), ...line('qc/0511111', 72, 688)])).toBe('see arXiv:gr-qc/0511111')
    expect(textOf([...line('url imrn/article-', 200, 700), ...line('pdf/2015', 72, 688)])).toBe(
      'url imrn/article-pdf/2015',
    )
    // (fewer letters after it than \righthyphenmin, LaTeX's 3)
    expect(textOf([...line('see [hep-', 200, 700), ...line('th].', 72, 688)])).toBe('see [hep-th].')
    // (a hyphen of its own after the word on the next line, before a space: TeX hyphenates no word an explicit hyphen's
    // discretionary follows, tex.web §899; 2610.20451v1's "extreme- mass-ratio")
    expect(textOf([...line('the extreme-', 200, 700), ...line('mass-ratio limit', 72, 688)])).toBe(
      'the extreme-mass-ratio limit',
    )
    // (capitals alone before it, a small letter after: an acronym's compound, SWE-bench, BERT-based)
    expect(textOf([...line('on SWE-', 200, 700), ...line('bench Pro', 72, 688)])).toBe('on SWE-bench Pro')
    // (the first word after its space, a bracket before it as TeX skips: TeX's break, out)
    expect(textOf([...line('see (Col-', 200, 700), ...line('lobert and', 72, 688)])).toBe('see (Collobert and')
  })
  it('decides by the source where it states the word: its hyphen kept where the source writes one, out where it joins', () => {
    const line = (s: string, x: number, y: number) => [...s].map((c, i) => g(c, x + 6 * i, y))
    const anti = [...line('an anti-', 200, 700), ...line('inflammatory drug', 72, 688)]
    // (TeX's rules alone take this hyphen for TeX's; the element's source writes the compound with its own)
    expect(textOf(anti, { source: '\\href{https://example.org/a}{an anti-inflammatory drug}' })).toBe(
      'an anti-inflammatory drug',
    )
    expect(
      fillRunsOf(
        anti.map((x, i) => (i < 3 ? { ...x, fill: 0x80 } : x)),
        { source: 'an anti-inflammatory drug' },
      ),
    ).toEqual([
      ['an ', 0x80],
      ['anti-inflammatory drug', 0],
    ])
    // (a capital after it is a compound's to TeX's rules alone; the source joins the word: TeX broke it, `\sys` TensorCast)
    const tensor = [...line('of Tensor-', 200, 700), ...line('Cast is', 72, 688)]
    expect(textOf(tensor)).toBe('of Tensor-Cast is')
    expect(textOf(tensor, { source: 'we build TensorCast, a' })).toBe('of TensorCast is')
    // (TeX's own discretionary hyphen written in the source, `\-`, is no hyphen of the word's)
    expect(textOf(anti, { source: 'an anti\\-inflammatory drug' })).toBe('an antiinflammatory drug')
    // (a source that does not state the word, a citation's key: TeX's rules decide, as before)
    expect(textOf(tensor, { source: '\\cite{tensor-cast:2024}' })).toBe('of Tensor-Cast is')
  })
})

describe('an element’s text across a line’s end, decided by its source through locate', () => {
  // ("an anti-" ends the first line, "inflammatory" begins the second: the element's glyphs 4..23)
  const B = docOf([{ lines: ['see an anti-', 'inflammatory here'] }])
  const read = (el: Piece, around: Piece[] = [text('see '), el, text(' here')]) => {
    const u: InstrumentUnit = { id: unitId('para', around), kind: 'para', content: around }
    const ins = instrument(B, [u], (_, _n, j) => (j >= 4 && j <= 23 ? [0, ROLE.element, 1] : [0, ROLE.text, -1]))
    return locate(ins, B, align(B, B)).members[0]!.elements.find(([id]) => id === '1')?.[1]
  }
  it('keeps the hyphen the element’s own TeX writes, which TeX’s rules alone took for TeX’s', () => {
    const el = read({ t: 'el', id: '1', kind: 'macro', src: '\\term{an anti-inflammatory}' })
    expect(el?.text).toBe('an anti-inflammatory')
  })
  it('keeps the hyphen the unit’s text writes, where the element’s TeX does not state the word', () => {
    const el: Piece = { t: 'el', id: '1', kind: 'macro', src: '\\term{x}' }
    const said = read(el, [text('see '), el, text(' here, an anti-inflammatory one')])
    expect(said?.text).toBe('an anti-inflammatory')
    // (stated nowhere: TeX's rules, as before)
    expect(read(el)?.text).toBe('an antiinflammatory')
  })
})

describe('a unit set in capitals its source writes in lowercase (Style.upper, today’s smallCapsOf rule)', () => {
  const word = (s: string) => [...s].map((c, i) => g(c, 72 + 6 * i))
  it('is upper where most of the source’s lowercase letters are set as capitals, not where the source writes capitals', () => {
    expect(styleOf(word('INTRODUCTION'), 10, 'Introduction').upper).toBe(1)
    expect(styleOf(word('PASCAL'), 10, 'PASCAL').upper).toBeUndefined()
    expect(styleOf(word('Introduction'), 10, 'Introduction').upper).toBeUndefined()
    // (without a source, most letters capitals, as before)
    expect(styleOf(word('PASCAL')).upper).toBe(1)
  })
})

describe('an element’s text in runs of one fill (today’s fillRunsOf)', () => {
  it('cuts a link’s coloured text from its black brackets, each space the fill of the glyph before it', () => {
    const blue = { fill: 0x80 }
    const gs = [g('('), g('P', 78, 700, blue), g('e', 84, 700, blue), g('2', 93.3, 700, blue), g(')', 99.3)]
    expect(fillRunsOf(gs)).toEqual([
      ['(', 0],
      ['Pe 2', 0x80],
      [')', 0],
    ])
    expect(fillRunsOf([g('a'), g('b', 78)])).toBeNull()
  })
})

describe('an element’s text with each accent TeX set over its letter joined to it (\\accent; Unicode’s NFC)', () => {
  it('reads a spacing accent set over its letter as the accented letter, before it or after it, in its text and its runs', () => {
    // (2602.23285v2 p2's citation "(Klötergens et al." as OT1's \accent sets it: the accent, a move back over it, the letter; the
    // text read "(Kl¨otergens")
    const kl = [g('('), g('K', 78), g('l', 84), g('¨', 90), g('o', 90), ...run('tergens', 96)]
    expect(textOf(kl)).toBe('(Klötergens')
    // (the letter first, its accent set back over it; a capital's accent raised over it, by its height less the x-height)
    expect(textOf([g('e'), g('´', 72, 701.5)])).toBe('é')
    expect(textOf([g('P'), g('E', 78), g('´', 78, 702)])).toBe('PÉ')
    // (a dotless i under its accent is the dotted letter's: Física)
    expect(textOf([g('F'), g('´', 78), g('ı', 78), ...run('sica', 84)])).toBe('Física')
    // (a mark that advances as any glyph does is no letter's accent: a URL's "~user"; nor one of another font, a formula's \hat)
    expect(textOf([g('~'), g('u', 78)])).toBe('~u')
    expect(textOf([g('a'), g('´', 72, 700, { base: 'CMMI10', font: 'CMMI10' })])).toBe('a´')
    // (its runs of one fill: the accented letter in its letter's)
    const blue = { fill: 0xff }
    expect(
      fillRunsOf([
        g('('),
        g('K', 78, 700, blue),
        g('l', 84, 700, blue),
        g('¨', 90, 700, blue),
        g('o', 90, 700, blue),
        g(')', 96),
      ]),
    ).toEqual([
      ['(', 0],
      ['Klö', 0xff],
      [')', 0],
    ])
  })
})

describe('a face of one pitch (Rule 1)', () => {
  it('reads one advance per font program of a face, within its unit, a thousandth of the size, its subsets each their own', () => {
    // (2411.13093v4's Consolas: the subsets of p4's figure set 549 thousandths of their size, p9's and p19's 550; read as one
    // advance for the face, its code boxes on p19 were translated while its bold's, all at 550, were kept)
    const at = (u: string, x: number, advance: number, font: string, size = 10) =>
      ({
        ...g(u, x, 700, { base: font.replace(/^[A-Z]{6}\+/, ''), size }),
        font,
        x1: x + (advance * size) / 1000,
      }) as DocGlyph
    const glyphs = [
      at('r', 72, 549, 'AAAAAA+Consolas'),
      at('e', 80, 549, 'AAAAAA+Consolas', 8),
      at('q', 88, 549.6, 'BBBBBB+Consolas', 9.5),
      at('u', 96, 550.3, 'BBBBBB+Consolas', 4.8),
      at('i', 72, 278, 'CCCCCC+Times'),
      at('m', 80, 778, 'CCCCCC+Times'),
      at('a', 72, 444, 'DDDDDD+Pair'),
      at('e', 80, 444, 'DDDDDD+Pair'),
      at('i', 88, 278, 'DDDDDD+Pair'),
      at('a', 72, 444, 'EEEEEE+Solo'),
      at('i', 80, 278, 'FFFFFF+Solo'),
    ]
    expect([...fixedFacesOf(glyphs)]).toEqual(['Consolas'])
  })
  it('reads no face of one pitch off letters a proportional face sets at one advance too: a narrow letter and a wider one, at one advance', () => {
    // (Codex on #634, 7dcb71534: a figure's label "node" in Helvetica, its four letters 556 thousandths each, as Helvetica's
    // lowercase n, o, d and e all are, beside Times body text: no typewriter's evidence, the label translated)
    const at = (u: string, x: number, advance: number, font: string) =>
      ({
        ...g(u, x, 700, { base: font.replace(/^[A-Z]{6}\+/, ''), size: 10 }),
        font,
        x1: x + advance / 100,
      }) as DocGlyph
    const node = [
      at('n', 72, 556, 'AAAAAA+Helvetica'),
      at('o', 80, 556, 'AAAAAA+Helvetica'),
      at('d', 88, 556, 'AAAAAA+Helvetica'),
      at('e', 96, 556, 'AAAAAA+Helvetica'),
    ]
    const body = [at('i', 72, 278, 'BBBBBB+Times'), at('m', 80, 778, 'BBBBBB+Times')]
    expect([...fixedFacesOf([...node, ...body])]).toEqual([])
    // (a typewriter's narrow letter at the advance of its others: one pitch)
    const tt = [
      at('n', 72, 525, 'CCCCCC+Courier'),
      at('i', 80, 525, 'CCCCCC+Courier'),
      at('l', 88, 525, 'CCCCCC+Courier'),
    ]
    expect([...fixedFacesOf([...node, ...body, ...tt])]).toEqual(['Courier'])
  })
})

describe('one family, as two fonts’ names tell it (PDF.js states no family where the engine reads)', () => {
  it('is the name before its first hyphen, or the name without PDF.js’s own style words and hyphens', () => {
    // (one family in two weights or two slants: 2608.06701v1 p2's bubbles, a bold word inside a row of ArialMT)
    expect(oneFamily('MUFUZY+ArialMT', 'MUFUZY+Arial-BoldMT')).toBe(true)
    expect(oneFamily('TimesNewRomanPSMT', 'AAAAAI+TimesNewRomanPS-ItalicMT')).toBe(true)
    expect(oneFamily('ArialMT', 'Arial-BoldItalicMT')).toBe(true)
    // (today's reading: the part before the first hyphen)
    expect(oneFamily('KZNDUM+NimbusRomNo9L-Regu', 'PPHKCD+NimbusRomNo9L-Medi')).toBe(true)
    expect(oneFamily('DejaVuSans', 'DejaVuSans-Oblique')).toBe(true)
    // (two faces whose names differ by more than a style word: two families)
    expect(oneFamily('ArialMT', 'ArialNarrow-Bold')).toBe(false)
    expect(oneFamily('NimbusRomNo9L-Regu', 'NimbusSanL-Regu')).toBe(false)
    expect(oneFamily('CMR10', 'CMMI10')).toBe(false)
    expect(oneFamily('ArialMT', 'Arial-Black')).toBe(false)
  })
})
