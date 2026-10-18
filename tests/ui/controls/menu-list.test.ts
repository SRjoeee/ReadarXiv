// The menus' rows (the reader's design, §6.7; the redesign's design, §5.3; Part 3's interfaces): the reader's, moved,
// with the pages' four additions
import { act, createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MenuList, type MenuListItem } from '@/ui/controls/MenuList'
import { stubPopovers } from '../../pdf-reader/ui/popover-stub'
import { mountElement } from '../render-hook'

afterEach(() => { document.body.innerHTML = '' })
const key = (target: Element, k: string) => act(async () => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })) })
async function mount(items: MenuListItem[], props: Partial<Parameters<typeof MenuList>[0]> = {}) {
  const onPick = vi.fn(), onAction = vi.fn(), onClose = vi.fn()
  const mounted = await mountElement(createElement(MenuList, { items, kind: 'listbox', label: 'Service', onPick, onAction, onClose, ...props }))
  return { ...mounted, onPick, onAction, list: mounted.container.querySelector<HTMLElement>('[role="listbox"]')!, rows: [...mounted.container.querySelectorAll<HTMLElement>('[role="option"]')] }
}
const SERVICES: MenuListItem[] = [
  { id: 'microsoft', name: 'Microsoft', hint: 'Free', checked: true },
  { id: 'google', name: 'Google', hint: 'Free' },
  { id: 'chrome', name: 'Chrome', hint: 'Built in', disabled: true, action: { label: 'Download' } },
  { id: 'chrome-busy', name: 'Chrome', hint: 'Downloading', disabled: true, action: { label: 'Download', busy: true } },
  { id: 'manage', name: 'Manage services', manage: true },
]

describe('MenuList', () => {
  it('draws the reader\'s rows by default, as they were: the check, the name, the hint at the end', async () => {
    const { rows } = await mount([{ id: 'a', name: 'A', hint: '100%', checked: true }, { id: 'b', name: 'B' }])
    expect(rows.map(r => r.className)).toEqual(['item', 'item'])
    expect([...rows[0]!.children].map(c => c.getAttribute('class'))).toEqual(['check', 'min-w-0 flex-1 truncate', 'hint'])
    expect([...rows[1]!.children].map(c => c.getAttribute('class'))).toEqual(['check invisible', 'min-w-0 flex-1 truncate'])
  })

  it('two lines: each hint under its name; a row without one keeps one line', async () => {
    const { rows } = await mount(SERVICES, { layout: 'two-line' })
    expect(rows.map(r => r.className)).toEqual(['item two', 'item two', 'item two unavailable', 'item two unavailable', 'item manage'])
    expect([...rows[0]!.querySelector('.t')!.children].map(c => [c.getAttribute('class'), c.textContent])).toEqual([[null, 'Microsoft'], ['sub', 'Free']])
    expect(rows[0]!.querySelector('.hint')).toBeNull()
  })

  it('reaches a disabled row with an action by the arrows; picked by Enter, Space or a click, it runs the action, never a choice (ruling 11); it carries no aria-disabled, greyed instead by `unavailable` (finding 2)', async () => {
    const { list, rows, onPick, onAction } = await mount(SERVICES, { layout: 'two-line' })
    await key(list, 'ArrowDown')
    await key(list, 'ArrowDown')
    expect(list.getAttribute('aria-activedescendant')).toBe(rows[2]!.id)
    expect([rows[2]!.getAttribute('aria-disabled'), rows[2]!.className]).toEqual([null, 'item two unavailable'])
    await key(list, 'Enter')
    await key(list, ' ')
    rows[2]!.click()
    expect([onAction.mock.calls, onPick.mock.calls]).toEqual([[['chrome'], ['chrome'], ['chrome']], []])
    expect(rows[2]!.querySelector('.act')!.textContent).toBe('Download')
  })

  it('does nothing on a row whose action is running, which turns a loader instead of its button and carries aria-busy (Review Focus; finding 3)', async () => {
    const { list, rows, onPick, onAction } = await mount(SERVICES, { layout: 'two-line' })
    expect([rows[3]!.querySelector('svg.spin') !== null, rows[3]!.querySelector('.act'), rows[3]!.getAttribute('aria-busy')]).toEqual([true, null, 'true'])
    rows[3]!.click()
    for (const k of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter']) await key(list, k)
    expect([onAction.mock.calls.length, onPick.mock.calls.length]).toEqual([0, 0])
  })

  it('picks an enabled row with an action for its action too: onAction, not onPick', async () => {
    const { rows, onPick, onAction } = await mount([{ id: 'pack', name: 'Chrome', action: { label: 'Download' } }])
    rows[0]!.click()
    expect([onAction.mock.calls, onPick.mock.calls]).toEqual([[['pack']], []])
  })

  it('marks a row\'s own words with their language: the name, or in a style\'s row the sample (ruling 1)', async () => {
    const { rows } = await mount([
      { id: 'deu', name: 'Deutsch', lang: 'de' },
      { id: 'muted', name: 'Muted', hint: 'Sample', preview: { opacity: 0.7 }, lang: 'zh-CN' },
      { id: 'plain', name: 'Plain' },
    ])
    expect(rows.map(r => [...r.querySelectorAll('[lang]')].map(e => [e.getAttribute('class'), e.getAttribute('lang')]))).toEqual([
      [['min-w-0 flex-1 truncate', 'de']],
      [['preview', 'zh-CN']],
      [],
    ])
  })

  it('draws a style\'s sample at the row\'s end, hidden from assistive technology, after the name', async () => {
    const { rows } = await mount([{ id: 'muted', name: 'Muted', hint: 'Sample', preview: { opacity: 0.7 } }])
    const sample = rows[0]!.querySelector<HTMLElement>('.preview')!
    expect([rows[0]!.querySelector('.nm')?.textContent, sample.textContent, sample.getAttribute('aria-hidden'), sample.style.opacity, rows[0]!.querySelector('.hint')]).toEqual(['Muted', 'Sample', 'true', '0.7', null])
  })

  it('ends with the way to manage the list: a separator before it, never chosen, picked like any row', async () => {
    const { rows, onPick } = await mount([{ id: 'a', name: 'A', checked: true }, { id: 'manage', name: 'Manage', manage: true, checked: true }])
    expect(rows[1]!.previousElementSibling?.matches('hr.sep')).toBe(true)
    expect([rows[1]!.getAttribute('aria-selected'), rows[1]!.querySelector('.check')!.getAttribute('class')]).toEqual(['false', 'check invisible'])
    rows[1]!.click()
    expect(onPick).toHaveBeenCalledWith('manage')
  })

  it('starts active on the first row when the only `checked` item is the manage row (finding 5)', async () => {
    const { list, rows } = await mount([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'manage', name: 'Manage', manage: true, checked: true }])
    expect(list.getAttribute('aria-activedescendant')).toBe(rows[0]!.id)
  })

  it('picks a row with an action by Space too, when the list has no search field (finding 6)', async () => {
    const { list, onPick, onAction } = await mount([{ id: 'pack', name: 'Chrome', action: { label: 'Download' } }])
    await key(list, ' ')
    expect([onAction.mock.calls, onPick.mock.calls]).toEqual([[['pack']], []])
  })

  it('the typeahead reaches a disabled row with an action; Enter there calls onAction (finding 6)', async () => {
    const { list, rows, onPick, onAction } = await mount(SERVICES, { layout: 'two-line' })
    await key(list, 'c')
    expect(list.getAttribute('aria-activedescendant')).toBe(rows[2]!.id)
    await key(list, 'Enter')
    expect([onAction.mock.calls, onPick.mock.calls]).toEqual([[['chrome']], []])
  })

  it('in the two-line layout, `lang` lands on the name (finding 6)', async () => {
    const { rows } = await mount([{ id: 'deu', name: 'Deutsch', hint: 'Free', lang: 'de' }], { layout: 'two-line' })
    const name = rows[0]!.querySelector('.t > span[lang]')
    expect([name?.getAttribute('lang'), name?.textContent]).toEqual(['de', 'Deutsch'])
  })
})

/**
 * The layout happy-dom does not do, for the scroll of the active row: the rows 30 px apart from the top of `box`, a scroll
 * box `height` px tall that `scrollTop` moves (clamped as a browser clamps it); nothing laid out while `shown()` is false,
 * as a closed popover's contents are not (display: none). `scale`: the drawing's size against the layout's, as the
 * popover's grow-in (pop-in, from 0.97) draws it — the rects are drawn lengths, `offsetHeight`, `clientHeight` and
 * `scrollTop` layout ones. Every other element is where happy-dom puts it: at 0, 0
 */
function layOut(box: HTMLElement, height: number, shown: () => boolean = () => true, scale = 1) {
  const rows = () => [...box.querySelectorAll('[role="option"]')]
  let top = 0
  box.style.overflowY = 'auto'
  Object.defineProperty(box, 'clientHeight', { configurable: true, get: () => (shown() ? height : 0) })
  Object.defineProperty(box, 'offsetHeight', { configurable: true, get: () => (shown() ? height : 0) })
  Object.defineProperty(box, 'scrollHeight', { configurable: true, get: () => (shown() ? rows().length * 30 : 0) })
  Object.defineProperty(box, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = Math.max(0, Math.min(v, box.scrollHeight - box.clientHeight)) } })
  const real = Element.prototype.getBoundingClientRect
  const rect = (y: number, h: number) => ({ x: 0, y, top: y, bottom: y + h, left: 0, right: 200, width: 200, height: h, toJSON: () => ({}) }) as DOMRect
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    if (!shown()) return rect(0, 0)
    if (this === box) return rect(0, height * scale)
    const i = rows().indexOf(this)
    return i < 0 ? real.call(this) : rect((i * 30 - top) * scale, 30 * scale)
  })
}
const LANGUAGES: MenuListItem[] = Array.from({ length: 40 }, (_, i) => ({ id: `l${i}`, name: `Lang ${i}` }))
/** the active row's place in its box: whether it shows whole (to a thousandth of a pixel, the float's error on a scaled drawing) */
const inView = (box: HTMLElement, index: number) => index * 30 >= box.scrollTop - 1e-3 && index * 30 + 30 <= box.scrollTop + box.clientHeight + 1e-3

describe('MenuList: the active row stays in view (the final review of Part 7, A-I2)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('the arrows past the rows that show scroll the list to the active one, and back; a row already in view leaves it where it is', async () => {
    // the language list of the popup and the settings page: a search field over a list five rows and a half tall (ui.css)
    const { container } = await mount(LANGUAGES, { search: 'Search' })
    const field = container.querySelector<HTMLInputElement>('input')!
    const list = container.querySelector<HTMLElement>('[role="listbox"]')!
    layOut(list, 165)
    for (let i = 1; i <= 4; i++) await key(field, 'ArrowDown')
    // the fifth row shows whole: nothing moves
    expect([field.getAttribute('aria-activedescendant'), list.scrollTop]).toEqual([list.querySelectorAll('[role="option"]')[4]!.id, 0])
    for (let i = 5; i <= 12; i++) {
      await key(field, 'ArrowDown')
      expect(inView(list, i), `row ${i}`).toBe(true)
    }
    // the nearest edge: the active row at the bottom, not at the top
    expect(list.scrollTop).toBe(13 * 30 - 165)
    await key(field, 'ArrowUp')
    expect(list.scrollTop).toBe(13 * 30 - 165)
    for (let i = 0; i < 11; i++) await key(field, 'ArrowUp')
    expect([inView(list, 0), list.scrollTop]).toEqual([true, 0])
  })

  it('a list opened on a stored option far down shows it: drawn while hidden, it scrolls as its popover opens', async () => {
    const restore = stubPopovers()
    try {
      const items = LANGUAGES.map((l, i) => ({ ...l, checked: i === 25 }))
      const { container } = await mountElement(createElement('div', { popover: 'auto' }, createElement(MenuList, { items, kind: 'listbox', label: 'Language', search: 'Search', onPick: vi.fn(), onClose: vi.fn() })))
      const popover = container.querySelector<HTMLElement>('[popover]')!
      const list = container.querySelector<HTMLElement>('[role="listbox"]')!
      layOut(list, 165, () => popover.hasAttribute('data-open'))
      expect(list.scrollTop).toBe(0)
      await act(async () => { popover.showPopover() })
      expect([list.querySelector('[data-active]')!.textContent, inView(list, 25), list.scrollTop]).toEqual(['Lang 25', true, 26 * 30 - 165])
    } finally { restore() }
  })

  it('lands exactly while the popover grows in: the rows drawn at 0.97 of their layout, the scroll counted in the layout (Task 110c)', async () => {
    // on 2cc12d83 the distances were read off the drawing and scrolled as they were, short of the layout's: opened on row
    // 25 the list stopped at 591.6 for 615, the row below the box's foot (in Chromium on the settings page: 4 113 for 4 245)
    const restore = stubPopovers()
    try {
      const items = LANGUAGES.map((l, i) => ({ ...l, checked: i === 25 }))
      const { container } = await mountElement(createElement('div', { popover: 'auto' }, createElement(MenuList, { items, kind: 'listbox', label: 'Language', search: 'Search', onPick: vi.fn(), onClose: vi.fn() })))
      const popover = container.querySelector<HTMLElement>('[popover]')!
      const field = container.querySelector<HTMLInputElement>('input')!
      const list = container.querySelector<HTMLElement>('[role="listbox"]')!
      layOut(list, 165, () => popover.hasAttribute('data-open'), 0.97)
      await act(async () => { popover.showPopover() })
      expect(list.scrollTop).toBeCloseTo(26 * 30 - 165, 6)
      expect(inView(list, 25)).toBe(true)
      for (let i = 26; i <= 28; i++) {
        await key(field, 'ArrowDown')
        expect(inView(list, i), `row ${i}`).toBe(true)
      }
      expect(list.scrollTop).toBeCloseTo(29 * 30 - 165, 6)
    } finally { restore() }
  })

  it('scrolls the list alone: nothing around it moves — no scrollIntoView, which would scroll the settings page or the popup too', async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, writable: true, value: scrollIntoView })
    try {
      const { container, list } = await mount(LANGUAGES)
      layOut(list, 165)
      for (let i = 0; i < 20; i++) await key(list, 'ArrowDown')
      expect([inView(list, 20), scrollIntoView.mock.calls.length, container.scrollTop, document.documentElement.scrollTop]).toEqual([true, 0, 0, 0])
    } finally { delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView }
  })
})
