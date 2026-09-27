// The reading section (the redesign's design, §6.5): the way to translate with its description following the choice, figure text, where
// translations open, the floating button (asked of the background, its state's only writer), and the PDF group with
// its sub-row while the reader is on. Every control writes at once
import { createElement as h, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { OptionsData } from '@/entrypoints/options/data'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))
const floating = vi.hoisted(() => ({ enabled: true as boolean | null, asked: [] as boolean[] }))
vi.mock('@/entrypoints/options/floating-entry', () => ({
  useFloatingEntry: () => ({ enabled: floating.enabled, setEnabled: (next: boolean) => { floating.asked.push(next) } }),
}))

import { Reading } from '@/entrypoints/options/sections/Reading'
import { O, R, S, setLocale } from '@/ui/strings'

function Harness({ start, patches }: { start: Config; patches: Config[] }) {
  const [config, setConfig] = useState(start)
  const data: OptionsData = {
    config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => { const next = fn(config); patches.push(next); setConfig(next); return next },
    pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
  }
  return h(Reading, { data })
}
const rowOf = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-row="${id}"]`)!
const groupOf = (c: HTMLElement, label: string) => c.querySelector<HTMLElement>(`[role="radiogroup"][aria-label="${label}"]`)!
const segments = (c: HTMLElement, label: string) => [...groupOf(c, label).querySelectorAll<HTMLElement>('[role="radio"]')]
const switchOf = (c: HTMLElement, label: string) => c.querySelector<HTMLElement>(`[role="switch"][aria-label="${label}"]`)!

describe('the reading section (§6.5)', () => {
  beforeEach(() => { setLocale('en'); floating.asked.length = 0 })

  it('the way to translate: two choices, the description following the choice and coming in anew as it changes', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, preload: 'on-demand' }, patches }))
    expect(segments(m.container, O.reading.translateWay).map(s => s.textContent)).toEqual(['As you read', 'Whole paper'])
    const description = () => rowOf(m.container, 'reading/way').querySelector('.o-desc')!
    expect(description().textContent).toBe(O.reading.translateWayHints[0])
    expect(description().classList.contains('o-swap')).toBe(false)
    // fix round 1: the radiogroup names the row's description, and keeps naming the same element as the choice changes
    const group = groupOf(m.container, O.reading.translateWay)
    expect(group.getAttribute('aria-describedby')).toBe(description().id)
    segments(m.container, O.reading.translateWay)[1]!.click()
    await m.flush()
    expect(patches.at(-1)?.preload).toBe('whole')
    expect(description().textContent).toBe(O.reading.translateWayHints[1])
    expect(description().classList.contains('o-swap')).toBe(true)
    expect(group.getAttribute('aria-describedby')).toBe(description().id)
    await m.unmount()
  })

  it('figure text, where translations open and the floating button, each written at once', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches }))
    rowOf(m.container, 'reading/images').querySelector<HTMLElement>('.o-label')!.click()
    await m.flush()
    expect(patches.at(-1)?.image.enabled).toBe(false)
    // fix round 1: "where the translation opens" is a second row whose radiogroup names its own description
    expect(groupOf(m.container, O.reading.openIn).getAttribute('aria-describedby')).toBe(rowOf(m.container, 'reading/open-in').querySelector('.o-desc')!.id)
    segments(m.container, O.reading.openIn)[1]!.click()
    await m.flush()
    expect(patches.at(-1)?.reading.openIn).toBe('same-tab')
    switchOf(m.container, O.reading.floatingEntry).click()
    expect(floating.asked).toEqual([false])
    expect(rowOf(m.container, 'reading/images').textContent).toContain(O.reading.imagesHint)
    expect(switchOf(m.container, S.rows.images)).not.toBeNull()
    await m.unmount()
  })

  it('the PDF group: the reader\'s switch, and syncing only while the reader is on', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches }))
    const sync = () => switchOf(m.container, R.sync)
    expect(sync().closest('[inert]')).toBeNull()
    sync().click()
    await m.flush()
    expect(patches.at(-1)?.pdfReader.sync).toBe(false)
    switchOf(m.container, O.reading.pdfEnabled).click()
    await m.flush()
    expect(patches.at(-1)?.pdfReader.enabled).toBe(false)
    expect(sync().closest('[inert]')).not.toBeNull()
    expect(rowOf(m.container, 'reading/pdf').querySelectorAll('[role="switch"]')).toHaveLength(2)
    await m.unmount()
  })
})
