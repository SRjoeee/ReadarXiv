import { describe, expect, it } from 'vitest'
import { FACES } from '@/pdf-reader/engine/font-roles.mjs'
import { type DrawRun, drawUnit, spansOf, unitAt } from '@/pdf-reader/engine/layer/draw.mjs'
import { type Laid, type LaidUnit, layUnit, type Tr } from '@/pdf-reader/engine/layer/fit.mjs'
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

describe('the drawing', () => {
  it("the erase is the layout's and nothing else", () => {
    // a unit split over two pages, every line with two erase rectangles, and another unit below it on page 1
    const lines = [...column(3, { page: 1 }), ...column(3, { page: 2 })]
    const erase: EraseSpec[] = lines.flatMap((l, i): EraseSpec[] => [[i, 72, l.baseline - 2.5, 200 + i, l.baseline + 7], [i, 210 + i, l.baseline - 2, 472, l.baseline + 6]])
    const file = layoutOf([
      { id: 1, lines, frames: [{ page: 1, lines: 3 }, { page: 2, lines: 3, share: 500, below: 100 }], erase },
      { id: 2, lines: column(2, { top: 500 }), erase: [[0, 72, 497.5, 472, 507], [1, 72, 485.5, 472, 495]] },
    ])
    const inp = inputOf(file, 'zh')
    const u = laid(layUnit(inp, 1, tr(han(150))))
    const own = (from: number, to: number) => erase.filter(e => e[0] >= from && e[0] < to).flatMap(e => e.slice(1))
    const one = drawUnit(inp, u, 1), two = drawUnit(inp, u, 2)
    expect(one.erase).toEqual(own(0, 3))
    expect(two.erase).toEqual(own(3, 6))
    // whatever the fit set: the lines drawn on each page are its own, and a page it is not on draws nothing
    expect(one.lines.map(l => l.baseline)).toEqual(u.lines.filter(l => l.page === 1).map(l => l.baseline))
    expect(two.lines.map(l => l.baseline)).toEqual(u.lines.filter(l => l.page === 2).map(l => l.baseline))
    expect(drawUnit(inp, u, 3)).toEqual({ id: 1, page: 3, erase: [], crops: [], lines: [] })
    // a unit borrowing lines below its frame still erases only the layout's
    const tall = layoutOf([{ id: 1, lines: column(2), frames: [{ lines: 2, below: 200 }], erase: [[0, 72, 697.5, 472, 707], [1, 72, 685.5, 472, 695]] }])
    const t = laid(layUnit(inputOf(tall, 'zh'), 1, tr(han(160))))
    expect(t.lines.length).toBeGreaterThan(2)
    expect(drawUnit(inputOf(tall, 'zh'), t, 1).erase).toEqual([72, 697.5, 472, 707, 72, 685.5, 472, 695])
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
    // a run is one face's: a bold group's characters are a run of their own, between the body's
    const bold = laid(layUnit(inp, 1, tr([[0, han(5)], [2, 1, STYLE.BOLD], [0, han(5)], [3, 2], [0, han(5)]])))
    const faces = drawUnit(inp, bold, 1).lines[0]!.runs
    expect(faces.map(r => [r.face, r.text.trimEnd()])).toEqual([['shs-sc-regular', han(5)], ['shs-sc-bold', han(5)], ['shs-sc-regular', han(5)]])
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
    const text = '모델을 사용합니다'
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
    const file = layoutOf([{ id: 1, lines: column(9), ph: [{ k: 2, kind: 'math', segs: [[1, 100, 700, 130, 707, 697.5]] }, { k: 4, kind: 'cite', segs: [[1, 200, 700, 215, 707, 697.5]] }] }])
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

  it('the same input gives the same drawing', () => {
    const file = layoutOf([{
      id: 1, lines: column(9),
      ph: [{ k: 2, kind: 'math', segs: [[1, 100, 700, 130, 707, 697.5]] }, { k: 4, kind: 'cite', segs: [[1, 200, 700, 215, 707, 697.5]] }, { k: 6, kind: 'display', segs: [[1, 150, 652, 380, 661, 647]] }],
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
