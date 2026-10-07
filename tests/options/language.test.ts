// The interface language (the redesign's design, §6.1): at the sidebar's foot, its name carrying the English words, its
// languages in their own names with `lang`; a pick writes it (the data layer reloads the page once it lands); a search
// shows it as a row of its own. happy-dom has no popover API: a pick shuts its popover, so the reader's stub stands in
import { createElement as h } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { OptionsData } from '@/entrypoints/options/data'
import { LOCALE_NAMES } from '@/locales'
import { stubPopovers } from '../pdf-reader/ui/popover-stub'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))
const state = vi.hoisted(() => ({ data: null as unknown }))
vi.mock('@/entrypoints/options/data', () => ({ useOptionsData: () => state.data }))

import { App } from '@/entrypoints/options/App'
import { LanguageFoot, LanguageRow } from '@/entrypoints/options/sections/Language'
import { O, setLocale } from '@/ui/strings'

function data(config: Config, patches: Config[]): OptionsData {
  return {
    config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => { const next = fn(config); patches.push(next); return next },
    pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
  }
}
const options = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('[role="option"]')]

describe('the interface language (§6.1)', () => {
  let restore = () => {}
  beforeEach(() => { setLocale('en'); restore = stubPopovers() })
  afterEach(() => restore())

  it('the foot row names itself with the value; the menu lists the browser\'s choice and each language in its own name, with lang', async () => {
    const m = await mountElement(h(LanguageFoot, { data: data({ ...DEFAULT_CONFIG, uiLanguage: 'auto' }, []) }))
    const button = m.container.querySelector<HTMLButtonElement>('button.o-lang')!
    expect(button.getAttribute('aria-label')).toBe(`${O.uiLanguageName}: ${O.uiLanguageAuto}`)
    expect(options(m.container).map(o => o.textContent)).toEqual([O.uiLanguageAuto, LOCALE_NAMES['zh-CN'], LOCALE_NAMES.en])
    expect(m.container.querySelector('[lang="zh-CN"]')?.textContent).toBe(LOCALE_NAMES['zh-CN'])
    expect(m.container.querySelector('[lang="en"]')).not.toBeNull()
    await m.unmount()
  })

  it('drawn before the settings arrive, the foot says no language — not the browser\'s, then the one chosen: its value held out of sight in its place, its name alone, nothing checked (S-O-49c\'s rule; Part 7\'s final review)', async () => {
    const loaded = data({ ...DEFAULT_CONFIG, uiLanguage: 'en' }, [])
    const m = await mountElement(h(LanguageFoot, { data: { ...loaded, config: null } }))
    const button = () => m.container.querySelector<HTMLButtonElement>('button.o-lang')!
    const value = () => button().querySelector<HTMLElement>('.o-lang-value')!
    expect([button().getAttribute('aria-label'), value().classList.contains('o-unknown')]).toEqual([O.uiLanguageName, true])
    expect(options(m.container).filter(o => o.getAttribute('aria-selected') === 'true')).toEqual([])
    await m.rerender(h(LanguageFoot, { data: loaded }))
    expect([button().getAttribute('aria-label'), value().textContent, value().classList.contains('o-unknown')]).toEqual([`${O.uiLanguageName}: ${LOCALE_NAMES.en}`, LOCALE_NAMES.en, false])
    await m.unmount()
  })

  it('drawn before the settings arrive, the menu opens on the language chosen, not on the browser\'s', async () => {
    const loaded = data({ ...DEFAULT_CONFIG, uiLanguage: 'en' }, [])
    const m = await mountElement(h(LanguageFoot, { data: { ...loaded, config: null } }))
    await m.rerender(h(LanguageFoot, { data: loaded }))
    const active = m.container.querySelector<HTMLElement>('[role="option"][data-active]')
    expect(active?.textContent).toBe(LOCALE_NAMES.en)
    expect(active?.getAttribute('aria-selected')).toBe('true')
    await m.unmount()
  })

  it('the row a search shows holds its value out of sight the same way until the settings are read (Part 7\'s final review)', async () => {
    const loaded = data({ ...DEFAULT_CONFIG, uiLanguage: 'en' }, [])
    const m = await mountElement(h(LanguageRow, { data: { ...loaded, config: null } }))
    const words = () => m.container.querySelector<HTMLElement>('.o-value-words')!
    expect(words().querySelector('.o-unknown')).not.toBeNull()
    await m.rerender(h(LanguageRow, { data: loaded }))
    expect([words().querySelector('.o-unknown'), words().textContent]).toEqual([null, LOCALE_NAMES.en])
    await m.unmount()
  })

  it('a pick writes the interface language; the current one writes nothing', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(LanguageFoot, { data: data({ ...DEFAULT_CONFIG, uiLanguage: 'en' }, patches) }))
    options(m.container)[2]!.click()
    options(m.container)[1]!.click()
    await m.flush()
    expect(patches.map(p => p.uiLanguage)).toEqual(['zh-CN'])
    await m.unmount()
  })

  it('the page draws one interface language control, the sidebar\'s own, with the menu the sheet places: at the foot, or at the title row\'s end in a narrow window (Task 103b)', async () => {
    state.data = data(DEFAULT_CONFIG, [])
    history.replaceState(null, '', '#')
    const content = { translate: () => null, appearance: () => null, reading: () => null, data: () => null }
    const m = await mountElement(h(App, { content }))
    const controls = m.container.querySelectorAll<HTMLButtonElement>('.o-lang')
    expect(controls.length).toBe(1)
    expect(controls[0]!.parentElement!.classList.contains('o-side')).toBe(true)
    const menu = document.getElementById(controls[0]!.getAttribute('popovertarget')!)
    expect(menu?.parentElement).toBe(controls[0]!.parentElement)
    expect(menu?.classList.contains('o-lang-menu')).toBe(true)
    await m.unmount()
  })

  it('a search for it shows the row that says where it lives, at either width: both places in its description, each marked for the width it is true at (the sheet shows one, Task 104b)', async () => {
    state.data = data(DEFAULT_CONFIG, [])
    history.replaceState(null, '', '#')
    const content = { translate: () => null, appearance: () => null, reading: () => null, data: () => null }
    const m = await mountElement(h(App, { content }))
    const input = m.container.querySelector<HTMLInputElement>('.o-search input')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'language')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await m.flush()
    const section = m.container.querySelector<HTMLElement>('section[data-section="language"]')!
    expect(section.hasAttribute('data-miss')).toBe(false)
    const description = section.querySelector('[data-row="language/ui"] .o-desc')!
    expect([description.querySelector('.o-wide')?.textContent, description.querySelector('.o-narrow')?.textContent]).toEqual([O.uiLanguageElsewhere, O.uiLanguageElsewhereNarrow])
    expect(O.uiLanguageElsewhereNarrow).not.toBe(O.uiLanguageElsewhere)
    await m.unmount()
  })

  it('a search finds the row by the setting\'s name, never by the place it names: a hint, and one of its two sentences is hidden at any width (Task 104b)', async () => {
    state.data = data(DEFAULT_CONFIG, [])
    history.replaceState(null, '', '#')
    const content = { translate: () => null, appearance: () => null, reading: () => null, data: () => null }
    const m = await mountElement(h(App, { content }))
    const input = m.container.querySelector<HTMLInputElement>('.o-search input')!
    const search = async (q: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, q)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await m.flush()
    }
    await search('language')
    const words = m.container.querySelector<HTMLElement>('[data-row="language/ui"]')!.dataset.search ?? ''
    expect(words).toContain(O.uiLanguage.toLowerCase())
    expect([words.includes(O.uiLanguageElsewhere.toLowerCase()), words.includes(O.uiLanguageElsewhereNarrow.toLowerCase())]).toEqual([false, false])
    await search(O.uiLanguageElsewhereNarrow)
    expect(m.container.querySelector('section[data-section="language"]')!.hasAttribute('data-miss')).toBe(true)
    await m.unmount()
  })
})
