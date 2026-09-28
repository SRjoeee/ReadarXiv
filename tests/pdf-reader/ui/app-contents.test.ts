// The reader's page (src/entrypoints/pdf-reader/App.tsx): the document area slides with the contents sidebar when the
// reader opens or closes it, and never as the page mounts — under StrictMode too, whose second run of a layout effect
// spent a first-run guard and slid the area 236 px in on every development build (Part 7's final review)
import { StrictMode, act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { App } from '@/entrypoints/pdf-reader/App'
import { setLocale } from '@/ui/strings'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'
import { stubPopovers } from './popover-stub'

let restore = () => {}
const animate = vi.fn()
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => {
  restore = stubPopovers()
  fakeBrowser.reset()
  // the probes' hook the page fills once a session attaches; happy-dom draws no animation, so each is recorded
  ;(window as unknown as { __reader: object }).__reader = {}
  animate.mockClear()
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, writable: true, value: animate })
})
afterEach(() => {
  restore()
  delete (HTMLElement.prototype as { animate?: unknown }).animate
  document.documentElement.removeAttribute('data-axt-contents')
  document.body.innerHTML = ''
})

describe('the contents\' slide (the reader\'s design, §5)', () => {
  it('under StrictMode, nothing slides as the page mounts; each press of the contents slides the document area once', async () => {
    const { controller } = fakeController()
    const m = await mountElement(createElement(StrictMode, null, createElement(App, { controller, embedded: true })))
    expect(animate).not.toHaveBeenCalled()
    const toggle = m.container.querySelector<HTMLButtonElement>('button[aria-controls="axt-contents"]')!
    await act(async () => { toggle.click() })
    expect([animate.mock.calls.length, document.documentElement.hasAttribute('data-axt-contents')]).toEqual([1, true])
    await act(async () => { toggle.click() })
    expect([animate.mock.calls.length, document.documentElement.hasAttribute('data-axt-contents')]).toEqual([2, false])
    await m.unmount()
  })
})
