import { describe, expect, it, vi } from 'vitest'
import { drawUnit, type UnitDraw } from '@/pdf-reader/engine/layer/draw.mjs'
import { type LayerInput, type Laid, type LaidUnit, layUnit, type Tr } from '@/pdf-reader/engine/layer/fit.mjs'
import { checkPieces, netOf, PIECES_MAX } from '@/pdf-reader/engine/layer/net.mjs'
import { COLOUR_SHIFT, LAYER_COLOURS, STYLE, type TrPiece } from '@/pdf-reader/engine/layer/pieces.mjs'
import { PAGE_TEXT_MAX, PAGE_TEXT_MIN } from '@/pdf-reader/engine/layer/tokens.mjs'
import { PH_FLAG } from '@/pdf-reader/engine/layout/file.mjs'
import { column, type EraseSpec, han, inputOf, layoutOf, type PhSpec, type UnitDef, withText } from './helpers/layer-layout'

// The completeness net (the instant layer's spec §4.5): a translation's pieces refused within bounds before anything is
// laid, and a laid unit refused, before it is drawn, where it would show a page with a placeholder missing or doubled, a
// character carried twice, a kept rendering erased, a glyph no face has or a bracket doubled. A refused unit stays the
// original's: not erased, not drawn. Layouts are written in the tests and read through the real parser; the measure is the
// brief's fake one (a CJK character 1 em, a Latin one 0.5, a space 0.25) at size 10

// the line breaker's double: as the real one, but where `twice` is set its placeLines also sets the first placeholder of
// the lines on the line after its own, a fault past the fit's own checks (a placeholder in two items is never a fit there),
// which the net must still catch
const double = vi.hoisted(() => ({ twice: false }))
vi.mock('@/pdf-reader/engine/layer/breaks.mjs', async importOriginal => {
  const real = await importOriginal<typeof import('@/pdf-reader/engine/layer/breaks.mjs')>()
  return {
    ...real,
    placeLines: (...args: Parameters<typeof real.placeLines>) => {
      real.placeLines(...args)
      const b = args[0]
      if (!double.twice) return
      const at = b.lines.findIndex(l => l.items.some(it => it.t.kind === 'ph'))
      if (at >= 0 && at + 1 < b.lines.length) b.lines[at + 1]!.items.push({ ...b.lines[at]!.items.find(it => it.t.kind === 'ph')! })
    },
  }
})

const tr = (pieces: TrPiece[], sentences: number[] | null = null): Tr => ({ pieces, sentences })
const laid = (r: Laid): LaidUnit => {
  if (!r.fit) throw new Error(`unfit: ${r.why}`)
  return r
}

// ---------------------------------------------------------------- a paragraph with every kind of placeholder

// six lines 400 wide at a pitch of 12 from 700; line 3 (664) is a display's, its body over most of it
const B = [700, 688, 676, 664, 652, 640]
const MATH: PhSpec = { k: 2, kind: 'math', segs: [[1, 100, 700, 130, 707, 697.5]] }
const CITE: PhSpec = { k: 4, kind: 'cite', segs: [[1, 200, 700, 215, 707, 697.5]] }
// a footnote call: raised, on line 1's baseline, its ink above it
const CALL: PhSpec = { k: 8, kind: 'footnote', flags: PH_FLAG.RAISED, segs: [[1, 300, 688, 304, 698, 692]] }
const DISPLAY: PhSpec = { k: 6, kind: 'display', segs: [[1, 150, 664, 380, 673, 659]] }
// each text line's own glyphs; the display's line has none of the unit's
const ERASE: EraseSpec[] = [0, 1, 2, 4, 5].map(i => [i, 72, B[i]! - 2.5, 472, B[i]! + 7])
const para = (o: Partial<UnitDef> = {}): UnitDef => ({ id: 1, lines: column(6), ph: [MATH, CITE, CALL, DISPLAY], erase: ERASE, ...o })
// a heading below the paragraph, on the same page, with its number as a kept label
const HEADING: UnitDef = { id: 2, kind: 'heading', lines: [{ x0: 100, x1: 300, baseline: 600 }], labels: [{ x0: 72, baseline: 600, x1: 90 }], erase: [[0, 100, 597.5, 300, 607]] }

/** the page's own text in a rectangle: the citation's '[7]', an equation reference's '(3)', nothing elsewhere */
const textIn = (_page: number, x0: number) => (x0 === 200 ? '[7]' : null)
const input = (units: UnitDef[], text: LayerInput['textIn'] = textIn, target = 'zh'): LayerInput => ({ ...inputOf(layoutOf(units), target), textIn: text })

// the translation, every placeholder of the unit in it once
const WHOLE: TrPiece[] = [[0, han(20)], [1, 2], [0, han(10)], [1, 4], [0, han(5)], [1, 8], [0, han(10)], [1, 6], [0, han(30)]]
const without = (k: number) => WHOLE.filter(p => !(p[0] === 1 && p[1] === k))

/** the items of a laid unit that are placeholders, as [k, kind, text] */
const drawnPh = (u: LaidUnit) => u.lines.flatMap(l => l.items).filter(it => it.ph !== undefined).map(it => [it.ph, it.kind, it.text])

/** the reader's loop over a page: every unit laid, and only those laid whole drawn */
function page(inp: LayerInput, trs: Map<number, Tr>, p = 1) {
  const laidOf = new Map<number, Laid>(), draws: UnitDraw[] = []
  for (const id of inp.file.onPage(p)) {
    const r = layUnit(inp, id, trs.get(id)!)
    laidOf.set(id, r)
    if (r.fit) draws.push(drawUnit(inp, r, p))
  }
  return { laidOf, draws }
}

describe('checkPieces', () => {
  const unit = layoutOf([{ id: 1, lines: column(3), pieces: 9 }]).unit(1)!
  const many = (n: number, piece: (i: number) => TrPiece) => Array.from({ length: n }, (_, i) => piece(i))

  it('refuses every malformed answer', () => {
    const big = layoutOf([{ id: 1, lines: column(3), pieces: 9999 }]).unit(1)!
    const rows: [string, unknown, typeof unit][] = [
      ['not an array', { 0: [0, 'a'], length: 1 }, unit],
      ['not an array: a string', '[[0, "a"]]', unit],
      ['not an array: null', null, unit],
      ['a piece [4, 1]', [[4, 1]], unit],
      ['a piece that is no array', [[0, 'a'], 'b'], unit],
      ['a text of the wrong arity', [[0, 'a', 'b']], unit],
      ['an open of the wrong arity', [[2, 1], [3, 2]], unit],
      ['a placeholder of the wrong arity', [[1, 1, 0]], unit],
      ['[1, 1.5]', [[1, 1.5]], unit],
      ['[1, -1]', [[1, -1]], unit],
      ['[1, k] with k the unit\'s pieces', [[1, 9]], unit],
      ['a k twice', [[1, 2], [0, 'a'], [1, 2]], unit],
      ['a k twice: an open and a close', [[2, 2, STYLE.BOLD], [0, 'a'], [3, 2]], unit],
      ['[3, k] with no open', [[0, 'a'], [3, 4]], unit],
      // an open left open is the source's (closed at the unit's end), but not where it crosses the source's groups: of the
      // source's opens 1 and 3 and its close 4 (3's), the translation closes 1 with 4
      ['an open left open that crosses the source\'s groups', [[2, 3, STYLE.BOLD], [2, 1, STYLE.ITALIC], [0, 'a'], [3, 4]], unit],
      // the source's groups are 1–4 and 2–3: the translation closes the outer one first
      ['groups crossed', [[2, 1, STYLE.BOLD], [2, 2, STYLE.ITALIC], [0, 'a'], [3, 4], [0, 'b'], [3, 3]], unit],
      ['a style that is no integer', [[2, 1, 1.5], [3, 2]], unit],
      ['a style past the colours', [[2, 1, 1 << 20], [3, 2]], unit],
      ['a text of 16,001 code units', [[0, 'a'.repeat(16_001)]], unit],
      ['a text holding \\u0000', [[0, 'a\u0000b']], unit],
      ['a text holding \\u202e', [[0, 'a\u202eb']], unit],
      ['a text holding DEL', [[0, 'a\u007fb']], unit],
      ['a text holding U+0085 (C1)', [[0, 'a\u0085b']], unit],
      ['a text holding U+0001', [[0, 'a\u0001b']], unit],
      ['a style at the colours\' end', [[2, 1, (LAYER_COLOURS.length + 1) << COLOUR_SHIFT], [3, 2]], unit],
      ['a text that is no string', [[0, 5]], unit],
      ['20,001 pieces', many(PIECES_MAX + 1, () => [0, 'a']), unit],
      ['10,000 placeholders in a unit of 9,999 pieces', many(10_000, i => [1, i]), big],
      ['a unit with no piece count', [[0, 'a']], { ...unit, pieces: Number.NaN }],
    ]
    for (const [name, pieces, u] of rows) {
      let got: unknown = 'threw'
      expect(() => { got = checkPieces(pieces, u) }, name).not.toThrow()
      expect(got, name).toBeNull()
    }
    expect(PIECES_MAX).toBe(20_000)
  })

  it('accepts a SWITCH without a close and a text with \\n and \\u00a0', () => {
    const pieces: TrPiece[] = [[0, 'a\nb\u00a0c'], [2, 1, STYLE.BOLD | STYLE.SWITCH], [0, 'd'], [2, 3, STYLE.ITALIC], [1, 4], [3, 5], [1, 8]]
    expect(checkPieces(pieces, unit)).toEqual(pieces)
    // the largest answers within bounds: 16,000 code units, 20,000 pieces, every k below the unit's pieces once, the source's
    // groups reordered as siblings
    expect(checkPieces([[0, 'a'.repeat(16_000)]], unit)).not.toBeNull()
    expect(checkPieces(many(PIECES_MAX, () => [0, 'a']), unit)).not.toBeNull()
    expect(checkPieces(many(9, i => [1, i]), unit)).not.toBeNull()
    expect(checkPieces([[2, 3, STYLE.BOLD], [3, 4], [2, 1, STYLE.ITALIC], [3, 2]], unit)).not.toBeNull()
    // of the source's groups 1–6 and 3–4: a translation that dropped the inner one; of its siblings 1–2 and 3–4, one that put
    // the second inside the first. Neither crosses the source's groups
    expect(checkPieces([[2, 1, STYLE.BOLD], [0, 'a'], [3, 6]], unit)).not.toBeNull()
    expect(checkPieces([[2, 1, STYLE.BOLD], [2, 3, STYLE.ITALIC], [3, 4], [3, 2]], unit)).not.toBeNull()
    // the last colour's style, with every flag but SWITCH
    expect(checkPieces([[2, 1, (LAYER_COLOURS.length << COLOUR_SHIFT) | (STYLE.SWITCH - 1)], [3, 2]], unit)).not.toBeNull()
  })

  it('a tab and the other white space are text, and an open the source leaves open is closed at the end (fix round 1, I1)', () => {
    // the pipeline's own pieces carry the source's white space: '\n\t', ' \n\t\t'
    for (const s of ['\n\t', ' \n\t\t\t', 'a\tb', 'a\rb', 'a\u000bb', 'a\u000cb']) expect(checkPieces([[0, s]], unit), JSON.stringify(s)).toEqual([[0, s]])
    // \multirow{2}{*}{\shortstack{\textbf{Avg.}: the source unit holds three opens and one close, and so does its translation
    const avg: TrPiece[] = [[2, 1, STYLE.BOLD], [2, 2, STYLE.SANS], [2, 3, STYLE.BOLD], [0, 'Avg.'], [3, 4]]
    expect(checkPieces(avg, unit)).toEqual(avg)
    expect(checkPieces([[2, 1, STYLE.BOLD], [0, 'a']], unit)).toEqual([[2, 1, STYLE.BOLD], [0, 'a']])
  })
})

describe('the net', () => {
  it("the net refuses, and the unit stays the original's", () => {
    const LOST: PhSpec = { k: 2, kind: 'math', flags: PH_FLAG.LOST }
    const EQREF: PhSpec = { k: 3, kind: 'eqref', segs: [[1, 200, 700, 215, 707, 697.5]] }
    const eqText = (_page: number, x0: number) => (x0 === 200 ? '(3)' : null)
    const rows: { why: string; units: UnitDef[]; pieces: TrPiece[]; text?: LayerInput['textIn']; twice?: boolean }[] = [
      { why: 'missing', units: [para()], pieces: without(2) },
      { why: 'missing', units: [para()], pieces: without(6) },
      { why: 'twice', units: [para()], pieces: WHOLE, twice: true },
      { why: 'lost', units: [para({ ph: [LOST, CITE, CALL, DISPLAY] })], pieces: WHOLE },
      // the layout lost it and the translation dropped it: its ink would be erased and drawn nowhere
      { why: 'lost', units: [para({ ph: [LOST, CITE, CALL, DISPLAY] })], pieces: without(2) },
      // two placeholders' segments over one glyph: the formula's ink carried by the citation's crop too
      { why: 'overlap', units: [para({ ph: [MATH, { k: 4, kind: 'math', segs: [[1, 110, 700, 130, 707, 697.5]] }, CALL, DISPLAY] })], pieces: WHOLE },
      // an erase rectangle over the display's body, and one over another unit's label
      { why: 'erase', units: [para({ erase: [...ERASE, [3, 140, 660, 400, 672]] })], pieces: WHOLE },
      { why: 'erase', units: [para({ erase: [...ERASE, [5, 60, 595, 120, 610]] }), HEADING], pieces: WHOLE },
      { why: 'glyph', units: [para()], pieces: [[0, `${han(5)}\ue000`], ...WHOLE] },
      // '\uff08' right before the page's own '(3)': SOURCE_BRACKETS unset, and no closing bracket after it, so the drop rule
      // does not take the page text's own; then the same with both brackets and SOURCE_BRACKETS set, which keeps them
      { why: 'brackets', units: [para({ ph: [MATH, EQREF, CALL, DISPLAY] })], pieces: [[0, han(20)], [1, 2], [0, `${han(10)}\uff08`], [1, 3], [0, han(5)], [1, 8], [0, han(10)], [1, 6], [0, han(30)]], text: eqText },
      { why: 'brackets', units: [para({ ph: [MATH, { ...EQREF, flags: PH_FLAG.SOURCE_BRACKETS }, CALL, DISPLAY] })], pieces: [[0, han(20)], [1, 2], [0, `${han(10)}\uff08`], [1, 3], [0, `\uff09${han(5)}`], [1, 8], [0, han(10)], [1, 6], [0, han(30)]], text: eqText },
      // the closing side: '(3)' right before '\uff09', the opening bracket a space away, so no drop either
      { why: 'brackets', units: [para({ ph: [MATH, EQREF, CALL, DISPLAY] })], pieces: [[0, han(20)], [1, 2], [0, `${han(10)}\uff08 `], [1, 3], [0, `\uff09${han(5)}`], [1, 8], [0, han(10)], [1, 6], [0, han(30)]], text: eqText },
      // a raised citation is its own ink, never page text: its rendering read from the page inside its segment, '(7)', after
      // an opening bracket of its kind the translation never closes
      { why: 'brackets', units: [para({ ph: [MATH, { ...CITE, flags: PH_FLAG.RAISED }, CALL, DISPLAY] })], pieces: [[0, han(20)], [1, 2], [0, `${han(10)}\uff08`], [1, 4], [0, han(5)], [1, 8], [0, han(10)], [1, 6], [0, han(30)]], text: (_p, x0) => (x0 === 200 ? '(7)' : null) },
      { why: 'pieces', units: [para()], pieces: [...WHOLE, [1, 2]] },
    ]
    try {
      for (const row of rows) {
        double.twice = row.twice ?? false
        const units = row.units.some(u => u.id === 2) ? row.units : [...row.units, HEADING]
        const inp = input(units, row.text ?? textIn)
        const { laidOf, draws } = page(inp, new Map([[1, tr(row.pieces)], [2, tr([[0, han(4)]])]]))
        expect(laidOf.get(1), row.why).toEqual({ id: 1, fit: false, why: row.why })
        // not drawn and not erased: the page draws the heading alone
        expect(draws.map(d => d.id), row.why).toEqual([2])
      }
    } finally {
      double.twice = false
    }
  })

  it('a whole unit passes', () => {
    const inp = input([para(), HEADING])
    const u = laid(layUnit(inp, 1, tr(WHOLE)))
    expect(netOf(inp, u, tr(WHOLE))).toBeNull()
    // a formula and a footnote call as the original's ink, the citation as the page's own text, the display kept: each once
    const items = u.lines.flatMap(l => l.items).filter(it => it.ph !== undefined)
    expect(items.map(it => [it.ph, it.kind])).toEqual([[2, 'crop'], [4, 'page-text'], [8, 'crop']])
    expect(items.find(it => it.ph === 4)!.text).toBe('[7]')
    expect([...u.drawn].sort((a, b) => a[0] - b[0])).toEqual([[2, 'crop'], [4, 'page-text'], [6, 'kept'], [8, 'crop']])
    const d = drawUnit(inp, u, 1)
    const cropKs = []
    for (let i = 0; i < d.crops.length; i += 9) cropKs.push(d.crops[i])
    expect(cropKs).toEqual([2, 8])
    expect(d.lines.flatMap(l => l.runs).filter(r => r.text.startsWith('[7]'))).toHaveLength(1)
    // without the page's text, the citation is drawn as its ink instead; still once
    const ink = input([para(), HEADING], () => null)
    const v = laid(layUnit(ink, 1, tr(WHOLE)))
    expect(v.lines.flatMap(l => l.items).filter(it => it.ph !== undefined).map(it => [it.ph, it.kind])).toEqual([[2, 'crop'], [4, 'crop'], [8, 'crop']])
    // an equation reference bracketed by the translation, its own brackets dropped by the tokens: no bracket doubled
    const eq = input([para({ ph: [MATH, { k: 3, kind: 'eqref', segs: [[1, 200, 700, 215, 707, 697.5]] }, CALL, DISPLAY] }), HEADING], (_p, x0) => (x0 === 200 ? '(3)' : null))
    const pieces: TrPiece[] = [[0, han(20)], [1, 2], [0, `${han(10)}\uff08`], [1, 3], [0, `\uff09${han(5)}`], [1, 8], [0, han(10)], [1, 6], [0, han(30)]]
    const w = laid(layUnit(eq, 1, tr(pieces)))
    expect(w.lines.flatMap(l => l.items).find(it => it.ph === 3)!.text).toBe('3')
    // a display whose own segments overlap (a tall body over its number): one placeholder, kept once, carries nothing twice
    const tall = input([para({ ph: [MATH, CITE, CALL, { k: 6, kind: 'display', flags: PH_FLAG.NUMBERED, segs: [[1, 150, 664, 380, 673, 659], [1, 360, 664, 390, 670, 660]] }] }), HEADING])
    expect(layUnit(tall, 1, tr(WHOLE)).fit).toBe(true)
  })

  it('refuses a laid unit whatever made it: a placeholder twice, dropped, on a page its ink is not, a glyph no face has', () => {
    const inp = input([para(), HEADING])
    const u = laid(layUnit(inp, 1, tr(WHOLE)))
    const edit = (f: (lines: LaidUnit['lines']) => void): LaidUnit => {
      const lines = structuredClone(u.lines)
      f(lines)
      return { ...u, lines }
    }
    const at = (lines: LaidUnit['lines'], k: number) => {
      const l = lines.find(line => line.items.some(it => it.ph === k))!
      return { l, q: l.items.findIndex(it => it.ph === k) }
    }
    // two items of one placeholder (a placeholder cut across lines), whatever their kind
    expect(netOf(inp, edit(lines => { const { l, q } = at(lines, 2); lines.at(-1)!.items.push({ ...l.items[q]! }) }), tr(WHOLE))).toBe('twice')
    expect(netOf(inp, edit(lines => { const { l, q } = at(lines, 4); l.items.splice(q + 1, 0, { ...l.items[q]!, from: l.items[q]!.to }) }), tr(WHOLE))).toBe('twice')
    expect(netOf(inp, edit(lines => { const { l, q } = at(lines, 8); l.items.splice(q, 1) }), tr(WHOLE))).toBe('missing')
    // a crop is drawn from its own page's pixels: one set on page 2 has nothing to be drawn from
    expect(netOf(inp, edit(lines => { at(lines, 2).l.page = 2 }), tr(WHOLE))).toBe('missing')
    // a kept display that is not
    expect(netOf(inp, { ...u, drawn: new Map([...u.drawn].filter(([k]) => k !== 6)) }, tr(WHOLE))).toBe('missing')
    expect(netOf(inp, edit(lines => { const it = lines[0]!.items.find(i => i.kind === 'text')!; it.text = '\ue000' }), tr(WHOLE))).toBe('glyph')
    expect(netOf(inp, edit(lines => { const it = lines[0]!.items.find(i => i.kind === 'text')!; it.face = 'no-such-face' }), tr(WHOLE))).toBe('glyph')
    expect(netOf(inp, u, tr(WHOLE))).toBeNull()
  })

  it('a placeholder with no row, or an empty one, draws nothing and is not missing', () => {
    // k 5 has no row (an invisible piece: a label, a kern the maker found no ink for), k 7 is EMPTY
    const inp = input([para({ ph: [MATH, CITE, CALL, DISPLAY, { k: 7, kind: 'macro', flags: PH_FLAG.EMPTY }] }), HEADING])
    const pieces: TrPiece[] = [...WHOLE.slice(0, 3), [1, 5], [1, 7], ...WHOLE.slice(3)]
    const u = laid(layUnit(inp, 1, tr(pieces)))
    expect(u.lines.flatMap(l => l.items).some(it => it.ph === 5 || it.ph === 7)).toBe(false)
    expect(netOf(inp, u, tr(pieces))).toBeNull()
  })

  it('a unit refused before it is laid: its pieces, its unit, its rows', () => {
    const inp = input([para(), HEADING])
    expect(layUnit(inp, 1, { pieces: null as unknown as TrPiece[], sentences: null })).toEqual({ id: 1, fit: false, why: 'pieces' })
    expect(layUnit(inp, 1, null as unknown as Tr)).toEqual({ id: 1, fit: false, why: 'pieces' })
    expect(layUnit(inp, 1, tr([[1, 64]]))).toEqual({ id: 1, fit: false, why: 'pieces' })
    expect(layUnit(inp, 9, tr(WHOLE))).toEqual({ id: 9, fit: false, why: 'located' })
    // a character held by no face of the role set, though every other is: the glyph, not the tokens
    expect(layUnit(inp, 1, tr([[0, `${han(3)}\ue000`]]))).toEqual({ id: 1, fit: false, why: 'glyph' })
  })

})

describe('the net, fix round 1 (the review)', () => {
  // a citation 105 wide on line 0: '(Al-Rfou et al., 2018)' in the fake measure (20 letters at 5, two spaces at 2.5)
  const AUTHOR = '(Al-Rfou et al., 2018)'
  const NATBIB: PhSpec = { k: 4, kind: 'cite', segs: [[1, 200, 700, 305, 707, 697.5]] }
  const natbib = (o: Partial<UnitDef> = {}) => para({ ph: [MATH, NATBIB, CALL, DISPLAY], ...o })
  const own = (text: string | null) => (_p: number, x0: number) => (x0 === 200 ? text : null)

  it("a citation's page text is its own, or the citation is drawn as its ink (C1)", () => {
    // the reader's textIn gives whole text items: here the line the citation stands in. Its width is 2.4 times the
    // segment's: not the citation's own, which is then drawn as the original's ink
    const line = 'Shortcut connections (Al-Rfou et al., 2018) are those skipping one or'
    const u = laid(layUnit(input([natbib(), HEADING], own(line)), 1, tr(WHOLE)))
    expect(drawnPh(u)).toEqual([[2, 'crop', undefined], [4, 'crop', undefined], [8, 'crop', undefined]])
    // the citation's own text and the sentence's period, in one text item: 1.02 of the segment, which no width can tell
    // from the citation's own (its own is 0.94-1.07 on the lab's fixtures). A reading that ends with a mark the band cannot
    // place, one character of 22, is not trusted: a period, or a bracket, which a formula's item may have run on to
    const period = laid(layUnit(input([natbib(), HEADING], own(`${AUTHOR}.`)), 1, tr(WHOLE)))
    expect(drawnPh(period)[1]).toEqual([4, 'crop', undefined])
    const exact = laid(layUnit(input([natbib(), HEADING], own(AUTHOR)), 1, tr(WHOLE)))
    expect(drawnPh(exact)[1]).toEqual([4, 'crop', undefined])
    // a short one, whose brackets the band places: drawn as its page text
    const SHORT: PhSpec = { k: 4, kind: 'cite', segs: [[1, 200, 700, 227.5, 707, 697.5]] }
    const short = laid(layUnit(input([para({ ph: [MATH, SHORT, CALL, DISPLAY] }), HEADING], own('[3, 4]')), 1, tr(WHOLE)))
    expect(drawnPh(short)[1]).toEqual([4, 'page-text', '[3, 4]'])
  })

  it("the layout's own text of a placeholder is taken before the page's (C1, a)", () => {
    const asked: number[] = []
    const fragment = (_p: number, x0: number) => { asked.push(x0); return x0 === 200 ? `see ${AUTHOR} and more` : null }
    const inp = input([natbib(), HEADING], fragment)
    const u = laid(layUnit({ ...inp, file: withText(inp.file, 1, 4, AUTHOR) }, 1, tr(WHOLE)))
    expect(drawnPh(u)[1]).toEqual([4, 'page-text', AUTHOR])
    expect(asked).not.toContain(200)
    // the layout's own text is measured too: one not as wide as its segments is drawn as the ink
    const wide = laid(layUnit({ ...inp, file: withText(inp.file, 1, 4, `${AUTHOR} ${AUTHOR}`) }, 1, tr(WHOLE)))
    expect(drawnPh(wide)[1]).toEqual([4, 'crop', undefined])
  })

  it('the page-text band is 0.85-1.15 of the segments\' width', () => {
    expect([PAGE_TEXT_MIN, PAGE_TEXT_MAX]).toEqual([0.85, 1.15])
    // '[7]' is 15 wide: a segment of 15 / 0.86 holds it, one of 15 / 0.84 does not; and 15 / 1.14, 15 / 1.16
    const at = (w: number) => {
      const seg: PhSpec = { k: 4, kind: 'cite', segs: [[1, 200, 700, 200 + w, 707, 697.5]] }
      return drawnPh(laid(layUnit(input([para({ ph: [MATH, seg, CALL, DISPLAY] }), HEADING], own('[7]')), 1, tr(WHOLE))))[1]![1]
    }
    expect([at(15 / 0.86), at(15 / 0.84), at(15 / 1.14), at(15 / 1.16)]).toEqual(['page-text', 'crop', 'page-text', 'crop'])
  })

  it('the net refuses page text that is not the placeholder\'s own, whatever drew it (C1, b)', () => {
    const plain = input([natbib(), HEADING], own(null))
    const inp = { ...plain, file: withText(plain.file, 1, 4, AUTHOR) }
    const u = laid(layUnit(inp, 1, tr(WHOLE)))
    expect(drawnPh(u)[1]).toEqual([4, 'page-text', AUTHOR])
    const edit = (text: string): LaidUnit => {
      const lines = structuredClone(u.lines)
      for (const l of lines) for (const it of l.items) if (it.ph === 4) it.text = text
      return { ...u, lines }
    }
    expect(netOf(inp, u, tr(WHOLE))).toBeNull()
    expect(netOf(inp, edit(`connections ${AUTHOR} are those`), tr(WHOLE))).toBe('missing')
    expect(netOf(inp, edit('(Al-Rfou et al., 2019)'), tr(WHOLE))).toBe('missing')
    // the placeholder's own text the net reads is a line: what was drawn cannot be shown to be the citation's own
    expect(netOf({ ...plain, file: withText(plain.file, 1, 4, `see ${AUTHOR} and more`) }, u, tr(WHOLE))).toBe('missing')
    expect(netOf({ ...plain, textIn: own(`see ${AUTHOR} and more`) }, u, tr(WHOLE))).toBe('missing')
  })

  it('a doubled bracket is one of the same kind the translation does not balance; nesting passes (I2)', () => {
    const NAT = [[0, han(20)], [1, 2], [0, han(10)]] as TrPiece[]
    const tail = [[1, 8], [0, han(10)], [1, 6], [0, han(30)]] as TrPiece[]
    const lay = (pieces: TrPiece[], o: { text?: string | null; layoutText?: string; ph?: PhSpec } = {}) => {
      const inp = input([natbib(o.ph ? { ph: [MATH, o.ph, CALL, DISPLAY] } : {}), HEADING], own(o.text ?? null))
      return layUnit(o.layoutText ? { ...inp, file: withText(inp.file, 1, 4, o.layoutText) } : inp, 1, tr(pieces))
    }
    const why = (r: Laid) => (r.fit ? 'fit' : r.why)
    // 'objectives (Hill et al., 2016).' translated with a ')' of its own: the citation drawn as its ink (no page text
    // reads), its rendering unknown, and a closing bracket the translation never opened right after it
    expect(why(lay([...NAT, [1, 4], [0, `)${han(5)}`], ...tail]))).toBe('brackets')
    // the same with the layout's own text, which says it ends with its own ')'
    expect(why(lay([...NAT, [1, 4], [0, `)${han(5)}`], ...tail], { layoutText: AUTHOR }))).toBe('brackets')
    // '(or the scalar equation (3.1))': the closing bracket after the rendering closes the translation's own '\uff08'
    const EQ: PhSpec = { k: 4, kind: 'eqref', segs: [[1, 200, 700, 225, 707, 697.5]] }
    expect(why(lay([...NAT, [0, `\uff08${han(4)}`], [1, 4], [0, `\uff09${han(5)}`], ...tail], { text: '(3.1)', ph: EQ }))).toBe('fit')
    // '([10, 25])' in '\uff08[10, 25] \u7b49\uff09': brackets of another kind beside it
    const SQ: PhSpec = { k: 4, kind: 'cite', segs: [[1, 200, 700, 240, 707, 697.5]] }
    expect(why(lay([...NAT, [0, '\uff08'], [1, 4], [0, ` \u7b49\uff09${han(5)}`], ...tail], { text: '[10, 25]', ph: SQ }))).toBe('fit')
    // a bracket of another kind beside it that the translation leaves unmatched: a stray, not a double
    expect(why(lay([...NAT, [0, '\uff08'], [1, 4], [0, ` \u7b49${han(5)}`], ...tail], { text: '[10, 25]', ph: SQ }))).toBe('fit')
    expect(why(lay([...NAT, [1, 4], [0, `\uff09${han(5)}`], ...tail], { text: '[10, 25]', ph: SQ }))).toBe('fit')
    // an equation reference brings its own '(' and ')' (amsmath's \eqref) even where no text of it reads: right inside a
    // pair of the translation's own, doubled
    expect(why(lay([...NAT, [0, '\uff08'], [1, 4], [0, `\uff09${han(5)}`], ...tail], { ph: EQ }))).toBe('brackets')
    // a macro drawn as its ink over two lines, its text read from both: its last segment's ')' beside the translation's
    const TWO: PhSpec = { k: 4, kind: 'macro', segs: [[1, 200, 700, 215, 707, 697.5], [1, 72, 688, 84.5, 695, 685.5]] }
    const parts = (_p: number, x0: number) => (x0 === 200 ? 'a(b' : x0 === 72 ? 'c)' : null)
    const inp = input([natbib({ ph: [MATH, TWO, CALL, DISPLAY] }), HEADING], parts)
    expect(why(layUnit(inp, 1, tr([...NAT, [1, 4], [0, `)${han(5)}`], ...tail])))).toBe('brackets')
    // one that begins with its own '(' and ends otherwise, inside a pair of the translation's own: the opening side alone
    const opens = (_p: number, x0: number) => (x0 === 200 ? '(ab' : x0 === 72 ? 'cd' : null)
    const inp2 = input([natbib({ ph: [MATH, TWO, CALL, DISPLAY] }), HEADING], opens)
    expect(why(layUnit(inp2, 1, tr([...NAT, [0, '\uff08'], [1, 4], [0, `\uff09${han(5)}`], ...tail])))).toBe('brackets')
  })

  it("a crop stays in its own page's part of a split unit (I4)", () => {
    const lines = [...column(3, { page: 1 }), ...column(3, { page: 2 })]
    const frames = [{ page: 1, lines: 3 }, { page: 2, lines: 3, share: 500 }]
    const math = (k: number, page: number): PhSpec => ({ k, kind: 'math', segs: [[page, 100, 688, 130, 695, 685.5]] })
    // a formula of page 2 early in the translation: cut by the share it would be in page 1's part, and drawn there from
    // pixels that are not its own
    const file = layoutOf([{ id: 1, lines, frames, ph: [math(2, 2)] }])
    const u = laid(layUnit(inputOf(file, 'zh'), 1, tr([[0, han(20)], [1, 2], [0, han(60)]])))
    expect(u.lines.find(l => l.items.some(it => it.ph === 2))!.page).toBe(2)
    expect(u.cuts[0]).toBeLessThanOrEqual(20)
    // a formula of page 2 before one of page 1: no cut keeps both on their pages, and the unit stays the original's
    const both = layoutOf([{ id: 1, lines, frames, ph: [math(2, 2), math(4, 1)] }])
    expect(layUnit(inputOf(both, 'zh'), 1, tr([[0, han(10)], [1, 2], [0, han(10)], [1, 4], [0, han(50)]]))).toEqual({ id: 1, fit: false, why: 'missing' })
    // one formula over the page break (a segment on each page): drawn from neither page whole
    const over = layoutOf([{ id: 1, lines, frames, ph: [{ k: 2, kind: 'math', segs: [[1, 400, 676, 470, 683, 673.5], [2, 72, 700, 90, 707, 697.5]] }] }])
    expect(layUnit(inputOf(over, 'zh'), 1, tr([[0, han(10)], [1, 2], [0, han(60)]]))).toEqual({ id: 1, fit: false, why: 'missing' })
  })

  it("the brief's exact values and the net's paths: 0.5 pt, half the smaller, each line's own page (I3)", () => {
    const why = (units: UnitDef[], pieces: TrPiece[] = WHOLE) => { const r = layUnit(input(units), 1, tr(pieces)); return r.fit ? 'fit' : r.why }
    // an erase rectangle over the display by 0.6 pt and by 0.4 pt, up and across
    expect(why([para({ erase: [...ERASE, [3, 140, 672.4, 400, 680]] }), HEADING])).toBe('erase')
    expect(why([para({ erase: [...ERASE, [3, 140, 672.6, 400, 680]] }), HEADING])).toBe('fit')
    expect(why([para({ erase: [...ERASE, [3, 379.4, 660, 400, 672]] }), HEADING])).toBe('erase')
    expect(why([para({ erase: [...ERASE, [3, 379.6, 660, 400, 672]] }), HEADING])).toBe('fit')
    // a second formula over the first by 0.55 and by 0.45 of the smaller
    const second = (x0: number): PhSpec => ({ k: 4, kind: 'math', segs: [[1, x0, 700, x0 + 20, 707, 697.5]] })
    expect(why([para({ ph: [MATH, second(119), CALL, DISPLAY] }), HEADING])).toBe('overlap')
    expect(why([para({ ph: [MATH, second(121), CALL, DISPLAY] }), HEADING])).toBe('fit')
    // a unit over two pages: its page-2 erase over a page-2 display, which page 1 has none of
    const lines = [...column(3, { page: 1 }), ...column(3, { page: 2 })]
    const frames = [{ page: 1, lines: 3 }, { page: 2, lines: 3, share: 500 }]
    const display: PhSpec = { k: 6, kind: 'display', segs: [[2, 150, 688, 380, 697, 683]] }
    const two = (erase: EraseSpec[]) => { const r = layUnit(inputOf(layoutOf([{ id: 1, lines, frames, ph: [display], erase }]), 'zh'), 1, tr([[0, han(30)], [1, 6], [0, han(30)]])); return r.fit ? 'fit' : r.why }
    expect(two([[3, 72, 697.5, 472, 707], [4, 140, 690, 400, 694]])).toBe('erase')
    expect(two([[3, 72, 697.5, 472, 707]])).toBe('fit')
    // a formula over two lines, its second segment on the other page, set in page 1's part: no page holds its pixels whole
    const across: PhSpec = { k: 2, kind: 'math', segs: [[1, 400, 676, 470, 683, 673.5], [2, 72, 700, 90, 707, 697.5]] }
    const l2 = laid(layUnit(inputOf(layoutOf([{ id: 1, lines, frames }]), 'zh'), 1, tr([[0, han(10)], [0, han(60)]])))
    const crop = { ...l2.lines[0]!.items[0]!, kind: 'crop' as const, ph: 2, text: undefined, face: undefined }
    const forged: LaidUnit = { ...l2, lines: [{ ...l2.lines[0]!, items: [crop, ...l2.lines[0]!.items.slice(1)] }, ...l2.lines.slice(1)], drawn: new Map([[2, 'crop']]) }
    const inp = inputOf(layoutOf([{ id: 1, lines, frames, ph: [across] }]), 'zh')
    expect(netOf(inp, forged, tr([[0, han(5)], [1, 2], [0, han(60)]]))).toBe('missing')
  })
})
