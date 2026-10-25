// @vitest-environment node
import { readFileSync } from 'node:fs'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { beforeAll, describe, expect, it } from 'vitest'
import { ANCHOR_REACH, DRAW_BAND, figureUnitsOf, FIGURE_WHYS } from '@/pdf-reader/engine/layout/figure-text.mjs'
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
