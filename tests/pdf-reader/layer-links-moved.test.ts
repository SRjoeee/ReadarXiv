import { beforeAll, describe, expect, it } from 'vitest'
import { type Annot, freezeLinks, type LinkCandidate, linkKindOf, type LinkTarget, matchUnit, ownedIn, ownersOf, placeUnit } from '@/pdf-reader/engine/layer-proto/links.mjs'
import { tokenBand } from '@/pdf-reader/engine/layer-proto/words.mjs'
import { BUILTIN_RULES, resolveRules } from '@/pdf-reader/engine/rules/layout.mjs'

// The links moved with the text the layer redraws (PR 3a-2; the 3a design §3.2 to §3.4, §5): a unit's annotations owned (the
// first unit of the page's growth rank whose rectangles hold more than half of an annotation's points), matched to its pieces
// (geometry, a citation's key, a url, the order of a kind; ambiguous: none) and placed over what is drawn of them, from the
// layout's own numbers (the run's walk the SVG draws by, layer2.mjs lineRuns and runEdge, and the word table's bands). Units laid by the engine's own
// tokensOf2 and layoutUnit2 at 10 pt in a canvas that measures a character as half an em (a CJK one as one), so that every box
// is a number the test can write down: LK1 to LK6 and LK13 here, LK10 and LK14 over a run (layer-proto-moved-links.test.ts)

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
let L2: L2
beforeAll(async () => {
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: [...s].reduce((w, ch) => w + (/[\u3000-\u9fff]/.test(ch) ? 100 : 50), 0), actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
})

const BASE = { fam: 'serif', bold: false, italic: false, caps: false, design: 'times', known: true }
const DESIGNS = { serif: 'times', sans: 'helvetica', mono: 'courier' }
type Piece = { t: string; s?: string; tr?: boolean; src?: string; id?: number }
const text = (s: string): Piece => ({ t: 'text', tr: true, s })
const ph = (src: string): Piece => ({ t: 'ph', src })
/** n lines 12 pt apart down from 500 on page `page`, `width` wide from x 100 */
const block = (n: number, width = 200, page = 2) => {
  const B = Array.from({ length: n }, (_, k) => 500 - 12 * k)
  return { page, rects: B.map(b => [page, 100, b - 2, 100 + width, b + 8]), x0: 100, x1: 100 + width, B, exact: B.map(() => true), sizes: B.map(() => 10), pitch0: 12, free: 0, indent: 0, after: 0, centred: false }
}
/** a unit laid in Chinese: its tokens (its placeholders drawn as `res` says, by piece index) and its layout over its blocks */
function lay(pieces: Piece[], res: Record<number, { mode: string; text: string; sup?: boolean }>, blocks = [block(3)]) {
  const resolved = new Map(Object.entries(res).map(([k, r]) => [Number(k), { ...r, k: Number(k) }]))
  const params = { ...resolveRules(BUILTIN_RULES, 'zh').params, hyphen: 0 }
  const tokens = L2.tokensOf2({ kind: 'para', pieces } as never, resolved as never, 'zh', BASE as never, DESIGNS, params as never, null, undefined, true)
  return L2.layoutUnit2(tokens, blocks as never, 10, params as never)
}
/** what placeUnit reads of a layout: its lines and their runs, the run's edges and the word table's bands */
const placing = (L: ReturnType<typeof lay>) => ({ lines: L.lines.map(line => ({ line, runs: L2.lineRuns(line as never, L as never) })), edge: (line: unknown, run: unknown, at: number) => L2.runEdge(run as never, at, line as never, L as never), band: (t: unknown, line: { baseline: number }) => tokenBand(t as never, L as never, line.baseline), scale: L.scale }) as unknown as Pick<Parameters<typeof placeUnit>[0], 'lines' | 'edge' | 'band' | 'scale'>
/** an annotation of page q as annotsOf keeps it: its engine characters (and their keys on the page) under it */
const ann = (i: number, target: { dest?: string; url?: string }, chars: string, keys: string[] = [], rect = [0, 0, 1, 1], ov = chars): Annot => ({ i, rect, boxes: [rect], ...target, ov, border: null, g: { x: [], y: [], ch: [] }, g2: { x: keys.map(() => 0), y: keys.map(() => 0), ch: [...chars], key: keys } })
const cand = (a: Annot, q = 1): LinkCandidate => ({ q, a })
/** a target: a placeholder k of the unit's, drawn as text unless told otherwise */
const target = (k: number, o: Partial<LinkTarget> = {}): LinkTarget => ({ ord: k, k, kind: null, single: true, gap: null, segs: null, draw: 'text', ...o })
/** the text drawn on a layout's lines between two PDF x, by its items (a character's middle inside) */
function drawnBetween(L: ReturnType<typeof lay>, page: number, b: number[], drift = 1) {
  const box = b as [number, number, number, number]
  // (a browser laying a run's glyphs `drift` times as wide as the layout measured them, from the run's own start)
  const measure = (t: string) => [...t].reduce((w, ch) => w + (/[\u3000-\u9fff]/.test(ch) ? 100 : 50), 0) * drift
  let out = ''
  for (const line of L.lines) {
    if (line.page !== page || !(line.baseline > box[1] && line.baseline < box[3])) continue
    for (const run of L2.lineRuns(line as never, L as never)) {
      if ('crop' in run && run.crop !== undefined) continue
      const r = run as import('@/pdf-reader/engine/layer-proto/layer2.mjs').LineRun
      let at = 0
      for (const ch of r.text) {
        const mid = (L2.runEdge(r, at, line as never, L as never, measure as never) + L2.runEdge(r, at + ch.length, line as never, L as never, measure as never)) / 2
        if (/\S/.test(ch) && mid > box[0] && mid < box[2]) out += ch
        at += ch.length
      }
    }
  }
  return out
}
const gapOf = (q: number, item: number, n: number) => new Set(Array.from({ length: n }, (_, k) => `${q}|${item}|${k}`))
/** a text's letters and digits, as the gate compares a link's name with what is drawn under it */
const letters = (t: string) => t.replace(/[^\p{L}\p{N}]/gu, '')

describe('LK1: one annotation a number of a citation drawn as the page wrote it', () => {
  it('"[21, 41]": two records, over the drawn "21" and "41" alone, named by them', () => {
    const L = lay([text('\u89c1'), ph('\\cite{a,b}'), text('\u3002')], { 1: { mode: 'orig-text', text: '[21, 41]' } })
    const a = ann(0, { dest: 'cite.a' }, '21', ['5|1', '5|2']), b = ann(1, { dest: 'cite.b' }, '41', ['5|5', '5|6'])
    const m = matchUnit({ cands: [cand(a), cand(b)], targets: [target(1, { kind: 'cite', keys: ['a', 'b'], gap: gapOf(1, 5, 8) })] })
    expect(m.groups.map(g => g.annots.map(c => [c.a.i, c.tier]))).toEqual([[[0, 'geometry'], [1, 'geometry']]])
    const { records, tried } = placeUnit({ groups: m.groups, ...placing(L) })
    expect(tried).toEqual([])
    expect(records.map(r => [r.rec.name, r.rec.dest, r.rec.moved, r.page, r.sources])).toEqual([['21', 'cite.a', true, 2, { annots: [[1, 0]], tier: 'geometry' }], ['41', 'cite.b', true, 2, { annots: [[1, 1]], tier: 'geometry' }]])
    for (const r of records) {
      expect(r.rec.boxes.length).toBe(4)
      expect(letters(drawnBetween(L, 2, r.rec.boxes))).toBe(r.rec.name)
    }
    // ("[21," starts after the CJK character's em, 110, and ends at 130, "41]" starts after the space, at 135: the box of "21" is
    // from its "2", 115 (never the "[", where the run before drifts to), carried over its "," and on to where "41]" starts; that
    // of "41" from its "4", 135; the line's band)
    const [x0, y0, x1, y1] = records[0]!.rec.boxes
    expect([x0, x1]).toEqual([115, 135])
    expect(records[1]!.rec.boxes[0]).toBe(135)
    expect([y0!, y1!].map(v => Math.round(v * 100) / 100)).toEqual([497.8, 507.5])
  })
})

describe('LK2: a link TeX broke over two lines', () => {
  const pieces = [text('\u5982'), ph('\\citet{radford}'), text('\u6240\u793a')]
  const halves = () => [ann(0, { dest: 'cite.radford' }, 'Rad-', ['7|0', '7|1', '7|2', '7|3'], [0, 0, 1, 1]), ann(1, { dest: 'cite.radford' }, 'ford et al.', ['8|0', '8|1', '8|2', '8|3', '8|5', '8|6', '8|8', '8|9', '8|10'])]
  const gap = new Set([...gapOf(1, 7, 4), ...gapOf(1, 8, 11)])
  it('drawn on one line: the two halves are one record, one box, named as drawn', () => {
    const L = lay(pieces, { 1: { mode: 'orig-text', text: 'Radford et al.' } })
    const m = matchUnit({ cands: halves().map(a => cand(a)), targets: [target(1, { kind: 'cite', keys: ['radford'], gap })] })
    const { records } = placeUnit({ groups: m.groups, ...placing(L) })
    expect(records.length).toBe(1)
    expect(records[0]!.rec.boxes.length).toBe(4)
    expect(records[0]!.rec.name).toBe('Radford et al.')
    expect(records[0]!.sources.annots).toEqual([[1, 0], [1, 1]])
    expect(drawnBetween(L, 2, records[0]!.rec.boxes)).toBe('Radfordetal.')
  })
  it('drawn over two lines: one record, two boxes', () => {
    // (a narrow block: "Radford" ends the first line, "et al." opens the next)
    const L = lay([text('\u5982\u5982\u5982\u5982\u5982\u5982\u5982'), ph('\\citet{radford}'), text('\u6240\u793a')], { 1: { mode: 'orig-text', text: 'Radford et al.' } }, [block(3, 110)])
    const m = matchUnit({ cands: halves().map(a => cand(a)), targets: [target(1, { kind: 'cite', keys: ['radford'], gap })] })
    const { records } = placeUnit({ groups: m.groups, ...placing(L) })
    expect(L.lines.length).toBeGreaterThan(1)
    expect(records.length).toBe(1)
    const b = records[0]!.rec.boxes
    expect(b.length).toBe(8)
    expect(b[1]! > b[5]!).toBe(true)
    expect(drawnBetween(L, 2, b.slice(0, 4)) + drawnBetween(L, 2, b.slice(4))).toBe('Radfordetal.')
  })
  it('a natbib name and year, one target with a mark between them, are two records', () => {
    const L = lay([text('\u5982'), ph('\\citet{peters}'), text('\u6240\u793a')], { 1: { mode: 'orig-text', text: 'Peters et al. (2018a)' } })
    const name = ann(0, { dest: 'cite.peters' }, 'Peters et al.', ['3|0', '3|1', '3|2', '3|3', '3|4', '3|5', '3|7', '3|8', '3|10', '3|11', '3|12']), year = ann(1, { dest: 'cite.peters' }, '2018a', ['3|15', '3|16', '3|17', '3|18', '3|19'])
    const m = matchUnit({ cands: [cand(name), cand(year)], targets: [target(1, { kind: 'cite', keys: ['peters'], gap: gapOf(1, 3, 21) })] })
    const { records } = placeUnit({ groups: m.groups, ...placing(L) })
    expect(records.map(r => r.rec.name)).toEqual(['Peters et al.', '2018a'])
    expect(records.map(r => letters(drawnBetween(L, 2, r.rec.boxes)))).toEqual(['Petersetal', '2018a'])
  })
  it('two halves drawn otherwise (their borders) are two records, each its own border', () => {
    const L = lay(pieces, { 1: { mode: 'orig-text', text: 'Radford et al.' } })
    const [h0, h1] = halves()
    const boxed = { ...h1!, border: { width: 1, rgb: [255, 0, 0], style: 'solid' as const } }
    const m = matchUnit({ cands: [cand(h0!), cand(boxed)], targets: [target(1, { kind: 'cite', keys: ['radford'], gap })] })
    const { records } = placeUnit({ groups: m.groups, ...placing(L) })
    expect(records.map(r => [r.rec.name, r.rec.border ?? null])).toEqual([['Rad', null], ['ford et al.', { width: 1, rgb: [255, 0, 0], style: 'solid' }]])
  })
})

describe('LK3: a link over a crop', () => {
  // (a crop of 60 x 15 of page 3 at the layout's scale, its baseline 500, drawn where the line puts it)
  const crop = { mode: 'crop', k: 2, page: 3, crop: [200, 495, 260, 510], baseline: 500, text: 'https://x.org/a' }
  const L = { f: 10, s: 10, scale: 0.8, state: { track: 0, trackLatin: 0 }, lines: [{ page: 4, baseline: 400, x0: 100, items: [{ t: { crop, cw: 60, w100: 0 }, x: 150, w: 48 }] }] }
  const where = { lines: L.lines.map(line => ({ line, runs: [{ crop: 0 }] })), edge: () => 0, band: () => ({ top: 0, bottom: 0 }), scale: 0.8 } as never
  it('is the annotation\'s rectangle mapped by the crop\'s own map, inside the drawn box, named by the crop\'s text', () => {
    const a = ann(0, { url: 'https://x.org/a' }, 'https://x.org/a', ['1|0'], [210, 497, 250, 507])
    const { records, tried } = placeUnit({ groups: [{ to: target(2, { kind: 'url', url: 'https://x.org/a', draw: 'crop' }), annots: [{ ...cand(a, 3), tier: 'url' }] }], ...(where as object) } as never)
    expect(tried).toEqual([])
    expect(records[0]!.page).toBe(4)
    expect(records[0]!.rec.boxes.map(v => Math.round(v * 100) / 100)).toEqual([158, 397.6, 190, 405.6])
    expect(records[0]!.rec.name).toBe('https://x.org/a')
    // (one past the crop's box is cut to it)
    const wide = ann(1, { url: 'https://x.org/a' }, 'x', ['1|1'], [190, 490, 270, 520])
    expect(placeUnit({ groups: [{ to: target(2, { draw: 'crop' }), annots: [{ ...cand(wide, 3), tier: 'url' }] }], ...(where as object) } as never).records[0]!.rec.boxes).toEqual([150, 396, 198, 408])
    // (an annotation over two lines of the crop, its quads two boxes: each mapped, never the rectangle round both)
    const quads = { ...ann(2, { url: 'https://x.org/a' }, 'x', ['1|2'], [200, 495, 260, 510]), boxes: [[230, 503, 260, 509], [200, 496, 220, 502]] }
    const two = placeUnit({ groups: [{ to: target(2, { draw: 'crop' }), annots: [{ ...cand(quads, 3), tier: 'url' }] }], ...(where as object) } as never).records[0]!.rec.boxes
    expect(two.map(v => Math.round(v * 100) / 100)).toEqual([174, 402.4, 198, 407.2, 150, 396.8, 166, 401.6])
    // (an annotation of another page than the crop's source is placed nowhere)
    expect(placeUnit({ groups: [{ to: target(2, { draw: 'crop' }), annots: [{ ...cand(a, 2), tier: 'url' }] }], ...(where as object) } as never).tried).toEqual([{ q: 2, i: 0, why: 'unplaced' }])
  })
  it("over a formula TeX broke over lines, drawn as its crops one a line: each box by the map of the part it lies in", () => {
    // its first line's part (x 200-260 on page 3) drawn on page 4's line at 400 from x 150, its second's (x 100-130) on the line
    // at 388 from x 100: an annotation over the second part (its own box) placed by the second's map, one over both two boxes
    const part = (crop: number[], baseline: number, part: number) => ({ mode: 'crop', k: 2, page: 3, crop, baseline, part, text: part ? '' : 'x+y' })
    const two = { f: 10, s: 10, scale: 0.8, state: { track: 0, trackLatin: 0 }, lines: [
      { page: 4, baseline: 400, x0: 100, items: [{ t: { crop: part([200, 495, 260, 510], 500, 0), cw: 60, w100: 0 }, x: 150, w: 48 }] },
      { page: 4, baseline: 388, x0: 100, items: [{ t: { crop: part([100, 483, 130, 498], 488, 1), cw: 30, w100: 0 }, x: 100, w: 24 }] },
    ] }
    const at = { lines: two.lines.map(line => ({ line, runs: [{ crop: 0 }] })), edge: () => 0, band: () => ({ top: 0, bottom: 0 }), scale: 0.8 } as never
    const second = ann(3, { url: 'https://x.org/a' }, 'y', ['1|3'], [110, 485, 120, 495])
    const one = placeUnit({ groups: [{ to: target(2, { draw: 'crop' }), annots: [{ ...cand(second, 3), tier: 'url' }] }], ...(at as object) } as never)
    expect(one.tried).toEqual([])
    expect(one.records[0]!.li).toBe(1)
    expect(one.records[0]!.rec.boxes.map(v => Math.round(v * 100) / 100)).toEqual([108, 385.6, 116, 393.6])
    const both = { ...ann(4, { url: 'https://x.org/a' }, 'x+y', ['1|4']), boxes: [[230, 497, 260, 507], [100, 485, 120, 495]] }
    const b = placeUnit({ groups: [{ to: target(2, { draw: 'crop' }), annots: [{ ...cand(both, 3), tier: 'url' }] }], ...(at as object) } as never).records[0]!
    expect(b.li).toBe(0)
    expect(b.rec.boxes.map(v => Math.round(v * 100) / 100)).toEqual([174, 397.6, 198, 405.6, 100, 385.6, 116, 393.6])
  })
  it('a crop not drawn takes none: its annotation is the freeze\'s (over erased ink, dropped)', () => {
    const a = ann(0, { url: 'https://x.org/a' }, 'h', ['1|0'])
    const m = matchUnit({ cands: [cand(a)], targets: [target(2, { kind: 'url', url: 'https://x.org/a', gap: gapOf(1, 1, 3), draw: null })] })
    expect(m.groups).toEqual([])
    expect(m.tried).toEqual([])
  })
})

describe('LK4: a link whose text is translated (\\href)', () => {
  it('drawn over two lines: one record, a box a line, named by its translation', () => {
    const pieces: Piece[] = [text('\u4ee3\u7801\u89c1'), { t: 'open', id: 7, src: '\\href{https://x.org/code}{' }, text('\u6211\u4eec\u7684\u4ee3\u7801\u5e93\u548c\u6570\u636e\u96c6'), { t: 'close', id: 7 }, text('\u3002')]
    const L = lay(pieces, {}, [block(3, 80)])
    const a = ann(4, { url: 'https://x.org/code' }, 'our code', ['9|0', '9|1'])
    const m = matchUnit({ cands: [cand(a)], targets: [{ ord: 1, pair: 7, kind: 'url', url: 'https://x.org/code', gap: null, segs: null, draw: 'pair' }] })
    expect(m.groups.map(g => [g.to.pair, g.annots.map(c => c.tier)])).toEqual([[7, ['url']]])
    const { records } = placeUnit({ groups: m.groups, ...placing(L) })
    expect(records.length).toBe(1)
    expect(records[0]!.rec.boxes.length).toBe(8)
    expect(records[0]!.rec.name.replace(/\s/g, '')).toBe('\u6211\u4eec\u7684\u4ee3\u7801\u5e93\u548c\u6570\u636e\u96c6')
    const b = records[0]!.rec.boxes
    expect(drawnBetween(L, 2, b.slice(0, 4)) + drawnBetween(L, 2, b.slice(4))).toBe('\u6211\u4eec\u7684\u4ee3\u7801\u5e93\u548c\u6570\u636e\u96c6')
  })
  it('a pair whose annotations are drawn otherwise (their borders) is left ambiguous: one record has one border', () => {
    const pieces: Piece[] = [text('\u4ee3\u7801\u89c1'), { t: 'open', id: 7, src: '\\href{https://x.org/code}{' }, text('\u6211\u4eec\u7684\u4ee3\u7801'), { t: 'close', id: 7 }, text('\u3002')]
    const L = lay(pieces, {})
    const a = ann(4, { url: 'https://x.org/code' }, 'our', ['9|0']), b = { ...ann(5, { url: 'https://x.org/code' }, 'code', ['10|0']), border: { width: 1, rgb: [0, 0, 255], style: 'solid' as const } }
    const m = matchUnit({ cands: [cand(a), cand(b)], targets: [{ ord: 1, pair: 7, kind: 'url', url: 'https://x.org/code', gap: null, segs: null, draw: 'pair' }] })
    const { records, tried } = placeUnit({ groups: m.groups, ...placing(L) })
    expect(records).toEqual([])
    expect(tried).toEqual([{ q: 1, i: 4, why: 'ambiguous' }, { q: 1, i: 5, why: 'ambiguous' }])
  })
  it('tags each token of the pair with its id, which no drawing reads: the SVG is the one without the tag', () => {
    const pieces: Piece[] = [text('\u89c1'), { t: 'open', id: 7, src: '\\href{https://x.org/}{' }, text('\u4ee3\u7801'), { t: 'close', id: 7 }]
    const L = lay(pieces, {})
    const tagged = L.lines.flatMap(l => l.items).filter(it => (it.t.st as { link?: number } | undefined)?.link === 7).map(it => it.t.s)
    expect(tagged.join('')).toBe('\u4ee3\u7801')
    // (the same unit with no pair is drawn the same, character for character; another group tags nothing)
    const toPx = (x: number, y: number) => [x, 600 - y]
    expect(L2.svgOfUnit(L as never, 2, toPx, 1, 3)).toBe(L2.svgOfUnit(lay([text('\u89c1'), text('\u4ee3\u7801')], {}) as never, 2, toPx, 1, 3))
    const other = lay([text('\u89c1'), { t: 'open', id: 7, src: '\\emph{' }, text('\u4ee3\u7801'), { t: 'close', id: 7 }], {})
    expect(other.lines.flatMap(l => l.items).some(it => (it.t.st as { link?: number } | undefined)?.link !== undefined)).toBe(false)
  })
})

describe('LK5: a footnote\'s mark, by order', () => {
  const pieces = [text('\u4e00'), { t: 'nested' }, text('\u4e8c'), { t: 'nested' }, text('\u4e09')]
  const L = () => lay(pieces as Piece[], { 1: { mode: 'source', text: '*', sup: true }, 3: { mode: 'source', text: '†', sup: true } })
  const marks = [target(1, { kind: 'note' }), target(3, { kind: 'note' })]
  it('pairs the unit\'s marks with its footnote annotations in turn, in the source\'s order, where they are as many', () => {
    const anns = [ann(0, { dest: 'Hfootnote.1' }, '1'), ann(1, { dest: 'Hfootnote.2' }, '2')]
    const m = matchUnit({ cands: anns.map(a => cand(a)), targets: marks })
    expect(m.groups.map(g => [g.to.k, g.annots.map(c => [c.a.dest, c.tier])])).toEqual([[1, [['Hfootnote.1', 'order']]], [3, [['Hfootnote.2', 'order']]]])
    const { records, tried } = placeUnit({ groups: m.groups, ...placing(L()) })
    // (the marks drawn are the source's "*" and "†": the annotations' own "1" and "2" are not found, and order alone told their
    // targets: left, never laid over a mark nothing confirms)
    expect(records).toEqual([])
    expect(tried.map(t => t.why)).toEqual(['unplaced', 'unplaced'])
  })
  it('gives two annotations of two targets to no one piece: one mark of two footnotes is ambiguous', () => {
    const m = matchUnit({ cands: [cand(ann(0, { dest: 'Hfootnote.1' }, '1')), cand(ann(1, { dest: 'Hfootnote.2' }, '2'))], targets: [target(1, { kind: 'note' })] })
    expect(m.groups).toEqual([])
    expect(m.tried.map(t => t.why)).toEqual(['ambiguous', 'ambiguous'])
  })
  it('unequal counts: none of them, ambiguous', () => {
    const anns = [ann(0, { dest: 'Hfootnote.1' }, '1'), ann(1, { dest: 'Hfootnote.2' }, '2'), ann(2, { dest: 'Hfootnote.3' }, '3')]
    const m = matchUnit({ cands: anns.map(a => cand(a)), targets: marks })
    expect(m.groups).toEqual([])
    expect(m.tried).toEqual([0, 1, 2].map(i => ({ q: 1, i, why: 'ambiguous' })))
  })
})

describe('LK6: a citation drawn as the page wrote it before (no characters), by its key', () => {
  it('matches cite.<key> to the citation holding the key, and finds the number in what is drawn', () => {
    const L = lay([text('\u89c1'), ph('\\cite{smith}'), text('\u3002')], { 1: { mode: 'cite-map', text: '[3]' } })
    const m = matchUnit({ cands: [cand(ann(0, { dest: 'cite.smith' }, '3'))], targets: [target(1, { kind: 'cite', keys: ['smith'] })] })
    expect(m.groups[0]!.annots[0]!.tier).toBe('key')
    const { records } = placeUnit({ groups: m.groups, ...placing(L) })
    expect(records.map(r => [r.rec.name, letters(drawnBetween(L, 2, r.rec.boxes))])).toEqual([['3', '3']])
  })
  it('two pieces of one key against three annotations: none, ambiguous', () => {
    const anns = [0, 1, 2].map(i => ann(i, { dest: 'cite.smith' }, String(i + 3)))
    const m = matchUnit({ cands: anns.map(a => cand(a)), targets: [target(1, { kind: 'cite', keys: ['smith'] }), target(4, { kind: 'cite', keys: ['smith'] })] })
    expect(m.groups).toEqual([])
    expect(m.tried.map(t => t.why)).toEqual(['ambiguous', 'ambiguous', 'ambiguous'])
  })
  it('one piece and two annotations of its key (a name and a year): both to it', () => {
    const m = matchUnit({ cands: [cand(ann(0, { dest: 'cite.p' }, 'Peters')), cand(ann(1, { dest: 'cite.p' }, '2018'))], targets: [target(1, { kind: 'cite', keys: ['p'] })] })
    expect(m.groups.map(g => g.annots.map(c => c.a.i))).toEqual([[0, 1]])
  })
})

describe('the link a piece may carry', () => {
  it('reads it from the source: a citation\'s keys, a url (\\url, \\href, starred or not), a reference, a mark; none for a formula', () => {
    expect(linkKindOf({ t: 'ph', src: '\\citep[see][]{a, b}' })).toEqual({ kind: 'cite', keys: ['a', 'b'] })
    // (the spaces TeX skips after a command's name and between its arguments)
    expect(linkKindOf({ t: 'ph', src: '\\cite {smith}' })).toEqual({ kind: 'cite', keys: ['smith'] })
    expect(linkKindOf({ t: 'ph', src: '\\citep [see] [p. 3] {a}' })).toEqual({ kind: 'cite', keys: ['a'] })
    expect(linkKindOf({ t: 'ph', src: '\\nocite{a}' })).toBeNull()
    expect(linkKindOf({ t: 'ph', src: '\\url{https://x.org/a_b}' })).toEqual({ kind: 'url', url: 'https://x.org/a_b' })
    expect(linkKindOf({ t: 'open', src: '\\href{https://x.org/\\#top}{' })).toEqual({ kind: 'url', url: 'https://x.org/#top' })
    expect(linkKindOf({ t: 'open', src: '\\href*{https://x.org/s}{' })).toEqual({ kind: 'url', url: 'https://x.org/s' })
    expect(linkKindOf({ t: 'open', src: '\\hyperref[sec:a]{' })).toEqual({ kind: 'internal' })
    expect(linkKindOf({ t: 'open', src: '\\textbf{' })).toBeNull()
    expect(linkKindOf({ t: 'ph', src: '\\eqref{eq:1}' })).toEqual({ kind: 'internal' })
    expect(linkKindOf({ t: 'ph', src: '\\footnotemark' })).toEqual({ kind: 'note' })
    expect(linkKindOf({ t: 'nested' })).toEqual({ kind: 'note' })
    expect(linkKindOf({ t: 'ph', src: '$x^2$' })).toBeNull()
  })
})

describe('a translation that sets the pieces in another order: the right link, or none, never two swapped', () => {
  // (the source has \\hyperref[a]{A} before \\hyperref[b]{B}; the translation sets B's pair first: in its pieces B's open comes
  // first, its source index 3, A's after it, its source index 1. The PDF sets A's annotation before B's)
  const anns = () => [cand(ann(0, { dest: 'section.a' }, 'A')), cand(ann(1, { dest: 'section.b' }, 'B'))]
  const pairB: LinkTarget = { ord: 3, pair: 9, kind: 'internal', single: true, gap: null, segs: null, draw: 'pair' }
  const pairA: LinkTarget = { ord: 1, pair: 7, kind: 'internal', single: true, gap: null, segs: null, draw: 'pair' }
  it('pairs the annotations with the pairs in the source\'s order, not the translation\'s', () => {
    const m = matchUnit({ cands: anns(), targets: [pairB, pairA] })
    expect(m.groups.map(g => [g.to.pair, g.annots.map(c => c.a.dest)])).toEqual(expect.arrayContaining([[7, ['section.a']], [9, ['section.b']]]))
    expect(m.groups.length).toBe(2)
  })
  it('pairs no annotation where two pieces could take them and one has no place in the source: ambiguous, dropped', () => {
    const m = matchUnit({ cands: anns(), targets: [{ ...pairB, ord: null }, pairA] })
    expect(m.groups).toEqual([])
    expect(m.tried.map(t => t.why)).toEqual(['ambiguous', 'ambiguous'])
  })
  it('matches a \\hyperlink by the destination it names, whatever the order', () => {
    const named = (ord: number, pair: number, name: string): LinkTarget => ({ ord, pair, kind: 'internal', name, single: true, gap: null, segs: null, draw: 'pair' })
    const m = matchUnit({ cands: [cand(ann(0, { dest: 'n.first' }, 'x')), cand(ann(1, { dest: 'n.second' }, 'y'))], targets: [named(1, 7, 'n.second'), named(3, 9, 'n.first')] })
    expect(m.groups.map(g => [g.to.name, g.annots.map(c => [c.a.dest, c.tier])])).toEqual(expect.arrayContaining([['n.first', [['n.first', 'key']]], ['n.second', [['n.second', 'key']]]]))
  })
  it('sets the footnote marks a translation reorders on their own marks', () => {
    const L = lay([text('\u4e00'), { t: 'nested' }, text('\u4e8c'), { t: 'nested' }] as Piece[], { 1: { mode: 'orig-text', text: '2', sup: true }, 3: { mode: 'orig-text', text: '1', sup: true } })
    // (the translation's first mark is the source's second: its index there 4, the other's 2)
    const m = matchUnit({ cands: [cand(ann(0, { dest: 'Hfootnote.1' }, '1')), cand(ann(1, { dest: 'Hfootnote.2' }, '2'))], targets: [target(1, { kind: 'note', ord: 4, single: true }), target(3, { kind: 'note', ord: 2, single: true })] })
    const { records } = placeUnit({ groups: m.groups, ...placing(L) })
    expect(records.map(r => [r.rec.dest, r.rec.name]).sort()).toEqual([['Hfootnote.1', '1'], ['Hfootnote.2', '2']])
  })
})

describe('a link\'s box where the browser lays its run a little wider or narrower than measured', () => {
  it('keeps every letter of the link and no letter of another: its right end carried over its marks and on to the next run', () => {
    const L = lay([text('\u5982'), ph('\\citet{taylor}'), text('\u6240\u793a')], { 1: { mode: 'orig-text', text: '(Taylor, 1953)' } })
    const m = matchUnit({ cands: [cand(ann(0, { dest: 'cite.taylor' }, 'Taylor')), cand(ann(1, { dest: 'cite.taylor' }, '1953'))], targets: [target(1, { kind: 'cite', keys: ['taylor'], gap: null })] })
    const { records } = placeUnit({ groups: m.groups, ...placing(L) })
    expect(records.map(r => r.rec.name)).toEqual(['Taylor', '1953'])
    // (as measured, and with each glyph up to 8 % wider than measured, the drift a run of glyphs gathers on Chromium for Linux;
    // a little narrower too)
    for (const drift of [1, 1.04, 1.08, 0.97]) expect(records.map(r => letters(drawnBetween(L, 2, r.rec.boxes, drift))), `drift ${drift}`).toEqual(['Taylor', '1953'])
  })
  it('leaves a link that starts deep inside a run: "Sicherheitsbewertungsverfahren[12,13]" drawn as one run', () => {
    const L = lay([text('\u5982 '), ph('\\cite{a,b}'), text('\u6240')], { 1: { mode: 'orig-text', text: 'Sicherheitsbewertungsverfahren[12,13]' } })
    const m = matchUnit({ cands: [cand(ann(0, { dest: 'cite.a' }, '12')), cand(ann(1, { dest: 'cite.b' }, '13'))], targets: [target(1, { kind: 'cite', keys: ['a', 'b'] })] })
    const { records, tried } = placeUnit({ groups: m.groups, ...placing(L) })
    // (dropped or right, never wrong, as the run is drawn as measured or wider)
    for (const drift of [1, 1.04, 1.08]) for (const r of records) expect(letters(drawnBetween(L, 2, r.rec.boxes, drift)), `drift ${drift}`).toBe(letters(r.rec.name))
    // ("12" starts 155 pt into the run: the 6 % (DRIFT_BOUND) its glyphs may drift there is 9.3 pt, past half its "1"; a box
    // there could stand over "[1", or over the other link's "12,")
    expect(records).toEqual([])
    expect(tried).toEqual([{ q: 1, i: 0, why: 'unplaced' }, { q: 1, i: 1, why: 'unplaced' }])
  })
  it('keeps a citation a translation glues to a short Latin word, and is right as the run drifts; leaves one deep in a long word', () => {
    const glued = (word: string) => lay([text(`\u5982\u56fe\u6240\u793a\u7684${word}`), ph('\\cite{a}'), text('\u6240\u793a')], { 1: { mode: 'orig-text', text: '[12]' } })
    const place = (L: ReturnType<typeof lay>) => placeUnit({ groups: matchUnit({ cands: [cand(ann(0, { dest: 'cite.a' }, '12'))], targets: [target(1, { kind: 'cite', keys: ['a'] })] }).groups, ...placing(L) })
    // ("BERT[12]" is one run after the Chinese one: "12" 25 pt into it, its drift there at most 1.5 pt, under half its "1")
    const short = glued('BERT'), kept = place(short).records
    expect(kept.map(r => r.rec.name)).toEqual(['12'])
    for (const drift of [1, 1.04, 1.08]) expect(letters(drawnBetween(short, 2, kept[0]!.rec.boxes, drift)), `drift ${drift}`).toBe('12')
    // ("TransformerXL[12]": 70 pt in, a drift of 4.2 pt: left, never laid over the word's end)
    const long = place(glued('TransformerXL'))
    expect(long.records).toEqual([])
    expect(long.tried).toEqual([{ q: 1, i: 0, why: 'unplaced' }])
  })
  it('takes no letter of the word before it, whose run drifts toward it across the space', () => {
    const L = lay([text('\u5982 Sicherheitsbewertungen '), ph('\\cite{a}'), text('\u6240')], { 1: { mode: 'orig-text', text: '[32]' } })
    const m = matchUnit({ cands: [cand(ann(0, { dest: 'cite.a' }, '32'))], targets: [target(1, { kind: 'cite', keys: ['a'] })] })
    const { records } = placeUnit({ groups: m.groups, ...placing(L) })
    // (a word of 22 glyphs 8 % wide gathers 8.8 pt: its last glyph's middle past the space and the "[", short of the "3")
    for (const drift of [1, 1.04, 1.08]) expect(letters(drawnBetween(L, 2, records[0]!.rec.boxes, drift)), `drift ${drift}`).toBe('32')
  })
})

describe('a link\'s text found whole, or the link left: never over a part of another', () => {
  it('"[12, 2]": the annotation of "2" alone, the 12 not its piece\'s, is laid over the "2", never the 2 of 12', () => {
    const L = lay([text('\u89c1'), ph('\\cite{a,b}'), text('\u3002')], { 1: { mode: 'orig-text', text: '[12, 2]' } })
    const m = matchUnit({ cands: [cand(ann(1, { dest: 'cite.b' }, '2'))], targets: [target(1, { kind: 'cite', keys: ['a', 'b'] })] })
    const { records } = placeUnit({ groups: m.groups, ...placing(L) })
    expect(records.length).toBe(1)
    // ("[12," from 110 to 130; "2]" after the space of 5, from 135: the box from its token's start, never over "12")
    expect(records[0]!.rec.boxes[0]).toBeCloseTo(135, 6)
    expect(letters(drawnBetween(L, 2, records[0]!.rec.boxes))).toBe('2')
  })
  it('"[12]" with the annotation of "2" alone: no whole number "2" in it: none, never the 2 of 12', () => {
    const L = lay([text('\u89c1'), ph('\\cite{b}'), text('\u3002')], { 1: { mode: 'orig-text', text: '[12]' } })
    const m = matchUnit({ cands: [cand(ann(1, { dest: 'cite.b' }, '2'))], targets: [target(1, { kind: 'cite', keys: ['b'], single: true })] })
    // (its key told its target, and the piece names it alone: the piece whole, not a part of "12")
    const { records } = placeUnit({ groups: m.groups, ...placing(L) })
    expect(records.map(r => r.rec.name)).toEqual(['[12]'])
  })
  it('an order match whose text is not found is left, never the piece whole: dest a by order on a \\ref{b} drawn "3"', () => {
    const L = lay([text('\u89c1'), ph('\\ref{b}'), text('\u3002')], { 1: { mode: 'orig-text', text: '3' } })
    const m = matchUnit({ cands: [cand(ann(0, { dest: 'section.a' }, '2'))], targets: [target(1, { kind: 'internal', ord: 1, single: true })] })
    expect(m.groups[0]!.annots[0]!.tier).toBe('order')
    const { records, tried } = placeUnit({ groups: m.groups, ...placing(L) })
    expect(records).toEqual([])
    expect(tried).toEqual([{ q: 1, i: 0, why: 'unplaced' }])
  })
  it('a key match on a citation of two keys whose text is not found is left, never the whole "[21, 41]"', () => {
    const L = lay([text('\u89c1'), ph('\\cite{a,b}'), text('\u3002')], { 1: { mode: 'cite-map', text: '[21, 41]' } })
    const m = matchUnit({ cands: [cand(ann(0, { dest: 'cite.a' }, '7'))], targets: [target(1, { kind: 'cite', keys: ['a', 'b'], single: false })] })
    expect(m.groups[0]!.annots[0]!.tier).toBe('key')
    expect(placeUnit({ groups: m.groups, ...placing(L) }).records).toEqual([])
  })
})

describe('a link over the number alone of a reference drawn with its name (cleveref): found across the drawing\'s space', () => {
  // (\cref{fig:a} drawn as the page wrote it, "Figure 1", where arXiv's link covers its "1" alone: the number is a word of its
  // own, the drawing's space or its line's end before it, never a part of "Figure")
  it('"Figure 1" with the annotation of its "1": one record over the "1" alone, named by it, never the piece whole', () => {
    const L = lay([text('\u89c1'), ph('\\cref{fig:a}'), text('\u3002')], { 1: { mode: 'orig-text', text: 'Figure 1' } })
    const m = matchUnit({ cands: [cand(ann(0, { dest: 'figure.1' }, '1', ['5|7']))], targets: [target(1, { kind: 'internal', gap: gapOf(1, 5, 8) })] })
    const { records, tried } = placeUnit({ groups: m.groups, ...placing(L) })
    expect(tried).toEqual([])
    expect(records.map(r => [r.rec.name, r.rec.dest, r.sources.tier])).toEqual([['1', 'figure.1', 'geometry']])
    expect(letters(drawnBetween(L, 2, records[0]!.rec.boxes))).toBe('1')
  })
  it('"sections 3.2 and 3.3" with an annotation of each number: two records, each over its number', () => {
    const L = lay([text('\u89c1'), ph('\\cref{sec:a,sec:b}'), text('\u3002')], { 1: { mode: 'orig-text', text: 'sections 3.2 and 3.3' } }, [block(3, 300)])
    const a = ann(0, { dest: 'subsection.3.2' }, '3.2', ['5|9', '5|10', '5|11']), b = ann(1, { dest: 'subsection.3.3' }, '3.3', ['5|17', '5|18', '5|19'])
    const m = matchUnit({ cands: [cand(a), cand(b)], targets: [target(1, { kind: 'internal', single: false, gap: gapOf(1, 5, 20) })] })
    const { records, tried } = placeUnit({ groups: m.groups, ...placing(L) })
    expect(tried).toEqual([])
    expect(records.map(r => [r.rec.name, r.rec.dest])).toEqual([['3.2', 'subsection.3.2'], ['3.3', 'subsection.3.3']])
    expect(records.map(r => letters(drawnBetween(L, 2, r.rec.boxes)))).toEqual(['32', '33'])
  })
  it('"Figure" ending a line and its "1" opening the next: the record over the "1" on its line', () => {
    // (a narrow block: seven characters and "Figure" fill the first line, its "1" opens the next)
    const L = lay([text('\u5982\u5982\u5982\u5982\u5982\u5982\u5982'), ph('\\cref{fig:a}'), text('\u6240\u793a')], { 1: { mode: 'orig-text', text: 'Figure 1' } }, [block(3, 105)])
    const lineOf = (s: string) => L.lines.findIndex(l => l.items.some(it => it.t.s === s))
    expect([lineOf('Figure'), lineOf('1')]).toEqual([0, 1])
    const m = matchUnit({ cands: [cand(ann(0, { dest: 'figure.1' }, '1', ['5|7']))], targets: [target(1, { kind: 'internal', gap: gapOf(1, 5, 8) })] })
    const { records } = placeUnit({ groups: m.groups, ...placing(L) })
    expect(records.map(r => [r.rec.name, r.li, r.rec.boxes.length])).toEqual([['1', 1, 4]])
    expect(letters(drawnBetween(L, 2, records[0]!.rec.boxes))).toBe('1')
  })
  it('a number glued to its word is no word of its own: "Figure1" with the annotation of its "1" alone is the piece whole, as before', () => {
    const L = lay([text('\u89c1'), ph('\\cref{fig:a}'), text('\u3002')], { 1: { mode: 'orig-text', text: 'Figure1' } })
    const m = matchUnit({ cands: [cand(ann(0, { dest: 'figure.1' }, '1', ['5|6']))], targets: [target(1, { kind: 'internal', gap: gapOf(1, 5, 7) })] })
    const { records } = placeUnit({ groups: m.groups, ...placing(L) })
    expect(records.map(r => r.rec.name)).toEqual(['Figure1'])
  })
})

describe('LK15: a link round a unit\'s whole text (a contents entry, 2610.40645v1 p1)', () => {
  // (the entry "1 Introduction", hyperref's one link over its number and its title; the unit the title alone, an ink unit of no
  // placeholder: drawn "はじめに" on page 2's line from x 100, its number kept where TeX set it, 80 to 90)
  const own = (n: number, page = 2, from = 100) => Array.from({ length: n }, (_, i) => ({ key: `${page}|3|${i}`, page, x0: from + 10 * i, x1: from + 10 * i + 9, yb: 500 }))
  const whole = (chars: ReturnType<typeof own>): LinkTarget => ({ ord: null, kind: null, gap: null, segs: null, draw: 'whole', own: chars })
  /** an annotation of page 2 over the number at 85 and the title's characters `keys` (`item|k` of item 3) */
  const entry = (i: number, dest: string, n: number, rect = [80, 497, 150, 509]) => {
    const keys = ['2|0', ...Array.from({ length: n }, (_, k) => `3|${k}`)], x = [85, ...Array.from({ length: n }, (_, k) => 104.5 + 10 * k)]
    return { ...ann(i, { dest }, `1Intro`.slice(0, n + 1), keys, rect, `1 ${'Intro'.slice(0, n)}`), g2: { x, y: x.map(() => 500), ch: [...'1Intro'.slice(0, n + 1)], key: keys } }
  }
  const L = () => lay([text('はじめに')], {}, [block(1)])

  it('moves to the unit\'s drawing, one record a box a drawn line, with the number it holds where it stands, named by both', () => {
    const m = matchUnit({ cands: [cand(entry(0, 'section.1', 5), 2)], targets: [whole(own(5))] })
    expect(m.groups.map(g => [g.to.draw, g.annots.map(c => [c.a.i, c.tier])])).toEqual([['whole', [[0, 'whole']]]])
    const l = L()
    const { records, tried } = placeUnit({ groups: m.groups, ...placing(l) })
    expect(tried).toEqual([])
    expect(records.map(r => [r.rec.dest, r.rec.moved, r.page, r.rec.name, r.sources])).toEqual([['section.1', true, 2, '1 はじめに', { annots: [[2, 0]], tier: 'whole' }]])
    const b = records[0]!.rec.boxes
    // (the number's part of the annotation, to the title's first character, then the drawn line)
    expect(b.slice(0, 4)).toEqual([80, 497, 100, 509])
    expect(b.length).toBe(8)
    expect(drawnBetween(l, 2, b.slice(4))).toBe('はじめに')
  })
  it('takes none that holds a part of the unit\'s text alone, nor two targets that both hold it all, nor a unit of two pages one holds a page of', () => {
    const part = matchUnit({ cands: [cand(entry(0, 'section.1', 3), 2)], targets: [whole(own(5))] })
    expect([part.groups, part.tried]).toEqual([[], []])
    const two = matchUnit({ cands: [cand(entry(0, 'section.1', 5), 2), cand(entry(1, 'section.2', 5), 2)], targets: [whole(own(5))] })
    expect([two.groups, two.tried]).toEqual([[], [{ q: 2, i: 0, why: 'ambiguous' }, { q: 2, i: 1, why: 'ambiguous' }]])
    const pages = matchUnit({ cands: [cand(entry(0, 'section.1', 5), 2)], targets: [whole([...own(5), ...own(2, 3)])] })
    expect(pages.groups).toEqual([])
  })
  it('leaves to the tiers before it what they take: a citation the unit draws keeps its annotation', () => {
    const L1 = lay([text('见'), ph('\\cite{a}'), text('。')], { 1: { mode: 'orig-text', text: '[21]' } })
    const a = ann(0, { dest: 'cite.a' }, '21', ['5|1', '5|2'])
    const m = matchUnit({ cands: [cand(a)], targets: [target(1, { kind: 'cite', keys: ['a'], gap: gapOf(1, 5, 4) }), whole([{ key: '1|5|1', page: 1, x0: 0, x1: 1, yb: 0 }, { key: '1|5|2', page: 1, x0: 1, x1: 2, yb: 0 }])] })
    expect(m.groups.map(g => [g.to.draw, g.annots.map(c => c.tier)])).toEqual([['text', ['geometry']]])
    expect(placeUnit({ groups: m.groups, ...placing(L1) }).records.length).toBe(1)
  })
})

describe('what the match never does', () => {
  it('gives an annotation whose glyphs are a kept piece\'s to no other piece: it stays the freeze\'s', () => {
    // (an \eqref inside a display kept where it stands, and a reference of the unit drawn from its source: order would pair them)
    const a = ann(0, { dest: 'equation.3' }, '3', ['4|0'])
    const m = matchUnit({ cands: [cand(a)], targets: [target(2, { kind: null, gap: gapOf(1, 4, 3), draw: null }), target(5, { kind: 'internal' })] })
    expect(m.groups).toEqual([])
    expect(m.tried).toEqual([])
  })
  it('matches no glyph to two pieces by geometry, nor a url to another url', () => {
    const a = ann(0, { url: 'https://a.org/' }, 'ab', ['1|0', '1|1'])
    const m = matchUnit({ cands: [cand(a)], targets: [target(1, { kind: 'url', url: 'https://b.org/', gap: gapOf(1, 1, 2) }), target(2, { kind: 'url', url: 'https://b.org/', gap: gapOf(1, 1, 2) })] })
    expect(m.groups).toEqual([])
  })
  it('spends a bounded work, and leaves what is past it unplaced', () => {
    const many = Array.from({ length: 50 }, (_, i) => cand(ann(i, { dest: 'cite.a' }, 'x'.repeat(10), Array.from({ length: 10 }, (_, k) => `1|${k}`))))
    const m = matchUnit({ cands: many, targets: Array.from({ length: 20 }, (_, k) => target(k)), budget: { left: 1000 } })
    expect(m.tried.filter(t => t.why === 'unplaced').length).toBe(45)
  })
  it('charges the search of a piece\'s drawn text to its budget: a hostile piece and citation are left, in a bounded time', () => {
    // (one drawn token of 50,000 letters, a \\cite of 2,000 keys whose annotations each read "x": found at every place, whole at none)
    const s = 'x'.repeat(50_000)
    const line = { page: 2, baseline: 500, x0: 100, items: [{ t: { s, k: 1, ph: 0 }, x: 100, w: 10 }] }
    const where = { lines: [{ line, runs: [{ items: [[0, 0]], text: s }] }], edge: () => 0, band: () => ({ top: 510, bottom: 495 }), scale: 1 }
    const annots = Array.from({ length: 2000 }, (_, i) => ({ ...cand(ann(i, { dest: `cite.k${i}` }, 'x')), tier: 'key' }))
    const start = performance.now()
    const { records, tried } = placeUnit({ groups: [{ to: target(1, { kind: 'cite', keys: annots.map((_, i) => `k${i}`) }), annots }], ...where } as never)
    expect(performance.now() - start).toBeLessThan(1000)
    expect(records).toEqual([])
    expect(tried.length).toBe(2000)
    expect(new Set(tried.map(t => t.why))).toEqual(new Set(['unplaced']))
  })
  it('makes no geometry match past its budget in TeX\'s segments: the annotation is unplaced', () => {
    // (two characters at y 500 in a segment of page 1; no rendering took them)
    const a = { ...ann(0, { dest: 'cite.a' }, 'ab', ['1|0', '1|1']), g2: { x: [110, 120], y: [500, 500], ch: ['a', 'b'], key: ['1|0', '1|1'] } }
    const segs = Array.from({ length: 50 }, () => [1, 100, 500, 200, 508, 498])
    const T = target(1, { kind: 'cite', keys: ['a'], segs })
    expect(matchUnit({ cands: [cand(a)], targets: [T] }).groups.map(g => g.annots.map(c => c.tier))).toEqual([['geometry']])
    // (the segments cost 50 a point, 100 for the two: a budget of 60 runs out among them)
    const m = matchUnit({ cands: [cand(a)], targets: [T], budget: { left: 60 } })
    expect(m.groups).toEqual([])
    expect(m.tried).toEqual([{ q: 1, i: 0, why: 'unplaced' }])
  })
})

describe('the owner of an annotation', () => {
  // (three units with lines on page 1, in their growth rank: 1, then 2, then 3; an annotation's points at y 500)
  const rects = (x0: number, x1: number) => [[1, x0, 495, x1, 510]]
  const a = { ...ann(0, { dest: 'cite.a' }, 'abcd'), g2: { x: [10, 20, 30, 40], y: [500, 500, 500, 500], ch: ['a', 'b', 'c', 'd'], key: [] } }
  it('is the first unit of the rank whose rectangles hold more than half of its points, whatever those after it hold', () => {
    const u1 = { rects: rects(0, 15) }, u2 = { rects: rects(0, 35) }, u3 = { rects: rects(0, 50) }
    expect(ownedIn([a], u1, [], 1).length).toBe(0)
    expect(ownedIn([a], u2, [u1], 1).length).toBe(1)
    expect(ownedIn([a], u3, [u1, u2], 1).length).toBe(0)
    // (half the points is no majority: no owner)
    expect(ownedIn([a], { rects: rects(0, 25) }, [], 1).length).toBe(0)
    // (rectangles of another page hold none)
    expect(ownedIn([a], { rects: [[2, 0, 495, 50, 510]] }, [], 1).length).toBe(0)
  })
  it('makes no test past its budget: what it left unread has no owner, and is listed', () => {
    const b = { ...a, i: 1 }, units = [{ rects: rects(0, 15) }, { rects: rects(0, 50) }]
    expect([...ownersOf([a, b], units, 1)]).toEqual([[0, 1], [1, 1]])
    // (a test a point against a unit, one more a point inside its box: a's 5 against the first unit and 8 against the second;
    // b's 5 and 3, its third point past the budget)
    const budget = { left: 20 }, skipped = new Set<number>()
    expect([...ownersOf([a, b], units, 1, { budget, skipped })]).toEqual([[0, 1]])
    expect([...skipped]).toEqual([1])
    // (no test once the budget is spent: it stops at the first point past it)
    expect(budget.left).toBe(-1)
    const none = new Set<number>()
    expect(ownedIn([a, b], units[1]!, [units[0]!], 1, { left: 5 }, none)).toEqual([])
    expect([...none]).toEqual([0, 1])
  })
})

describe('LK13: a page\'s records ranked', () => {
  it('by the owner unit\'s stream, then its id; moved before in place; the unit\'s drawing order, then PDF order', () => {
    const rec = (name: string) => ({ boxes: [10, 10, 20, 20], dest: 'x', name, moved: true, order: 0 })
    const moved = [
      { rec: rec('u20 second'), stream: 20, id: 9, seq: 1, sources: { annots: [[1, 7]] as [number, number][], tier: 'key' } },
      { rec: rec('u5'), stream: 5, id: 4, seq: 0, sources: { annots: [[1, 8]] as [number, number][], tier: 'geometry' } },
      { rec: rec('u20 first'), stream: 20, id: 9, seq: 0, sources: { annots: [[1, 9], [2, 0]] as [number, number][], tier: 'geometry' } },
    ]
    // (in place: one over unit 9's text, one in the margin)
    const list = [
      { ...ann(0, { dest: 'y' }, 'p', [], [100, 495, 110, 510], 'in u20'), g2: { x: [105], y: [500], ch: ['p'], key: [] } },
      { ...ann(1, { dest: 'z' }, '', [], [400, 10, 410, 20], 'margin') },
    ]
    const units = [{ id: 9, stream: 20, rects: [[1, 90, 490, 300, 515]] }, { id: 4, stream: 5, rects: [[1, 90, 300, 300, 320]] }]
    const f = freezeLinks({ list, q: 1, ops: [], devOf: (x, y) => [x, y], units, moved, sources: true })
    expect(f.records.map(r => [r.name, r.order])).toEqual([['u5', 0], ['u20 first', 1], ['u20 second', 2], ['in u20', 3], ['margin', 4]])
    expect(f.moved).toBe(4)
    expect(f.inPlace).toBe(2)
    expect(f.sources!.map(s => s.tier)).toEqual(['geometry', 'geometry', 'key', 'place', 'place'])
  })
  it('counts an annotation its owner left by the reason the match gave it, where its ink is erased', () => {
    const list = [ann(0, { dest: 'a' }, 'x'), ann(1, { dest: 'b' }, 'y'), ann(2, { dest: 'c' }, 'z')].map(a => ({ ...a, rect: [10, 10, 20, 20], boxes: [[10, 10, 20, 20]] }))
    const f = freezeLinks({ list, q: 1, ops: [{ op: 'hidden', rects: [[0, 0, 100, 100]] }], devOf: (x, y) => [x, y], units: [], why: new Map([[0, 'ambiguous'], [1, 'unplaced']]) })
    expect(f.dropped).toEqual({ unmatched: 1, ambiguous: 1, unplaced: 1 })
    expect(f.records).toEqual([])
  })
})
