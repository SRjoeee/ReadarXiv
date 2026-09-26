import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import { mountElement } from '../ui/render-hook'

// The settings page's PDF reader section (the reader's design, §9.3): the reader's own switch and the three reading
// options the reader shows, the same values the reader and the popup change, each written at once

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))

import { PdfReader } from '@/entrypoints/options/sections/PdfReader'
import type { OptionsData } from '@/entrypoints/options/data'
import { O, R, setLocale } from '@/ui/strings'

function data(config: Config, patches: Config[]): OptionsData {
  return {
    config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => { const next = fn(config); patches.push(next); return next },
    pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
  }
}

describe('the PDF reader section', () => {
  beforeEach(() => { setLocale('zh-CN') })

  it('has four rows: the reader on arXiv PDFs, sync scrolling, the appearance, and dimming the pages in dark mode', async () => {
    const mounted = await mountElement(createElement(PdfReader, { data: data(DEFAULT_CONFIG, []) }))
    const switches = [...mounted.container.querySelectorAll('[role="switch"]')].map(s => [s.getAttribute('aria-label'), s.getAttribute('aria-checked')])
    expect(switches).toEqual([[O.pdfReader.enabled, 'true'], [R.sync, 'true'], [R.options.dim, 'true']])
    const stops = [...mounted.container.querySelectorAll('button[aria-pressed]')].map(b => [b.textContent, b.getAttribute('aria-pressed')])
    // the system's first, as in the reader's own options (the maintainer, 2026-09-26)
    expect(stops).toEqual([[R.options.system, 'true'], [R.options.light, 'false'], [R.options.dark, 'false']])
    expect(mounted.container.textContent).toContain(R.options.appearance)
    await mounted.unmount()
  })

  it('each row writes its setting at once, and nothing else', async () => {
    const patches: Config[] = []
    const mounted = await mountElement(createElement(PdfReader, { data: data(DEFAULT_CONFIG, patches) }))
    const [enabled, sync, dim] = [...mounted.container.querySelectorAll<HTMLButtonElement>('[role="switch"]')]
    enabled!.click()
    sync!.click()
    dim!.click()
    ;[...mounted.container.querySelectorAll<HTMLButtonElement>('button[aria-pressed]')].find(b => b.textContent === R.options.dark)!.click()
    await mounted.flush()
    expect(patches.map(p => p.pdfReader)).toEqual([
      { ...DEFAULT_CONFIG.pdfReader, enabled: false },
      { ...DEFAULT_CONFIG.pdfReader, sync: false },
      { ...DEFAULT_CONFIG.pdfReader, dimPages: false },
      { ...DEFAULT_CONFIG.pdfReader, appearance: 'dark' },
    ])
    expect(patches.every(p => JSON.stringify({ ...p, pdfReader: null }) === JSON.stringify({ ...DEFAULT_CONFIG, pdfReader: null }))).toBe(true)
    await mounted.unmount()
  })
})
