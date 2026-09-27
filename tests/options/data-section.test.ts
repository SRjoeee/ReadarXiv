import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_CONFIG } from '@/config/schema'
import type { DiagnosticsExport } from '@/shared/diagnostics'
import { mountElement } from '../ui/render-hook'

// The Data section's diagnostics export (issue #156): one click asks the background for the log and hands the reader a JSON file

const wire = vi.hoisted(() => ({ exported: null as DiagnosticsExport | null, downloads: [] as { name: string; text: string; type: string }[] }))
vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))
vi.mock('@/shared/messages', async importOriginal => ({
  ...(await importOriginal<typeof import('@/shared/messages')>()),
  sendMessage: async (message: { type: string }) => {
    if (message.type === 'axt:diag-export') {
      if (!wire.exported) throw new Error('no worker')
      return wire.exported
    }
    return undefined
  },
}))
vi.mock('@/shared/download', () => ({ downloadTextFile: (name: string, text: string, type: string) => { wire.downloads.push({ name, text, type }) } }))
// The PDF reader's store, on the settings page's own origin (the reader's design, §9.3): stood in for, since what it
// keeps is tests/cache/pdf-store.test.ts's business
const pdfStore = vi.hoisted(() => ({ count: 0, bytes: 0, failing: false }))
vi.mock('@/cache/pdf-store', () => ({
  createPdfStore: () => ({
    usage: async () => {
      if (pdfStore.failing) throw new Error('the store cannot be read')
      return { count: pdfStore.count, bytes: pdfStore.bytes }
    },
    clear: async () => {
      if (pdfStore.failing) throw new Error('the store cannot be written')
      pdfStore.count = 0
      pdfStore.bytes = 0
    },
  }),
}))

import { DIAGNOSTICS_FILE_NAME, Data } from '@/entrypoints/options/sections/Data'
import type { OptionsData } from '@/entrypoints/options/data'
import { O, setLocale } from '@/ui/strings'

const data = (): OptionsData => ({
  config: DEFAULT_CONFIG, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false, patch: async fn => fn(DEFAULT_CONFIG), pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
  cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
})

describe('the data section (the redesign\'s design, §6.6)', () => {
  beforeEach(() => {
    setLocale('en')
    wire.exported = null
    wire.downloads.length = 0
    Object.assign(pdfStore, { count: 2, bytes: 3.4 * 1024 * 1024, failing: false })
  })
  const byText = (c: HTMLElement, text: string) => [...c.querySelectorAll('button')].filter(b => b.textContent === text)

  it('three rows: the translations kept, the PDF translations kept, the diagnostics log, each saying what it holds', async () => {
    const m = await mountElement(createElement(Data, { data: { ...data(), cache: { entries: 1284, bytes: 12.4 * 1024 * 1024 } } }))
    await m.flush()
    expect([...m.container.querySelectorAll('[data-srow]')].map(r => r.getAttribute('data-row'))).toEqual(['data/cache', 'data/pdf', 'data/diagnostics'])
    expect(m.container.textContent).toContain(O.data.cacheLine(1284, '12.4'))
    expect(m.container.textContent).toContain(O.data.pdfLine(2, '3.4'))
    expect(m.container.textContent).toContain(O.data.diagnosticsHint)
    expect(byText(m.container, O.data.clear)).toHaveLength(2)
    await m.unmount()
  })

  it('a cache cleared in two presses in place, then O.data.cleared in the button\'s place', async () => {
    let cleared = 0
    const view = (done: boolean) => createElement(Data, { data: { ...data(), cache: { entries: 3, bytes: 0 }, cacheCleared: done, clearCache: async () => { cleared++ } } })
    const m = await mountElement(view(false))
    byText(m.container, O.data.clear)[0]!.click()
    await m.flush()
    expect(cleared).toBe(0)
    byText(m.container, O.data.clearConfirm)[0]!.click()
    await m.flush()
    expect(cleared).toBe(1)
    await m.rerender(view(true))
    expect(m.container.querySelector('[data-row="data/cache"] .o-status[data-tone="ok"]')!.textContent).toBe(O.data.cleared)
    await m.unmount()
  })

  it('the PDF translations cleared the same way; the store read again says so', async () => {
    const m = await mountElement(createElement(Data, { data: data() }))
    await m.flush()
    byText(m.container, O.data.clear)[1]!.click()
    await m.flush()
    byText(m.container, O.data.clearConfirm)[0]!.click()
    await m.flush()
    await m.flush()
    expect(pdfStore.count).toBe(0)
    expect(m.container.textContent).toContain(O.data.cleared)
    await m.unmount()
  })

  it('a cache that cannot be read says so, never as an empty one (S-O-71)', async () => {
    pdfStore.failing = true
    const m = await mountElement(createElement(Data, { data: { ...data(), cacheError: 'IndexedDB unavailable' } }))
    await m.flush()
    expect([...m.container.querySelectorAll('.o-desc')].filter(d => d.textContent === O.data.cacheError)).toHaveLength(2)
    expect(m.container.textContent).not.toContain(O.data.pdfLine(0, '0.0'))
    await m.unmount()
  })

  it('the diagnostics log is exported as a file, and a worker that does not answer says so in place of the hint', async () => {
    wire.exported = { entries: [], exportedAt: 1 } as unknown as DiagnosticsExport
    const m = await mountElement(createElement(Data, { data: data() }))
    byText(m.container, O.data.diagnosticsExport)[0]!.click()
    await m.flush()
    await m.flush()
    expect(wire.downloads.map(d => [d.name, d.type])).toEqual([[DIAGNOSTICS_FILE_NAME, 'application/json']])
    wire.exported = null
    byText(m.container, O.data.diagnosticsExport)[0]!.click()
    await m.flush()
    await m.flush()
    expect(m.container.textContent).toContain(O.data.diagnosticsError)
    await m.unmount()
  })
})
