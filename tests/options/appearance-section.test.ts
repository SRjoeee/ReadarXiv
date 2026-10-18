// The appearance section (the redesign's design, §6.4): the appearance for the whole extension, the dimming only where it can apply, the
// highlight's switch and its colours — the profiles as swatches, and one colour of the reader's own that is added once
// and changed after
import { createElement as h, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BUILT_IN_HIGHLIGHTS, appearanceSchema } from '@/config/appearance'
import { type Config, DEFAULT_CONFIG, configSchema } from '@/config/schema'
import type { OptionsData } from '@/entrypoints/options/data'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))

import { Appearance, OWN_HIGHLIGHT_ID } from '@/entrypoints/options/sections/Appearance'
import { O, S, setLocale } from '@/ui/strings'

/** The section over a configuration that follows its own writes, as the data layer's does */
function Harness({ start, patches }: { start: Config; patches: Config[] }) {
  const [config, setConfig] = useState(start)
  const data: OptionsData = {
    config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => { const next = fn(config); patches.push(next); setConfig(next); return next },
    pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
  }
  return h(Appearance, { data })
}
const radios = (c: HTMLElement, label: string) => [...c.querySelectorAll<HTMLElement>(`[role="radiogroup"][aria-label="${label}"] [role="radio"]`)]
const rowOf = (c: HTMLElement, id: string) => c.querySelector<HTMLElement>(`[data-row="${id}"]`)!
const inert = (el: Element) => el.closest('[inert]') !== null
const pick = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('the appearance section (§6.4)', () => {
  beforeEach(() => { setLocale('en') })

  it('the appearance for the whole extension; dimming the PDF pages shows for System and Dark only', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, theme: 'system' }, patches }))
    expect(radios(m.container, O.appearance.theme).map(r => r.textContent)).toEqual([O.appearance.themes.system, O.appearance.themes.light, O.appearance.themes.dark])
    expect(inert(rowOf(m.container, 'appearance/dim'))).toBe(false)
    radios(m.container, O.appearance.theme)[1]!.click()
    await m.flush()
    expect(patches.at(-1)?.theme).toBe('light')
    expect(inert(rowOf(m.container, 'appearance/dim'))).toBe(true)
    radios(m.container, O.appearance.theme)[2]!.click()
    await m.flush()
    expect(inert(rowOf(m.container, 'appearance/dim'))).toBe(false)
    rowOf(m.container, 'appearance/dim').querySelector<HTMLElement>('[role="switch"]')!.click()
    await m.flush()
    expect(patches.at(-1)?.pdfReader.dimPages).toBe(false)
    await m.unmount()
  })

  // Task 64b, item 6: the dimming row had no words of its own, so a search for them missed it
  it('the dimming row answers to its own search words', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, theme: 'system' }, patches: [] }))
    expect(rowOf(m.container, 'appearance/dim').dataset.search).toContain('brightness')
    await m.unmount()
  })

  it('the highlight\'s switch, and while it is on its colours: the profiles as swatches, the one in use pressed', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches }))
    const swatches = () => [...rowOf(m.container, 'appearance/highlight').querySelectorAll<HTMLButtonElement>('button.o-swatch')]
    expect(swatches().map(b => b.getAttribute('aria-label'))).toEqual(['Soft green', 'Sand', 'Sky'])
    expect(swatches().map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
    swatches()[1]!.click()
    await m.flush()
    expect(patches.at(-1)?.appearance.activeHighlight).toBe('sand')
    m.container.querySelector<HTMLElement>(`[role="switch"][aria-label="${S.rows.highlight}"]`)!.click()
    await m.flush()
    expect(patches.at(-1)?.reading.sentenceHighlight).toBe(false)
    expect(inert(swatches()[0]!)).toBe(true)
    await m.unmount()
  })

  it('a colour of one\'s own adds one profile the first time and changes that one after', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches }))
    const own = () => m.container.querySelector<HTMLInputElement>('input[type="color"]')!
    expect(own().getAttribute('aria-label')).toBe(O.appearance.pickColour)
    pick(own(), '#ff0000')
    await m.flush()
    pick(own(), '#00ff00')
    await m.flush()
    const highlights = patches.at(-1)!.appearance.highlights
    expect(highlights.filter(h => h.id === OWN_HIGHLIGHT_ID)).toEqual([{ id: OWN_HIGHLIGHT_ID, name: O.appearance.pickColour, color: '#00ff00', opacity: 0.25 }])
    expect(highlights).toHaveLength(DEFAULT_CONFIG.appearance.highlights.length + 1)
    expect(patches.at(-1)!.appearance.activeHighlight).toBe(OWN_HIGHLIGHT_ID)
    expect(own().hasAttribute('data-pressed')).toBe(true)
    await m.unmount()
  })

  // Codex on #306 (Codex 4): 0.4.1 let a reader duplicate bands up to the schema's cap, and the first colour of one's
  // own then added one more, which the store refused, unhandled and unsaid
  // Codex 4c: greyed as every other unavailable control of the page — aria-disabled, in the tab order, described by its
  // reason, its press refused so the browser's picker stays shut
  it('at the schema\'s 50 colours with none of one\'s own, Pick a colour is greyed and its row says why; with one\'s own among them it still changes that one', async () => {
    const patches: Config[] = []
    const bands = Array.from({ length: 50 - BUILT_IN_HIGHLIGHTS.length }, (_, i) => ({ id: `hl-band${String(i).padStart(4, '0')}`, name: `Band ${i}`, color: 'oklch(0.7 0.1 30)', opacity: 0.3 }))
    const full = { ...DEFAULT_CONFIG, appearance: { ...DEFAULT_CONFIG.appearance, highlights: [...BUILT_IN_HIGHLIGHTS, ...bands] } }
    expect(appearanceSchema.safeParse(full.appearance).success).toBe(true)
    expect(appearanceSchema.safeParse({ ...full.appearance, highlights: [...full.appearance.highlights, bands[0]!] }).success).toBe(false)
    const own = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[type="color"]')!
    const m = await mountElement(h(Harness, { start: full, patches }))
    expect([own(m.container).getAttribute('aria-disabled'), own(m.container).disabled]).toEqual(['true', false])
    expect(own(m.container).closest('[data-srow]')!.querySelector('.o-desc')?.textContent).toBe('Up to 50 colours')
    expect(document.getElementById(own(m.container).getAttribute('aria-describedby') ?? '')?.textContent).toBe('Up to 50 colours')
    // the press is refused: the picker is its default action, the keys' too (their activation is a click)
    const press = new MouseEvent('click', { bubbles: true, cancelable: true })
    own(m.container).dispatchEvent(press)
    expect(press.defaultPrevented).toBe(true)
    pick(own(m.container), '#ff0000')
    await m.flush()
    expect(patches).toEqual([])
    await m.unmount()
    // one's own among the 50: picking changes it, adds nothing
    const mine = { ...bands.at(-1)!, id: OWN_HIGHLIGHT_ID }
    const n = await mountElement(h(Harness, { start: { ...full, appearance: { ...full.appearance, highlights: [...full.appearance.highlights.slice(0, 49), mine] } }, patches }))
    expect([own(n.container).getAttribute('aria-disabled'), own(n.container).getAttribute('aria-describedby'), own(n.container).closest('[data-srow]')!.querySelector('.o-desc')]).toEqual([null, null, null])
    pick(own(n.container), '#ff0000')
    await n.flush()
    expect(patches.at(-1)!.appearance.highlights).toHaveLength(50)
    expect(patches.at(-1)!.appearance.highlights.at(-1)).toMatchObject({ id: OWN_HIGHLIGHT_ID, color: '#ff0000' })
    await n.unmount()
  })

  // Codex 4b: another tab filled the colours after this page drew its pick; the pick's own write was refused, unhandled
  it('a colour of one\'s own the store refuses — another tab filled the list meanwhile — says so under the row and leaves no rejection unhandled; a write that lands takes the line away', async () => {
    const bands = Array.from({ length: 49 - BUILT_IN_HIGHLIGHTS.length }, (_, i) => ({ id: `hl-band${String(i).padStart(4, '0')}`, name: `Band ${i}`, color: 'oklch(0.7 0.1 30)', opacity: 0.3 }))
    const start = { ...DEFAULT_CONFIG, appearance: { ...DEFAULT_CONFIG.appearance, highlights: [...BUILT_IN_HIGHLIGHTS, ...bands] } }
    // what storage holds: the change runs on it, and a value the schema refuses is not stored (config/storage.ts setConfig)
    const stored = { current: start }
    function StoreHarness() {
      const [config, setConfig] = useState(start)
      const data: OptionsData = {
        config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
        patch: async fn => {
          const next = fn(stored.current)
          if (!configSchema.safeParse(next).success) throw new Error('refused')
          stored.current = next; setConfig(next); return next
        },
        pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
        cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
      }
      return h(Appearance, { data })
    }
    const unhandled: unknown[] = []
    const listen = (reason: unknown) => { unhandled.push(reason) }
    process.on('unhandledRejection', listen)
    try {
      const m = await mountElement(h(StoreHarness))
      const own = () => m.container.querySelector<HTMLInputElement>('[data-row="appearance/highlight"] input[type="color"]')!
      const note = () => rowOf(m.container, 'appearance/highlight').querySelector('.o-list-note')
      expect(own().disabled).toBe(false)
      // another tab adds the fiftieth colour; this page has not heard yet
      const other = { id: 'hl-othertab', name: 'Other', color: 'oklch(0.7 0.1 90)', opacity: 0.3 }
      stored.current = { ...start, appearance: { ...start.appearance, highlights: [...start.appearance.highlights, other] } }
      pick(own(), '#ff0000')
      await m.flush()
      await m.flush()
      expect(note()?.textContent).toBe(O.saveFailed)
      expect(unhandled).toEqual([])
      m.container.querySelector<HTMLButtonElement>('[data-row="appearance/highlight"] button.o-swatch')!.click()
      await m.flush()
      expect(note()).toBeNull()
      await m.unmount()
    } finally {
      process.off('unhandledRejection', listen)
    }
  })

  it('a profile an earlier version let the reader add stays as a swatch', async () => {
    const mine = { id: 'hl-abcdefgh', name: 'Mine', color: 'oklch(0.7 0.1 30)', opacity: 0.3 }
    const start = { ...DEFAULT_CONFIG, appearance: { ...DEFAULT_CONFIG.appearance, highlights: [...DEFAULT_CONFIG.appearance.highlights, mine] } }
    const m = await mountElement(h(Harness, { start, patches: [] }))
    expect([...m.container.querySelectorAll('button.o-swatch')].map(b => b.getAttribute('aria-label'))).toContain('Mine')
    await m.unmount()
  })
})
