import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { DEFAULT_CONFIG } from '@/config/schema'
import * as configStorage from '@/config/storage'
import { setConfig } from '@/config/storage'
import { applyLocale } from '@/ui/apply-locale'
import { prepareFirstPaint } from '@/ui/first-paint'
import { localeInUse } from '@/ui/strings'

// The popup and the settings page set their language and their appearance before the first paint, and the paint waits
// on it: one read of the settings serves both (the redesign's design, §3; UI.md §6)
describe('what the extension\'s pages set before their first paint', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    delete document.documentElement.dataset.theme
    vi.spyOn(fakeBrowser.i18n, 'getUILanguage').mockReturnValue('zh-CN')
  })
  afterEach(() => { vi.restoreAllMocks() })

  it('reads the settings once, for both the pack and the theme', async () => {
    await setConfig({ ...DEFAULT_CONFIG, uiLanguage: 'en', theme: 'dark' })
    const read = vi.spyOn(configStorage, 'getConfig')
    const stop = await prepareFirstPaint(document.documentElement, brand => `${brand} · settings`)
    expect(read).toHaveBeenCalledTimes(1)
    expect(localeInUse()).toBe('en')
    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toBe('Read arXiv · settings')
    expect(document.documentElement.dataset.theme).toBe('dark')
    stop()
  })

  it('then follows the theme as it changes', async () => {
    await setConfig({ ...DEFAULT_CONFIG, theme: 'dark' })
    const stop = await prepareFirstPaint(document.documentElement)
    await setConfig({ ...DEFAULT_CONFIG, theme: 'light' })
    await new Promise(r => setTimeout(r, 0))
    expect(document.documentElement.dataset.theme).toBe('light')
    stop()
  })

  it('a read that does not answer within its time paints the browser\'s language and the system\'s theme too, and the late answer changes neither (D2)', async () => {
    let answer!: (c: typeof DEFAULT_CONFIG) => void
    vi.spyOn(configStorage, 'getConfig').mockReturnValueOnce(new Promise(r => { answer = r }))
    document.documentElement.dataset.theme = 'dark'
    const time = Promise.resolve()
    const stop = await prepareFirstPaint(document.documentElement, undefined, time)
    expect(localeInUse()).toBe('zh-CN')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    answer({ ...DEFAULT_CONFIG, uiLanguage: 'en', theme: 'dark' })
    await new Promise(r => setTimeout(r, 0))
    expect([localeInUse(), document.documentElement.lang, document.documentElement.dataset.theme]).toEqual(['zh-CN', 'zh-CN', undefined])
    stop()
  })

  it('the reader\'s pack is chosen the same way: a stored choice that does not answer in time leaves the browser\'s language (D2)', async () => {
    vi.spyOn(configStorage, 'getConfig').mockReturnValueOnce(new Promise(() => {}))
    await expect(applyLocale(undefined, Promise.resolve())).resolves.toBe('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('a read that fails paints the browser\'s language and the system\'s theme, and still follows the theme', async () => {
    // An invalidated extension context: both main.tsx entries await this right before their first render, so a
    // rejection here must not leave the page blank
    vi.spyOn(configStorage, 'getConfig').mockRejectedValueOnce(new Error('the extension context was invalidated'))
    document.documentElement.dataset.theme = 'dark'
    const stop = await prepareFirstPaint(document.documentElement)
    expect(localeInUse()).toBe('zh-CN')
    expect(document.documentElement.lang).toBe('zh-CN')
    expect(document.documentElement.dataset.theme).toBeUndefined()
    await setConfig({ ...DEFAULT_CONFIG, theme: 'light' })
    await new Promise(r => setTimeout(r, 0))
    expect(document.documentElement.dataset.theme).toBe('light')
    stop()
  })
})
