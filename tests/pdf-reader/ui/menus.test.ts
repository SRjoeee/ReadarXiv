import { act, createElement, type ReactNode } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { LANG_CODE_TO_LOCALE_NAME, toBcp47 } from '@/config/languages'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import { fileName, type ReaderController } from '@/pdf-reader/controller'
import { READER_LANGUAGES } from '@/pdf-reader/ui/languages'
import { DownloadMenu, LanguageMenu, ServiceMenu, ZoomMenu } from '@/pdf-reader/ui/Menus'
import { S, setLocale } from '@/ui/strings'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'
import { stubPopovers } from './popover-stub'
import { POPUP_FIXTURES } from '@/entrypoints/popup/fixtures'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import type { Service } from '@/config/services'
import { clearRejected, markRejected } from '@/shared/service-health'

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

  it('language: the button names the target by its own name in either interface language, as the menu\'s rows do (the maintainer, 2026-10-04)', async () => {
    try {
      for (const locale of ['zh-CN', 'en'] as const) {
        setLocale(locale)
        const { container } = await openMenu(LanguageMenu, { settings: { ...DEFAULT_CONFIG, targetLanguage: 'jpn' } })
        const button = container.querySelector<HTMLElement>('.menu-btn [data-value]')!
        const row = [...container.querySelectorAll('[role="option"]')].find(o => o.getAttribute('aria-selected') === 'true')
        expect([locale, button.textContent]).toEqual([locale, LANG_CODE_TO_LOCALE_NAME.jpn])
        expect(row?.textContent).toBe(button.textContent)
        document.body.innerHTML = ''
      }
    } finally { setLocale('zh-CN') }
  })

  it('language: a code the table lacks shows the code itself, never nothing', async () => {
    const { container } = await openMenu(LanguageMenu, { settings: { ...DEFAULT_CONFIG, targetLanguage: 'zzz' as never } })
    expect(container.querySelector('.menu-btn [data-value]')?.textContent).toBe('zzz')
  })

  it('language: the button\'s value and each row carry the language they are written in, and the button\'s name starts with the own name (WCAG 3.1.2, 2.5.3)', async () => {
    const { container } = await openMenu(LanguageMenu, { settings: { ...DEFAULT_CONFIG, targetLanguage: 'jpn' } })
    const button = container.querySelector<HTMLElement>('.menu-btn')!
    expect(button.querySelector('[data-value]')?.getAttribute('lang')).toBe(toBcp47('jpn'))
    const options = [...container.querySelectorAll('[role="option"]')]
    expect(options.map(o => o.querySelector('[lang]')?.getAttribute('lang'))).toEqual(READER_LANGUAGES.map(toBcp47))
    // the name aria-labelledby builds: the value, then the label that is hidden
    const name = button.getAttribute('aria-labelledby')!.split(' ').map(id => document.getElementById(id)?.textContent).join(' ')
    expect(name).toBe(`${LANG_CODE_TO_LOCALE_NAME.jpn} ${S.rows.language}`)
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

  it('service: a service whose key the endpoint refused says so, as the popup\'s menu does, and follows the record while the menu is open (the redesign\'s design, §5.2; the controller\'s ruling 22)', async () => {
    fakeBrowser.reset()
    const mine: Service = { id: 'svc-abcd1234', kind: 'openai-compat', name: 'My model', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'test', model: 'vendor/model', thinking: 'disabled' }
    await markRejected(mine.id)
    const { container, flush } = await openMenu(ServiceMenu, { settings: { ...DEFAULT_CONFIG, services: [mine] } })
    const row = () => [...container.querySelectorAll<HTMLElement>('[role="option"]')].find(o => o.textContent?.includes(mine.name))!
    const settled = async (ready: () => boolean) => { for (let i = 0; i < 20 && !ready(); i++) await flush() }
    await settled(() => row().textContent!.includes(S.service.llm_rejected))
    expect(row().textContent).toContain(S.service.llm_rejected)
    // the record's change reaches the menu through a state update: inside act, as a test's updates are
    await act(async () => { await clearRejected(mine.id) })
    await settled(() => row().textContent!.includes(mine.model))
    expect([row().textContent!.includes(mine.model), row().textContent!.includes(S.service.llm_rejected)]).toEqual([true, false])
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
