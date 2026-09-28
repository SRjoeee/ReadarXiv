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
import { LanguageFoot } from '@/entrypoints/options/sections/Language'
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

  it('drawn before the settings arrive, the menu opens on the language chosen, not on the browser\'s', async () => {
    const loaded = data({ ...DEFAULT_CONFIG, uiLanguage: 'en' }, [])
    const m = await mountElement(h(LanguageFoot, { data: { ...loaded, config: null } }))
    await m.rerender(h(LanguageFoot, { data: loaded }))
    const active = m.container.querySelector<HTMLElement>('[role="option"][data-active]')
    expect(active?.textContent).toBe(LOCALE_NAMES.en)
    expect(active?.getAttribute('aria-selected')).toBe('true')
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

  it('a search for it shows the row that says where it lives', async () => {
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
    expect(section.querySelector('[data-row="language/ui"]')!.textContent).toContain(O.uiLanguageElsewhere)
    await m.unmount()
  })
})
