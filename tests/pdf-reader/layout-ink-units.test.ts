import { describe, expect, it } from 'vitest'
import { claimInk, inkOff, inkUnitsOf } from '@/pdf-reader/engine/layout/ink-units.mjs'
import { inkLeft, type LedgerPage, ledgerOf } from '@/pdf-reader/engine/layout/ledger.mjs'
import { inkBundleUnitsOf, unitStands } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { unitClass } from '@/pdf-reader/engine/rules/content-classes.mjs'

// The ink units (docs/route/orphan-text.md §4, stage 2): text no source unit owns made units of our own glyphs, each of its
// class's kind, its numbering, leaders and page number left the original's ink, its math kept, an echo of the source unit it
// repeats, its rows as the layout maker writes a unit's

type G = LedgerPage['glyphs'][number] & { top: number; bottom: number; ix0: number; ix1: number }
/** a run's glyphs, 5 pt a character, on a baseline */
function run(text: string, x: number, y: number, { font = 'CMR10', size = 10, fill = 0 }: { font?: string; size?: number; fill?: number } = {}): G[] {
  const out: G[] = []
  for (const ch of text) {
    if (ch !== ' ') out.push({ u: ch, x0: x, x1: x + 5, ix0: x, ix1: x + 5, y, top: y + 7, bottom: y - 2, size, font, fill } as G)
    x += 5
  }
  return out
}
type Part = { glyphs: G[]; owner?: string | null } | { point: string } | { para: number }
function page(...parts: Part[]) {
  const glyphs: G[] = [], own: (string | null)[] = [], points: { name: string; glyph: number; box: number }[] = [], paras: { name: string; glyph: number; box: number }[] = []
  for (const p of parts) {
    if ('point' in p) points.push({ name: p.point, glyph: glyphs.length, box: 0 })
    else if ('para' in p) paras.push({ name: `q${p.para}`, glyph: glyphs.length, box: 0 })
    else for (const g of p.glyphs) { glyphs.push(g); own.push(p.owner ?? null) }
  }
  return { page: { glyphs, boxes: [], points, paras, view: [0, 0, 612, 792] }, own }
}
const unitsOf = (pages: ReturnType<typeof page>[], units: { kind: string; pieces: unknown[] }[] = []) => {
  const ledger = ledgerOf(pages.map(p => p.page), { glyphs: pages.map(p => p.own) }, { units })
  return { ledger, ink: inkUnitsOf(pages.map(p => p.page) as never, ledger, { units: units as never }) }
}
const textOf = (u: { pieces: { t: string; s?: string }[] }) => u.pieces.map(p => (p.t === 'text' ? p.s : p.t === 'ph' ? '⟦·⟧' : '')).join('')
const SOURCE = [{ kind: 'heading', pieces: [{ t: 'text', s: 'Introduction' }] }, { kind: 'para', pieces: [{ t: 'text', s: 'Body words of the paper here' }] }]

describe('inkUnitsOf', () => {
  it("makes a head's line a unit of its own, its section number and its page number the original's ink", () => {
    const pg = page({ point: 'c1-2' }, { glyphs: run('1.1. HISTORICAL OVERVIEW', 100, 760) }, { glyphs: run('17', 520, 760) }, { point: 'bs1' }, { glyphs: run('Body', 100, 600), owner: 'u1' }, { point: 'be1' })
    const { ink } = unitsOf([pg], SOURCE)
    expect(ink.map(u => [u.id, u.kind, u.cls, textOf(u)])).toEqual([[2, 'inkheads', 'heads', 'HISTORICAL OVERVIEW']])
    expect(unitClass(ink[0]!.kind)).toBe('heads')
    // (its glyphs the title's alone: the numbering's are no unit's)
    const H = 'HISTORICAL OVERVIEW'.replace(/ /g, '').length
    expect(ink[0]!.glyphs.text).toHaveLength(H)
    // (its line's box the title's glyphs', its baseline, size and face theirs)
    expect(ink[0]!.rows.lines.slice(0, 8)).toEqual([1, 125, 220, 760, 767, 758, 10, 'CMR10'])
    expect(ink[0]!.rows.unit).toEqual([2, 'inkheads', 9, 0, 1])
  })

  it('makes a running head that repeats no source unit one translation: each page after the first echoes the first', () => {
    const head = (n: number) => page({ glyphs: run('JOURNAL NAME, VOL. XX', 100, 760) }, { glyphs: run(String(n), 520, 760) }, { point: 'bs1' }, { glyphs: run('Body', 100, 600), owner: 'u1' }, { point: 'be1' })
    const { ink } = unitsOf([head(1), head(2), head(3)], SOURCE)
    expect(ink.map(u => [u.id, u.kind, textOf(u), u.echo])).toEqual([[2, 'inkheads', 'JOURNAL NAME, VOL. XX', null], [3, 'inkheads', 'JOURNAL NAME, VOL. XX', 2], [4, 'inkheads', 'JOURNAL NAME, VOL. XX', 2]])
    expect(ink[1]!.pieces).toEqual(ink[0]!.pieces)
    const units = inkBundleUnitsOf(ink as never), stands = new Uint8Array(5).fill(1, 0, 2)
    units.forEach((u, i) => { if (unitStands(u, 2 + i, stands, { ink: true })) stands[2 + i] = 1 })
    expect([...stands]).toEqual([1, 1, 1, 1, 1])
  })

  it("makes a contents entry a unit up to its leaders, which stay the original's with its number and page, and echoes its heading's row", () => {
    const pg = page({ point: 'bs1' }, { point: 'n1.contents.e' }, { glyphs: run('1 Introduction . . . . . 3', 100, 700) }, { glyphs: run('2 Methods . . . . . 5', 100, 688) }, { point: 'be1' })
    const { ink } = unitsOf([pg], SOURCE)
    expect(ink.map(u => [u.kind, textOf(u), u.echo])).toEqual([['inkcontents', 'Introduction', 0], ['inkcontents', 'Methods', null]])
    // (an echo's pieces its source unit's: its row is that unit's, k for k)
    expect(ink[0]!.pieces).toEqual(SOURCE[0]!.pieces)
    expect(ink[0]!.glyphs.text).toHaveLength('Introduction'.length)
  })

  it("joins a contents entry's lines by TeX's paragraphs where the compile marked them, else where a line ends in no page number", () => {
    const lines = [{ glyphs: run('3 Black hole perturbations and', 100, 700) }, { glyphs: run('quasinormal modes . . . 21', 110, 688) }, { glyphs: run('4 Results . . . 30', 100, 676) }]
    const marked = page({ point: 'bs1' }, { point: 'n1.contents.e' }, { para: 7 }, lines[0]!, lines[1]!, { para: 8 }, lines[2]!, { point: 'be1' })
    const bare = page({ point: 'bs1' }, { point: 'n1.contents.e' }, lines[0]!, lines[1]!, lines[2]!, { point: 'be1' })
    for (const pg of [marked, bare]) expect(unitsOf([pg]).ink.map(textOf)).toEqual(['Black hole perturbations and quasinormal modes', 'Results'])
  })

  it("joins a contents entry's lines by TeX's paragraph at the list's own leading, a thesis's set double (2610.19274v1 pp67-69)", () => {
    // (each line 29 pt below the one before at 12 pt, 2.4 of its size: past BLOCK_DY, so each line was a unit, translated alone)
    const at = (s: string, y: number) => ({ glyphs: run(s, 100, y, { size: 12 }) })
    const entry = [at('6 Internal structure of the depth-', 700), at('wise convolutions and the mod-', 671), at('ule shown here . . . 14', 642)]
    const marked = page({ point: 'bs1' }, { point: 'n1.contents.e' }, { para: 280 }, ...entry, { para: 281 }, at('7 Overview of the module . . . 15', 613), { point: 'be1' })
    expect(unitsOf([marked]).ink.map(textOf)).toEqual(['Internal structure of the depthwise convolutions and the module shown here', 'Overview of the module'])
    // (no paragraph marked: the lines' places, as before, BLOCK_DY)
    const bare = page({ point: 'bs1' }, { point: 'n1.contents.e' }, ...entry, { point: 'be1' })
    expect(unitsOf([bare]).ink.length).toBe(3)
    // (but never the skip between a list's items, which carry no point of their own and so read as the paragraph before: a
    // bibliography's entries, 10 pt apart inside one and 20 between two, stay apart, 2610.20266v1 p21)
    const at10 = (s: string, y: number) => ({ glyphs: run(s, 100, y, { size: 9 }) })
    const items = page({ point: 'bs1' }, { para: 9 }, at10('[1] R. Adams, Sobolev spaces, vol. 140 of', 700), at10('Pure and Applied Mathematics, 2003.', 690), at10('[2] G. Beylkin and the fast wavelet', 670), at10('transforms of operators, 1991.', 660), at10('[3] A. Damianou, deep processes', 640), at10('in Machine Learning, 2013.', 630), { point: 'be1' })
    expect(unitsOf([items]).ink.length).toBe(3)
  })

  it("makes an orphan's block a unit, a paragraph of TeX's apart from the next, and its math a placeholder whose ink stays", () => {
    const pg = page(
      { point: 'bs1' }, { para: 1 }, { glyphs: [...run('Assume that there exist', 100, 700), ...run('x', 220, 700, { font: 'CMMI10' }), ...run('in the closed set', 230, 700)] },
      { glyphs: run('and so the proof ends.', 100, 688) }, { para: 2 }, { glyphs: run('A new paragraph begins', 100, 676) }, { point: 'be1' },
    )
    const { ink } = unitsOf([pg])
    expect(ink.map(u => [u.kind, textOf(u)])).toEqual([['inkorphan', 'Assume that there exist ⟦·⟧ in the closed set and so the proof ends.'], ['inkorphan', 'A new paragraph begins']])
    expect(ink[0]!.rows.ph).toEqual([[1, 'math', 0, 1, 220, 700, 225, 707, 698]])
    expect(ink[0]!.glyphs.ph).toEqual([[1, pg.page.glyphs.findIndex(g => g.font === 'CMMI10')]])
    expect(ink[0]!.rows.lines.length / 8).toBe(2)
    expect(ink[0]!.rows.frames).toEqual([1, 0, 0, 2, -1, ink[0]!.rows.frames[5]])
  })

  it("keeps each run of another weight, slant or colour than the unit's a group of its own, as a source unit's (the sweep's (d))", () => {
    // (a theorem's bold head before its regular note, a term in hyperref's blue, a phrase in italics: drawn in the unit's one
    // style, regular, before)
    const pg = page({ point: 'bs1' }, { para: 1 }, {
      glyphs: [...run('Definition 1', 100, 700, { font: 'CMBX10' }), ...run('([TT])', 165, 700), ...run('holds', 200, 700, { fill: 0x0071bc }), ...run('here and now', 230, 700, { font: 'CMTI10' })],
    }, { point: 'be1' })
    const { ink } = unitsOf([pg])
    expect(ink.map(u => u.pieces)).toEqual([[
      { t: 'open', id: 1, src: '\\textbf{' }, { t: 'text', s: 'Definition 1' }, { t: 'close', id: 1, src: '}' }, { t: 'text', s: ' ([TT]) ' },
      { t: 'open', id: 2, src: '\\textcolor[HTML]{0071BC}{' }, { t: 'text', s: 'holds' }, { t: 'close', id: 2, src: '}' }, { t: 'text', s: ' ' },
      { t: 'open', id: 3, src: '\\textit{' }, { t: 'text', s: 'here and now' }, { t: 'close', id: 3, src: '}' },
    ]])
    expect(ink[0]!.rows.unit[4]).toBe(11)
    // (a unit in one style is its text alone: the reader measures that style on its glyphs; a bold one with a regular word, that
    // word in \textmd)
    expect(unitsOf([page({ point: 'bs1' }, { glyphs: run('Collusion index', 100, 700, { font: 'CMBX12' }) }, { point: 'be1' })]).ink[0]!.pieces).toEqual([{ t: 'text', s: 'Collusion index' }])
    const bold = unitsOf([page({ point: 'bs1' }, { glyphs: [...run('Lemma 3.3.', 100, 700, { font: 'CMBX10' }), ...run('(1)', 155, 700)] }, { point: 'be1' })]).ink[0]!
    expect(bold.pieces.map(p => p.t === 'text' ? p.s : p.src)).toEqual(['Lemma 3.3. ', '\\textmd{', '(1)', '}'])
  })

  it("keeps a script a text face sets after a formula's run in that run's placeholder: C_n²'s \"2\" (2610.19274v1 p67)", () => {
    // (C and its subscript n in a math italic, the square's 2 a text face's digit, smaller and raised: it was a word of the text,
    // drawn on the translation's baseline)
    const sup = (s: string, x: number, y: number) => run(s, x, y, { font: 'CMR7', size: 7 })
    const pg = page({ point: 'bs1' }, { para: 1 }, { glyphs: [...run('turbulence strength', 100, 700), ...run('C', 200, 700, { font: 'CMMI10' }), ...run('n', 205, 698, { font: 'CMMI7', size: 7 }), ...sup('2', 210, 704), ...run('is high', 220, 700)] }, { point: 'be1' })
    const { ink } = unitsOf([pg])
    expect(ink.map(textOf)).toEqual(['turbulence strength ⟦·⟧ is high'])
    expect(ink[0]!.glyphs.ph.length).toBe(3)
    // (its source the run's characters whole: a run of one face over two words was the first word's alone, 2307.16209v1's "s = 1/2")
    expect(ink[0]!.pieces.find(p => p.t === 'ph')).toEqual({ t: 'ph', src: '$Cn2$' })
    const frac = unitsOf([page({ point: 'bs1' }, { para: 1 }, { glyphs: [...run('the modes for spin', 100, 700), ...run('s', 200, 700, { font: 'CMMI10' }), ...run('=', 210, 700, { font: 'CMMI10' }), ...run('1/2', 220, 700, { font: 'CMMI10' }), ...run('in the black hole', 240, 700)] }, { point: 'be1' })]).ink[0]!
    expect(frac.pieces.find(p => p.t === 'ph')).toEqual({ t: 'ph', src: '$s=1/2$' })
  })

  it("keeps a web address in the text's face a placeholder: a note of an address alone is no unit", () => {
    const notes = (text: string) => page({ point: 'bs1' }, { glyphs: run('Body', 100, 600), owner: 'u1' }, { point: 'be1' }, { glyphs: run(text, 100, 120, { size: 8 }) }, { glyphs: run('7', 300, 40) })
    expect(unitsOf([notes('1https://github.com/tensorflow/tensor2tensor')], SOURCE).ink).toEqual([])
    const { ink } = unitsOf([notes('2Code at https://example.org/x and data')], SOURCE)
    expect(ink.map(u => [u.kind, textOf(u)])).toEqual([['inknotes', '2Code at ⟦·⟧ and data']])
  })

  it('makes no unit of a line of no class it translates: math, code, a number, a figure, the bibliography', () => {
    const pg = page(
      { point: 'bs1' }, { glyphs: [...run('softmax', 100, 700), ...run('x', 140, 700, { font: 'CMMI10' }), ...run('=', 150, 700)] },
      { glyphs: run('print hello world', 100, 680, { font: 'CMTT10' }) }, { glyphs: run('12 34', 100, 660) },
      { point: 'n2.ref.e' }, { glyphs: run('A. Author. A title. 2020.', 100, 640) }, { point: 'be1' },
    )
    expect(unitsOf([pg]).ink).toEqual([])
  })

  it("gives a block of an author unit's names the names toggle's kind, and leaves its affiliation the always translated", () => {
    const authors = [{ kind: 'author', pieces: [{ t: 'text', s: 'Jose Agustin Lozano Torres and Axel de la Macorra' }] }]
    const pg = page({ point: 'bs1' }, { para: 1 }, { glyphs: run('Jose Agustin Lozano Torres and Axel de la Macorra', 100, 740) }, { para: 2 }, { glyphs: run('Instituto de Fisica, Universidad Nacional', 100, 720) }, { point: 'be1' })
    const { ink } = unitsOf([pg], authors)
    expect(ink.map(u => [u.kind, u.cls, unitClass(u.kind)])).toEqual([['inknames', 'names', 'names'], ['inkorphan', 'orphan', 'orphan']])
  })

  it('claims its glyphs under its own groups, where no unit owns them, and the ledger counts no orphan left', () => {
    const pg = page({ point: 'bs1' }, { para: 1 }, { glyphs: [...run('Lost words', 100, 700), ...run('y', 160, 700, { font: 'CMMI10' })] }, { glyphs: run('Body', 100, 600), owner: 'u0' }, { point: 'be1' })
    const pages = [pg], { ledger, ink } = unitsOf(pages, [SOURCE[1]!])
    const own = { glyphs: pages.map(p => p.own.slice()) }
    expect(ledger.orphanLetters).toBe(10)
    expect(claimInk(own, ink)).toBe(10)
    expect(own.glyphs[0]!.slice(0, 10)).toEqual([...Array(9).fill('u1'), 'u1.p'])
    expect(inkLeft(ledger, own, pages.map(p => p.page)).orphanLetters).toBe(0)
    // (one the wrap cannot hide alone is off: its page not wrapped, or its placeholder's group merged into its text's)
    expect(inkOff(ink as never, new Map([[1, { ok: true }]]))).toEqual([])
    expect(inkOff(ink as never, new Map([[1, { ok: false }]]))).toEqual([1])
    expect(inkOff(ink as never, new Map([[1, { ok: true, merged: true }]]))).toEqual([1])
  })

  it('writes each as a bundle unit that stands, of its kind, with its echo', () => {
    const pg = page({ point: 'bs1' }, { point: 'n1.contents.e' }, { glyphs: run('1 Introduction . . 3', 100, 700) }, { glyphs: run('2 Other things . . 4', 100, 688) }, { point: 'be1' })
    const { ink } = unitsOf([pg], SOURCE)
    const units = inkBundleUnitsOf(ink as never)
    expect(units).toEqual([['inkcontents', 0, null, null, null, [[0, 'Introduction']], 0], ['inkcontents', 0, null, null, null, [[0, 'Other things']], null]])
    const stands = new Uint8Array(4).fill(1, 0, 2)
    expect(units.map((u, i) => unitStands(u, 2 + i, stands, { ink: true }))).toEqual([true, true])
    // (not in a chunk of the source units' format)
    expect(unitStands(units[0], 2, stands)).toBe(false)
  })
})
