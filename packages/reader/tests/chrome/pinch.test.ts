import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReaderController } from '../../src/chrome/model.ts'
import { usePinch, wheelStep } from '../../src/chrome/pinch.ts'
import { mountHook } from '../render-hook.ts'

describe("a pinch (the reader's design, §6.8)", () => {
  it("zooms continuously on a trackpad's small deltas, a tenth for a mouse notch", () => {
    expect(wheelStep(-3)).toBeCloseTo(-0.03)
    expect(wheelStep(100)).toBe(0.1)
    expect(wheelStep(-120)).toBe(-0.1)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

type Keys = { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }

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
  const pinch = vi.fn(),
    zoomBy = vi.fn()
  const controller = { pinch, zoomBy } as unknown as ReaderController
  const hook = await mountHook(() => usePinch(controller, { current: doc }))
  // a trackpad's pinch is a wheel with Ctrl held (the keys by default here); happy-dom's WheelEvent leaves the modifier keys
  // out of its init. The event sent, to read whether the hook took it
  const wheel = (deltaY: number, keys: Keys = { ctrlKey: true }) => {
    const e = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true })
    for (const k of ['ctrlKey', 'metaKey', 'shiftKey'] as const)
      Object.defineProperty(e, k, { value: keys[k] ?? false })
    pane.dispatchEvent(e)
    return e
  }
  const key = (k: string, keys: Keys) =>
    document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...keys }))
  const frame = () => {
    for (const cb of frames.splice(0)) cb(0)
  }
  return { pinch, zoomBy, wheel, key, frame, hook }
}

describe('usePinch: one call a frame', () => {
  it("sends a frame's steps however small: the view carries what PDF.js's rounding to a hundredth leaves of them (reader-view.mjs pinch)", async () => {
    const { pinch, wheel, frame, hook } = await pinching()
    // 0.2 % a frame: each frame sends its own, none held back (a hold of 0.5 % here still lost a slow pinch at a quarter's
    // scale, where PDF.js rounds any step under 1.9 % to no change)
    for (let i = 0; i < 3; i++) {
      wheel(-0.2)
      frame()
    }
    expect(pinch.mock.calls.map((c) => c[1])).toEqual([0, 1, 2].map(() => expect.closeTo(Math.exp(0.002), 6)))
    await hook.unmount()
  })

  it("a frame's wheels are sent as one step in its frame, and the next frame starts afresh", async () => {
    const { pinch, wheel, frame, hook } = await pinching()
    wheel(-1)
    wheel(-1)
    frame()
    wheel(-1)
    frame()
    expect(pinch.mock.calls.map((c) => c[1])).toEqual([
      expect.closeTo(Math.exp(0.02), 6),
      expect.closeTo(Math.exp(0.01), 6),
    ])
    await hook.unmount()
  })
})

describe('usePinch: only a wheel with Ctrl zooms', () => {
  it("a wheel with ⌘ held scrolls and never zooms: macOS's screenshot keys (⌘⇧4, ⌘⇧5) hold ⌘ while a scroll or its momentum runs (the owner's report, 2026-11-10)", async () => {
    const { pinch, wheel, frame, hook } = await pinching()
    const taken = [{ metaKey: true }, { metaKey: true, shiftKey: true }].map((keys) => wheel(40, keys).defaultPrevented)
    frame()
    expect(taken).toEqual([false, false])
    expect(pinch).not.toHaveBeenCalled()
    await hook.unmount()
  })

  it("a wheel with Ctrl zooms: a trackpad's pinch as Chrome sends it, and a mouse's zoom; ⌘ held beside Ctrl changes nothing", async () => {
    const { pinch, wheel, frame, hook } = await pinching()
    const taken = [{ ctrlKey: true }, { ctrlKey: true, metaKey: true }].map((keys) => {
      const e = wheel(40, keys)
      frame()
      return e.defaultPrevented
    })
    expect(taken).toEqual([true, true])
    expect(pinch.mock.calls.map((c) => c[1])).toEqual([0, 1].map(() => expect.closeTo(Math.exp(-0.1), 6)))
    await hook.unmount()
  })

  it('the keys still zoom: ⌘ or Ctrl with = or + in by a tenth, with − out', async () => {
    const { zoomBy, key, hook } = await pinching()
    key('=', { metaKey: true })
    key('+', { ctrlKey: true })
    key('-', { metaKey: true })
    expect(zoomBy.mock.calls.map((c) => c[0])).toEqual([1.1, 1.1, expect.closeTo(1 / 1.1, 9)])
    await hook.unmount()
  })
})
