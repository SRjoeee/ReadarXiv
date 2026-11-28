// A citation's card through the reader's own wiring (preview/wire.ts over a head, a page's part and the paper's units;
// docs/PDF-READER.md §20.3, §20.7): the card holds the text of the member the head's target names by its page and ord, and
// nothing the reader reads of the destination's point. The prepare may land a citation on its entry by the paper's own key
// where the point's geometry gives the entry beside it; the reader shows the entry the head states. A destination the head
// states nothing of (among them one whose box the prepare could not tell whole) shows nothing and keeps its click.
// Over stand-ins: two panes of one page each, the reader's clock run by hand, a far page's part held by the stand-in.
import type { Head, Part, Placed, Target, Unit } from '@readarxiv/format'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Panes } from '../../src/panes/panes.ts'
import { wirePreviews } from '../../src/preview/wire.ts'
import type { Clock } from '../../src/stack/clock.ts'

function testClock() {
  let now = 0,
    next = 1
  const due = new Map<number, { at: number; f: () => void }>()
  const clock: Clock = {
    now: () => now,
    later: (f, ms) => {
      const id = next++
      due.set(id, { at: now + ms, f })
      return id
    },
    clear: (id) => void due.delete(id),
    frame: (f) => {
      const id = next++
      due.set(id, { at: now, f })
      return id
    },
    cancel: (id) => void due.delete(id),
  }
  const pass = async (ms: number) => {
    for (let i = 0; i < 4; i++) await Promise.resolve()
    now += ms
    for (const [id, t] of [...due].sort((a, b) => a[1].at - b[1].at))
      if (t.at <= now && due.has(id)) {
        due.delete(id)
        t.f()
      }
    for (let i = 0; i < 4; i++) await Promise.resolve()
  }
  return { clock, pass }
}

const rect = (left: number, top: number, width: number, height: number): DOMRect =>
  ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect

// (a reference list of three entries on page 3, one line each, [13] between [12] above and [14] below)
const TEXT: Record<number, string> = {
  12: 'A. Above. The entry over the one cited. 2019.',
  13: 'B. Cited. The entry the citation names by its key. 2020.',
  14: 'C. Below. The entry under the one cited. 2021.',
}
const idOf = (ord: number) => String(ord).padStart(64, 'e')
const units: Unit[] = [12, 13, 14].map((ord) => ({
  id: idOf(ord),
  kind: 'reference',
  entry: true,
  content: [{ t: 'text', s: TEXT[ord]! }],
}))
const member = (ord: number, base: number): Placed => ({
  ord,
  kind: 'reference',
  text: idOf(ord),
  lead: 12,
  style: { role: 'serif', size: 9 },
  align: 'j',
  lines: [[3, 0, 72, 300, base, base + 7, base - 2, 72, 300, 0, 9]],
  room: { below: 2, next: 12 },
  label: {
    kind: 'number',
    ink: [3, 60, base - 2, 70, base + 7, base],
    style: { role: 'serif', size: 9 },
    num: [`[${ord}]`, [3, 60, base - 2, 70, base + 7, base]],
  },
})
const part3: Part = {
  format: 1,
  page: 3,
  paper: { faces: { fonts: [] } },
  flows: [[member(12, 640), member(13, 620), member(14, 600)]],
}
// (the head states the citation's landing on entry [13]; `cite.gone` it states nothing of)
const CITED: Target = ['"cite.doe2020"', 'reference', 3, 13, [72, 618, 300, 627]]
const head = { targets: [CITED] } as unknown as Head

function setUp() {
  const root = document.createElement('div')
  document.body.append(root)
  const containers = { left: document.createElement('div'), right: document.createElement('div') }
  const pages: Record<string, HTMLElement> = {}
  for (const side of ['left', 'right'] as const) {
    const page = document.createElement('div')
    page.className = 'page'
    page.dataset.pageNumber = '1'
    pages[side] = page
    containers[side].append(page)
    root.append(containers[side])
    vi.spyOn(containers[side], 'getBoundingClientRect').mockReturnValue(rect(side === 'left' ? 0 : 640, 44, 640, 856))
    vi.spyOn(page, 'getBoundingClientRect').mockReturnValue(rect(side === 'left' ? 20 : 660, 60, 600, 800))
  }
  const link = (dest: string, left: number) => {
    const a = document.createElement('a')
    a.className = 'axt-link'
    a.setAttribute('href', `#${encodeURIComponent(dest)}`)
    pages.right!.append(a)
    vi.spyOn(a, 'getBoundingClientRect').mockReturnValue(rect(left, 200, 20, 12))
    return a
  }
  const cited = link('"cite.doe2020"', 700)
  const gone = link('"cite.gone"', 740)
  const { clock, pass } = testClock()
  const asked: number[] = []
  const jumps: unknown[] = []
  const panes = {
    display: 'both',
    doc: null,
    containerOf: (s: 'left' | 'right') => containers[s],
    pageElement: (s: 'left' | 'right', n: number) => (n === 1 ? (pages[s] ?? null) : null),
    boxOf: () => null,
    frameOf: () => null,
    on: () => () => {},
  } as unknown as Panes
  wirePreviews({
    root,
    panes,
    clock,
    composer: () => null,
    head: () => head,
    part: async (n) => {
      asked.push(n)
      return n === 3 ? part3 : null
    },
    units: () => units,
    jump: (j) => jumps.push(j),
    open: () => {},
  })
  const shown = () => root.querySelector<HTMLElement>('.axt-pv:not([data-axt-out])')
  const over = (a: Element) => a.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
  return { cited, gone, shown, over, pass, asked, jumps }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('a citation’s card is the entry the head states', () => {
  it('the card holds the text of the member the target names by its ord, never its neighbour’s', async () => {
    const t = setUp()
    t.over(t.cited)
    await t.pass(280)
    await t.pass(0)
    const pv = t.shown()
    expect(pv?.getAttribute('role')).toBe('tooltip')
    expect(pv?.textContent).toContain(TEXT[13])
    expect(pv?.textContent).not.toContain(TEXT[12])
    expect(pv?.textContent).not.toContain(TEXT[14])
    expect(t.asked).toContain(3)
  })
  it('a destination the head states nothing of shows nothing and keeps its click', async () => {
    const t = setUp()
    t.over(t.gone)
    await t.pass(1000)
    expect(t.shown()).toBeNull()
    expect(t.asked).toEqual([])
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    t.gone.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
    expect(t.jumps).toEqual([])
  })
})
