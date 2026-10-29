// @vitest-environment node
import { readFileSync } from 'node:fs'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { ANCHOR_REACH, DRAW_BAND, figureUnitsOf, FIGURE_WHYS, ROOM_CLEAR, ROOM_MAX } from '@/pdf-reader/engine/layout/figure-text.mjs'
import { pageInk } from '@/pdf-reader/engine/layout/ink.mjs'
import { POINTS_TEX } from '@/pdf-reader/engine/layout/marks.mjs'
import { CLASSES, FIGURE_KIND, TOGGLE_DEFAULTS, unitClass } from '@/pdf-reader/engine/rules/content-classes.mjs'
import { figureUnits } from '@/pdf-reader/engine/pipeline/page-pass.mjs'
import { UNIT_FLAG_BITS } from '@/pdf-reader/engine/layer-proto/units.mjs'
import { DOCUMENT_OPTIONS, renderPage, wrapped } from './helpers/ocg-pdfs'

// The text inside vector figures (docs/route/orphan-text.md stage 5, the content class `figures`): our final pass's glyphs that
// an included PDF (a form XObject) or a TikZ or pgfplots picture (between the layout compile's points `zs` and `ze`) draws and no
// unit owns, cut into ink units (layout/figure-text.mjs), each its own optional-content group (`f<k>`, layout/wrap.mjs), in each
// shape a figure meets: a pgfplots axis (its title, its x label, its y label turned, a dense legend), a TikZ node and a label
// beside an arrow, an included PDF whose fonts carry a /ToUnicode, and one whose font gives codes, not characters
// (tests/fixtures/pdf/figures/, ours, scripts/make-figure-fixture.mjs)

const FIXTURE = new URL('../fixtures/pdf/figures/', import.meta.url)
type Unit = { text: string; angle: number; anchor: string; form: boolean; why: string | null; page: number; group: string; x: number; y: number; ux: number; uy: number; length: number; size: number; ascent: number; descent: number }
type Page = { glyphs: { u: string; x0: number; x1: number; ix0: number; ix1: number; top: number; bottom: number; blank?: boolean }[]; turned: unknown[]; boxes: number[]; shapes: Map<number, unknown>; pictures: { name: string }[] }
let final: Uint8Array, wrap: { bytes: Uint8Array; figures: { units: Unit[]; stats: Record<string, number> }; figureUnits: Unit[]; ledger: { classes: (string | number)[] }; stats: { groups: number } }
let pages: Page[]

/** the pages as wrapFinal reads them for the figures (pageInk with `indices` and `turned`) */
async function pagesOf(bytes: Uint8Array): Promise<Page[]> {
  const task = getDocument({ ...DOCUMENT_OPTIONS, data: bytes.slice() } as never)
  const doc = await task.promise
  try {
    const out: Page[] = []
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      out.push(pageInk(OPS, await page.getOperatorList(), page.commonObjs, { rotate: page.rotate, indices: true, turned: true }) as unknown as Page)
    }
    return out
  } finally { await task.destroy() }
}

beforeAll(async () => {
  final = new Uint8Array(readFileSync(new URL('figures.pdf', FIXTURE)))
  pages = await pagesOf(final)
  const r = await (wrapped(final, { units: null }) as unknown as Promise<typeof wrap & { refused?: string; why?: string }>)
  if (r.refused) throw new Error(`${r.refused}: ${r.why}`)
  // (the lab's keepOwned is not the helper's: the units with their whys from the cut itself)
  wrap = { ...r, figureUnits: figureUnitsOf(pages as never, null).units as unknown as Unit[] }
}, 120_000)

const byText = (units: Unit[], text: string) => { const u = units.find(x => x.text === text); if (!u) throw new Error(`no unit "${text}" among ${units.map(x => x.text).join(' | ')}`); return u }

describe('the figures\' text cut into ink units (layout/figure-text.mjs)', () => {
  it('is the policy table\'s class `figures`, built, its kind an ink kind, its toggle on by default (the owner\'s, 2026-10-25)', () => {
    expect(CLASSES.figures.state).toBe('built')
    expect(FIGURE_KIND).toBe('inkfigures')
    expect(unitClass(FIGURE_KIND)).toBe('figures')
    expect(unitClass([FIGURE_KIND, 0, null, null, null, [], null])).toBe('figures')
    expect(TOGGLE_DEFAULTS.figures).toBe(true)
  })

  it('the fixture was compiled over the layout compile\'s points: a TikZ picture between `zs` and `ze`', () => {
    expect(POINTS_TEX).toContain('\\pgfsys@beginpicture{\\axt@pgfbp\\axt@point{zs}}')
    expect(pages[0]!.pictures.map(p => p.name)).toContain('zs')
    expect(pages[0]!.pictures.filter(p => p.name === 'zs').length).toBe(pages[0]!.pictures.filter(p => p.name === 'ze').length)
  })

  it('a pgfplots axis: its title and x label level, centred; its y label turned 90 degrees, its turn kept', () => {
    const units = wrap.figures.units
    expect(byText(units, 'Learning curve')).toMatchObject({ angle: 0, anchor: 'centre', form: false })
    expect(byText(units, 'Training steps')).toMatchObject({ angle: 0, anchor: 'centre', form: false })
    const y = byText(units, 'Validation loss')
    expect(y).toMatchObject({ angle: 90, form: false })
    expect(y.ux).toBeCloseTo(0, 6)
    expect(y.uy).toBeCloseTo(1, 6)
    // (its tick numbers are no unit: no word)
    expect(units.some(u => /^\d+$/.test(u.text))).toBe(false)
  })

  it('a dense legend: each entry a unit of its own, on its own baseline, none crowded by the next', () => {
    const entries = ['Baseline model', 'Our method', 'First ablation', 'Second ablation'].map(t => byText(wrap.figures.units, t))
    const ys = entries.map(u => u.y)
    expect(new Set(ys.map(y => Math.round(y))).size).toBe(4)
    for (let i = 1; i < ys.length; i++) expect(ys[i - 1]! - ys[i]!).toBeLessThan(2 * entries[i]!.size)
    expect(wrap.figureUnits.filter(u => entries.some(e => e.text === u.text)).every(u => u.why === null)).toBe(true)
  })

  it('a TikZ diagram: a node\'s text centred in its box; a label beside an arrow set from its start', () => {
    expect(byText(wrap.figures.units, 'Encoder block')).toMatchObject({ anchor: 'centre', form: false })
    expect(byText(wrap.figures.units, 'Decoder block')).toMatchObject({ anchor: 'centre', form: false })
    expect(byText(wrap.figures.units, 'hidden state')).toMatchObject({ anchor: 'start', form: false })
  })

  it('an included PDF whose fonts carry a /ToUnicode: its words units inside its form, the form written again with its groups', () => {
    expect(byText(wrap.figures.units, 'Signal strength')).toMatchObject({ form: true })
    expect(byText(wrap.figures.units, 'Noise floor')).toMatchObject({ form: true })
    expect(wrap.figures.stats.forms).toBe(1)
  })

  it('an included PDF whose font names its glyphs by codes, with no /ToUnicode: its text left the original\'s, counted', () => {
    const codes = byText(wrap.figureUnits, 'ABCD')
    expect(codes.form).toBe(true)
    expect(wrap.figures.units.some(u => u.text === 'ABCD')).toBe(false)
    expect(wrap.figures.stats.unicode).toBe(1)
  })

  it('counts every unit by its why, and gives each drawn one a group the document holds', () => {
    const s = wrap.figures.stats
    expect(s.units).toBe((s.drawn ?? 0) + FIGURE_WHYS.reduce((n, w) => n + (s[w] ?? 0), 0))
    expect(s.drawn).toBe(12)
    expect(new Set(wrap.figures.units.map(u => u.group)).size).toBe(s.drawn)
    for (const u of wrap.figures.units) expect(u.ascent).toBeGreaterThanOrEqual(DRAW_BAND[1])
    // (the ledger's class `figures` holds every figure glyph, drawn or not: [class, glyphs, letters, …])
    const at = wrap.ledger.classes.indexOf('figures')
    expect(at).toBeGreaterThanOrEqual(0)
    expect(wrap.ledger.classes[at + 1]).toBeGreaterThan(100)
  })
})

describe('a figure unit\'s place against the figure\'s lines (synthetic pages)', () => {
  /** a page of one word at (100, 100), 10 pt, in a picture, and the paths given (each [x0, y0, x1, y1] a horizontal or vertical
   *  stroke, its segment its box's middle) */
  const word = (text: string, strokes: number[][] = [], frame: number[] | null = null) => {
    const glyphs = [...text].map((u, i) => ({ u, n: 0, k: i, x0: 100 + 5 * i, x1: 105 + 5 * i, ix0: 100 + 5 * i, ix1: 105 + 5 * i, y: 100, top: 107, bottom: 98, size: 10, font: 'CMR10', fill: 0, ...(u === ' ' ? { blank: true } : {}) }))
    const boxes: number[] = [], shapes = new Map()
    const add = (b: number[], segs: number[], fill = false) => { shapes.set(boxes.length / 4, { segs: Float32Array.from(segs), stroke: !fill, fill, hw: 0.25 }); boxes.push(...b) }
    for (const s of strokes) add([s[0]! - 0.25, s[1]! - 0.25, s[2]! + 0.25, s[3]! + 0.25], [s[0]!, s[1]!, s[2]!, s[3]!])
    if (frame) add(frame, [frame[0]!, frame[1]!, frame[2]!, frame[1]!, frame[2]!, frame[1]!, frame[2]!, frame[3]!, frame[2]!, frame[3]!, frame[0]!, frame[3]!, frame[0]!, frame[3]!, frame[0]!, frame[1]!], true)
    return { glyphs, turned: [], boxes, shapes, pictures: [{ name: 'zs', glyph: 0, box: 0 }, { name: 'ze', glyph: glyphs.length, box: boxes.length / 4 }], points: [] }
  }
  const one = (pg: ReturnType<typeof word>) => figureUnitsOf([pg] as never, null).units[0]!

  it('a stroke through the word\'s band crowds it: it stays the original\'s', () => {
    expect(one(word('label', [[110, 90, 110, 115]])).why).toBe('crowded')
    // (one above its band, or past its end, does not)
    expect(one(word('label', [[90, 112, 140, 112]])).why).toBeNull()
  })

  it('a fill that holds the whole band is its background, not other ink', () => {
    expect(one(word('label', [], [80, 90, 150, 115])).why).toBeNull()
  })

  it('anchors at its start where a line ends right before it, at its end where one begins right after it, else its middle', () => {
    expect(one(word('label', [[90, 102, 98, 102]])).anchor).toBe('start')
    expect(one(word('label', [[127, 95, 127, 110]])).anchor).toBe('end')
    expect(one(word('label', [[90, 102, 98, 102], [127, 95, 127, 110]])).anchor).toBe('centre')
    // (a line farther than the reach anchors nothing)
    expect(one(word('label', [[90 - 2 * ANCHOR_REACH * 10, 102, 98 - 2 * ANCHOR_REACH * 10, 102]])).anchor).toBe('centre')
  })

  it('a level line on its column\'s edge is set from that edge, centred in its column from its middle, as TeX set it (2610.37668v1\'s "Abstract")', () => {
    // (the word in a picture at 100..140 and the column's text lines below it, a unit's own glyphs: from x0 to x1 at 85 and 73)
    const column = (lines: [number, number][], strokes: number[][] = []) => {
      const pg = word('Abstract', strokes)
      const owners: (string | null)[] = pg.glyphs.map(() => null)
      for (const [li, [x0, x1]] of lines.entries()) for (let x = x0, k = 0; x + 5 <= x1 + 1e-9; x += 5, k++) {
        const y = 85 - 12 * li
        pg.glyphs.push({ u: 'x', n: 1 + li, k, x0: x, x1: x + 5, ix0: x, ix1: x + 5, y, top: y + 7, bottom: y - 2, size: 10, font: 'CMR10', fill: 0 })
        owners.push('u7')
      }
      return figureUnitsOf([pg] as never, { glyphs: [owners] } as never).units[0]!.anchor
    }
    // (nothing beside it: alone, it reads its middle; on its column's left edge, half a point in, its start)
    expect(one(word('Abstract')).anchor).toBe('centre')
    expect(column([[100.5, 300], [100.5, 300]])).toBe('start')
    expect(column([[-60, 140], [-60, 140]])).toBe('end')
    expect(column([[20, 220], [20, 220]])).toBe('centre')
    // (off its column's edges and middle, or one line alone, the ink beside it tells, as before)
    expect(column([[50, 300], [50, 300]], [[90, 102, 98, 102]])).toBe('start')
    expect(column([[50, 300], [50, 300]], [[147, 95, 147, 110]])).toBe('end')
    expect(column([[50, 300], [50, 300]])).toBe('centre')
    expect(column([[100.5, 300]])).toBe('centre')
    // (inside a figure the ink beside it tells first: an axis right after a label on the column's edge sets it from its end)
    expect(column([[100.5, 300], [100.5, 300]], [[147, 95, 147, 110]])).toBe('end')
  })

  it('reads its column from the owners it is given, a page read again under other owners anew', () => {
    const pg = word('Abstract')
    const owners: (string | null)[] = pg.glyphs.map(() => null)
    for (const y of [85, 73]) for (let x = 100.5, k = 0; x + 5 <= 300; x += 5, k++) { pg.glyphs.push({ u: 'x', n: 1, k, x0: x, x1: x + 5, ix0: x, ix1: x + 5, y, top: y + 7, bottom: y - 2, size: 10, font: 'CMR10', fill: 0 }); owners.push('u7') }
    expect(figureUnitsOf([pg] as never, { glyphs: [owners] } as never).units[0]!.anchor).toBe('start')
    // (the same page, its lines owned by no unit: no column, its middle)
    expect(figureUnitsOf([pg] as never, { glyphs: [owners.map(() => null)] } as never).units[0]!.anchor).toBe('centre')
  })

  it('a number, a letter alone or a formula\'s face is no unit; a word in a run of one font is', () => {
    expect(figureUnitsOf([word('0.25')] as never, null).units).toEqual([])
    expect(figureUnitsOf([word('x')] as never, null).units).toEqual([])
    const math = word('sin')
    for (const g of math.glyphs) g.font = 'CMMI10'
    expect(figureUnitsOf([math] as never, null).units).toEqual([])
    expect(one(word('two words')).text).toBe('two words')
  })

  it('two figures side by side never make one label: a run is one form\'s or one picture\'s', () => {
    const pg = word('In Out')
    // (the first two letters painted by one form, the last three by another, half an em apart on one baseline)
    for (const [i, g] of pg.glyphs.entries()) Object.assign(g, { form: true, fid: i < 3 ? 1 : 2 })
    expect(figureUnitsOf([{ ...pg, pictures: [] }] as never, null).units.map(u => u.text)).toEqual(['In', 'Out'])
    // (one form: one label)
    for (const g of pg.glyphs) Object.assign(g, { fid: 1 })
    expect(figureUnitsOf([{ ...pg, pictures: [] }] as never, null).units.map(u => u.text)).toEqual(['In Out'])
  })

  it('a label past its page\'s edge is not shown whole: it stays the original\'s, counted with the clipped', () => {
    const at = (view: number[]) => figureUnitsOf([{ ...word('label'), view }] as never, null)
    expect(at([0, 0, 300, 300]).units.map(u => u.text)).toEqual(['label'])
    // (the page's box starting inside its first letter, or ending inside its last, or below its baseline)
    for (const view of [[102, 0, 300, 300], [0, 0, 120, 300], [0, 101, 300, 300]]) {
      const r = at(view)
      expect(r.units).toEqual([])
      expect(r.stats.clipped).toBe(1)
    }
  })

  it('a glyph a unit owns, or one outside every figure, is no figure\'s', () => {
    const pg = word('label')
    expect(figureUnitsOf([{ ...pg, pictures: [] }] as never, null).units).toEqual([])
    expect(figureUnitsOf([pg] as never, { glyphs: [pg.glyphs.map(() => 'u3')] }).units).toEqual([])
  })
})

describe('a figure\'s labels in their columns and sets, each with its room (synthetic pages; the owner\'s rule of 2026-10-29)', () => {
  type Line = { text: string; x: number; y: number }
  /** a picture of lines of text, one show each (10 pt, 5 a glyph), its strokes ([x0, y0, x1, y1], a segment each), its dots (small
   *  fills: [x0, y0, x1, y1]), its frame (a stroked and filled box), and its extent as pageInk gives it (`figures`) */
  const picture = (lines: Line[], { strokes = [] as number[][], dots = [] as number[][], grounds = [] as number[][], frame = null as number[] | null, extent = [0, 0, 300, 300], bare = [] as [number[], number][] } = {}) => {
    const glyphs = lines.flatMap((l, n) => [...l.text].map((u, i) => ({ u, n, k: i, x0: l.x + 5 * i, x1: l.x + 5 * (i + 1), ix0: l.x + 5 * i, ix1: l.x + 5 * (i + 1), y: l.y, top: l.y + 7, bottom: l.y - 2, size: 10, font: 'ArialMT', fill: 0, ...(u === ' ' ? { blank: true } : {}) })))
    const boxes: number[] = [], shapes = new Map()
    const add = (b: number[], segs: number[], stroke: boolean, fill: boolean) => { shapes.set(boxes.length / 4, { segs: Float32Array.from(segs), stroke, fill, hw: 0.25 }); boxes.push(...b) }
    for (const s of strokes) add([Math.min(s[0]!, s[2]!) - 0.25, Math.min(s[1]!, s[3]!) - 0.25, Math.max(s[0]!, s[2]!) + 0.25, Math.max(s[1]!, s[3]!) + 0.25], [s[0]!, s[1]!, s[2]!, s[3]!], true, false)
    const rect = (b: number[]) => [b[0]!, b[1]!, b[2]!, b[1]!, b[2]!, b[1]!, b[2]!, b[3]!, b[2]!, b[3]!, b[0]!, b[3]!, b[0]!, b[3]!, b[0]!, b[1]!]
    for (const d of [...dots, ...grounds]) add(d, rect(d), false, true)
    if (frame) add(frame, rect(frame), true, true)
    // (boxes of no lines known, each with its kind as pageInk's `paths` gives it: a path's place past the page's shapes, an image -3)
    const paths = boxes.map((_, i) => i).filter(i => i % 4 === 0).map(i => i / 4)
    for (const [b, kind] of bare) { boxes.push(...b); paths.push(kind) }
    return { glyphs, turned: [], boxes, shapes, paths, figures: new Map([['0:0', extent]]), pictures: [{ name: 'zs', glyph: 0, box: 0 }, { name: 'ze', glyph: glyphs.length, box: boxes.length / 4 }], points: [], view: [0, 0, 300, 300] }
  }
  type Placed = Unit & { k: number; set: number; before: number; after: number }
  const unitsOf = (pg: ReturnType<typeof picture>) => figureUnitsOf([pg] as never, null).units as unknown as Placed[]
  const byText2 = (units: Placed[], text: string) => units.find(u => u.text === text)!
  // (a legend: a line sample before each entry, 85 to 95, its entries from 100, its frame's right edge at 156: "Patch size" ends
  // at 150, 6 before the frame and 5 after its sample, so that read alone it is set from its middle)
  const legend = (entries = ['Models', 'All', 'Depth', 'Patch size', 'Width']) => picture(entries.map((text, i) => ({ text, x: 100, y: 200 - 14 * i })), { strokes: entries.slice(1).map((_, i) => [85, 202 - 14 * (i + 1), 95, 202 - 14 * (i + 1)]), frame: [80, 120, 156, 212], extent: [0, 0, 300, 300] })

  it('a legend\'s entries are one column: each set from its start, whatever it reads alone, and one set', () => {
    // (read alone, "Patch size" is set from its middle: its frame as near after it as its line sample before it)
    const alone = unitsOf(picture([{ text: 'Patch size', x: 100, y: 200 }], { strokes: [[85, 202, 95, 202]], frame: [80, 190, 156, 212] }))[0]!
    expect(alone.anchor).toBe('centre')
    const units = unitsOf(legend())
    expect(units.map(u => u.text)).toEqual(['Models', 'All', 'Depth', 'Patch size', 'Width'])
    expect(units.map(u => u.anchor)).toEqual(['start', 'start', 'start', 'start', 'start'])
    expect(new Set(units.map(u => u.set))).toEqual(new Set([units[0]!.k]))
  })

  it('a short entry\'s room is the free line after it to its frame, ROOM_CLEAR short of the frame\'s edge', () => {
    const all = byText2(unitsOf(legend()), 'All')
    // ("All" ends at 115; the frame's edge, a stroke of half width 0.25, at 156: 40.75 of free line, 1.5 short of it)
    expect(all.after).toBeCloseTo(156 - 0.25 - 115 - ROOM_CLEAR * 10, 6)
    // (before it, its line sample: 95.25, 4.75 back, 1.5 short)
    expect(all.before).toBeCloseTo(100 - 95.25 - ROOM_CLEAR * 10, 6)
    // (the longest entry's room after it is what is left to the frame)
    expect(byText2(unitsOf(legend()), 'Patch size').after).toBeCloseTo(156 - 0.25 - 150 - ROOM_CLEAR * 10, 6)
  })

  it('a room never leaves its figure, nor passes ROOM_MAX of its size', () => {
    const lone = (extent: number[]) => unitsOf(picture([{ text: 'label', x: 100, y: 100 }], { extent }))[0]!
    expect(lone([90, 90, 140, 110])).toMatchObject({ before: 10, after: 15 })
    expect(lone([0, 0, 300, 300])).toMatchObject({ before: ROOM_MAX * 10, after: ROOM_MAX * 10 })
    // (a fill behind the whole band, a node's, is its ground: no ink of its box, its edges the ends of its free line)
    const node = unitsOf(picture([{ text: 'label', x: 100, y: 100 }], { grounds: [[90, 90, 140, 115]] }))[0]!
    expect(node.why).toBeNull()
    expect(node.before).toBeCloseTo(10 - ROOM_CLEAR * 10, 6)
    expect(node.after).toBeCloseTo(15 - ROOM_CLEAR * 10, 6)
    // (a ground whose lines are not known, past the page's shapes, ends the free line a band's height inside its edges; an
    // image behind the band leaves none: its pixels beside the box are no ground a translation may take)
    const band = 0.88 + 0.2
    const path = unitsOf(picture([{ text: 'label', x: 100, y: 100 }], { bare: [[[80, 90, 160, 115], 7]] }))[0]!
    expect(path.why).toBeNull()
    expect(path.before).toBeCloseTo(20 - band * 10 - ROOM_CLEAR * 10, 6)
    expect(path.after).toBeCloseTo(35 - band * 10 - ROOM_CLEAR * 10, 6)
    const image = unitsOf(picture([{ text: 'label', x: 100, y: 100 }], { bare: [[[80, 90, 160, 115], -3]] }))[0]!
    expect(image).toMatchObject({ why: null, before: 0, after: 0 })
  })

  it('a path\'s lines past its box, its clip\'s, end no free line; a rectangle\'s edge at its box\'s edge does, a float apart', () => {
    // (a bar from 130 to 160 right after the label, its rectangle in single floats: its left edge ends the free line at 130)
    const bar = Float32Array.from([130.00001, 90, 160, 90, 160, 90, 160, 115, 160, 115, 130.00001, 115, 130.00001, 115, 130.00001, 90])
    const pg = picture([{ text: 'label', x: 100, y: 100 }])
    pg.shapes.set(pg.boxes.length / 4, { segs: bar, stroke: false, fill: true, hw: 0.25 })
    pg.boxes.push(130, 90, 160, 115)
    pg.paths.push(9)
    expect(unitsOf(pg)[0]!.after).toBeCloseTo(130 - 125 - ROOM_CLEAR * 10, 4)
    // (a line clipped to a box past the reach after the label, its segment running back under it: no ink where the clip hides it)
    const clipped = picture([{ text: 'label', x: 100, y: 100 }])
    clipped.shapes.set(clipped.boxes.length / 4, { segs: Float32Array.from([50, 102, 170, 102]), stroke: true, fill: false, hw: 0.25 })
    clipped.boxes.push(150, 101.75, 170, 102.25)
    clipped.paths.push(9)
    expect(unitsOf(clipped)[0]).toMatchObject({ why: null })
    // (to the clip's edge, less the 0.05 a box's edge is given for its segments' single floats)
    expect(unitsOf(clipped)[0]!.after).toBeCloseTo(150 - 0.05 - 125 - ROOM_CLEAR * 10, 6)
  })

  it('a fill behind the band cut by its clip ends the free line at the clip\'s edge, not at its own lines (the review of #490)', () => {
    // (a rectangle from 0 to 300 behind "label", 100 to 125, clipped to 90 to 140: its box the clip's, its segments its own)
    const pg = picture([{ text: 'label', x: 100, y: 100 }])
    pg.shapes.set(pg.boxes.length / 4, { segs: Float32Array.from([0, 90, 300, 90, 300, 90, 300, 115, 300, 115, 0, 115, 0, 115, 0, 90]), stroke: false, fill: true, hw: 0.25 })
    pg.boxes.push(90, 90, 140, 115)
    pg.paths.push(9)
    const u = unitsOf(pg)[0]!
    expect(u.before).toBeCloseTo(10 - ROOM_CLEAR * 10, 6)
    expect(u.after).toBeCloseTo(15 - ROOM_CLEAR * 10, 6)
  })

  it('labels of two directions never take one place: each room stops short of the other\'s band and room (the review of #490)', () => {
    // (a level label, 100 to 120 on y = 100, and a turned one, up x = 150 from 50 to 70, both centred with free space all round)
    const turned: unknown[] = [], boxes: number[] = []
    ;[...'ab', ...'cd'].forEach((uch, k) => {
      const y0 = 50 + 5 * k
      turned.push({ u: uch, n: 1, k, ox: 150, oy: y0, ex: 150, ey: y0 + 5, ux: 0, uy: 1, size: 10, ascent: 0.7, descent: -0.2, font: 'ArialMT', fill: 0, box: boxes.length / 4, at: 0, pt: 1 })
      boxes.push(143, y0, 152, y0 + 5)
    })
    const pg = picture([{ text: 'abcd', x: 100, y: 100 }])
    Object.assign(pg, { turned, boxes: [...pg.boxes, ...boxes], paths: [...pg.paths, ...boxes.filter((_, i) => i % 4 === 0).map(() => -4)] })
    const [a, b] = unitsOf(pg)
    expect([a!.angle, b!.angle]).toEqual([0, 90])
    // (each one's widest drawing, its band from before its start to after its end, as a page box)
    const region = (u: Placed) => {
      const nx = -u.uy, ny = u.ux, pts = [[-u.before, u.descent * u.size], [u.length + u.after, u.descent * u.size], [-u.before, u.ascent * u.size], [u.length + u.after, u.ascent * u.size]].map(([s1, t]) => [u.x + u.ux * s1! + nx * t!, u.y + u.uy * s1! + ny * t!])
      return [Math.min(...pts.map(p => p[0]!)), Math.min(...pts.map(p => p[1]!)), Math.max(...pts.map(p => p[0]!)), Math.max(...pts.map(p => p[1]!))]
    }
    const ra = region(a!), rb = region(b!)
    const meet = ra[0]! < rb[2]! && rb[0]! < ra[2]! && ra[1]! < rb[3]! && rb[1]! < ra[3]!
    expect(meet, JSON.stringify({ ra, rb })).toBe(false)
    // (and neither is left with nothing: each keeps room on the side away from the other)
    expect(a!.before).toBeGreaterThan(0)
    expect(b!.before).toBeGreaterThan(0)
  })

  it('a turned label\'s room ends where its band leaves its figure and its page, not where the figure\'s box projects (the review of #490)', () => {
    // (four letters, 20 long, from (280, 100) at 30 degrees, in a figure and a page of [0, 0, 300, 300])
    const c = Math.cos(Math.PI / 6), sn = Math.sin(Math.PI / 6), turned: unknown[] = [], boxes: number[] = []
    ;[...'abcd'].forEach((uch, k) => {
      const x0 = 280 + c * 5 * k, y0 = 100 + sn * 5 * k
      turned.push({ u: uch, n: 0, k, ox: x0, oy: y0, ex: x0 + c * 5, ey: y0 + sn * 5, ux: c, uy: sn, size: 10, ascent: 0.7, descent: -0.2, font: 'ArialMT', fill: 0, box: boxes.length / 4, at: 0, pt: 1 })
      boxes.push(x0 - 7 * sn, y0 - 2 * c, x0 + c * 5 + 2 * sn, y0 + sn * 5 + 7 * c)
    })
    const pg = { glyphs: [], turned, boxes, shapes: new Map(), paths: boxes.filter((_, i) => i % 4 === 0).map(() => -4), figures: new Map([['0:0', [0, 0, 300, 300]]]), pictures: [{ name: 'zs', glyph: 0, box: 0 }, { name: 'ze', glyph: 0, box: boxes.length / 4 }], points: [], view: [0, 0, 300, 300] }
    const u = unitsOf(pg as never)[0]!
    expect(u.angle).toBe(30)
    // (every corner of its widest drawing, its band from before its start to after its end, inside the figure and the page)
    const nx = -u.uy, ny = u.ux
    for (const sAlong of [-u.before, u.length + u.after]) for (const t of [u.descent * u.size, u.ascent * u.size]) {
      const x = u.x + u.ux * sAlong + nx * t, y = u.y + u.uy * sAlong + ny * t
      expect(x, `x at ${sAlong}, ${t}`).toBeLessThanOrEqual(300 + 1e-6)
      expect(y, `y at ${sAlong}, ${t}`).toBeLessThanOrEqual(300 + 1e-6)
      expect(Math.min(x, y)).toBeGreaterThanOrEqual(-1e-6)
    }
  })

  it('two labels on one line share the line between them, half each, ROOM_CLEAR apart', () => {
    const [a, b] = unitsOf(picture([{ text: 'left', x: 100, y: 100 }, { text: 'right', x: 150, y: 100 }]))
    // ("left" ends at 120, "right" begins at 150: 30 between, 1.5 clear, 14.25 each; one set, on one baseline)
    expect(a!.after).toBeCloseTo((30 - ROOM_CLEAR * 10) / 2, 6)
    expect(b!.before).toBeCloseTo((30 - ROOM_CLEAR * 10) / 2, 6)
    expect(a!.set).toBe(b!.set)
  })

  it('entries of one length are told their column\'s start by a shorter run in it (a legend\'s "…")', () => {
    // (each "Head n" with its frame right after it reads alone as set from its end; the column's "..." shares their start alone)
    const lines = ['Head 1', 'Head 2', 'Head 3'].map((text, i) => ({ text, x: 100, y: 200 - 14 * i }))
    const frame = [80, 150, 133, 212]
    expect(unitsOf(picture(lines, { dots: lines.map(l => [90, l.y, 93, l.y + 3]), frame })).map(u => u.anchor)).toEqual(['end', 'end', 'end'])
    const units = unitsOf(picture([...lines, { text: '...', x: 100, y: 158 }], { dots: lines.map(l => [90, l.y, 93, l.y + 3]), frame }))
    expect(units.map(u => u.anchor)).toEqual(['start', 'start', 'start'])
    expect(new Set(units.map(u => u.set)).size).toBe(1)
  })

  it('a right-aligned column is set from its end, a centred one from its middle, whatever an entry reads alone', () => {
    // (three words ending at 200; a dot right before the last, which alone reads as set from its start)
    const right = ['Train loss', 'Validation loss', 'Test'].map((text, i) => ({ text, x: 200 - 5 * text.length, y: 200 - 14 * i }))
    const dot = [[173, 172, 177, 176]]
    expect(unitsOf(picture([right[2]!], { dots: dot }))[0]!.anchor).toBe('start')
    const r = unitsOf(picture(right, { dots: dot }))
    expect(r.map(u => u.anchor)).toEqual(['end', 'end', 'end'])
    expect(new Set(r.map(u => u.set)).size).toBe(1)
    // (two lines of a title centred on 150; a stroke right after the second, which alone reads as set from its end)
    const centred = ['Attention distance', 'by layer'].map((text, i) => ({ text, x: 150 - 2.5 * text.length, y: 200 - 14 * i }))
    const stroke = [[172, 180, 172, 195]]
    expect(unitsOf(picture([centred[1]!], { strokes: stroke }))[0]!.anchor).toBe('end')
    const c = unitsOf(picture(centred, { strokes: stroke }))
    expect(c.map(u => u.anchor)).toEqual(['centre', 'centre'])
    expect(c[0]!.set).toBe(c[1]!.set)
  })

  it('an axis\'s labels turned 30 degrees, each ending at its tick on one level line, are one column set from its end', () => {
    // (three words of 3, 5 and 7 letters, 5 a letter along (cos 30, sin 30), ending at (100, 100), (140, 100), (180, 100))
    const c = Math.cos(Math.PI / 6), sn = Math.sin(Math.PI / 6)
    const turned: unknown[] = [], boxes: number[] = []
    ;['Low', 'Mid-a', 'Highest'].forEach((word, n) => {
      const ex = 100 + 40 * n, ey = 100, len = 5 * word.length, ox = ex - c * len, oy = ey - sn * len
      ;[...word].forEach((u, k) => {
        const x0 = ox + c * 5 * k, y0 = oy + sn * 5 * k
        turned.push({ u, n, k, ox: x0, oy: y0, ex: x0 + c * 5, ey: y0 + sn * 5, ux: c, uy: sn, size: 10, ascent: 0.7, descent: -0.2, font: 'ArialMT', fill: 0, box: boxes.length / 4, at: 0, pt: 1 })
        boxes.push(Math.min(x0, x0 + c * 5) - 7 * sn, Math.min(y0, y0 + sn * 5) - 2 * c, Math.max(x0, x0 + c * 5) + 2 * sn, Math.max(y0, y0 + sn * 5) + 7 * c)
      })
    })
    const pg = { glyphs: [], turned, boxes, shapes: new Map(), figures: new Map([['0:0', [0, 0, 300, 300]]]), pictures: [{ name: 'zs', glyph: 0, box: 0 }, { name: 'ze', glyph: 0, box: boxes.length / 4 }], points: [], view: [0, 0, 300, 300] }
    const units = unitsOf(pg as never)
    expect(units.map(u => [u.text, u.angle])).toEqual([['Low', 30], ['Mid-a', 30], ['Highest', 30]])
    expect(units.map(u => u.anchor)).toEqual(['end', 'end', 'end'])
    expect(new Set(units.map(u => u.set)).size).toBe(1)
  })

  it('a number alone at a word\'s edge makes no column: an axis\'s title over a tick\'s label keeps its own reading', () => {
    const units = unitsOf(picture([{ text: '10', x: 120, y: 120 }, { text: 'Relative compute', x: 120, y: 100 }]))
    expect(units.map(u => [u.text, u.anchor])).toEqual([['Relative compute', 'centre']])
  })
})

describe('the figure units on the wire (page-pass.mjs figureUnits)', () => {
  const unit = (text: string, page = 1) => ({ page, group: 'f0', text, font: 'ArialMT', size: 8, fill: 0, angle: 0, x: 10, y: 10, ux: 1, uy: 0, length: 40, ascent: 0.88, descent: -0.2, anchor: 'centre', form: true })
  it('appends each drawn unit after the paper\'s own as an ink unit of kind inkfigures, its row on its page; a label of names keeps its source', () => {
    const bundle: unknown[][] = [['para', 0, null, null, null, [[0, 'We evaluate on HellaSwag and report the loss.']]]]
    const rows = figureUnits({ units: [unit('Validation loss'), unit('HellaSwag', 2), unit('Hidden page', 3)] }, { bundle, undrawable: [3], M: 3, prose: 'We evaluate on HellaSwag and report the loss.' })
    expect(bundle.slice(1).map(u => [u[0], u[1], u[5]])).toEqual([[FIGURE_KIND, 0, [[0, 'Validation loss']]], [FIGURE_KIND, UNIT_FLAG_BITS.KEPT, [[0, 'HellaSwag']]]])
    expect([...rows.keys()]).toEqual([1, 2])
    expect(rows.get(1)?.[0]?.slice(0, 3)).toEqual([1, 0, 1])
  })
})

describe('the figures\' groups hide their ink and nothing else (the pixel tier, in Node)', () => {
  /** a unit's band box on the page at `scale`, device pixels, y down (the page's height `h`) */
  const bandBox = (u: Unit, scale: number, h: number) => {
    const nx = -u.uy, ny = u.ux, lo = u.descent * u.size, hi = u.ascent * u.size
    const pts = [[0, lo], [u.length, lo], [0, hi], [u.length, hi]].map(([s, t]) => [(u.x + u.ux * s! + nx * t!) * scale, h - (u.y + u.uy * s! + ny * t!) * scale])
    return [Math.min(...pts.map(p => p[0]!)), Math.min(...pts.map(p => p[1]!)), Math.max(...pts.map(p => p[0]!)), Math.max(...pts.map(p => p[1]!))]
  }
  const changed = (a: { data: Uint8ClampedArray }, b: { data: Uint8ClampedArray }) => { const out: number[] = []; for (let i = 0; i < a.data.length; i += 4) if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2]) out.push(i / 4); return out }

  it('every group shown is our page; the figures hidden change pixels inside their own bands alone, each band losing its ink; each band then blank', async () => {
    const scale = 2
    const plain = await renderPage(final, 1, { scale }), on = await renderPage(wrap.bytes, 1, { scale })
    expect(changed(on, plain).length, 'every group shown: our unwrapped page (G1)').toBe(0)
    const groups = new Set(wrap.figures.units.map(u => u.group))
    const off = await renderPage(wrap.bytes, 1, { scale, off: name => groups.has(name.replace(/^axt:/, '')) })
    const w = on.width, h = on.height
    const bands = wrap.figures.units.map(u => bandBox(u, scale, h))
    const diff = changed(on, off)
    const inside = (px: number, b: number[], pad: number) => { const x = px % w, y = Math.floor(px / w); return x >= b[0]! - pad && x < b[2]! + pad && y >= b[1]! - pad && y < b[3]! + pad }
    // (containment: nothing outside the figures' own bands, an antialiased edge apart)
    expect(diff.filter(px => !bands.some(b => inside(px, b, 2))).length, 'pixels hidden outside the figures\' bands').toBe(0)
    // (no double ink: every unit's ink goes, and its band is then one colour, the ground the translation is drawn on: no stroke,
    // no other glyph, nothing a translation in it could cover)
    for (const [i, u] of wrap.figures.units.entries()) {
      const b = bands[i]!
      expect(diff.some(px => inside(px, b, 0)), `${u.text}: its ink hidden`).toBe(true)
      const colours = new Set<string>()
      for (let y = Math.ceil(b[1]! + 1); y < Math.floor(b[3]! - 1); y++) for (let x = Math.ceil(b[0]! + 1); x < Math.floor(b[2]! - 1); x++) { const o = 4 * (y * w + x); colours.add(`${off.data[o]! >> 4},${off.data[o + 1]! >> 4},${off.data[o + 2]! >> 4}`) }
      expect(colours.size, `${u.text}: its band blank once its ink is hidden`).toBe(1)
    }
  }, 120_000)
})
