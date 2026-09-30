import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from '@/config/schema'
import { FailureCard } from '@/pdf-reader/ui/FailureCard'
import { StatusCapsule } from '@/pdf-reader/ui/StatusCapsule'
import { setLocale } from '@/ui/strings'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'
import { stubPopovers } from './popover-stub'

let restore = () => {}
// the interface's words as the maintainer reads them: the controls are found by them
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

describe('the capsule and the card (the reader\'s design, §6.6)', () => {
  it('the capsule is a status region from the first paint, its words changing in it', async () => {
    const fake = fakeController({ phase: 'ready' })
    const { container } = await mountElement(createElement(StatusCapsule, { controller: fake.controller, onChooseLanguage: () => {} }))
    const region = container.querySelector('[role="status"]')!
    expect(region.textContent).toBe('')
    await act(async () => fake.set({ phase: 'translating', progress: 0.5 }))
    // said, not shown: the line under the toolbar shows a translation under way (the maintainer, 2026-09-25)
    expect([region.textContent, container.querySelector('.capsule')]).toEqual(['正在翻译', null])
  })

  it('the card\'s reason is said in the status region, as the card takes no focus (the final review)', async () => {
    const fake = fakeController({ phase: 'loading' })
    const { container } = await mountElement(createElement(StatusCapsule, { controller: fake.controller, onChooseLanguage: () => {} }))
    const region = container.querySelector('[role="status"]')!
    await act(async () => fake.set({ phase: 'failed', failure: 'no-key' }))
    expect(region.textContent).toContain('尚未配置 API Key')
  })

  it('a notice\'s 重试 retries, and its close is remembered for the visit', async () => {
    const fake = fakeController({ phase: 'ready', failedUnits: 2 })
    const { container } = await mountElement(createElement(StatusCapsule, { controller: fake.controller, onChooseLanguage: () => {} }))
    container.querySelector<HTMLElement>('button[data-action]')!.click()
    expect(fake.controller.retry).toHaveBeenCalledOnce()
    await act(async () => container.querySelector<HTMLElement>('button[aria-label="关闭"]')!.click())
    await act(async () => fake.set({ failedUnits: 3 }))
    // past the closed notice's 160 ms way out
    await act(async () => { await new Promise(r => setTimeout(r, 220)) })
    expect(container.querySelector('[role="status"]')!.textContent).not.toContain('翻译失败')
  })

  it('a paper that cannot be had: the sentence, and its HTML version a link opened where the settings say; no close (the maintainer, 2026-09-26)', async () => {
    const href = 'https://arxiv.org/html/2608.02163#readarxiv'
    const fake = fakeController({ phase: 'ready', available: false, htmlVersion: href })
    const { container } = await mountElement(createElement(StatusCapsule, { controller: fake.controller, onChooseLanguage: () => {} }))
    const link = () => container.querySelector<HTMLAnchorElement>('.capsule a[data-action]')
    expect([container.querySelector('.capsule .words')?.textContent, link()?.textContent, link()?.getAttribute('href'), link()?.target, link()?.rel]).toEqual(['这篇论文暂不支持 PDF 翻译', '改用 HTML 翻译', href, '_blank', 'noopener'])
    expect(container.querySelector('.capsule .close')).toBeNull()
    expect(container.querySelector('.capsule')!.hasAttribute('data-alone')).toBe(false)
    // this tab: the reader's own, or the PDF page it lies over
    await act(async () => fake.set({ settings: { ...DEFAULT_CONFIG, reading: { ...DEFAULT_CONFIG.reading, openIn: 'same-tab' } } }))
    expect(link()?.target).toBe('_top')
    await act(async () => fake.set({ htmlVersion: null }))
    expect([container.querySelector('.capsule .words')?.textContent, link()]).toEqual(['这篇论文暂不支持 PDF 翻译', null])
    // words alone: the capsule's end padded as the start is, with no chip there to fill it (reader.css)
    expect(container.querySelector('.capsule')!.hasAttribute('data-alone')).toBe(true)
  })

  it('the card says the reason and offers what can be done, never taking the focus', async () => {
    const fake = fakeController({ phase: 'failed', failure: 'network' })
    const before = document.activeElement
    const { container } = await mountElement(createElement(FailureCard, { controller: fake.controller }))
    expect(container.textContent).toContain('网络连接失败')
    container.querySelector<HTMLElement>('button')!.click()
    expect(fake.controller.retry).toHaveBeenCalledOnce()
    expect(document.activeElement).toBe(before)
  })
})
