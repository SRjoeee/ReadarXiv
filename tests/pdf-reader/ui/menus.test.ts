import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import { fileName } from '@/pdf-reader/controller'
import { DownloadMenu, LanguageMenu, ZoomMenu } from '@/pdf-reader/ui/Menus'
import { setLocale } from '@/ui/strings'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'
import { stubPopovers } from './popover-stub'

let restore = () => {}
// the interface's words as the maintainer reads them: the controls are found by them
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

async function openMenu(component: typeof ZoomMenu, over = {}) {
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

  it('download: the translation greyed until the final is on screen', async () => {
    const { container, controller } = await openMenu(DownloadMenu, { finalReady: false })
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
