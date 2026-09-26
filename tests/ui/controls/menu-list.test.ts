// The menus' rows (the reader's design, §6.7; the redesign's design, §5.3; Part 3's interfaces): the reader's, moved,
// with the pages' four additions
import { act, createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MenuList, type MenuListItem } from '@/ui/controls/MenuList'
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
