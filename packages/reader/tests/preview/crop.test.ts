// A crop's region on each pane (preview/crop.ts regionOf; link previews' §3.2, L12): the target's box on A on the left and on a
// right page not laid; on a laid right page, that box widened by the extent of every member laid there whose lines on A stand
// inside it (a float's translated caption, longer than the original's); a section's window runs on to the next page and fades
// at its foot (the one fade); a figure, a table, a display never fade. And the content made of it (contentOf over stand-ins):
// a far right page warmed (laid and drawn off the view) before it is cut; a crop that cannot be drawn shows no preview.
import type { Part, Placed, Target } from '@readarxiv/format'
import { describe, expect, it, vi } from 'vitest'
import type { Page } from '../../src/compose/page.ts'
import { cropContent, regionOf } from '../../src/preview/crop.ts'

const FIG: Target = ['"figure.1"', 'float', 3, 4, [72, 400, 540, 700]]
const SEC: Target = ['"section.2"', 'heading', 3, 9, [72, 60, 300, 140], 4, [72, 700, 300, 740]]
const EQ: Target = ['"equation.3"', 'display', 3, 6, [150, 300, 450, 330]]
const line = (y: number, x0: number, x1: number): Placed['lines'][number] => [
  3,
  0,
  x0,
  x1,
  y,
  y + 8,
  y - 2,
  72,
  540,
  0,
  9,
]
const placed = (ord: number, lines: Placed['lines']): Placed => ({
  ord,
  kind: 'caption',
  text: String(ord).repeat(64).slice(0, 64),
  lead: 11,
  style: { role: 'serif', size: 9 },
  align: 'j',
  lines,
  room: { below: 2, next: 12 },
})
// (the caption inside the float's box, a paragraph below it outside)
const caption = placed(4, [line(410, 100, 500), line(400 + 2, 100, 300)])
const para = placed(5, [line(380, 72, 540)])
const part: Part = { format: 1, page: 3, paper: { faces: { fonts: [] } }, flows: [[caption, para]] }
const laid = (extent: [number, number, number, number]): Page => ({
  page: 3,
  wait: { rows: [], faces: [] },
  members: [
    { ord: 4, page: 3, state: 'laid', off: 1, lines: [], lit: { left: [], right: [], own: [] }, extent },
    {
      ord: 5,
      page: 3,
      state: 'laid',
      off: 1,
      lines: [],
      lit: { left: [], right: [], own: [] },
      extent: [72, 300, 560, 390],
    },
  ],
  links: [],
})

describe('regionOf', () => {
  it('the right’s region of a laid float widens by its translated caption’s extent', () => {
    const r = regionOf(FIG, 'right', laid([60, 380, 560, 420]), part)
    expect(r.box).toEqual([60, 380, 560, 700])
    expect(r.fade).toBe(false)
  })
  it('a caption whose last line has no descender on A (the stated box ink-tight at its baseline) still widens it by its translation', () => {
    // (the float's box ends at the caption's last baseline, 400; its line's fonts box reaches 398 under it: the line stands in
    // the box by its ink across and its baseline, and its translation, whose descenders reach 396, widens the box down to them)
    const tight: Target = ['"figure.1"', 'float', 3, 4, [72, 400, 540, 700]]
    const cap = placed(4, [line(410, 100, 500), line(400, 100, 300)])
    const p: Part = { ...part, flows: [[cap, para]] }
    const r = regionOf(tight, 'right', laid([100, 396, 500, 420]), p)
    expect(r.box[1]).toBe(396)
  })
  it('a page not laid crops the target’s box alone, and so does the left', () => {
    expect(regionOf(FIG, 'right', null, part).box).toEqual(FIG[4])
    expect(regionOf(FIG, 'left', laid([60, 380, 560, 420]), part).box).toEqual(FIG[4])
  })
  it('a section runs on to the next page and fades', () => {
    const r = regionOf(SEC, 'left', null, null)
    expect(r.next).toEqual([4, [72, 700, 300, 740]])
    expect(r.fade).toBe(true)
  })
  it('a display never fades', () => {
    expect(regionOf(EQ, 'right', null, null).fade).toBe(false)
  })
})

describe('cropContent', () => {
  const words = {
    keep: (l: string) => `${l}: keep on screen`,
    close: (l: string) => `Close ${l}`,
    go: 'Go to',
    search: 'S',
  }
  const stand = (o: { laid: Page | null; warm: boolean; region: HTMLElement | null; original: HTMLElement | null }) => {
    const warm = vi.fn(async (_n: number, _signal: AbortSignal) => o.warm)
    const region = vi.fn((_n: number, _box: [number, number, number, number], _scale: number) => o.region)
    const original = vi.fn(async (_n: number, _box: unknown, _scale: number, _signal: AbortSignal) => o.original)
    return {
      warm,
      region,
      original,
      deps: {
        scale: () => 1,
        composer: () => ({ laid: () => o.laid, warm, region }),
        part: async () => part,
        original,
        words: () => words,
        label: () => 'Figure 1',
      },
    }
  }
  const seg = () => {
    const el = document.createElement('div')
    el.className = 'seg'
    return el
  }
  it('a far right page is warmed, then cropped', async () => {
    const s = stand({ laid: laid([60, 380, 560, 420]), warm: true, region: seg(), original: null })
    const c = await cropContent(
      FIG,
      { side: 'right', max: { width: 800, height: 600 }, sheet: false, signal: new AbortController().signal },
      s.deps,
    )
    expect(s.warm).toHaveBeenCalledWith(3, expect.anything())
    expect(s.region).toHaveBeenCalled()
    expect(s.region.mock.calls[0]![1]).toEqual([60, 380, 560, 700])
    expect(c?.kind).toBe('crop')
    expect(c?.el.querySelector('.seg')).not.toBeNull()
    // (named by its label; kept by a button named for keeping it)
    expect(c?.described.getAttribute('role')).toBe('img')
    expect(c?.described.getAttribute('aria-label')).toBe('Figure 1')
    expect(c?.el.getAttribute('aria-label') ?? c?.el.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Figure 1: keep on screen',
    )
  })
  it('a right page not laid shows what the pane shows for it: the original’s drawing, never waiting for a translation', async () => {
    const s = stand({ laid: null, warm: false, region: null, original: seg() })
    const c = await cropContent(
      FIG,
      { side: 'right', max: { width: 800, height: 600 }, sheet: false, signal: new AbortController().signal },
      s.deps,
    )
    expect(s.original).toHaveBeenCalled()
    expect(c).not.toBeNull()
  })
  it('a crop that cannot be drawn shows no preview', async () => {
    const s = stand({ laid: laid([60, 380, 560, 420]), warm: false, region: null, original: null })
    expect(
      await cropContent(
        FIG,
        { side: 'right', max: { width: 800, height: 600 }, sheet: false, signal: new AbortController().signal },
        s.deps,
      ),
    ).toBeNull()
    const t = stand({ laid: null, warm: false, region: null, original: null })
    expect(
      await cropContent(
        FIG,
        { side: 'left', max: { width: 800, height: 600 }, sheet: false, signal: new AbortController().signal },
        t.deps,
      ),
    ).toBeNull()
  })
})
