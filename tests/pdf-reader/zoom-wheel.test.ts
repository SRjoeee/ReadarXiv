// The website's reader chrome (src/pdf-reader/ui, kept for readarxiv-web until its cut-over): only a wheel with Ctrl zooms
// (docs/PDF-READER.md §6.8). A trackpad's pinch arrives in Chrome as a wheel with Ctrl held, and Ctrl with the wheel is a
// mouse's zoom; a wheel with ⌘ held is a scroll, since macOS's screenshot keys (⌘⇧4, ⌘⇧5) hold ⌘ while a scroll or its
// momentum runs (the owner's report, 2026-11-10: the page zoomed under them)
import { act, createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReaderController } from '@/pdf-reader/controller'
import { usePinch } from '@/pdf-reader/ui/pinch'
import { ScrollIndicator } from '@/pdf-reader/ui/ScrollIndicator'
import { mountElement, mountHook } from '../ui/render-hook'

type Keys = { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }

/** a wheel with these keys (happy-dom's WheelEvent leaves the modifier keys out of its init); the event, to read whether it was taken */
function wheel(target: EventTarget, keys: Keys, deltaY = 40) {
  const e = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })
  for (const k of ['ctrlKey', 'metaKey', 'shiftKey'] as const) Object.defineProperty(e, k, { value: keys[k] ?? false })
  target.dispatchEvent(e)
  return e
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe("the website's usePinch: only a wheel with Ctrl zooms", () => {
  async function pinching() {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const doc = document.createElement('div')
    const pane = Object.assign(document.createElement('section'), { className: 'pane' })
    pane.dataset.side = 'right'
    doc.append(pane)
    document.body.append(doc)
    const pinch = vi.fn(), zoomBy = vi.fn()
    const hook = await mountHook(() => usePinch({ pinch, zoomBy } as unknown as ReaderController, { current: doc }))
    const frame = () => { for (const cb of frames.splice(0)) cb(0) }
    return { pane, pinch, zoomBy, frame, hook }
  }

  it('a wheel with ⌘ held, or ⌘⇧, scrolls and never zooms', async () => {
    const { pane, pinch, frame, hook } = await pinching()
    const taken = [{ metaKey: true }, { metaKey: true, shiftKey: true }].map(keys => wheel(pane, keys).defaultPrevented)
    frame()
    expect(taken).toEqual([false, false])
    expect(pinch).not.toHaveBeenCalled()
    await hook.unmount()
  })

  it('a wheel with Ctrl zooms, ⌘ held beside it or not', async () => {
    const { pane, pinch, frame, hook } = await pinching()
    const taken = [{ ctrlKey: true }, { ctrlKey: true, metaKey: true }].map(keys => { const e = wheel(pane, keys); frame(); return e.defaultPrevented })
    expect(taken).toEqual([true, true])
    expect(pinch.mock.calls.map(c => [c[0], c[1]])).toEqual([0, 1].map(() => ['right', expect.closeTo(Math.exp(-0.1), 6)]))
    await hook.unmount()
  })

  it('the keys still zoom: ⌘ or Ctrl with = or + in by a tenth, with − out', async () => {
    const { zoomBy, hook } = await pinching()
    const key = (k: string, keys: Keys) => document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...keys }))
    key('=', { metaKey: true })
    key('+', { ctrlKey: true })
    key('-', { metaKey: true })
    expect(zoomBy.mock.calls.map(c => c[0])).toEqual([1.1, 1.1, expect.closeTo(1 / 1.1, 9)])
    await hook.unmount()
  })
})

describe("the website's ScrollIndicator: a wheel with ⌘ held is the reader's scroll (§6.5)", () => {
  it('hidden through a zoom; a wheel with Ctrl keeps it hidden, a wheel with ⌘ or ⌘⇧ and its scroll show it again', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
    let scale = 1
    const listeners = new Set<() => void>()
    const controller = {
      getState: () => ({ scale }),
      subscribe: (l: () => void) => { listeners.add(l); return () => listeners.delete(l) },
      lead: () => {},
    } as unknown as ReaderController
    const { container } = await mountElement(createElement('section', { className: 'pane', 'data-side': 'right' },
      createElement('div', { className: 'viewerContainer' }, createElement('div', { className: 'pdfViewer' })),
      createElement(ScrollIndicator, { controller, side: 'right' })))
    const scroller = container.querySelector<HTMLElement>('.viewerContainer')!, track = container.querySelector<HTMLElement>('.indicator')!
    const step = (next: number) => act(async () => { scale = next; for (const l of listeners) l() })
    const scroll = () => scroller.dispatchEvent(new Event('scroll'))
    const hidden = () => track.hasAttribute('data-zoomed')
    const states: [string, boolean][] = []
    await step(1.1)
    wheel(scroller, { ctrlKey: true }, -2)
    scroll()
    states.push(['a wheel with Ctrl after a step', hidden()])
    wheel(scroller, { metaKey: true, shiftKey: true })
    scroll()
    states.push(['a wheel with ⌘⇧ held', hidden()])
    await step(1.2)
    wheel(scroller, { metaKey: true })
    scroll()
    states.push(['a wheel with ⌘ held', hidden()])
    expect(states).toEqual([['a wheel with Ctrl after a step', true], ['a wheel with ⌘⇧ held', false], ['a wheel with ⌘ held', false]])
  })
})
