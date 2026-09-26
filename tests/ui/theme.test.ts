import { beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { DEFAULT_CONFIG } from '@/config/schema'
import { setConfig } from '@/config/storage'
import { applyTheme, followTheme } from '@/ui/theme'

describe('the extension\'s pages follow the theme (the redesign\'s design, §3)', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    delete document.documentElement.dataset.theme
  })

  it('marks the root for light and dark, and leaves it unmarked for the system\'s', () => {
    const root = document.documentElement
    applyTheme(root, 'dark')
    expect(root.dataset.theme).toBe('dark')
    applyTheme(root, 'light')
    expect(root.dataset.theme).toBe('light')
    applyTheme(root, 'system')
    expect(root.dataset.theme).toBeUndefined()
  })

  it('applies the stored theme before it returns, and follows a change', async () => {
    await setConfig({ ...DEFAULT_CONFIG, theme: 'dark' })
    const stop = await followTheme(document.documentElement)
    expect(document.documentElement.dataset.theme).toBe('dark')
    await setConfig({ ...DEFAULT_CONFIG, theme: 'light' })
    await new Promise(r => setTimeout(r, 0))
    expect(document.documentElement.dataset.theme).toBe('light')
    stop()
  })
})
