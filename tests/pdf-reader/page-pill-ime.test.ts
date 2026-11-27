// The website's page pill (src/pdf-reader/ui/PagePill.tsx, kept for readarxiv-web until its cut-over): Enter in the page field is
// ignored while an input method composes (KeyboardEvent.isComposing, or the keyCode 229 a browser gives a key the IME takes): a
// Japanese IME confirming full-width digits with Enter went to the page and reset the field (the Modern Web Guidance audit of
// 2026-11-27). The packages' pill holds the same rule (packages/reader/tests/chrome/page-pill.test.ts)
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReaderController } from '@/pdf-reader/controller'
import { PagePill } from '@/pdf-reader/ui/PagePill'
import { mountElement } from '../ui/render-hook'

afterEach(() => {
  document.body.innerHTML = ''
})

const mount = async () => {
  const state = { sides: { left: { page: 2, pages: 9 }, right: { page: 2, pages: 9 } } }
  const goToPage = vi.fn()
  const controller = { getState: () => state, subscribe: () => () => {}, goToPage } as unknown as ReaderController
  const m = await mountElement(createElement(PagePill, { controller, side: 'left' }))
  return { ...m, goToPage }
}

describe("the website's page pill under an input method", () => {
  it('Enter goes to the page typed', async () => {
    const m = await mount()
    const input = m.container.querySelector('input') as HTMLInputElement
    input.value = '7'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(m.goToPage.mock.calls).toEqual([['left', 7]])
  })
  it('Enter while an input method composes goes nowhere and leaves the field as typed', async () => {
    const m = await mount()
    const input = m.container.querySelector('input') as HTMLInputElement
    // (the IME's text in the field, as typed: the field holds it as a draft)
    input.value = '7'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true }))
    expect(m.goToPage.mock.calls).toEqual([])
    expect(input.value).toBe('7')
  })
})
