import { act, createElement } from 'react'
import { DEFAULT_CONFIG } from '@/config/schema'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { Toolbar } from '@/pdf-reader/ui/Toolbar'
import { R, S, setLocale } from '@/ui/strings'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'
import { stubPopovers } from './popover-stub'

let restore = () => {}
// the interface's words as the maintainer reads them: the controls are found by them
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => { restore = stubPopovers(); fakeBrowser.reset() })
afterEach(() => { restore(); document.body.innerHTML = '' })

let onContents = () => {}
const mount = (over = {}, embedded = true) => {
  const fake = fakeController(over)
  return mountElement(createElement(Toolbar, { controller: fake.controller, embedded, contents: false, onContents })).then(m => ({ ...m, ...fake }))
}
const button = (c: HTMLElement, name: string) => c.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!
/** a control's accessible name, as far as these controls need: the elements it is labelled by, else its aria-label */
const nameOf = (el: Element) => el.getAttribute('aria-labelledby')?.split(' ').map(id => document.getElementById(id)?.textContent).join(' ') ?? el.getAttribute('aria-label')
/** the button whose name holds these words */
const named = (c: HTMLElement, words: string) => [...c.querySelectorAll<HTMLElement>('button')].find(b => nameOf(b)?.includes(words))!

describe('the toolbar (the reader\'s design, §6.1)', () => {
  it('shows the title, and the id as a link to the abstract page in a new tab', async () => {
    const { container } = await mount({ paper: { id: 'hep-th/9711200', title: 'Large N' } })
    expect(container.querySelector('[data-title]')!.textContent).toBe('Large N')
    const link = container.querySelector<HTMLAnchorElement>('a[data-arxiv]')!
    expect([link.textContent, link.href, link.target]).toEqual(['arXiv:hep-th/9711200', 'https://arxiv.org/abs/hep-th/9711200', '_blank'])
  })

  it('the title is the page\'s heading, whole at every width (it is hidden to the eye below the lead\'s 320 px, not removed), and the id\'s link says what it does (P3-M12, P6)', async () => {
    const { container, set } = await mount({ paper: { id: '2608.02163', title: 'From Simple QA to Deep Research' } })
    const heads = [...container.querySelectorAll('h1')]
    expect([heads.length, heads[0]?.textContent, heads[0]?.hasAttribute('data-title'), heads[0]?.closest('header') !== null]).toEqual([1, 'From Simple QA to Deep Research', true, true])
    // the link\'s name starts with what is seen (WCAG 2.5.3) and ends with its purpose, which the tooltip alone told
    const link = container.querySelector<HTMLElement>('a[data-arxiv]')!
    expect(nameOf(link)).toBe(`arXiv:2608.02163 ${R.abstract}`)
    expect(container.querySelector('a[data-arxiv] ~ .tip')?.getAttribute('aria-hidden')).toBe('true')
    // no title known yet: the heading is the product\'s name, said and not drawn, as the tab says it
    await act(async () => set({ paper: { id: '2608.02163', title: '' } }))
    const bare = [...container.querySelectorAll('h1')]
    expect([bare.length, bare[0]?.textContent, bare[0]?.hasAttribute('data-title'), bare[0]?.classList.contains('sr-only')]).toEqual([1, 'Read arXiv', false, true])
  })

  it('shows the id alone when no title is known (none in the PDF, the abstract page out of reach)', async () => {
    const { container } = await mount({ paper: { id: '2608.02163', title: '' } })
    expect(container.querySelector('[data-title]')).toBeNull()
    expect(container.querySelector('a[data-arxiv]')!.textContent).toBe('arXiv:2608.02163')
  })

  it('passes the display chosen, and sync and swap, which act side by side only', async () => {
    const { container, controller, set } = await mount()
    button(container, '译文').click()
    expect(controller.setDisplay).toHaveBeenCalledWith('translation')
    button(container, '同步滚动').click()
    expect(controller.setSync).toHaveBeenCalledWith(false)
    button(container, '交换左右').click()
    expect(controller.patchSettings).toHaveBeenCalledOnce()
    await act(async () => set({ display: 'translation' }))
    expect([button(container, '同步滚动').getAttribute('aria-disabled'), button(container, '交换左右').getAttribute('aria-disabled')]).toEqual(['true', 'true'])
  })

  it('zooms by a tenth each way, and shows the scale', async () => {
    const { container, controller } = await mount({ scale: 1.25 })
    expect(named(container, '缩放比例').querySelector('[data-value]')!.textContent).toBe('125%')
    button(container, '放大').click()
    button(container, '缩小').click()
    expect(controller.zoomBy.mock.calls).toEqual([[1.1], [1 / 1.1]])
  })

  it('holds the zoom\'s value in the width of its widest, so that 99 % → 100 % shifts nothing; the widest is hidden, and out of its name (better-typography)', async () => {
    const { container } = await mount({ scale: 0.83 })
    const zoom = named(container, '缩放比例')
    const widest = zoom.querySelector('[data-widest]')!
    expect([widest.textContent, widest.getAttribute('aria-hidden'), nameOf(zoom)]).toEqual(['000%', 'true', '83% 缩放比例'])
  })

  it('opens the contents from its lead', async () => {
    let opened = 0
    onContents = () => { opened++ }
    const { container } = await mount()
    button(container, '目录').click()
    expect(opened).toBe(1)
    onContents = () => {}
  })

  it('is the page\'s banner, which needs no name, not a toolbar whose arrow keys it does not have (the interface review)', async () => {
    const { container } = await mount()
    const header = container.querySelector('header')!
    expect([header.getAttribute('role'), header.hasAttribute('aria-label')]).toEqual([null, false])
  })

  it('names the zoom, language and service buttons by what they show, first, and their words, from what is on the page (WCAG 2.5.3; the interface review)', async () => {
    const { container } = await mount({ scale: 1.25 })
    const names = ['缩放比例', '目标语言', '翻译服务'].map(w => named(container, w))
    expect(names.map(nameOf)).toEqual(['125% 缩放比例', '简体中文 目标语言', 'Microsoft 翻译 翻译服务'])
    // labelled by the text the button shows, not an aria-label drawn apart from it (better-accessibility)
    expect(names.map(b => b.hasAttribute('aria-label'))).toEqual([false, false, false])
    // the whole value in the tooltip too, where a long name is cut short on the bar
    expect(named(container, '翻译服务').nextElementSibling!.textContent).toBe('翻译服务Microsoft 翻译')
  })

  it('opens the settings as a link, which a middle click or ⌘-click opens as well (the interface review)', async () => {
    const { container } = await mount()
    const link = container.querySelector<HTMLAnchorElement>('a[aria-label="设置"]')!
    expect([link.getAttribute('href')?.endsWith('/options.html#reading/pdf'), link.target, link.rel]).toEqual([true, '_blank', 'noopener'])
  })

  it('says whether the contents are open, and which region they are, as a disclosure does (the interface review)', async () => {
    const { container } = await mount()
    const toggle = button(container, '目录')
    expect([toggle.getAttribute('aria-expanded'), toggle.getAttribute('aria-controls'), toggle.hasAttribute('aria-pressed')]).toEqual(['false', 'axt-contents', false])
  })

  it('tells assistive technology the zoom\'s shortcuts, which its tooltips alone showed (the interface review)', async () => {
    const { container } = await mount()
    expect(button(container, '缩小').getAttribute('aria-keyshortcuts')).toMatch(/^(Meta|Control)\+-$/)
    expect(button(container, '放大').getAttribute('aria-keyshortcuts')).toMatch(/^(Meta|Control)\+=$/)
  })

  describe('the controls that need the settings (P3-M14, P3-M16, C3-2; S-R-21)', () => {
    /** the tooltip of a button: its sibling popover, which the tip is */
    const tipOf = (b: Element) => b.nextElementSibling?.matches('.tip') ? b.nextElementSibling.textContent : null
    const needing = (c: HTMLElement) => [named(c, S.rows.language), named(c, S.rows.service), button(c, R.swap)]

    it('before the settings land, the language and service menus stand in their places, greyed and opening nothing, so that the bar does not reflow as they come; no reason is told yet', async () => {
      const { container, set } = await mount({ settings: null })
      for (const b of needing(container)) expect([b.getAttribute('aria-disabled'), b.hasAttribute('popovertarget')]).toEqual(['true', false])
      // the reading options\' button holds its place too, and opens: the narrow window\'s download and way back are in it
      expect(button(container, R.options.name).hasAttribute('popovertarget')).toBe(true)
      expect(needing(container).map(tipOf)).toEqual([`${S.rows.language}\u7b80\u4f53\u4e2d\u6587`, `${S.rows.service}Microsoft \u7ffb\u8bd1`, R.swap])
      // they come: the same buttons are in reach, with the reader\'s own values
      await act(async () => set({ settings: { ...DEFAULT_CONFIG, targetLanguage: 'jpn' } }))
      expect(nameOf(named(container, S.rows.language))).toBe(`\u65e5\u672c\u8a9e ${S.rows.language}`)
      for (const b of needing(container).slice(0, 2)) expect([b.hasAttribute('aria-disabled'), b.hasAttribute('popovertarget')]).toEqual([false, true])
    })

    it('settings that cannot be read grey them with the reason in their tooltips; the display, sync, zoom and the way out still work', async () => {
      const { container, controller } = await mount({ settingsUnreadable: true })
      for (const b of needing(container)) expect(b.getAttribute('aria-disabled'), nameOf(b) ?? '').toBe('true')
      expect(needing(container).map(tipOf)).toEqual([S.rows.language, S.rows.service, R.swap].map(words => `${words}${R.status.unreadableHint}`))
      // the tooltip is hidden from assistive technology, so the reason is its description too
      expect(needing(container).map(b => b.getAttribute('aria-description'))).toEqual([R.status.unreadableHint, R.status.unreadableHint, R.status.unreadableHint])
      button(container, R.swap).click()
      expect(controller.patchSettings).not.toHaveBeenCalled()
      button(container, R.display.translation).click()
      button(container, R.sync).click()
      button(container, R.zoom.in).click()
      expect([controller.setDisplay.mock.calls.length, controller.setSync.mock.calls.length, controller.zoomBy.mock.calls.length]).toEqual([1, 1, 1])
      // the settings page is the way to mend them
      expect(container.querySelector(`a[aria-label="${S.settings}"]`)!.hasAttribute('aria-disabled')).toBe(false)
    })

    it('swap is greyed for the display it does not act in with no reason told: the reason is the settings\' only where they are it', async () => {
      const { container } = await mount({ settingsUnreadable: true, display: 'translation' })
      expect(tipOf(button(container, R.swap))).toBe(R.swap)
    })
  })

  it('offers the way back only over arXiv\'s page', async () => {
    const over = await mount({}, true)
    expect(button(over.container, '在默认查看器中打开')).toBeTruthy()
    await over.unmount()
    const alone = await mount({}, false)
    expect(alone.container.querySelector('button[aria-label="在默认查看器中打开"]')).toBeNull()
  })
})
