import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { Toolbar } from '@/pdf-reader/ui/Toolbar'
import { setLocale } from '@/ui/strings'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'
import { stubPopovers } from './popover-stub'

let restore = () => {}
// the interface's words as the maintainer reads them: the controls are found by them
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => { restore = stubPopovers(); fakeBrowser.reset() })
afterEach(() => { restore(); document.body.innerHTML = '' })

const mount = (over = {}, embedded = true) => {
  const fake = fakeController(over)
  return mountElement(createElement(Toolbar, { controller: fake.controller, embedded })).then(m => ({ ...m, ...fake }))
}
const button = (c: HTMLElement, name: string) => c.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!

describe('the toolbar (the reader\'s design, §6.1)', () => {
  it('shows the title, and the id as a link to the abstract page in a new tab', async () => {
    const { container } = await mount({ paper: { id: 'hep-th/9711200', title: 'Large N' } })
    expect(container.querySelector('[data-title]')!.textContent).toBe('Large N')
    const link = container.querySelector<HTMLAnchorElement>('a[data-arxiv]')!
    expect([link.textContent, link.href, link.target]).toEqual(['arXiv:hep-th/9711200', 'https://arxiv.org/abs/hep-th/9711200', '_blank'])
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
    expect(container.querySelector('button[aria-label="缩放比例"] [data-zoom-value]')!.textContent).toBe('125%')
    button(container, '放大').click()
    button(container, '缩小').click()
    expect(controller.zoomBy.mock.calls).toEqual([[1.1], [1 / 1.1]])
  })

  it('offers the way back only over arXiv\'s page', async () => {
    const over = await mount({}, true)
    expect(button(over.container, '在默认查看器中打开')).toBeTruthy()
    await over.unmount()
    const alone = await mount({}, false)
    expect(alone.container.querySelector('button[aria-label="在默认查看器中打开"]')).toBeNull()
  })
})
