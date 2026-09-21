import { beforeEach, describe, expect, it, vi } from 'vitest'

// The page's half of the toolbar button's two states (shared/action-icon.ts): it says it is a page the extension
// works on, once on load and again when the back/forward cache brings it back, and an extension that has gone away
// under it takes nothing down

const wire = vi.hoisted(() => ({ sent: [] as unknown[], fail: null as 'throw' | 'reject' | null }))
vi.mock('@/shared/messages', () => ({
  sendMessage: (message: unknown) => {
    if (wire.fail === 'throw') throw new Error('Extension context invalidated.')
    wire.sent.push(message)
    return wire.fail === 'reject' ? Promise.reject(new Error('Could not establish connection')) : Promise.resolve(undefined)
  },
}))

const { announceUsablePage } = await import('@/shared/action-icon')

const pageshow = (persisted: boolean) => {
  const event = new Event('pageshow')
  Object.defineProperty(event, 'persisted', { value: persisted })
  return event
}

describe('announceUsablePage', () => {
  beforeEach(() => {
    wire.sent = []
    wire.fail = null
  })

  it('says so on load, and again only when the page comes back from the back/forward cache', () => {
    const win = new EventTarget() as unknown as Window
    announceUsablePage(win)
    expect(wire.sent).toEqual([{ type: 'axt:page-usable' }])
    win.dispatchEvent(pageshow(false))
    expect(wire.sent).toHaveLength(1)
    win.dispatchEvent(pageshow(true))
    expect(wire.sent).toEqual([{ type: 'axt:page-usable' }, { type: 'axt:page-usable' }])
  })

  it('takes nothing down when the extension is gone, whether the send throws or rejects', async () => {
    const win = new EventTarget() as unknown as Window
    wire.fail = 'throw'
    expect(() => announceUsablePage(win)).not.toThrow()
    wire.fail = 'reject'
    expect(() => win.dispatchEvent(pageshow(true))).not.toThrow()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
})
