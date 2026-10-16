import { describe, expect, it } from 'vitest'
import {
  type Annot,
  type Annots,
  annotationsOf,
  composedDiff,
  cropsShown,
  drawnCharsOf,
  erasedOf,
  glyphPointsOf,
  hrefUrlOf,
  type LinkRec,
  type LinkSource,
  linksPage,
  type Op,
  pairsOf,
  type Point,
  pointsIn,
  referenceOf,
  sameText,
  textUnder,
  urlAllowed,
} from '../../lab/pdf/spikes/layer-gate/links.mjs'
import { compare, completenessRows, fixtureTotals, LINKS_MIN, type Measure, MEASURES, pageEntry, pooled, type Totals, worse } from '../../lab/pdf/spikes/layer-gate/score.mjs'

// The layer gate's link measures (3a-0, lab/pdf/spikes/layer-gate/links.mjs; the design is 3a-links-design.md section 2):
// what the original's links are (T and U), which of them a record keeps, which records are wrong, which moved records are
// true, the composed document's links against arXiv's, and the merge rule's reading of them (shares that can only rise, a
// defect gated at 0, "not applicable" where there is nothing to share). The engine of 3a-0 has no record: every case here
// is made of synthetic annotation sets and records.

/** a PDF.js annotation as getAnnotations() reports a Link */
const raw = (o: Record<string, unknown> = {}) => ({ subtype: 'Link', rect: [100, 700, 130, 710], dest: 'cite.a', borderStyle: { width: 1, style: 1 }, color: [0, 255, 0], overlaidText: '12', ...o })
/** the text item of one word with its baseline at y, from x, width w (PDF.js: transform [a, b, c, d, e, f]) */
const item = (str: string, x: number, y: number, w: number, size = 10) => ({ str, width: w, transform: [size, 0, 0, size, x, y] })

describe('the original\'s links: T and U', () => {
  it('reads the Link annotations only, ranked in PDF.js\'s order among themselves', () => {
    const a = annotationsOf([raw(), { subtype: 'Widget', rect: [0, 0, 5, 5] }, raw({ dest: 'cite.b' }), { subtype: 'Popup' }, raw({ url: 'https://example.org/x', dest: undefined })])
    expect(a.links.map(l => l.i)).toEqual([0, 1, 2])
    expect(a.links.map(l => l.target)).toEqual([{ dest: 'cite.a' }, { dest: 'cite.b' }, { url: 'https://example.org/x' }])
    expect(a.total).toBe(3)
    expect(a.unsupported).toBe(0)
  })
  it('counts what the reader cannot carry as U: a named action, JavaScript with no url, an attachment, unsafeUrl alone, a scheme outside the allow-list, an empty destination, no area', () => {
    const a = annotationsOf([
      raw({ dest: undefined, action: 'NextPage' }),
      raw({ dest: undefined, jsAction: 'app.alert(1)' }),
      raw({ dest: undefined, attachment: { filename: 'a.txt' } }),
      raw({ dest: undefined, unsafeUrl: 'javascript:alert(1)' }),
      raw({ dest: undefined, url: 'ftp://example.org/f' }),
      raw({ dest: undefined, url: 'tel:+123' }),
      raw({ dest: '' }),
      raw({ dest: [] }),
      raw({ rect: [100, 700, 100, 710] }),
      raw({ rect: null }),
      raw({ dest: undefined, url: 'mailto:a@example.org' }),
      raw({ dest: [{ num: 4, gen: 0 }, { name: 'XYZ' }, 72, 700, null] }),
    ])
    expect(a.links.filter(l => l.ok).map(l => l.i)).toEqual([10, 11])
    expect(a.total).toBe(2)
    expect(a.unsupported).toBe(10)
  })
  it('reads the border (width, colour, style) and the quads\' boxes', () => {
    const a = annotationsOf([raw({ borderStyle: { width: 2, style: 5 }, quadPoints: Float32Array.from([100, 710, 110, 710, 100, 700, 110, 700, 120, 710, 130, 710, 120, 700, 130, 700]) }), raw({ borderStyle: { width: 0 } })])
    expect(a.links[0]!.border).toEqual({ width: 2, rgb: [0, 255, 0], style: 'underline' })
    expect(a.links[0]!.boxes).toEqual([[100, 700, 110, 710], [120, 700, 130, 710]])
    expect(a.links[1]!.border).toBeNull()
  })
  it('allows http:, https: and mailto: and nothing else', () => {
    for (const u of ['http://a.org', 'https://a.org/x?y=1', 'mailto:a@b.org']) expect(urlAllowed(u)).toBe(true)
    for (const u of ['ftp://a.org', 'tel:1', 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x', 'not a url', '', undefined]) expect(urlAllowed(u)).toBe(false)
  })
})

describe('glyph points, and the area the drawing left erased', () => {
  it('puts each non-space character at its advance centre on the baseline; the link takes those strictly inside', () => {
    const pts = glyphPointsOf([item('12', 100, 702, 20), item('a b', 200, 702, 30)])
    expect(pts.map(p => [p.ch, p.x, p.y])).toEqual([['1', 105, 702], ['2', 115, 702], ['a', 205, 702], ['b', 225, 702]])
    expect(pointsIn(pts, [[100, 700, 120, 710]]).map(p => p.ch)).toEqual(['1', '2'])
    // a centre on the edge is not inside
    expect(pointsIn(pts, [[105, 700, 115, 710]]).map(p => p.ch)).toEqual([])
  })
  it('follows an item\'s direction, and skips an item with no advance', () => {
    const pts = glyphPointsOf([{ str: 'ab', width: 20, transform: [0, 10, -10, 0, 50, 100] }, { str: 'x', width: 0, transform: [10, 0, 0, 10, 0, 0] }])
    expect(pts.map(p => [p.x, p.y])).toEqual([[50, 105], [50, 115]])
  })
  const dev = (x: number, y: number) => [x, 800 - y]
  const ops: Op[] = [
    { op: 'erase', box: [95, 90, 40, 20] },
    { op: 'paper', rects: [[300, 100, 50, 20]] },
    { op: 'swap', rects: [[400, 100, 50, 20]] },
    { op: 'crop' },
  ]
  it('erases by erase, paper and swap rectangles in device pixels, and not by a crop', () => {
    // (device y = 800 - y: the erase box covers x 95..135, device y 90..110, PDF y 690..710)
    const erased = erasedOf(ops, dev)
    expect(erased(100, 700)).toBe(true)
    expect(erased(320, 690)).toBe(true)
    expect(erased(420, 690)).toBe(true)
    expect(erased(200, 700)).toBe(false)
    expect(erased(100, 600)).toBe(false)
  })
  it('puts back what a restore restores within its clip, in the operations\' order: a later erase takes it again', () => {
    const restore: Op = { op: 'restore', boxes: [[95, 90, 20, 20]], clip: [[95, 90, 40, 20]] }
    const back = erasedOf([ops[0]!, restore], dev)
    expect(back(100, 700)).toBe(false) // in a restored box
    expect(back(125, 700)).toBe(true) // in the erase box, outside the restored one
    const again = erasedOf([ops[0]!, restore, { op: 'erase', box: [95, 90, 40, 20] }], dev)
    expect(again(100, 700)).toBe(true)
    // a restore box outside its clip restores nothing
    const outside = erasedOf([ops[0]!, { op: 'restore', boxes: [[95, 90, 20, 20]], clip: [[500, 500, 5, 5]] }], dev)
    expect(outside(100, 700)).toBe(true)
  })
})

/** a page of the original: five links, text under each, the erase over the first two */
const page1 = () => {
  const raws = [
    raw({ rect: [100, 698, 130, 712], dest: 'cite.a', overlaidText: '12' }),
    raw({ rect: [140, 698, 170, 712], dest: 'cite.b', overlaidText: '7' }),
    raw({ rect: [100, 600, 170, 612], url: 'https://example.org/p', dest: undefined, overlaidText: 'example' }),
    raw({ rect: [100, 500, 140, 512], dest: 'section.2', overlaidText: '2' }),
    raw({ dest: undefined, action: 'GoBack', rect: [100, 400, 140, 412] }),
  ]
  const annots = annotationsOf(raws)
  const glyphs = glyphPointsOf([item('12', 105, 700, 20), item('7', 145, 700, 20), item('example', 105, 602, 60), item('2', 110, 502, 10)])
  return { annots, glyphs }
}
const noErase = () => false
const unused = () => ''
const noRef = () => null
type Run = { records?: LinkRec[]; sources?: (LinkSource | null)[] | null; erased?: (x: number, y: number) => boolean; parsed?: (q: number) => Annots | undefined; claims?: Map<string, { page: number; label: string; credited: boolean; flagged: boolean }>; page?: number; drawn?: (r: LinkRec) => string; crops?: { srcPage: number; src: number[]; chars: Point[] }[]; reference?: (r: LinkRec, a: Annot[]) => string | null | undefined }
const run = (o: Run = {}) => {
  const { annots, glyphs } = page1()
  return linksPage({ page: o.page ?? 1, parsed: o.parsed ?? (q => (q === 1 ? annots : undefined)), glyphs, erased: o.erased ?? noErase, records: o.records ?? [], sources: o.sources ?? null, claims: o.claims ?? new Map(), drawn: o.drawn ?? unused, ...(o.crops ? { crops: o.crops } : {}), reference: o.reference ?? noRef })
}
/** the border `raw` gives its annotations (width 1, green, solid) */
const border = { width: 1, rgb: [0, 255, 0], style: 'solid' }
const moved = (dest: string, boxes: number[], o: Partial<LinkRec> = {}): LinkRec => ({ boxes, dest, name: '12', moved: true, order: 0, border, ...o })
const inPlace = (o: Partial<LinkRec> & { boxes: number[] }): LinkRec => ({ dest: 'cite.a', name: '12', moved: false, order: 0, border, ...o })

describe('a page\'s link measures: the baseline, where the engine drops every link', () => {
  it('counts T and U, kept 0, wrong 0, no moved record', () => {
    const m = run()
    expect(m).toMatchObject({ linksTotal: 4, linksUnsupported: 1, linksKeptN: 0, linksMoved: 0, linksInPlace: 0, linksTrueN: 0, linksWrong: 0 })
    expect(m.where).toEqual({ linksWrong: [], linksTrue: [] })
  })
  it('counts what in place alone could keep: the annotations of T none of whose glyph points is erased', () => {
    // the erase covers the first two links' text (PDF y 690..710, x 95..180)
    const erased = erasedOf([{ op: 'erase', box: [95, 90, 85, 20] }], (x, y) => [x, 800 - y])
    expect(run({ erased }).linksPlaceable).toBe(2)
    expect(run().linksPlaceable).toBe(4)
  })
  it('an engine with records but no attribution has every record wrong (claim): the claim cannot be borne out', () => {
    const m = run({ records: [inPlace({ boxes: [100, 698, 130, 712] })] })
    expect(m.linksWrong).toBe(1)
    expect(m.where.linksWrong).toEqual(['0:claim'])
  })
})

describe('kept', () => {
  const a0: LinkSource = { annots: [[1, 0]], tier: 'geometry' }
  it('keeps an annotation a moved record carries with its own target, wherever the record lies', () => {
    const m = run({ records: [moved('cite.a', [150, 698, 170, 712])], sources: [a0], reference: () => '12', drawn: () => '12' })
    expect(m.linksKeptN).toBe(1)
    expect(m.linksMoved).toBe(1)
    expect(m.linksWrong).toBe(0)
  })
  it('keeps an annotation a record carries in place on its rectangle (0.01), and not one whose boxes are off it', () => {
    expect(run({ records: [inPlace({ boxes: [100, 698, 130, 712] })], sources: [a0] })).toMatchObject({ linksKeptN: 1, linksInPlace: 1, linksWrong: 0 })
    expect(run({ records: [inPlace({ boxes: [100.005, 698, 130, 711.995] })], sources: [a0] }).linksKeptN).toBe(1)
    const off = run({ records: [inPlace({ boxes: [100.5, 698, 130, 712] })], sources: [a0] })
    expect(off.linksKeptN).toBe(0)
    expect(off.where.linksWrong).toEqual(['0:rect'])
  })
  it('keeps both halves of a merged record (two abutting annotations of one target, one <a>)', () => {
    const annots = annotationsOf([raw({ rect: [100, 698, 130, 712], dest: 'cite.a' }), raw({ rect: [100, 686, 120, 700], dest: 'cite.a' })])
    const m = linksPage({ page: 1, parsed: () => annots, glyphs: [], erased: noErase, records: [moved('cite.a', [100, 698, 130, 712, 100, 686, 120, 700], { name: 'ab' })], sources: [{ annots: [[1, 0], [1, 1]] }], claims: new Map(), drawn: () => 'ab', reference: () => 'ab' })
    expect(m).toMatchObject({ linksKeptN: 2, linksMoved: 1, linksTrueN: 1, linksWrong: 0 })
  })
  it('keeps an annotation of another page where the unit lies over a page break, once', () => {
    const annots1 = annotationsOf([raw({ rect: [100, 698, 130, 712], dest: 'cite.a' })])
    const annots2 = annotationsOf([])
    const m = linksPage({ page: 2, parsed: q => (q === 1 ? annots1 : annots2), glyphs: [], erased: noErase, records: [moved('cite.a', [100, 700, 130, 712])], sources: [{ annots: [[1, 0]] }], claims: new Map(), drawn: () => '12', reference: () => '12' })
    expect(m).toMatchObject({ linksTotal: 0, linksKeptN: 1, linksWrong: 0, linksTrueN: 1 })
    // (its reference is asked for the annotation of its own page: the annotation says which)
    const asked: (number | undefined)[] = []
    linksPage({ page: 2, parsed: q => (q === 1 ? annots1 : annots2), glyphs: [], erased: noErase, records: [moved('cite.a', [100, 700, 130, 712])], sources: [{ annots: [[1, 0]] }], claims: new Map(), drawn: () => '12', reference: (_, a) => { asked.push((a[0] as Annot & { page?: number }).page); return '12' } })
    expect(asked).toEqual([1])
  })
  it('keeps nothing a wrong record carries', () => {
    expect(run({ records: [moved('cite.b', [150, 698, 170, 712])], sources: [a0], reference: () => '12', drawn: () => '12' })).toMatchObject({ linksKeptN: 0, linksWrong: 1 })
  })
})

describe('wrong: each defect in turn', () => {
  const a0: LinkSource = { annots: [[1, 0]] }
  const why = (m: ReturnType<typeof run>) => m.where.linksWrong.flatMap(x => x.split(':')[1]!.split('+'))
  it('an in-place record over an erased glyph point (links over erased text = 0)', () => {
    const erased = erasedOf([{ op: 'erase', box: [95, 90, 40, 20] }], (x, y) => [x, 800 - y])
    const m = run({ records: [inPlace({ boxes: [100, 698, 130, 712] })], sources: [a0], erased })
    expect(m.linksWrong).toBe(1)
    expect(why(m)).toEqual(['erased'])
    // the same record over text a restore put back is fine
    const restored = erasedOf([{ op: 'erase', box: [95, 90, 40, 20] }, { op: 'restore', boxes: [[95, 90, 40, 20]], clip: [[95, 90, 40, 20]] }], (x, y) => [x, 800 - y])
    expect(run({ records: [inPlace({ boxes: [100, 698, 130, 712] })], sources: [a0], erased: restored }).linksWrong).toBe(0)
  })
  it('a moved record is not asked about erased text: it lies over its own drawing', () => {
    const erased = erasedOf([{ op: 'erase', box: [95, 90, 40, 20] }], (x, y) => [x, 800 - y])
    expect(run({ records: [moved('cite.a', [150, 698, 170, 712])], sources: [a0], erased, drawn: () => '12', reference: () => '12' }).linksWrong).toBe(0)
  })
  it('an attribution that names no annotation of T, or one of another target', () => {
    expect(why(run({ records: [moved('cite.a', [150, 698, 170, 712])], sources: [{ annots: [[1, 9]] }] }))).toEqual(['missing'])
    // annotation 4 is a named action: not in T
    expect(why(run({ records: [moved('cite.a', [150, 698, 170, 712])], sources: [{ annots: [[1, 4]] }] }))).toEqual(['missing'])
    expect(why(run({ records: [moved('cite.a', [150, 698, 170, 712])], sources: [{ annots: [[1, 1]] }] }))).toEqual(['target'])
    expect(why(run({ records: [{ ...moved('cite.a', [150, 698, 170, 712]), dest: undefined, url: 'https://example.org/p' }], sources: [a0] }))).toEqual(['target'])
  })
  it('an annotation two records claim: both are wrong, whichever is processed first (ambiguous)', () => {
    const two = run({ records: [moved('cite.a', [150, 698, 170, 712], { order: 0 }), moved('cite.a', [150, 680, 170, 692], { order: 1 })], sources: [a0, a0], reference: () => '12', drawn: () => '12' })
    expect(two.linksWrong).toBe(2)
    expect(two.where.linksWrong).toEqual(['0:twice', '1:twice'])
    expect(two.linksKeptN).toBe(0)
  })
  it('the same across pages: the later page makes the earlier record wrong and takes its credit back (the fixture\'s sums are right)', () => {
    const claims: Run['claims'] = new Map()
    const first = run({ records: [moved('cite.a', [150, 698, 170, 712])], sources: [a0], claims, reference: () => '12', drawn: () => '12' })
    expect(first).toMatchObject({ linksKeptN: 1, linksWrong: 0 })
    const second = run({ records: [moved('cite.a', [150, 698, 170, 712], { order: 0 })], sources: [a0], claims, page: 2, parsed: () => page1().annots, reference: () => '12', drawn: () => '12' })
    expect(second).toMatchObject({ linksKeptN: -1, linksWrong: 2 })
    expect(second.where.linksWrong).toEqual(['p1/0:twice', '0:twice'])
    expect(first.linksKeptN + second.linksKeptN).toBe(0)
    // a third claim does not count the earlier record again
    const third = run({ records: [moved('cite.a', [150, 698, 170, 712], { order: 0 })], sources: [a0], claims, page: 3, parsed: () => page1().annots, reference: () => '12', drawn: () => '12' })
    expect(third).toMatchObject({ linksKeptN: 0, linksWrong: 1 })
  })
  it('registers a claim whatever its target: a later record that claims the same annotation rightly is not unique either', () => {
    const claims: Run['claims'] = new Map()
    // (page 1: a record claims annotation 1 (cite.b) with another target)
    const bad = run({ records: [moved('cite.a', [150, 698, 170, 712])], sources: [{ annots: [[1, 1]] }], claims })
    expect(why(bad)).toEqual(['target'])
    const later = run({ records: [moved('cite.b', [150, 698, 170, 712], { name: '7' })], sources: [{ annots: [[1, 1]] }], claims, page: 2, parsed: () => page1().annots, reference: () => '7', drawn: () => '7' })
    expect(why(later)).toEqual(['twice'])
    expect(later.linksKeptN).toBe(0)
  })
  it('classifies an invalid or absent source page as missing, whatever page it names', () => {
    for (const q of [0, -1, 99, 1.5]) expect(why(run({ records: [moved('cite.a', [150, 698, 170, 712])], sources: [{ annots: [[q, 0]] }] }))).toContain('missing')
  })
  it('a record carries its annotation\'s border: none where it has none, else the same width, colour and style', () => {
    const border = (b: object | undefined) => why(run({ records: [moved('cite.a', [150, 698, 170, 712], { border: b as LinkRec['border'] })], sources: [a0], reference: () => '12', drawn: () => '12' }))
    expect(border({ width: 1, rgb: [0, 255, 0], style: 'solid' })).toEqual([])
    expect(border({ width: 1, rgb: [0, 255, 0] })).toEqual([]) // a style not named is solid
    expect(border(undefined)).toEqual(['border'])
    expect(border({ width: 2, rgb: [0, 255, 0], style: 'solid' })).toEqual(['border'])
    expect(border({ width: 1, rgb: [255, 0, 0], style: 'solid' })).toEqual(['border'])
    expect(border({ width: 1, rgb: [0, 255, 0], style: 'dashed' })).toEqual(['border'])
    // an annotation with no border: the record has none
    const plain = annotationsOf([raw({ borderStyle: { width: 0 } })])
    const m = (b: object | undefined) => linksPage({ page: 1, parsed: () => plain, glyphs: [], erased: noErase, records: [moved('cite.a', [150, 698, 170, 712], { border: b as LinkRec['border'] })], sources: [a0], claims: new Map(), drawn: () => '12', reference: () => '12' }).where.linksWrong
    expect(m(undefined)).toEqual([])
    expect(m({ width: 1, rgb: [0, 255, 0], style: 'solid' })).toEqual(['0:border'])
  })
  it('a name is the drawn text under a moved record, or the overlaid text of an in-place one', () => {
    expect(why(run({ records: [moved('cite.a', [150, 698, 170, 712], { name: 'unrelated' })], sources: [a0], reference: () => '12', drawn: () => '12' }))).toEqual(['name'])
    expect(why(run({ records: [moved('cite.a', [150, 698, 170, 712], { name: ' 12 ' })], sources: [a0], reference: () => '12', drawn: () => '12' }))).toEqual([])
    expect(why(run({ records: [inPlace({ boxes: [100, 698, 130, 712], name: 'unrelated' })], sources: [a0] }))).toEqual(['name'])
    expect(why(run({ records: [inPlace({ boxes: [100, 698, 130, 712], name: '12' })], sources: [a0] }))).toEqual([])
  })
  it('a record\'s order is its rank in the list: an integer, 0..n-1, in order', () => {
    const two = (o0: number, o1: number) => run({ records: [moved('cite.a', [150, 698, 170, 712], { order: o0 }), moved('cite.b', [150, 680, 170, 692], { order: o1, name: '7' })], sources: [a0, { annots: [[1, 1]] }], reference: (r) => (r.name === '7' ? '7' : '12'), drawn: (r) => r.name })
    expect(two(0, 1).linksWrong).toBe(0)
    expect(two(1, 0).where.linksWrong).toEqual(['0:order', '1:order'])
    expect(two(0, 0).where.linksWrong).toEqual(['1:order'])
    expect(two(0, 5).where.linksWrong).toEqual(['1:order'])
    expect(two(0, 1.5).where.linksWrong).toEqual(['1:order'])
  })
  it('credits only annotations of the pages the gate measures: the denominator is theirs alone', () => {
    const annots = page1().annots
    const m = linksPage({ page: 1, parsed: () => annots, counted: q => q <= 1, glyphs: [], erased: noErase, records: [moved('cite.a', [150, 698, 170, 712])], sources: [{ annots: [[2, 0]] }], claims: new Map(), drawn: () => '12', reference: () => '12' })
    expect(m).toMatchObject({ linksKeptN: 0, linksWrong: 0, linksMoved: 1 })
  })
  it('does not read the drawn text of a moved record whose boxes are malformed: the defect is reported, the gate does not stop', () => {
    const m = run({ records: [{ ...moved('cite.a', [150, 698, 170, 712]), boxes: null } as unknown as LinkRec], sources: [a0], reference: () => '12', drawn: () => { throw new Error('asked') } })
    expect(m.where.linksWrong).toEqual(['0:shape'])
    expect(m.linksTrueN).toBe(0)
  })
  it('an in-place record with more than one annotation, or one of another page', () => {
    expect(why(run({ records: [inPlace({ boxes: [100, 698, 130, 712] })], sources: [{ annots: [[1, 0], [1, 1]] }] }))).toContain('claim')
    expect(why(run({ records: [inPlace({ boxes: [100, 698, 130, 712] })], sources: [{ annots: [[2, 0]] }], parsed: q => (q <= 2 ? page1().annots : undefined) }))).toContain('claim')
  })
  it('a url outside the allow-list, a record with both or neither of dest and url, malformed boxes', () => {
    const bad = (rec: Partial<LinkRec>) => why(run({ records: [{ ...moved('cite.a', [150, 698, 170, 712]), ...rec } as LinkRec], sources: [a0], reference: () => '12', drawn: () => '12' }))
    expect(bad({ dest: undefined, url: 'javascript:alert(1)' })).toContain('scheme')
    expect(bad({ dest: undefined, url: 'ftp://example.org' })).toContain('scheme')
    expect(bad({ url: 'https://example.org/p' })).toContain('scheme')
    expect(bad({ dest: undefined })).toContain('scheme')
    expect(bad({ boxes: [150, 698, 150, 712] })).toContain('shape')
    expect(bad({ boxes: [150, 698, 170] })).toContain('shape')
    expect(bad({ boxes: [] })).toContain('shape')
  })
  it('an empty name where there are glyphs (a moved record always has; an in-place one where its annotation covers text)', () => {
    expect(why(run({ records: [moved('cite.a', [150, 698, 170, 712], { name: '' })], sources: [a0], reference: () => '', drawn: () => '' }))).toContain('name')
    expect(why(run({ records: [inPlace({ boxes: [100, 698, 130, 712], name: '' })], sources: [a0] }))).toEqual(['name'])
    // a glyphless link (an image link) in place is named ''
    const annots = annotationsOf([raw({ rect: [300, 300, 340, 340], dest: 'figure.1' })])
    const m = linksPage({ page: 1, parsed: () => annots, glyphs: [], erased: noErase, records: [inPlace({ dest: 'figure.1', boxes: [300, 300, 340, 340], name: '' })], sources: [{ annots: [[1, 0]] }], claims: new Map(), drawn: unused, reference: noRef })
    expect(m.linksWrong).toBe(0)
    expect(m.linksKeptN).toBe(1)
  })
})

describe('true: the drawn text under a moved link against the reference', () => {
  const a0: LinkSource = { annots: [[1, 0]] }
  const rec = moved('cite.a', [150, 698, 170, 712])
  it('counts a moved record whose drawn text is the reference after norm', () => {
    expect(run({ records: [rec], sources: [a0], drawn: () => ' 12 ', reference: () => '12' }).linksTrueN).toBe(1)
    expect(run({ records: [rec], sources: [a0], drawn: () => '\uFF21\uFF22', reference: () => 'ab' }).linksTrueN).toBe(0) // fullwidth AB: NFKC to AB, and case is not folded
    expect(run({ records: [rec], sources: [a0], drawn: () => '\uFF21\uFF42', reference: () => 'Ab' }).linksTrueN).toBe(1) // fullwidth Ab: NFKC
  })
  it('measures no record whose reference cannot be had (no TeX\'s file to read): unverified, neither true nor listed', () => {
    const m = run({ records: [rec], sources: [a0], drawn: () => '12', reference: () => undefined })
    expect(m).toMatchObject({ linksTrueN: 0, linksUnverified: 1, linksMoved: 1, where: { linksTrue: [] } })
  })
  it('lists a record whose drawn text differs, or whose reference is not found', () => {
    const wrong = run({ records: [rec], sources: [a0], drawn: () => '21', reference: () => '12' })
    expect(wrong.linksTrueN).toBe(0)
    expect(wrong.where.linksTrue).toEqual(['0'])
    expect(run({ records: [rec], sources: [a0], drawn: () => '12', reference: () => null })).toMatchObject({ linksTrueN: 0, where: { linksTrue: ['0'] } })
  })
  it('does not count a moved record with no drawn character under it, whatever the reference: two empty texts are no match', () => {
    expect(run({ records: [rec], sources: [a0], drawn: () => '', reference: () => '' }).linksTrueN).toBe(0)
    expect(run({ records: [rec], sources: [a0], drawn: () => ' ', reference: () => '' }).where.linksTrue).toEqual(['0'])
  })
  it('asks nothing of an in-place record', () => {
    const m = run({ records: [inPlace({ boxes: [100, 698, 130, 712] })], sources: [a0], drawn: () => { throw new Error('asked') }, reference: () => { throw new Error('asked') } })
    expect(m.linksTrueN).toBe(0)
    expect(m.linksMoved).toBe(0)
  })
  it('compares on letters and digits, and on every non-space character where there are none', () => {
    expect(sameText('Peters et al., 2018a', 'Peters et al 2018a')).toBe(true)
    expect(sameText('[21]', '21')).toBe(true)
    expect(sameText('(a)', 'a')).toBe(true)
    expect(sameText('§ 2', '§2')).toBe(true) // no letter or digit: the non-space characters
    expect(sameText('§', '¶')).toBe(false)
    expect(sameText('', '2')).toBe(false)
  })
  it('reads the drawn text as the characters whose centre lies inside a box, in DOM order', () => {
    const chars: Point[] = [{ x: 105, y: 700, ch: '2' }, { x: 100.5, y: 700, ch: '1' }, { x: 300, y: 700, ch: 'x' }]
    expect(textUnder(chars, [[100, 698, 130, 712]])).toBe('21')
    expect(textUnder(chars, [[100, 698, 103, 712], [299, 698, 301, 712]])).toBe('1x')
  })
})

describe('true over a crop: what the crop shows, its source\'s glyphs, never its copy text', () => {
  const { glyphs } = page1()
  // (a crop of page 1's "12", from 95 to 135 and 695 to 715, drawn at half its size from 300, 400 on another page)
  const crop = { srcPage: 1, src: [95, 695, 135, 715], dst: [300, 400, 320, 410], clip: null }
  it('carries the source page\'s glyphs inside the source box by the crop\'s own map, within its clip where it has one', () => {
    const [shown] = cropsShown([crop], () => glyphs)
    expect(shown!.chars).toEqual([{ x: 307.5, y: 402.5, ch: '1' }, { x: 312.5, y: 402.5, ch: '2' }])
    expect(cropsShown([{ ...crop, clip: [[95, 695, 115, 715]] }], () => glyphs)[0]!.chars.map(c => c.ch)).toEqual(['1'])
    // (a glyph outside the source box is not the crop's: "7" at 150)
    expect(cropsShown([{ ...crop, src: [95, 695, 175, 715], dst: [300, 400, 340, 410] }], () => glyphs)[0]!.chars.map(c => c.ch)).toEqual(['1', '2', '7'])
    expect(cropsShown(null, () => glyphs)).toEqual([])
  })
  it('counts a moved record over a crop true where what it shows under it is the overlaid text, whatever its copy text', () => {
    const rec = moved('cite.a', [305, 401, 316, 405], { name: 'parikh-etal:2016' })
    const crops = cropsShown([crop], () => glyphs)
    // (no character of the SVG under it: a crop's copy text is no drawn text)
    const m = run({ records: [rec], sources: [{ annots: [[1, 0]] }], drawn: () => '', crops, reference: () => '12' })
    expect(m).toMatchObject({ linksTrueN: 1, linksWrong: 0, where: { linksTrue: [] } })
    expect(run({ records: [rec], sources: [{ annots: [[1, 0]] }], drawn: () => '', crops, reference: () => '13' }).linksTrueN).toBe(0)
  })
  it('reads no crop whose source box misses the annotation\'s rectangle: a crop of another place\'s "12" shows nothing of this link', () => {
    const rec = moved('cite.a', [305, 401, 316, 405])
    const elsewhere = [{ srcPage: 1, src: [100, 500, 140, 512], chars: [{ x: 307.5, y: 402.5, ch: '1' }, { x: 312.5, y: 402.5, ch: '2' }] }]
    expect(run({ records: [rec], sources: [{ annots: [[1, 0]] }], drawn: () => '', crops: elsewhere, reference: () => '12' })).toMatchObject({ linksTrueN: 0, where: { linksTrue: ['0'] } })
    // (nor one of the annotation's place on another page)
    const otherPage = [{ ...elsewhere[0]!, srcPage: 2, src: [95, 695, 135, 715] }]
    expect(run({ records: [rec], sources: [{ annots: [[1, 0]] }], drawn: () => '', crops: otherPage, reference: () => '12' }).linksTrueN).toBe(0)
  })
  it('never reads a crop\'s transparent copy text as drawn', () => {
    const tspan = (text: string, opacity: string | null, x: number) => ({ textContent: text, getAttribute: (k: string) => (k === 'fill-opacity' ? opacity : null), getNumberOfChars: () => text.length, getStartPositionOfChar: (i: number) => ({ x: x + 10 * i, y: 100 }), getEndPositionOfChar: (i: number) => ({ x: x + 10 * i + 10, y: 100 }) })
    const svg = { querySelectorAll: () => [tspan('ab', null, 0), tspan('keys', '0', 50)] }
    expect(drawnCharsOf(svg as never, (x, y) => ({ x, y })).map(c => c.ch)).toEqual(['a', 'b'])
  })
})

describe('the reference: overlaid text, or the translation\'s pair text where the link text is translated', () => {
  const annots = annotationsOf([
    raw({ rect: [100, 700, 130, 712], url: 'https://example.org/a?b=1', dest: undefined, overlaidText: 'our website' }),
    raw({ rect: [100, 680, 130, 692], dest: 'section.3', overlaidText: 'Section 3' }),
    raw({ rect: [100, 660, 130, 672], dest: 'cite.k', overlaidText: '21' }),
  ])
  const all = annots.links.filter(a => a.ok)
  const at = (a: Annot) => { const [x0, y0, x1, y1] = a.rect as number[]; return [{ x: (x0! + x1!) / 2, y: (y0! + y1!) / 2, ch: 'x' }] }
  const base = { all, points: at, segment: () => false, owner: () => 7, pairsOf: () => [] as { src: string; text: string }[] }
  it('is PDF.js\'s overlaid text where the glyphs lie in a placeholder\'s segment or on no unit\'s line', () => {
    expect(referenceOf([all[2]!], { ...base, segment: () => true })).toBe('21')
    expect(referenceOf([all[2]!], { ...base, owner: () => null })).toBe('21')
    // joined in order for a merged record
    expect(referenceOf([all[2]!, all[1]!], { ...base, owner: () => null })).toBe('21Section 3')
  })
  it('is the pair text of the \\href with the annotation\'s URL', () => {
    const pairs = pairsOf([{ t: 'text', s: 'Voir ' }, { t: 'open', id: 1, src: '\\href{https://example.org/a?b=1}{our website}' }, { t: 'text', s: 'notre site' }, { t: 'close', id: 1 }, { t: 'text', s: '.' }])
    expect(pairs).toEqual([{ src: '\\href{https://example.org/a?b=1}{our website}', text: 'notre site', k: null }])
    expect(referenceOf([all[0]!], { ...base, pairsOf: () => pairs })).toBe('notre site')
  })
  it('is the owner\'s i-th \\hyperref or \\hyperlink pair, where the pairs are as many as its internal links', () => {
    const pairs = pairsOf([
      { t: 'open', id: 1, src: '\\hyperref[a]{Section 3}' }, { t: 'text', s: 'section 3 (fr)' }, { t: 'close', id: 1 },
      { t: 'open', id: 2, src: '\\hyperlink{cite.k}{21}' }, { t: 'text', s: 'vingt et un' }, { t: 'close', id: 2 },
    ], [1, -1, 1, 4, -1, 4])
    expect(referenceOf([all[1]!], { ...base, pairsOf: () => pairs })).toBe('section 3 (fr)')
    expect(referenceOf([all[2]!], { ...base, pairsOf: () => pairs })).toBe('vingt et un')
    // fewer pairs than internal links: not found
    expect(referenceOf([all[2]!], { ...base, pairsOf: () => pairs.slice(0, 1) })).toBeNull()
    // no pair for the URL: not found
    expect(referenceOf([all[0]!], { ...base, pairsOf: () => pairs })).toBeNull()
  })
  it('tells two \\href pairs with one URL apart by the annotation\'s rank among the owner\'s annotations with that URL', () => {
    const two = annotationsOf([
      raw({ rect: [100, 700, 130, 712], url: 'https://example.org/a', dest: undefined, overlaidText: 'here' }),
      raw({ rect: [100, 680, 130, 692], url: 'https://example.org/a', dest: undefined, overlaidText: 'there' }),
    ])
    const both = two.links.filter(a => a.ok)
    const pairs = pairsOf([
      { t: 'open', id: 1, src: '\\href{https://example.org/a}{here}' }, { t: 'text', s: 'ici' }, { t: 'close', id: 1 },
      { t: 'open', id: 2, src: '\\href{https://example.org/a}{there}' }, { t: 'text', s: 'la-bas' }, { t: 'close', id: 2 },
    ], [0, -1, 0, 3, -1, 3])
    const ctx = { ...base, all: both, points: (a: Annot) => [{ x: 1, y: a.i, ch: 'x' }], pairsOf: () => pairs }
    expect(referenceOf([both[0]!], ctx)).toBe('ici')
    expect(referenceOf([both[1]!], ctx)).toBe('la-bas')
    // (one pair of the URL: every annotation of it its text, a link text TeX broke over two lines being an annotation a line;
    // the record that merges them has it once)
    expect(referenceOf([both[1]!], { ...ctx, pairsOf: () => pairs.slice(0, 1) })).toBe('ici')
    expect(referenceOf([both[0]!, both[1]!], { ...ctx, pairsOf: () => pairs.slice(0, 1) })).toBe('ici')
    // (the pairs made anew at every ask, as the page's context makes them: still once)
    const pieces = [{ t: 'open', id: 1, src: '\\href{https://example.org/a}{here}' }, { t: 'text', s: 'ici' }, { t: 'close', id: 1 }]
    expect(referenceOf([both[0]!, both[1]!], { ...ctx, pairsOf: () => pairsOf(pieces) })).toBe('ici')
    // (two pairs of the URL with no place in the source to order them by: not found)
    expect(referenceOf([both[0]!], { ...ctx, pairsOf: () => pairsOf([{ t: 'open', id: 1, src: '\\href{https://example.org/a}{x}' }, { t: 'close', id: 1 }, { t: 'open', id: 2, src: '\\href{https://example.org/a}{y}' }, { t: 'close', id: 2 }]) })).toBeNull()
    // (more annotations of the URL than pairs, and more than one pair: not found)
    const three = annotationsOf([0, 1, 2].map(k => raw({ rect: [100, 700 - 20 * k, 130, 712 - 20 * k], url: 'https://example.org/a', dest: undefined, overlaidText: 'x' }))).links.filter(a => a.ok)
    expect(referenceOf([three[2]!], { ...ctx, all: three })).toBeNull()
  })
  it('reads the pairs in the SOURCE\'s order: a translation that sets two \\hyperref pairs the other way gives each link its own text', () => {
    const two = annotationsOf([
      raw({ rect: [100, 700, 130, 712], dest: 'section.a', overlaidText: 'A' }),
      raw({ rect: [100, 680, 130, 692], dest: 'section.b', overlaidText: 'B' }),
    ]).links.filter(a => a.ok)
    // (the translation sets B's pair (source index 5) before A's (source index 2))
    const pieces = [{ t: 'open', id: 2, src: '\\hyperref[b]{B}' }, { t: 'text', s: 'bee' }, { t: 'close', id: 2 }, { t: 'open', id: 1, src: '\\hyperref[a]{A}' }, { t: 'text', s: 'ay' }, { t: 'close', id: 1 }]
    const ctx = { ...base, all: two, points: (a: Annot) => [{ x: 1, y: a.i, ch: 'x' }], pairsOf: () => pairsOf(pieces, [5, -1, 5, 2, -1, 2]) }
    expect(referenceOf([two[0]!], ctx)).toBe('ay')
    expect(referenceOf([two[1]!], ctx)).toBe('bee')
    // (with no source index for them, no reference: never the translation's order)
    expect(referenceOf([two[0]!], { ...ctx, pairsOf: () => pairsOf(pieces) })).toBeNull()
  })
  it('is the overlaid text of a link of a unit with no pair: only a pair\'s text is a link\'s own translated text', () => {
    // (a glyph off every segment on a unit's line: the unit has no pair, so the link is over its placeholders' ink)
    expect(referenceOf([all[1]!], { ...base, segment: () => false, owner: () => 7, pairsOf: () => [] })).toBe('Section 3')
  })
  it('reads a glyph at its middle and within a third of its size across, by its letters and digits where it has any', () => {
    const pairs = pairsOf([{ t: 'open', id: 1, src: '\\hyperref[a]{Section 3}' }, { t: 'text', s: 'section 3 (fr)' }, { t: 'close', id: 1 }])
    const seg = [104, 700, 106, 708]
    const asked: number[][] = []
    const segment = (x: number, y: number, d = 0) => { asked.push([x, y, d]); return x >= seg[0]! - d && x <= seg[2]! + d && y >= seg[1]! && y <= seg[3]! }
    // ('3' at 107 on its baseline at 700, size 10: read at 703, 3 across; the full stop after it is no letter, and not read)
    const points = () => [{ x: 107, y: 700, ch: '3', size: 10 }, { x: 112, y: 700, ch: '.', size: 10 }]
    expect(referenceOf([all[2]!], { ...base, points, segment, pairsOf: () => pairs })).toBe('21')
    expect(asked).toEqual([[107, 703, 3]])
  })
  it('reads each annotation with its own page\'s TeX\'s file and glyphs', () => {
    const p1 = { ...base, owner: () => null }, p2 = { ...base, segment: () => true }
    const a = { ...all[2]!, page: 1 }, b = { ...all[1]!, page: 2 }
    const pages: number[] = []
    expect(referenceOf([a, b], (q?: number) => { pages.push(q!); return q === 1 ? p1 : p2 })).toBe('21Section 3')
    expect(pages).toEqual([1, 2])
    expect(referenceOf([a, b], () => null)).toBeNull()
  })
  it('reads an \\href\'s URL as a URL, TeX\'s escapes undone', () => {
    expect(hrefUrlOf('\\href{https://example.org/a_b\\_c?x=1\\&y=2}{t}')).toBe('https://example.org/a_b_c?x=1&y=2')
    expect(hrefUrlOf('\\href*{https://example.org/s}{t}')).toBe('https://example.org/s')
    expect(hrefUrlOf('\\hyperref[a]{t}')).toBeNull()
    expect(hrefUrlOf('\\href{not a url}{t}')).toBeNull()
  })
})

describe('the composed document against arXiv\'s', () => {
  const page = () => [raw(), raw({ rect: [10, 20, 30, 40], dest: 'cite.z', overlaidText: '3' })]
  it('is equal where the Link annotations are, whatever else the add-on appended', () => {
    expect(composedDiff([page(), page()], [page(), page()])).toEqual([])
    // (a non-link annotation does not count)
    expect(composedDiff([page()], [[...page(), { subtype: 'Widget' }]])).toEqual([])
  })
  it('names the pages that differ in a rectangle, a destination, a url, a border width, a colour, overlaid text or quads', () => {
    for (const change of [{ rect: [100, 700, 131, 710] }, { dest: 'cite.q' }, { dest: undefined, url: 'https://a.org' }, { borderStyle: { width: 2, style: 1 } }, { color: [255, 0, 0] }, { overlaidText: '13' }, { quadPoints: Float32Array.from([0, 1, 2, 1, 0, 0, 2, 0]) }]) {
      expect(composedDiff([page(), page()], [page(), [raw(change), page()[1]]])).toEqual([2])
    }
    // a border style alone (solid to dashed)
    expect(composedDiff([page()], [[raw({ borderStyle: { width: 1, style: 2 } }), page()[1]]])).toEqual([1])
    // an annotation less on a page; a page missing from the composed document
    expect(composedDiff([page()], [page().slice(1)])).toEqual([1])
    expect(composedDiff([page(), page()], [page()])).toEqual([2])
  })
})

describe('the measures in the record and the merge rule', () => {
  const m = (key: string): Measure => {
    const x = MEASURES.find(r => r[0] === key)
    if (!x) throw new Error(key)
    return x
  }
  it('has the three model rows: two shares that can only rise and a defect', () => {
    expect(m('linksKept')).toMatchObject({ 1: 'model', 2: 'share', 3: 'up' })
    expect(m('linksTrue')).toMatchObject({ 1: 'model', 2: 'share', 3: 'up' })
    expect(m('linksWrong')).toMatchObject({ 1: 'model', 2: 'defect', 3: 'down' })
  })
  /** a page's model as pageEntry reads it, with the link values (the minimum a page holds) */
  const model = (links: Record<string, number>) => ({
    model: { units: { textOn: 0, textDrawn: 0, cellsOn: 0, cellsDrawn: 0, left: {} }, fills: [], geo: [], gaps: [], cropForeign: 0, wrongPageText: 0, droppedPh: 0, modelCells: 1000, ...links },
    check: { missing: [], twice: [], brackets: [], duplicated: [], clipped: 0, numbers: { total: 0, shown: 0 } }, where: {}, style: [0, 0], drawn: 0,
  })
  const entries = (list: Record<string, number>[], tier: 'model' = 'model') => {
    const made = list.map((links, i) => pageEntry(i + 1, model(links), null))
    return fixtureTotals(made.map(e => e.entry), made.map(e => e.frames), tier)
  }
  it('sums a fixture\'s counts and makes the shares of them: kept over the original\'s links, true over the moved records', () => {
    const t = entries([{ linksTotal: 10, linksUnsupported: 1, linksPlaceable: 8, linksKeptN: 4, linksMoved: 3, linksInPlace: 1, linksTrueN: 3 }, { linksTotal: 5, linksKeptN: 1, linksMoved: 1, linksTrueN: 0, linksWrong: 1 }])
    expect(t).toMatchObject({ linksTotal: 15, linksUnsupported: 1, linksPlaceable: 8, linksKeptN: 5, linksMoved: 4, linksInPlace: 1, linksTrueN: 3, linksWrong: 1 })
    expect(t.linksKept).toBeCloseTo(5 / 15, 4)
    expect(t.linksTrue).toBeCloseTo(3 / 4, 4)
  })
  it('has no value where there is nothing to share: no link in the original, no moved record', () => {
    const t = entries([{ linksTotal: 0 }, { linksTotal: 0 }])
    expect(t.linksKept).toBeNull()
    expect(t.linksTrue).toBeNull()
    const base = entries([{ linksTotal: 12, linksKeptN: 0 }])
    expect(base.linksKept).toBe(0)
    expect(base.linksTrue).toBeNull()
    // (the baseline of next: kept 0 of the original's, true not applicable)
    expect(worse(m('linksKept'), base, base, 'model')).toMatchObject({ worse: false, better: false })
    expect(worse(m('linksTrue'), base, base, 'model')).toBeNull()
    expect(worse(m('linksKept'), t, base, 'model')).toBeNull()
  })
  it('pools the counts over fixtures, shares from the pooled counts', () => {
    const a = entries([{ linksTotal: 10, linksKeptN: 9 }]), b = entries([{ linksTotal: 30, linksKeptN: 15 }])
    const all = pooled([a, b], 'model') as Totals
    expect(all.linksTotal).toBe(40)
    expect(all.linksKept).toBeCloseTo(24 / 40, 4)
  })
  it('holds a share to the record: a fall of more than 0.2 points is a regression, a rise is better, a page that fell is listed', () => {
    const rec = { 'x-zh': { totals: entries([{ linksTotal: 100, linksKeptN: 90, linksMoved: 50, linksTrueN: 49 }]), pages: [pageEntry(1, model({ linksTotal: 100, linksKeptN: 90, linksMoved: 50, linksTrueN: 49 }), null).entry] } }
    const down = { 'x-zh': { totals: entries([{ linksTotal: 100, linksKeptN: 89, linksMoved: 50, linksTrueN: 49 }]), pages: [pageEntry(1, model({ linksTotal: 100, linksKeptN: 89, linksMoved: 50, linksTrueN: 49 }), null).entry] } }
    const c = compare(rec, down, 'model')
    expect(c.regressions.map(r => r.measure)).toEqual(['linksKept'])
    expect(c.pages).toEqual([{ fixture: 'x-zh', page: 1, worse: ['linksKept'], better: [] }])
    expect(compare(down, rec, 'model').improvements.map(r => r.measure)).toEqual(['linksKept'])
    expect(compare(rec, rec, 'model').regressions).toEqual([])
  })
  it('holds the defect to the record as a rate per 1,000 cells, any rise a regression', () => {
    const rec = { 'x-zh': { totals: entries([{ linksTotal: 4, linksWrong: 0 }]), pages: [] } }
    const bad = { 'x-zh': { totals: entries([{ linksTotal: 4, linksWrong: 1 }]), pages: [] } }
    expect(compare(rec, bad, 'model').regressions.map(r => r.measure)).toEqual(['linksWrong'])
    expect(compare(bad, bad, 'model').regressions).toEqual([])
  })
  it('compares a record made before the measures (no link values) with nothing: not applicable, no regression', () => {
    const old = { 'x-zh': { totals: { ...entries([{}]), linksKept: undefined, linksTrue: undefined } as Totals, pages: [] } }
    const now = { 'x-zh': { totals: entries([{ linksTotal: 4, linksKeptN: 0 }]), pages: [] } }
    expect(compare(old, now, 'model').regressions).toEqual([])
  })
})

describe('the links\' minimums, 3a-2: kept and true per output', () => {
  const output = (t: Record<string, number | null>, pages: unknown[] = [], summary: Record<string, unknown> = {}) => ({ totals: { pages: 12, numbersShown: 3, numbersTotal: 3, linksWrong: 0, ...t } as unknown as Totals, pages, summary })
  it('fails an output below a minimum, with its misses listed, and passes one at it or with nothing to share', () => {
    expect(LINKS_MIN).toEqual({ kept: 0.95, true: 0.98 })
    const rows = completenessRows({ fixtures: {
      at: output({ linksKept: 0.95, linksTrue: 0.98 }),
      none: output({ linksKept: null, linksTrue: null }),
      low: output({ linksKept: 0.9, linksTrue: 0.5 }, [{ p: 3, where: { linksTrue: ['0', '4'] } }, { p: 4, where: {} }], { linksLost: ['3:1', '5:2'] }),
    } } as never, 'model')
    const row = (n: string) => rows.find(r => r.name === n)!
    expect(row('at').fails).toEqual([])
    expect(row('none').fails).toEqual([])
    expect(row('none').linksKept).toBeUndefined()
    expect(row('low').fails).toEqual(['linksKept', 'linksTrue'])
    expect(row('low').linksLost).toEqual(['3:1', '5:2'])
    expect(row('low').linksFalse).toEqual(['3:0', '3:4'])
  })
  it('lists each wrong link\'s page, rank and reasons', () => {
    const rows = completenessRows({ fixtures: { w: output({ linksWrong: 2 }, [{ p: 2, where: { linksWrong: ['1:name', 'p1/0:twice'] } }]) } } as never, 'model')
    expect(rows[0]!.fails).toEqual(['linksWrong'])
    expect(rows[0]!.linksWrongAt).toEqual(['p2:1:name', 'p2:p1/0:twice'])
  })
  it('shares true over the moved records that can be measured', () => {
    const page = pageEntry(1, { model: { units: { textOn: 0, textDrawn: 0, cellsOn: 0, cellsDrawn: 0, left: {} }, fills: [], geo: [], gaps: [], cropForeign: 0, wrongPageText: 0, droppedPh: 0, modelCells: 1000, linksTotal: 4, linksKeptN: 4, linksMoved: 4, linksTrueN: 2, linksUnverified: 2 }, check: { missing: [], twice: [], brackets: [], duplicated: [], clipped: 0, numbers: { total: 0, shown: 0 } }, where: {}, style: [0, 0], drawn: 0 } as never, null)
    const t = fixtureTotals([page.entry], [page.frames], 'model')
    expect(t.linksTrue).toBe(1)
    expect(t.linksUnverified).toBe(2)
  })
})

describe('the completeness gate: links that are wrong, at 0 from the first pull request', () => {
  const output = (links: number) => ({ totals: { pages: 12, numbersShown: 3, numbersTotal: 3, linksWrong: links } as unknown as Totals })
  it('fails an output with a wrong link, and passes one without', () => {
    const rows = completenessRows({ fixtures: { a: output(0), b: output(2) } }, 'model')
    expect(rows.find(r => r.name === 'a')!.fails).toEqual([])
    expect(rows.find(r => r.name === 'b')!.fails).toEqual(['linksWrong'])
    expect(rows.find(r => r.name === 'b')!.linksWrong).toBe(2)
  })
  it('keeps the other checks as they were', () => {
    const rows = completenessRows({ fixtures: { a: { totals: { pages: 1, missing: 1, numbersShown: 2, numbersTotal: 3 } as unknown as Totals } } }, 'model')
    expect(rows[0]!.fails).toEqual(['missing', 'numbers'])
    expect(rows[0]!.linksWrong).toBe(0)
  })
})
