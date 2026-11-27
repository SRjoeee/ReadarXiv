// The preview layer's intent (preview/previews.ts; link previews' §3.8, the approved prototype's Popover): a preview shows after
// the 280 ms dwell, at once (no motion) within 400 ms of another, leaves 200 ms after the pointer left both its link and it, the
// 10 px bridge keeping it on the way; Esc closes it and gives the focus back to its link without opening it again; a link with
// no target shows nothing and still jumps; it rides with its link as the pane scrolls and goes when its link leaves the pane;
// one at a time; tied to its link for assistive technology (role tooltip, aria-describedby, no aria-expanded, no focus moved).
// Over stand-ins: two panes with one page each, the reader's clock run by hand, the content a plain element.
import type { Target } from '@readarxiv/format'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Clock } from '../../src/stack/clock.ts'
import { createPreviews, type PreviewDeps } from '../../src/preview/previews.ts'

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

const FIG: Target = ['"figure.1"', 'float', 1, 3, [72, 400, 540, 700]]
const SEC: Target = ['"section.2"', 'heading', 1, 5, [72, 100, 540, 260]]

function setUp(o: { narrow?: boolean } = {}) {
  const root = document.createElement('div')
  document.body.append(root)
  const panes = { left: document.createElement('div'), right: document.createElement('div') }
  const pages: Record<string, HTMLElement> = {}
  for (const side of ['left', 'right'] as const) {
    const page = document.createElement('div')
    page.className = 'page'
    page.dataset.pageNumber = '1'
    pages[side] = page
    panes[side].append(page)
    root.append(panes[side])
    vi.spyOn(panes[side], 'getBoundingClientRect').mockReturnValue(rect(side === 'left' ? 0 : 640, 44, 640, 856))
    vi.spyOn(page, 'getBoundingClientRect').mockReturnValue(rect(side === 'left' ? 20 : 660, 60, 600, 800))
  }
  // (a laid link on the right to the figure, another to the section beside it, one to a theorem the head states nothing of)
  const link = (dest: string, left: number, top: number) => {
    const a = document.createElement('a')
    a.className = 'axt-link'
    a.setAttribute('href', `#${encodeURIComponent(dest)}`)
    a.tabIndex = 0
    pages.right!.append(a)
    vi.spyOn(a, 'getBoundingClientRect').mockReturnValue(rect(left, top, 20, 12))
    return a
  }
  const fig = link('"figure.1"', 700, 200)
  const sec = link('"section.2"', 740, 200)
  const thm = link('"theorem.1"', 780, 200)
  const scrolled = new Set<(e: { side: 'left' | 'right' }) => void>()
  const { clock, pass } = testClock()
  const jumps: unknown[] = []
  const built: string[] = []
  const deps: PreviewDeps = {
    root,
    panes: {
      containerOf: (side) => panes[side],
      pageElement: (side) => pages[side] ?? null,
      boxOf: () => null,
      on: (_t, f) => {
        scrolled.add(f)
        return () => scrolled.delete(f)
      },
    },
    targets: () => new Map([FIG, SEC].map((t) => [t[0], t] as const)),
    bracket: async () => ({ key: null, boxes: [], foot: null }),
    content: async ({ target }) => {
      built.push(target[0])
      const el = document.createElement('div')
      el.className = 'content'
      el.textContent = target[0]
      return { el, kind: 'crop', label: target[0], described: el }
    },
    clock,
    words: () => ({ keep: (l) => `${l}: keep`, close: (l) => `Close ${l}`, go: 'Go to', search: 'Search' }),
    jump: (j) => jumps.push(j),
    open: () => {},
    narrow: () => !!o.narrow,
  }
  const previews = createPreviews(deps)
  const shown = () => root.querySelector<HTMLElement>('.axt-pv:not([data-axt-out])')
  const over = (a: Element) => a.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
  const out = (a: Element, to: Element | null = document.body) =>
    a.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: to }))
  const scroll = (side: 'left' | 'right') => {
    for (const f of [...scrolled]) f({ side })
  }
  return { root, previews, shown, over, out, pass, fig, sec, thm, jumps, built, scroll, panes }
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('the preview’s intent', () => {
  it('no preview before 280 ms; one at 280', async () => {
    const t = setUp()
    t.over(t.fig)
    await t.pass(279)
    expect(t.shown()).toBeNull()
    await t.pass(1)
    expect(t.shown()?.textContent).toBe('"figure.1"')
    // (its content asked at the pointer's entry: the dwell is its head start)
    expect(t.built).toEqual(['"figure.1"'])
  })
  it('at once, with no motion, within 400 ms of another', async () => {
    const t = setUp()
    t.over(t.fig)
    await t.pass(280)
    t.out(t.fig)
    await t.pass(200)
    expect(t.shown()).toBeNull()
    await t.pass(300)
    t.over(t.sec)
    await t.pass(0)
    const pv = t.shown()
    expect(pv?.textContent).toBe('"section.2"')
    expect(pv?.hasAttribute('data-axt-quiet')).toBe(true)
  })
  it('leaving for 199 ms keeps it, 200 ms closes it', async () => {
    const t = setUp()
    t.over(t.fig)
    await t.pass(280)
    t.out(t.fig)
    await t.pass(199)
    expect(t.shown()).not.toBeNull()
    await t.pass(1)
    expect(t.shown()).toBeNull()
  })
  it('the bridge keeps it: the pointer in the preview within the linger', async () => {
    const t = setUp()
    t.over(t.fig)
    await t.pass(280)
    const pv = t.shown()!
    t.out(t.fig, pv)
    pv.dispatchEvent(new PointerEvent('pointerenter'))
    await t.pass(1000)
    expect(t.shown()).toBe(pv)
    pv.dispatchEvent(new PointerEvent('pointerleave'))
    await t.pass(200)
    expect(t.shown()).toBeNull()
  })
  it('Esc closes it and returns the focus to its link without reopening it', async () => {
    const t = setUp()
    t.fig.focus()
    t.over(t.fig)
    await t.pass(280)
    expect(t.shown()).not.toBeNull()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await t.pass(100)
    expect(t.shown()).toBeNull()
    expect(document.activeElement).toBe(t.fig)
    await t.pass(1000)
    expect(t.shown()).toBeNull()
  })
  it('a link of no target shows nothing and still jumps (its click is the page’s)', async () => {
    const t = setUp()
    t.over(t.thm)
    await t.pass(1000)
    expect(t.shown()).toBeNull()
    expect(t.built).toEqual([])
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    t.thm.dispatchEvent(click)
    expect(click.defaultPrevented).toBe(false)
  })
  it('a scroll moves it with its link; its link out of the pane closes it', async () => {
    const t = setUp()
    t.over(t.fig)
    await t.pass(280)
    const pv = t.shown()!
    const top0 = Number.parseFloat(pv.style.top)
    vi.spyOn(t.fig, 'getBoundingClientRect').mockReturnValue(rect(700, 150, 20, 12))
    t.scroll('right')
    await t.pass(16)
    expect(Number.parseFloat(pv.style.top)).toBe(top0 - 50)
    vi.spyOn(t.fig, 'getBoundingClientRect').mockReturnValue(rect(700, -40, 20, 12))
    t.scroll('right')
    await t.pass(100)
    expect(t.shown()).toBeNull()
  })
  it('is a tooltip of its link: role tooltip, the link described by it, no aria-expanded, the focus not moved', async () => {
    const t = setUp()
    t.fig.focus()
    t.over(t.fig)
    await t.pass(280)
    const pv = t.shown()!
    expect(pv.getAttribute('role')).toBe('tooltip')
    const id = t.fig.getAttribute('aria-describedby')!
    expect(id).toBeTruthy()
    expect(document.getElementById(id)?.textContent).toBe('"figure.1"')
    expect(t.fig.hasAttribute('aria-expanded')).toBe(false)
    expect(document.activeElement).toBe(t.fig)
    expect(t.fig.hasAttribute('data-axt-held')).toBe(true)
    t.out(t.fig)
    await t.pass(300)
    expect(t.fig.hasAttribute('aria-describedby')).toBe(false)
    expect(t.fig.hasAttribute('data-axt-held')).toBe(false)
  })
  it('one at a time: another link’s preview replaces it', async () => {
    const t = setUp()
    t.over(t.fig)
    await t.pass(280)
    t.out(t.fig, t.sec)
    t.over(t.sec)
    await t.pass(0)
    expect(t.root.querySelectorAll('.axt-pv:not([data-axt-out])')).toHaveLength(1)
    expect(t.shown()?.textContent).toBe('"section.2"')
  })
})
