import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PagePill } from '@/pdf-reader/ui/PagePill'
import { thumbSize } from '@/pdf-reader/ui/ScrollIndicator'
import { setLocale } from '@/ui/strings'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'
import { stubPopovers } from './popover-stub'

let restore = () => {}
// the interface's words as the maintainer reads them: the controls are found by them
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => { restore = stubPopovers() })
afterEach(() => { restore(); document.body.innerHTML = '' })

describe('a pane\'s page pill (the reader\'s design, §6.4)', () => {
  async function mount() {
    const fake = fakeController({ sides: { left: { page: 3, pages: 25 }, right: { page: 4, pages: 26 } } })
    const m = await mountElement(createElement(PagePill, { controller: fake.controller, side: 'right' }))
    return { ...m, ...fake }
  }

  it('shows the side\'s page and its count, named for its side', async () => {
    const { container } = await mount()
    const input = container.querySelector('input')!
    expect([input.value, input.getAttribute('aria-label'), container.textContent]).toEqual(['4', '译文页码', '/ 26'])
  })

  it('goes to a page typed and entered, not to one out of range; the arrows step a page', async () => {
    const { container, controller } = await mount()
    const input = container.querySelector('input')!
    const type = (v: string) => act(async () => { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })) })
    await type('12')
    await type('40')
    const [prev, next] = [...container.querySelectorAll<HTMLButtonElement>('button')]
    prev!.click()
    next!.click()
    expect(controller.goToPage.mock.calls).toEqual([['right', 12], ['right', 3], ['right', 5]])
  })
})

describe('a scroll indicator\'s thumb (§6.5)', () => {
  it('is the visible share of the track, at least 32 px', () => {
    expect(thumbSize(800, 800, 8000)).toBe(80)
    expect(thumbSize(800, 800, 80000)).toBe(32)
    expect(thumbSize(800, 800, 800)).toBe(800)
  })
})
