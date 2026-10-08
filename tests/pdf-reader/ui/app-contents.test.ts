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

describe('the page\'s landmarks', () => {
  it('the toolbar is the banner, the contents a complementary region, and the document area the main one, both panes in it (#299, Part 6\'s accessibility audit)', async () => {
    const { controller } = fakeController()
    const m = await mountElement(createElement(App, { controller, embedded: true }))
    const main = m.container.querySelectorAll('main')
    expect(main.length).toBe(1)
    expect([...main[0]!.querySelectorAll('.pane')].map(p => (p as HTMLElement).dataset.side)).toEqual(['left', 'right'])
    expect(main[0]!.classList.contains('doc')).toBe(true)
    expect([m.container.querySelector(':scope > header')?.tagName, m.container.querySelector('aside#axt-contents')?.tagName]).toEqual(['HEADER', 'ASIDE'])
  })
})

describe('an address with no paper (D1)', () => {
  it('the card stands in the document area, not in a pane the display may hide; a failure\'s card stays in the translation\'s pane', async () => {
    const missing = fakeController({ phase: 'ready', noPaper: true, available: false, display: 'original' })
    const m = await mountElement(createElement(App, { controller: missing.controller, embedded: false }))
    const card = m.container.querySelector('.card')!
    expect([card.parentElement?.tagName, card.closest('.pane'), m.container.querySelector('.pane[data-card]')]).toEqual(['MAIN', null, null])
    await m.unmount()
    const failed = fakeController({ phase: 'failed', failure: 'network', display: 'bilingual' })
    const f = await mountElement(createElement(App, { controller: failed.controller, embedded: false }))
    expect(f.container.querySelector('.card')!.closest('.pane')?.getAttribute('data-side')).toBe('right')
    expect(f.container.querySelector('.pane[data-card]')).not.toBeNull()
  })
})

describe('an address with no paper: what the keyboard reaches (Codex on #329)', () => {
  /** every control a pane draws for the pager: the page pill's arrows and field, the scroll indicator */
  const pagers = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.pane .pill button, .pane .pill input, .pane .indicator')]
  const inert = (el: Element) => el.closest('[inert]') !== null

  it('the panes are inert, so that no invisible pager (a "1 / 0" with arrows that do nothing) stands in the Tab order before the card\'s link; the link itself is not', async () => {
    const missing = fakeController({ phase: 'ready', noPaper: true, available: false, display: 'original' })
    const m = await mountElement(createElement(App, { controller: missing.controller, embedded: false }))
    const found = pagers(m.container)
    // a pill's three controls and an indicator, in each of the two panes: all of them there, none of them reachable
    expect(found.length).toBe(8)
    expect(found.filter(el => !inert(el))).toEqual([])
    expect([...m.container.querySelectorAll('.pane')].map(p => p.hasAttribute('inert'))).toEqual([true, true])
    const link = m.container.querySelector('main .card a')!
    expect([inert(link), link.closest('header, aside')]).toEqual([false, null])
    await m.unmount()
  })

  it('a paper named leaves its panes as they were: reachable', async () => {
    const named = fakeController({ phase: 'ready' })
    const m = await mountElement(createElement(App, { controller: named.controller, embedded: false }))
    expect([...m.container.querySelectorAll('.pane')].map(p => p.hasAttribute('inert'))).toEqual([false, false])
    expect(pagers(m.container).filter(inert)).toEqual([])
    await m.unmount()
  })
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
