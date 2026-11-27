// The keyboard's path through a preview (preview/previews.ts; link previews' §3.10): Tab to a link shows its preview; Tab again
// goes into it (a crop's keep button, the card's scroller where it scrolls); Tab past its last stop goes to the next link and
// closes it; Shift+Tab goes back to the link; Enter on a crop keeps it and the kept panel takes the focus; Esc closes the
// preview before the kept panel, the focus back on the link.
import type { Target } from '@readarxiv/format'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createKeep } from '../../src/preview/keep.ts'
import { createPreviews } from '../../src/preview/previews.ts'
import type { Clock } from '../../src/stack/clock.ts'

const FIG: Target = ['"figure.1"', 'float', 1, 3, [72, 400, 540, 700]]
const words = { keep: (l: string) => `${l}: keep`, close: (l: string) => `Close ${l}`, go: 'Go to', search: 'S' }
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve()
}

function setUp() {
  let now = 0
  const due: { at: number; f: () => void }[] = []
  const clock: Clock = {
    now: () => now,
    later: (f, ms) => due.push({ at: now + ms, f }),
    clear: () => {},
    frame: (f) => due.push({ at: now, f }),
    cancel: () => {},
  }
  const pass = async (ms: number) => {
    await flush()
    now += ms
    for (const t of due.splice(0))
      if (t.at <= now) t.f()
      else due.push(t)
    await flush()
  }
  const root = document.createElement('div')
  const pane = document.createElement('div')
  const page = document.createElement('div')
  page.dataset.pageNumber = '1'
  pane.append(page)
  root.append(pane)
  document.body.append(root)
  const rect = (left: number, top: number) =>
    ({ left, top, width: 20, height: 12, right: left + 20, bottom: top + 12 }) as DOMRect
  vi.spyOn(pane, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 44,
    right: 800,
    bottom: 900,
    width: 800,
    height: 856,
  } as DOMRect)
  const link = (left: number) => {
    const a = document.createElement('a')
    a.className = 'axt-link'
    a.setAttribute('href', `#${encodeURIComponent(FIG[0])}`)
    a.tabIndex = 0
    page.append(a)
    vi.spyOn(a, 'getBoundingClientRect').mockReturnValue(rect(left, 200))
    return a
  }
  const a = link(100),
    b = link(300)
  const keep = createKeep({ clock, words: () => words })
  const keepSpy = vi.spyOn(keep, 'esc')
  createPreviews({
    root,
    panes: { containerOf: () => pane, pageElement: () => page, boxOf: () => null, on: () => () => {} },
    targets: () => new Map([[FIG[0], FIG]]),
    bracket: async () => ({ key: null, boxes: [], foot: null }),
    content: async () => {
      const button = document.createElement('button')
      button.className = 'axt-pv-keep'
      const img = document.createElement('div')
      img.setAttribute('role', 'img')
      button.append(img)
      return { el: button, kind: 'crop', label: 'Figure 1', described: img }
    },
    clock,
    words: () => words,
    jump: () => {},
    open: () => {},
    narrow: () => false,
    keep,
  })
  const shown = () => root.querySelector<HTMLElement>('.axt-pv:not([data-axt-out])')
  const key = (k: string, shiftKey = false) =>
    (document.activeElement ?? document.body).dispatchEvent(
      new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }),
    )
  return { a, b, shown, key, pass, keepSpy, root }
}

describe('the keyboard', () => {
  it('Tab to a link shows its preview; Tab into, through and past it; Shift+Tab back to the link', async () => {
    const t = setUp()
    t.a.focus()
    await t.pass(280)
    const pv = t.shown()!
    expect(pv).not.toBeNull()
    t.key('Tab')
    expect(document.activeElement).toBe(pv.querySelector('button'))
    t.key('Tab', true)
    expect(document.activeElement).toBe(t.a)
    t.key('Tab')
    t.key('Tab')
    expect(document.activeElement).toBe(t.b)
    await t.pass(100)
    expect(t.root.querySelector('.axt-pv:not([data-axt-out])')?.contains(document.activeElement) ?? false).toBe(false)
  })
  it('Enter on a crop keeps it and focuses it; Esc closes the preview before the kept panel', async () => {
    const t = setUp()
    t.a.focus()
    await t.pass(280)
    const pv = t.shown()!
    const button = pv.querySelector('button')!
    button.focus()
    // (Enter on a button is its click with no pointer: detail 0)
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }))
    expect(pv.classList.contains('axt-pv-kept')).toBe(true)
    expect(document.activeElement).toBe(pv)
    // (a second preview over the kept one: Esc closes it first)
    t.b.focus()
    await t.pass(280)
    expect(t.shown()).not.toBeNull()
    t.key('Escape')
    expect(t.keepSpy).not.toHaveBeenCalled()
    t.key('Escape')
    expect(t.keepSpy).toHaveBeenCalledTimes(1)
  })
})
