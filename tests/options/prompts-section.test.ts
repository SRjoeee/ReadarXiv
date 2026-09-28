// The LLM group (the redesign's design, §6.3): one line with no LLM service; the prompts row and its list in place; a
// prompt read as words — variables as labels, in two named parts — and its {{token}} form kept through reading and
// writing; a built-in copied to be changed; one's own written in place when whole, a draft held when not; a variable
// inserted at the caret; new, delete with its undo; import and export. Fix round 1 (the review of Task 63): the focus
// on undo, on expiry and on a prompt chosen again; the list drawn only while open and an edit written as the fields it
// changed; the message's error wired and cleared; a line read as the browser draws it; import's names, shapes and ids.
// Fix round 2: the list stays drawn while closed, so that a deletion's undo keeps its 5 s; only the editor goes.
// Task 65: a deletion storage refused leaves its row, which takes back the focus, and says so; an undo storage refused
// brings its undo row back
import { createElement as h, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { OptionsData } from '@/entrypoints/options/data'
import { BUILT_IN_PROMPTS, getTokenCellText } from '@/providers/prompt-library'
import { deferred, mountElement } from '../ui/render-hook'

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

/**
 * `tab.set`: the configuration changed from elsewhere (another tab), as the page's store would hand it over. `gate`:
 * the writes wait for it; rejected, storage refused them (Task 65); `unreadable`, the stored value cannot be read, and
 * the data layer answers with the defaults the change ran on (surface-config.ts, data.ts; round 2)
 */
function Harness({ start, patches, tab, gate }: { start: Config; patches: Config[]; tab?: { set?: (c: Config) => void }; gate?: { promise: Promise<unknown>; unreadable?: boolean } }) {
  const [config, setConfig] = useState(start)
  if (tab) tab.set = setConfig
  const data: OptionsData = {
    config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => {
      if (gate) await gate.promise
      if (gate?.unreadable) { fn(DEFAULT_CONFIG); return DEFAULT_CONFIG }
      const next = fn(config); patches.push(next); setConfig(next); return next
    },
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
const arrow = (el: HTMLElement, key: string) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
const editable = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('.o-prompt-text[data-editable]')]
const nameField = (c: HTMLElement) => c.querySelector<HTMLInputElement>('.o-prompt input')!
/** a file handed to the import's input, the input's reset recorded */
const give = async (m: { container: HTMLElement; flush: () => Promise<void> }, text: string) => {
  const input = m.container.querySelector<HTMLInputElement>('input[type="file"]')!
  const reset = { done: false }
  Object.defineProperty(input, 'files', { configurable: true, value: [new File([text], 'p.json', { type: 'application/json' })] })
  Object.defineProperty(input, 'value', { configurable: true, get: () => '', set: (v: string) => { if (v === '') reset.done = true } })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await m.flush()
  await m.flush()
  return reset
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

  it('in a Chinese interface the built-ins are named in its language — the row, the radios, a copy — and one\'s own as given (Task 103b)', async () => {
    setLocale('zh-CN')
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: { ...LLM, prompts: { promptId: 'default', patterns: [MINE] } }, patches }))
    const names = O.prompts.builtInNames
    expect(names.default).not.toBe(BUILT_IN_PROMPTS.default!.name)
    expect(promptsRow(m.container).textContent).toContain(names.default)
    promptsRow(m.container).click()
    await m.flush()
    expect(radios(m.container).map(nameOf)).toEqual([names.default, names['precision-rewrite'], `${MINE.name}${O.prompts.mine}`])
    button(m.container.querySelector<HTMLElement>('.o-prompt')!, O.prompts.copy).click()
    await m.flush()
    expect(patches.at(-1)!.prompts.patterns.at(-1)!.name).toBe(O.prompts.copyOf(names.default))
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

describe('the LLM group, fix round 1 (the review of Task 63)', () => {
  beforeEach(() => { setLocale('en'); vi.useFakeTimers({ shouldAdvanceTime: true }); wire.downloads.length = 0 })
  afterEach(() => { vi.useRealTimers() })

  it('undo sends the focus to the restored prompt\'s radio; an undo row that expires holding the focus sends it to the new-prompt row (item 2)', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: { ...LLM, prompts: { promptId: MINE.id, patterns: [MINE] } }, patches }))
    promptsRow(m.container).click()
    await m.flush()
    button(m.container, O.prompts.delete).click()
    await m.flush()
    button(m.container.querySelector<HTMLElement>('[data-undo]')!, O.undo.undo).click()
    await m.flush()
    await vi.advanceTimersByTimeAsync(50)
    await m.flush()
    expect(patches.at(-1)!.prompts.promptId).toBe(MINE.id)
    expect(document.activeElement).toBe(radios(m.container)[2])
    button(m.container, O.prompts.delete).click()
    await m.flush()
    // the keyboard's deletion: the undo row's button holds the focus
    expect(document.activeElement).toBe(button(m.container.querySelector<HTMLElement>('[data-undo]')!, O.undo.undo))
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    await m.flush()
    expect(m.container.querySelector('[data-undo]')).toBeNull()
    expect(document.activeElement).toBe(button(m.container, O.prompts.create))
    await m.unmount()
  })

  it('a prompt just made takes the focus into its name field once: arrowed off it and back, the focus stays on its radio (item 3)', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: LLM, patches }))
    promptsRow(m.container).click()
    await m.flush()
    button(m.container, O.prompts.create).click()
    await m.flush()
    expect(document.activeElement).toBe(nameField(m.container))
    const made = patches.at(-1)!.prompts.promptId
    radios(m.container)[2]!.focus()
    arrow(radios(m.container)[2]!, 'ArrowUp')
    await m.flush()
    expect(patches.at(-1)!.prompts.promptId).toBe('precision-rewrite')
    arrow(radios(m.container)[1]!, 'ArrowDown')
    await m.flush()
    expect(patches.at(-1)!.prompts.promptId).toBe(made)
    expect(document.activeElement).toBe(radios(m.container)[2])
    await m.unmount()
  })

  it('the editor is drawn only while the list is open: a draft is held only while it is, and a prompt renamed elsewhere meanwhile opens with its new name (item 4)', async () => {
    const patches: Config[] = []
    const tab: { set?: (c: Config) => void } = {}
    const m = await mountElement(h(Harness, { start: { ...LLM, prompts: { promptId: MINE.id, patterns: [MINE] } }, patches, tab }))
    promptsRow(m.container).click()
    await m.flush()
    write(editable(m.container)[1]!, ' ')
    await m.flush()
    expect(drafts.any()).toBe(true)
    promptsRow(m.container).click()
    await m.flush()
    // the fold (§8), then the list is gone, and its draft with it
    await vi.advanceTimersByTimeAsync(200)
    await m.flush()
    expect(editable(m.container)).toHaveLength(0)
    expect(drafts.any()).toBe(false)
    tab.set!({ ...LLM, prompts: { promptId: MINE.id, patterns: [{ ...MINE, name: 'Other tab' }] } })
    await m.flush()
    promptsRow(m.container).click()
    await m.flush()
    expect(nameField(m.container).value).toBe('Other tab')
    await m.unmount()
  })

  it('an edit writes the fields changed here onto the prompt as stored now: another tab\'s name and message stand (item 4)', async () => {
    const patches: Config[] = []
    const tab: { set?: (c: Config) => void } = {}
    const m = await mountElement(h(Harness, { start: { ...LLM, prompts: { promptId: MINE.id, patterns: [MINE] } }, patches, tab }))
    promptsRow(m.container).click()
    await m.flush()
    const elsewhere = { ...MINE, name: 'Other tab', prompt: `Other ${getTokenCellText('input')}` }
    tab.set!({ ...LLM, prompts: { promptId: MINE.id, patterns: [elsewhere] } })
    await m.flush()
    write(editable(m.container)[0]!, 'Be brief.')
    await m.flush()
    expect(patches.at(-1)!.prompts.patterns).toEqual([{ ...elsewhere, systemPrompt: 'Be brief.' }])
    await m.unmount()
  })

  it('a name changed while the message was empty is written with the message that makes the prompt whole (item 4)', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: { ...LLM, prompts: { promptId: MINE.id, patterns: [MINE] } }, patches }))
    promptsRow(m.container).click()
    await m.flush()
    const message = editable(m.container)[1]!
    write(message, ' ')
    await m.flush()
    type(nameField(m.container), 'Renamed')
    await m.flush()
    expect(patches).toHaveLength(0)
    write(message, `Say ${getTokenCellText('input')}`)
    await m.flush()
    expect(patches.at(-1)!.prompts.patterns).toEqual([{ ...MINE, name: 'Renamed', prompt: `Say ${getTokenCellText('input')}` }])
    await m.unmount()
  })

  it('the message\'s error is wired to its field, and an error goes once its field is whole again (items 5 and 6)', async () => {
    const m = await mountElement(h(Harness, { start: { ...LLM, prompts: { promptId: MINE.id, patterns: [MINE] } }, patches: [] }))
    promptsRow(m.container).click()
    await m.flush()
    const message = editable(m.container)[1]!
    write(message, ' ')
    await m.flush()
    button(m.container, O.prompts.done).click()
    await m.flush()
    expect(message.getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById(message.getAttribute('aria-describedby')!)!.textContent).toBe(O.prompts.messageEmpty)
    write(message, getTokenCellText('input'))
    await m.flush()
    expect(m.container.textContent).not.toContain(O.prompts.messageEmpty)
    expect(message.hasAttribute('aria-invalid')).toBe(false)
    expect(message.hasAttribute('aria-describedby')).toBe(false)
    type(nameField(m.container), ' ')
    await m.flush()
    button(m.container, O.prompts.done).click()
    await m.flush()
    expect(m.container.textContent).toContain(O.prompts.nameEmpty)
    type(nameField(m.container), 'Named')
    await m.flush()
    expect(m.container.textContent).not.toContain(O.prompts.nameEmpty)
    await m.unmount()
  })

  it('import: names trimmed and never empty; a file of another shape holds no prompts; each prompt a fresh id; the input reset (items 8 and 10)', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: LLM, patches }))
    promptsRow(m.container).click()
    await m.flush()
    const shape = await give(m, JSON.stringify({ name: 'Not a list', prompt: '{{input}}' }))
    expect(m.container.textContent).toContain(O.prompts.importFailed.noPrompts)
    expect(shape.done).toBe(true)
    expect(patches).toHaveLength(0)
    const file = [{ id: 'from-file', name: '  Spaced  ', prompt: '{{input}}' }, { id: 'from-file', name: '   ', prompt: '{{input}}' }]
    const reset = await give(m, JSON.stringify(file))
    expect(reset.done).toBe(true)
    const patterns = patches.at(-1)!.prompts.patterns
    expect(patterns.map(p => p.name)).toEqual(['Spaced', O.prompts.newName])
    const ids = patterns.map(p => p.id)
    expect(ids).not.toContain('from-file')
    expect(new Set(ids).size).toBe(2)
    await m.unmount()
  })

  it('undo puts a prompt back at its place among two of one\'s own (item 10)', async () => {
    const patches: Config[] = []
    const other = { ...MINE, id: 'p-other', name: 'Other' }
    const m = await mountElement(h(Harness, { start: { ...LLM, prompts: { promptId: MINE.id, patterns: [MINE, other] } }, patches }))
    promptsRow(m.container).click()
    await m.flush()
    button(m.container, O.prompts.delete).click()
    await m.flush()
    expect(patches.at(-1)!.prompts.patterns.map(p => p.id)).toEqual(['p-other'])
    button(m.container.querySelector<HTMLElement>('[data-undo]')!, O.undo.undo).click()
    await m.flush()
    expect(patches.at(-1)!.prompts).toEqual({ promptId: MINE.id, patterns: [MINE, other] })
    await m.unmount()
  })
})

describe('the LLM group, fix round 2 (the re-review of Task 63)', () => {
  beforeEach(() => { setLocale('en'); vi.useFakeTimers({ shouldAdvanceTime: true }); wire.downloads.length = 0 })
  afterEach(() => { vi.useRealTimers() })

  it('a deletion is undone for its 5 s though the list is closed meanwhile: reopened within them, the undo row is there and undoes', async () => {
    const patches: Config[] = []
    const m = await mountElement(h(Harness, { start: { ...LLM, prompts: { promptId: MINE.id, patterns: [MINE] } }, patches }))
    promptsRow(m.container).click()
    await m.flush()
    button(m.container, O.prompts.delete).click()
    await m.flush()
    expect(patches.at(-1)!.prompts).toEqual({ promptId: 'default', patterns: [] })
    promptsRow(m.container).click()
    await m.flush()
    await vi.advanceTimersByTimeAsync(1000)
    await m.flush()
    promptsRow(m.container).click()
    await m.flush()
    const undo = m.container.querySelector<HTMLElement>('[data-undo]')
    expect(undo?.textContent).toContain(O.undo.deleted(MINE.name))
    button(undo!, O.undo.undo).click()
    await m.flush()
    expect(patches.at(-1)!.prompts).toEqual({ promptId: MINE.id, patterns: [MINE] })
    await m.unmount()
  })

  it.each(['rejects', 'is refused as unreadable'] as const)('a deletion whose write %s leaves the prompt\'s row, with the focus its undo row held, no undo row, and the line at the list\'s foot; the next write that lands takes the line away (Task 65; round 2, items 1 and 2)', async how => {
    const patches: Config[] = []
    const gate: { promise: Promise<unknown>; unreadable?: boolean } = { promise: Promise.resolve() }
    const m = await mountElement(h(Harness, { start: { ...LLM, prompts: { promptId: MINE.id, patterns: [MINE] } }, patches, gate }))
    promptsRow(m.container).click()
    await m.flush()
    const write = deferred<void>()
    gate.promise = write.promise
    gate.unreadable = how !== 'rejects'
    button(m.container, O.prompts.delete).click()
    await m.flush()
    // the keyboard's deletion: the undo row's button holds the focus
    expect(document.activeElement?.closest('[data-undo]')).not.toBeNull()
    if (how === 'rejects') write.reject(new Error('refused'))
    else write.resolve()
    await m.flush()
    gate.promise = Promise.resolve()
    gate.unreadable = false
    const mine = radios(m.container).find(r => nameOf(r) === `My prompt${O.prompts.mine}`)
    expect(mine).toBeDefined()
    expect(m.container.querySelector('[data-undo]')).toBeNull()
    expect(document.activeElement).toBe(mine)
    const list = m.container.querySelector<HTMLElement>(`[role="radiogroup"][aria-label="${O.prompts.title}"]`)!
    const note = list.querySelector<HTMLElement>('.o-list-note')!
    expect(note.getAttribute('role')).toBe('status')
    expect(note.textContent).toBe(O.saveFailed)
    expect(list.lastElementChild).toBe(note)
    radios(m.container)[0]!.click()
    await m.flush()
    expect(patches.at(-1)!.prompts.promptId).toBe('default')
    expect(list.querySelector('.o-list-note')).toBeNull()
    await m.unmount()
  })

  it('import says it imported only once its write has landed: nothing while the write is out (Part 7\'s final review, B-M5)', async () => {
    const patches: Config[] = []
    const gate: { promise: Promise<unknown>; unreadable?: boolean } = { promise: Promise.resolve() }
    const m = await mountElement(h(Harness, { start: LLM, patches, gate }))
    promptsRow(m.container).click()
    await m.flush()
    const write = deferred<void>()
    gate.promise = write.promise
    await give(m, JSON.stringify([{ name: 'Imported', prompt: '{{input}}' }]))
    expect(m.container.textContent).not.toContain(O.prompts.imported(1))
    write.resolve()
    await m.flush()
    expect(patches.at(-1)!.prompts.patterns.map(p => p.name)).toEqual(['Imported'])
    expect(m.container.querySelector('.o-list-note')!.textContent).toBe(O.prompts.imported(1))
    await m.unmount()
  })

  it.each(['rejects', 'is refused as unreadable'] as const)('an import whose write %s says the save failed, never that it imported (Part 7\'s final review, B-M5)', async how => {
    const patches: Config[] = []
    const gate: { promise: Promise<unknown>; unreadable?: boolean } = { promise: Promise.resolve() }
    const m = await mountElement(h(Harness, { start: LLM, patches, gate }))
    promptsRow(m.container).click()
    await m.flush()
    const write = deferred<void>()
    gate.promise = write.promise
    gate.unreadable = how !== 'rejects'
    await give(m, JSON.stringify([{ name: 'Imported', prompt: '{{input}}' }]))
    if (how === 'rejects') write.reject(new Error('refused'))
    else write.resolve()
    await m.flush()
    expect(patches).toEqual([])
    expect(m.container.textContent).not.toContain(O.prompts.imported(1))
    const note = m.container.querySelector<HTMLElement>('.o-list-note')!
    expect([note.getAttribute('role'), note.textContent]).toEqual(['status', O.saveFailed])
    await m.unmount()
  })

  it('an undo storage refused: the prompt stays deleted, its undo row comes back with a fresh 5 s and the focus, and the list\'s foot says so (round 3, item 3)', async () => {
    const patches: Config[] = []
    const gate: { promise: Promise<unknown>; unreadable?: boolean } = { promise: Promise.resolve() }
    const m = await mountElement(h(Harness, { start: { ...LLM, prompts: { promptId: MINE.id, patterns: [MINE] } }, patches, gate }))
    promptsRow(m.container).click()
    await m.flush()
    button(m.container, O.prompts.delete).click()
    await m.flush()
    await vi.advanceTimersByTimeAsync(4000)
    const write = deferred<void>()
    gate.promise = write.promise
    button(m.container.querySelector<HTMLElement>('[data-undo]')!, O.undo.undo).click()
    await m.flush()
    write.reject(new Error('refused'))
    await m.flush()
    gate.promise = Promise.resolve()
    expect(radios(m.container).map(nameOf)).not.toContain(`My prompt${O.prompts.mine}`)
    const back = m.container.querySelector<HTMLElement>('[data-undo]')!
    expect(back.textContent).toContain(O.undo.deleted(MINE.name))
    expect(document.activeElement).toBe(button(back, O.undo.undo))
    expect(m.container.querySelector('.o-list-note')!.textContent).toBe(O.saveFailed)
    await vi.advanceTimersByTimeAsync(2000)
    await m.flush()
    expect(m.container.querySelector('[data-undo]')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(UNDO_MS - 2000)
    await m.flush()
    expect(m.container.querySelector('[data-undo]')).toBeNull()
    await m.unmount()
  })

  it('the import\'s note is gone once the list has been closed and opened again', async () => {
    const m = await mountElement(h(Harness, { start: LLM, patches: [] }))
    promptsRow(m.container).click()
    await m.flush()
    await give(m, JSON.stringify([{ name: 'Imported', prompt: '{{input}}' }]))
    expect(m.container.textContent).toContain(O.prompts.imported(1))
    promptsRow(m.container).click()
    await m.flush()
    await vi.advanceTimersByTimeAsync(200)
    await m.flush()
    promptsRow(m.container).click()
    await m.flush()
    expect(m.container.textContent).not.toContain(O.prompts.imported(1))
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

  it('reads a line the browser broke with an element as one line; a block starts a line and so does what follows it, an inline element does not (fix round 1, item 7)', () => {
    const el = document.createElement('div')
    const read = (html: string) => { el.innerHTML = html; return readPrompt(el) }
    expect(read('one<br>two<div>three</div><span data-token="input">Source text</span>')).toBe(`one\ntwo\nthree\n${getTokenCellText('input')}`)
    expect(read('a<span>b</span>c')).toBe('abc')
    expect(read('<div>one</div>two')).toBe('one\ntwo')
  })
})
