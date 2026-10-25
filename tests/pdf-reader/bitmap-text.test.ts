// @vitest-environment node
// The text inside a bitmap figure (layout/bitmap-text.mjs labelsOf, PDF-READER §19.15): the recogniser's lines of one placed image
// merged into labels as the extension merges them, each drawn over a patch of its ground or left the original's with its reason.
// Synthetic images: a white ground, a line's ink a dark bar inside its box, so that each rule is one shape
import { describe, expect, it } from 'vitest'
import { labelsOf, OCR_SIZE, PATCH_PAD } from '@/pdf-reader/engine/layout/bitmap-text.mjs'

const W = 400, H = 200
/** a white RGBA image with dark bars ([x0, y0, x1, y1, rgb]) drawn in it, image pixels, origin top left */
function image(bars: [number, number, number, number, number?][] = []) {
  const data = new Uint8ClampedArray(W * H * 4).fill(255)
  for (const [x0, y0, x1, y1, rgb = 0x202020] of bars) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = 4 * (y * W + x)
    data[i] = rgb >> 16; data[i + 1] = (rgb >> 8) & 255; data[i + 2] = rgb & 255
  }
  return { data, width: W, height: H, kind: 3 }
}
/** a recogniser's line: its box in image pixels (x0, y0, x1, y1), its text */
const line = (x0: number, y0: number, x1: number, y1: number, text = 'Validation loss', conf = 0.95) => ({ text, conf, quad: [[x0 / W, y0 / H], [x1 / W, y0 / H], [x1 / W, y1 / H], [x0 / W, y1 / H]] as [[number, number], [number, number], [number, number], [number, number]] })
/** the image drawn at its pixels' size from the page's origin, y up: a pixel (x, y) is the page's (x, H - y) */
const place = { page: 1, ctm: [W, 0, 0, H, 0, 0], clip: [], view: [0, 0, 612, 792] }
const run = (o: Partial<Parameters<typeof labelsOf>[0]> = {}) => labelsOf({ image: image([[105, 85, 195, 99]]), lines: [line(100, 80, 200, 104)], place, ...o } as never)

describe('a bitmap figure\'s labels (labelsOf)', () => {
  it('draws a label whose ground is flat round it: its patch over its line, its colours the ground\'s and the ink\'s, its size the extension\'s', () => {
    const r = run()
    expect(r.left).toEqual([])
    expect(r.units).toHaveLength(1)
    const u = r.units[0]!
    expect(u).toMatchObject({ text: 'Validation loss', lines: 1, bg: 0xffffff, fg: 0x202020, anchor: 'centre' })
    expect(u.size).toBeCloseTo(OCR_SIZE * 24, 6)
    // (its quad the line's on the page; its patch the quad grown by PATCH_PAD of its thickness each side)
    const [quad, patch] = u.quads[0]!
    expect(quad).toEqual([[100, 120], [200, 120], [200, 96], [100, 96]])
    const g = PATCH_PAD * 24
    expect(patch.map(p => p.map(v => Math.round(v * 1000) / 1000))).toEqual([[100 - g, 120 + g], [200 + g, 120 + g], [200 + g, 96 - g], [100 - g, 96 - g]].map(p => p.map(v => Math.round(v * 1000) / 1000)))
  })

  it('leaves a label whose ring is not flat: a plot\'s line through it, a ground of two colours (`busy`)', () => {
    expect(run({ image: image([[105, 85, 195, 99], [50, 91, 350, 93]]) }).left).toEqual([{ text: 'Validation loss', why: 'busy' }])
    expect(run({ image: image([[105, 85, 195, 99], [0, 0, 150, 200, 0xc0d0ff]]) }).left).toEqual([{ text: 'Validation loss', why: 'busy' }])
  })

  it('leaves a label whose box holds ink of another colour than its own (`crowded`)', () => {
    expect(run({ image: image([[105, 85, 195, 99], [180, 82, 199, 102, 0xe02020]]) }).left).toEqual([{ text: 'Validation loss', why: 'crowded' }])
  })

  it('leaves a label whose ink runs past its box into another line\'s, where no patch can tell whose it is (a descender over a number)', () => {
    // (the label's ink reaches 6 px below its box, into the box of the number under it, "(13)", which no label holds)
    const img = image([[105, 85, 195, 99], [120, 99, 126, 110], [130, 112, 160, 126]])
    const r = labelsOf({ image: img, lines: [line(100, 80, 200, 104), line(125, 106, 165, 130, '(13)')], place } as never)
    expect(r.units).toEqual([])
    expect(r.left).toEqual([{ text: 'Validation loss', why: 'busy' }])
  })

  it('draws two labels close by, each patch held off the other\'s ink', () => {
    const img = image([[105, 85, 195, 99], [105, 113, 195, 127]])
    const r = labelsOf({ image: img, lines: [line(100, 80, 200, 104, 'Validation loss'), line(100, 106, 200, 130, 'Training loss')], place } as never)
    // (the extension merges the two into one label of two lines, as it sends them: one unit, two patches)
    expect(r.units.map(u => [u.text, u.lines])).toEqual([['Validation loss Training loss', 2]])
  })

  it('leaves a label its clip cuts, past its page, or that its placement mirrors', () => {
    expect(run({ place: { ...place, clip: [[[0, 0], [150, 0], [150, 200], [0, 200]]] } }).left).toEqual([{ text: 'Validation loss', why: 'clipped' }])
    expect(run({ place: { ...place, clip: 'complex' } }).left).toEqual([{ text: 'Validation loss', why: 'clipped' }])
    expect(run({ place: { ...place, view: [0, 0, 150, 200] } }).left).toEqual([{ text: 'Validation loss', why: 'clipped' }])
    expect(run({ place: { ...place, ctm: [-W, 0, 0, H, W, 0] } }).left).toEqual([{ text: 'Validation loss', why: 'mirrored' }])
  })

  it('leaves a label the page\'s own ink stands over: its text, a path drawn after the image, a fill holding it, or more than can be read', () => {
    expect(run({ others: { boxes: [[120, 100, 140, 110]], segs: [], fills: [] } }).left).toEqual([{ text: 'Validation loss', why: 'covered' }])
    expect(run({ others: { boxes: [], segs: [[90, 108, 210, 108, 0.5]], fills: [] } }).left).toEqual([{ text: 'Validation loss', why: 'covered' }])
    const box = [[0, 0, 300, 0], [300, 0, 300, 200], [300, 200, 0, 200], [0, 200, 0, 0]]
    expect(run({ others: { boxes: [], segs: [], fills: [box] } }).left).toEqual([{ text: 'Validation loss', why: 'covered' }])
    expect(run({ others: null }).left).toEqual([{ text: 'Validation loss', why: 'covered' }])
    // (ink of the page apart from the patch: none of its business)
    expect(run({ others: { boxes: [[300, 10, 320, 20]], segs: [[300, 0, 300, 200, 0.5]], fills: [] } }).units).toHaveLength(1)
  })

  it('leaves a label of more than eight lines (a paragraph a figure holds), and past the image\'s bound (`long`, `past`)', () => {
    const lines = Array.from({ length: 9 }, (_, i) => line(100, 2 + 20 * i, 200, 20 + 20 * i, `word${'s'.repeat(i)} here`))
    const bars = lines.map((_, i) => [105, 6 + 20 * i, 195, 16 + 20 * i] as [number, number, number, number])
    expect(labelsOf({ image: image(bars), lines, place } as never).left.map(l => l.why)).toEqual(['long'])
    expect(run({ limit: 0 }).left).toEqual([{ text: 'Validation loss', why: 'past' }])
  })

  it('keeps out what the extension keeps out: a number, a letter alone, a line read with little confidence', () => {
    const r = labelsOf({ image: image([[105, 85, 195, 99]]), lines: [line(100, 80, 200, 104, '0.25'), line(100, 80, 200, 104, 'B'), line(100, 80, 200, 104, 'Loss', 0.1)], place } as never)
    expect(r).toMatchObject({ units: [], left: [] })
  })

  it('anchors a label at its start where ink stands right before it (a legend\'s marker), else at its middle', () => {
    const r = run({ image: image([[105, 85, 195, 99], [82, 90, 96, 94]]) })
    expect(r.units[0]?.anchor).toBe('start')
  })

  it('holds a patch drawn by an image before on its page apart (`overlap`)', () => {
    const taken = [[[90, 125], [210, 125], [210, 90], [90, 90]]]
    expect(run({ taken: taken as never }).left).toEqual([{ text: 'Validation loss', why: 'overlap' }])
  })
})
