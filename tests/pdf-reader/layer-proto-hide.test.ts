import { describe, expect, it } from 'vitest'
import { CLIP_PAD, unitHiding } from '@/pdf-reader/engine/layer-proto/hide.mjs'
import { PH_FLAG } from '@/pdf-reader/engine/layout/file.mjs'

// What a drawn unit hides on a page and what of its own ink it shows again (layer-proto/hide.mjs, docs/PDF-READER.md §11.8): its
// text group always, its placeholders' group where one of them is not kept where it stands (its kept ones and its displays then
// pasted from render B), its label's where it draws the label anew (a label merged into its text, no group of its own, pasted
// from render C where kept), the babel name it leads, and its kept lines and characters pasted from render C.

const P = CLIP_PAD
const grown = (b: number[]) => [b[0]! - P, b[1]! - P, b[2]! + P, b[3]! + P]
/** a unit of two lines on page 1: line 0 at y 700, line 1 at y 680, each its erase box; `ph` its placeholders' rows, `labels` its
 *  labels (stride 7: …, page, x0, …, x1, top, bottom) */
const unit = ({ ph = new Map(), labels = [] as number[] } = {}) => ({ erase: [[100, 698, 300, 710], [100, 678, 300, 690]], ph, labels })
const lines = { rects: [[1, 100, 698, 300, 710], [1, 100, 678, 300, 690]], jOf: [0, 1], lineOf: new Map() }
/** a reading: its resolutions by piece, the lines it keeps (`keep`), its characters (`uc`, `cat`) and its label */
const reading = (o: { res?: [number, { mode: string; k: number }][]; keep?: string[]; uc?: unknown[]; cat?: [string, string][]; label?: unknown } = {}) =>
  Object.assign(new Map(o.res ?? []), { keep: o.keep ?? [], uc: o.uc ?? [], cat: new Map(o.cat ?? []), label: o.label ?? null })
const hide = (o: Parameters<typeof unitHiding>[0] extends infer T ? Partial<T> : never) => unitHiding({ page: 1, id: 5, lu: unit() as never, kOf: [], lines: lines as never, prep: reading() as never, ...o } as never)

describe('unitHiding', () => {
  it('hides its text group and its lines\' erase boxes, and nothing else, where its reading keeps nothing', () => {
    const h = hide({})
    expect(h.off).toEqual(['u5'])
    expect(h.hidden).toEqual([[100, 698, 300, 710], [100, 678, 300, 690]])
    expect([h.fromB, h.fromC]).toEqual([[], []])
  })

  it('a kept line: shown again from render C through its erase box, not counted hidden', () => {
    const h = hide({ prep: reading({ keep: ['1|100,678,300,690'] }) as never })
    expect(h.hidden).toEqual([[100, 698, 300, 710]])
    expect(h.fromC).toEqual([grown([100, 678, 300, 690])])
  })

  it('its placeholders\' group hidden where one is drawn elsewhere: its kept one and its display pasted from B; all kept: the group shown', () => {
    // (rows: k 0 a citation drawn as text, k 1 a citation kept where it stands, k 2 a display; each one segment on page 1)
    const row = (kind: string, x: number) => ({ kind, flags: 0, segs: [1, x, 700, x + 10, 708, 698] })
    const ph = new Map<number, unknown>([[0, row('cite', 120)], [1, row('cite', 140)], [2, row('display', 160)]])
    const kOf = [0, 1, 2]
    const moved = hide({ lu: unit({ ph }) as never, kOf, prep: reading({ res: [[0, { mode: 'text', k: 0 }], [1, { mode: 'kept', k: 1 }]] }) as never })
    expect(moved.off).toEqual(['u5', 'u5.p'])
    expect(moved.fromB).toEqual([grown([140, 698, 150, 708]), grown([160, 698, 170, 708])])
    expect(moved.hidden).toContainEqual([120, 698, 130, 708])
    const kept = hide({ lu: unit({ ph }) as never, kOf, prep: reading({ res: [[0, { mode: 'kept', k: 0 }], [1, { mode: 'kept', k: 1 }]] }) as never })
    expect(kept.off).toEqual(['u5'])
    expect(kept.fromB).toEqual([])
    // (a row LOST or EMPTY has no ink to hide or show: it moves nothing)
    const lost = new Map<number, unknown>([[0, { kind: 'cite', flags: PH_FLAG.LOST, segs: [1, 120, 700, 130, 708, 698] }]])
    expect(hide({ lu: unit({ ph: lost }) as never, kOf: [0], prep: reading({ res: [[0, { mode: 'text', k: 0 }]] }) as never }).off).toEqual(['u5'])
  })

  it('its label: hidden with its group where drawn anew; merged into its text (no group of its own), pasted from C where kept', () => {
    const labels = [0, 1, 80, 0, 95, 710, 698]
    const drawn = hide({ lu: unit({ labels }) as never, prep: reading({ label: { drawn: true, chars: [] } }) as never })
    expect(drawn.off).toEqual(['u5', 'u5.l'])
    expect(drawn.hidden).toContainEqual([80, 698, 95, 710])
    const merged = hide({ lu: unit({ labels }) as never, prep: reading({ label: { drawn: false, chars: [] } }) as never, has: () => false })
    expect(merged.off).toEqual(['u5'])
    expect(merged.fromC).toEqual([grown([80, 698, 95, 710])])
    // (kept with a group of its own: neither hidden nor pasted, the group shown)
    const own = hide({ lu: unit({ labels }) as never, prep: reading({ label: { drawn: false, chars: [] } }) as never, has: () => true })
    expect([own.off, own.fromC]).toEqual([['u5'], []])
  })

  it('the babel name it leads hidden with it; its kept and orphan characters pasted from C, a label it redraws not', () => {
    const named = hide({ nm: { occurrence: 3, x0: 60, x1: 90, bottom: 698, top: 710 } as never })
    expect(named.off).toEqual(['u5', 'n3'])
    expect(named.hidden).toContainEqual([60, 698, 90, 710])
    const ch = (k: number, x: number) => ({ page: 1, item: 0, k, ch: 'x', x0: x, x1: x + 5, yb: 700, size: 10, rect: [1, 100, 698, 300, 710] })
    const uc = [ch(0, 110), ch(1, 120), ch(2, 130), ch(3, 140)]
    const prep = reading({ uc, cat: [['1|0|0', 'keep'], ['1|0|1', 'orphan'], ['1|0|2', 'acc'], ['1|0|3', 'keep']], label: { drawn: true, chars: [{ page: 1, item: 0, k: 3 }] } })
    const h = hide({ prep: prep as never })
    // (a kept character and an orphan, each its box from 0.22 of its size under the baseline to 0.78 over; the accounted one and
    // the kept one of the label drawn anew not)
    expect(h.fromC).toEqual([grown([110, 700 - 2.2, 115, 700 + 7.8]), grown([120, 700 - 2.2, 125, 700 + 7.8])])
  })
})
