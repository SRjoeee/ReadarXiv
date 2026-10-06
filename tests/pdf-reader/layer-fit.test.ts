import { describe, expect, it } from 'vitest'
import { FACES } from '@/pdf-reader/engine/font-roles.mjs'
import { type FitState, type Laid, type LaidUnit, layUnit, SPLIT_NEAR, statesOf } from '@/pdf-reader/engine/layer/fit.mjs'
import type { TrPiece } from '@/pdf-reader/engine/layer/pieces.mjs'
import { layerRulesFor } from '@/pdf-reader/engine/layer-rules.mjs'
import { PH_FLAG } from '@/pdf-reader/engine/layout/file.mjs'
import { measure } from './helpers/layer-fixtures'
import { column, han, inputOf, kanji, layoutOf, withText, words } from './helpers/layer-layout'

// The fit: a unit's translation set into the original's frames, giving up as little as it must, in the maintainer's order
// (tracking, the space below, leading, size), or left the original's past the floor. Layouts are written in the tests and
// read through the real parser; the measure is the brief's fake one (a CJK character 1 em, a Latin one 0.5, a space 0.25),
// and sizes are 10, so a Chinese character is 10 PDF units wide at full size and a line 400 wide holds 40 of them

const laid = (r: Laid): LaidUnit => {
  if (!r.fit) throw new Error(`unfit: ${r.why}`)
  return r
}
const tr = (text: string | TrPiece[], sentences: number[] | null = null) => ({ pieces: typeof text === 'string' ? ([[0, text]] as TrPiece[]) : text, sentences })
/** a line's text as drawn: its text items, a placeholder as [k] */
const textOf = (u: LaidUnit) => u.lines.map(l => l.items.map(it => it.text ?? `[${it.ph}]`).join(''))
const state = (o: Partial<FitState>) => expect.objectContaining(o)

// one frame of nine lines 400 wide at a pitch of 12: at zh's natural leading (1.3) seven lines of 40 characters
const NATURAL = 7 * 40
const nine = (below: number, baselines?: number[]) => layoutOf([{ id: 1, lines: column(9, { baselines }), frames: [{ lines: 9, below }] }])

describe('the states', () => {
  it('from the most natural, each knob to its bound before the next: tracking, the space below, leading, size', () => {
    const states = [...statesOf(layerRulesFor('zh'), { below: 30, pitch: 12 })]
    const at = (knob: FitState['knob']) => states.filter(s => s.knob === knob)
    expect(states[0]).toEqual({ scale: 1, lead: 1.3, track: 0, letter: 0, compress: 1, borrow: 0, knob: 'none' })
    expect(at('track').map(s => [s.compress, s.track])).toEqual([[2, 0], [2, -0.01], [2, -0.02], [2, -0.03], [2, -0.04], [2, -0.05]])
    // one line of the pitch, two, then all the space below
    expect(at('borrow').map(s => s.borrow)).toEqual([12, 24, 30])
    expect(at('lead').map(s => s.lead)).toEqual([1.25, 1.2, 1.15, 1.1, 1.05, 1])
    expect(at('shrink').map(s => s.scale)).toEqual([0.975, 0.95, 0.925, 0.9, 0.875, 0.85, 0.825, 0.8, 0.775, 0.75])
    // the order is the knobs': none moves back
    expect(states.map(s => s.knob)).toEqual(['none', ...at('track').map(() => 'track'), 'borrow', 'borrow', 'borrow', ...Array(6).fill('lead'), ...Array(10).fill('shrink')])
    for (const s of at('shrink')) expect(s).toMatchObject({ track: -0.05, borrow: 30, lead: 1 })
  })

  it('alphabets track their letters by a hundredth; six lines below at most, then all; leading to its floor itself; page-even starts', () => {
    const de = [...statesOf(layerRulesFor('de'), { below: 200, pitch: 12 })]
    expect(de.filter(s => s.knob === 'track').map(s => [s.letter, s.track, s.compress])).toEqual([[-0.01, 0, 0]])
    expect(de.filter(s => s.knob === 'borrow').map(s => s.borrow)).toEqual([12, 24, 36, 48, 60, 72, 200])
    expect(de.filter(s => s.knob === 'lead').map(s => s.lead)).toEqual([0.95])
    // a page-even start: its scale, the rules' own leading, then on down from there; Traditional Chinese compresses nothing
    const even = [...statesOf(layerRulesFor('zh-TW'), { below: 0, pitch: 12, maxScale: 0.9 })]
    expect(even[0]).toEqual({ scale: 0.9, lead: 1.3, track: 0, letter: 0, compress: 0, borrow: 0, knob: 'even' })
    expect(even.filter(s => s.knob === 'lead').map(s => s.lead)).toEqual([1.25, 1.2, 1.15, 1.1, 1.05, 1])
    expect(even.filter(s => s.knob === 'shrink').map(s => s.scale)).toEqual([0.875, 0.85, 0.825, 0.8, 0.775, 0.75])
    expect(even.every(s => s.compress === 0 && s.borrow === 0)).toBe(true)
    // borrowMax: the share of the space below a unit may take, here a half of 100
    expect([...statesOf({ ...layerRulesFor('zh'), borrowMax: 0.5 }, { below: 100, pitch: 12 })].filter(s => s.knob === 'borrow').map(s => s.borrow)).toEqual([12, 24, 36, 48, 50])
    // a leading the steps do not land on: the floor itself last
    expect([...statesOf({ ...layerRulesFor('zh'), leadFloor: 1.02 }, { below: 0, pitch: 12 })].filter(s => s.knob === 'lead').map(s => s.lead)).toEqual([1.25, 1.2, 1.15, 1.1, 1.05, 1.02])
  })
})

describe('the fit', () => {
  it('the order: tracking before the space below before leading before size', () => {
    const at = (len: number, below: number) => laid(layUnit(inputOf(nine(below), 'zh'), 1, tr(han(len))))
    // 3 % too long: tracking alone, at full size and zh's leading
    const a = at(Math.round(NATURAL * 1.03), 100)
    expect(a.state).toEqual(state({ scale: 1, lead: 1.3, borrow: 0, knob: 'track' }))
    expect(a.state.track).toBeLessThan(0)
    // 12 % too long: full tracking and two lines of the space below, which give it a line past the frame's last
    const b = at(Math.round(NATURAL * 1.12), 100)
    expect(b.state).toEqual(state({ scale: 1, lead: 1.3, track: -0.05, compress: 2, borrow: 24, knob: 'borrow' }))
    expect(b.lines.at(-1)!.baseline).toBeLessThan(700 - 8 * 12)
    // with no space below, by leading down to 1.1
    const c = at(Math.round(NATURAL * 1.12), 0)
    expect(c.state).toEqual(state({ scale: 1, lead: 1.1, track: -0.05, borrow: 0, knob: 'lead' }))
    // 40 % too long: below full size, at leading 1.0 and full tracking
    const d = at(Math.round(NATURAL * 1.4), 0)
    expect(d.state).toEqual(state({ lead: 1, track: -0.05, knob: 'shrink' }))
    expect(d.state.scale).toBeLessThan(1)
    expect(d.size).toBeCloseTo(10 * d.state.scale, 9)
    // every character is drawn, once, in order
    for (const [u, len] of [[a, 288], [b, 314], [c, 314], [d, 392]] as const) expect(textOf(u).join('')).toBe(han(len))
  })

  it('shrinking first is never chosen', () => {
    let seed = 20261006
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
    const rules = layerRulesFor('zh')
    let shrunk = 0, whole = 0
    for (let n = 0; n < 100; n++) {
      const len = Math.round(NATURAL * (0.8 + 0.9 * rnd())), below = [0, 30, 100][Math.floor(rnd() * 3)]!
      const r = layUnit(inputOf(nine(below), 'zh'), 1, tr(han(len)))
      if (!r.fit || r.state.scale === 1) { if (r.fit) whole++; continue }
      shrunk++
      // with no size steps at all, no state at full size places every token: shrinking was the only way
      const fixed = layUnit(inputOf(nine(below), 'zh', { ...rules, sizeFloor: 1 }), 1, tr(han(len)))
      expect(fixed, `${len} characters, ${below} below`).toEqual({ id: 1, fit: false, why: 'floor' })
    }
    expect(shrunk).toBeGreaterThan(10)
    expect(whole).toBeGreaterThan(10)
  })

  it('unfit past the floor', () => {
    // at 0.75 and leading 1.0 the frame holds nine lines of 56 characters: twice that is unfit, and no line is returned
    const r = layUnit(inputOf(nine(0), 'zh'), 1, tr(han(2 * 9 * 56)))
    expect(r).toEqual({ id: 1, fit: false, why: 'floor' })
    // a lone formula wider than every line at the floor: never accepted overflowing
    const file = layoutOf([{ id: 1, lines: column(3, { w: 100 }), ph: [{ k: 3, kind: 'math', segs: [[1, 80, 676, 250, 683, 674]] }] }])
    expect(layUnit(inputOf(file, 'zh'), 1, tr([[0, han(4)], [1, 3], [0, han(4)]]))).toEqual({ id: 1, fit: false, why: 'floor' })
  })

  it('nothing to draw, or no unit located, stays the original', () => {
    const file = nine(0)
    expect(layUnit(inputOf(file, 'zh'), 1, tr(''))).toEqual({ id: 1, fit: false, why: 'tokens' })
    expect(layUnit(inputOf(file, 'zh'), 1, tr('   \n  '))).toEqual({ id: 1, fit: false, why: 'tokens' })
    // no pieces at all: the net's checkPieces refuses them before the tokens are made (Task 11)
    expect(layUnit(inputOf(file, 'zh'), 1, { pieces: null as unknown as TrPiece[], sentences: null })).toEqual({ id: 1, fit: false, why: 'pieces' })
    expect(layUnit(inputOf(file, 'zh'), 7, tr(han(10)))).toEqual({ id: 7, fit: false, why: 'located' })
    // a placeholder whose rendering the layout lost: refused before the tokens are made, as the net's 'lost' (Task 11)
    const lost = layoutOf([{ id: 1, lines: column(3), ph: [{ k: 2, kind: 'math', flags: PH_FLAG.LOST }] }])
    expect(layUnit(inputOf(lost, 'zh'), 1, tr([[0, han(5)], [1, 2]]))).toEqual({ id: 1, fit: false, why: 'lost' })
  })

  it("baselines are the layout's at leading 1", () => {
    // the layout's own baselines, not a grid: the fit sets its lines on them
    const B = [700, 688.4, 676.1, 664.5, 652, 640.3, 628.2, 616, 604.1]
    const file = nine(0, B)
    // zh at leading 1 (a text that needs it: nine lines of 42 at its tightest tracking): every line on its frame's next
    // baseline
    const zh = laid(layUnit(inputOf(file, 'zh'), 1, tr(han(350))))
    expect(zh.state).toEqual(state({ scale: 1, lead: 1, track: -0.05, compress: 2, knob: 'lead' }))
    expect(zh.lines.length).toBe(9)
    zh.lines.forEach((l, k) => { expect(l.baseline).toBe(B[k]) })
    // de at full size (its leading is 1.0)
    const de = laid(layUnit(inputOf(file, 'de'), 1, tr(words(80))))
    expect(de.state).toEqual(state({ scale: 1, lead: 1, knob: 'none' }))
    expect(de.lines.length).toBeGreaterThan(3)
    de.lines.forEach((l, k) => { expect(l.baseline).toBe(B[k]) })
    // de at 0.95: from the first baseline down at the scaled pitch (the median gap, 12, × 0.95)
    const small = laid(layUnit(inputOf(file, 'de'), 1, tr(words(80)), { maxScale: 0.95 }))
    expect(small.state).toEqual(state({ scale: 0.95, lead: 1 }))
    small.lines.forEach((l, k) => { expect(l.baseline).toBeCloseTo(700 - k * 12 * 0.95, 9) })
    // zh at its own leading: from the first baseline at the pitch × 1.3, never the scale
    const own = laid(layUnit(inputOf(file, 'zh'), 1, tr(han(200))))
    own.lines.forEach((l, k) => { expect(l.baseline).toBeCloseTo(700 - k * 12 * 1.3, 9) })
  })

  it('only the last frame borrows', () => {
    // two frames of five lines, 200 wide (four lines of 20 characters at zh's leading): the first part fits, the second needs
    // more lines than its frame has
    const two = (below0: number, below1: number) => layoutOf([{
      id: 1,
      lines: [...column(5, { x0: 72, w: 200 }), ...column(5, { x0: 320, w: 200 })],
      frames: [{ lines: 5, below: below0 }, { column: 1, lines: 5, share: 300, below: below1 }],
    }])
    const text = han(180)
    const a = laid(layUnit(inputOf(two(100, 100), 'zh'), 1, tr(text)))
    expect(a.state.knob).toBe('borrow')
    const first = a.lines.filter(l => l.frame === 0), second = a.lines.filter(l => l.frame === 1)
    expect(first.every(l => l.baseline >= 652)).toBe(true)
    expect(second.some(l => l.baseline < 652)).toBe(true)
    expect(textOf(a).join('')).toBe(text)
    // the first frame's space below is never taken: with none below the last, nothing borrows
    const b = laid(layUnit(inputOf(two(100, 0), 'zh'), 1, tr(text)))
    expect(b.state.borrow).toBe(0)
    expect(b.state.knob).toBe('shrink')
    expect(b.lines.every(l => l.baseline >= 652 - 0.01)).toBe(true)
    expect(textOf(b).join('')).toBe(text)
    // the first part too long for its frame: it never takes its frame's space below, the state moves on instead
    const long = layoutOf([{
      id: 1,
      lines: [...column(5, { x0: 72, w: 200 }), ...column(5, { x0: 320, w: 200 })],
      frames: [{ lines: 5, below: 100 }, { column: 1, lines: 5, share: 600, below: 100 }],
    }])
    const c = laid(layUnit(inputOf(long, 'zh'), 1, tr(text)))
    expect(c.cuts).toEqual([108])
    expect(c.lines.filter(l => l.frame === 0).every(l => l.baseline >= 652 - 0.01)).toBe(true)
    expect(['lead', 'shrink']).toContain(c.state.knob)
    expect(textOf(c).join('')).toBe(text)
  })

  it('a line that ends where its text ended is set to its frame\'s widest', () => {
    // the paragraph's last line ran 78 wide: the translation's last line may run to the frame's right edge
    const lines = column(3)
    lines[2] = { ...lines[2]!, x1: 150 }
    const u = laid(layUnit(inputOf(layoutOf([{ id: 1, lines }]), 'ja'), 1, tr(kanji(115))))
    expect(u.state.knob).toBe('none')
    expect(u.lines.map(l => [l.x0, l.x1])).toEqual([[72, 472], [72, 472], [72, 472]])
    // a centred caption's short last line: to the frame's widest on both sides, its text centred there
    const centred = layoutOf([{ id: 1, kind: 'caption', flags: 4, lines: [{ x0: 100, x1: 512, baseline: 700 }, { x0: 256, x1: 356, baseline: 688 }] }])
    const c = laid(layUnit(inputOf(centred, 'ja'), 1, tr(kanji(60))))
    expect(c.lines.map(l => [l.x0, l.x1, l.mode])).toEqual([[100, 512, 'centred'], [100, 512, 'centred']])
    const last = c.lines[1]!.items
    expect((last[0]!.x + last.at(-1)!.x + last.at(-1)!.w) / 2).toBeCloseTo(306, 6)
  })

  it("a split unit is cut at the sentence nearest each frame's share", () => {
    // 1512's unit 16: five lines in the left column, nine in the right, the second box from 0.37 of the source; the
    // translation's sentences start at 0.31 and 0.42 of it
    const split = (left: number) => layoutOf([{
      id: 1,
      lines: [...column(5, { x0: 40, w: left }), ...column(9, { x0: 320, w: 240 })],
      frames: [{ lines: 5 }, { column: 1, lines: 9, share: 370 }],
    }])
    const text = han(200), sentences = [62, 84]
    // the left frame holds 0.42 of it (four lines of 22): cut at 0.42's start, the nearer
    const a = laid(layUnit(inputOf(split(220), 'zh'), 1, tr(text, sentences)))
    expect(a.cuts).toEqual([84])
    expect(a.state.knob).toBe('none')
    expect(a.lines.find(l => l.frame === 1)!.from).toBe(84)
    expect(a.lines.filter(l => l.frame === 0).at(-1)!.to).toBe(84)
    // it does not (four lines of 20): the cut gives a sentence to the roomier right frame before any state moves
    const b = laid(layUnit(inputOf(split(200), 'zh'), 1, tr(text, sentences)))
    expect(b.cuts).toEqual([62])
    expect(b.state.knob).toBe('none')
    expect(b.lines.find(l => l.frame === 1)!.from).toBe(62)
    for (const u of [a, b]) expect(textOf(u).join('')).toBe(text)
  })

  it('of two neighbours, the roomier takes the sentence; the other cut stays', () => {
    // three frames: the middle one's part (75 characters in four lines of 18) does not fit; the first frame has one line to
    // spare, the last two: the last takes a sentence, its cut moving back from 150 to 140
    const file = layoutOf([{
      id: 1,
      lines: [...column(5, { x0: 40, w: 260 }), ...column(5, { x0: 320, w: 180 }), ...column(9, { page: 2, w: 300 })],
      frames: [{ lines: 5 }, { column: 1, lines: 5, share: 250 }, { page: 2, lines: 9, share: 500 }],
    }])
    const u = laid(layUnit(inputOf(file, 'zh'), 1, tr(han(300), [60, 75, 140, 150])))
    expect(u.cuts).toEqual([75, 140])
    expect(u.state.knob).toBe('none')
    expect(textOf(u).join('')).toBe(han(300))
  })

  it('a placeholder is drawn whole: one wider than every line is unfit, never cut across two lines', () => {
    // a citation's own text, 20 characters (90 at 10), in lines 60 wide: no state sets it on one line. The layout's (Task
    // 6b's): read from the page, a reading whose bracket the width band cannot place is not trusted (Task 11)
    const citing = (w: number) => withText(layoutOf([{ id: 1, lines: column(12, { w }), ph: [{ k: 3, kind: 'cite', segs: [[1, 100, 700, 180, 707, 697.5]] }] }]), 1, 3, '[12, 13, 14, 15, 16]')
    const lay = (w: number, target: string, pieces: TrPiece[]) => layUnit(inputOf(citing(w), target), 1, tr(pieces))
    expect(lay(60, 'zh', [[0, han(5)], [1, 3], [0, han(5)]])).toEqual({ id: 1, fit: false, why: 'floor' })
    expect(lay(60, 'en', [[0, 'see the '], [1, 3], [0, ' for data']])).toEqual({ id: 1, fit: false, why: 'floor' })
    // in lines 80 wide it fits once the size is small enough, whole on one line
    for (const target of ['zh', 'en']) {
      const u = laid(lay(80, target, target === 'zh' ? [[0, han(5)], [1, 3], [0, han(5)]] : [[0, 'see the '], [1, 3], [0, ' for data']]))
      expect(u.state.knob, target).toBe('shrink')
      const cites = u.lines.flatMap(l => l.items).filter(it => it.ph === 3)
      expect(cites.map(it => [it.kind, it.text]), target).toEqual([['page-text', '[12, 13, 14, 15, 16]']])
    }
  })

  it("a split's cut keeps each frame's displays in its own part", () => {
    // a display in each frame (its third line): the part of the right frame starts after the left one's display however
    // small its share, and at the right one's display however large
    const file = (share: number) => layoutOf([{
      id: 1,
      lines: [...column(6, { x0: 40, w: 260 }), ...column(6, { x0: 320, w: 260 })],
      frames: [{ lines: 6 }, { column: 1, lines: 6, share }],
      ph: [{ k: 2, kind: 'display', segs: [[1, 60, 676, 280, 683, 673.5]] }, { k: 5, kind: 'display', segs: [[1, 340, 676, 560, 683, 673.5]] }],
    }])
    const pieces: TrPiece[] = [[0, kanji(40)], [1, 2], [0, kanji(60)], [1, 5], [0, kanji(30)]]
    // trText: 40 characters, the left display at 40, 60, the right display at 101, 30
    const low = laid(layUnit(inputOf(file(50), 'ja'), 1, tr(pieces)))
    expect(low.cuts).toEqual([41])
    const high = laid(layUnit(inputOf(file(900), 'ja'), 1, tr(pieces)))
    expect(high.cuts).toEqual([101])
    for (const u of [low, high]) expect([...u.drawn]).toEqual([[2, 'kept'], [5, 'kept']])
  })

  it("a frame with no line to spare is roomier than one whose part does not fit: its last line may take the sentence", () => {
    // two frames of four lines of 20 (zh's leading over five lines): 84 characters on the left do not fit, 66 on the right
    // fill four lines with room on the last; the sentence from 75 goes right before any state moves
    const file = layoutOf([{
      id: 1,
      lines: [...column(5, { x0: 72, w: 200 }), ...column(5, { x0: 320, w: 200 })],
      frames: [{ lines: 5 }, { column: 1, lines: 5, share: 560 }],
    }])
    const u = laid(layUnit(inputOf(file, 'zh'), 1, tr(han(150), [75, 84])))
    expect(u.cuts).toEqual([75])
    expect(u.state.knob).toBe('none')
    expect(textOf(u).join('')).toBe(han(150))
  })

  it('a split with no boundary near the share is cut by characters in CJK and by words in alphabets', () => {
    expect(SPLIT_NEAR).toBe(0.2)
    const split = layoutOf([{
      id: 1,
      lines: [...column(5, { x0: 40, w: 260 }), ...column(9, { x0: 320, w: 260 })],
      frames: [{ lines: 5 }, { column: 1, lines: 9, share: 370 }],
    }])
    // sentences at 10 and 190 of 200 are farther than 0.2 of it from the share's 74: cut at the 74th character
    const zh = laid(layUnit(inputOf(split, 'zh'), 1, tr(han(200), [10, 190])))
    expect(zh.cuts).toEqual([74])
    expect(zh.lines.find(l => l.frame === 1)!.from).toBe(74)
    // with no sentences at all, too
    expect(laid(layUnit(inputOf(split, 'zh'), 1, tr(han(200)))).cuts).toEqual([74])
    // de: at the start of the word nearest 0.37 of the text
    const text = words(40), share = 0.37 * text.length
    const starts = [...text.matchAll(/ (?=\S)/g)].map(m => m.index! + 1)
    const want = starts.reduce((best, s) => (Math.abs(s - share) < Math.abs(best - share) ? s : best))
    const de = laid(layUnit(inputOf(split, 'de'), 1, tr(text)))
    expect(de.cuts).toEqual([want])
    expect(text[want - 1]).toBe(' ')
    expect(de.lines.find(l => l.frame === 1)!.from).toBe(want)
    expect(textOf(de).join(' ')).toBe(text)
  })

  it('a split unit is set at one scale in both frames', () => {
    // a narrow left frame (12 characters a line) holds its share only below full size; the right one has room to spare
    const split = layoutOf([{
      id: 1,
      lines: [...column(5, { x0: 40, w: 120 }), ...column(9, { x0: 320, w: 240 })],
      frames: [{ lines: 5 }, { column: 1, lines: 9, share: 370 }],
    }])
    const u = laid(layUnit(inputOf(split, 'zh'), 1, tr(han(200))))
    expect(u.state.scale).toBeLessThan(1)
    expect(new Set(u.lines.map(l => l.frame))).toEqual(new Set([0, 1]))
    for (const l of u.lines) expect(l.size).toBe(u.size)
    expect(u.size).toBeCloseTo(10 * u.state.scale, 9)
    expect(textOf(u).join('')).toBe(han(200))
  })

  it('a display keeps its lines: the text before fills the lines above, the text after starts below, its number untouched', () => {
    // lines 3 and 4 are a numbered display's (its body over most of each, its number at the right of the second)
    const B = column(9).map(l => l.baseline)
    const number = [1, 450, B[4]!, 470, B[4]! + 7, B[4]! - 2.5]
    const file = layoutOf([{
      id: 1,
      lines: column(9),
      ph: [{ k: 5, kind: 'display', flags: PH_FLAG.NUMBERED, segs: [[1, 150, B[3]!, 380, B[3]! + 9, B[3]! - 5], [1, 150, B[4]!, 380, B[4]! + 9, B[4]! - 5], number] }],
    }])
    const before = han(70), after = han(90)
    const u = laid(layUnit(inputOf(file, 'zh'), 1, tr([[0, before], [1, 5], [0, after]])))
    // the display is one space of trText, at the end of the text before it
    const at = before.length
    expect(u.drawn.get(5)).toBe('kept')
    const above = u.lines.filter(l => l.to <= at), below = u.lines.filter(l => l.from > at)
    expect(above.length + below.length).toBe(u.lines.length)
    expect(above.map(l => l.items.map(it => it.text).join('')).join('')).toBe(before)
    expect(below.map(l => l.items.map(it => it.text).join('')).join('')).toBe(after)
    // above the display's first line, and from the first line below it on
    for (const l of above) expect(l.baseline).toBeGreaterThanOrEqual(B[2]! - 0.01)
    expect(below[0]!.baseline).toBe(B[5])
    for (const l of below) expect(l.baseline).toBeLessThanOrEqual(B[5]! + 0.01)
    // no line over the display or its number
    for (const l of u.lines) expect(l.baseline > B[4]! - 5 && l.baseline < B[3]! + 9).toBe(false)
  })

  it('a display that holds no line of its own still parts the text: what follows it is set below it', () => {
    // a display in the gap between lines 2 and 3 (the layout's lines skip it): the text after it starts on line 3
    const lines = column(6, { baselines: [700, 688, 676, 640, 628, 616] })
    const file = layoutOf([{ id: 1, lines, ph: [{ k: 3, kind: 'display', segs: [[1, 150, 658, 380, 666, 652]] }] }])
    const u = laid(layUnit(inputOf(file, 'ja'), 1, tr([[0, kanji(20)], [1, 3], [0, kanji(30)]])))
    expect(u.drawn.get(3)).toBe('kept')
    expect(u.lines.map(l => [l.baseline, l.items.map(it => it.text).join('')])).toEqual([[700, kanji(20)], [640, kanji(30)]])
  })

  it('a display segment beside a line keeps the line clear of it; a line narrower than 1.5 em holds no text', () => {
    // a display's narrow segment at the right of line 1 (less than a third of it); line 2 is a sliver 12 wide
    const lines = column(4)
    lines[2] = { ...lines[2]!, x0: 460, x1: 472 }
    const file = layoutOf([{ id: 1, lines, ph: [{ k: 4, kind: 'display', segs: [[1, 400, lines[1]!.baseline, 470, lines[1]!.baseline + 7, lines[1]!.baseline - 2.5]] }] }])
    const u = laid(layUnit(inputOf(file, 'ja'), 1, tr([[0, kanji(90)], [1, 4]])))
    const second = u.lines.find(l => l.baseline === lines[1]!.baseline)!
    // a quarter of an em clear of it
    expect(second.x1).toBeCloseTo(397.5, 9)
    expect(u.lines.some(l => l.baseline === lines[2]!.baseline)).toBe(false)
    expect(textOf(u).join('')).toBe(kanji(90))
    // a line 16 wide, over 1.5 em at 10, holds a character
    const wider = column(4)
    wider[2] = { ...wider[2]!, x0: 456, x1: 472 }
    const v = laid(layUnit(inputOf(layoutOf([{ id: 1, lines: wider }]), 'ja'), 1, tr(kanji(90))))
    expect(v.lines.find(l => l.baseline === wider[2]!.baseline)?.items.map(it => it.text)).toEqual([kanji(90)[80]])
  })

  it('a display holds a line it covers by a third of its width or more; less, and the line keeps clear of it', () => {
    // line 1 (72-472) under a segment from its right edge: 136 of 400 is more than a third, 128 less
    const unitWith = (x0: number) => layoutOf([{ id: 1, lines: column(4), ph: [{ k: 4, kind: 'display', segs: [[1, x0, 688, 472, 695, 685.5]] }] }])
    // held: the 45 characters before the display have line 0 alone (40), so the unit is set smaller, never on line 1
    const held = laid(layUnit(inputOf(unitWith(336), 'ja'), 1, tr([[0, kanji(45)], [1, 4], [0, kanji(40)]])))
    expect(held.state.knob).toBe('shrink')
    expect(held.lines.some(l => l.baseline === 688)).toBe(false)
    const beside = laid(layUnit(inputOf(unitWith(344), 'ja'), 1, tr([[0, kanji(26)], [1, 4]])))
    expect(beside.lines.map(l => [l.baseline, l.x1])).toEqual([[700, 472]])
    // the display held by the translation, as the completeness net requires of every visible placeholder (Task 11)
    const below = laid(layUnit(inputOf(unitWith(344), 'ja'), 1, tr([[0, kanji(66)], [1, 4]])))
    expect(below.lines.map(l => [l.baseline, l.x1])).toEqual([[700, 472], [688, 341.5]])
  })

  it('a unit with no two lines takes its pitch as 1.2 times its size', () => {
    // one line of 100: its second line, borrowed below it, a pitch of 12 down
    const file = layoutOf([{ id: 1, lines: [{ x1: 172, baseline: 700 }], frames: [{ lines: 1, below: 50 }] }])
    const u = laid(layUnit(inputOf(file, 'de'), 1, tr(words(6))))
    expect(u.state).toEqual(state({ knob: 'borrow', borrow: 12 }))
    expect(u.lines.map(l => l.baseline)).toEqual([700, 688])
  })

  it('two lines never stand closer than 0.7 of the pitch', () => {
    // the layout has two baselines 3 apart (a line the maker split): the second is set 0.7 of the pitch below the first
    const file = nine(0, [700, 688, 685, 676, 664, 652, 640, 628, 616])
    const u = laid(layUnit(inputOf(file, 'ja'), 1, tr(kanji(300))))
    for (let k = 1; k < u.lines.length; k++) expect(u.lines[k - 1]!.baseline - u.lines[k]!.baseline).toBeGreaterThanOrEqual(0.7 * 12 - 1e-9)
  })

  it('a line that ends a run is never set over what narrows the lines above it, a figure the text wraps around', () => {
    // lines 1-5 full (72-472), lines 6-9 narrowed by a figure at 300-472, the last one's text ending at 250
    const lines = column(9).map((l, i) => (i < 5 ? l : { ...l, x1: i === 8 ? 250 : 300 }))
    const u = laid(layUnit(inputOf(layoutOf([{ id: 1, lines }]), 'ja'), 1, tr(kanji(296))))
    expect(u.lines.map(l => l.x1)).toEqual([472, 472, 472, 472, 472, 300, 300, 300, 300])
    for (const l of u.lines.slice(5)) for (const it of l.items) expect(it.x + it.w).toBeLessThanOrEqual(300 + 0.01)
    // a line borrowed below the frame is as narrow as the frame's last line
    const room = laid(layUnit(inputOf(layoutOf([{ id: 1, lines, frames: [{ lines: 9, below: 30 }] }]), 'ja'), 1, tr(kanji(320))))
    expect(room.state.knob).toBe('borrow')
    expect(room.lines.at(-1)!.baseline).toBeLessThan(604)
    for (const l of room.lines.slice(5)) expect(l.x1).toBe(300)
  })

  it('the first line starts after its label', () => {
    // a heading's number at 72-90, its text from 100
    const heading = (labelX1: number) => layoutOf([{ id: 1, kind: 'heading', lines: [{ x0: 100, x1: 300, baseline: 700 }], labels: [{ x0: 72, baseline: 700, x1: labelX1 }] }])
    const u = laid(layUnit(inputOf(heading(90), 'zh'), 1, tr(han(6))))
    expect(u.lines[0]!.x0).toBe(100)
    expect(u.lines[0]!.items[0]!.x).toBeGreaterThanOrEqual(100)
    // a label that runs into the line: the text starts a quarter of an em after it
    const v = laid(layUnit(inputOf(heading(104), 'zh'), 1, tr(han(6))))
    expect(v.lines[0]!.x0).toBeCloseTo(106.5, 9)
    // a paragraph's later lines start at their own left edge
    const para = layoutOf([{ id: 1, lines: [{ x0: 90, x1: 472, baseline: 700 }, ...column(3, { top: 688 })], labels: [{ kind: 'item', x0: 72, baseline: 700, x1: 80 }] }])
    const p = laid(layUnit(inputOf(para, 'ja'), 1, tr(kanji(120))))
    expect(p.lines.map(l => l.x0)).toEqual([90, 72, 72, 72].slice(0, p.lines.length))
  })

  it('the same input gives the same lines, and no line depends on any zoom', () => {
    const file = layoutOf([
      { id: 1, lines: [...column(5, { x0: 40, w: 220 }), ...column(9, { x0: 320, w: 240 })], frames: [{ lines: 5 }, { column: 1, lines: 9, share: 370, below: 40 }] },
      { id: 2, lines: column(9, { top: 500 }), ph: [{ k: 3, kind: 'math', segs: [[1, 200, 476, 230, 483, 474]] }, { k: 6, kind: 'display', segs: [[1, 150, 452, 380, 460, 447]] }] },
    ])
    const runs = () => [
      layUnit(inputOf(file, 'zh'), 1, tr(han(220), [62, 84, 150])),
      layUnit(inputOf(file, 'de'), 2, tr([[0, words(12)], [1, 3], [0, words(8)], [1, 6], [0, words(10)]])),
      layUnit(inputOf(file, 'ko'), 2, tr([[0, '\ubaa8\ub378\uc744 \uc0ac\uc6a9\ud569\ub2c8\ub2e4 '.repeat(6)], [1, 3], [0, '\ub370\uc774\ud130'], [1, 6]])),
    ]
    const json = (rs: Laid[]) => JSON.stringify(rs.map(r => (r.fit ? { ...r, drawn: [...r.drawn] } : r)))
    const one = runs(), two = runs()
    expect(json(one)).toBe(json(two))
    // PDF units only: every line and item has exactly the contract's fields, and every number lies on the page
    const LINE = ['baseline', 'frame', 'from', 'items', 'letterSpacing', 'mode', 'page', 'size', 'to', 'wordSpacing', 'x0', 'x1']
    const ITEM = new Set(['caps', 'colour', 'face', 'from', 'kind', 'ph', 'raised', 'space', 'text', 'to', 'w', 'x'])
    for (const r of one) {
      const u = laid(r)
      expect(Object.keys(u).sort()).toEqual(['cuts', 'drawn', 'fit', 'id', 'lines', 'size', 'state'])
      for (const l of u.lines) {
        expect(Object.keys(l).sort()).toEqual(LINE)
        expect(l.x0 >= 0 && l.x1 <= 612 && l.baseline > 0 && l.baseline < 792).toBe(true)
        for (const it of l.items) {
          for (const k of Object.keys(it)) expect(ITEM.has(k), k).toBe(true)
          expect(it.x >= l.x0 - l.size && it.x + it.w <= l.x1 + 0.01).toBe(true)
        }
      }
    }
  })
})

describe("the lines' items", () => {
  it('Latin words of one face are one run, set by the line letter and word spacing to their width', () => {
    const file = nine(0)
    const u = laid(layUnit(inputOf(file, 'de'), 1, tr(words(60))))
    const just = u.lines.find(l => l.mode === 'just')!
    expect(just.items.length).toBe(1)
    const run = just.items[0]!
    // the run's width: its letters at 0.5 em, each with the letter spacing, its spaces at 0.25 em with the word spacing too
    const chars = [...run.text!].length, spaces = run.text!.split(' ').length - 1
    const natural = (chars - spaces) * 5 + spaces * 2.5
    expect(natural + chars * just.letterSpacing + spaces * just.wordSpacing).toBeCloseTo(run.w, 9)
    expect(run.x + run.w).toBeCloseTo(just.x1, 9)
  })

  it('every text and page-text item is its width: natural at the size, the letter spacing after each character, the word spacing after each space', () => {
    /** a text's width at the line's size in its face, with the fake measure */
    const natural = (text: string, face: string, size: number) => (measure(text, face, false) / 100) * size * FACES[face]!.size
    const holds = (u: LaidUnit) => {
      for (const l of u.lines) for (const it of l.items) {
        if (it.kind === 'crop') continue
        const chars = [...it.text!].length, spaces = it.kind === 'text' ? it.text!.split(' ').length - 1 : 0
        expect(natural(it.text!, it.face!, l.size) + chars * l.letterSpacing + spaces * l.wordSpacing, `${it.kind} ${it.text}`).toBeCloseTo(it.w, 9)
      }
    }
    // de just past full size: letter spacing on, a justified line squeezed, a citation as the page's text (no word spacing)
    const file = layoutOf([{ id: 1, lines: column(2, { w: 158 }), ph: [{ k: 3, kind: 'cite', segs: [[1, 100, 700, 140, 707, 697.5]] }] }])
    const de = laid(layUnit({ ...inputOf(file, 'de'), textIn: () => '[12, 13]' }, 1, tr([[0, words(8)], [1, 3], [0, ' und daten']])))
    expect(de.state).toEqual(state({ knob: 'track', letter: -0.01, scale: 1 }))
    expect(de.lines.map(l => l.mode)).toEqual(['just', 'last'])
    for (const l of de.lines) expect(l.letterSpacing).toBeCloseTo(-0.1, 9)
    expect(de.lines[0]!.items.map(it => it.text)).toEqual([words(6)])
    expect(de.lines[1]!.items.map(it => [it.kind, it.text])).toEqual([['text', 'eine methode'], ['page-text', '[12, 13]'], ['text', 'und daten']])
    holds(de)
    expect(de.lines[0]!.items[0]!.x + de.lines[0]!.items[0]!.w).toBeCloseTo(de.lines[0]!.x1, 9)
    // Korean at no tracking: its Hangul words and their spaces one run in Source Han Serif K, justified by the word spacing
    const ko = laid(layUnit(inputOf(nine(0), 'ko'), 1, tr('\ubaa8\ub378\uc744 \uc0ac\uc6a9\ud569\ub2c8\ub2e4 \ub370\uc774\ud130 '.repeat(12).trim())))
    expect(ko.state.knob).toBe('none')
    const just = ko.lines.filter(l => l.mode === 'just')
    expect(just.length).toBeGreaterThan(0)
    for (const l of just) {
      expect(l.items.length).toBe(1)
      expect(l.wordSpacing).toBeGreaterThan(0)
      expect(l.items[0]!.x + l.items[0]!.w).toBeCloseTo(l.x1, 9)
    }
    holds(ko)
  })

  it('a CJK character is an item of its own; Korean words tracked are drawn a character an item at their places', () => {
    const zh = laid(layUnit(inputOf(nine(0), 'zh'), 1, tr(han(30))))
    expect(zh.lines[0]!.items.every(it => [...it.text!].length === 1)).toBe(true)
    // Korean a little too long for its one line (8.25 em at Source Han Serif K's 0.959 in 7.6): tracked, its Hangul words cut
    // into characters, each at its place
    const one = layoutOf([{ id: 1, lines: column(1, { w: 76 }), frames: [{ lines: 1 }] }])
    const text = '\ubaa8\ub378\uc744 \uc0ac\uc6a9\ud569\ub2c8\ub2e4'
    const ko = laid(layUnit(inputOf(one, 'ko'), 1, tr(text)))
    expect(ko.state).toEqual(state({ knob: 'track', scale: 1 }))
    expect(ko.state.track).toBeLessThan(0)
    const items = ko.lines[0]!.items
    expect(items.map(it => it.text)).toEqual([...text.replace(' ', '')])
    // each character 0.959 em with the tracking, the next one after it (a space between the words)
    const em = 10 * (0.959 + ko.state.track)
    for (let q = 1; q < items.length; q++) expect(items[q]!.x - items[q - 1]!.x).toBeGreaterThanOrEqual(em - 1e-9)
    for (const it of items) expect(it.w).toBeCloseTo(em, 9)
    expect(items[3]!.from).toBe(4)
    expect(items.at(-1)!.to).toBe(text.length)
  })

  it("a face's size correction is measured: Korean's Hangul at its family's ideographs' size", () => {
    // Source Han Serif K Regular (a Times paper's Korean body) is set at 0.959 of the line's size; Chinese at the size itself
    expect(FACES['shs-k-regular']!.size).toBe(0.959)
    const ko = laid(layUnit(inputOf(nine(0), 'ko'), 1, tr('\ubaa8\ub378\uc744 \uc0ac\uc6a9\ud569\ub2c8\ub2e4')))
    const word = ko.lines[0]!.items[0]!
    expect(word.face).toBe('shs-k-regular')
    expect(word.text).toBe('\ubaa8\ub378\uc744 \uc0ac\uc6a9\ud569\ub2c8\ub2e4')
    // its eight syllables and the space between its words, both in the Korean face
    expect(word.w).toBeCloseTo((8 * 10 + 2.5) * 0.959, 9)
    const zh = laid(layUnit(inputOf(nine(0), 'zh'), 1, tr(han(3))))
    expect(zh.lines[0]!.items.map(it => it.w)).toEqual([10, 10, 10])
  })

  it("each placeholder is drawn as the tokens say, and every one is in `drawn`", () => {
    const file = layoutOf([{ id: 1, lines: column(4), ph: [{ k: 2, kind: 'math', segs: [[1, 100, 700, 130, 707, 697.5]] }, { k: 4, kind: 'cite', flags: PH_FLAG.RAISED, segs: [[1, 200, 688, 210, 698, 688]] }] }])
    const u = laid(layUnit(inputOf(file, 'en'), 1, tr([[0, 'a model of '], [1, 2], [0, ' with data'], [1, 4], [0, ' and more']])))
    expect([...u.drawn]).toEqual([[2, 'crop'], [4, 'crop']])
    const items = u.lines.flatMap(l => l.items)
    expect(items.find(it => it.ph === 2)).toEqual(expect.objectContaining({ kind: 'crop', w: 30, raised: 0 }))
    expect(items.find(it => it.ph === 4)).toEqual(expect.objectContaining({ kind: 'crop', raised: 1 }))
  })
})
