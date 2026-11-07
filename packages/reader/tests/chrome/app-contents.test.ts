// The reader's page (the chrome's App.tsx): the document area slides with the contents sidebar when the
// reader opens or closes it, and never as the page mounts — under StrictMode too, whose second run of a layout effect
// spent a first-run guard and slid the area 236 px in on every development build (Part 7's final review)
import { StrictMode, act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { LOCALES, setLocale } from '@readarxiv/ui'
import { App } from '../../src/chrome/App.tsx'
import type { Parts } from '../../src/chrome/parts.tsx'
import { stubPopovers } from '../popover-stub.ts'
import { mountElement } from '../render-hook.ts'
import { fakeController } from './fake-controller.ts'
import { TEST_PARTS } from './parts.ts'

const app = (controller: ReturnType<typeof fakeController>['controller'], over: Partial<Parts> = {}) =>
  createElement(App, { controller, parts: { ...TEST_PARTS, ...over } })

let restore = () => {}
const animate = vi.fn()
beforeAll(() => setLocale('zh-CN'))
beforeEach(() => {
  restore = stubPopovers()
  // happy-dom draws no animation, so each is recorded
  animate.mockClear()
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, writable: true, value: animate })
})
afterEach(() => {
  restore()
  delete (HTMLElement.prototype as { animate?: unknown }).animate
  document.documentElement.removeAttribute('data-axt-contents')
  document.body.innerHTML = ''
})

describe("the host's probe (parts.tsx probe: the extension's window.__reader)", () => {
  it('is handed the controller and the session once the panes are drawn and the session is open, once', async () => {
    const { controller } = fakeController()
    const probe = vi.fn()
    const m = await mountElement(app(controller, { probe }))
    const session = await controller.attach.mock.results[0]!.value
    expect(controller.attach).toHaveBeenCalledWith({ left: expect.any(HTMLElement), right: expect.any(HTMLElement) })
    expect(probe.mock.calls).toEqual([[controller, session]])
    await m.unmount()
  })
})

describe("the page's landmarks", () => {
  it("the toolbar is the banner, the contents a complementary region, and the document area the main one, both panes in it (#299, Part 6's accessibility audit)", async () => {
    const { controller } = fakeController()
    const m = await mountElement(app(controller))
    const main = m.container.querySelectorAll('main')
    expect(main.length).toBe(1)
    expect([...main[0]!.querySelectorAll('.pane')].map((p) => (p as HTMLElement).dataset.side)).toEqual([
      'left',
      'right',
    ])
    expect(main[0]!.classList.contains('doc')).toBe(true)
    expect([
      m.container.querySelector(':scope > header')?.tagName,
      m.container.querySelector('aside#axt-contents')?.tagName,
    ]).toEqual(['HEADER', 'ASIDE'])
  })
})

describe('an address with no paper (D1)', () => {
  it("the card stands in the document area, not in a pane the display may hide; a failure's card stays in the translation's pane", async () => {
    const missing = fakeController({ phase: 'ready', noPaper: true, available: false, display: 'original' })
    const m = await mountElement(app(missing.controller))
    const card = m.container.querySelector('.card')!
    expect([card.parentElement?.tagName, card.closest('.pane'), m.container.querySelector('.pane[data-card]')]).toEqual(
      ['MAIN', null, null],
    )
    await m.unmount()
    const failed = fakeController({ phase: 'failed', failure: 'network', display: 'bilingual' })
    const f = await mountElement(app(failed.controller))
    expect(f.container.querySelector('.card')!.closest('.pane')?.getAttribute('data-side')).toBe('right')
    expect(f.container.querySelector('.pane[data-card]')).not.toBeNull()
  })
})

describe('an address with no paper: what the keyboard reaches (Codex on #329)', () => {
  /** every control a pane draws for the pager: the page pill's arrows and field, the scroll indicator */
  const pagers = (c: HTMLElement) => [
    ...c.querySelectorAll<HTMLElement>('.pane .pill button, .pane .pill input, .pane .indicator'),
  ]
  const inert = (el: Element) => el.closest('[inert]') !== null

  it('the panes are inert, so that no invisible pager (a "1 / 0" with arrows that do nothing) stands in the Tab order before the card\'s link; the link itself is not', async () => {
    const missing = fakeController({ phase: 'ready', noPaper: true, available: false, display: 'original' })
    const m = await mountElement(app(missing.controller))
    const found = pagers(m.container)
    // a pill's three controls and an indicator, in each of the two panes: all of them there, none of them reachable
    expect(found.length).toBe(8)
    expect(found.filter((el) => !inert(el))).toEqual([])
    expect([...m.container.querySelectorAll('.pane')].map((p) => p.hasAttribute('inert'))).toEqual([true, true])
    const link = m.container.querySelector('main .card a')!
    expect([inert(link), link.closest('header, aside')]).toEqual([false, null])
    await m.unmount()
  })

  it('a paper named leaves its panes as they were: reachable', async () => {
    const named = fakeController({ phase: 'ready' })
    const m = await mountElement(app(named.controller))
    expect([...m.container.querySelectorAll('.pane')].map((p) => p.hasAttribute('inert'))).toEqual([false, false])
    expect(pagers(m.container).filter(inert)).toEqual([])
    await m.unmount()
  })
})

describe("the contents' slide (the reader's design, §5)", () => {
  it('under StrictMode, nothing slides as the page mounts; each press of the contents slides the document area once', async () => {
    const { controller } = fakeController()
    const m = await mountElement(createElement(StrictMode, null, app(controller)))
    expect(animate).not.toHaveBeenCalled()
    const toggle = m.container.querySelector<HTMLButtonElement>('button[aria-controls="axt-contents"]')!
    await act(async () => {
      toggle.click()
    })
    expect([animate.mock.calls.length, document.documentElement.hasAttribute('data-axt-contents')]).toEqual([1, true])
    await act(async () => {
      toggle.click()
    })
    expect([animate.mock.calls.length, document.documentElement.hasAttribute('data-axt-contents')]).toEqual([2, false])
    await m.unmount()
  })
})

describe("the tab's title", () => {
  it('names the paper once its title is known, and never goes back to the bare name when the title is gone for a moment', async () => {
    document.title = 'Read arXiv'
    const { controller, set } = fakeController({ paper: { id: '2608.02163', title: '' } })
    const m = await mountElement(app(controller))
    expect(document.title).toBe('Read arXiv')
    await act(async () => {
      set({ paper: { id: '2608.02163', title: 'From Simple QA to Deep Research' } })
    })
    expect(document.title).toBe('From Simple QA to Deep Research')
    await act(async () => {
      set({ paper: { id: '2608.02163', title: '' } })
    })
    expect(document.title).toBe('From Simple QA to Deep Research')
    await m.unmount()
  })
})

describe("the interface's language, the host's to choose", () => {
  it("draws the whole chrome again in the language the host sets, in place, its parts kept (the website's interface language row)", async () => {
    const { controller } = fakeController()
    const m = await mountElement(app(controller))
    const contents = () => m.container.querySelector('[data-zone="lead"] button')?.getAttribute('aria-label')
    const before = [contents(), m.container.querySelector('header')]
    await act(async () => setLocale('en'))
    const after = [contents(), m.container.querySelector('header')]
    await act(async () => setLocale('zh-CN'))
    expect([before[0], after[0], contents()]).toEqual([
      LOCALES['zh-CN'].R.contents,
      LOCALES.en.R.contents,
      LOCALES['zh-CN'].R.contents,
    ])
    // (drawn again, never mounted anew: the same bar)
    expect(after[1]).toBe(before[1])
    expect(controller.attach).toHaveBeenCalledTimes(1)
    await m.unmount()
  })
})

describe("the original lost, where the host draws it on the original's pane (StateWords openOriginal; L11's second round, gap 3)", () => {
  const lost = {
    phase: 'failed' as const,
    failure: 'network' as const,
    failures: { pdf: 'network' as const, service: null },
  }
  it("the website's: the original's pane's card, the file sign in quiet ink, arXiv's PDF of the version its link; the translation's pane left as it is", async () => {
    const { controller } = fakeController({ ...lost, paper: { id: '2608.02163v2', title: '' } })
    const words = { originalLost: 'The original cannot be shown here', openOriginal: 'Open the PDF on arXiv' }
    const m = await mountElement(app(controller, { words }))
    const left = m.container.querySelector('.pane[data-side="left"]')!
    const right = m.container.querySelector('.pane[data-side="right"]')!
    const card = left.querySelector('.card')!
    const link = card.querySelector('a')!
    expect([
      left.hasAttribute('data-card'),
      card.getAttribute('data-tone'),
      card.querySelector('p')?.textContent,
      link.getAttribute('href'),
      link.getAttribute('target'),
      link.textContent,
      right.hasAttribute('data-card'),
      right.querySelector('.card'),
      // (said in the status region: the card takes no focus)
      m.container.querySelector('[role="status"]')?.textContent,
    ]).toEqual([
      true,
      'wait',
      'The original cannot be shown here',
      'https://arxiv.org/pdf/2608.02163v2',
      '_blank',
      'Open the PDF on arXiv',
      false,
      null,
      'The original cannot be shown here',
    ])
    await m.unmount()
  })
  it("the extension's (no such word): the translation's pane's card with its retry, the original's pane none", async () => {
    const { controller } = fakeController(lost)
    const m = await mountElement(app(controller, { words: { originalLost: 'lost' } }))
    expect([
      m.container.querySelector('.pane[data-side="left"]')!.hasAttribute('data-card'),
      m.container.querySelector('.pane[data-side="right"] .card p')?.textContent,
      !!m.container.querySelector('.pane[data-side="right"] .card button'),
    ]).toEqual([false, 'lost', true])
    await m.unmount()
  })
  it("the website's, the service failed too with nothing laid: the translation's pane's card is the service's", async () => {
    const { controller } = fakeController({ ...lost, failures: { pdf: 'network', service: 'bad-request' } })
    const m = await mountElement(app(controller, { words: { openOriginal: 'Open the PDF on arXiv' } }))
    expect([
      !!m.container.querySelector('.pane[data-side="left"] .card'),
      !!m.container.querySelector('.pane[data-side="right"] .card button'),
    ]).toEqual([true, true])
    await m.unmount()
  })
})
