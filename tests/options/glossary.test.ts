// The glossary's table (the redesign's design, §6.3): the stored pairs and one empty row to add to; a row saved once it
// is whole, a row missing a side saying so once the focus leaves it, a draft held meanwhile; removing; pasting lines;
// the limits; a glossary saved elsewhere followed unless a row of the reader's is unfinished
import { createElement as h } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { OptionsData } from '@/entrypoints/options/data'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))

import { GlossaryTable, entriesOf } from '@/entrypoints/options/sections/Glossary'
import { drafts } from '@/ui/drafts'
import { O, setLocale } from '@/ui/strings'

function data(config: Config, patches: Config[] = []): OptionsData {
  return {
    config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => { const next = fn(config); patches.push(next); return next },
    pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
  }
}
const WITH = (glossary: Config['glossary']): Config => ({ ...DEFAULT_CONFIG, glossary })
const cells = (c: HTMLElement) => [...c.querySelectorAll<HTMLInputElement>('.o-gloss input')]
const type = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const paste = (input: HTMLInputElement, text: string) => {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } })
  input.dispatchEvent(event)
}

describe('the glossary\'s table (§6.3)', () => {
  beforeEach(() => { setLocale('en') })

  it('draws the stored pairs, one a row, and an empty row at the end; each row\'s remove button is named by its number', async () => {
    const m = await mountElement(h(GlossaryTable, { data: data(WITH([{ term: 'token', translation: '词元' }, { term: 'embedding', translation: '嵌入' }])) }))
    expect(cells(m.container).map(i => i.value)).toEqual(['token', '词元', 'embedding', '嵌入', '', ''])
    expect([...m.container.querySelectorAll('.o-gloss-remove')].map(b => b.getAttribute('aria-label'))).toEqual([O.glossary.remove(1), O.glossary.remove(2)])
    await m.unmount()
  })

  it('typing in the empty row makes a row, keeps the caret there, and draws a new empty row; whole, it is saved', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(GlossaryTable, { data: data(WITH([]), patches) }))
    type(cells(m.container)[0]!, 'a')
    await m.flush()
    expect(cells(m.container).map(i => i.value)).toEqual(['a', '', '', ''])
    expect(document.activeElement).toBe(cells(m.container)[0])
    expect(patches).toEqual([])
    expect(drafts.any()).toBe(true)
    type(cells(m.container)[1]!, 'b')
    await m.flush()
    expect(patches.at(-1)!.glossary).toEqual([{ term: 'a', translation: 'b' }])
    expect(drafts.any()).toBe(false)
    await m.unmount()
  })

  it('a row missing a side says so once the focus has left it, and Enter goes on to the empty row', async () => {
    const m = await mountElement(h(GlossaryTable, { data: data(WITH([])) }))
    type(cells(m.container)[0]!, 'token')
    await m.flush()
    expect(m.container.querySelector('.o-gloss-issue')).toBeNull()
    cells(m.container)[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await m.flush()
    expect(document.activeElement).toBe(cells(m.container)[2])
    cells(m.container)[0]!.closest('.o-gloss-line')!.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: cells(m.container)[2]! }))
    await m.flush()
    expect(m.container.querySelector('.o-gloss-issue')!.textContent).toBe(O.glossary.issue.emptyTarget)
    await m.unmount()
  })

  it('a row removed is saved without it', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(GlossaryTable, { data: data(WITH([{ term: 'a', translation: '1' }, { term: 'b', translation: '2' }]), patches) }))
    m.container.querySelector<HTMLButtonElement>('.o-gloss-remove')!.click()
    await m.flush()
    expect(patches.at(-1)!.glossary).toEqual([{ term: 'b', translation: '2' }])
    await m.unmount()
  })

  it('pasting lines of "source, translation" pairs splits them into rows; a line without its other side says so at once', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(GlossaryTable, { data: data(WITH([]), patches) }))
    paste(cells(m.container)[0]!, 'token, 词元\n# a comment\nembedding，嵌入\nattention\n')
    await m.flush()
    expect(cells(m.container).map(i => i.value)).toEqual(['token', '词元', 'embedding', '嵌入', 'attention', '', '', ''])
    expect(patches.at(-1)!.glossary).toEqual([{ term: 'token', translation: '词元' }, { term: 'embedding', translation: '嵌入' }])
    expect([...m.container.querySelectorAll('.o-gloss-issue')].map(e => e.textContent)).toEqual([O.glossary.issue.emptyTarget])
    await m.unmount()
  })

  it('a table over the limits saves nothing and says so', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(GlossaryTable, { data: data(WITH([]), patches) }))
    paste(cells(m.container)[0]!, Array.from({ length: 201 }, (_, i) => `t${i}, r${i}`).join('\n'))
    await m.flush()
    expect(patches).toEqual([])
    expect(m.container.textContent).toContain(O.glossary.tooBig)
    await m.unmount()
  })

  it('follows a glossary saved elsewhere — not while a row of the reader\'s is unfinished', async () => {
    const m = await mountElement(h(GlossaryTable, { data: data(WITH([{ term: 'a', translation: '1' }])) }))
    await m.rerender(h(GlossaryTable, { data: data(WITH([{ term: 'a', translation: '1' }, { term: 'b', translation: '2' }])) }))
    expect(cells(m.container).map(i => i.value)).toEqual(['a', '1', 'b', '2', '', ''])
    type(cells(m.container)[4]!, 'c')
    await m.flush()
    await m.rerender(h(GlossaryTable, { data: data(WITH([{ term: 'z', translation: '9' }])) }))
    expect(cells(m.container)[0]!.value).toBe('a')
    await m.unmount()
  })

  it('keeps a later row of the same term, in the first one\'s place', () => {
    expect(entriesOf([{ term: 'a', translation: '1' }, { term: 'b', translation: '2' }, { term: ' a ', translation: '3' }, { term: 'c', translation: '' }]))
      .toEqual([{ term: 'a', translation: '3' }, { term: 'b', translation: '2' }])
  })
})
