// A citation's card, phase 1 (preview/card.ts; link previews' §3.3-3.5): the reference's own text in English, in a scroller of the
// abstract's type, its two ends fading by the scroll's position, a Tab stop only where it scrolls; the search link at its foot
// only once SEARCH_URL is set; its text behaving as text over the preview layer (a selection in it keeps the card, a press
// outside clears that selection and lets the card go, a drag begun in it keeps it over other links).
import type { Target } from '@readarxiv/format'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cardOf, SEARCH_URL } from '../../src/preview/card.ts'
import { createPreviews } from '../../src/preview/previews.ts'
import type { Clock } from '../../src/stack/clock.ts'

const words = { keep: (l: string) => l, close: (l: string) => l, go: 'Go to', search: 'Search for this paper' }
afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('the card', () => {
  it('holds the reference’s text in English, quotes set curly, and no search link while SEARCH_URL is null', () => {
    expect(SEARCH_URL).toBeNull()
    const c = cardOf({ text: 'B. Writer. "A study" of it’s and it\'s.', search: null, words })
    document.body.append(c.el)
    const p = c.el.querySelector('p')!
    expect(p.lang).toBe('en')
    expect(p.textContent).toBe('B. Writer. “A study” of it’s and it’s.')
    expect(c.el.querySelector('a')).toBeNull()
    expect(c.described).toBe(p)
  })
  it('the search link at its foot where a search is given, opened by the reader’s opener', () => {
    const open = vi.fn()
    const c = cardOf({ text: 'x', search: 'https://example.org/?q=x', words, open })
    const a = c.el.querySelector('a')!
    expect(a.textContent).toContain('Search for this paper')
    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    expect(open).toHaveBeenCalledWith('https://example.org/?q=x')
  })
  it('the scroller is a Tab stop only where it scrolls', () => {
    const c = cardOf({ text: 'x', search: null, words })
    document.body.append(c.el)
    const s = c.el.querySelector<HTMLElement>('[data-axt-scrolls]')!
    Object.defineProperty(s, 'scrollHeight', { value: 100, configurable: true })
    Object.defineProperty(s, 'clientHeight', { value: 100, configurable: true })
    c.fit?.(1000)
    expect(s.tabIndex).toBe(-1)
    Object.defineProperty(s, 'scrollHeight', { value: 300, configurable: true })
    c.fit?.(1000)
    expect(s.tabIndex).toBe(0)
  })
  it('the fade’s ends follow the scroll position: none at the head, growing to full over the fade’s height, the foot alike', () => {
    const c = cardOf({ text: 'x', search: null, words })
    document.body.append(c.el)
    const s = c.el.querySelector<HTMLElement>('[data-axt-scrolls]')!
    Object.defineProperty(s, 'scrollHeight', { value: 300, configurable: true })
    Object.defineProperty(s, 'clientHeight', { value: 100, configurable: true })
    c.fit?.(1000)
    expect(s.style.getPropertyValue('--axt-ft')).toBe('0')
    expect(s.style.getPropertyValue('--axt-fb')).toBe('1')
    s.scrollTop = 10
    s.dispatchEvent(new Event('scroll'))
    expect(s.style.getPropertyValue('--axt-ft')).toBe('0.5')
    s.scrollTop = 195
    s.dispatchEvent(new Event('scroll'))
    expect(s.style.getPropertyValue('--axt-ft')).toBe('1')
    expect(s.style.getPropertyValue('--axt-fb')).toBe('0.25')
  })
})

// ---------------------------------------------------------------- the card over the preview layer
function testClock() {
  let now = 0
  const due = new Map<number, { at: number; f: () => void }>()
  let next = 1
  const clock: Clock = {
    now: () => now,
    later: (f, ms) => {
      due.set(next, { at: now + ms, f })
      return next++
    },
    clear: (id) => void due.delete(id),
    frame: (f) => {
      due.set(next, { at: now, f })
      return next++
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
const CITE: Target = ['"cite.a"', 'reference', 1, 2, [72, 100, 300, 120]]
function onLayer() {
  const root = document.createElement('div')
  const pane = document.createElement('div')
  const page = document.createElement('div')
  page.dataset.pageNumber = '1'
  pane.append(page)
  root.append(pane)
  document.body.append(root)
  const link = (dest: string) => {
    const a = document.createElement('a')
    a.className = 'axt-link'
    a.setAttribute('href', `#${encodeURIComponent(dest)}`)
    page.append(a)
    return a
  }
  const a = link('"cite.a"'),
    other = link('"cite.b"')
  const rect = (left: number, top: number, width: number, height: number) =>
    ({ left, top, width, height, right: left + width, bottom: top + height }) as DOMRect
  vi.spyOn(pane, 'getBoundingClientRect').mockReturnValue(rect(0, 44, 800, 856))
  vi.spyOn(a, 'getBoundingClientRect').mockReturnValue(rect(300, 200, 20, 12))
  vi.spyOn(other, 'getBoundingClientRect').mockReturnValue(rect(330, 200, 20, 12))
  const { clock, pass } = testClock()
  createPreviews({
    root,
    panes: { containerOf: () => pane, pageElement: () => page, boxOf: () => null, on: () => () => {} },
    targets: () =>
      new Map([
        [CITE[0], CITE],
        ['"cite.b"', ['"cite.b"', 'reference', 1, 3, [72, 80, 300, 99]]],
      ]),
    bracket: async () => ({ key: null, boxes: [], foot: null }),
    content: async ({ target }) => {
      const c = cardOf({ text: `the text of ${target[0]}`, search: null, words })
      return { el: c.el, kind: 'card', label: 'Reference', described: c.described, fit: c.fit }
    },
    clock,
    words: () => words,
    jump: () => {},
    open: () => {},
    narrow: () => false,
  })
  const shown = () => root.querySelector<HTMLElement>('.axt-pv:not([data-axt-out])')
  return { root, a, other, pass, shown }
}

describe('text behaves as text: the card over the layer', () => {
  it('a selection inside keeps the card; a press outside clears it and the card goes', async () => {
    const t = onLayer()
    t.a.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    await t.pass(280)
    const pv = t.shown()!
    const p = pv.querySelector('p')!
    t.a.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }))
    document.getSelection()!.selectAllChildren(p)
    await t.pass(1000)
    expect(t.shown()).toBe(pv)
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    expect(document.getSelection()!.isCollapsed).toBe(true)
    await t.pass(200)
    expect(t.shown()).toBeNull()
  })
  it('a drag that began in the card keeps it, over other links too', async () => {
    const t = onLayer()
    t.a.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    await t.pass(280)
    const pv = t.shown()!
    pv.dispatchEvent(new PointerEvent('pointerenter'))
    pv.querySelector('p')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    pv.dispatchEvent(new PointerEvent('pointerleave'))
    t.other.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
    await t.pass(1000)
    expect(t.shown()).toBe(pv)
    expect(pv.textContent).toContain('cite.a')
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    await t.pass(200)
    expect(t.shown()).toBeNull()
  })
})
