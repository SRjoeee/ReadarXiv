import { describe, expect, it } from 'vitest'
import { withSaved } from '@/entrypoints/options/PromptManager'
import type { PromptTemplate } from '@/providers/prompt-library'

// The prompt editor's save (options/PromptManager.tsx): a draft is never lost to a list that moved under it

const template = (id: string, name = id): PromptTemplate => ({ id, name, systemPrompt: 'system', prompt: 'user' })

describe('withSaved', () => {
  it('an edit replaces its template in place', () => {
    const saved = withSaved([template('a'), template('b')], 'edit', template('a', 'A edited'))
    expect(saved.map(p => p.name)).toEqual(['A edited', 'b'])
  })

  it('an edit of a template deleted elsewhere while the editor was open appends the draft rather than dropping it', () => {
    // The sixth local pass of S1: the list followed the deletion, the save mapped over it, found nothing, and closed
    // the editor reporting success
    const saved = withSaved([template('b')], 'edit', template('a', 'A edited'))
    expect(saved.map(p => p.name)).toEqual(['b', 'A edited'])
  })

  it('a new template and a copy append', () => {
    expect(withSaved([template('a')], 'new', template('n')).map(p => p.id)).toEqual(['a', 'n'])
    expect(withSaved([template('a')], 'copy', template('c')).map(p => p.id)).toEqual(['a', 'c'])
  })
})

// --- The manager hands the store an update of the configuration as stored, not a copy of what it last saw
import { createElement } from 'react'
import { beforeEach, vi } from 'vitest'
import { type PromptsUpdate, PromptManager } from '@/entrypoints/options/PromptManager'
import type { PromptsConfig } from '@/providers/prompt-library'
import { O, setLocale } from '@/ui/strings'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))

const buttonNamed = (container: HTMLElement, label: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent === label)
const typeInto = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('PromptManager: changes are updates of the stored prompts', () => {
  beforeEach(() => { setLocale('en') })

  it('a new prompt is appended to the list as stored when the write runs, not to the list this tab saw', async () => {
    // Codex on #185: a prompt added in another tab while this tab's refresh was still queued was dropped by a list
    // built from the stale copy
    const seen: PromptsConfig = { patterns: [template('a')], promptId: 'a' }
    const updates: PromptsUpdate[] = []
    const mounted = await mountElement(createElement(PromptManager, { value: seen, onChange: (update: PromptsUpdate) => { updates.push(update) } }))
    buttonNamed(mounted.container, O.prompts.manager.create)?.click()
    await mounted.flush()
    const name = Array.from(mounted.container.querySelectorAll('input')).find(i => i.type === 'text' || !i.getAttribute('type')) as HTMLInputElement
    typeInto(name, 'Mine')
    await mounted.flush()
    buttonNamed(mounted.container, O.prompts.manager.addToList)?.click()
    await mounted.flush()
    expect(updates).toHaveLength(1)
    const stored: PromptsConfig = { patterns: [template('a'), template('b')], promptId: 'b' }
    const next = updates[0]!(stored)
    expect(next.patterns.map(p => p.name)).toEqual(['a', 'b', 'Mine'])
    expect(next.promptId).toBe('b')
    await mounted.unmount()
  })

  it('choosing a prompt deleted elsewhere before this tab caught up keeps the stored choice', async () => {
    // The thirteenth local pass of S1: the id would have been stored dangling, and translation would have used neither
    // the requested prompt nor the one chosen before
    const seen: PromptsConfig = { patterns: [template('a')], promptId: 'b' }
    const updates: PromptsUpdate[] = []
    const mounted = await mountElement(createElement(PromptManager, { value: seen, onChange: (update: PromptsUpdate) => { updates.push(update) } }))
    const radios = Array.from(mounted.container.querySelectorAll('input[type="radio"]')) as HTMLInputElement[]
    radios.at(-1)?.click()
    await mounted.flush()
    expect(updates).toHaveLength(1)
    expect(updates[0]!({ patterns: [template('b')], promptId: 'b' }).promptId).toBe('b')
    expect(updates[0]!({ patterns: [template('a'), template('b')], promptId: 'b' }).promptId).toBe('a')
    await mounted.unmount()
  })

  it('a deletion removes the prompt from the list as stored, keeping what was added elsewhere', async () => {
    const seen: PromptsConfig = { patterns: [template('a')], promptId: 'a' }
    const updates: PromptsUpdate[] = []
    const mounted = await mountElement(createElement(PromptManager, { value: seen, onChange: (update: PromptsUpdate) => { updates.push(update) } }))
    // Two clicks, as every destructive action on the settings page (ui/Confirm.tsx): the first arms, the second deletes
    buttonNamed(mounted.container, O.prompts.manager.remove)?.click()
    await mounted.flush()
    expect(updates).toHaveLength(0)
    buttonNamed(mounted.container, O.prompts.manager.removeConfirm)?.click()
    await mounted.flush()
    expect(updates).toHaveLength(1)
    const next = updates[0]!({ patterns: [template('a'), template('b')], promptId: 'a' })
    expect(next.patterns.map(p => p.id)).toEqual(['b'])
    expect(next.promptId).not.toBe('a')
    await mounted.unmount()
  })
})

// ── import, export and variable insertion (INVENTORY §4.5) ─────────────────────────────────────────────────────────────
import { PROMPT_FILE_NAME, serializePrompts } from '@/providers/prompt-file'

const downloads: [string, string, string][] = []
vi.mock('@/shared/download', () => ({ downloadTextFile: vi.fn((name: string, text: string, type: string) => { downloads.push([name, text, type]) }) }))

const areaOf = (container: HTMLElement, index: number) => Array.from(container.querySelectorAll('textarea'))[index] as HTMLTextAreaElement

describe('PromptManager: import, export and variable insertion', () => {
  beforeEach(() => { setLocale('en'); downloads.length = 0 })

  it('a variable chip lands at the caret of the text box focused last, and the caret moves past it', async () => {
    const mounted = await mountElement(createElement(PromptManager, { value: { patterns: [], promptId: 'default' }, onChange: () => {} }))
    const c = mounted.container
    buttonNamed(c, O.prompts.manager.create)?.click()
    await mounted.flush()
    const user = areaOf(c, 1) // the second box is the user prompt
    user.focus()
    user.dispatchEvent(new Event('focus'))
    const before = user.value
    const at = before.indexOf('{{input}}')
    user.setSelectionRange(at, at)
    buttonNamed(c, '{{paperTitle}}')?.click()
    await mounted.flush()
    expect(areaOf(c, 1).value).toBe(`${before.slice(0, at)}{{paperTitle}}${before.slice(at)}`)
    // a selection is replaced, not appended
    const system = areaOf(c, 0)
    system.focus()
    system.dispatchEvent(new Event('focus'))
    system.setSelectionRange(0, system.value.length)
    buttonNamed(c, '{{glossary}}')?.click()
    await mounted.flush()
    expect(areaOf(c, 0).value).toBe('{{glossary}}')
    await mounted.unmount()
  })

  it('importing a file appends its entries with fresh ids and says how many; a file of the wrong shape says so and adds nothing', async () => {
    const updates: PromptsUpdate[] = []
    const mounted = await mountElement(createElement(PromptManager, { value: { patterns: [template('a')], promptId: 'a' }, onChange: (update: PromptsUpdate) => { updates.push(update) } }))
    const c = mounted.container
    const input = c.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement
    const good = new File([JSON.stringify([{ name: 'Imported', prompt: 'Translate {{input}}' }, { name: 'Two', systemPrompt: 'S', prompt: 'P' }])], 'prompts.json', { type: 'application/json' })
    Object.defineProperty(input, 'files', { configurable: true, value: [good] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(updates).toHaveLength(1))
    const next = updates[0]!({ patterns: [template('a'), template('b')], promptId: 'a' })
    expect(next.patterns.map(p => p.name)).toEqual(['a', 'b', 'Imported', 'Two'])
    expect(new Set(next.patterns.map(p => p.id)).size).toBe(4)
    expect(next.patterns[2]).toMatchObject({ systemPrompt: '', prompt: 'Translate {{input}}' })
    await mounted.flush()
    expect(c.textContent).toContain(O.prompts.manager.imported(2))
    const bad = new File(['{"not": "a list"}'], 'prompts.json', { type: 'application/json' })
    Object.defineProperty(input, 'files', { configurable: true, value: [bad] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(c.textContent).toContain(O.prompts.manager.importFailed.badShape))
    expect(updates).toHaveLength(1)
    await mounted.unmount()
  })

  it('export writes the reader\'s own prompts, without ids, under the file name the importer reads back; with none it is disabled', async () => {
    const empty = await mountElement(createElement(PromptManager, { value: { patterns: [], promptId: 'default' }, onChange: () => {} }))
    expect(buttonNamed(empty.container, O.prompts.manager.exportMine)?.disabled).toBe(true)
    await empty.unmount()
    const patterns = [template('a', 'Alpha'), template('b', 'Beta')]
    const mounted = await mountElement(createElement(PromptManager, { value: { patterns, promptId: 'a' }, onChange: () => {} }))
    buttonNamed(mounted.container, O.prompts.manager.exportMine)?.click()
    expect(downloads).toEqual([[PROMPT_FILE_NAME, serializePrompts(patterns), 'application/json']])
    expect(JSON.parse(downloads[0]![1]).every((e: Record<string, unknown>) => !('id' in e))).toBe(true)
    await mounted.unmount()
  })
})
