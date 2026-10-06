import { describe, expect, it, vi } from 'vitest'
import { drawUnit, type UnitDraw } from '@/pdf-reader/engine/layer/draw.mjs'
import { type LayerInput, type Laid, type LaidUnit, layUnit, type Tr } from '@/pdf-reader/engine/layer/fit.mjs'
import { checkPieces, netOf, PIECES_MAX } from '@/pdf-reader/engine/layer/net.mjs'
import { STYLE, type TrPiece } from '@/pdf-reader/engine/layer/pieces.mjs'
import { PH_FLAG } from '@/pdf-reader/engine/layout/file.mjs'
import { column, type EraseSpec, han, inputOf, layoutOf, type PhSpec, type UnitDef } from './helpers/layer-layout'

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
      ['an open never closed', [[2, 1, STYLE.BOLD], [0, 'a']], unit],
      // the source's groups are 1–4 and 2–3: the translation closes the outer one first
      ['groups crossed', [[2, 1, STYLE.BOLD], [2, 2, STYLE.ITALIC], [0, 'a'], [3, 4], [0, 'b'], [3, 3]], unit],
      ['a style that is no integer', [[2, 1, 1.5], [3, 2]], unit],
      ['a style past the colours', [[2, 1, 1 << 20], [3, 2]], unit],
      ['a text of 16,001 code units', [[0, 'a'.repeat(16_001)]], unit],
      ['a text holding \\u0000', [[0, 'a\u0000b']], unit],
      ['a text holding \\u202e', [[0, 'a\u202eb']], unit],
      ['a text holding a tab', [[0, 'a\tb']], unit],
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
      // a raised citation is its own ink, never page text: its rendering read from the page inside its segment, '[7]'
      { why: 'brackets', units: [para({ ph: [MATH, { ...CITE, flags: PH_FLAG.RAISED }, CALL, DISPLAY] })], pieces: [[0, han(20)], [1, 2], [0, `${han(10)}\uff08`], [1, 4], [0, han(5)], [1, 8], [0, han(10)], [1, 6], [0, han(30)]] },
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
