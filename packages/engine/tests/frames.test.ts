// The frames a page paints (locate/frames.ts framesOnPage, docs/PDF-READER.md §18.111): the closed paths that hold text, each
// told seen or not by the page's own operators, no tolerance: a stroke is seen; a fill is seen where its colour is not the colour
// painted under it (the last fill before it whose region holds its box's edge middles, covering what is under it; the paper's
// white where none; an image there: no colour this reading knows, seen); a path painted at an alpha of 0 is not. Pages made by
// hand; our own text.
import { describe, expect, it } from 'vitest'
import type { DocPage } from '../src/doc.ts'
import { frameOf, framesOnPage, frameUnder, type PaintedPage } from '../src/locate/frames.ts'
import { docOf } from './helpers/doc.ts'

const edges = (x0: number, y0: number, x1: number, y1: number) =>
  Float32Array.from([x0, y0, x1, y0, x1, y0, x1, y1, x1, y1, x0, y1, x0, y1, x0, y0])
type S = NonNullable<PaintedPage['shapes']> extends ReadonlyMap<number, infer V> ? V : never
/** a page of one line of text at (84, 700) and the boxes given (each [kind, x0, y0, x1, y1]), its paths' paint by index */
function pageOf(
  boxes: [number, number, number, number, number][],
  paint: (Partial<S> | null)[],
  unseen: number[] = [],
) {
  const pg = docOf([{ lines: [{ text: 'held text here', x: 84, y: 700 }], boxes: boxes.map((b) => [0, ...b]) }])
    .pages[0] as DocPage
  const shapes = new Map<number, S>()
  paint.forEach((p, b) => {
    if (!p) return
    const [x0, y0, x1, y1] = boxes[b]!.slice(1) as [number, number, number, number]
    shapes.set(b, { segs: edges(x0, y0, x1, y1), stroke: false, fill: true, hw: 0.25, opaque: true, ...p })
  })
  return { pg, raw: { shapes, unseen: new Set(unseen) } satisfies PaintedPage }
}
const seenOf = (r: ReturnType<typeof pageOf>) => framesOnPage(r.raw, r.pg).map((f) => [f.b, f.seen, f.why ?? null])
const GREY = 0xe6e6e6

describe('the frames a page paints: seen by its own operators', () => {
  it('reads a fill of a colour on the paper seen, a white one unseen, a stroke seen whatever its colour', () => {
    expect(seenOf(pageOf([[0, 72, 690, 300, 712]], [{ colour: 0xeeeeee }]))).toEqual([[0, true, null]])
    expect(seenOf(pageOf([[0, 72, 690, 300, 712]], [{ colour: 0xffffff }]))).toEqual([[0, false, 'as under']])
    expect(seenOf(pageOf([[0, 72, 690, 300, 712]], [{ colour: 0xffffff, stroke: true }]))).toEqual([[0, true, null]])
    expect(seenOf(pageOf([[0, 72, 690, 300, 712]], [{ fill: false, stroke: true }]))).toEqual([[0, true, null]])
  })
  it('reads a fill over a fill of its own colour unseen, over another colour seen (a ring of two fills: both)', () => {
    const ring: [number, number, number, number, number][] = [
      [0, 72, 690, 300, 712],
      [1, 73, 691, 299, 711],
    ]
    expect(seenOf(pageOf(ring, [{ colour: 0x1f3a93 }, { colour: 0xffffff }]))).toEqual([
      [0, true, null],
      [1, true, null],
    ])
    expect(seenOf(pageOf(ring, [{ colour: 0xeeeeee }, { colour: 0xeeeeee }]))).toEqual([
      [0, true, null],
      [1, false, 'as under'],
    ])
    // (a fill under it that covers nothing whole, a translucent one: no colour known there, seen)
    expect(seenOf(pageOf(ring, [{ colour: 0xffffff, opaque: undefined }, { colour: 0xffffff }]))).toEqual([
      [0, false, 'as under'],
      [1, true, null],
    ])
  })
  it('reads a fill over an image seen, a path painted at an alpha of 0 unseen, a path holding no text no frame', () => {
    expect(
      seenOf(
        pageOf(
          [
            [-3, 60, 680, 320, 720],
            [0, 72, 690, 300, 712],
          ],
          [null, { colour: 0xffffff }],
        ),
      ),
    ).toEqual([[1, true, null]])
    expect(seenOf(pageOf([[0, 72, 690, 300, 712]], [{ colour: 0xeeeeee }], [0]))).toEqual([[0, false, 'alpha 0']])
    expect(seenOf(pageOf([[0, 72, 600, 300, 640]], [{ colour: 0xeeeeee }]))).toEqual([])
  })
  it('reads each edge middle by the paint under it there: a white fill half over an image seen, over the paper alone not', () => {
    // (an image under its left half: what is under its left edge's middle has no colour this reading knows; Codex's review)
    expect(
      seenOf(
        pageOf(
          [
            [-3, 60, 680, 180, 720],
            [0, 72, 690, 300, 712],
          ],
          [null, { colour: 0xffffff }],
        ),
      ),
    ).toEqual([[1, true, null]])
    // (a grey fill under its right half alone, white elsewhere: its right edge's middle stands on the grey, seen)
    expect(
      seenOf(
        pageOf(
          [
            [0, 250, 680, 320, 720],
            [1, 72, 690, 300, 712],
          ],
          [{ colour: 0x888888 }, { colour: 0xffffff }],
        ),
      ),
    ).toEqual([[1, true, null]])
  })
  it('reads a fill of the colour under it unseen whichever of its edges stand flush with the fill’s under it', () => {
    // (a grey panel and a fill of the same grey inside it, flush with its right edge (Devin's review on #672): the paint under
    // the inner fill's right edge is the panel's, read on the edge's inner side, not the paper's beyond it)
    const panel: [number, number, number, number, number] = [0, 80, 650, 300, 740]
    expect(seenOf(pageOf([panel, [1, 90, 686, 300, 730]], [{ colour: GREY }, { colour: GREY }]))).toEqual([
      [0, true, null],
      [1, false, 'as under'],
    ])
    // (flush with its top edge, and with its right and its top at once)
    const low: [number, number, number, number, number] = [0, 80, 650, 300, 730]
    expect(seenOf(pageOf([low, [1, 90, 686, 290, 730]], [{ colour: GREY }, { colour: GREY }]))).toEqual([
      [0, true, null],
      [1, false, 'as under'],
    ])
    expect(seenOf(pageOf([low, [1, 90, 686, 300, 730]], [{ colour: GREY }, { colour: GREY }]))).toEqual([
      [0, true, null],
      [1, false, 'as under'],
    ])
    // (a fill of another colour in the same place: seen, a frame)
    expect(seenOf(pageOf([panel, [1, 90, 686, 300, 730]], [{ colour: GREY }, { colour: 0xdddddd }]))).toEqual([
      [0, true, null],
      [1, true, null],
    ])
  })
  it('reads no open path a frame, nor a background of the page’s size', () => {
    const r = pageOf([[0, 72, 690, 300, 712]], [{ colour: 0xeeeeee }])
    r.raw.shapes.set(0, { ...r.raw.shapes.get(0)!, segs: Float32Array.from([72, 690, 300, 690, 300, 690, 300, 712]) })
    expect(seenOf(r)).toEqual([])
    expect(seenOf(pageOf([[0, 0, 0, 612, 792]], [{ colour: 0xeeeeee }]))).toEqual([])
  })
  it('picks the innermost seen frame holding the lines, none a line crosses, and reads its border under a run', () => {
    const r = pageOf(
      [
        [0, 60, 650, 320, 730],
        [1, 72, 690, 300, 712],
      ],
      [{ colour: 0xeeeeee }, { colour: 0xdddddd }],
    )
    const frames = framesOnPage(r.raw, r.pg)
    const line = [1, 0, 84, 168, 700, 707, 698, 72, 540, 0, 10] as Parameters<typeof frameOf>[1][number]
    const f = frameOf(frames, [line])
    expect(f?.b).toBe(1)
    expect(frameUnder(f, 697.5, 84, 168)).toBe(690)
    // (a line the inner one's border crosses: the outer holds it)
    const crossed = [1, 0, 84, 310, 700, 707, 698, 72, 540, 0, 10] as typeof line
    expect(frameOf(frames, [crossed])?.b).toBe(0)
  })
})
