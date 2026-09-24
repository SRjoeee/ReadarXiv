import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
    expect(region.textContent).toContain('正在翻译')
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
