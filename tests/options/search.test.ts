// The settings page's search over the real sections (the redesign's design, §6.1; Part 7's final review): what the pass
// leaves shown besides the rows whose words hold the query — a deletion's undo row, the only way back, and the rows of a
// list opened from a row the search found. The data is a stand-in that keeps its state, as the page's does
import { createElement as h } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { OptionsData } from '@/entrypoints/options/data'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))
const start = vi.hoisted(() => ({ config: null as unknown }))
vi.mock('@/entrypoints/options/data', async () => {
  const { useRef, useState } = await import('react')
  return {
    useOptionsData: () => {
      const [config, setConfig] = useState(start.config as Config)
      const latest = useRef(config)
      return {
        config, fallbackReason: null, reset: async () => config, resetFailed: false,
        patch: async (fn: (c: Config) => Config) => { const next = fn(latest.current); latest.current = next; setConfig(next); return next },
        pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
        cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
      }
    },
  }
})

import { App } from '@/entrypoints/options/App'
import { Appearance } from '@/entrypoints/options/sections/Appearance'
import { Llm } from '@/entrypoints/options/sections/Llm'
import { Card } from '@/entrypoints/options/ui/Card'
import { Row } from '@/entrypoints/options/ui/Row'
import { O, setLocale } from '@/ui/strings'

// happy-dom draws nothing: a scroll is nothing to it
Element.prototype.scrollIntoView ??= () => {}

const SVC = { id: 'svc-mine0000', kind: 'openai-compat' as const, name: 'Mine', baseURL: 'https://api.example.com/v1', apiKey: 'k', model: 'm', thinking: 'disabled' as const }
const LLM: Config = { ...DEFAULT_CONFIG, services: [SVC], provider: SVC.id }
const plain = (label: string) => () => h(Card, null, h(Row, { label }))
const CONTENT = {
  translate: (d: OptionsData) => h(Llm, { data: d }),
  appearance: (d: OptionsData) => h(Appearance, { data: d }),
  reading: plain('Sync scrolling'),
  data: plain('Saved translations'),
}
const type = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const button = (c: HTMLElement, name: string) => [...c.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === name || b.getAttribute('aria-label') === name)!
/** hidden by the search: the row itself, or a card or a section around it */
const hidden = (el: Element) => el.closest('[data-miss]') !== null

async function searching(query: string, config: Config = DEFAULT_CONFIG) {
  start.config = config
  const m = await mountElement(h(App, { content: CONTENT }))
  type(m.container.querySelector<HTMLInputElement>('.o-search input')!, query)
  await m.flush()
  return m
}

describe('the search over the sections (Part 7\'s final review)', () => {
  beforeEach(() => { setLocale('en'); history.replaceState(null, '', '#') })

  it('a deletion made while a search runs leaves its undo row shown: the only way back is never filtered away (B-I1)', async () => {
    const m = await searching('colour')
    const pencil = button(m.container, O.appearance.edit('Green'))
    expect(hidden(pencil)).toBe(false)
    pencil.click()
    await m.flush()
    button(m.container, O.appearance.editor.delete).click()
    await m.flush()
    const undo = m.container.querySelector<HTMLElement>('[data-undo]')!
    expect(undo.textContent).toContain(O.undo.undo)
    expect([undo.hasAttribute('data-miss'), hidden(undo)]).toEqual([false, false])
    await m.unmount()
  })

  it('a list opened from a row the search found shows its rows: the prompts, the new-prompt row, import and export (B-I2)', async () => {
    const m = await searching('prompt', { ...LLM, prompts: { ...LLM.prompts, patterns: [{ id: 'mine', name: 'Terse', systemPrompt: 'Be terse.', prompt: 'Translate: {{input}}' }] } })
    const row = m.container.querySelector<HTMLButtonElement>('[data-row="translate/prompts"]')!
    expect(hidden(row)).toBe(false)
    row.click()
    await m.flush()
    const list = m.container.querySelector<HTMLElement>(`[role="radiogroup"][aria-label="${O.prompts.title}"]`)!
    const rows = [...list.querySelectorAll<HTMLElement>('[data-srow]')]
    // the two built-ins, one's own, the new-prompt row
    expect(rows.length).toBe(4)
    expect(rows.filter(hidden)).toEqual([])
    expect([O.prompts.create, O.prompts.import, O.prompts.export].map(name => hidden(button(list, name)))).toEqual([false, false, false])
    await m.unmount()
  })
})
