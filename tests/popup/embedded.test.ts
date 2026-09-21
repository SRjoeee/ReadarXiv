import { afterEach, describe, expect, it, vi } from 'vitest'

// The popup framed as the floating button's control panel (DESIGN §4.0c): what it tells its owner, and to whom

const realParent = Object.getOwnPropertyDescriptor(window, 'parent')

function frameIn(origin: string | null) {
  const posted: { message: unknown; target: string }[] = []
  const owner = { postMessage: (message: unknown, target: string) => { posted.push({ message, target }) } }
  Object.defineProperty(window, 'parent', { configurable: true, get: () => owner })
  Object.defineProperty(location, 'ancestorOrigins', { configurable: true, get: () => (origin === null ? [] : [origin]) })
  return posted
}

afterEach(() => {
  if (realParent) Object.defineProperty(window, 'parent', realParent)
  else Reflect.deleteProperty(window, 'parent')
  Reflect.deleteProperty(location, 'ancestorOrigins')
  vi.restoreAllMocks()
  vi.resetModules()
})

describe('the popup, framed or not', () => {
  it('under the toolbar it is its own top window: closing is window.close, and nothing is reported to anybody', async () => {
    vi.resetModules()
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined)
    const { EMBEDDED, closePopup, reportToOwner } = await import('@/entrypoints/popup/embedded')
    expect(EMBEDDED).toBe(false)
    reportToOwner()
    closePopup()
    expect(close).toHaveBeenCalledOnce()
  })

  it('framed, it tells its owner its height at once and asks to be closed — to the owner\'s origin and no other', async () => {
    const posted = frameIn('https://arxiv.org')
    vi.resetModules()
    const close = vi.spyOn(window, 'close').mockImplementation(() => undefined)
    const { EMBEDDED, closePopup, reportToOwner } = await import('@/entrypoints/popup/embedded')
    expect(EMBEDDED).toBe(true)
    vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue({ height: 419.2 } as DOMRect)
    reportToOwner()
    expect(posted).toEqual([{ message: { type: 'axt:panel-size', height: 420 }, target: 'https://arxiv.org' }])
    closePopup()
    expect(posted.at(-1)).toEqual({ message: { type: 'axt:panel-close' }, target: 'https://arxiv.org' })
    expect(close).not.toHaveBeenCalled()
    // Escape inside the frame is the owner's to act on: the frame cannot close itself
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(posted.filter(p => (p.message as { type: string }).type === 'axt:panel-close')).toHaveLength(2)
  })

  it('framed by a window whose origin it cannot name, it says nothing rather than saying it to everyone', async () => {
    const posted = frameIn(null)
    vi.resetModules()
    const { closePopup, reportToOwner } = await import('@/entrypoints/popup/embedded')
    reportToOwner()
    closePopup()
    expect(posted).toEqual([])
  })
})
