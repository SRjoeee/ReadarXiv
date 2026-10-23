// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { type CompactItems, itemsOf, NO_ITEMS, nameSeg, segsOfUnit, TEXT_ITEMS_MAX, TEXT_WORK_MAX, type TextSeg, textLayerOf } from '@/pdf-reader/engine/layer-proto/textlayer.mjs'

// The text layer of a laid page (src/pdf-reader/engine/layer-proto/textlayer.mjs; docs/PDF-READER.md §11.11) on synthetic pages:
// what the drawing's operations erase is dropped and what they leave is kept, by the item's centre (TL1-TL4); a crop's items are
// moved with it, its plain text stands in where it has none, one cut from another page takes that page's (TL5-TL7); a drawn
// unit's lines are translated items at their drawn boxes (TL8); the reading order is the stream's, a drawn thing's block where it
// first erased, its inner kept items inside it, one that erased nothing placed by geometry (TL9-TL11); the bounds (TL12, TL16);
// the compact items and the segments (TL14, TL15); the breaks between sources (TL17)

/** a page 612 x 792 at 2 device pixels a unit, y down */
const dev = (x: number, y: number): [number, number] => [2 * x, 2 * (792 - y)]
const VIEW = [0, 0, 612, 792]
/** a device-pixel rectangle [x, y, w, h] over a PDF box */
const devBox = (x0: number, y0: number, x1: number, y1: number) => { const [a, b] = dev(x0, y1), [c, d] = dev(x1, y0); return [a, b, c - a, d - b] }
const erase = (x0: number, y0: number, x1: number, y1: number) => ({ op: 'erase', box: devBox(x0, y0, x1, y1) })
/** a PDF.js text item at baseline y, size 10 */
const item = (str: string, x: number, y: number, w: number, o: Record<string, unknown> = {}) => ({ str, width: w, height: 10, transform: [10, 0, 0, 10, x, y], dir: 'ltr', fontName: 'f', hasEOL: false, ...o })
const P = (items: ReturnType<typeof item>[], n = 1) => ({ n, items: itemsOf({ items, styles: { f: { ascent: 0.8 } } }), view: VIEW })
/** a translated line segment over [x0, x1] on baseline y */
const seg = (str: string, x0: number, x1: number, y: number, size = 10, line: [number, number] = [x0, x1]): TextSeg => ({ str, x: x0, y: y - 0.22 * size, w: x1 - x0, h: 0.97 * size, base: y, size, lx0: line[0], lx1: line[1] })
const strs = (d: { items: { str: string }[] }) => d.items.map(i => i.str)

describe('ownership: the operations decide, at the item\'s centre', () => {
  it('TL1 an item inside an erase rectangle is dropped, one outside it kept', () => {
    const page = P([item('kept', 100, 700, 30), item('gone', 100, 650, 30)])
    const d = textLayerOf(page, { ops: [erase(90, 640, 300, 665)], devOf: dev, owners: [[0, 1, 'u1']] }, [{ key: 'u1', unit: 1, segs: [seg('le texte', 100, 160, 650)] }])
    expect(d.items.map(i => [i.str, i.from])).toEqual([['kept', 'kept'], ['le texte', 'translated']])
    expect(d.stats).toMatchObject({ kept: 1, dropped: 1, translated: 1 })
    expect(d.page).toEqual({ w: 612, h: 792 })
  })
  it('TL2 an item straddling an erase rectangle\'s edge goes by its centre', () => {
    // (centre at baseline + 0.3 em: 703; a rectangle to 704 holds it, one to 702 does not)
    const a = textLayerOf(P([item('x', 100, 700, 30)]), { ops: [erase(90, 695, 300, 704)], devOf: dev, owners: [] }, [])
    const b = textLayerOf(P([item('x', 100, 700, 30)]), { ops: [erase(90, 695, 300, 702)], devOf: dev, owners: [] }, [])
    expect(a.items).toEqual([])
    expect(b.items.map(i => i.from)).toEqual(['kept'])
  })
  it('TL3 a restore puts an erased item back, within its clip only; a later erase takes it again', () => {
    const it0 = item('x', 100, 700, 30)
    const restore = (clipTo: number) => ({ op: 'restore', page: 1, clip: [devBox(90, 690, clipTo, 710)], boxes: [devBox(95, 695, 140, 710)] })
    const run = (ops: unknown[]) => textLayerOf(P([it0]), { ops, devOf: dev, owners: [] }, []).items.length
    expect(run([erase(90, 690, 300, 710), restore(300)])).toBe(1)
    expect(run([erase(90, 690, 300, 710), restore(100)])).toBe(0)
    expect(run([erase(90, 690, 300, 710), restore(300), erase(90, 690, 300, 710)])).toBe(0)
  })
  it('TL4 a paper fill and a swap erase as an erase does; a crop erases nothing', () => {
    const run = (op: unknown) => textLayerOf(P([item('x', 100, 700, 30)]), { ops: [op], devOf: dev, owners: [] }, []).items.length
    expect(run({ op: 'paper', rects: [devBox(90, 690, 300, 710)] })).toBe(0)
    expect(run({ op: 'swap', page: 1, rects: [devBox(90, 690, 300, 710)] })).toBe(0)
    expect(run({ op: 'crop', page: 1, src: devBox(90, 690, 300, 710), dst: devBox(90, 690, 300, 710) })).toBe(1)
  })
  it('TL13 a page nothing is drawn on keeps every item, in the stream\'s order', () => {
    const d = textLayerOf(P([item('b', 100, 600, 10), item('a', 100, 700, 10)]), { ops: [], devOf: dev, owners: [] }, [])
    expect(d.items.map(i => [i.str, i.from])).toEqual([['b', 'kept'], ['a', 'kept']])
    expect(textLayerOf({ n: 1, items: NO_ITEMS, view: VIEW }, { ops: [], devOf: dev, owners: [] }, []).items).toEqual([])
  })
})

describe('crops: the formula\'s text where it is drawn', () => {
  const crop = (page: number, src: [number, number, number, number], dst: [number, number, number, number], text = '') => ({ crop: { page, src, dst, text }, space: false })
  it('TL5 an erased item under a crop\'s source is moved by the crop\'s map, at its place in its line; one not erased stays', () => {
    // the formula "f(x)" at [300, 698]-[340, 712] erased, drawn at 120 on baseline 650 at half again its size
    const page = P([item('f(x)', 300, 700, 40), item('keep', 300, 500, 40), item('para', 100, 700, 150)])
    const d = textLayerOf(page, { ops: [erase(90, 690, 400, 712)], devOf: dev, owners: [[0, 1, 'u7']] }, [{ key: 'u7', unit: 7, segs: [seg('vor ', 100, 120, 650), crop(1, [298, 697, 342, 713], [120, 647, 186, 671]), seg('nach', 190, 230, 650)] }])
    // (a space after the formula, which stands apart from the word after it)
    expect(d.items.map(i => [i.str, i.from])).toEqual([['vor ', 'translated'], ['f(x) ', 'moved'], ['nach', 'translated'], ['keep', 'kept']])
    const f = d.items[1]!
    expect(f.unit).toBe(7)
    // (x: 120 + (300 - 298) x 1.5; its baseline 647 + (700 - 697) x 1.5; its size and width x 1.5)
    expect([f.x, f.base, f.w, f.fontSize].map(v => Math.round(v * 100) / 100)).toEqual([123, 651.5, 60, 15])
    expect(d.stats).toMatchObject({ moved: 1, dropped: 1, kept: 1 })
    // (an item under the source that the drawing leaves is kept where it stands, not moved: "keep" is outside the erase)
    const e = textLayerOf(page, { ops: [erase(90, 690, 299, 712)], devOf: dev, owners: [[0, 1, 'u7']] }, [{ key: 'u7', unit: 7, segs: [crop(1, [298, 697, 342, 713], [120, 647, 186, 671])] }])
    expect(e.items.filter(i => i.str === 'f(x)').map(i => i.from)).toEqual(['kept'])
  })
  it('TL6 a crop with no item under its source carries its plain text over its drawn box', () => {
    const d = textLayerOf(P([item('para', 100, 700, 150)]), { ops: [erase(90, 690, 400, 712)], devOf: dev, owners: [[0, 1, 'u7']] }, [{ key: 'u7', unit: 7, segs: [crop(1, [400, 500, 420, 520], [120, 640, 140, 660], 'α+β'), seg('x', 150, 160, 650)] }])
    // (a space between the formula and the word it stands apart from on its line)
    expect(d.items.map(i => [i.str, i.from, i.x, i.y, i.w, i.h])).toEqual([['α+β ', 'moved', 120, 640, 20, 20], ['x', 'translated', 150, 650 - 2.2, 10, 9.7]])
    // (and none where it has no plain text either)
    const e = textLayerOf(P([item('para', 100, 700, 150)]), { ops: [erase(90, 690, 400, 712)], devOf: dev, owners: [[0, 1, 'u7']] }, [{ key: 'u7', unit: 7, segs: [crop(1, [400, 500, 420, 520], [120, 640, 140, 660])] }])
    expect(e.items).toEqual([])
  })
  it('TL7 a crop cut from another page takes that page\'s items under its source; a crop\'s space is kept after its text', () => {
    const other: CompactItems = itemsOf({ items: [item('g', 50, 100, 10), item('far', 300, 300, 10)] })
    const d = textLayerOf(P([item('para', 100, 700, 150)]), { ops: [erase(90, 690, 400, 712)], devOf: dev, owners: [[0, 1, 'u7']] }, [{ key: 'u7', unit: 7, segs: [{ ...crop(2, [45, 95, 65, 115], [120, 645, 140, 665]), space: true }, seg('y', 150, 160, 650)] }], { sourceOf: p => (p === 2 ? other : null) })
    expect(d.items.map(i => [i.str, i.from])).toEqual([['g ', 'moved'], ['y', 'translated']])
  })
})

describe('reading order and the breaks a copy reads', () => {
  it('TL8 a unit\'s lines are translated items at their drawn boxes, its id on each, in the unit\'s order', () => {
    const d = textLayerOf(P([item('a', 100, 700, 10)]), { ops: [erase(90, 640, 300, 712)], devOf: dev, owners: [[0, 1, 'u3']] }, [{ key: 'u3', unit: 3, segs: [seg('eins ', 100, 200, 700), seg('zwei', 100, 150, 688)] }])
    expect(d.items.map(i => [i.str, i.unit, i.x, i.w, i.base])).toEqual([['eins ', 3, 100, 100, 700], ['zwei', 3, 100, 50, 688]])
    expect(d.items.map(i => i.eol ?? false)).toEqual([false, true])
  })
  it('TL9 a heading number, its translated heading, a translated paragraph and a reference come in the stream\'s order', () => {
    // the stream: "3" (kept), "Method" (unit 1), "We do..." (unit 2, two lines), "[4] Ref" (kept)
    const page = P([item('3', 72, 700, 8), item('Method', 90, 700, 40), item('We do', 72, 680, 200), item('it.', 72, 668, 20), item('[4] Ref', 72, 600, 60)])
    const ops = [erase(85, 695, 300, 712), erase(70, 664, 300, 690)]
    const d = textLayerOf(page, { ops, devOf: dev, owners: [[0, 1, 'u1'], [1, 2, 'u2']] }, [
      // (painted in another order than the stream's: the order is the stream's)
      { key: 'u2', unit: 2, segs: [seg('Wir tun ', 72, 250, 680), seg('es.', 72, 90, 668)] },
      { key: 'u1', unit: 1, segs: [seg('Methode', 90, 140, 700)] },
    ])
    expect(strs(d)).toEqual(['3 ', 'Methode', 'Wir tun ', 'es.', '[4] Ref'])
    // (a line's end after each block and between the sources on two lines; a space where the number stands apart from its heading)
    expect(d.items.map(i => i.eol ?? false)).toEqual([false, true, false, true, false])
  })
  it('TL10 a kept item the stream sets between two items of one unit goes inside its block, before its first line below it', () => {
    // a displayed formula kept between the paragraph's lines, its two items in one line
    const page = P([item('before', 72, 700, 200), item('E = mc', 150, 680, 40), item('2', 190, 684, 4), item('after', 72, 660, 200)])
    const ops = [erase(70, 695, 300, 712), erase(70, 655, 300, 672)]
    // (the paragraph's last line short, left of the formula: its line's slot spans the column)
    const d = textLayerOf(page, { ops, devOf: dev, owners: [[0, 2, 'u5']] }, [{ key: 'u5', unit: 5, segs: [seg('avant ', 72, 250, 700, 10, [72, 300]), seg('après', 72, 120, 660, 10, [72, 300])] }])
    expect(strs(d)).toEqual(['avant ', 'E = mc', '2', 'après'])
    // (a kept item in another column, beside the unit's lines, is not taken among them: it goes after them)
    const far = P([item('before', 72, 700, 200), item('float', 320, 680, 40), item('after', 72, 660, 200)])
    expect(strs(textLayerOf(far, { ops, devOf: dev, owners: [[0, 2, 'u5']] }, [{ key: 'u5', unit: 5, segs: [seg('avant ', 72, 250, 700, 10, [72, 300]), seg('après', 72, 120, 660, 10, [72, 300])] }]))).toEqual(['avant ', 'après', 'float'])
    expect(d.items.map(i => i.from)).toEqual(['translated', 'kept', 'kept', 'translated'])
  })
  it('TL11 a drawn thing that erased nothing goes before the first entry after it, by geometry', () => {
    const page = P([item('top', 72, 750, 30), item('bottom', 240, 100, 300)])
    const d = textLayerOf(page, { ops: [], devOf: dev, owners: [] }, [{ key: 'n1', segs: [nameSeg('Résumé', 250, 60, 400, 12)] }])
    expect(strs(d)).toEqual(['top', 'Résumé', 'bottom'])
    expect(d.items[1]!.unit).toBeUndefined()
  })
  it('TL17 between two sources: a space where they stand apart on one line, a line\'s end where they stand on two', () => {
    const page = P([item('Theorem 1.', 72, 700, 50), item('Let x', 130, 700, 100)])
    const d = textLayerOf(page, { ops: [erase(128, 695, 300, 712)], devOf: dev, owners: [[0, 1, 'u1']] }, [{ key: 'u1', unit: 1, segs: [seg('Soit x', 130, 220, 700)] }])
    expect(strs(d)).toEqual(['Theorem 1. ', 'Soit x'])
    expect(d.items[0]!.eol).toBeUndefined()
  })
})

describe('bounds', () => {
  it('TL12 past the work budget the remaining items are kept', () => {
    // every operation over one cell: each item tests all of them
    const n = 1500, ops = Array.from({ length: n }, () => erase(90, 690, 120, 712))
    const items = Array.from({ length: Math.ceil(TEXT_WORK_MAX / n) + 50 }, () => item('x', 100, 700, 10))
    const d = textLayerOf(P(items), { ops, devOf: dev, owners: [] }, [])
    expect(d.stats.dropped).toBe(Math.floor(TEXT_WORK_MAX / n))
    expect(d.stats.kept).toBe(items.length - d.stats.dropped)
  })
  it('TL16 past TEXT_ITEMS_MAX the neighbouring items of a line are merged', () => {
    // (each two letters apart by 0.4 em: no run, each its own item until the bound)
    const items = Array.from({ length: TEXT_ITEMS_MAX + 400 }, (_, k) => item('ab', 72 + (k % 40) * 14, 780 - Math.floor(k / 40) * 12, 10))
    const d = textLayerOf(P(items), { ops: [], devOf: dev, owners: [] }, [])
    expect(d.items.length).toBeLessThanOrEqual(TEXT_ITEMS_MAX)
    expect(d.stats.merged).toBeGreaterThan(0)
    expect(d.items[0]!.str).toBe('ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab ab')
  })
})

describe('runs', () => {
  it('TL18 the page\'s items that abut on one baseline at one size are one item; a subscript, a gap, a line\'s end begin another', () => {
    const page = P([item('Let ', 72, 700, 18), item('x', 90, 700, 5), item('=', 95.5, 700, 6), item('i', 101.5, 697, 2, { height: 7, transform: [7, 0, 0, 7, 101.5, 697] }), item('far', 140, 700, 15), item('end', 155, 700, 15, { hasEOL: true }), item('next', 170, 700, 20)])
    const d = textLayerOf(page, { ops: [], devOf: dev, owners: [] }, [])
    expect(strs(d)).toEqual(['Let x=', 'i', 'farend', 'next'])
    const first = d.items[0]!
    expect([first.x, first.w]).toEqual([72, 29.5])
    expect(d.stats.merged).toBe(3)
    expect(d.items[2]!.eol).toBe(true)
  })
})

describe('the inputs', () => {
  it('TL14 the compact items: upright text alone, a line\'s end from an empty item after it, the font\'s ascent where told', () => {
    const c = itemsOf({
      items: [item('a', 10, 20, 5), { str: '', hasEOL: true }, item('rot', 10, 20, 5, { transform: [0, 10, -10, 0, 10, 20] }), item('mirror', 1, 1, 5, { transform: [-10, 0, 0, 10, 1, 1] }), item('v', 1, 1, 5, { dir: 'ttb' }), item('r', 30, 20, 5, { dir: 'rtl', fontName: 'g', hasEOL: true }), { type: 'beginMarkedContent' }],
      styles: { f: { ascent: 0.7 } },
    })
    expect(c.str).toEqual(['a', 'r'])
    expect(Array.from(c.num)).toEqual([10, 20, 5, 10, Math.fround(0.7), 1, 30, 20, 5, 10, Math.fround(0.8), 3])
    expect(itemsOf(null).n).toBe(0)
  })
  it('TL15 a unit\'s lines as segments: split at a crop and where the script changes, a copy\'s spaces, a crop\'s space after it', () => {
    const face = { size: 1 }
    const tok = (s: string, x: number, w: number, o: Record<string, unknown> = {}) => ({ x, w, t: { s, cls: 'latin', face, ...o } })
    const sp = (x: number) => ({ x, w: 3, t: { space: true } })
    const L = {
      f: 10, scale: 1,
      lines: [
        { page: 1, baseline: 700, items: [tok('one', 72, 20), sp(92), { x: 95, w: 30, t: { crop: { page: 1, crop: [300, 695, 330, 710], baseline: 698, text: 'x+y' } } }, sp(125), tok('two', 128, 20)] },
        { page: 1, baseline: 688, items: [tok('\u6570\u5b66', 72, 20, { cls: 'cjk' }), tok('ab', 92, 10), tok('hy-', 102, 20, { hyphenated: true })] },
        { page: 2, baseline: 700, items: [tok('elsewhere', 72, 50)] },
      ],
    } as never
    const segs = segsOfUnit(L, 1)
    expect(segs.map(s => ('crop' in s ? `[${s.crop.text}${s.space ? ' ' : ''}]` : s.str))).toEqual(['one ', '[x+y ]', 'two ', '\u6570\u5b66', 'abhy-'])
    const c = segs[1] as { crop: { dst: number[]; src: number[] } }
    // (its drawn box: from the item's x over its width, from the line's baseline by the crop's offsets from its own)
    expect(c.crop.dst).toEqual([95, 697, 125, 712])
    expect(c.crop.src).toEqual([300, 695, 330, 710])
    expect(segsOfUnit(L, 1, () => false).some(s => 'crop' in s)).toBe(false)
    const first = segs[0] as TextSeg
    expect([first.x, first.w, first.base, first.size]).toEqual([72, 20, 700, 10])
  })
})
