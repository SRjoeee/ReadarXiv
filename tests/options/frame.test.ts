// The settings page's frame (the redesign's design, §6.1, §6.7): the four sections and the current one, the search over
// every section (only what is drawn is found; its count said politely), deep links with the old hashes' aliases, and
// the settings that cannot be read drawing the data section alone. The sections are the test's own (App's `content`)
import { createElement as h } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { OptionsData } from '@/entrypoints/options/data'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))
const state = vi.hoisted(() => ({ data: null as unknown }))
vi.mock('@/entrypoints/options/data', () => ({ useOptionsData: () => state.data }))

import { App } from '@/entrypoints/options/App'
import { parseHash } from '@/entrypoints/options/hash'
import { Card } from '@/entrypoints/options/ui/Card'
import { Row } from '@/entrypoints/options/ui/Row'
import { applySearch } from '@/entrypoints/options/ui/search'
import { O, setLocale } from '@/ui/strings'

// happy-dom draws nothing: a scroll is nothing to it
Element.prototype.scrollIntoView ??= () => {}

function data(over: Partial<OptionsData> = {}): OptionsData {
  return {
    config: DEFAULT_CONFIG as Config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => fn(DEFAULT_CONFIG), pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false, ...over,
  }
}
const CONTENT = {
  translate: () => h(Card, null, h(Row, { row: 'translate/prompts', kind: 'button', label: 'Prompt', onPress: () => {} }), h(Row, { label: 'Target language' })),
  appearance: () => h(Card, null, h(Row, { label: 'Highlight', description: 'On hover' }), h('div', { inert: true }, h(Row, { label: 'Dim highlighted pages' }))),
  reading: () => h(Card, null, h(Row, { label: 'Sync scrolling' })),
  data: () => h(Card, null, h(Row, { label: 'Saved translations' })),
}
const nav = (c: HTMLElement) => [...c.querySelectorAll<HTMLButtonElement>('nav button')]
const search = (c: HTMLElement) => c.querySelector<HTMLInputElement>('.o-search input')!
const type = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const drawn = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('section[data-section]')].filter(s => !s.hasAttribute('data-miss')).map(s => s.dataset.section)

describe('parseHash (§6.1)', () => {
  it('reads a section and a row, leads the old hashes to their new places, and falls back to the translation section', () => {
    expect(parseHash('#translate/prompts')).toEqual({ section: 'translate', row: 'prompts' })
    expect(parseHash('#reading')).toEqual({ section: 'reading' })
    expect(parseHash('#services')).toEqual({ section: 'translate', row: 'services' })
    expect(parseHash('#prompts')).toEqual({ section: 'translate', row: 'prompts' })
    expect(parseHash('#pdf-reader')).toEqual({ section: 'reading', row: 'pdf' })
    expect(parseHash('#constructor')).toEqual({ section: 'translate' })
    expect(parseHash('')).toEqual({ section: 'translate' })
  })
})

describe('applySearch (§6.1)', () => {
  it('finds a row by its words unless it is not shown; a card and a section with nothing found miss too', () => {
    const root = document.createElement('div')
    root.innerHTML = `<section data-section="a"><div data-card><div data-srow data-search="highlight on hover"></div><div data-srow data-search="colour"></div></div>
      <div data-card><div inert><div data-srow data-search="dim highlighted pages"></div></div></div></section>
      <section data-section="b"><div data-card><div data-srow data-search="sync"></div></div></section>`
    expect(applySearch(root, 'high')).toBe(1)
    const rows = [...root.querySelectorAll('[data-srow]')]
    expect(rows.map(r => r.hasAttribute('data-miss'))).toEqual([false, true, true, true])
    expect(rows[0]!.hasAttribute('data-first')).toBe(true)
    expect([...root.querySelectorAll('[data-card]')].map(c => c.hasAttribute('data-miss'))).toEqual([false, true, true])
    expect([...root.querySelectorAll('section')].map(s => s.hasAttribute('data-miss'))).toEqual([false, true])
    expect(applySearch(root, '')).toBe(0)
    expect(root.querySelector('[data-miss], [data-first]')).toBeNull()
  })

  it('never hides a deletion\'s undo row, the only way back — found or not, it keeps its card and section shown, and is no match itself (Part 7\'s final review, B-I1)', () => {
    const root = document.createElement('div')
    root.innerHTML = `<section data-section="a"><div data-card><div data-srow data-search="green colour"></div><div data-srow data-undo="blue"></div></div></section>`
    const undo = root.querySelector('[data-undo]')!
    expect(applySearch(root, 'colour')).toBe(1)
    expect(undo.hasAttribute('data-miss')).toBe(false)
    expect(applySearch(root, 'sync')).toBe(0)
    expect([undo.hasAttribute('data-miss'), root.querySelector('[data-card]')!.hasAttribute('data-miss'), root.querySelector('section')!.hasAttribute('data-miss')]).toEqual([false, false, false])
    expect(undo.hasAttribute('data-first')).toBe(true)
    // one in a list folded away (the prompts' list stays drawn while closed) shows nothing: it holds no card open
    root.innerHTML = `<section data-section="a"><div data-card><div data-srow data-search="prompt"></div><div inert><div data-srow data-undo="mine"></div></div></div></section>`
    expect(applySearch(root, 'sync')).toBe(0)
    expect([root.querySelector('[data-undo]')!.hasAttribute('data-miss'), root.querySelector('[data-card]')!.hasAttribute('data-miss')]).toEqual([true, true])
  })

  it('keeps the rows of a list a found row opens, open or not yet, so that opening it needs no second pass; a row found for its own words in a list whose row was not, alone (Part 7\'s final review, B-I2)', () => {
    const root = document.createElement('div')
    const list = (open: boolean) => `<div data-card><button data-srow data-search="prompt"></button>
      <div class="reveal"${open ? ' data-open' : ''}><div${open ? '' : ' inert'}><div data-srow data-search="default"></div><div data-srow data-search="new prompt"></div>
        <div class="reveal" data-open><div><div data-srow data-search="nested"></div></div></div></div></div></div>`
    for (const open of [true, false]) {
      root.innerHTML = `<section data-section="a">${list(open)}<div data-card><div data-srow data-search="sync"></div></div></section>`
      const rows = () => [...root.querySelectorAll('[data-srow]')].map(r => r.hasAttribute('data-miss'))
      // the row found; its list's rows, and a list inside that list, kept; only an open list's matches counted
      expect(applySearch(root, 'prompt'), `open: ${open}`).toBe(open ? 2 : 1)
      expect(rows(), `open: ${open}`).toEqual([false, false, false, false, true])
      // the list's own row not found: its rows as any others, found by their own words alone (and only when shown)
      expect(applySearch(root, 'default')).toBe(open ? 1 : 0)
      expect(rows()).toEqual([true, !open, true, true, true])
    }
  })
})

describe('the frame (§6.1)', () => {
  beforeEach(() => {
    setLocale('en')
    history.replaceState(null, '', '#')
    state.data = data()
  })

  it('lists the four sections, the current one marked; a press shows another and keeps it in the hash', async () => {
    const replace = vi.spyOn(history, 'replaceState')
    const m = await mountElement(h(App, { content: CONTENT }))
    expect(nav(m.container).map(b => b.textContent)).toEqual([O.sections.translate, O.sections.appearance, O.sections.reading, O.sections.data])
    expect(nav(m.container).map(b => b.getAttribute('aria-current'))).toEqual(['page', null, null, null])
    expect(drawn(m.container)).toEqual(['translate'])
    nav(m.container)[2]!.click()
    await m.flush()
    expect(drawn(m.container)).toEqual(['reading'])
    expect(replace).toHaveBeenLastCalledWith(null, '', '#reading')
    replace.mockRestore()
    await m.unmount()
  })

  it('a search shows every section\'s matches under its name, no section current, and says the count', async () => {
    const m = await mountElement(h(App, { content: CONTENT }))
    type(search(m.container), 'High')
    await m.flush()
    expect(drawn(m.container)).toEqual(['appearance'])
    expect(nav(m.container).every(b => !b.hasAttribute('aria-current'))).toBe(true)
    expect(m.container.querySelector('[role="status"]')!.textContent).toBe(O.search.found(1))
    expect(m.container.querySelector('mark')!.textContent).toBe('High')
    type(search(m.container), 'zzz')
    await m.flush()
    expect(m.container.querySelector('.o-empty')!.textContent).toContain(O.search.none('zzz'))
    search(m.container).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await m.flush()
    expect(search(m.container).value).toBe('')
    expect(drawn(m.container)).toEqual(['translate'])
    await m.unmount()
  })

  it('a deep link opens its section, lights its row once and gives it the focus; an old hash leads to its new place', async () => {
    history.replaceState(null, '', '#translate/prompts')
    const m = await mountElement(h(App, { content: CONTENT }))
    const row = m.container.querySelector<HTMLElement>('[data-row="translate/prompts"]')!
    expect(row.hasAttribute('data-flash')).toBe(true)
    expect(document.activeElement).toBe(row)
    await m.unmount()
    history.replaceState(null, '', '#pdf-reader')
    const again = await mountElement(h(App, { content: CONTENT }))
    expect(drawn(again.container)).toEqual(['reading'])
    await again.unmount()
  })

  it('settings that cannot be read (S-O-02): the notice with its reason and reset, and the data section alone', async () => {
    let reset = 0
    state.data = data({ fallbackReason: { kind: 'tooNew', stored: 99, supported: 1 }, reset: async () => { reset++; return DEFAULT_CONFIG } })
    history.replaceState(null, '', '#translate')
    const m = await mountElement(h(App, { content: CONTENT }))
    expect(nav(m.container).map(b => b.textContent)).toEqual([O.sections.data])
    expect(drawn(m.container)).toEqual(['data'])
    expect(m.container.textContent).toContain(O.fallbackNotice)
    const button = () => [...m.container.querySelectorAll('button')].find(b => b.textContent === O.fallbackReset || b.textContent === O.fallbackResetConfirm)!
    button().click()
    await m.flush()
    button().click()
    await m.flush()
    expect(reset).toBe(1)
    await m.unmount()
  })
})
