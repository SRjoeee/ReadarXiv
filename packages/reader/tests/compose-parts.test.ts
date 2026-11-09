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
import { cropsOf, svgOf } from '../src/compose/paint.ts'
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
  it('leaves out a box of no area and an address off the list; orders by the text; draws the border its link states', () => {
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
      // (each link's border its own annotation's on A, as the typesetter carries it (Page.links' fourth field), whatever box it
      // is drawn over now: the reader matches nothing against the original's annotations; the mail link's dashed one past the
      // widest drawn; the reference's none, none on A)
      links: [
        [[0, 45, 30, 60], { dest: 'sec' }, 3],
        [[38, 95, 75, 110], { url: 'https://example.org/' }, undefined, [1, 0xff0000]],
        [[0, 0, 0, 10], { url: 'https://zero.example/' }],
        [[10, 10, 20, 20], { url: 'javascript:x' }],
        [[300, 300, 320, 320], { url: 'mailto:a@b.org' }, 4, [40, 0x00ffff, 'dashed']],
      ],
    }
    const c = contentOf([item('see the', 0, 100, 35), item('figure', 40, 100, 30), item('other', 0, 50, 25)])
    const opened: string[] = []
    const layer = linkLayer(
      page,
      vp,
      { open: (u) => opened.push(u), follow: () => {}, unnamed: (to) => CATALOGUE_WORDS.linkName(to) },
      c,
    ) as HTMLElement
    const as = [...layer.querySelectorAll<HTMLAnchorElement>('a.axt-link')]
    // (in the text's order: "figure" before "other"; the mail link, over no text, after them)
    expect(as.map((a) => a.getAttribute('aria-label'))).toEqual(['figure', 'other', 'Email a@b.org'])
    expect(as[0]?.dataset.axtBorder).toBe('solid')
    expect(as[0]?.style.getPropertyValue('--axt-link-border')).toBe('1px')
    expect(as[0]?.style.getPropertyValue('--axt-link-colour')).toBe('rgb(255 0 0)')
    expect(as[1]?.dataset.axtBorder).toBeUndefined()
    expect(as[1]?.style.getPropertyValue('--axt-link-border')).toBe('')
    expect(as[2]?.dataset.axtBorder).toBe('dashed')
    expect(as[2]?.style.getPropertyValue('--axt-link-border')).toBe('20px')
    expect(as[2]?.style.getPropertyValue('--axt-link-colour')).toBe('rgb(0 255 255)')
    as[0]?.click()
    expect(opened).toEqual(['https://example.org/'])
  })
})

const facesStub = {
  classOf: () => 'f',
  familyOf: () => 'sans-serif',
  ready: async () => {},
  probeFace: async () => null,
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
  it("a run over two of its member's lines is the member's, though its middle falls between them (I8: a title in two lines)", () => {
    // (lines at 700 from 50 to 300 and at 680 from 50 to 100, boxes 698-708 and 678-688; the run's items stand on both, its
    // middle at x 175, y 690 on neither: 1706.03762v7 p. 4, 2609.26457v1, 2307.16209v1 and 2610.20030v1 p. 1)
    const m = placed(1, [
      [700, 50, 300],
      [680, 50, 100],
    ])
    const content = contentOf([
      item('Head', 50, 760, 30, 10, true),
      OC,
      item('Recursive self-improvement', 50, 700, 250),
      item('agents', 50, 680, 40),
      EMC,
      item('Foot', 50, 100, 20),
    ])
    const page: Page = {
      page: 1,
      wait: { rows: [], faces: [] },
      links: [],
      members: [
        laid(1, [
          [700, 50, 300, [{ s: 'Rekursive Selbstverbesserung', x: 50, face: 'sans', size: 10 }]],
          [680, 50, 100, [{ s: 'Agenten', x: 50, face: 'sans', size: 10 }]],
        ]),
      ],
    }
    const r = laidText(content, page, new Map([[1, m]]), facesStub, measure)
    const strs = (r.content.items as { str?: string }[]).filter((x) => typeof x.str === 'string').map((x) => x.str)
    // (the original's run dropped, the translation read where it stood: before the page's foot, not after it)
    expect(strs).toEqual(['Head', 'Rekursive Selbstverbesserung ', 'Agenten', 'Foot'])
    expect(r.dropped).toBe(2)
  })
  it("a run carried to the next column's head is its member's, though its middle falls on the paragraph above (I8)", () => {
    // (unit 1 from 700 to 664, unit 2 at 640 and 628 and on at the next column's head, 760; unit 2's run's middle at x 235, y 676:
    // on unit 1's third line. 2610.20030v1 p. 5, its acknowledgements under the paragraph before them)
    const one = placed(1, [
      [700, 50, 300],
      [688, 50, 300],
      [676, 50, 300],
      [664, 50, 300],
    ])
    const two = placed(2, [
      [640, 50, 300],
      [628, 50, 300],
      [760, 320, 570],
    ])
    const content = contentOf([
      OC,
      item('one a', 50, 700, 250),
      item('one b', 50, 688, 250),
      item('one c', 50, 676, 250),
      item('one d', 50, 664, 250),
      EMC,
      OC,
      item('two a', 50, 640, 250),
      item('two b', 50, 628, 250),
      item('two c', 320, 760, 100),
      EMC,
      item('Foot', 50, 100, 20),
    ])
    const line = (y: number, x0: number, x1: number, s: string): Laid['lines'][number] => [
      y,
      x0,
      x1,
      [{ s, x: x0, face: 'sans', size: 10 }],
    ]
    const page: Page = {
      page: 1,
      wait: { rows: [], faces: [] },
      links: [],
      members: [
        laid(1, [line(700, 50, 300, 'eins')]),
        laid(2, [line(640, 50, 300, 'zwei'), line(760, 320, 570, 'drei')]),
      ],
    }
    const r = laidText(
      content,
      page,
      new Map([
        [1, one],
        [2, two],
      ]),
      facesStub,
      measure,
    )
    const strs = (r.content.items as { str?: string }[])
      .filter((x) => typeof x.str === 'string')
      .map((x) => x.str?.trim())
    expect(strs).toEqual(['eins', 'zwei', 'drei', 'Foot'])
    expect(r.dropped).toBe(7)
  })
  describe("which group a run is under (§19.9: a run of ours is one group's ink, closed at any marked content)", () => {
    const strsOf = (r: ReturnType<typeof laidText>) =>
      (r.content.items as { str?: string }[])
        .filter((x) => typeof x.str === 'string' && x.str.trim())
        .map((x) => (x.str as string).trim())
    const one = (ord: number, y: number, x0: number, x1: number, s: string, off = 3): Laid => ({
      ...laid(ord, [[y, x0, x1, [{ s, x: x0, face: 'sans', size: 10 }]]]),
      off,
    })
    const pageOf = (...members: Laid[]): Page => ({ page: 1, wait: { rows: [], faces: [] }, links: [], members })
    it("keeps the page's own optional content whole and reads each run of ours inside it on its own (1706.03762v7 pp. 13-15)", () => {
      // (the paper's own `/OC` BDC around a figure, holding its words and our runs: its own words drawn whatever our groups do)
      const m = placed(1, [[700, 50, 100]])
      const content = contentOf([
        OC,
        item('Input', 200, 600, 30),
        OC,
        item('word', 50, 700, 40),
        EMC,
        item('Layer5', 200, 590, 30),
        EMC,
        item('Foot', 50, 100, 20),
      ])
      const r = laidText(content, pageOf(one(1, 700, 50, 100, 'Wort')), new Map([[1, m]]), facesStub, measure)
      expect(strsOf(r)).toEqual(['Input', 'Wort', 'Layer5', 'Foot'])
      expect(r.dropped).toBe(1)
    })
    it("gives an element's run its element's group, inside its line (a unit keeping its elements: off 1)", () => {
      const m = placed(1, [[700, 50, 300]], [['e1', [1, 150, 699, 180, 707, 700]]])
      const content = contentOf([
        OC,
        item('text one', 50, 700, 90),
        EMC,
        OC,
        item('x+y', 150, 700, 30),
        EMC,
        OC,
        item('text two', 190, 700, 90),
        EMC,
        item('Foot', 50, 100, 20),
      ])
      const r = laidText(content, pageOf(one(1, 700, 50, 300, 'eins', 1)), new Map([[1, m]]), facesStub, measure)
      // (the element's ink is drawn: its text read with it; the text's runs dropped, the translation in their place)
      expect(strsOf(r)).toEqual(['eins', 'x+y', 'Foot'])
      expect(r.dropped).toBe(2)
    })
    it('places a turned item by the middle of its advance along its own direction (a figure word turned a quarter)', () => {
      const m = { ...placed(1, []), lines: [[1, 0, 167, 176, 632, 648, 631, 167, 176, 0]] } as unknown as Placed
      const content = contentOf([
        item('Head', 50, 760, 30),
        OC,
        { ...item('spirit', 175, 632, 16), transform: [0, 8, -8, 0, 175, 632] },
        EMC,
        item('Foot', 50, 100, 20),
      ])
      const r = laidText(content, pageOf(one(1, 640, 167, 176, 'Geist')), new Map([[1, m]]), facesStub, measure)
      expect(strsOf(r)).toEqual(['Head', 'Geist', 'Foot'])
      expect(r.dropped).toBe(1)
    })
    it('places a turned translation turned along its run, so that it is selected and copied as it is drawn (a figure word)', () => {
      // (the attention word "spirit" turned a quarter, its translation laid along (0, 1) from (171, 632): its runs one after
      // another along it, each one's place along it from the line's x0; a raise is not the layer's, as a level run's is not)
      const m = { ...placed(1, []), lines: [[1, 0, 167, 176, 632, 648, 631, 167, 176, 0]] } as unknown as Placed
      const content = contentOf([
        item('Head', 50, 760, 30),
        OC,
        { ...item('spirit', 175, 632, 16), transform: [0, 8, -8, 0, 175, 632] },
        EMC,
        item('Foot', 50, 100, 20),
      ])
      const turned: Laid = laid(1, [
        [
          632,
          171,
          195,
          [
            { s: 'Ge', x: 171, face: 'sans', size: 8, dir: [0, 1] },
            { s: 'KI', x: 187, face: 'sans', size: 8, dir: [0, 1], rise: 2 },
          ],
        ],
      ])
      const r = laidText(content, pageOf({ ...turned, off: 1 }), new Map([[1, m]]), facesStub, measure)
      expect(strsOf(r)).toEqual(['Head', 'Ge', 'KI', 'Foot'])
      const at = (s: string) =>
        (r.content.items as { str?: string; transform?: number[]; width?: number }[]).find((x) => x.str === s)!
      // (its own direction in its matrix: PDF.js's text layer turns the span by it; its width its advance along the run)
      expect(at('Ge').transform).toEqual([0, 8, -8, 0, 171, 632])
      expect(at('Ge').width).toBe(8)
      // (16 along the run from the origin)
      expect(at('KI').transform).toEqual([0, 8, -8, 0, 171, 648])
      expect(r.translated).toHaveLength(2)
    })
    it('tells two turned labels whose origins share a page y apart: a line change across their run, its size its own', () => {
      // (Codex on #632: two y-axis words turned a quarter, along (0, 1) from (100, 300) and (112, 300), size 8; read by page y
      // and page x their boundary was neither a line change nor a space, and their words ran together when copied)
      const word = (ord: number, x: number) =>
        ({ ...placed(ord, []), lines: [[1, 0, x - 6, x + 2, 300, 330, 300, x - 6, x + 2, 0]] }) as unknown as Placed
      const content = contentOf([
        OC,
        { ...item('Loss', 100, 300, 16), transform: [0, 8, -8, 0, 100, 300] },
        EMC,
        OC,
        { ...item('Gain', 112, 300, 16), transform: [0, 8, -8, 0, 112, 300] },
        EMC,
      ])
      const turned = (ord: number, x: number, s: string): Laid => ({
        ...laid(ord, [[300, x, x + 28, [{ s, x, face: 'sans', size: 8, dir: [0, 1] }]]]),
        off: 1,
      })
      const r = laidText(
        content,
        pageOf(turned(1, 100, 'Verlust'), turned(2, 112, 'Gewinn')),
        new Map([
          [1, word(1, 100)],
          [2, word(2, 112)],
        ]),
        facesStub,
        measure,
      )
      const items = r.content.items as { str?: string; hasEOL?: boolean }[]
      expect(items.map((x) => x.str)).toEqual(['Verlust', 'Gewinn'])
      // (12 apart across their run, their size 8: two lines)
      expect(items[0]!.hasEOL).toBe(true)
      // (one run on along the same turned line by another's, half a point on: one line, no space at its size 8, 0.15 of it;
      // read at the size 1 a quarter turn gave, half a point took one)
      const on = laidText(
        contentOf([
          OC,
          { ...item('Loss', 100, 300, 16), transform: [0, 8, -8, 0, 100, 300] },
          EMC,
          OC,
          { ...item('Gain', 100, 328.5, 16), transform: [0, 8, -8, 0, 100, 328.5] },
          EMC,
        ]),
        pageOf(turned(1, 100, 'Verlust'), {
          ...laid(2, [[328.5, 100, 128, [{ s: 'Gewinn', x: 100, face: 'sans', size: 8, dir: [0, 1] }]]]),
          off: 1,
        }),
        new Map([
          [1, word(1, 100)],
          [2, { ...word(2, 100), lines: [[1, 0, 94, 102, 328.5, 358.5, 328.5, 94, 102, 0]] } as unknown as Placed],
        ]),
        facesStub,
        measure,
      ).content.items as { str?: string; hasEOL?: boolean }[]
      expect(on.map((x) => [x.str, !!x.hasEOL])).toEqual([
        ['Verlust', false],
        ['Gewinn', false],
      ])
    })
    it("gives a run split evenly between a unit's element and its line to the element, whole: never split", () => {
      // (2406.06525v1 p. 1: a mark "2∗", "2" on the element's ink, "∗" above it on the line alone; the unit keeps its elements)
      const m = placed(1, [[700, 50, 300]], [['e1', [1, 150, 699, 155, 706, 700]]])
      const content = contentOf([
        OC,
        item('words', 50, 700, 90),
        EMC,
        OC,
        item('2', 150, 700, 5),
        item('*', 156, 703, 5),
        EMC,
        item('Foot', 50, 100, 20),
      ])
      const r = laidText(content, pageOf(one(1, 700, 50, 300, 'Wörter', 1)), new Map([[1, m]]), facesStub, measure)
      expect(strsOf(r)).toEqual(['Wörter', '2', '*', 'Foot'])
      expect(r.dropped).toBe(1)
    })
    it("keeps whole a run whose items stand on two units' boxes: no one unit's run to drop", () => {
      const a = placed(1, [[700, 50, 100]]),
        b = placed(2, [[700, 150, 200]])
      const content = contentOf([OC, item('ab', 50, 700, 40), item('cd', 150, 700, 40), EMC, item('Foot', 50, 100, 20)])
      const r = laidText(
        content,
        pageOf(one(1, 700, 50, 100, 'AB'), one(2, 700, 150, 200, 'CD')),
        new Map([
          [1, a],
          [2, b],
        ]),
        facesStub,
        measure,
      )
      // (its words read where they stand; the units' translations, found in no run, after the page's own)
      expect(strsOf(r)).toEqual(['ab', 'cd', 'Foot', 'AB', 'CD'])
      expect(r.dropped).toBe(0)
    })
    it('keeps a run of white space alone, and a run of one zero-width item is the unit it stands on', () => {
      const m = placed(1, [[700, 50, 100]])
      const content = contentOf([
        OC,
        item(' ', 50, 700, 3),
        EMC,
        item('Head', 50, 760, 30),
        OC,
        item('\u0301', 60, 700, 0),
        EMC,
        item('Foot', 50, 100, 20),
      ])
      const r = laidText(content, pageOf(one(1, 700, 50, 100, 'Eins')), new Map([[1, m]]), facesStub, measure)
      // (the blank run kept and no anchor of the unit's block; the zero-width accent the unit's, its block there)
      expect(strsOf(r)).toEqual(['Head', 'Eins', 'Foot'])
      expect(r.dropped).toBe(1)
    })
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
  describe('a URL the typesetter cut over two lines (its crop in two parts, cut between two glyphs)', () => {
    // (the original's line at 688 holds the URL from 200 to 320, PDF.js's items `url`; its parts' sources meet at `at`, the head
    // ending the translation's first line, the tail opening its second)
    const urlLayer = (url: ReturnType<typeof item>[], at: number, s: [string, string]) => {
      const m = placed(
        1,
        [
          [700, 50, 330],
          [688, 50, 330],
        ],
        [['e1', [1, 200, 685, 320, 694, 688]]],
      )
      const content = contentOf([
        OC,
        item('We release the code', 50, 700, 120),
        item('at', 50, 688, 12),
        EMC,
        ...(url.length ? [OC, ...url, EMC] : []),
        OC,
        item('.', 320, 688, 3),
        EMC,
        item('Foot', 50, 100, 20),
      ])
      const page: Page = {
        page: 1,
        wait: { rows: [], faces: [] },
        links: [],
        members: [
          laid(1, [
            [
              700,
              50,
              300,
              [
                { s: 'Wir veröffentlichen den Code unter ', x: 50, face: 'sans', size: 10 },
                { s: s[0], x: 300 - (at - 200), src: [1, 200, 685, at, 694, 688], k: 1, piece: 'e1', cut: 2 },
              ],
            ],
            [
              688,
              50,
              300,
              [
                { s: s[1], x: 50, src: [1, at, 685, 320, 694, 688], k: 1, piece: 'e1', cut: 1 },
                { s: '.', x: 50 + 320 - at, face: 'sans', size: 10 },
              ],
            ],
          ]),
        ],
      }
      const r = laidText(content, page, new Map([[1, m]]), facesStub, measure)
      const texts = (r.content.items as { str?: string; transform?: number[] }[]).filter(
        (x) => typeof x.str === 'string',
      )
      return { r, texts, strs: texts.map((x) => x.str) }
    }
    it('reads it once, whole and in order when PDF.js gives it as one item: each part its characters (Codex on #630)', () => {
      // (the item's middle, 260, under the tail alone: the tail took it whole and the head read its own "https://" again,
      // "https:// " + "https://example.org/path…")
      const { r, texts, strs } = urlLayer([item('https://example.org/path/to/it', 200, 688, 120)], 232, [
        'https://',
        'example.org/path/to/it',
      ])
      expect(strs).toEqual(['Wir veröffentlichen den Code unter ', 'https://', 'example.org/path/to/it', '.', 'Foot'])
      // (each part where its crop is drawn: the head at the first line's end, the tail at the second's start)
      expect(texts[1]?.transform?.[4]).toBe(268)
      expect(texts[2]?.transform?.[4]).toBe(50)
      // (the URL's parts the original's text, as a whole crop's; the translation the target's)
      expect(r.translated.map((i) => texts[i]?.str)).toEqual(['Wir veröffentlichen den Code unter ', '.'])
    })
    it("reads the page's own characters where its copy text is not the page's (a DOI the macro prefixes, _2 read as ₂)", () => {
      // (2610.22197v1's \doi copies "10.…" under "https://doi.org/10.…"; 2609.26457v1's copy reads "…11871842₂9" for "_29")
      const { strs } = urlLayer([item('https://doi.org/10.1007/x_29', 200, 688, 112)], 264, ['10.1007/x₂9', ''])
      expect(strs).toEqual(['Wir veröffentlichen den Code unter ', 'https://doi.org/', '10.1007/x_29', '.', 'Foot'])
    })
    it('splits each of several items at the cut, and with none under it reads each part its own text, joined as one', () => {
      const { strs } = urlLayer([item('https://exa', 200, 688, 44), item('mple.org/path/to/it', 244, 688, 76)], 232, [
        'https://',
        'example.org/path/to/it',
      ])
      expect(strs.join('')).toBe('Wir veröffentlichen den Code unter https://example.org/path/to/it.Foot')
      expect(strs.slice(1, 4)).toEqual(['https://', 'exa', 'mple.org/path/to/it'])
      const none = urlLayer([], 232, ['https://', 'example.org/path/to/it'])
      expect(none.strs).toEqual([
        'Wir veröffentlichen den Code unter ',
        'https://',
        'example.org/path/to/it',
        '.',
        'Foot',
      ])
    })
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
  it('draws a turned line at its angle about its origin, its runs along it from there (a figure text the original sets turned)', () => {
    const line = (dir: [number, number]) =>
      ({
        page: 1,
        wait: { rows: [], faces: [] },
        links: [],
        members: [
          {
            ord: 3,
            page: 1,
            state: 'laid',
            off: 1,
            lines: [
              [
                400,
                150,
                178,
                [
                  { s: 'Ve', x: 150, face: 'f', size: 8, dir },
                  { s: 'L', x: 166, face: 'f', size: 8, dir, rise: 2, dx: [0, 3] },
                ],
              ],
            ],
            lit: { left: [], right: [], own: [] },
          },
        ],
      }) as unknown as Page
    const draw = (dir: [number, number]) =>
      svgOf(line(dir), { viewBox: [0, 0, 612, 792], rotation: 0 } as never, { classOf: () => 'f' } as unknown as Faces)
    // (a quarter turn, the page's up: one <text> at its origin (150, 400) turned by -90 in the SVG's y-down frame; its runs at
    // their distance along it, a raise above its baseline)
    const svg = draw([0, 1])
    const texts = [...svg.querySelectorAll('text')]
    expect(texts).toHaveLength(1)
    expect(texts[0]!.getAttribute('transform')).toBe('translate(150 392) rotate(-90)')
    const spans = [...svg.querySelectorAll('tspan')]
    expect(spans.map((t) => [t.getAttribute('x'), t.getAttribute('y')])).toEqual([
      ['0', '0'],
      ['16 19', '-2'],
    ])
    // (any angle: 30 degrees up)
    const c = Math.cos(Math.PI / 6),
      sn = Math.sin(Math.PI / 6)
    expect(draw([c, sn]).querySelector('text')!.getAttribute('transform')).toBe('translate(150 392) rotate(-30)')
  })
})

describe('a crop cut from its element’s ink between two glyphs (a URL broken where TeX’s url package breaks it)', () => {
  it('is cut as the typesetter states its source: its own edges with their margin, a cut one at the cut', () => {
    const page: Page = {
      page: 1,
      wait: { rows: [], faces: [] },
      members: [
        {
          ord: 2,
          page: 1,
          state: 'laid',
          off: 1,
          lines: [
            [700, 72, 120, [{ s: 'https://', x: 72, src: [1, 235, 225, 277.1, 235, 228], k: 1, piece: '9', cut: 2 }]],
            [688, 72, 200, [{ s: 'github.com', x: 72, src: [1, 277.1, 225, 450, 235, 228], k: 1, piece: '9', cut: 1 }]],
          ],
          lit: { left: [], right: [], own: [] },
        },
      ],
      links: [],
    }
    const [head, tail] = cropsOf(page, { x: 0.5, y: 0.5 })
    expect(head!.src[0]).toBeCloseTo(235, 5)
    expect(head!.src[2]).toBeCloseTo(277.1, 5)
    expect(head!.at[2]).toBeCloseTo(72 + 277.1 - 235, 5)
    expect(tail!.src[0]).toBeCloseTo(277.1, 5)
    expect(tail!.at[0]).toBeCloseTo(72, 5)
    expect(tail!.src[2]).toBeCloseTo(450, 5)
  })
})
