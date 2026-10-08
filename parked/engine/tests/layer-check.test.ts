import { describe, expect, it } from 'vitest'
import { checkPage, lostInk } from '@/pdf-reader/engine/layer/check.mjs'
import { type LaidItem, type LaidUnit, layUnit, type Tr } from '../layer/fit.mjs'
import type { TrPiece } from '@/pdf-reader/engine/layer/pieces.mjs'
import { type LayoutIndex, type LayoutUnit, PH_FLAG } from '@/pdf-reader/engine/layout/file.mjs'
import { column, han, inputOf, layoutOf, withText } from './helpers/layer-layout'

// The layer's completeness checker (Plan 8b, Task 12), which only the gate and this test load: lost ink over pixel arrays
// made here, and the data-level checks over units laid by the real fit (the brief's fake measure) and then broken on
// purpose, the way a faulty layer would break them

const W = 40, H = 30
/** a white RGBA page, with black squares [x, y, size] */
function plane(...squares: [number, number, number][]): Uint8ClampedArray {
  const a = new Uint8ClampedArray(W * H * 4).fill(255)
  for (const [x0, y0, n] of squares) for (let y = y0; y < y0 + n; y++) for (let x = x0; x < x0 + n; x++) a.fill(0, 4 * (y * W + x), 4 * (y * W + x) + 3)
  return a
}
const none = () => new Uint8Array(W * H)

const tr = (pieces: TrPiece[]): Tr => ({ pieces, sentences: null })
const fitted = (l: ReturnType<typeof layUnit>): LaidUnit => {
  if (!l.fit) throw new Error(`unfit: ${l.why}`)
  return l
}
/** a laid unit with its lines' items changed (a copy: the fit's own result is not touched) */
function edited(u: LaidUnit, edit: (items: LaidItem[], line: number) => LaidItem[]): LaidUnit {
  return { ...u, lines: u.lines.map((l, i) => ({ ...l, items: edit(l.items.map(it => ({ ...it })), i) })) }
}
const mapOf = (...rows: [number, Tr][]) => new Map(rows)

/** a unit of three lines whose piece 1 is a citation on its first line */
function citing(pieces: TrPiece[]) {
  const file = layoutOf([{ id: 1, lines: column(3), ph: [{ k: 1, kind: 'cite', segs: [[1, 300, 700, 318, 707, 697.5]] }] }])
  const t = tr(pieces)
  return { file, t, u: fitted(layUnit(inputOf(file, 'zh'), 1, t)) }
}

describe('the completeness checker', () => {
  it('a planted lost glyph is found', () => {
    // a 6 x 6 glyph the copy erased and nothing accounts for: one region of 36 pixels, where it was
    const orig = plane([5, 4, 6], [30, 20, 2]), copy = plane()
    const lost = lostInk({ w: W, h: H, orig, copy, accounted: none(), min: 4, page: 3 })
    expect(lost).toEqual([{ page: 3, box: [5, 4, 11, 10], px: 36 }])
    // the 2 x 2 one is 4 pixels, not more than the floor; at a floor of 3 it is found too
    expect(lostInk({ w: W, h: H, orig, copy, accounted: none(), min: 3 }).map(l => l.px)).toEqual([36, 4])
    // ink the copy still shows is not lost, nor is a trace the copy keeps (a grey pixel is no paper)
    expect(lostInk({ w: W, h: H, orig, copy: orig, accounted: none(), min: 4 })).toEqual([])
    const grey = plane()
    for (let y = 4; y < 10; y++) for (let x = 5; x < 11; x++) grey.fill(200, 4 * (y * W + x), 4 * (y * W + x) + 3)
    expect(lostInk({ w: W, h: H, orig, copy: grey, accounted: none(), min: 4 })).toEqual([])
  })

  it('ink the unit accounts for is not lost', () => {
    const orig = plane([5, 4, 6]), copy = plane()
    const accounted = none()
    for (let y = 4; y < 10; y++) accounted.fill(1, y * W + 5, y * W + 11)
    expect(lostInk({ w: W, h: H, orig, copy, accounted, min: 4 })).toEqual([])
    // half of it accounted for: the other half, 18 pixels, is lost
    const half = none()
    for (let y = 4; y < 10; y++) half.fill(1, y * W + 5, y * W + 8)
    expect(lostInk({ w: W, h: H, orig, copy, accounted: half, min: 4 })).toEqual([{ page: 0, box: [8, 4, 11, 10], px: 18 }])
  })

  it('a placeholder dropped, or drawn twice, is counted by k', () => {
    const { file, t, u } = citing([[0, han(4)], [1, 1], [0, han(30)]])
    const crop = u.lines.flatMap(l => l.items).find(it => it.ph === 1)
    expect(crop?.kind).toBe('crop')
    // as the fit laid it: every check passes
    expect(checkPage(file, 1, [u], mapOf([1, t]))).toEqual({ missing: [], twice: [], brackets: [], duplicated: [], numbers: { shown: 0, total: 0 }, clipped: 0 })
    const dropped = edited(u, items => items.filter(it => it.ph !== 1))
    expect(checkPage(file, 1, [dropped], mapOf([1, t])).missing).toEqual([1])
    const last = u.lines.length - 1
    const twice = edited(u, (items, i) => (i === last ? [...items, { ...crop!, x: items.at(-1)!.x + items.at(-1)!.w }] : items))
    expect(checkPage(file, 1, [twice], mapOf([1, t])).twice).toEqual([1])
    // a unit left the original's is not drawn: nothing of it is checked
    expect(checkPage(file, 1, [{ id: 1, fit: false, why: 'floor' }], mapOf([1, t])).missing).toEqual([])
    // a crop set on a page its segments are not on draws nothing: missing on the page its ink is on
    const moved = { ...u, lines: u.lines.map(l => (l.items.some(it => it.ph === 1) ? { ...l, page: 2 } : l)) }
    expect(checkPage(file, 1, [moved], mapOf([1, t])).missing).toEqual([1])
  })

  it('a doubled bracket, a duplication the layer made and a missing equation number are counted; a duplication the translation itself holds is not', () => {
    // a citation whose own text is '[3]' (the layout's, Task 6b), drawn as a crop between the translation's brackets
    const { file, t, u } = citing([[0, `${han(4)}[`], [1, 1], [0, `]${han(30)}`]])
    const own = withText(file, 1, 1, '[3]')
    expect(checkPage(own, 1, [u], mapOf([1, t])).brackets).toEqual([1])
    // with no bracket beside it, or a rendering with none, nothing is doubled
    const plain = citing([[0, han(4)], [1, 1], [0, han(30)]])
    expect(checkPage(withText(plain.file, 1, 1, '[3]'), 1, [plain.u], mapOf([1, plain.t])).brackets).toEqual([])
    expect(checkPage(withText(file, 1, 1, '3'), 1, [u], mapOf([1, t])).brackets).toEqual([])
    // a pair the translation opens further off is nesting, not doubling: '(or (3.1))'
    const nested = citing([[0, `${han(2)}\uff08${han(2)}`], [1, 1], [0, `\uff09${han(30)}`]])
    expect(checkPage(withText(nested.file, 1, 1, '(3.1)'), 1, [nested.u], mapOf([1, nested.t])).brackets).toEqual([])
    // and one it leaves unmatched beside the rendering's own is doubled, '((3.1)': the net refuses such a unit, so the
    // layer's drawing is edited into it
    const at = plain.u.lines[0]!.items.findIndex(it => it.ph === 1)
    const open = edited(plain.u, (items, i) => (i === 0 ? items.map((it, q) => (q === at - 1 ? { ...it, text: `${it.text}\uff08` } : it)) : items))
    expect(checkPage(withText(plain.file, 1, 1, '(3.1)'), 1, [open], mapOf([1, plain.t])).brackets).toEqual([1])

    // a Latin word the translation writes once, drawn twice in a row by the layer: one duplication of the unit
    const once = citing([[0, `ResNet ${han(4)}`], [1, 1], [0, han(30)]])
    expect(checkPage(once.file, 1, [once.u], mapOf([1, once.t])).duplicated).toEqual([])
    const word = once.u.lines[0]!.items.findIndex(it => it.kind === 'text' && it.text?.includes('ResNet'))
    expect(word).toBeGreaterThanOrEqual(0)
    const doubled = edited(once.u, (items, i) => (i === 0 ? [...items.slice(0, word + 1), { ...items[word]! }, ...items.slice(word + 1)] : items))
    expect(checkPage(once.file, 1, [doubled], mapOf([1, once.t])).duplicated).toEqual([1])
    // the same, where the translation itself writes it twice: not the layer's
    const twice = citing([[0, `ResNet ResNet ${han(4)}`], [1, 1], [0, han(30)]])
    expect(checkPage(twice.file, 1, [twice.u], mapOf([1, twice.t])).duplicated).toEqual([])

    // an equation number: a numbered display of unit 2, kept in place below unit 1; erased by unit 1, it is not shown
    const lines = column(3)
    const eq = layoutOf([
      { id: 1, lines, erase: lines.map((l, i): [number, number, number, number, number] => [i, 72, l.baseline - 2.5, 472, l.baseline + 7]) },
      { id: 2, lines: column(2, { top: 640 }), ph: [{ k: 0, kind: 'display', flags: PH_FLAG.NUMBERED, segs: [[1, 150, 655, 472, 662, 652]] }] },
    ])
    const u1 = fitted(layUnit(inputOf(eq, 'zh'), 1, tr([[0, han(20)]])))
    expect(checkPage(eq, 1, [u1], mapOf([1, tr([[0, han(20)]])])).numbers).toEqual({ shown: 1, total: 1 })
    const reaching: LayoutIndex = {
      ...eq,
      unit: (id: number) => {
        const one = eq.unit(id)
        // its last line's erase reaching down over the display
        return id === 1 && one ? ({ ...one, erase: one.erase.map((e, i) => (i === 2 ? Float64Array.of(...e, 150, 650, 300, 664) : e)) } as LayoutUnit) : one
      },
    }
    expect(checkPage(reaching, 1, [u1], mapOf([1, tr([[0, han(20)]])])).numbers).toEqual({ shown: 0, total: 1 })
  })

  it('a character set past its slot is clipped', () => {
    const { file, t, u } = citing([[0, han(4)], [1, 1], [0, han(30)]])
    // the first line's last item set from 6 past the slot's right (half an em at size 10 is 5)
    const right = u.lines[0]!.x1
    const pushed = edited(u, (items, i) => (i === 0 ? items.map((it, q) => (q === items.length - 1 ? { ...it, x: right + 6 } : it)) : items))
    const last = u.lines[0]!.items.at(-1)!
    expect(checkPage(file, 1, [pushed], mapOf([1, t])).clipped).toBe(last.kind === 'crop' ? 1 : [...(last.text ?? '')].filter(c => /\S/.test(c)).length)
  })
})
