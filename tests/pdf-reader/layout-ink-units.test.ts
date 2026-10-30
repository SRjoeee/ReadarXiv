import { describe, expect, it } from 'vitest'
import { claimInk, inkOff, inkUnitsOf, KEPT_DY, keptUnitsOf } from '@/pdf-reader/engine/layout/ink-units.mjs'
import { inkLeft, type LedgerPage, ledgerOf } from '@/pdf-reader/engine/layout/ledger.mjs'
import { inkBundleUnitsOf, UNIT_FLAG_BITS, unitStands } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { toTranslate } from '@/pdf-reader/engine/layer-proto/rows.mjs'
import { unitClass } from '@/pdf-reader/engine/rules/content-classes.mjs'

// The ink units (docs/route/orphan-text.md §4, stage 2): text no source unit owns made units of our own glyphs, each of its
// class's kind, its numbering, leaders and page number left the original's ink, its math kept, an echo of the source unit it
// repeats, its rows as the layout maker writes a unit's

type G = LedgerPage['glyphs'][number] & { top: number; bottom: number; ix0: number; ix1: number }
/** a run's glyphs, 5 pt a character, on a baseline; a space `space` pt (a face's word space where a test needs it: CMR10's 3.33) */
function run(text: string, x: number, y: number, { font = 'CMR10', size = 10, fill = 0, space = 5 }: { font?: string; size?: number; fill?: number; space?: number } = {}): G[] {
  const out: G[] = []
  for (const ch of text) {
    if (ch !== ' ') out.push({ u: ch, x0: x, x1: x + 5, ix0: x, ix1: x + 5, y, top: y + 7, bottom: y - 2, size, font, fill } as G)
    x += ch === ' ' ? space : 5
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
    const pg = page({ point: 'c1-2' }, { glyphs: run('1.1.  HISTORICAL OVERVIEW', 100, 760) }, { glyphs: run('17', 520, 760) }, { point: 'bs1' }, { glyphs: run('Body', 100, 600), owner: 'u1' }, { point: 'be1' })
    const { ink } = unitsOf([pg], SOURCE)
    expect(ink.map(u => [u.id, u.kind, u.cls, textOf(u)])).toEqual([[2, 'inkheads', 'heads', 'HISTORICAL OVERVIEW']])
    expect(unitClass(ink[0]!.kind)).toBe('heads')
    // (its glyphs the title's alone: the numbering's are no unit's)
    const H = 'HISTORICAL OVERVIEW'.replace(/ /g, '').length
    expect(ink[0]!.glyphs.text).toHaveLength(H)
    // (its line's box the title's glyphs', its baseline, size and face theirs)
    expect(ink[0]!.rows.lines.slice(0, 8)).toEqual([1, 130, 225, 760, 767, 758, 10, 'CMR10'])
    expect(ink[0]!.rows.unit).toEqual([2, 'inkheads', 9, 0, 1])
  })

  it("keeps a number in a head's or an entry's own words the unit's, the page's own ink a number set apart alone (2010.11929v2's head)", () => {
    const words = (s: string, x: number, y: number) => ({ glyphs: run(s, x, y, { space: 3.33 }) })
    const heads = (...lines: { glyphs: G[] }[]) => unitsOf([page({ point: 'c1-2' }, ...lines, { point: 'bs1' }, { glyphs: run('Body', 100, 600), owner: 'u1' }, { point: 'be1' })], SOURCE).ink
    const ICLR = 'Published as a conference paper at ICLR 2021'
    // (a year inside a head, at a word space from the word before: the head's, translated in its flow, no glyph of it left)
    const year = heads(words(ICLR, 100, 760))
    expect(year.map(textOf)).toEqual([ICLR])
    expect(year[0]!.glyphs.text).toHaveLength(ICLR.replace(/ /g, '').length)
    // (a folio beside it, set apart: the page's own ink; the year the head's still)
    const folio = heads(words(ICLR, 100, 760), { glyphs: run('12', 520, 760) })
    expect(folio.map(textOf)).toEqual([ICLR])
    expect(folio[0]!.glyphs.text).toHaveLength(ICLR.replace(/ /g, '').length)
    // (a running head on page after page, the same year on each: the head's still, one translation the pages after echo)
    const every = unitsOf([1, 2, 3].map(() => page({ point: 'c1-2' }, words(ICLR, 100, 760), { point: 'bs1' }, { glyphs: run('Body', 100, 600), owner: 'u1' }, { point: 'be1' })), SOURCE).ink
    expect(every.map(u => [textOf(u), u.echo])).toEqual([[ICLR, null], [ICLR, 2], [ICLR, 2]])
    // (amsart's odd page: a title as wide as the line between its \hfil's, its folio \llap'ed at the edge, two digits nearer its
    // last word than its words are to each other, 2610.21884v1; the folio differs from page to page where the words recur: the
    // page's own, the head one translation)
    const amsart = [11, 13, 15].map(n => page({ point: 'c1-2' }, { glyphs: [...run('BACKWARD MEAN CURVATURE FLOW', 100, 760, { space: 4 }), ...run(String(n), 239, 760)] }, { point: 'bs1' }, { glyphs: run('Body', 100, 600), owner: 'u1' }, { point: 'be1' }))
    expect(unitsOf(amsart, SOURCE).ink.map(u => [textOf(u), u.echo])).toEqual([['BACKWARD MEAN CURVATURE FLOW', null], ['BACKWARD MEAN CURVATURE FLOW', 2], ['BACKWARD MEAN CURVATURE FLOW', 2]])
    // (an even page's: its folio first, set apart; a head that starts with a year, and one with an article, theirs)
    expect(heads({ glyphs: run('12', 100, 760) }, words('AUTHOR ET AL.', 300, 760)).map(textOf)).toEqual(['AUTHOR ET AL.'])
    expect(heads(words('2021 IEEE International Conference on Robotics', 100, 760)).map(textOf)).toEqual(['2021 IEEE International Conference on Robotics'])
    expect(heads(words('A Study of Wavelets', 100, 760)).map(textOf)).toEqual(['A Study of Wavelets'])
    // (an entry's title that ends in a year before its leaders: the year the title's, its page number alone the original's)
    const entry = unitsOf([page({ point: 'bs1' }, { point: 'n1.contents.e' }, { glyphs: [...run('4', 100, 700), ...run('Results for 2021 . . . 14', 115, 700, { space: 3.33 })] }, { point: 'be1' })]).ink
    expect(entry.map(u => [textOf(u), u.rows.unit[1]])).toEqual([['Results for 2021', 'inkcontents']])
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
    const pg = page({ point: 'bs1' }, { point: 'n1.contents.e' }, { glyphs: run('1  Introduction . . . . . 3', 100, 700) }, { glyphs: run('2  Methods . . . . . 5', 100, 688) }, { point: 'be1' })
    const { ink } = unitsOf([pg], SOURCE)
    expect(ink.map(u => [u.kind, textOf(u), u.echo])).toEqual([['inkcontents', 'Introduction', 0], ['inkcontents', 'Methods', null]])
    // (an echo's pieces its source unit's: its row is that unit's, k for k)
    expect(ink[0]!.pieces).toEqual(SOURCE[0]!.pieces)
    expect(ink[0]!.glyphs.text).toHaveLength('Introduction'.length)
  })

  it("keeps the stop TeX set right after a formula at a contents line's end the entry's, its leaders the original's (2610.19274v1's list of figures)", () => {
    // (the stop a word of its own by its face alone, abutting the formula: the sentence's, translated with it; a leader dot stands
    // a word's gap from the word before it, \@dottedtocline's \mkern\@dotsep)
    const lof = (title: string, math: string, y: number, tail: string) => {
      const text = run(title, 125, y)
      const x = text.at(-1)!.x1 + 3.33
      const f = run(math, x, y, { font: 'CMMI10' })
      return { glyphs: [...text, ...f, ...run(`.${tail}`, f.at(-1)!.x1, y)] }
    }
    const pg = page({ point: 'bs1' }, { point: 'n1.listfigure.e' }, { para: 12 }, { glyphs: run('12', 100, 700) }, lof('Strength', 'C', 700, ' . . . 45'), { para: 13 }, { glyphs: run('13', 100, 688) }, lof('Distance', 'L', 688, ''), { point: 'be1' })
    const ink = unitsOf([pg]).ink
    expect(ink.map(textOf)).toEqual(['Strength ⟦·⟧.', 'Distance ⟦·⟧.'])
    // (each stop's glyph the unit's own, hidden with it; the leaders' dots and the page number no unit's)
    const owned = new Set(ink.flatMap(u => u.glyphs.text.map(([, g]) => g)))
    const stops = pg.page.glyphs.flatMap((g, i) => (g.u === '.' ? [i] : []))
    expect(stops.map(i => owned.has(i))).toEqual([true, false, false, false, true])
  })

  it("joins a contents entry's lines by TeX's paragraphs where the compile marked them, else where a line ends in no page number", () => {
    const lines = [{ glyphs: run('3  Black hole perturbations and', 100, 700) }, { glyphs: run('quasinormal modes . . . 21', 110, 688) }, { glyphs: run('4  Results . . . 30', 100, 676) }]
    const marked = page({ point: 'bs1' }, { point: 'n1.contents.e' }, { para: 7 }, lines[0]!, lines[1]!, { para: 8 }, lines[2]!, { point: 'be1' })
    const bare = page({ point: 'bs1' }, { point: 'n1.contents.e' }, lines[0]!, lines[1]!, lines[2]!, { point: 'be1' })
    for (const pg of [marked, bare]) expect(unitsOf([pg]).ink.map(textOf)).toEqual(['Black hole perturbations and quasinormal modes', 'Results'])
  })

  it("joins a contents entry's lines by TeX's paragraph at the list's own leading, a thesis's set double (2610.19274v1 pp67-69)", () => {
    // (each line 29 pt below the one before at 12 pt, 2.4 of its size: past BLOCK_DY, so each line was a unit, translated alone)
    // (its number at the list's edge, its text and its lines after it a number's width in: TeX's \@dottedtocline)
    const at = (s: string, y: number, x = 115) => ({ glyphs: run(s, x, y, { size: 12 }) })
    const entry = [at('6  Internal structure of the depth-', 700, 100), at('wise convolutions and the mod-', 671), at('ule shown here . . . 14', 642)]
    const marked = page({ point: 'bs1' }, { point: 'n1.contents.e' }, { para: 280 }, ...entry, { para: 281 }, at('7  Overview of the module . . . 15', 613, 100), { point: 'be1' })
    expect(unitsOf([marked]).ink.map(textOf)).toEqual(['Internal structure of the depthwise convolutions and the module shown here', 'Overview of the module'])
    // (no paragraph marked: the lines' places, as before, BLOCK_DY)
    const bare = page({ point: 'bs1' }, { point: 'n1.contents.e' }, ...entry, { point: 'be1' })
    expect(unitsOf([bare]).ink.length).toBe(3)
    // (but never the skip between a list's items, which carry no point of their own and so read as the paragraph before: a
    // bibliography's entries, 10 pt apart inside one and 20 between two, stay apart, 2610.20266v1 p21)
    const at10 = (s: string, y: number) => ({ glyphs: run(s, 100, y, { size: 9 }) })
    const items = page({ point: 'bs1' }, { para: 9 }, at10('[1] R. Adams, Sobolev spaces, vol. 140 of', 700), at10('Pure and Applied Mathematics, 2003.', 690), at10('[2] G. Beylkin and the fast wavelet', 670), at10('transforms of operators, 1991.', 660), at10('[3] A. Damianou, deep processes', 640), at10('in Machine Learning, 2013.', 630), { point: 'be1' })
    expect(unitsOf([items]).ink.length).toBe(3)
    // (and single-line entries, 20 apart, all at the list's edge: three, not one — Codex on #487)
    const single = page({ point: 'bs1' }, { para: 9 }, at10('Ando and Zhang, a framework for learning.', 700), at10('Wang and Shang, building the pipelines.', 680), at10('Davis, on the letters of the year.', 660), { point: 'be1' })
    expect(unitsOf([single]).ink.length).toBe(3)
    // (an entry set double on a page whose other lines are single: one unit still, whatever the page's leading — Devin on #487)
    const mixed = page({ point: 'bs1' }, { para: 3 }, ...Array.from({ length: 8 }, (_, k) => ({ glyphs: run(`an orphan line of words ${k}`, 100, 780 - 12 * k, { size: 12 }) })), { point: 'n1.contents.e' }, { para: 280 }, ...entry, { point: 'be1' })
    expect(unitsOf([mixed]).ink.map(textOf)).toContain('Internal structure of the depthwise convolutions and the module shown here')
    // (a bibliography as 2610.20266v1 p21 sets it: its centred heading, then its entries, each line after the first hung under the
    // text, 11 pt apart inside one and 22 between two, the labels right-aligned so that [10] starts half a size left of [8]: the
    // heading, [8] and [10] apart, each entry whole)
    const at9 = (s: string, x: number, y: number) => ({ glyphs: run(s, x, y, { size: 9 }) })
    const bib = page(
      { point: 'bs1' }, { para: 191 }, at9('REFERENCES', 264.5, 735.6),
      at9('[8] I. Daubechies, Ten Lectures on Wavelets, vol. 61 of CBMS', 79.2, 713.8), at9('Regional Conference Series, SIAM, 1992.', 110.3, 702.8),
      at9('[10] V. Druskin, A. Greenbaum, and L. Knizhnerman, Using', 74.5, 680.9), at9('nonsymmetric Lanczos for matrix functions.', 109.5, 669.9),
      { point: 'be1' },
    )
    expect(unitsOf([bib]).ink.map(textOf)).toEqual([
      'REFERENCES',
      '[8] I. Daubechies, Ten Lectures on Wavelets, vol. 61 of CBMS Regional Conference Series, SIAM, 1992.',
      '[10] V. Druskin, A. Greenbaum, and L. Knizhnerman, Using nonsymmetric Lanczos for matrix functions.',
    ])
  })

  it("measures a hanging line from its paragraph's first line, never from a column's top where the paragraph runs on (2610.21770v1 p6)", () => {
    // (REVTeX's bibliography as 2610.21770v1 sets it when no unit owns it: its entries set no point of their own, so every line is
    // the paragraph before's; each entry's label at the column's edge, its lines after it hung 10 pt in, its journal's line a link
    // of numbers no unit holds, 20 pt above the next entry. The column begins with a line an entry runs on to: measured from it,
    // each next entry's label line read as a hanging line, and the column was one unit, every entry's link drawn inside it)
    const at = (s: string, x: number, y: number) => ({ glyphs: run(s, x, y, { size: 9 }) })
    const column = page(
      { point: 'bs1' }, { para: 50 }, { glyphs: run('The data are available on request.', 100, 760), owner: 'u7' },
      at('transport phenomena in junctions of a compensated', 110, 700), at('ferrimagnet and a normal metal, Phys. Rev. B', 110, 690), at('113, 094425 (2026).', 110, 680),
      at('[21] Y. Liu, S.-D. Guo, Two-dimensional fully', 100, 670), at('compensated ferrimagnetism, Phys. Rev. Lett.', 110, 660), at('134, 106703 (2025).', 110, 650),
      at('[22] Z. Zhang, Y. Wei, Fully compensated', 100, 640), at('ferrimagnetism in a monolayer, Nanoscale', 110, 630),
      { point: 'be1' },
    )
    expect(unitsOf([column]).ink.map(textOf)).toEqual([
      'transport phenomena in junctions of a compensated ferrimagnet and a normal metal, Phys. Rev. B',
      '[21] Y. Liu, S.-D. Guo, Two-dimensional fully compensated ferrimagnetism, Phys. Rev. Lett.',
      '[22] Z. Zhang, Y. Wei, Fully compensated ferrimagnetism in a monolayer, Nanoscale',
    ])
    // (the same lines where the paragraph's point is on the column's first line: a paragraph hung from its first, one unit, as
    // the thesis's list of figures above)
    const opened = page(
      { point: 'bs1' }, { para: 50 }, at('transport phenomena in junctions of a compensated', 110, 700), at('ferrimagnet and a normal metal, Phys. Rev. B', 110, 690),
      at('113, 094425 (2026).', 110, 680), at('[21] Y. Liu, S.-D. Guo, Two-dimensional fully', 100, 670), { point: 'be1' },
    )
    expect(unitsOf([opened]).ink.length).toBe(1)
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

  // (an affiliation no source unit owns stays an orphan's ink unit, always translated: rule 8 reads an author unit's words alone.
  // The names toggle is the whole author block since 2026-10-30, so such a line is the maker's to class as names, with a
  // PIPELINE of its own: not yet)
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

  it("claims the rules TeX painted on its lines, as a source unit's text does (#117: an OT1 \\_ in an orphan line, 2610.19159v1)", () => {
    const pg = page({ point: 'bs1' }, { para: 1 }, { glyphs: run('Read task spec', 100, 700) }, { point: 'be1' })
    // (the \\_ between "task" and "spec" on the baseline; a rule half a pitch below the line, no rule of it)
    Object.assign(pg.page, { boxes: [145.5, 700, 149.5, 700.4, 100, 693, 160, 693.4], paths: [0, 1] })
    const pages = [pg], { ink } = unitsOf(pages)
    const own = { glyphs: pages.map(p => p.own.slice()), boxes: [[null, null] as (string | null)[]] }
    claimInk(own, ink, pages.map(p => p.page) as never)
    expect(own.boxes[0]).toEqual([`u${ink[0]!.id}`, null])
    // (with no pages given, its glyphs alone, as before)
    const bare = { glyphs: pages.map(p => p.own.slice()), boxes: [[null, null] as (string | null)[]] }
    claimInk(bare, ink)
    expect(bare.boxes[0]).toEqual([null, null])
  })

  it("gives a rule inside one of its placeholders' extent to that placeholder: an inline fraction's bar, which its crop redraws (review of #502)", () => {
    // ("Consider the ratio x/y in this case": the numerator and the denominator a formula's glyphs, its bar between them on the
    // line's band; the \_ of "task_spec" in the same line the text's)
    const pg = page({ point: 'bs1' }, { para: 1 }, { glyphs: [...run('Consider the ratio', 100, 700), ...run('x', 195, 702.5, { font: 'CMMI10' }), ...run('y', 195, 697.5, { font: 'CMMI10' }), ...run('in task spec', 210, 700)] }, { point: 'be1' })
    Object.assign(pg.page, { boxes: [194.5, 700.3, 200.5, 700.7, 260.5, 700, 264.5, 700.4], paths: [0, 1] })
    const pages = [pg], { ink } = unitsOf(pages)
    const own = { glyphs: pages.map(p => p.own.slice()), boxes: [[null, null] as (string | null)[]] }
    claimInk(own, ink, pages.map(p => p.page) as never)
    const id = ink[0]!.id
    expect(own.glyphs[0]!.filter(g => g === `u${id}.p`)).toHaveLength(2)
    expect(own.boxes[0]).toEqual([`u${id}.p`, `u${id}`])
  })

  it("cuts a biblatex bibliography one entry a unit of the references' class, by the compile's points, each entry's label the original's (2610.35877v1)", () => {
    // ("References" set by \printbibliography, then two entries, each after its point bi<n>: the first over two lines, the second
    // after its label [2], which the list's \item set before the point; a line after the zone's next unit is no entry's)
    const pg = page(
      { point: 'bs1' },
      { glyphs: run('References', 100, 740, { size: 12 }) },
      { point: 'bi1' }, { glyphs: run('Assran, M. and A. Bardes (2025). Self-Supervised Video Models', 100, 720) }, { glyphs: run('Enable Understanding and Planning.', 110, 708) },
      { glyphs: run('[2]', 100, 690) }, { point: 'bi2' }, { glyphs: run('Barber, R. F. (2023). Conformal Prediction Beyond', 118, 690) },
      { point: 'be1' },
    )
    const { ink } = unitsOf([pg], SOURCE)
    expect(ink.map(u => [u.kind, textOf(u)])).toEqual([
      ['inkorphan', 'References'],
      ['inkreferences', 'Assran, M. and A. Bardes (2025). Self-Supervised Video Models Enable Understanding and Planning.'],
      ['inkreferences', 'Barber, R. F. (2023). Conformal Prediction Beyond'],
    ])
    expect(ink.map(u => unitClass(u.kind))).toEqual(['orphan', 'references', 'references'])
    // (the label's glyphs no unit's: the original's ink, as a \bibitem's)
    expect(ink[2]!.glyphs.text).toHaveLength('Barber,R.F.(2023).ConformalPredictionBeyond'.length)
  })

  it("keeps every line of a biblatex entry in its unit, one of a URL alone or of numbers alone too (2610.35877v1's url lines)", () => {
    // (biblatex's `url:` then the address in a typewriter face on the next line, as \url breaks it; an entry's last line of
    // numbers alone; a line of no letter pairs past the zone is no entry's)
    const pg = page(
      { point: 'bs1' },
      { point: 'bi1' }, { glyphs: run('Barber, R. F. (2023). Conformal Prediction. In: Annals 51.2. url:', 100, 720) },
      { glyphs: run('https://doi.org/10.1214/23-AOS2276', 110, 708, { font: 'CMTT10' }) },
      { point: 'bi2' }, { glyphs: run('Bickel, S. (2009). Covariate Shift. In: JMLR 10, pp.', 100, 690) }, { glyphs: run('2137-2155.', 110, 678) },
      { point: 'be1' },
    )
    const { ink } = unitsOf([pg], SOURCE)
    expect(ink.map(u => u.kind)).toEqual(['inkreferences', 'inkreferences'])
    const lines = (u: (typeof ink)[number]) => new Set([...u.glyphs.text, ...u.glyphs.ph].map(([, g]) => pg.page.glyphs[g]!.y).sort((a, b) => b - a))
    expect([...lines(ink[0]!)]).toEqual([720, 708])
    expect([...lines(ink[1]!)]).toEqual([690, 678])
    // (the URL's line a row of the unit's whole: its baseline, size and face its own glyphs', as a text line's are its words' —
    // with none of them, the layout file refused the page's part, every unit on those pages left undrawn)
    const rows = ink[0]!.rows.lines
    expect(rows).toHaveLength(16)
    expect(rows.every(v => typeof v === 'number' || typeof v === 'string')).toBe(true)
    expect(rows.slice(8)).toEqual([1, 110, expect.any(Number), 708, expect.any(Number), expect.any(Number), 10, 'CMTT10'])
  })

  it("keeps an entry one unit over a page whose running head stands between its parts, a URL alone its continuation (Codex on #509)", () => {
    const p1 = page({ point: 'bs1' }, { point: 'bi1' }, { glyphs: run('Barber, R. F. (2023). Conformal Prediction. In: Annals 51.2. url:', 100, 120) }, { point: 'be1' })
    const p2 = page(
      { point: 'c1-2' }, { glyphs: run('CALIBRATION UNDER SHIFT', 200, 760) },
      { point: 'bs2' }, { glyphs: run('https://doi.org/10.1214/23-AOS2276', 110, 700, { font: 'CMTT10' }) },
      { point: 'bi2' }, { glyphs: run('Bickel, S. (2009). Covariate Shift. In: JMLR 10.', 100, 688) }, { point: 'be2' },
    )
    const { ink } = unitsOf([p1, p2], SOURCE)
    expect(ink.map(u => [u.kind, textOf(u)])).toEqual([
      ['inkreferences', 'Barber, R. F. (2023). Conformal Prediction. In: Annals 51.2. url: ⟦·⟧'],
      ['inkheads', 'CALIBRATION UNDER SHIFT'],
      ['inkreferences', 'Bickel, S. (2009). Covariate Shift. In: JMLR 10.'],
    ])
    // (the URL on the second page the first entry's: a row of its own there)
    expect(ink[0]!.rows.lines.filter((_, k) => k % 8 === 0)).toEqual([1, 2])
  })

  it("ends an entry where its bibliography ends, so that the next one's heading of a title of its own is no entry's (Codex on #509)", () => {
    // (\printbibliography[type=article,title={Articles}] then [type=book,title={Books}]: biblatex's \blx@endbibliography sets bz<n>)
    const pg = page(
      { point: 'bs1' },
      { glyphs: run('Articles', 100, 740, { size: 12 }) },
      { point: 'bi1' }, { glyphs: run('Assran, M. (2025). Video Models. In: arXiv.', 100, 720) }, { point: 'bz1' },
      { glyphs: run('Books', 100, 690, { size: 12 }) },
      { point: 'bi2' }, { glyphs: run('Bauschke, H. H. (2017). Convex Analysis. Springer.', 100, 670) }, { point: 'bz2' },
      { point: 'be1' },
    )
    const { ink } = unitsOf([pg], SOURCE)
    expect(ink.map(u => [u.kind, textOf(u)])).toEqual([
      ['inkorphan', 'Articles'],
      ['inkreferences', 'Assran, M. (2025). Video Models. In: arXiv.'],
      ['inkorphan', 'Books'],
      ['inkreferences', 'Bauschke, H. H. (2017). Convex Analysis. Springer.'],
    ])
  })

  it('writes each as a bundle unit that stands, of its kind, with its echo', () => {
    const pg = page({ point: 'bs1' }, { point: 'n1.contents.e' }, { glyphs: run('1  Introduction . . 3', 100, 700) }, { glyphs: run('2  Other things . . 4', 100, 688) }, { point: 'be1' })
    const { ink } = unitsOf([pg], SOURCE)
    const units = inkBundleUnitsOf(ink as never)
    expect(units).toEqual([['inkcontents', 0, null, null, null, [[0, 'Introduction']], 0], ['inkcontents', 0, null, null, null, [[0, 'Other things']], null]])
    const stands = new Uint8Array(4).fill(1, 0, 2)
    expect(units.map((u, i) => unitStands(u, 2 + i, stands, { ink: true }))).toEqual([true, true])
    // (not in a chunk of the source units' format)
    expect(unitStands(units[0], 2, stands)).toBe(false)
  })
})

// The kept blocks (rule 10, the owner's ruling of 2026-10-30): the text no unit owns once the ink units have claimed theirs, a
// unit never translated that lights as one block on both panes
describe('keptUnitsOf', () => {
  /** the kept blocks of pages after the ink units, the ink units' glyphs claimed */
  const keptOf = (pages: ReturnType<typeof page>[], units: { kind: string; pieces: unknown[] }[] = SOURCE) => {
    const { ledger, ink } = unitsOf(pages, units)
    const own = { glyphs: pages.map(p => p.own.slice()) }
    claimInk(own, ink)
    const kept = keptUnitsOf(pages.map(p => p.page) as never, ledger, (p: number, g: number) => own.glyphs[p - 1]?.[g] ?? null, { from: units.length + ink.length })
    return { ink, kept }
  }
  const TT = { font: 'CMTT10' }
  const body = (y = 720) => ({ glyphs: run('Body words of the paper here', 100, y), owner: 'u1' })

  it("makes a listing's lines one kept block, its brace and its blank line in it: no pieces, its rows the lines' boxes, never sent", () => {
    const pg = page({ point: 'bs1' }, body(), { glyphs: run('def f(x):', 100, 700, TT) }, { glyphs: run('return x', 120, 688, TT) }, { glyphs: run('}', 100, 676, TT) }, { glyphs: run('print(f(1))', 100, 652, TT) }, { point: 'be1' })
    const { ink, kept } = keptOf([pg])
    expect(ink).toEqual([])
    expect(kept.map(u => [u.id, u.kind, u.cls, u.kept, u.pieces, u.echo])).toEqual([[2, 'inkorphan', 'code', true, [], null]])
    const r = kept[0]!.rows
    expect(r.unit).toEqual([2, 'inkorphan', 9, 0, 0])
    expect(r.lines.filter((_, j) => j % 8 === 0)).toEqual([1, 1, 1, 1])
    expect(r.lines.slice(0, 8)).toEqual([1, 100, 145, 700, 707, 698, 10, 'CMTT10'])
    expect([r.erase, r.ph]).toEqual([[], []])
    expect(r.frames).toEqual([1, 0, 0, 4, -1, expect.any(Number)])
    // (a bundle unit of the KEPT flag that stands, which no language translates)
    const units = inkBundleUnitsOf(kept as never)
    expect(units).toEqual([['inkorphan', UNIT_FLAG_BITS.KEPT, null, null, null, [], null]])
    expect(unitStands(units[0], 2, new Uint8Array(3).fill(1, 0, 2), { ink: true })).toBe(true)
    const bundle = { units: [['heading', 0, null, null, null, [[0, 'Introduction']]], ['para', 0, null, null, null, [[0, 'Body words']]], ...units] }
    expect(toTranslate(bundle as never, 'zh')).toEqual([0, 1])
  })

  it('ends a block where a unit owns text between its lines, past KEPT_DY below it, or across in another column', () => {
    const lines = (...ys: number[]) => ys.map((y, j) => ({ glyphs: run(`foo${j} = bar`, 100, y, TT) }))
    const blocks = (...parts: Part[]) => keptOf([page({ point: 'bs1' }, ...parts, { point: 'be1' })]).kept.map(u => u.rows.lines.length / 8)
    expect(blocks(...lines(700, 688, 676))).toEqual([3])
    expect(blocks(...lines(700, 688), body(676), ...lines(664))).toEqual([2, 1])
    expect(blocks(...lines(700, 700 - KEPT_DY * 10 - 1))).toEqual([1, 1])
    // (the next column's top: up the page again, and across)
    expect(blocks(...lines(700, 688), { glyphs: run('baz = 1', 320, 700, TT) })).toEqual([2, 1])
  })

  it("makes none of a brace alone, a float's text, or a line beside a unit's text on its baseline: its label, its number", () => {
    const none = (...parts: Part[]) => keptOf([page({ point: 'bs1' }, body(), ...parts, { point: 'be1' })]).kept
    expect(none({ glyphs: run('}', 100, 700, TT) })).toEqual([])
    expect(none({ point: 'fs1' }, { glyphs: run('print hello world', 100, 700, TT) }, { glyphs: run('Axis label', 100, 690) }, { point: 'fe1' })).toEqual([])
    expect(none({ glyphs: run('[ref]', 100, 700, TT) }, { glyphs: run('A. Author. A title.', 130, 700), owner: 'u1' })).toEqual([])
    // (the same line on a baseline of its own: kept)
    expect(none({ glyphs: run('[ref]', 100, 700, TT) }, { glyphs: run('A. Author. A title.', 130, 680), owner: 'u1' })).toHaveLength(1)
  })

  it('makes a page number at the foot and a note of an address alone each a kept block of its own, beside the ink units', () => {
    const pg = page({ point: 'bs1' }, body(), { point: 'be1' }, { glyphs: run('1https://github.com/tensorflow/tensor2tensor', 100, 120, { size: 8 }) }, { glyphs: run('2Code at https://example.org/x and data', 100, 110, { size: 8 }) }, { glyphs: run('7', 300, 40) })
    const { ink, kept } = keptOf([pg])
    // (the note of a sentence an ink unit, translated; the address alone and the folio kept, numbered after it)
    expect(ink.map(u => [u.id, u.kind])).toEqual([[2, 'inknotes']])
    expect(kept.map(u => [u.id, u.kind, u.cls, u.rows.lines.length / 8])).toEqual([[3, 'inknotes', 'notes', 1], [4, 'inkheads', 'symbols', 1]])
  })
})
