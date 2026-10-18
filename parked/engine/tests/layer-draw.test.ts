import { describe, expect, it } from 'vitest'
import { FACES } from '@/pdf-reader/engine/rules/font-roles.mjs'
import { type DrawRun, drawUnit, ERASE_PAD, spansOf, unitAt } from '../layer/draw.mjs'
import { type Laid, type LaidUnit, layUnit, type Tr } from '../layer/fit.mjs'
import { STYLE, type TrPiece, trText } from '@/pdf-reader/engine/layer/pieces.mjs'
import { PH_FLAG } from '@/pdf-reader/engine/layout/file.mjs'
import { column, type EraseSpec, han, inputOf, kanji, layoutOf, words } from './helpers/layer-layout'

// What the web draws for a laid unit, as data: the layout's own erase, the crops of the original's ink with their places,
// and the text as runs. Layouts are written in the tests and read through the real parser; the measure is the brief's fake
// one (a CJK character 1 em, a Latin one 0.5, a space 0.25) at size 10

const tr = (text: string | TrPiece[], sentences: number[] | null = null): Tr => ({ pieces: typeof text === 'string' ? [[0, text]] : text, sentences })
const laid = (r: Laid): LaidUnit => {
  if (!r.fit) throw new Error(`unfit: ${r.why}`)
  return r
}
const strides = (xs: number[], n: number) => Array.from({ length: xs.length / n }, (_, i) => xs.slice(n * i, n * i + n))
const nine = () => layoutOf([{ id: 1, lines: column(9), frames: [{ lines: 9 }] }])

/** a rectangle (x0, y0, x1, y1) of a 10 pt line at baseline b grown by the erase's pad on every side, up and down within
 *  the line's own band (3 below its baseline, 8.5 above) */
const padded = (r: number[], b: number) => [r[0]! - ERASE_PAD, Math.min(r[1]!, Math.max(r[1]! - ERASE_PAD, b - 3)), r[2]! + ERASE_PAD, Math.max(r[3]!, Math.min(r[3]! + ERASE_PAD, b + 8.5))]
const near = (xs: number[], ys: number[]) => {
  expect(xs).toHaveLength(ys.length)
  xs.forEach((x, i) => { expect(x, `value ${i}`).toBeCloseTo(ys[i]!, 9) })
}

describe('the drawing', () => {
  it("the erase is the layout's for the unit's lines on the page, each rectangle padded, and nothing else", () => {
    // a unit split over two pages, every line with two erase rectangles, and another unit far below it on page 1
    const lines = [...column(3, { page: 1 }), ...column(3, { page: 2 })]
    const erase: EraseSpec[] = lines.flatMap((l, i): EraseSpec[] => [[i, 72, l.baseline - 2.5, 200 + i, l.baseline + 7], [i, 210 + i, l.baseline - 2, 472, l.baseline + 6]])
    const file = layoutOf([
      { id: 1, lines, frames: [{ page: 1, lines: 3 }, { page: 2, lines: 3, share: 500, below: 100 }], erase },
      { id: 2, lines: column(2, { top: 500 }), erase: [[0, 72, 497.5, 472, 507], [1, 72, 485.5, 472, 495]] },
    ])
    const inp = inputOf(file, 'zh')
    const u = laid(layUnit(inp, 1, tr(han(150))))
    const own = (from: number, to: number) => erase.filter(e => e[0] >= from && e[0] < to).flatMap(e => padded(e.slice(1), lines[e[0]]!.baseline))
    const one = drawUnit(inp, u, 1), two = drawUnit(inp, u, 2)
    near(one.erase, own(0, 3))
    near(two.erase, own(3, 6))
    // whatever the fit set: the lines drawn on each page are its own, and a page it is not on draws nothing
    expect(one.lines.map(l => l.baseline)).toEqual(u.lines.filter(l => l.page === 1).map(l => l.baseline))
    expect(two.lines.map(l => l.baseline)).toEqual(u.lines.filter(l => l.page === 2).map(l => l.baseline))
    expect(drawUnit(inp, u, 3)).toEqual({ id: 1, page: 3, erase: [], swap: [], crops: [], cropsFrom: 'O', blend: 'darken', lines: [] })
    // the text-removed PDF: on a page it removed, the unit's removed boxes to swap and no erase, the crops from the
    // placeholders' page; on a page it refused, or for a unit it does not name, the erase as before
    const removed = drawUnit(inp, u, 1, { ok: true, units: { 1: [72, 697, 80, 707] } })
    expect([removed.erase, removed.swap, removed.cropsFrom]).toEqual([[], [72, 697, 80, 707], 'P'])
    expect(removed.lines).toEqual(one.lines)
    near(drawUnit(inp, u, 1, { ok: false }).erase, own(0, 3))
    near(drawUnit(inp, u, 1, { ok: true, units: { 2: [1, 2, 3, 4] } }).erase, own(0, 3))
    // a unit borrowing lines below its frame still erases only the layout's lines
    const tall = layoutOf([{ id: 1, lines: column(2), frames: [{ lines: 2, below: 200 }], erase: [[0, 72, 697.5, 472, 707], [1, 72, 685.5, 472, 695]] }])
    const t = laid(layUnit(inputOf(tall, 'zh'), 1, tr(han(160))))
    expect(t.lines.length).toBeGreaterThan(2)
    near(drawUnit(inputOf(tall, 'zh'), t, 1).erase, [...padded([72, 697.5, 472, 707], 700), ...padded([72, 685.5, 472, 695], 688)])
    // the pad's own band: 2.5 below the baseline grows to 3 at most, 7 above to 7.6
    expect(padded([72, 697.5, 472, 707], 700)).toEqual([72 - ERASE_PAD, 697, 472 + ERASE_PAD, 707 + ERASE_PAD])
  })

  it("the erase keeps off every other unit's lines: across another baseline, and beside on its own only the pad (fix 2)", () => {
    // unit 1's line at 700 with a glyph box down to 683 (a math face's declared descent, CMSY's 0.96 em); unit 2's line 12
    // below it, whose ink band is 685.5 to 696; unit 3 beside unit 1 on its baseline, 0.4 to the right of its rectangle
    const file = layoutOf([
      { id: 1, lines: [{ x1: 300, baseline: 700 }], erase: [[0, 72, 683, 300, 707]] },
      { id: 2, lines: [{ x1: 472, baseline: 688 }], erase: [[0, 72, 685.5, 472, 695]] },
      { id: 3, lines: [{ x0: 300.4, x1: 472, baseline: 700 }], erase: [[0, 300.4, 697.5, 472, 707]] },
    ])
    const inp = inputOf(file, 'zh')
    const one = drawUnit(inp, laid(layUnit(inp, 1, tr(han(20)))), 1)
    // up from unit 2's band and its gap; to the right no further than unit 3's line less its gap, never into its own box
    near(one.erase, [72 - ERASE_PAD, 696 + 0.15, 300.4 - 0.15, 707 + ERASE_PAD])
    // unit 2's padded rectangle stays below unit 1's band (697.5 up): nothing to give up
    const two = drawUnit(inp, laid(layUnit(inp, 2, tr(han(30)))), 1)
    near(two.erase, [72 - ERASE_PAD, 685, 472 + ERASE_PAD, 695 + ERASE_PAD])
    // no erase rectangle of any of them meets another unit's band
    for (const id of [1, 2, 3]) {
      const d = drawUnit(inp, laid(layUnit(inp, id, tr(han(10)))), 1)
      for (let i = 0; i + 3 < d.erase.length; i += 4) {
        for (const [other, b, x0, x1] of [[1, 700, 72, 300], [2, 688, 72, 472], [3, 700, 300.4, 472]] as const) {
          if (other === id) continue
          const across = Math.min(d.erase[i + 2]!, x1) - Math.max(d.erase[i]!, x0), up = Math.min(d.erase[i + 3]!, b + 8) - Math.max(d.erase[i + 1]!, b - 2.5)
          expect(across > 0 && up > 0, `unit ${id} into unit ${other}`).toBe(false)
        }
      }
    }
  })

  it('the pad never takes the erase onto a kept rendering, and an erase kept off to nothing is the layout\'s (fix 2)', () => {
    // a display of another unit 0.05 below unit 1's rectangle: padded, the erase would meet it by 0.55
    const file = layoutOf([
      { id: 1, lines: [{ x1: 472, baseline: 700 }], erase: [[0, 72, 698.5, 472, 707]] },
      { id: 2, lines: [{ x1: 472, baseline: 680 }], ph: [{ k: 1, kind: 'display', segs: [[1, 100, 690, 400, 698.45, 686]] }] },
    ])
    const inp = inputOf(file, 'zh')
    expect(drawUnit(inp, laid(layUnit(inp, 1, tr(han(20)))), 1).erase).toEqual([72, 698.5, 472, 707])
    // a rectangle wholly inside another unit's band: kept off, nothing is left, and the layout's is drawn as it was
    const inside = layoutOf([
      { id: 1, lines: [{ x1: 472, baseline: 700 }], erase: [[0, 100, 688, 140, 692]] },
      { id: 2, lines: [{ x1: 472, baseline: 688 }] },
    ])
    const i2 = inputOf(inside, 'zh')
    expect(drawUnit(i2, laid(layUnit(i2, 1, tr(han(20)))), 1).erase).toEqual([100, 688, 140, 692])
  })

  it("crops are darkened in, and their sources are the layout's segments as they are (fix 2)", () => {
    // a formula on line 0 (baseline 700) whose box reaches 690, into the band of line 1: the layout's segment is drawn whole
    // (cut there, a formula's own ink would go: its box is the maker's to make from the ink)
    const file = layoutOf([{ id: 1, lines: column(3), ph: [{ k: 2, kind: 'math', segs: [[1, 200, 700, 260, 709, 690]] }] }])
    const inp = inputOf(file, 'zh')
    const d = drawUnit(inp, laid(layUnit(inp, 1, tr([[0, han(10)], [1, 2], [0, han(30)]]))), 1)
    expect(d.blend).toBe('darken')
    expect(strides(d.crops, 9).map(c => c.slice(0, 5))).toEqual([[2, 200, 690, 260, 709]])
  })

  it('a crop keeps its ink\'s place against the baseline, scaled with the unit', () => {
    // a formula the original broke over lines 0 and 1, and a footnote call raised on line 2 (its ink 4 to 10 above it)
    const file = layoutOf([{
      id: 1, lines: column(4),
      ph: [{ k: 2, kind: 'math', segs: [[1, 400, 700, 470, 707, 697.5], [1, 72, 688, 100, 695, 685.5]] }, { k: 4, kind: 'footnote', flags: PH_FLAG.RAISED, segs: [[1, 300, 676, 304, 686, 680]] }],
    }])
    const inp = inputOf(file, 'zh')
    const u = laid(layUnit(inp, 1, tr([[0, han(10)], [1, 2], [0, han(10)], [1, 4], [0, han(10)]]), { maxScale: 0.9 }))
    expect(u.state.scale).toBe(0.9)
    const d = drawUnit(inp, u, 1)
    const crops = strides(d.crops, 9)
    expect(crops.map(c => c[0])).toEqual([2, 2, 4])
    const at = (k: number) => { const line = u.lines.find(l => l.items.some(it => it.ph === k))!; return { line, item: line.items.find(it => it.ph === k)! } }
    const f = at(2)
    // each segment from its own rectangle, side by side from the item's x at the unit's scale, its baseline on the line's
    expect(crops[0]).toEqual([2, 400, 697.5, 470, 707, f.item.x, f.line.baseline, 700, 0.9])
    expect(crops[1]!.slice(0, 5)).toEqual([2, 72, 685.5, 100, 695])
    expect(crops[1]![5]).toBeCloseTo(f.item.x + 70 * 0.9, 9)
    expect(crops[1]!.slice(6)).toEqual([f.line.baseline, 688, 0.9])
    expect((70 + 28) * 0.9).toBeCloseTo(f.item.w, 9)
    // where the copy draws them: the ink keeps its height above or below its baseline, × the scale
    const placed = (c: number[]) => ({ bottom: c[6]! + (c[2]! - c[7]!) * c[8]!, top: c[6]! + (c[4]! - c[7]!) * c[8]!, x1: c[5]! + (c[3]! - c[1]!) * c[8]! })
    expect(placed(crops[0]!).bottom).toBeCloseTo(f.line.baseline - 2.5 * 0.9, 9)
    expect(placed(crops[0]!).top).toBeCloseTo(f.line.baseline + 7 * 0.9, 9)
    expect(placed(crops[1]!).x1).toBeCloseTo(f.item.x + f.item.w, 9)
    // the raised call: 4 above the line's baseline in the original, 3.6 above the drawn line's
    const c = at(4)
    expect(crops[2]!.slice(5)).toEqual([c.item.x, c.line.baseline, 676, 0.9])
    expect(placed(crops[2]!).bottom).toBeCloseTo(c.line.baseline + 3.6, 9)
    expect(placed(crops[2]!).top).toBeCloseTo(c.line.baseline + 9, 9)
  })

  it('CJK runs place each character; Latin runs one x a word; spacing as the fit gave it', () => {
    // Chinese with a Latin word: the characters each at their x, the word at one
    const inp = inputOf(nine(), 'zh')
    const zh = laid(layUnit(inp, 1, tr(`${han(10)} BERT ${han(10)}`)))
    const line = zh.lines[0]!, runs = drawUnit(inp, zh, 1).lines[0]!.runs
    expect(runs.map(r => r.text)).toEqual([`${han(10)} `, 'BERT ', han(10)])
    const items = line.items
    expect(runs[0]!.x.slice(0, 10)).toEqual(items.slice(0, 10).map(it => it.x))
    // the space for copying stands where the character before it ends
    expect(runs[0]!.x[10]).toBeCloseTo(items[9]!.x + items[9]!.w, 9)
    expect(runs[1]).toEqual(expect.objectContaining({ x: [items[10]!.x], face: items[10]!.face, letterSpacing: line.letterSpacing, wordSpacing: line.wordSpacing }))
    expect(runs[2]!.x).toEqual(items.slice(11).map(it => it.x))
    expect(runs[0]).toEqual(expect.objectContaining({ letterSpacing: 0, wordSpacing: 0, size: 10, shift: 0, caps: false, colour: 0 }))
    // a run is one face's: a bold group's characters are a run of their own, between the body's. trText holds a space for
    // each of the group's pieces, which the translation has no space at: none is written (fix round 1, concern 3)
    const bold = laid(layUnit(inp, 1, tr([[0, han(5)], [2, 1, STYLE.BOLD], [0, han(5)], [3, 2], [0, han(5)]])))
    const faces = drawUnit(inp, bold, 1).lines[0]!.runs
    expect(faces.map(r => [r.face, r.text])).toEqual([['shs-sc-regular', han(5)], ['shs-sc-bold', han(5)], ['shs-sc-regular', han(5)]])
    // German justified: a line's words one run at one x, with the line's letter and word spacing
    const de = laid(layUnit(inputOf(nine(), 'de'), 1, tr(words(60))))
    const just = de.lines.findIndex(l => l.mode === 'just')
    const run = drawUnit(inputOf(nine(), 'de'), de, 1).lines[just]!.runs
    expect(run).toHaveLength(1)
    expect(run[0]).toEqual(expect.objectContaining({ x: [de.lines[just]!.items[0]!.x], text: de.lines[just]!.items[0]!.text, letterSpacing: de.lines[just]!.letterSpacing, wordSpacing: de.lines[just]!.wordSpacing }))
    expect(de.lines[just]!.wordSpacing).not.toBe(0)
    // Korean tracked into its characters: one run, each character and the space between its words at its x, at the face's
    // size correction
    const one = layoutOf([{ id: 1, lines: column(1, { w: 76 }), frames: [{ lines: 1 }] }])
    const text = '\ubaa8\ub378\uc744 \uc0ac\uc6a9\ud569\ub2c8\ub2e4'
    const ko = laid(layUnit(inputOf(one, 'ko'), 1, tr(text)))
    expect(ko.state.track).toBeLessThan(0)
    const k = drawUnit(inputOf(one, 'ko'), ko, 1).lines[0]!.runs
    expect(k.map(r => r.text)).toEqual([text])
    expect(k[0]!.x).toHaveLength(text.length)
    expect(k[0]!.x.filter((_, i) => text[i] !== ' ')).toEqual(ko.lines[0]!.items.map(it => it.x))
    expect(k[0]!.size).toBeCloseTo(10 * FACES['shs-k-regular']!.size, 9)
  })

  it("every run's from and to index trText, and the runs of the page in order spell each line's text", () => {
    // no placeholder: each line's runs, joined, are its text in trText
    const cases: [string, string][] = [['zh', `${han(30)} BERT ${han(25)} GPT-4 ${han(40)}`], ['de', words(70)], ['ja', `${kanji(50)} model ${kanji(50)}`]]
    for (const [target, text] of cases) {
      const inp = inputOf(nine(), target)
      const u = laid(layUnit(inp, 1, tr(text)))
      const t = trText(tr(text).pieces)
      const d = drawUnit(inp, u, 1)
      // and the lines in turn are all of it, a line break standing where a space or nothing did
      let pos = 0
      d.lines.forEach((line, i) => {
        expect(line.runs.map(r => r.text).join(''), `${target} line ${i}`).toBe(t.slice(u.lines[i]!.from, u.lines[i]!.to))
        expect(t.slice(pos, u.lines[i]!.from)).toMatch(/^ ?$/)
        pos = u.lines[i]!.to
      })
      expect(pos).toBe(t.length)
    }
    // with placeholders: every run within trText, in order; a text run its own slice of it, a page text the placeholder's
    const file = layoutOf([{ id: 1, lines: column(9), ph: [{ k: 2, kind: 'math', segs: [[1, 100, 700, 130, 707, 697.5]] }, { k: 4, kind: 'cite', segs: [[1, 200, 700, 220, 707, 697.5]] }] }])
    const inp = { ...inputOf(file, 'zh'), textIn: (_p: number, x0: number) => (x0 === 200 ? '[12]' : null) }
    const pieces: TrPiece[] = [[0, `${han(38)} LLM`], [1, 2], [0, han(20)], [1, 4], [0, ` ${han(60)}`]]
    const u = laid(layUnit(inp, 1, tr(pieces)))
    const t = trText(pieces)
    const runs: DrawRun[] = drawUnit(inp, u, 1).lines.flatMap(l => l.runs)
    let end = 0
    for (const r of runs) {
      expect(r.from).toBeGreaterThanOrEqual(end)
      expect(r.to).toBeGreaterThanOrEqual(r.from)
      expect(r.to).toBeLessThanOrEqual(t.length)
      if (r.text.startsWith('[12]')) expect(t.slice(r.from, r.to)).toBe(' ')
      else expect(t.slice(r.from, r.to)).toBe(r.text.trimEnd())
      end = r.to
    }
    expect(runs.some(r => r.text.startsWith('[12]'))).toBe(true)
  })

  it('spansOf a sentence gives one box a line it touches; unitAt finds the unit and offset under a point, null between lines', () => {
    const file = layoutOf([{ id: 1, lines: column(9), frames: [{ lines: 9 }] }, { id: 2, lines: column(3, { top: 500 }) }])
    const inp = inputOf(file, 'zh')
    const u = laid(layUnit(inp, 1, tr(han(190), [70, 130])))
    const v = laid(layUnit(inp, 2, tr(han(30))))
    const item = (unit: LaidUnit, at: number) => unit.lines.flatMap(l => l.items.map(it => ({ l, it }))).find(({ it }) => it.from === at)!
    // the second sentence over lines 1, 2 and 3: from its first character to its last on each, the line's em box high
    const spans = spansOf(u, 70, 130)
    expect(spans).toHaveLength(3)
    const box = (a: number, b: number) => {
      const s = item(u, a), e = item(u, b)
      return { page: 1, x0: s.it.x, y0: s.l.baseline - 2.5, x1: e.it.x + e.it.w, y1: s.l.baseline + 7.5 }
    }
    expect(spans[0]).toEqual(box(70, 79))
    expect(spans[1]).toEqual(box(80, 119))
    expect(spans[2]).toEqual(box(120, 129))
    expect(spansOf(u, 300, 400)).toEqual([])
    // a point on character 75, and on unit 2's sixth character
    const c = item(u, 75)
    expect(unitAt([u, v], 1, c.it.x + 5, c.l.baseline + 3)).toEqual({ id: 1, offset: 75 })
    const d = item(v, 5)
    expect(unitAt([u, v], 1, d.it.x + 1, d.l.baseline)).toEqual({ id: 2, offset: 5 })
    // between two lines, beside the text, and on another page: nothing
    expect(unitAt([u, v], 1, c.it.x + 5, c.l.baseline - 5)).toBeNull()
    expect(unitAt([u, v], 1, 20, c.l.baseline)).toBeNull()
    expect(unitAt([u, v], 2, c.it.x + 5, c.l.baseline + 3)).toBeNull()
    // past a line's last character, its end
    const last = u.lines.at(-1)!
    expect(unitAt([u], 1, last.x1 - 1, last.baseline)).toEqual({ id: 1, offset: last.to })
    // within a run of Latin words, by its share of the run's width; the sentence's box starts inside it
    const de = laid(layUnit(inputOf(nine(), 'de'), 1, tr(words(60))))
    const run = de.lines[0]!.items[0]!
    const mid = run.from + Math.floor((run.to - run.from) / 2)
    expect(spansOf(de, mid, run.to)[0]!.x0).toBeGreaterThan(run.x + run.w / 3)
    const at = unitAt([de], 1, run.x + run.w / 2, de.lines[0]!.baseline)!
    expect(Math.abs(at.offset - mid)).toBeLessThanOrEqual(1)
    // two units' lines over one point: the smaller line box
    const over = layoutOf([{ id: 1, lines: [{ x1: 400, baseline: 300, size: 20 }] }, { id: 2, lines: [{ x1: 400, baseline: 305 }] }])
    const big = laid(layUnit(inputOf(over, 'zh'), 1, tr(han(10)))), small = laid(layUnit(inputOf(over, 'zh'), 2, tr(han(10))))
    expect(unitAt([big, small], 1, 80, 306)?.id).toBe(2)
    expect(unitAt([small, big], 1, 80, 306)?.id).toBe(2)
    expect(unitAt([small, big], 1, 80, 296)?.id).toBe(1)
  })

  it("a space is written where the translation has one, a crop's sides too, and nowhere else (fix round 1, concern 3)", () => {
    // German: 'aaaa bbbb', a formula, 'cccc dddd', the formula's own space collapsed into the text's (its offsets [9, 9))
    const file = layoutOf([{ id: 1, lines: column(2), ph: [{ k: 2, kind: 'math', segs: [[1, 100, 700, 130, 707, 697.5]] }] }])
    const inp = inputOf(file, 'de')
    const u = laid(layUnit(inp, 1, tr([[0, 'aaaa bbbb '], [1, 2], [0, ' cccc dddd']])))
    const line = u.lines[0]!, crop = line.items.find(it => it.kind === 'crop')!
    expect([crop.from, crop.to]).toEqual([9, 9])
    const runs = drawUnit(inp, u, 1).lines[0]!.runs
    expect(runs.map(r => r.text)).toEqual(['aaaa bbbb ', ' ', 'cccc dddd'])
    expect(runs[1]!.x).toEqual([crop.x + crop.w])
    // a word glued to a formula ('$x$-axis'): no space either side
    const glued = laid(layUnit(inp, 1, tr([[0, 'aaaa '], [1, 2], [0, '-axis']])))
    expect(drawUnit(inp, glued, 1).lines[0]!.runs.map(r => r.text)).toEqual(['aaaa ', '-axis'])
    // a crop's space in the face of the text after it, at its size correction: Korean's Hangul
    const ko = inputOf(file, 'ko')
    const k = laid(layUnit(ko, 1, tr([[0, '\ubaa8\ub378 '], [1, 2], [0, ' \ub370\uc774\ud130']])))
    const space = drawUnit(ko, k, 1).lines[0]!.runs.find(r => r.text === ' ')!
    expect(space.face).toBe('shs-k-regular')
    expect(space.size).toBeCloseTo(10 * FACES['shs-k-regular']!.size, 9)
  })

  it("spansOf takes a cut word's tail with the word, not with the offset after it (I3)", () => {
    // a German word of 38 letters with a zero width space in it (its text one shorter than its offsets, so the piece a cut
    // leaves of it has no offsets of its own), cut over lines 100 wide: its tail fills line 1, the next word starts line 2
    const word = `${'x'.repeat(19)}\u200b${'x'.repeat(19)}`
    const file = layoutOf([{ id: 1, lines: column(4, { w: 100 }) }])
    const u = laid(layUnit(inputOf(file, 'de'), 1, tr(`${word} yyyy zz`)))
    const items = u.lines.flatMap(l => l.items.map(it => ({ l, it })))
    const tail = items.find(({ it }) => it.from === 39 && it.to === 39)!
    const next = items.find(({ it }) => it.text?.startsWith('yyyy'))!
    expect(tail.l).not.toBe(next.l)
    // the word itself: its two lines, the tail's whole
    const own = spansOf(u, 0, 39)
    expect(own).toHaveLength(2)
    expect(own[1]!.x0).toBe(tail.it.x)
    expect(own[1]!.x1).toBe(tail.it.x + tail.it.w)
    // from the offset after it: the tail is not in it
    expect(spansOf(u, 39, 44)).toEqual([expect.objectContaining({ y0: next.l.baseline - 2.5 })])
  })

  it('the same input gives the same drawing', () => {
    const file = layoutOf([{
      id: 1, lines: column(9),
      ph: [{ k: 2, kind: 'math', segs: [[1, 100, 700, 130, 707, 697.5]] }, { k: 4, kind: 'cite', segs: [[1, 200, 700, 220, 707, 697.5]] }, { k: 6, kind: 'display', segs: [[1, 150, 652, 380, 661, 647]] }],
      erase: [[0, 72, 697.5, 472, 707], [1, 72, 685.5, 472, 695]],
    }])
    const pieces: TrPiece[] = [[0, `${han(38)} LLM`], [1, 2], [0, han(20)], [1, 4], [0, ` ${han(30)}`], [1, 6], [0, han(30)]]
    const run = () => {
      const inp = { ...inputOf(file, 'zh'), textIn: (_p: number, x0: number) => (x0 === 200 ? '[12]' : null) }
      const u = laid(layUnit(inp, 1, tr(pieces)))
      return JSON.stringify([drawUnit(inp, u, 1), spansOf(u, 10, 80), unitAt([u], 1, 150, 700)])
    }
    expect(run()).toBe(run())
  })
})
