// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { annotationsOf, erasedOf as gateErased, glyphPointsOf } from '../../lab/pdf/spikes/layer-gate/links.mjs'
import { type Annot, annotsOf, charPoints, copyLinks, erasedOf, freezeLinks, inPlaceOf, MAX_GLYPHS, MAX_LINKS, ownerOf, pointsOf, readAnnots, type Unsupported, WORK_MAX } from '@/pdf-reader/engine/layer-proto/links.mjs'

// The links of a laid page (src/pdf-reader/engine/layer-proto/links.mjs; PR 3a-1, the 3a design §3.1 to §3.6): the annotations a
// page keeps, which a reader carries (LK11) and which it does not, the owner of an annotation, what the page's operations leave
// erased (LK9), and the records of a page that is final: a link over text that stays is left where it stands (LK7), one over
// erased text that nothing matched is dropped (LK8), the list is ranked, and a copy is a copy (LK12). The engine and the gate's
// instrument (lab/pdf/spikes/layer-gate/links.mjs) read one rule for glyph points and for what a reader carries: asserted here

/** a PDF.js Link annotation */
const raw = (o: Record<string, unknown> = {}) => ({ subtype: 'Link', rect: [100, 695, 130, 710], dest: 'cite.a', borderStyle: { width: 1, style: 1 }, color: new Uint8ClampedArray([0, 255, 0]), overlaidText: '12', ...o })
/** a text item of equal advance: PDF.js's { str, width, transform } */
const item = (str: string, x: number, y: number, w: number, size = 10) => ({ str, width: w, transform: [size, 0, 0, size, x, y] })
/** the page at 2 pixels a unit, y down from 792 */
const dev = (x: number, y: number): [number, number] => [2 * x, 2 * (792 - y)]
/** an erase operation over a PDF box, in the device pixels of `dev` */
const erase = (x0: number, y0: number, x1: number, y1: number) => { const [a, b] = dev(x0, y1), [c, d] = dev(x1, y0); return { op: 'erase', box: [a, b, c - a, d - b] } }
const kept = (list: readonly (Annot | Unsupported)[]) => list.filter((a): a is Annot => !a.unsupported)

describe('the glyph points: PDF.js\'s rule, the gate\'s instrument\'s', () => {
  const items = [item('12, 41', 100, 700, 60), item('', 0, 0, 5), item('x', 10, 10, 0), { str: 'bad', width: 10, transform: [Number.NaN, 0, 0, 10, 5, 5] }, item('ab', 200, 650, 20), { str: 'up', width: 20, transform: [0, 10, -10, 0, 50, 50] }]
  it('are each non-space character\'s advance centre on its baseline, in the item\'s direction, as the instrument reads them', () => {
    const mine = pointsOf(items), theirs = glyphPointsOf(items as never)
    expect(mine.ch).toEqual(theirs.map(p => p.ch))
    expect(mine.x).toEqual(theirs.map(p => p.x))
    expect(mine.y).toEqual(theirs.map(p => p.y))
    // ('12, 41' is six characters over 60: five are not white space, centred at 5, 15, 25, 45, 55 from the start)
    expect(pointsOf([item('12, 41', 100, 700, 60)]).x).toEqual([105, 115, 125, 145, 155])
    expect(pointsOf(null)).toEqual({ x: [], y: [], ch: [] })
  })
})

describe('the annotations a page keeps', () => {
  const pts = pointsOf([item('12, 41', 100, 700, 60)])
  it('keeps the Link subtype only, ranked in PDF.js\'s order among themselves, with the glyph points inside each', () => {
    const { list, total, unsupported } = annotsOf([raw(), { subtype: 'Widget', rect: [0, 0, 5, 5] }, raw({ dest: 'cite.b', rect: [140, 695, 160, 710] }), { subtype: 'Popup' }, raw({ dest: undefined, url: 'https://example.org/x', rect: [10, 10, 20, 20] })], pts)
    expect(list.map(a => a.i)).toEqual([0, 1, 2])
    expect([total, unsupported]).toEqual([3, 0])
    const [a, b, c] = kept(list)
    expect(a!.g.ch).toEqual(['1', '2', ','])
    expect(b!.g.ch).toEqual(['4', '1'])
    expect(c!.g.ch).toEqual([])
    expect([a!.dest, b!.dest, c!.dest, c!.url]).toEqual(['cite.a', 'cite.b', undefined, 'https://example.org/x'])
    expect(a!.boxes).toEqual([[100, 695, 130, 710]])
    expect(a!.ov).toBe('12')
    expect(a!.border).toEqual({ width: 1, rgb: [0, 255, 0], style: 'solid' })
  })

  it('LK11: carries no named action, no JavaScript with no url read out of it, no attachment, no url outside the allow-list, no unsafeUrl alone, no rectangle with no area; counts them', () => {
    const odd = [
      raw({ dest: undefined, action: 'NextPage' }),
      raw({ dest: undefined, url: undefined, unsafeUrl: 'javascript:alert(1)' }),
      raw({ dest: undefined, url: 'javascript:alert(1)' }),
      raw({ dest: undefined, url: 'ftp://example.org/x' }),
      raw({ dest: undefined, url: 'tel:+10000000' }),
      raw({ dest: undefined, url: 'data:text/html,<b>x</b>' }),
      raw({ dest: undefined, url: 'file:///etc/passwd' }),
      raw({ dest: undefined, attachment: { filename: 'x.pdf' } }),
      raw({ rect: [100, 695, 100, 710] }),
      raw({ rect: undefined }),
      raw({ dest: [] }),
      // (a url outside the allow-list is no link even where a destination is given: PDF.js's `url` wins)
      raw({ url: 'ftp://example.org/x' }),
      raw({ dest: undefined, url: 'mailto:someone@example.org' }),
      raw({ dest: [{ num: 12, gen: 0 }, { name: 'XYZ' }, 72, 700, 0] }),
    ]
    const { list, total, unsupported } = annotsOf(odd, pts)
    expect(list.map(a => !!a.unsupported)).toEqual([true, true, true, true, true, true, true, true, true, true, true, true, false, false])
    expect([total, unsupported]).toEqual([2, 12])
    expect(list.map(a => a.i)).toEqual(odd.map((_, i) => i))
    // (the gate's instrument counts the same)
    const gate = annotationsOf(odd as never)
    expect([gate.total, gate.unsupported]).toEqual([total, unsupported])
  })

  it('keeps a quad list as boxes (the quads\' bounds), a border only where it has a width and a colour, and its style', () => {
    const quads = new Float32Array([100, 710, 110, 710, 100, 695, 110, 695, 120, 710, 130, 710, 120, 695, 130, 695])
    const { list } = annotsOf([raw({ quadPoints: quads }), raw({ borderStyle: { width: 0, style: 1 } }), raw({ color: null }), raw({ borderStyle: { width: 2, style: 5 } }), raw({ borderStyle: { width: 2, style: 2 } }), raw({ quadPoints: new Float32Array([1, 2, 3]) })], pts)
    const [q, nowidth, nocolor, under, dashed, bad] = kept(list)
    expect(q!.boxes).toEqual([[100, 695, 110, 710], [120, 695, 130, 710]])
    // (the glyph points inside either quad: the "1" at 105; the "2" at 115 is between them, the "," at 125 inside the second)
    expect(q!.g.ch).toEqual(['1', ','])
    expect([nowidth!.border, nocolor!.border]).toEqual([null, null])
    expect([under!.border!.style, dashed!.border!.style]).toEqual(['underline', 'dashed'])
    // (quads that are not a list of eight-number quads are not read: the rectangle stands)
    expect(bad!.boxes).toEqual([[100, 695, 130, 710]])
    // (the instrument's boxes and borders are these)
    const gate = annotationsOf([raw({ quadPoints: quads }), raw({ borderStyle: { width: 2, style: 5 } }), raw({ quadPoints: new Float32Array([1, 2, 3]) })] as never).links
    expect(gate.map(a => a.boxes)).toEqual([q!.boxes, under!.boxes, bad!.boxes])
    expect(gate.map(a => a.border)).toEqual([q!.border, under!.border, bad!.border])
  })

  it('names a link by PDF.js\'s overlaid text, white space collapsed', () => {
    const { list } = annotsOf([raw({ overlaidText: '  12 \n  41  ' }), raw({ overlaidText: undefined })], pts)
    expect(kept(list).map(a => a.ov)).toEqual(['12 41', ''])
  })
})

describe('reading the annotations', () => {
  it('gives the list a page answers, and null for a call that throws or rejects, a page with no such call and a reply that is no list', async () => {
    const list = [raw()]
    expect(await readAnnots({ getAnnotations: async () => list })).toBe(list)
    expect(await readAnnots({ getAnnotations: () => list })).toBe(list)
    expect(await readAnnots({ getAnnotations: async () => { throw new Error('x') } })).toBeNull()
    expect(await readAnnots({ getAnnotations: () => { throw new Error('x') } })).toBeNull()
    expect(await readAnnots({ getAnnotations: () => Promise.reject(new Error('x')) })).toBeNull()
    expect(await readAnnots({})).toBeNull()
    expect(await readAnnots(null)).toBeNull()
    expect(await readAnnots({ getAnnotations: async () => ({}) })).toBeNull()
  })
})

describe('what the operations leave erased', () => {
  const ops = (...o: unknown[]) => o as never
  it('is what an erase, a paper or a swap covers, less what a restore puts back within its clip, in the operations\' order', () => {
    const e = erasedOf(ops(
      { op: 'erase', box: [0, 0, 10, 10] },
      { op: 'paper', rects: [[20, 0, 10, 10]] },
      { op: 'swap', page: 1, rects: [[40, 0, 10, 10]] },
      { op: 'crop', page: 1, src: [0, 0, 50, 50], dst: [60, 0, 10, 10] },
      { op: 'restore', page: 1, clip: [[0, 0, 8, 10]], boxes: [[0, 0, 5, 10], [20, 0, 10, 10]] },
    ))
    // (inside the erase, outside the restore's box: erased; inside both its box and its clip: put back; a box outside its clip stays erased; a crop erases nothing)
    expect([e(7, 5), e(2, 5), e(25, 5), e(45, 5), e(65, 5), e(100, 5)]).toEqual([true, false, true, true, false, false])
    // (the edge is the operations': x from the box's left to before its right)
    expect([e(0, 0), e(9.99, 9.99), e(10, 5)]).toEqual([false, true, false])
  })
  it('LK9: leaves a restored box visible, and answers as the gate\'s instrument does', () => {
    const list = [
      { op: 'erase', box: [0, 0, 100, 100] }, { op: 'restore', page: 1, clip: [[0, 0, 100, 100]], boxes: [[10, 10, 20, 20]] },
      { op: 'paper', rects: [[50, 50, 40, 40]] }, { op: 'swap', page: 1, rects: [[0, 80, 30, 30]] },
    ]
    const mine = erasedOf(list as never), theirs = gateErased(list as never, (x, y) => [x, y])
    for (let x = -5; x < 130; x += 3.5) for (let y = -5; y < 130; y += 3.5) expect(mine(x, y), `${x},${y}`).toBe(theirs(x, y))
    expect(mine(15, 15)).toBe(false)
    expect(erasedOf(undefined)(1, 1)).toBe(false)
  })
})

describe('the owner of an annotation', () => {
  const units = [
    { id: 4, stream: 40, rects: [[1, 90, 695, 140, 715]] },
    { id: 7, stream: 70, rects: [[1, 90, 695, 105, 715], [2, 0, 600, 500, 800]] },
    { id: 2, stream: 20, rects: [[1, 90, 695, 105, 715]] },
  ]
  const a = (rect: number[], text = 'abcdef', x = 100, w = 60) => kept(annotsOf([raw({ rect })], pointsOf([item(text, x, 700, w)])).list)[0]!
  it('is the unit whose rectangles on the page hold most of the annotation\'s points, ties to the smaller area, then the smaller id', () => {
    expect(ownerOf(a([100, 695, 130, 710]), units, 1)?.id).toBe(4)
    // (one point in each of the three rectangles of a tie: 'ab' at 105 is in all, so 2 and 7 share it with 4; the smaller area wins, the one with the smaller id after it)
    expect(ownerOf(a([100, 695, 106, 710], 'ab', 100, 10), units, 1)?.id).toBe(2)
    expect(ownerOf(a([100, 695, 106, 710], 'ab', 100, 10), units, 2)?.id).toBe(7)
    expect(ownerOf(a([100, 695, 106, 710], 'ab', 100, 10), units, 3)).toBeNull()
  })
  it('is the one under its rectangle\'s centre where the link has no glyph, and none where no unit is', () => {
    expect(ownerOf(a([95, 690, 99, 712], 'zz', 300, 10), units, 1)?.id).toBe(2)
    expect(ownerOf(a([300, 10, 310, 20], 'zz', 500, 10), units, 1)).toBeNull()
  })
})

describe('a page that is final', () => {
  const text = [item('See 12, 41 and', 100, 700, 140), item('Table 3 is', 100, 600, 100), item('Also here', 100, 500, 90)]
  const pts = pointsOf(text)
  const list = annotsOf([
    raw({ rect: [118, 695, 148, 710], dest: 'cite.a', overlaidText: '12,' }),
    raw({ rect: [100, 595, 140, 610], dest: 'table.3', overlaidText: 'Table' }),
    raw({ rect: [100, 495, 190, 510], dest: 'sec.1', overlaidText: 'Also here', quadPoints: new Float32Array([100, 510, 190, 510, 100, 495, 190, 495]) }),
    raw({ rect: [400, 20, 420, 30], dest: undefined, url: 'https://example.org/x', overlaidText: '' }),
    raw({ rect: [200, 20, 220, 30], dest: undefined, action: 'NextPage' }),
  ], pts).list
  const units = [{ id: 3, stream: 30, rects: [[1, 90, 690, 300, 715]] }, { id: 1, stream: 10, rects: [[1, 90, 590, 300, 615], [1, 90, 490, 300, 515]] }]
  const free = (ops: unknown[], o: Record<string, unknown> = {}) => freezeLinks({ list, q: 1, ops: ops as never, devOf: dev, units, ...o })

  it('LK7: leaves a link over text that stays where it stands: its rectangle (or quads) exact, not moved, named by the overlaid text, with its border', () => {
    const f = free([])
    expect(f.dropped).toBe(0)
    expect(f.inPlace).toBe(4)
    // (ranked by the owner unit's stream index, the one with no owner after every owned one: unit 1's two links, then unit 3's, then the margin's)
    expect(f.records.map(r => r.name)).toEqual(['Table', 'Also here', '12,', ''])
    expect(f.records.map(r => r.order)).toEqual([0, 1, 2, 3])
    expect(f.records.every(r => r.moved === false)).toBe(true)
    expect(f.records[2]).toEqual({ boxes: [118, 695, 148, 710], dest: 'cite.a', name: '12,', moved: false, order: 2, border: { width: 1, rgb: [0, 255, 0], style: 'solid' } })
    expect(f.records[1]!.boxes).toEqual([100, 495, 190, 510])
    expect(f.records[3]).toEqual({ boxes: [400, 20, 420, 30], url: 'https://example.org/x', name: '', moved: false, order: 3, border: { width: 1, rgb: [0, 255, 0], style: 'solid' } })
    expect(f.sources).toBeNull()
  })

  it('LK8: drops a link with a glyph point erased, counted, and keeps one whose glyphs the operations left', () => {
    const f = free([erase(100, 690, 260, 715), erase(95, 490, 195, 515)], { sources: true })
    expect(f.dropped).toBe(2)
    expect(f.records.map(r => r.name)).toEqual(['Table', ''])
    expect(f.sources).toEqual([{ annots: [[1, 1]], tier: 'place' }, { annots: [[1, 3]], tier: 'place' }])
    // (a link with some of its glyphs erased is dropped: its text is gone, and a link over what remains would be half-wrong)
    expect(free([erase(100, 690, 135, 715)]).dropped).toBe(1)
  })

  it('LK9: keeps a link over what a restore put back', () => {
    const f = free([erase(100, 690, 260, 715), { op: 'restore', page: 1, clip: [[...dev(100, 715), 320, 50]], boxes: [[...dev(100, 715), 320, 50]] }])
    expect(f.dropped).toBe(0)
    expect(f.records.map(r => r.name)).toEqual(['Table', 'Also here', '12,', ''])
  })

  it('leaves out an annotation a unit\'s match took, and ranks the moved records it made first within their unit', () => {
    const moved = { rec: { boxes: [10, 10, 20, 20], dest: 'cite.a', name: '12', moved: true, order: 0 }, stream: 10, sources: { annots: [[1, 0]], tier: 'geometry' } }
    const f = free([], { consumed: new Set([0]), moved: [moved], sources: true })
    expect(f.records.map(r => [r.name, r.moved, r.order])).toEqual([['12', true, 0], ['Table', false, 1], ['Also here', false, 2], ['', false, 3]])
    expect(f.sources![0]).toEqual({ annots: [[1, 0]], tier: 'geometry' })
    expect(f.inPlace).toBe(3)
  })

  it('answers no link for a page whose annotations could not be read', () => {
    expect(freezeLinks({ list: null, q: 1, ops: [], devOf: dev, units })).toEqual({ records: [], sources: null, inPlace: 0, dropped: 0, unplaced: 0 })
  })

  it('is a function of the page alone: the same list, operations and units give the same records, whatever the order of the units', () => {
    const a = free([erase(100, 690, 260, 715)]), b = freezeLinks({ list, q: 1, ops: [erase(100, 690, 260, 715)] as never, devOf: dev, units: units.slice().reverse() })
    expect(b.records).toEqual(a.records)
  })
})

describe('LK12: a copy of the links', () => {
  it('shares no object with the record it copies, and loses nothing', () => {
    const rec = { boxes: [1, 2, 3, 4, 5, 6, 7, 8], dest: [{ num: 12, gen: 0 }, { name: 'XYZ' }, 72, 700, 0], name: 'x', moved: false, order: 0, border: { width: 1, rgb: [0, 255, 0] as [number, number, number], style: 'dashed' as const } }
    const [c] = copyLinks([rec, { boxes: [1, 2, 3, 4], url: 'https://example.org/', name: '', moved: true, order: 1 }])
    expect(c).toEqual(rec)
    expect(c!.boxes).not.toBe(rec.boxes)
    expect(c!.dest).not.toBe(rec.dest)
    expect((c!.dest as unknown[])[0]).not.toBe(rec.dest[0])
    expect(c!.border).not.toBe(rec.border)
    expect(c!.border!.rgb).not.toBe(rec.border.rgb)
    expect(copyLinks(null)).toEqual([])
    expect(copyLinks([{ boxes: [1, 2, 3, 4], dest: 'n', name: '', moved: false, order: 0 }])[0]).not.toHaveProperty('border')
  })
  it('is plain data a host may clone', () => {
    const f = freezeLinks({ list: annotsOf([raw({ dest: [{ num: 12, gen: 0 }, { name: 'XYZ' }, 72, 700, 0] })], pointsOf([])).list, q: 1, ops: [], devOf: dev, units: [] })
    expect(structuredClone(copyLinks(f.records))).toEqual(copyLinks(f.records))
  })
})

it('names a link whose overlaid text is empty by the engine\'s characters under it, never by the estimate, and a glyphless one by nothing', () => {
  const items = pointsOf([item('ab', 100, 700, 20)])
  const own = charPoints([{ ch: 'a', x0: 100, x1: 108, yb: 700 }, { ch: 'b', x0: 108, x1: 120, yb: 700 }])
  const a = kept(annotsOf([raw({ overlaidText: '' }), raw({ overlaidText: '', rect: [300, 300, 310, 310] })], items, own).list)
  expect([inPlaceOf(a[0]!).name, inPlaceOf(a[1]!).name]).toEqual(['ab', ''])
  // (the estimate alone names nothing)
  expect(inPlaceOf(kept(annotsOf([raw({ overlaidText: '' })], items).list)[0]!).name).toBe('')
})

describe('the two readings of a glyph\'s place', () => {
  // the text item 'ij' is cut in two equal halves, centres at 105 and 115; the engine's characters are a narrow 'i' (100 to 104, centre 102) and a wide 'j' (104 to 120, centre 112)
  const est = pointsOf([item('ij', 100, 700, 20)])
  const own = charPoints([{ ch: 'i', x0: 100, x1: 104, yb: 700 }, { ch: 'j', x0: 104, x1: 120, yb: 700 }])
  // the link is the 'i' alone: PDF.js's rectangle is 100 to 103.5; the estimate has no point there, the engine's has the 'i' at 102
  const list = annotsOf([raw({ rect: [100, 695, 103.5, 710], overlaidText: 'i' })], est, own).list
  it('keeps a link out of the erased area only if a point of neither is erased: the estimate alone finds nothing under it', () => {
    expect(kept(list)[0]!.g.ch).toEqual([])
    expect(kept(list)[0]!.g2.ch).toEqual(['i'])
    const f = (ops: unknown[]) => freezeLinks({ list, q: 1, ops: ops as never, devOf: dev, units: [] })
    expect(f([erase(99, 690, 110, 715)]).dropped).toBe(1)
    // (the engine's point at 102 is erased and put back by a restore over 101.5 to 102.5: kept; over 101.5 to 102 it is not put back: dropped)
    const restore = (w: number) => ({ op: 'restore', page: 1, clip: [[...dev(101.5, 715), w, 50]], boxes: [[...dev(101.5, 715), w, 50]] })
    expect(f([erase(99.9, 690, 102.5, 715), restore(2)]).dropped).toBe(0)
    expect(f([erase(99.9, 690, 102.5, 715), restore(1)]).dropped).toBe(1)
  })
  it('drops it where the engine\'s point is erased and the estimate\'s lands on a restored neighbour', () => {
    // two links: the estimate's point of 'j' (115) and the engine's (112); a restore covers 114 to 116 only, the erase 104 to 120
    const l2 = annotsOf([raw({ rect: [110, 695, 118, 710], overlaidText: 'j' })], est, own).list
    expect(kept(l2)[0]!.g.ch).toEqual(['j'])
    expect(kept(l2)[0]!.g2.ch).toEqual(['j'])
    const ops = [erase(104, 690, 120, 715), { op: 'restore', page: 1, clip: [[...dev(114, 715), 2 * 2, 50]], boxes: [[...dev(114, 715), 2 * 2, 50]] }]
    // (the estimate at 115 is put back, the engine's centre at 112 is not: dropped)
    expect(freezeLinks({ list: l2, q: 1, ops: ops as never, devOf: dev, units: [] }).dropped).toBe(1)
    // (and with the estimate alone it would have stayed)
    const alone = annotsOf([raw({ rect: [110, 695, 118, 710], overlaidText: 'j' })], est).list
    expect(freezeLinks({ list: alone, q: 1, ops: ops as never, devOf: dev, units: [] }).dropped).toBe(0)
  })
})

describe('a page that is hostile', () => {
  it('reads at most MAX_LINKS annotations, and counts the rest unsupported', () => {
    const many = Array.from({ length: 100_000 }, (_, k) => raw({ rect: [k % 600, 10, (k % 600) + 4, 20], dest: `d${k}` }))
    const pts = pointsOf(Array.from({ length: 100_000 }, (_, k) => item('ab', k % 600, 15, 8)))
    const start = performance.now()
    const { list, total, unsupported } = annotsOf(many, pts, charPoints([]))
    const f = freezeLinks({ list, q: 1, ops: Array.from({ length: 5000 }, (_, k) => erase(k % 600, 0, (k % 600) + 1, 5)) as never, devOf: dev, units: [{ id: 1, stream: 1, rects: Array.from({ length: 3000 }, (_, k) => [1, k % 600, 0, (k % 600) + 5, 30]) }] })
    const ms = performance.now() - start
    expect(list.length).toBeLessThanOrEqual(MAX_LINKS)
    expect(total + unsupported).toBe(100_000)
    expect(total).toBeLessThanOrEqual(MAX_LINKS)
    expect(f.records.length).toBeLessThanOrEqual(MAX_LINKS)
    expect(JSON.stringify(f.records).length).toBeLessThan(1_000_000)
    expect(ms).toBeLessThan(3000)
  })
  it('does not carry a link with more than MAX_GLYPHS glyph points, whole-page rectangles included', () => {
    const pts = pointsOf(Array.from({ length: 5000 }, (_, k) => item('abc', (k % 50) * 10, 700 - Math.floor(k / 50) * 3, 30)))
    const { list, total, unsupported } = annotsOf([raw({ rect: [0, 0, 600, 800] }), raw({ rect: [0, 690, 30, 710] })], pts)
    expect(list[0]).toEqual({ i: 0, unsupported: true })
    expect([total, unsupported]).toEqual([1, 1])
    expect(MAX_GLYPHS).toBeGreaterThan(50)
  })
  it('spends a bounded work on the freeze, and drops what is left as unplaced', () => {
    const pts = pointsOf(Array.from({ length: 1000 }, (_, k) => item('abcde', 10 * (k % 50), 700 - 20 * Math.floor(k / 50), 40)))
    const { list } = annotsOf(Array.from({ length: 1000 }, (_, k) => raw({ rect: [10 * (k % 50), 690 - 20 * Math.floor(k / 50), 10 * (k % 50) + 40, 710 - 20 * Math.floor(k / 50)], dest: `d${k}` })), pts)
    // (many operations make each point test dear: the budget lasts for some of the links only)
    const ops = Array.from({ length: Math.ceil(WORK_MAX / 2000) }, () => ({ op: 'crop', page: 1, src: [0, 0, 1, 1], dst: [0, 0, 1, 1] }))
    const f = freezeLinks({ list, q: 1, ops: ops as never, devOf: dev, units: [] })
    expect(f.unplaced).toBeGreaterThan(0)
    expect(f.inPlace + f.dropped + f.unplaced).toBe(1000)
    expect(f.records.length).toBe(f.inPlace)
  })
})
