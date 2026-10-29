// The reading section (the redesign's design, §6.5): the way to translate with its description following the choice, figure text, where
// translations open, the floating button (asked of the background, its state's only writer), and the PDF group with
// its sub-row while the reader is on, and what the PDF reader translates (S-O-56). Every control writes at once
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
  beforeEach(() => { setLocale('en'); floating.asked.length = 0; floating.enabled = true })

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

  it('the floating switch waits for the answer it does not have yet, then shows the stored value', async () => {
    floating.enabled = null
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches }))
    const row = rowOf(m.container, 'reading/floating')
    const heldSwitch = row.querySelector<HTMLElement>('[role="switch"]')
    // not found by its role, or found but hidden — either reads as "does not show a state it does not know"
    expect(heldSwitch === null || heldSwitch.closest('.o-unknown') !== null).toBe(true)
    floating.enabled = false
    await m.rerender(h(Harness, { start: DEFAULT_CONFIG, patches }))
    const shown = switchOf(m.container, O.reading.floatingEntry)
    expect(shown.closest('.o-unknown')).toBeNull()
    expect(shown.getAttribute('aria-checked')).toBe('false')
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

  it('what the PDF reader translates: its own group after the PDF\'s, said to be the PDF\'s alone, the reading options\' five in their order, each written at once (S-O-56)', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, pdfReader: { ...DEFAULT_CONFIG.pdfReader, enabled: false } }, patches }))
    const headings = [...m.container.querySelectorAll<HTMLElement>('[data-heading]')]
    expect(headings.map(x => [x.querySelector('h2')?.textContent, x.querySelector('.o-aside')?.textContent ?? null])).toEqual([[O.reading.pdf, null], [R.classes.name, O.reading.classesAside]])
    const card = rowOf(m.container, 'reading/classes')
    expect(headings[1]!.nextElementSibling).toBe(card)
    // shown with the reader off as well (#readarxiv opens it either way), nothing inert
    const switches = [...card.querySelectorAll<HTMLElement>('[role="switch"]')]
    expect(switches.map(x => [x.getAttribute('aria-label'), x.getAttribute('aria-checked'), !!x.closest('[inert]')])).toEqual([
      [R.classes.figures, 'true', false], [R.classes.tables, 'true', false], [R.classes.heads, 'true', false], [R.classes.references, 'false', false], [R.classes.names, 'false', false],
    ])
    // a row's words turn its switch, as every switch row's do; the image switch, the HTML page's, is another setting
    ;[...card.querySelectorAll<HTMLElement>('.o-label')].find(x => x.textContent === R.classes.references)!.click()
    await m.flush()
    expect(patches.at(-1)?.pdfReader.classes).toEqual({ ...DEFAULT_CONFIG.pdfReader.classes, references: true })
    switchOf(m.container, R.classes.figures).click()
    await m.flush()
    expect([patches.at(-1)?.pdfReader.classes.figures, patches.at(-1)?.image.enabled]).toEqual([false, true])
    await m.unmount()
  })
})
