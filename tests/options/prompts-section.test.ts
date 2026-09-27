// The LLM group (the redesign's design, §6.3): one line with no LLM service; the prompts row and its list in place; a
// prompt read as words — variables as labels, in two named parts — and its {{token}} form kept through reading and
// writing; a built-in copied to be changed; one's own written in place when whole, a draft held when not; a variable
// inserted at the caret; new, delete with its undo; import and export
import { createElement as h, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { OptionsData } from '@/entrypoints/options/data'
import { BUILT_IN_PROMPTS, getTokenCellText } from '@/providers/prompt-library'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))
const wire = vi.hoisted(() => ({ downloads: [] as { name: string; text: string }[] }))
vi.mock('@/shared/download', () => ({ downloadTextFile: (name: string, text: string) => { wire.downloads.push({ name, text }) } }))

import { Llm } from '@/entrypoints/options/sections/Llm'
import { PromptText, promptParts, readPrompt } from '@/entrypoints/options/sections/PromptText'
import { UNDO_MS } from '@/entrypoints/options/ui/UndoRow'
import { drafts } from '@/ui/drafts'
import { O, S, setLocale } from '@/ui/strings'

const SVC = { id: 'svc-mine0000', kind: 'openai-compat' as const, name: 'Mine', baseURL: 'https://api.example.com/v1', apiKey: 'k', model: 'm', thinking: 'disabled' as const }
const MINE = { id: 'p-mine', name: 'My prompt', systemPrompt: `Translate into ${getTokenCellText('targetLanguage')} carefully.`, prompt: getTokenCellText('input') }
const LLM: Config = { ...DEFAULT_CONFIG, services: [SVC], provider: SVC.id }

function Harness({ start, patches }: { start: Config; patches: Config[] }) {
  const [config, setConfig] = useState(start)
  const data: OptionsData = {
    config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => { const next = fn(config); patches.push(next); setConfig(next); return next },
    pack: null, checkPack: async () => 'unsupported', fetchPack: async () => undefined,
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
  }
  return h(Llm, { data })
}
const promptsRow = (c: HTMLElement) => c.querySelector<HTMLButtonElement>('[data-row="translate/prompts"]')!
const radios = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>(`[role="radiogroup"][aria-label="${O.prompts.title}"] [role="radio"]`)]
const nameOf = (r: HTMLElement) => document.getElementById(r.getAttribute('aria-labelledby')!)!.textContent
const button = (c: HTMLElement, name: string) => [...c.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === name)!
const type = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const write = (el: HTMLElement, text: string) => {
  el.textContent = text
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('the LLM group (§6.3)', () => {
  beforeEach(() => { setLocale('en'); vi.useFakeTimers({ shouldAdvanceTime: true }); wire.downloads.length = 0 })
  afterEach(() => { vi.useRealTimers() })

  it('with no LLM service it is one line', async () => {
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, patches: [] }))
    expect(m.container.querySelector('[data-heading] h2')!.textContent).toBe(S.service.llm)
    expect(m.container.textContent).toContain(O.llm.empty)
    expect(m.container.querySelector('[data-row="translate/prompts"]')).toBeNull()
    await m.unmount()
  })

  it('the prompts row says the prompt in use; opened, a radio list — the built-ins, then one\'s own with O.prompts.mine', async () => {
    const start = { ...LLM, prompts: { promptId: 'default', patterns: [MINE] } }
    const m = await mountElement(h(Harness, { start, patches: [] }))
    expect(m.container.querySelector('.o-aside')!.textContent).toBe(O.llm.aside)
    expect(promptsRow(m.container).textContent).toContain('Default')
    expect(promptsRow(m.container).textContent).toContain(O.prompts.builtIn.default)
    promptsRow(m.container).click()
    await m.flush()
    expect(promptsRow(m.container).getAttribute('aria-expanded')).toBe('true')
    expect(radios(m.container).map(nameOf)).toEqual(['Default', 'Precision rewrite', `My prompt${O.prompts.mine}`])
    expect(m.container.textContent).toContain('Translate into Target language carefully.')
    await m.unmount()
  })

  it('the chosen built-in reads as words: variables as labels in the instructions and the message, never {{…}}; it is copied to be changed', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: LLM, patches }))
    promptsRow(m.container).click()
    await m.flush()
    const panel = m.container.querySelector<HTMLElement>('.o-prompt')!
    expect(panel.textContent).not.toContain('{{')
    expect([...panel.querySelectorAll('.o-var')].map(v => v.textContent)).toContain(O.prompts.tokens.targetLanguage)
    expect([...panel.querySelectorAll('.o-part-title b')].map(b => b.textContent)).toEqual([O.prompts.parts.system[0], O.prompts.parts.user[0]])
    expect(panel.textContent).toContain(O.prompts.locked)
    button(panel, O.prompts.copy).click()
    await m.flush()
    const prompts = patches.at(-1)!.prompts
    expect(prompts.patterns.at(-1)).toMatchObject({ name: O.prompts.copyOf('Default'), systemPrompt: BUILT_IN_PROMPTS.default!.systemPrompt, prompt: BUILT_IN_PROMPTS.default!.prompt })
    expect(prompts.promptId).toBe(prompts.patterns.at(-1)!.id)
    expect(document.activeElement).toBe(m.container.querySelector('.o-prompt input'))
    await m.unmount()
  })

  it('one\'s own is written in place when whole; an empty message is not written, holds a draft, and Done says why', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: { ...LLM, prompts: { promptId: MINE.id, patterns: [MINE] } }, patches }))
    promptsRow(m.container).click()
    await m.flush()
    const [system, message] = [...m.container.querySelectorAll<HTMLElement>('.o-prompt-text[data-editable]')]
    type(m.container.querySelector<HTMLInputElement>('.o-prompt input')!, 'Renamed')
    await m.flush()
    expect(patches.at(-1)!.prompts.patterns[0]!.name).toBe('Renamed')
    write(system!, 'Be brief.')
    await m.flush()
    expect(patches.at(-1)!.prompts.patterns[0]!.systemPrompt).toBe('Be brief.')
    const before = patches.length
    write(message!, '   ')
    await m.flush()
    expect(patches).toHaveLength(before)
    expect(drafts.any()).toBe(true)
    button(m.container, O.prompts.done).click()
    await m.flush()
    expect(m.container.textContent).toContain(O.prompts.messageEmpty)
    expect(promptsRow(m.container).getAttribute('aria-expanded')).toBe('true')
    await m.unmount()
  })

  it('a variable is inserted from the labels where the caret was, and written in its {{token}} form', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: { ...LLM, prompts: { promptId: MINE.id, patterns: [MINE] } }, patches }))
    promptsRow(m.container).click()
    await m.flush()
    const message = m.container.querySelectorAll<HTMLElement>('.o-prompt-text[data-editable]')[1]!
    message.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    const range = document.createRange()
    range.setStart(message, 0)
    range.collapse(true)
    getSelection()!.removeAllRanges()
    getSelection()!.addRange(range)
    ;[...m.container.querySelectorAll<HTMLButtonElement>('.o-vars button')].find(b => b.textContent === O.prompts.tokens.glossary)!.click()
    await m.flush()
    expect(patches.at(-1)!.prompts.patterns[0]!.prompt).toBe(`${getTokenCellText('glossary')}${getTokenCellText('input')}`)
    await m.unmount()
  })

  it('an arrow key in the open editor leaves the choice and the focus where they are; on a prompt\'s radio it still moves the choice', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: { ...LLM, prompts: { promptId: MINE.id, patterns: [MINE] } }, patches }))
    promptsRow(m.container).click()
    await m.flush()
    const arrow = (el: HTMLElement) => el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    // the editor's fields sit inside the radio group: their arrows are their own
    const name = m.container.querySelector<HTMLInputElement>('.o-prompt input')!
    name.focus()
    arrow(name)
    await m.flush()
    expect(document.activeElement).toBe(name)
    const message = m.container.querySelectorAll<HTMLElement>('.o-prompt-text[data-editable]')[1]!
    message.focus()
    arrow(message)
    await m.flush()
    expect(document.activeElement).toBe(message)
    expect(patches).toHaveLength(0)
    // the radios keep theirs: from the chosen one, the next prompt (wrapping to the first)
    arrow(radios(m.container)[2]!)
    await m.flush()
    expect(patches.at(-1)!.prompts.promptId).toBe('default')
    expect(document.activeElement).toBe(radios(m.container)[0])
    await m.unmount()
  })

  it('New prompt… makes a new prompt (O.prompts.newName), chosen and open; deleting one\'s own is undone within 5 s, and it comes back chosen', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: LLM, patches }))
    promptsRow(m.container).click()
    await m.flush()
    button(m.container, O.prompts.create).click()
    await m.flush()
    const made = patches.at(-1)!.prompts
    expect(made.patterns.at(-1)!.name).toBe(O.prompts.newName)
    expect(made.promptId).toBe(made.patterns.at(-1)!.id)
    button(m.container, O.prompts.delete).click()
    await m.flush()
    expect(patches.at(-1)!.prompts).toEqual({ promptId: 'default', patterns: [] })
    const undo = m.container.querySelector<HTMLElement>('[data-undo]')!
    expect(undo.textContent).toContain(O.undo.deleted(O.prompts.newName))
    button(undo, O.undo.undo).click()
    await m.flush()
    expect(patches.at(-1)!.prompts.promptId).toBe(made.promptId)
    button(m.container, O.prompts.delete).click()
    await m.flush()
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    // the expiry's update comes from a timer, outside act: settled before the list is read
    await m.flush()
    expect(m.container.querySelector('[data-undo]')).toBeNull()
    await m.unmount()
  })

  it('import adds the file\'s prompts and says how many; a file that is not JSON cannot be read; export shows once there is one of one\'s own', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: LLM, patches }))
    promptsRow(m.container).click()
    await m.flush()
    expect(button(m.container, O.prompts.export)).toBeUndefined()
    const input = m.container.querySelector<HTMLInputElement>('input[type="file"]')!
    const give = async (text: string) => {
      Object.defineProperty(input, 'files', { configurable: true, value: [new File([text], 'p.json', { type: 'application/json' })] })
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await m.flush()
      await m.flush()
    }
    await give('not json')
    expect(m.container.textContent).toContain(O.prompts.importFailed.cantRead)
    await give('[]')
    expect(m.container.textContent).toContain(O.prompts.importFailed.noPrompts)
    await give(JSON.stringify([{ name: 'Imported', prompt: '{{input}}' }]))
    expect(m.container.textContent).toContain(O.prompts.imported(1))
    expect(patches.at(-1)!.prompts.patterns.map(p => p.name)).toEqual(['Imported'])
    button(m.container, O.prompts.export).click()
    expect(JSON.parse(wire.downloads[0]!.text)).toEqual([{ name: 'Imported', systemPrompt: '', prompt: '{{input}}' }])
    await m.unmount()
  })
})

describe('a prompt read as words (§6.3)', () => {
  beforeEach(() => { setLocale('en') })

  it('keeps its {{token}} form through reading and writing: each built-in drawn and read back is itself', async () => {
    for (const p of Object.values(BUILT_IN_PROMPTS)) {
      for (const text of [p.systemPrompt, p.prompt]) {
        const m = await mountElement(h(PromptText, { text, label: 'x' }))
        expect(readPrompt(m.container.querySelector('.o-prompt-text')!)).toBe(text)
        await m.unmount()
      }
    }
    expect(promptParts(`a ${getTokenCellText('input')} b`)).toEqual([{ text: 'a ' }, { token: 'input' }, { text: ' b' }])
  })

  it('reads a line the browser broke with an element as one line', () => {
    const el = document.createElement('div')
    el.innerHTML = 'one<br>two<div>three</div><span data-token="input">Source text</span>'
    expect(readPrompt(el)).toBe(`one\ntwo\nthree${getTokenCellText('input')}`)
  })
})
