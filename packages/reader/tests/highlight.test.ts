// The highlight over a figure text the original sets turned (docs/PDF-READER.md §17; Laid.lit's `dir`): its boxes in its run's
// frame, painted as a band turned with its text about its own centre, and hit where it is painted. Over a stand-in of the panes
// (one upright page 600 × 800 at scale 1: a PDF unit a CSS px, y down) and of the composer (one laid Page).
import { describe, expect, it, vi } from 'vitest'
import type { Composer } from '../src/compose/composer.ts'
import { createHighlight, PAD } from '../src/compose/highlight.ts'
import type { Box, Page } from '../src/compose/page.ts'
import type { Panes } from '../src/panes/panes.ts'
import type { Clock } from '../src/stack/clock.ts'

const H = 800
const clock: Clock = { now: () => 0, later: () => 1, clear: () => {}, frame: () => 1, cancel: () => {} }

function setUp(page: Page) {
  const els = { left: document.createElement('div'), right: document.createElement('div') }
  for (const [side, el] of Object.entries(els)) {
    el.className = 'page'
    el.dataset.pageNumber = '1'
    el.dataset.side = side
    // (its box on the screen at the page's origin, 600 CSS px wide: a point of the screen is the page's own)
    Object.defineProperty(el, 'offsetWidth', { value: 600 })
    el.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 600, height: H, right: 600, bottom: H, x: 0, y: 0 }) as DOMRect
    document.body.append(el)
  }
  const panes = {
    scale: 1,
    right: { pages: 1, on: () => () => {} },
    on: () => () => {},
    pageElement: (side: 'left' | 'right') => els[side],
    containerOf: () => document.body,
    frameOf: () => ({ turn: 0, w: 600, h: H, width: 600, height: H }),
    boxOf: (_side: string, _n: number, r: Box) => ({
      left: Math.min(r[0], r[2]),
      top: H - Math.max(r[1], r[3]),
      width: Math.abs(r[2] - r[0]),
      height: Math.abs(r[3] - r[1]),
    }),
  } as unknown as Panes
  const composer = {
    page: () => page,
    laid: () => page,
    muted: () => false,
    on: () => () => {},
  } as unknown as Composer
  return { els, hl: createHighlight({ panes, composer, clock, on: true }) }
}

describe('the highlight of a figure text set turned', () => {
  // (a y-axis title set a quarter turned, up the page: its run along (0, 1) from (150, 380), 20 long; its band across it 8, x 144
  // to 152 on the page. In its run's frame: s its y, t its −x)
  const box: Box = [380, -152, 400, -144]
  const page: Page = {
    page: 1,
    wait: { rows: [], faces: [] },
    links: [],
    members: [
      {
        ord: 7,
        page: 1,
        state: 'laid',
        off: 1,
        lines: [[380, 150, 170, [{ s: 'Loss', x: 150, face: '400 100px "axt-x"', size: 8, dir: [0, 1] }]]],
        lit: { left: [[box]], right: [[box]], own: [], dir: [0, 1] },
      },
    ],
  }
  it('paints its band turned with its text about its own centre, padded beside along its run', () => {
    const { els, hl } = setUp(page)
    hl.light({ id: 7, s: -1 })
    const band = els.right.querySelector<HTMLElement>('.axt-hl')
    expect(band).not.toBeNull()
    // (its middle on the page at (148, 390): (148, 410) in CSS px; its run up the page, −90° in CSS's terms; 20 along it and
    // the pad either side, 8 across)
    expect(band!.style.transform).toBe(
      `translate(148px, 410px) rotate(-90deg) translate(${-(20 + 2 * PAD) / 2}px, -4px)`,
    )
    expect([band!.style.width, band!.style.height]).toEqual([`${20 + 2 * PAD}px`, '8px'])
    expect(els.left.querySelector('.axt-hl')).not.toBeNull()
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
  it('is hit where it is painted: over its turned band, not beside it', () => {
    const { els, hl } = setUp(page)
    const spy = vi.spyOn(document, 'elementFromPoint').mockReturnValue(els.right)
    // (its band covers x 144-152 and, padded, y 397-423 on the screen)
    expect(hl.at('right', 148, 400)).toEqual({ id: 7, s: -1 })
    expect(hl.at('right', 150, 421)).toEqual({ id: 7, s: -1 })
    expect(hl.at('right', 160, 410)).toBeNull()
    expect(hl.at('right', 148, 380)).toBeNull()
    spy.mockRestore()
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
})

describe('the highlight by sentence', () => {
  // (a member of three sentences, lit by sentence on both panes (Laid.lit: one entry a sentence): on the left its lines on A cut at
  // its starts, on the right its laid lines' tokens)
  const left: Box[][] = [
    [[72, 698, 200, 707]],
    [
      [200, 698, 300, 707],
      [72, 686, 150, 695],
    ],
    [
      [150, 686, 300, 695],
      [72, 674, 200, 683],
    ],
  ]
  const right: Box[][] = [
    [[80, 690, 150, 700]],
    [
      [150, 690, 300, 700],
      [80, 676, 120, 686],
    ],
    [[120, 676, 280, 686]],
  ]
  const page: Page = {
    page: 1,
    wait: { rows: [], faces: [] },
    links: [],
    members: [{ ord: 3, page: 1, state: 'laid', off: 1, lines: [], lit: { left, right, own: [] } }],
  }
  it('lights the sentence under the pointer and its translation, and only it, on both panes', () => {
    const { els, hl } = setUp(page)
    const spy = vi.spyOn(document, 'elementFromPoint').mockReturnValue(els.left)
    // (a point of the second sentence's second row on A, x 100, y 690 up: 110 down)
    const t = hl.at('left', 100, 110)
    expect(t).toEqual({ id: 3, s: 1 })
    hl.light(t)
    expect(hl.bands()).toEqual({ left: 1, right: 1 })
    // (the second sentence's rows on each pane, one shape of two rows: from x 72 on the left, 80 on the right, less the pad)
    const shape = (side: 'left' | 'right') => els[side].querySelector<HTMLElement>('.axt-hl')!
    expect(shape('left').getAttribute('class')).toContain('axt-hl-shape')
    expect(shape('left').style.left).toBe(`${72 - PAD}px`)
    expect(shape('right').getAttribute('class')).toContain('axt-hl-shape')
    expect(shape('right').style.left).toBe(`${80 - PAD}px`)
    // (its translation's third sentence from the right: one row there, two on A)
    spy.mockReturnValue(els.right)
    const third = hl.at('right', 200, 800 - 680)
    expect(third).toEqual({ id: 3, s: 2 })
    hl.light(third)
    expect(shape('right').getAttribute('class')).not.toContain('axt-hl-shape')
    expect(shape('left').style.left).toBe(`${72 - PAD}px`)
    expect(shape('left').getAttribute('class')).toContain('axt-hl-shape')
    // (lit whole: every sentence's shape)
    hl.light({ id: 3, s: -1 })
    expect(hl.bands()).toEqual({ left: 3, right: 3 })
    spy.mockRestore()
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
  it('paints nothing on a page that holds none of the sentence lit (its kept ink on another page, lit alone)', () => {
    const { els, hl } = setUp(page)
    hl.light({ id: 3, s: 3 })
    expect(hl.bands()).toEqual({ left: 0, right: 0 })
    hl.dispose()
    for (const el of Object.values(els)) el.remove()
  })
})
