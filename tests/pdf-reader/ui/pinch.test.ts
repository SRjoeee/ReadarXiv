import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReaderController } from '@/pdf-reader/controller'
import { usePinch, wheelStep } from '@/pdf-reader/ui/pinch'
import { mountHook } from '../../ui/render-hook'

describe('a pinch (the reader\'s design, §6.8)', () => {
  it('zooms continuously on a trackpad\'s small deltas, a tenth for a mouse notch', () => {
    expect(wheelStep(-3)).toBeCloseTo(-0.03)
    expect(wheelStep(100)).toBe(0.1)
    expect(wheelStep(-120)).toBe(-0.1)
  })
})

describe('usePinch: one call a frame', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  /** the document area with one pane, the frames the hook asks for run by hand */
  async function pinching() {
    const frames: FrameRequestCallback[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb))
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const doc = document.createElement('div')
    const pane = Object.assign(document.createElement('section'), { className: 'pane' })
    pane.dataset.side = 'left'
    doc.append(pane)
    document.body.append(doc)
    const pinch = vi.fn()
    const controller = { pinch, zoomBy: vi.fn() } as unknown as ReaderController
    const hook = await mountHook(() => usePinch(controller, { current: doc }))
    // a trackpad's pinch is a wheel with Ctrl held; happy-dom's WheelEvent leaves `ctrlKey` out of its init
    const wheel = (deltaY: number) => pane.dispatchEvent(Object.defineProperty(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }), 'ctrlKey', { value: true }))
    const frame = () => { for (const cb of frames.splice(0)) cb(0) }
    return { pinch, wheel, frame, hook }
  }

  it('sends a frame\'s steps however small: the view carries what PDF.js\'s rounding to a hundredth leaves of them (reader-view.mjs pinch)', async () => {
    const { pinch, wheel, frame, hook } = await pinching()
    // 0.2 % a frame: each frame sends its own, none held back (a hold of 0.5 % here still lost a slow pinch at a quarter's
    // scale, where PDF.js rounds any step under 1.9 % to no change)
    for (let i = 0; i < 3; i++) {
      wheel(-0.2)
      frame()
    }
    expect(pinch.mock.calls.map(c => c[1])).toEqual([0, 1, 2].map(() => expect.closeTo(Math.exp(0.002), 6)))
    await hook.unmount()
  })

  it('a frame\'s wheels are sent as one step in its frame, and the next frame starts afresh', async () => {
    const { pinch, wheel, frame, hook } = await pinching()
    wheel(-1)
    wheel(-1)
    frame()
    wheel(-1)
    frame()
    expect(pinch.mock.calls.map(c => c[1])).toEqual([expect.closeTo(Math.exp(0.02), 6), expect.closeTo(Math.exp(0.01), 6)])
    await hook.unmount()
  })
})
