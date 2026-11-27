// A pane's page pill (PagePill.tsx, PDF-READER §6.4): a page typed and Enter is one of the reader's jumps (its way back, the
// capsule), the arrows turn a page as a scroll does and are none (the design's §3.7)
import { createElement } from 'react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { R, setLocale } from '@readarxiv/ui'
import { PagePill } from '../../src/chrome/PagePill.tsx'
import { mountElement } from '../render-hook.ts'
import { fakeController } from './fake-controller.ts'
import { withParts } from './parts.ts'

beforeAll(() => setLocale('zh-CN'))
afterEach(() => {
  document.body.innerHTML = ''
})

const mount = () => {
  const fake = fakeController({ sides: { left: { page: 2, pages: 9 }, right: { page: 2, pages: 9 } } })
  return mountElement(withParts(createElement(PagePill, { controller: fake.controller, side: 'left' }))).then((m) => ({
    ...m,
    ...fake,
  }))
}

describe('the page pill', () => {
  it('a page typed and Enter is a jump', async () => {
    const m = await mount()
    const input = m.container.querySelector('input') as HTMLInputElement
    input.value = '7'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(m.controller.goToPage.mock.calls).toEqual([['left', 7, { jump: true }]])
  })

  it('the arrows are no jump', async () => {
    const m = await mount()
    m.container.querySelector<HTMLButtonElement>(`button[aria-label="${R.pill.next}"]`)?.click()
    m.container.querySelector<HTMLButtonElement>(`button[aria-label="${R.pill.previous}"]`)?.click()
    expect(m.controller.goToPage.mock.calls).toEqual([
      ['left', 3],
      ['left', 1],
    ])
  })
})
