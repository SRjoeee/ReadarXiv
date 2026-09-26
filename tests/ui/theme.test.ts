import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { DEFAULT_CONFIG } from '@/config/schema'
import * as configStorage from '@/config/storage'
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

  it('paints the system\'s theme and still returns the watcher when the settings cannot be read', async () => {
    // An invalidated extension context, same failure resolveLocale (apply-locale.ts) already guards against: the two
    // main.tsx entries await this right before their first render, so a rejection here must not leave the page blank
    vi.spyOn(configStorage, 'getConfig').mockRejectedValueOnce(new Error('the extension context was invalidated'))
    const root = document.documentElement
    const stop = await followTheme(root)
    expect(root.dataset.theme).toBeUndefined()
    expect(stop).toBeTypeOf('function')
    stop()
  })
})
