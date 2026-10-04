import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '@/config/schema'
import { FailureCard } from '@/pdf-reader/ui/FailureCard'
import { StatusCapsule } from '@/pdf-reader/ui/StatusCapsule'
import { R, S, setLocale } from '@/ui/strings'
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
    const fake = fakeController({ phase: 'ready', failedUnits: 2, failure: 'network' })
    const { container } = await mountElement(createElement(StatusCapsule, { controller: fake.controller, onChooseLanguage: () => {} }))
    container.querySelector<HTMLElement>('button[data-action]')!.click()
    expect(fake.controller.retry).toHaveBeenCalledOnce()
    await act(async () => container.querySelector<HTMLElement>('button[aria-label="关闭"]')!.click())
    await act(async () => fake.set({ failedUnits: 3 }))
    // past the closed notice's 160 ms way out
    await act(async () => { await new Promise(r => setTimeout(r, 220)) })
    expect(container.querySelector('[role="status"]')!.textContent).not.toContain('翻译失败')
  })

  it('a notice of passages no retry can mend has no retry, and closes (I-5 of 2026-10-04)', async () => {
    const fake = fakeController({ phase: 'ready', failedUnits: 1, failure: null })
    const { container } = await mountElement(createElement(StatusCapsule, { controller: fake.controller, onChooseLanguage: () => {} }))
    const capsule = container.querySelector('.capsule[data-kind="notice"]')!
    expect(capsule.textContent).toContain(S.failed.text(1))
    expect([capsule.querySelector('[data-action]'), capsule.textContent?.includes(S.failed.retry)]).toEqual([null, false])
    await act(async () => capsule.querySelector<HTMLElement>(`button[aria-label="${R.status.close}"]`)!.click())
    await act(async () => { await new Promise(r => setTimeout(r, 220)) })
    expect(container.querySelector('.capsule')).toBeNull()
  })

  it('a translation shown in part: its words, S-R-18\'s link to the HTML version, and a close that keeps it closed (S-R-19)', async () => {
    const fake = fakeController({ phase: 'ready', partial: true, htmlVersion: 'https://arxiv.org/html/x#readarxiv' })
    const { container } = await mountElement(createElement(StatusCapsule, { controller: fake.controller, onChooseLanguage: () => {} }))
    const capsule = container.querySelector('.capsule[data-kind="partial"]')!
    expect(capsule.textContent).toContain(R.status.partial)
    expect(capsule.querySelector('a[data-action]')?.getAttribute('href')).toBe('https://arxiv.org/html/x#readarxiv')
    expect(capsule.querySelector('a[data-action]')?.textContent).toBe(R.status.useHtml)
    await act(async () => capsule.querySelector<HTMLElement>(`button[aria-label="${R.status.close}"]`)!.click())
    await act(async () => { await new Promise(r => setTimeout(r, 220)) })
    expect(container.querySelector('.capsule')).toBeNull()
  })

  describe('the narrow window\'s words: 5 s of being read, waiting while the pointer is over them or they hold the focus (the maintainer, 2026-10-01)', () => {
    afterEach(() => { vi.useRealTimers() })
    /** the capsule mounted reading, the clock faked, then the window made narrow */
    async function narrow() {
      const fake = fakeController({ phase: 'ready', display: 'bilingual' })
      const { container } = await mountElement(createElement(StatusCapsule, { controller: fake.controller, onChooseLanguage: () => {} }))
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
      await act(async () => fake.set({ narrow: true }))
      const capsule = () => container.querySelector<HTMLElement>('.capsule[data-kind="narrow"]:not([data-out])')
      const wait = (ms: number) => act(async () => { vi.advanceTimersByTime(ms) })
      // React reads enter and leave off over and out, and focus and blur off focusin and focusout
      const fire = (type: string) => act(async () => { capsule()!.dispatchEvent(new MouseEvent(type, { bubbles: true, relatedTarget: document.body })) })
      const focus = (type: 'focusin' | 'focusout') => act(async () => { capsule()!.dispatchEvent(new FocusEvent(type, { bubbles: true, relatedTarget: null })) })
      return { capsule, wait, fire, focus }
    }

    it('leaves after 5 s', async () => {
      const { capsule, wait } = await narrow()
      expect(capsule()?.textContent).toBe(R.status.narrow)
      await wait(4999)
      expect(capsule()).not.toBeNull()
      await wait(1)
      expect(capsule()).toBeNull()
    })

    it('waits while the pointer is over it, and runs out the rest once the pointer leaves', async () => {
      const { capsule, wait, fire } = await narrow()
      await wait(3000)
      await fire('pointerover')
      await wait(10000)
      expect(capsule()).not.toBeNull()
      await fire('pointerout')
      await wait(1999)
      expect(capsule()).not.toBeNull()
      await wait(1)
      expect(capsule()).toBeNull()
    })

    it('is reached by Tab while it is shown, named by its words, and a keyboard\'s focus holds it as the pointer does (Codex and Devin on #307)', async () => {
      const { capsule, wait } = await narrow()
      const el = capsule()!
      // in the tab order, as a group its words name; no other capsule is a stop of its own (theirs are their actions)
      expect([el.tabIndex, el.getAttribute('role'), document.getElementById(el.getAttribute('aria-labelledby') ?? '')?.textContent]).toEqual([0, 'group', R.status.narrow])
      await wait(3000)
      await act(async () => { el.focus() })
      expect(document.activeElement).toBe(el)
      await wait(10000)
      expect(capsule()).not.toBeNull()
      await act(async () => { el.blur() })
      await wait(1999)
      expect(capsule()).not.toBeNull()
      await wait(1)
      expect(capsule()).toBeNull()
      // on its way out it is no stop
      const out = document.querySelector('.capsule[data-kind="narrow"][data-out]')
      expect([out !== null, out?.hasAttribute('tabindex')]).toEqual([true, false])
    })

    it('waits while it holds the focus, and runs out the rest once the focus goes', async () => {
      const { capsule, wait, focus } = await narrow()
      await wait(3000)
      await focus('focusin')
      await wait(10000)
      expect(capsule()).not.toBeNull()
      await focus('focusout')
      await wait(1999)
      expect(capsule()).not.toBeNull()
      await wait(1)
      expect(capsule()).toBeNull()
    })
  })

  it('a paper that cannot be had: the sentence, and its HTML version a link opened where the settings say; no close (the maintainer, 2026-09-26)', async () => {
    const href = 'https://arxiv.org/html/2608.02163#readarxiv'
    const fake = fakeController({ phase: 'ready', available: false, htmlVersion: href })
    const { container } = await mountElement(createElement(StatusCapsule, { controller: fake.controller, onChooseLanguage: () => {} }))
    const link = () => container.querySelector<HTMLAnchorElement>('.capsule a[data-action]')
    expect([container.querySelector('.capsule .words')?.textContent, link()?.textContent, link()?.getAttribute('href'), link()?.target, link()?.rel]).toEqual(['这篇论文暂不支持 PDF 翻译', '改用 HTML 翻译', href, '_blank', 'noopener'])
    expect(container.querySelector('.capsule .close')).toBeNull()
    expect(container.querySelector('.capsule')!.hasAttribute('data-alone')).toBe(false)
    // reached by its link, not a stop of its own: only the capsule that leaves by itself is one
    expect(container.querySelector('.capsule')!.hasAttribute('tabindex')).toBe(false)
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
