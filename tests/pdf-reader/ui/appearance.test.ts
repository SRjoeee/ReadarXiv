import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyAppearance, dimmed, themeOf } from '@/pdf-reader/ui/appearance'

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
  document.documentElement.removeAttribute('data-axt-dim')
  vi.unstubAllGlobals()
})

describe('the appearance (the reader\'s design, §4.3)', () => {
  it('is the one chosen, or none to follow the system', () => {
    expect(themeOf('light')).toBe('light')
    expect(themeOf('dark')).toBe('dark')
    expect(themeOf('system')).toBeNull()
  })

  it('dims the pages when it is dark in effect and the switch is on', () => {
    expect(dimmed('dark', false, true)).toBe(true)
    expect(dimmed('system', true, true)).toBe(true)
    expect(dimmed('system', false, true)).toBe(false)
    expect(dimmed('dark', false, false)).toBe(false)
    expect(dimmed('light', true, true)).toBe(false)
  })

  it('is applied to the root, crossfaded only when asked', () => {
    const transition = vi.fn((run: () => void) => run())
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    Object.assign(document, { startViewTransition: transition })
    const root = document.documentElement
    applyAppearance(root, { theme: 'dark', dim: true }, false)
    expect([root.dataset.theme, root.hasAttribute('data-axt-dim'), transition]).toEqual(['dark', true, transition])
    expect(transition).not.toHaveBeenCalled()
    applyAppearance(root, { theme: null, dim: false }, true)
    expect(transition).toHaveBeenCalledOnce()
    expect([root.dataset.theme, root.hasAttribute('data-axt-dim')]).toEqual([undefined, false])
  })
})
