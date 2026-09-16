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

import { DIAGNOSTICS_FILE_NAME, Data } from '@/entrypoints/options/sections/Data'
import type { OptionsData } from '@/entrypoints/options/data'
import { O, setLocale } from '@/ui/strings'

const data = (): OptionsData => ({
  config: DEFAULT_CONFIG, fallbackReason: null, patch: async fn => fn(DEFAULT_CONFIG), pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
  helper: null, setHelper: () => undefined, platform: 'mac', cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
})
const button = (container: HTMLElement) => Array.from(container.querySelectorAll('button')).find(b => b.textContent === O.data.diagnosticsExport)!

describe('Data section: diagnostics export', () => {
  beforeEach(() => {
    setLocale('en')
    wire.exported = null
    wire.downloads = []
  })

  it('downloads what the background exports, as pretty JSON under a fixed name', async () => {
    wire.exported = { exportedAt: '2026-09-17T00:00:00.000Z', extension: { version: '0.0.0', buildRef: 'main' }, browser: 'UA', platform: 'mac', entries: [{ t: 1, src: 'content', line: 'x' }] }
    const mounted = await mountElement(createElement(Data, { data: data() }))
    button(mounted.container).click()
    await mounted.flush()
    await mounted.flush()
    expect(wire.downloads).toHaveLength(1)
    expect(wire.downloads[0]!.name).toBe(DIAGNOSTICS_FILE_NAME)
    expect(wire.downloads[0]!.type).toBe('application/json')
    expect(JSON.parse(wire.downloads[0]!.text)).toEqual(wire.exported)
    expect(mounted.container.textContent).toContain(O.data.diagnosticsHint)
    await mounted.unmount()
  })

  it('a worker that does not answer is reported in place of the hint, and nothing is downloaded', async () => {
    const mounted = await mountElement(createElement(Data, { data: data() }))
    button(mounted.container).click()
    await mounted.flush()
    await mounted.flush()
    expect(wire.downloads).toHaveLength(0)
    expect(mounted.container.textContent).toContain(O.data.diagnosticsError)
    await mounted.unmount()
  })
})
