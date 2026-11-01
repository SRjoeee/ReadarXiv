import { act, createElement } from 'react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { PagePill } from '@/pdf-reader/ui/PagePill'
import { ScrollIndicator, thumbSize } from '@/pdf-reader/ui/ScrollIndicator'
import { R, setLocale } from '@/ui/strings'
import { mountElement } from '../../ui/render-hook'
import { fakeController } from './fake-controller'
import { isOpen, stubPopovers } from './popover-stub'

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
    expect([input.value, input.getAttribute('aria-label'), container.querySelector('.of')?.textContent]).toEqual(['4', R.pill.translation, '/ 26'])
  })

  it('names its arrows in tooltips, shown above them: the pill stands at the pane\'s foot (P3-M11)', async () => {
    const { container } = await mount()
    const [prev, next] = [...container.querySelectorAll<HTMLButtonElement>('button')]
    for (const [button, words] of [[prev!, R.pill.previous], [next!, R.pill.next]] as const) {
      const tip = button.nextElementSibling!
      expect([button.getAttribute('aria-label'), tip.matches('.tip[popover]'), tip.textContent, tip.getAttribute('data-side'), tip.getAttribute('aria-hidden')]).toEqual([words, true, words, 'top', 'true'])
    }
    // at once on the keyboard\'s focus, as every tip of the bar
    await act(async () => { prev!.focus() })
    expect(isOpen(prev!.nextElementSibling)).toBe(true)
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

  it('takes its length in the frame the pages\' height changes: told by a ResizeObserver over the pages\' stack, set in its callback, with no frame awaited', async () => {
    const observers: { cb: ResizeObserverCallback; targets: Element[] }[] = []
    vi.stubGlobal('ResizeObserver', class {
      o: { cb: ResizeObserverCallback; targets: Element[] }
      constructor(cb: ResizeObserverCallback) { this.o = { cb, targets: [] }; observers.push(this.o) }
      observe(el: Element) { this.o.targets.push(el) }
      unobserve() {}
      disconnect() { this.o.targets = [] }
    })
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    try {
      const fake = fakeController()
      const Pane = () => createElement('section', { className: 'pane' }, createElement('div', { className: 'viewerContainer' }, createElement('div', { className: 'pdfViewer' })), createElement(ScrollIndicator, { controller: fake.controller, side: 'right' }))
      const { container } = await mountElement(createElement(Pane))
      const scroller = container.querySelector<HTMLElement>('.viewerContainer')!, stack = scroller.firstElementChild!, track = container.querySelector<HTMLElement>('.indicator')!
      let height = 8000
      Object.defineProperty(scroller, 'clientHeight', { get: () => 800 })
      Object.defineProperty(scroller, 'scrollHeight', { get: () => height })
      Object.defineProperty(track, 'clientHeight', { get: () => 800 })
      const watching = observers.find(o => o.targets.includes(stack))
      expect(watching, 'the pages\' stack observed').toBeDefined()
      // a zoom's step: the pages' height halved, the observer told after the frame's layout
      height = 4000
      watching!.cb([], {} as ResizeObserver)
      expect([track.style.getPropertyValue('--thumb'), frames.length]).toEqual(['160px', 0])
    } finally { vi.unstubAllGlobals() }
  })
})
