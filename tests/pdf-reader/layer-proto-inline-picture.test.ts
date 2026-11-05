import { beforeAll, describe, expect, it } from 'vitest'
import { PH_FLAG } from '@/pdf-reader/engine/layout/file.mjs'

// An inline picture (`\includegraphics` in a line of text) is a placeholder of TeX's nothing: it sets no character. Since REMOVAL 26
// its picture is the placeholder's group where the file finds its row (own.mjs MR 7), and that group is hidden wherever another
// piece of the unit is drawn; drawn as nothing, the picture was gone. 2610.19159v1 p1's links line, `\href{…}{\includegraphics…
// \textbf{Code}} ~ ~ ~ \href{…}{\includegraphics…{huggingface.png} …} ~ ~ ~ \href{…}{\includegraphics…{leaderboard.png} …}`: its
// second and third icons erased and not drawn back. A found picture is now its segments' crop (tex.mjs cropsOf), as any piece the
// file holds no character of is; one the file did not find, or found with no ink, stays nothing.

type L2 = typeof import('@/pdf-reader/engine/layer-proto/layer2.mjs')
type Tex = typeof import('@/pdf-reader/engine/layer-proto/tex.mjs')
let L2: L2
let T: Tex
beforeAll(async () => {
  // a canvas that measures a character as half an em (layer2.mjs measures with one made when it loads)
  const g = globalThis as { OffscreenCanvas?: unknown }
  g.OffscreenCanvas = class { getContext() { return { font: '', measureText: (s: string) => ({ width: 50 * s.length, actualBoundingBoxAscent: 70, actualBoundingBoxDescent: 20 }) } } }
  L2 = await import('@/pdf-reader/engine/layer-proto/layer2.mjs')
  T = await import('@/pdf-reader/engine/layer-proto/tex.mjs')
})

const serif = { fam: 'serif', bold: true, italic: false, caps: false, known: false } as never
/** a text item's characters, each half its size wide, from x on baseline yb */
const item = (text: string, x: number, yb: number, size: number, n: number) => [...text].map((ch, k) => ({ ch, x0: x + 0.5 * size * k, x1: x + 0.5 * size * (k + 1), yb, size, item: n, ix: x, k, st: serif }))
/** the unit in the layout file as indexLayout reads it: its one line, one frame, its placeholders by k */
const unitOf = (ph: [number, number, number[]][]) => ({
  lines: Float64Array.from([1, 40, 200, 100, 111, 97, 10, 0]), frames: Float64Array.from([1, 0, 0, 1, -1, 0]), erase: [new Float64Array(0)],
  ph: new Map(ph.map(([k, flags, segs]) => [k, { kind: 'other', flags, segs: Float64Array.from(segs) }])), labels: new Float64Array(0),
}) as never
const text = (s: string) => ({ t: 'text', s }), ph = (src: string) => ({ t: 'ph', src })
// "Code ~ ~ ~ [icon] Benchmark": the icon a picture 11.3 pt square on the baseline, no glyph of it on the page
const page = [...item('Code', 40, 100, 10, 0), ...item('Benchmark', 102, 100, 10, 1)]
const ICON = '\\includegraphics[height=0.4cm]{logo/huggingface.png}'
const unit = { kind: 'affiliation', src: 'Code Benchmark', pieces: [text('\u4EE3\u7801 '), ph(ICON), text(' \u57FA\u51C6')] } as never
const read = (lu: never) => { const t = T.texRects(lu); return L2.prepareUnit(unit, t.rects as never, [page as never], new Map() as never, null, T.texParts(lu, [-1, 1, -1], { lines: t }) as never) }
const SEGS = [1, 85, 100, 96.33, 111.33, 100]

describe('an inline picture the file found is drawn back from its own ink (2610.19159v1 p1, u1823)', () => {
  it('found: its segments\' crop, on the line\'s baseline, the whole picture in it', () => {
    const r = read(unitOf([[1, 0, SEGS]]))
    expect(r.unproven).toBeUndefined()
    const c = r.get(1)
    expect(c).toMatchObject({ mode: 'crop', baseline: 100, text: '' })
    // (the crop's box the segment's: the picture from x 85 to 96.33, its foot on the baseline to its top 11.33 over it)
    expect(c?.crop?.[0]).toBeLessThanOrEqual(85)
    expect(c?.crop?.[2]).toBeGreaterThanOrEqual(96.33)
    expect(c?.crop?.[3]).toBeGreaterThanOrEqual(111.33)
  })
  it('not found (LOST) or found with no ink (EMPTY): nothing, as before', () => {
    expect(read(unitOf([[1, PH_FLAG.LOST, []]])).get(1)).toMatchObject({ mode: 'none', text: '' })
    expect(read(unitOf([[1, PH_FLAG.EMPTY, []]])).get(1)).toMatchObject({ mode: 'none', text: '' })
  })
  it('a picture set outside the unit\'s lines (OUTSIDE: its own ink, left where it stands) stays nothing', () => {
    expect(read(unitOf([[1, PH_FLAG.OUTSIDE, SEGS]])).get(1)).toMatchObject({ mode: 'none', text: '' })
  })
})
