import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { POPUP_FIXTURES } from '@/entrypoints/popup/fixtures'
import { MenuRow, StyleButton, anchors } from '@/entrypoints/popup/ui/menu'
import { MANAGE_SERVICES, derivePopupView } from '@/entrypoints/popup/view-model'
import { S, setLocale } from '@/ui/strings'
import { isOpen, stubPopovers } from '../pdf-reader/ui/popover-stub'
import { mountElement } from '../ui/render-hook'

// The popup's menus (the redesign's design, §5.3): the browser's popover and the view model kept in step, the rows drawn
// after the first paint, the popup growing to hold a menu, a value cut short whole in its tooltip
let restore = () => {}
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); vi.useRealTimers(); document.body.innerHTML = '' })

const view = derivePopupView(POPUP_FIXTURES.find(f => f.id === 'P1')!.input)
const nextFrame = () => act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => resolve())) })
const menuOf = (root: Element) => root.querySelector<HTMLElement>('[popover="auto"]')!
function service() {
  const actions = { openMenu: vi.fn(), closeMenu: vi.fn() }
  const onPick = vi.fn()
  const row = (open: boolean) => createElement('main', { className: 'ui popup' }, createElement(MenuRow, { kind: 'service', label: S.rows.service, row: view.service, menu: view.menus!.service, open, actions, onPick, onAction: vi.fn() }))
  return { actions, onPick, row }
}

describe('a row of the group and its menu (the redesign\'s design, §5.3)', () => {
  it('the browser opening or shutting the menu reaches the popup\'s state, for that menu alone', async () => {
    const { actions, row } = service()
    const { container } = await mountElement(row(false))
    await act(async () => { menuOf(container).showPopover() })
    expect(actions.openMenu).toHaveBeenLastCalledWith('service')
    await act(async () => { menuOf(container).hidePopover() })
    expect(actions.closeMenu).toHaveBeenLastCalledWith('service')
  })

  it('the view model opening or shutting it reaches the browser, once the popup has painted', async () => {
    const { row } = service()
    const mounted = await mountElement(row(true))
    await nextFrame()
    expect(isOpen(menuOf(mounted.container))).toBe(true)
    await mounted.rerender(row(false))
    expect(isOpen(menuOf(mounted.container))).toBe(false)
  })

  it('draws its rows once the popup has painted; a pick goes to its handler, the last row the way to the settings', async () => {
    const { row, onPick } = service()
    const { container } = await mountElement(row(false))
    await nextFrame()
    const options = [...container.querySelectorAll<HTMLElement>('[role="option"]')]
    expect(options.length).toBe(view.menus!.service.items.length)
    await act(async () => { options.at(-1)!.click() })
    expect(onPick).toHaveBeenCalledWith(MANAGE_SERVICES)
  })

  it('opening below its row, the popup grows to hold the menu, and gives the room back as it shuts', async () => {
    const { row } = service()
    const { container } = await mountElement(row(false))
    const main = container.querySelector('main')!, button = container.querySelector('button.group-row')!, menu = menuOf(container)
    main.getBoundingClientRect = () => ({ top: 0 }) as DOMRect
    button.getBoundingClientRect = () => ({ top: 48, bottom: 84 }) as DOMRect
    Object.defineProperty(menu, 'scrollHeight', { configurable: true, value: 210 })
    await act(async () => { menu.showPopover() })
    expect(main.style.minHeight).toBe('306px')
    await act(async () => { menu.hidePopover() })
    expect(main.style.minHeight).toBe('')
  })

  it('a value cut short shows whole in its tooltip after 500 ms; a value that fits shows none', async () => {
    const { row } = service()
    const { container } = await mountElement(row(false))
    const button = container.querySelector('button.group-row')!, value = button.querySelector('.v > span')!, tip = container.querySelector('.tip')
    const pointer = (type: 'pointerover' | 'pointerout') => act(async () => { button.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget: type === 'pointerout' ? document.body : null })) })
    vi.useFakeTimers()
    await pointer('pointerover')
    await act(async () => { vi.advanceTimersByTime(600) })
    expect(isOpen(tip)).toBe(false)
    await pointer('pointerout')
    Object.defineProperty(value, 'scrollWidth', { configurable: true, value: 300 })
    Object.defineProperty(value, 'clientWidth', { configurable: true, value: 120 })
    await pointer('pointerover')
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(isOpen(tip)).toBe(true)
    expect(tip!.textContent).toBe(view.service.value)
  })

  it('a row carries its menu\'s anchor and its tooltip\'s in one declaration: a second would replace the first', async () => {
    expect(anchors('--pop-a', '--tip-b')).toEqual({ anchorName: '--pop-a, --tip-b' })
    // and the row drawn carries both names
    const { row } = service()
    const { container } = await mountElement(row(false))
    const style = container.querySelector<HTMLElement>('button.group-row')!.style as CSSStyleDeclaration & { anchorName?: string }
    expect((style.anchorName ?? '').split(', ').map(name => name.slice(0, 6))).toEqual(['--pop-', '--tip-'])
  })
})

describe('the style button and its menu (§5.3)', () => {
  it('opens above the foot, held to the room above the button; the popup does not grow for it', async () => {
    const actions = { openMenu: vi.fn(), closeMenu: vi.fn() }
    const { container } = await mountElement(createElement('main', { className: 'ui popup' }, createElement(StyleButton, { value: view.style!.value, menu: view.menus!.style!, open: false, actions, onPick: vi.fn() })))
    const main = container.querySelector('main')!, button = container.querySelector('.style-btn')!, menu = menuOf(container)
    expect(menu.classList.contains('up')).toBe(true)
    main.getBoundingClientRect = () => ({ top: 0 }) as DOMRect
    button.getBoundingClientRect = () => ({ top: 241, bottom: 271 }) as DOMRect
    await act(async () => { menu.showPopover() })
    expect([menu.style.maxHeight, main.style.minHeight]).toEqual(['227px', ''])
    expect(actions.openMenu).toHaveBeenLastCalledWith('style')
  })
})
