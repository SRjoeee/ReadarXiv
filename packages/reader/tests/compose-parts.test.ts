// The composing parts carried from today's layer side, each against the rule docs/PDF-READER.md states for it: the translating
// marks (§11.8 "Translating"), the toggles (§15 "What to translate"), a link's name and border and order (§11.9, UI.md S-R-25),
// the laid text layer (§11.11), the highlight's outline (§17.3), the keep budget (§11.8 "No flash coming back"), the skeleton
// (§11.7). Pure, on happy-dom.
import type { Placed } from '@readarxiv/format'
import { describe, expect, it } from 'vitest'
import { CLASS_DEFAULTS, kindShown, sameClasses } from '../src/compose/classes.ts'
import type { Faces } from '../src/compose/faces.ts'
import { shapePath } from '../src/compose/highlight.ts'
import { LINK_SCHEMES, linkLayer, textUnder, urlAllowed } from '../src/compose/links.ts'
import { createMarks } from '../src/compose/marks.ts'
import { svgOf } from '../src/compose/paint.ts'
import type { Laid, Page } from '../src/compose/page.ts'
import { laidText, TEXT_ITEMS_MAX, type TextContent } from '../src/compose/text.ts'
import type { Clock } from '../src/stack/clock.ts'
import { IOS_KEEP_PIXELS, KEEP_PIXELS, keepBudget, onIos, pastBudget, skeleton } from '../src/stack/stack.ts'
import { CATALOGUE_WORDS } from '../src/compose/words.ts'

const handClock = (): Clock & { frames: (() => void)[] } => {
  const frames: (() => void)[] = []
  return {
    frames,
    now: () => 0,
    later: () => 0,
    clear: () => {},
    frame: (f) => {
      frames.push(f)
      return frames.length
    },
    cancel: () => {},
  }
}

describe('the translating marks (Glint)', () => {
  it('marks each paragraph in shares of the page, hidden from assistive technology, its padding at most half the gap', () => {
    const root = document.createElement('div')
    const slot = document.createElement('div')
    root.append(slot)
    document.body.append(root)
    const marks = createMarks({ root, clock: handClock() })
    // (a page 600 × 800 points; two paragraphs 1 point apart vertically, a third beside the first, 2 points to its right)
    marks.mark(1, slot, [0, 0, 600, 800], 0, [
      { id: '1', box: [60, 700, 300, 760] },
      { id: '2', box: [60, 600, 300, 699] },
      { id: '3', box: [302, 700, 540, 760] },
    ])
    const el = slot.querySelector('.axt-translating') as HTMLElement
    expect(el).not.toBeNull()
    expect(el.getAttribute('aria-hidden')).toBe('true')
    const ms = [...el.querySelectorAll<HTMLElement>('.axt-translating-mark')]
    expect(ms.map((m) => m.dataset.axtU)).toEqual(['1', '2', '3'])
    const v = (m: HTMLElement, k: string) => m.style.getPropertyValue(k)
    // (its box: x from the page's left, y from its top, in shares as container units)
    expect(v(ms[0] as HTMLElement, '--axt-tr-x')).toBe('10.000cqw')
    expect(v(ms[0] as HTMLElement, '--axt-tr-y')).toBe('5.000cqh')
    expect(v(ms[0] as HTMLElement, '--axt-tr-w')).toBe('40.000cqw')
    expect(v(ms[0] as HTMLElement, '--axt-tr-h')).toBe('7.500cqh')
    // (the padding: 2 CSS px block = 1.5 pt, clamped to half the 1 pt gap below; 4 px inline = 3 pt, clamped to half of 2 pt)
    expect(v(ms[0] as HTMLElement, '--axt-tr-py')).toBe(`${((100 * 0.5) / 800).toFixed(3)}cqh`)
    expect(v(ms[0] as HTMLElement, '--axt-tr-px')).toBe(`${((100 * 1) / 600).toFixed(3)}cqw`)
    // (a CSS pixel at 100 % of a page 600 points wide)
    expect(el.style.getPropertyValue('--axt-tr-u')).toBe(`${(100 / 800).toFixed(5)}cqw`)
    // (a later batch keeps the cards that stay: the same elements)
    const first = ms[0]
    marks.mark(1, slot, [0, 0, 600, 800], 0, [{ id: '1', box: [60, 700, 300, 760] }])
    expect(el.querySelector('.axt-translating-mark')).toBe(first)
    expect(el.querySelectorAll('.axt-translating-mark').length).toBe(1)
    // (a page turned carries none; no box, none)
    marks.mark(1, slot, [0, 0, 600, 800], 90, [{ id: '1', box: [60, 700, 300, 760] }])
    expect(slot.querySelector('.axt-translating')).toBeNull()
    marks.mark(2, slot, [0, 0, 600, 800], 0, [])
    expect(marks.pages()).toEqual([])
    marks.dispose()
    root.remove()
  })
  it('is still where the browser sizes no container', () => {
    const slot = document.createElement('div')
    const marks = createMarks({ root: document.body, clock: handClock() })
    const was = globalThis.CSS
    ;(globalThis as { CSS?: unknown }).CSS = { supports: () => false }
    try {
      marks.mark(1, slot, [0, 0, 100, 100], 0, [{ id: '7', box: [10, 10, 20, 20] }])
    } finally {
      ;(globalThis as { CSS?: unknown }).CSS = was
    }
    expect(slot.querySelector('.axt-translating')?.classList.contains('axt-translating-still')).toBe(true)
    marks.dispose()
  })
})

describe('what to translate', () => {
  it("the toggles' defaults and the kinds they hold (rules/content-classes.mjs)", () => {
    expect(CLASS_DEFAULTS).toEqual({ figures: true, tables: true, heads: true, references: false, names: false })
    expect(kindShown('para')).toBe(true)
    expect(kindShown('author')).toBe(false)
    expect(kindShown('affiliation')).toBe(false)
    expect(kindShown('reference')).toBe(false)
    expect(kindShown('cell')).toBe(true)
    expect(kindShown('inkheads', { heads: false } as never)).toBe(false)
    expect(kindShown('author', { names: true } as never)).toBe(true)
    expect(sameClasses(null, CLASS_DEFAULTS)).toBe(true)
    expect(sameClasses({ ...CLASS_DEFAULTS, references: true }, CLASS_DEFAULTS)).toBe(false)
  })
})

/** a text item at x, baseline y, size s */
const item = (str: string, x: number, y: number, w: number, s = 10, hasEOL = false) => ({
  str,
  dir: 'ltr',
  transform: [s, 0, 0, s, x, y],
  width: w,
  height: s,
  fontName: 'f',
  hasEOL,
})
const contentOf = (items: unknown[]): TextContent =>
  ({ items, styles: { f: {} }, lang: null }) as unknown as TextContent

describe("a link's name, order and border (S-R-25)", () => {
  it('is the text drawn under it, white space collapsed; none: the host words by where it goes', () => {
    const c = contentOf([item('see the', 0, 100, 35), item('figure', 40, 100, 30), item('other', 0, 50, 25)])
    expect(textUnder(c, [38, 95, 75, 110])).toEqual({ name: 'figure', at: 1 })
    expect(textUnder(c, [0, 95, 75, 110]).name).toBe('see the figure')
    expect(textUnder(c, [200, 0, 300, 10])).toEqual({ name: '', at: -1 })
    expect(CATALOGUE_WORDS.linkName({ internal: true })).toBe('Elsewhere in this paper')
    expect(CATALOGUE_WORDS.linkName({ url: 'https://example.org/x' })).toBe('Opens example.org')
    expect(CATALOGUE_WORDS.linkName({ url: 'mailto:a%40b.org' })).toBe('Email a@b.org')
    expect(CATALOGUE_WORDS.linkName({ url: 'ftp://x' })).toBe('Link')
  })
  it('leaves out a box of no area and an address off the list; orders by the text; draws the PDF border', () => {
    expect(LINK_SCHEMES).toEqual(['http:', 'https:', 'mailto:'])
    expect(urlAllowed('javascript:alert(1)')).toBe(false)
    expect(urlAllowed('data:text/html,x')).toBe(false)
    const vp = {
      width: 600,
      height: 800,
      convertToViewportPoint: (x: number, y: number) => [x, 800 - y],
    } as never
    const page: Page = {
      page: 1,
      wait: { rows: [], faces: [] },
      members: [],
      links: [
        [[0, 45, 30, 60], { dest: 'sec' }],
        [[38, 95, 75, 110], { url: 'https://example.org/' }],
        [[0, 0, 0, 10], { url: 'https://zero.example/' }],
        [[10, 10, 20, 20], { url: 'javascript:x' }],
        [[300, 300, 320, 320], { url: 'mailto:a@b.org' }],
      ],
    }
    const c = contentOf([item('see the', 0, 100, 35), item('figure', 40, 100, 30), item('other', 0, 50, 25)])
    const borders = [
      {
        to: 'https://example.org/',
        w: 37,
        h: 15,
        box: [38, 95, 75, 110] as [number, number, number, number],
        border: { width: 1, rgb: [255, 0, 0] as [number, number, number], style: 'solid' as const },
      },
    ]
    const opened: string[] = []
    const layer = linkLayer(
      page,
      vp,
      { open: (u) => opened.push(u), follow: () => {}, unnamed: (to) => CATALOGUE_WORDS.linkName(to) },
      c,
      borders,
    ) as HTMLElement
    const as = [...layer.querySelectorAll<HTMLAnchorElement>('a.axt-link')]
    // (in the text's order: "figure" before "other"; the mail link, over no text, after them)
    expect(as.map((a) => a.getAttribute('aria-label'))).toEqual(['figure', 'other', 'Email a@b.org'])
    expect(as[0]?.dataset.axtBorder).toBe('solid')
    expect(as[0]?.style.getPropertyValue('--axt-link-colour')).toBe('rgb(255 0 0)')
    expect(as[1]?.dataset.axtBorder).toBeUndefined()
    as[0]?.click()
    expect(opened).toEqual(['https://example.org/'])
  })
})

const facesStub = {
  classOf: () => 'f',
  familyOf: () => 'sans-serif',
  ready: async () => {},
  dispose: () => {},
  asked: 0,
  most: 0,
} as Faces
const measure = (s: string, _f: string, size: number) => s.length * size * 0.5
const OC = { type: 'beginMarkedContentProps', tag: 'OC' }
const EMC = { type: 'endMarkedContent' }
/** a member placed on A: its line on page 1 at baseline y from x0 to x1, an element's ink */
const placed = (ord: number, lines: [number, number, number][], els: [string, number[]][] = []): Placed =>
  ({
    ord,
    kind: 'para',
    text: `u${ord}`,
    lead: 12,
    style: { role: 'serif', size: 10 },
    align: 'j',
    lines: lines.map(([y, x0, x1]) => [1, 0, x0, x1, y, y + 8, y - 2, x0, x1, 0]),
    els: els.map(([id, ink]) => [id, { kind: 'math', ink: [ink] }]),
    room: { below: 0 },
  }) as unknown as Placed
const laid = (ord: number, lines: Laid['lines']): Laid => ({
  ord,
  page: 1,
  state: 'laid',
  off: 3,
  lines,
  lit: { left: [], right: [], own: [] },
})

describe('the laid text layer (§11.11)', () => {
  it("drops a member's runs, puts its lines at the first, moves a crop's original text, keeps a display inside the block", () => {
    const m = placed(
      1,
      [
        [700, 50, 300],
        [680, 50, 300],
        [640, 50, 300],
      ],
      [['e1', [1, 100, 655, 140, 665, 658]]],
    )
    const content = contentOf([
      item('Head', 50, 720, 30, 10, true),
      OC,
      item('original line one', 50, 700, 200),
      EMC,
      item('x = y', 100, 658, 40),
      OC,
      item('original line two', 50, 680, 200),
      EMC,
      OC,
      item('a+b', 105, 660, 20),
      EMC,
      item('Foot', 50, 100, 20),
    ])
    const page: Page = {
      page: 1,
      wait: { rows: [], faces: [] },
      links: [],
      members: [
        laid(1, [
          [700, 50, 300, [{ s: 'erste', x: 50, face: 'sans', size: 10 }]],
          [
            680,
            50,
            300,
            [
              { s: 'zweite', x: 50, face: 'sans', size: 10 },
              { s: 'a+b', x: 200, src: [1, 100, 655, 140, 665, 658], k: 1, piece: 'e1' },
            ],
          ],
          [640, 50, 300, [{ s: 'dritte', x: 50, face: 'sans', size: 10 }]],
        ]),
      ],
    }
    const r = laidText(content, page, new Map([[1, m]]), facesStub, measure)
    const strs = (r.content.items as { str?: string }[]).filter((x) => typeof x.str === 'string').map((x) => x.str)
    // (the display the unit keeps, set between its two runs, inside the block before the line below it; the crop's text is the
    // original's under its source, moved to where the crop is drawn; the lines joined with a space)
    expect(strs).toEqual(['Head', 'erste ', 'zweite', 'a+b ', 'x = y', 'dritte', 'Foot'])
    const moved = (r.content.items as { str?: string; transform?: number[] }[]).find((x) => x.str === 'a+b ')
    expect(moved?.transform?.[4]).toBe(205)
    // (the translation's spans the target's language: erste, zweite, dritte, not the moved original text)
    const texts = (r.content.items as { str?: string }[]).filter((x) => typeof x.str === 'string')
    expect(r.translated.map((i) => texts[i]?.str?.trim())).toEqual(['erste', 'zweite', 'dritte'])
    // (between two sources on two lines a break: the block's last item before Foot)
    const dritte = texts.find((x) => x.str === 'dritte') as { hasEOL?: boolean }
    expect(dritte.hasEOL).toBe(true)
  })
  it('a crop with no text under its source carries its own plain text; rotated text is left out', () => {
    const m = placed(2, [[700, 50, 300]], [['e1', [1, 400, 400, 440, 420, 405]]])
    const content = contentOf([
      OC,
      item('original', 50, 700, 200),
      EMC,
      { ...item('axis', 500, 300, 20), transform: [0, 10, -10, 0, 500, 300] },
    ])
    const page: Page = {
      page: 1,
      wait: { rows: [], faces: [] },
      links: [],
      members: [
        laid(2, [
          [
            700,
            50,
            300,
            [
              { s: 'eins', x: 50, face: 'sans', size: 10 },
              { s: 'E = mc^2', x: 120, src: [1, 400, 400, 440, 420, 405], k: 1, piece: 'e1' },
            ],
          ],
        ]),
      ],
    }
    const r = laidText(content, page, new Map([[2, m]]), facesStub, measure)
    const strs = (r.content.items as { str?: string }[]).filter((x) => typeof x.str === 'string').map((x) => x.str)
    expect(strs).toEqual(['eins', 'E = mc^2'])
  })
  it("merges the page's own abutting items on one baseline at one size, and holds at most TEXT_ITEMS_MAX", () => {
    const page: Page = { page: 1, wait: { rows: [], faces: [] }, links: [], members: [] }
    const r = laidText(
      contentOf([
        item('Hel', 0, 100, 15),
        item('lo', 15, 100, 10),
        item('world', 40, 100, 25),
        item('x', 0, 80, 5, 12),
      ]),
      page,
      new Map(),
      facesStub,
      measure,
    )
    expect((r.content.items as { str: string }[]).map((x) => x.str)).toEqual(['Hello', 'world', 'x'])
    const many = Array.from({ length: TEXT_ITEMS_MAX + 500 }, (_, i) =>
      item(`w${i}`, (i % 50) * 30, 1000 - Math.floor(i / 50) * 12, 10),
    )
    const r2 = laidText(contentOf(many), page, new Map(), facesStub, measure)
    expect((r2.content.items as unknown[]).length).toBeLessThanOrEqual(TEXT_ITEMS_MAX)
  })
})

describe("the highlight's outline (§17.3)", () => {
  it('is one path of rounded corners over rows that meet, an outline of its own where they do not', () => {
    const one = shapePath(
      [
        { x0: 0, x1: 100, y0: 0, y1: 10 },
        { x0: 0, x1: 60, y0: 10, y1: 20 },
      ],
      3,
    )
    expect(one.match(/M/g)?.length).toBe(1)
    expect(one).toMatch(/Q/)
    const two = shapePath(
      [
        { x0: 80, x1: 100, y0: 0, y1: 10 },
        { x0: 0, x1: 40, y0: 10, y1: 20 },
      ],
      3,
    )
    expect(two.match(/M/g)?.length).toBe(2)
  })
})

describe('the drawings kept off the view (§11.8)', () => {
  it("keeps a 64th of the device's memory, two screens at least, 2^25 pixels at most, 2^23 on iOS", () => {
    expect(keepBudget({ deviceMemory: 8 })).toBe(KEEP_PIXELS)
    expect(keepBudget({ deviceMemory: 4 })).toBe(2 ** 24)
    expect(keepBudget({})).toBe(2 ** 24)
    expect(keepBudget({ deviceMemory: 1, screenPixels: 5_000_000 })).toBe(10_000_000)
    expect(keepBudget({ deviceMemory: 8, ios: true })).toBe(IOS_KEEP_PIXELS)
    expect(onIos({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe(true)
    expect(onIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 })).toBe(true)
    expect(onIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 })).toBe(false)
  })
})

describe('past the budget', () => {
  it('lets go the drawing farthest from the page in the middle of the view first, the one kept longest between two as far', () => {
    const kept = [
      { n: 2, px: 10 },
      { n: 9, px: 10 },
      { n: 1, px: 10 },
      { n: 7, px: 10 },
    ]
    expect(pastBudget(kept, 5, 25)).toEqual([9, 1])
    expect(pastBudget(kept, 5, 40)).toEqual([])
    expect(pastBudget(kept, 5, 0)).toEqual([9, 1, 2, 7])
    // (two as far: the one kept first goes first)
    expect(
      pastBudget(
        [
          { n: 3, px: 5 },
          { n: 7, px: 5 },
        ],
        5,
        5,
      ),
    ).toEqual([3])
  })
})

describe('the skeleton (§11.7)', () => {
  it('is a page of grey text: the first a title, twelve authors and the abstract; every third a figure; hidden from AT', () => {
    const p1 = skeleton(1)
    expect(p1.getAttribute('aria-hidden')).toBe('true')
    expect(p1.querySelector('.axt-sk-title')).not.toBeNull()
    expect(p1.querySelectorAll('.axt-sk-authors > i').length).toBe(12)
    expect(skeleton(3).querySelector('.axt-sk-figure')).not.toBeNull()
    expect(skeleton(4).querySelector('.axt-sk-figure')).toBeNull()
    expect(skeleton(5).outerHTML).toBe(skeleton(5).outerHTML)
  })
})

describe('the page drawn (svgOf)', () => {
  it("sets a superscript run its raise higher than its line (the typesetter's Item.rise: the checkpoint's (10))", () => {
    const page = {
      page: 1,
      wait: { rows: [], faces: [] },
      links: [],
      members: [
        {
          ord: 0,
          page: 1,
          state: 'laid',
          off: 1,
          lines: [
            [
              700,
              72,
              200,
              [
                { s: 'Satz', x: 72, face: 'f', size: 10 },
                { s: '3', x: 92, face: 'f', size: 6.2, rise: 3.6 },
              ],
            ],
          ],
          lit: { left: [], right: [], own: [] },
        },
      ],
    } as unknown as Page
    const svg = svgOf(
      page,
      { viewBox: [0, 0, 612, 792], rotation: 0 } as never,
      { classOf: () => 'f' } as unknown as Faces,
    )
    expect([...svg.querySelectorAll('tspan')].map((t) => t.getAttribute('y'))).toEqual(['92', '88.4'])
  })
})
