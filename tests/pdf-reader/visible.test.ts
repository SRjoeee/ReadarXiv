import { afterEach, describe, expect, it, vi } from 'vitest'
import { whenVisible } from '@/pdf-reader/visible'

const state = (v: 'visible' | 'hidden') => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v })
afterEach(() => state('visible'))

describe("whenVisible: nothing unseen takes resources (Part 2's final review)", () => {
  it('a run no longer wanted by the time the page is shown is not run: the display switched to the original meanwhile (Codex on #301)', () => {
    const run = vi.fn()
    let wanted = true
    state('hidden')
    whenVisible(run, document, () => wanted)
    wanted = false
    state('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(run).not.toHaveBeenCalled()
    wanted = true
    state('hidden')
    whenVisible(run, document, () => wanted)
    state('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(run).toHaveBeenCalledOnce()
  })

  it('runs at once on a page that is shown', () => {
    const run = vi.fn()
    whenVisible(run)
    expect(run).toHaveBeenCalledOnce()
  })

  it('waits for a hidden page to be shown, and runs once', () => {
    const run = vi.fn()
    state('hidden')
    whenVisible(run)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(run).not.toHaveBeenCalled()
    state('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(run).toHaveBeenCalledOnce()
  })
})
