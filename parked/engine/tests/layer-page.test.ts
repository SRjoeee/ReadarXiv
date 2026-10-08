import { describe, expect, it } from 'vitest'
import { type FitState, type Laid, type LaidUnit, type LayerInput, layUnit, type Tr } from '@/pdf-reader/engine/layer/fit.mjs'
import { bodyUnits, EVEN_KINDS, evenOf } from '@/pdf-reader/engine/layer/page.mjs'
import type { TrPiece } from '@/pdf-reader/engine/layer/pieces.mjs'
import { layerRulesFor } from '@/pdf-reader/engine/rules/layer-rules.mjs'
import type { LayoutIndex } from '@/pdf-reader/engine/layout/file.mjs'
import { column, han, inputOf, layoutOf, type UnitDef, words } from './helpers/layer-layout'

// Page-even: a page's body units (paragraphs, the abstract, theorems whose frames all lie on the page) set at one size,
// the smallest any of them took, never at one leading; laid again once, from that size. Headings, captions, footnotes,
// cells and a unit on two pages keep their own fit. Layouts are written in the tests; the measure is the fake one

const laid = (r: Laid): LaidUnit => {
  if (!r.fit) throw new Error(`unfit: ${r.why}`)
  return r
}
const tr = (text: string): Tr => ({ pieces: [[0, text]] as TrPiece[], sentences: null })
/** a laid unit at a state, for evenOf alone */
const at = (scale: number, lead: number, id = 1): LaidUnit => ({
  id, fit: true, size: 10 * scale, lines: [], cuts: [], drawn: new Map(),
  state: { scale, lead, track: 0, letter: 0, compress: 0, borrow: 0, knob: 'none' } satisfies FitState,
})
/** one frame of nine lines 400 wide from `top`, nothing below it */
const nine = (id: number, top: number, kind: UnitDef['kind'] = 'para', page = 1): UnitDef => ({ id, kind, lines: column(9, { top, page }), frames: [{ lines: 9, page }] })

/** what the reader's page does (Task 11's entry): every unit at its own fit, then the body units above the page's even
 *  setting laid again from it, once; one that comes back unfit keeps its first fit */
function evenPage(file: LayoutIndex, page: number, input: LayerInput, trs: ReadonlyMap<number, Tr>) {
  const first = new Map<number, Laid>()
  for (const id of file.onPage(page)) first.set(id, layUnit(input, id, trs.get(id)!))
  const body = bodyUnits(file, page).map(id => first.get(id)!).filter((r): r is LaidUnit => r.fit)
  const even = evenOf(body, input.rules)
  const out = new Map(first)
  if (even) {
    for (const u of body) {
      if (!(u.state.scale > even.maxScale + 1e-9)) continue
      const again = layUnit(input, u.id, trs.get(u.id)!, even)
      if (again.fit) out.set(u.id, again)
    }
  }
  return { first, out, even }
}

describe('page-even', () => {
  it("body units are the page's paragraphs whose frames all lie on it", () => {
    expect(EVEN_KINDS).toEqual(['para', 'abstract', 'theorem'])
    const file = layoutOf([
      nine(1, 700), nine(2, 600, 'abstract'), nine(3, 500, 'theorem'), nine(4, 400, 'heading'), nine(5, 300, 'caption'),
      nine(6, 200, 'footnote'), nine(7, 150, 'cell'),
      // a paragraph from the foot of page 1 onto page 2
      { id: 8, lines: [...column(3, { top: 120 }), ...column(4, { top: 700, page: 2 })], frames: [{ lines: 3, below: 0 }, { page: 2, lines: 4, share: 400 }] },
      nine(9, 600, 'para', 2),
    ])
    expect(bodyUnits(file, 1)).toEqual([1, 2, 3])
    expect(bodyUnits(file, 2)).toEqual([9])
  })

  it('evenOf: the smallest scale and never the leading; null in unit mode and when every unit is at it', () => {
    const zh = layerRulesFor('zh'), de = layerRulesFor('de')
    // every script evens the size alone (fix 4)
    for (const t of ['zh', 'zh-TW', 'ja', 'ko', 'de', 'ru']) expect(layerRulesFor(t).even, t).toBe('size')
    expect(evenOf([at(1, 1.3), at(0.95, 1), at(1, 1.1)], zh)).toEqual({ maxScale: 0.95 })
    expect(evenOf([at(1, 1), at(0.9, 0.95)], de)).toEqual({ maxScale: 0.9 })
    // one unit that needed a tighter leading at full size: nothing to lay again (the leading was evened before fix 4)
    expect(evenOf([at(1, 1.3), at(1, 1), at(1, 1.15)], zh)).toBeNull()
    // nothing to lay again
    expect(evenOf([at(1, 1.3), at(0.95, 1)], { ...zh, even: 'unit' })).toBeNull()
    expect(evenOf([at(0.95, 1), at(0.95, 1.3)], zh)).toBeNull()
    expect(evenOf([at(0.9, 1), at(0.9, 0.95)], de)).toBeNull()
    expect(evenOf([], zh)).toBeNull()
  })

  it("one paragraph that needs a tight leading leaves the page's other paragraphs at their own (fix 4)", () => {
    // zh: three paragraphs of nine lines at full size, the middle one set at a leading of 1.1, the others at their 1.3
    const file = layoutOf([nine(1, 700), nine(2, 580), nine(3, 460)])
    const input = inputOf(file, 'zh')
    const trs = new Map([[1, tr(han(250))], [2, tr(han(314))], [3, tr(han(250))]])
    const { first, out, even } = evenPage(file, 1, input, trs)
    expect([1, 2, 3].map(id => laid(first.get(id)!).state.lead)).toEqual([1.3, 1.1, 1.3])
    expect([1, 2, 3].map(id => laid(first.get(id)!).state.scale)).toEqual([1, 1, 1])
    expect(even).toBeNull()
    for (const id of [1, 2, 3]) expect(out.get(id), `unit ${id}`).toBe(first.get(id))
  })

  it('evened once: re-laying with evenOf\'s setting changes only the units above it, and evenOf of the result is null', () => {
    // zh: one unit at its natural fit, one set by leading (1.1), one below full size; then de, which evens the size alone
    const cases = [
      { target: 'zh', texts: [han(250), han(314), han(392)] },
      { target: 'de', texts: [words(60), words(110), words(150)] },
    ]
    for (const { target, texts } of cases) {
      const file = layoutOf([nine(1, 700), nine(2, 580), nine(3, 460)])
      const input = inputOf(file, target)
      const trs = new Map(texts.map((t, i) => [i + 1, tr(t)]))
      const { first, out, even } = evenPage(file, 1, input, trs)
      const before = [1, 2, 3].map(id => laid(first.get(id)!))
      const least = Math.min(...before.map(u => u.state.scale))
      expect(least, target).toBeLessThan(1)
      expect(even, target).toEqual({ maxScale: least })
      for (const u of before) {
        const after = laid(out.get(u.id)!)
        if (!(u.state.scale > even!.maxScale)) { expect(after, `${target} ${u.id}`).toBe(u); continue }
        // at the page's size, from the rules' own leading on down as far as it needs ('even' where it needs nothing more)
        expect(after.state.scale, `${target} ${u.id}`).toBe(even!.maxScale)
        expect(['even', 'track', 'borrow', 'lead'], `${target} ${u.id}`).toContain(after.state.knob)
        for (const l of after.lines) expect(l.size).toBeCloseTo(10 * even!.maxScale, 9)
        // the same text, all of it
        expect(after.lines.flatMap(l => l.items.map(it => it.text)).join(target === 'zh' ? '' : ' ')).toBe(texts[u.id - 1])
      }
      expect(evenOf([1, 2, 3].map(id => laid(out.get(id)!)), input.rules), target).toBeNull()
    }
  })

  it('a heading, a caption, a footnote and a cell are never evened; a unit on two pages keeps its own fit', () => {
    const file = layoutOf([
      nine(1, 700),
      nine(2, 640, 'heading'),
      nine(3, 580),
      nine(4, 520, 'caption'),
      nine(5, 460, 'footnote'),
      nine(6, 400, 'cell'),
      { id: 7, lines: [...column(9, { top: 300 }), ...column(9, { top: 700, page: 2 })], frames: [{ lines: 9 }, { page: 2, lines: 9, share: 500 }] },
    ])
    const input = inputOf(file, 'zh')
    // the paragraphs: one at its natural fit, one below full size (0.95); the others at their own, a caption smaller still
    const trs = new Map<number, Tr>([
      [1, tr(han(200))], [2, tr(han(330))], [3, tr(han(392))], [4, tr(han(430))], [5, tr(han(250))], [6, tr(han(300))], [7, tr(han(500))],
    ])
    const { first, out, even } = evenPage(file, 1, input, trs)
    expect(laid(first.get(4)!).state.scale).toBeLessThan(laid(first.get(3)!).state.scale)
    // the setting is the paragraphs' alone: the caption's smaller size is not the page's
    expect(even).toEqual({ maxScale: laid(first.get(3)!).state.scale })
    expect(laid(out.get(1)!).state).toEqual(expect.objectContaining({ scale: even!.maxScale, lead: 1.3, knob: 'even' }))
    for (const id of [2, 4, 5, 6, 7]) expect(out.get(id), `unit ${id}`).toBe(first.get(id))
    expect(laid(out.get(7)!).state.scale).toBe(1)
  })
})
