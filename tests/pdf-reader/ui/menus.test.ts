import { act, createElement, type ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import { fileName, type ReaderController } from '@/pdf-reader/controller'
import { DownloadMenu, LanguageMenu, ServiceMenu, ZoomMenu } from '@/pdf-reader/ui/Menus'
import { setLocale } from '@/ui/strings'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'
import { stubPopovers } from './popover-stub'
import { POPUP_FIXTURES } from '@/entrypoints/popup/fixtures'

let restore = () => {}
// the interface's words as the maintainer reads them: the controls are found by them
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

async function openMenu(component: (props: { controller: ReaderController }) => ReactNode, over = {}) {
  const fake = fakeController(over)
  const mounted = await mountElement(createElement(component, { controller: fake.controller }))
  await act(async () => { mounted.container.querySelector<HTMLElement>('[popover="auto"]')!.showPopover() })
  return { ...mounted, ...fake }
}

describe('the reader\'s menus (the reader\'s design, §6.1, §6.7)', () => {
  it('zoom: the fits, then the scales, the current one checked; a pick zooms', async () => {
    const { container, controller } = await openMenu(ZoomMenu, { scale: 1.5, zoom: 1.5 })
    const items = [...container.querySelectorAll('[role="menuitemradio"]')]
    expect(items.map(i => i.textContent)).toEqual(['适合宽度', '适合页面', '实际大小', '50%', '75%', '100%', '125%', '150%', '200%'])
    expect(items.filter(i => i.getAttribute('aria-checked') === 'true').map(i => i.textContent)).toEqual(['150%'])
    ;(items[0] as HTMLElement).click()
    expect(controller.zoomTo).toHaveBeenCalledWith('page-width')
  })

  it('language: the search narrows the nine; a pick writes the target language', async () => {
    const { container, controller } = await openMenu(LanguageMenu)
    const search = container.querySelector<HTMLInputElement>('input')!
    await act(async () => { search.value = 'deu'; search.dispatchEvent(new Event('input', { bubbles: true })) })
    const options = [...container.querySelectorAll('[role="option"]')]
    expect(options.map(o => o.textContent)).toEqual(['Deutsch'])
    ;(options[0] as HTMLElement).click()
    const change = controller.patchSettings.mock.calls[0]![0] as (c: Config) => Config
    expect(change({ ...DEFAULT_CONFIG, targetLanguage: 'cmn' }).targetLanguage).toBe('deu')
  })

  it('language: the arrows move one language at a time from the search field, and Enter picks once (the final review)', async () => {
    const { container, controller } = await openMenu(LanguageMenu)
    const search = container.querySelector<HTMLInputElement>('input')!
    const active = () => document.getElementById(search.getAttribute('aria-activedescendant') ?? '')?.textContent
    const names = [...container.querySelectorAll('[role="option"]')].map(o => o.textContent)
    const first = active()
    await act(async () => { search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })) })
    expect(active()).toBe(names[(names.indexOf(first ?? '') + 1) % names.length])
    await act(async () => { search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
    expect(controller.patchSettings).toHaveBeenCalledTimes(1)
  })

  it('language: the search field is a combobox naming the list and its active option, and the list holds options alone (the final review)', async () => {
    const { container } = await openMenu(LanguageMenu)
    const search = container.querySelector<HTMLInputElement>('input')!, list = container.querySelector<HTMLElement>('[role="listbox"]')!
    expect([search.getAttribute('role'), search.getAttribute('aria-controls'), list.contains(search)]).toEqual(['combobox', list.id, false])
    expect(document.getElementById(search.getAttribute('aria-activedescendant') ?? '')?.getAttribute('role')).toBe('option')
    expect([...list.children].every(c => c.getAttribute('role') === 'option')).toBe(true)
    // one list, not a listbox in a listbox: the popover itself takes no role
    expect(container.querySelectorAll('[role="listbox"], [role="menu"]').length).toBe(1)
  })

  it('service: a service another tab has deleted meanwhile is not written, as the popup\'s choice is not (Codex on #301)', async () => {
    const mine = POPUP_FIXTURES.find(f => f.id === 'P15')!.input.config!.services[0]!
    const settings: Config = { ...DEFAULT_CONFIG, services: [mine] }
    const { container, controller } = await openMenu(ServiceMenu, { settings })
    const option = [...container.querySelectorAll<HTMLElement>('[role="option"]')].find(o => o.textContent?.includes(mine.name))!
    option.click()
    const change = controller.patchSettings.mock.calls[0]![0] as (c: Config) => Config
    expect(change(settings).provider).toBe(mine.id)
    const deleted = { ...settings, services: [] }
    expect(change(deleted)).toBe(deleted)
  })

  it('service and zoom: one list each, its separators not items of it (the final review)', async () => {
    for (const menu of [ServiceMenu, ZoomMenu]) {
      const { container } = await openMenu(menu)
      const lists = container.querySelectorAll('[role="listbox"], [role="menu"]')
      expect(lists.length).toBe(1)
      expect([...lists[0]!.children].every(c => ['option', 'menuitemradio', 'none'].includes(c.getAttribute('role') ?? ''))).toBe(true)
      restore(); document.body.innerHTML = ''; restore = stubPopovers()
    }
  })

  it('download: the original greyed until its document is open — loading, or a fetch that failed (Codex on #301)', async () => {
    const { container, controller } = await openMenu(DownloadMenu, { finalReady: true, sides: { left: { page: 0, pages: 0 }, right: { page: 0, pages: 0 } } })
    const [, original] = [...container.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    expect(original!.getAttribute('aria-disabled')).toBe('true')
    original!.click()
    expect(controller.download).not.toHaveBeenCalled()
  })

  it('download: the translation greyed until the final is on screen', async () => {
    const { container, controller } = await openMenu(DownloadMenu, { finalReady: false, sides: { left: { page: 1, pages: 25 }, right: { page: 1, pages: 26 } } })
    const [translation, original] = [...container.querySelectorAll<HTMLElement>('[role="menuitem"]')]
    expect([translation!.textContent, translation!.getAttribute('aria-disabled'), original!.textContent]).toEqual(['译文 PDF', 'true', '原文 PDF'])
    translation!.click()
    original!.click()
    expect(controller.download.mock.calls).toEqual([['original']])
  })

  it('names the files by the paper, an old-style id\'s slash made safe', () => {
    expect(fileName('2608.02163', 'original', 'zh')).toBe('2608.02163.pdf')
    expect(fileName('hep-th/9711200', 'translation', 'zh-Hant')).toBe('hep-th_9711200.zh-Hant.pdf')
  })
})
