// The translation section's services (the redesign's design, §6.3): one radio group in the agreed order; Chrome's pack; the reader's own with
// their status — a refused key, none stored, connected —; a refused key's form, saved once it connects; a service added
// only once it connects, chosen, no session moved; an edit saved in place; a deletion undone within 5 s with nothing
// irreversible done, and its clean-up after in today's order; the fallback while an LLM is chosen; the target
// language's menu. The page writes no refused-key record (ruling 17): the background's configuration watcher does
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement as h, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { Service } from '@/config/services'
import type { PackState } from '@/shared/pack'
import type { OptionsData } from '@/entrypoints/options/data'
import { stubPopovers } from '../pdf-reader/ui/popover-stub'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))
const wire = vi.hoisted(() => ({
  log: [] as string[], rejected: [] as string[], stored: null as unknown,
  connect: { ok: true, ms: 42 } as { ok: true; ms: number } | { ok: false; field: null; reason: string },
}))
vi.mock('@/shared/messages', () => ({ sendMessage: vi.fn(async (m: { type: string; id?: string; rebindAll?: boolean }) => { wire.log.push(`send ${m.type} ${m.id}${m.rebindAll ? ' all' : ''}`); return { reset: true } }) }))
vi.mock('@/config/storage', () => ({ getConfig: async () => wire.stored }))
vi.mock('@/entrypoints/options/permissions', () => ({
  PermissionError: class extends Error {}, ensureHostPermission: async () => false, hasHostPermission: async () => false,
  releaseHostPermission: vi.fn(async (url: string) => { wire.log.push(`release ${url}`) }),
}))
vi.mock('@/entrypoints/options/connect', () => ({ connectService: vi.fn(async (c: Service) => { wire.log.push(`connect ${c.id}`); return wire.connect }) }))
vi.mock('@/entrypoints/options/models', () => ({ listModels: async () => [] }))
vi.mock('@/ui/use-rejected', () => ({ useRejected: () => wire.rejected }))

import { Translate } from '@/entrypoints/options/sections/Translate'
import { UNDO_MS } from '@/entrypoints/options/ui/UndoRow'
import { O, S, setLocale } from '@/ui/strings'

const MINE: Service = { id: 'svc-mine0000', kind: 'openai-compat', name: 'Mine', baseURL: 'https://api.example.com/v1', apiKey: 'sk-old', model: 'm-1', thinking: 'disabled' }
const OTHER: Service = { ...MINE, id: 'svc-othr0000', name: 'Other', baseURL: 'https://other.example.com/v1' }

function Harness({ start, pack = null, checks = [] }: { start: Config; pack?: PackState | null; checks?: string[] }) {
  const [config, setConfig] = useState(start)
  wire.stored = config
  const data: OptionsData = {
    config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => { const next = fn(wire.stored as Config); wire.stored = next; wire.log.push('patch'); setConfig(next); return next },
    pack, checkPack: async target => { checks.push(target); return 'unsupported' }, fetchPack: async () => { wire.log.push('fetch pack') },
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
  }
  return h(Translate, { data })
}
const card = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-row="translate/services"]')!
const radios = (c: HTMLElement) => [...card(c).querySelectorAll<HTMLElement>('[role="radio"]')]
const nameOf = (r: HTMLElement) => document.getElementById(r.getAttribute('aria-labelledby')!)!.textContent
const rowNamed = (c: HTMLElement, name: string) => radios(c).find(r => nameOf(r) === name)!.closest<HTMLElement>('[data-srow]')!
const stored = () => wire.stored as Config
const type = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const submit = (form: HTMLFormElement) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
const menuItem = (row: HTMLElement, name: string) => [...row.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(i => i.textContent === name)!
const OPTIONS = join(import.meta.dirname, '../../src/entrypoints/options')

describe('the translation services (§6.3)', () => {
  // happy-dom has no popover API: a menu's pick shuts its popover, so the reader's stub stands in
  let restore = () => {}
  beforeEach(() => {
    setLocale('en')
    vi.useFakeTimers({ shouldAdvanceTime: true })
    Object.assign(wire, { log: [], rejected: [], connect: { ok: true, ms: 42 } })
    restore = stubPopovers()
  })
  afterEach(() => { vi.useRealTimers(); restore() })

  it('one radio group: the two free services, Chrome, the reader\'s own, the add row last; the arrows move the choice past what cannot be chosen', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE], provider: 'microsoft' } }))
    expect(radios(m.container).map(nameOf)).toEqual([S.service.microsoft, S.service.google, S.service.chrome, 'Mine'])
    expect(rowNamed(m.container, 'Mine').textContent).toContain('m-1 · api.example.com')
    expect([...card(m.container).querySelectorAll(':scope > button[data-srow]')].at(-1)!.textContent).toBe(O.services.add)
    radios(m.container)[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await m.flush()
    expect(stored().provider).toBe('google-web')
    radios(m.container)[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await m.flush()
    expect(stored().provider).toBe(MINE.id)
    await m.unmount()
  })

  it('Chrome with a pack to fetch: its words say so, Download fetches it; while it comes, the row says so', async () => {
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, pack: 'downloadable' }))
    const chrome = rowNamed(m.container, S.service.chrome)
    expect(chrome.textContent).toContain(`${S.service.chrome_ready}${O.services.packNeeded}`)
    expect(chrome.querySelector('[role="radio"]')!.getAttribute('aria-disabled')).toBe('true')
    ;[...chrome.querySelectorAll('button')].find(b => b.textContent === S.service.chrome_download)!.click()
    expect(wire.log).toContain('fetch pack')
    await m.rerender(h(Harness, { start: DEFAULT_CONFIG, pack: 'downloading' }))
    expect(rowNamed(m.container, S.service.chrome).querySelector('.o-status[data-tone="busy"]')!.textContent).toBe(S.service.chrome_downloading)
    await m.unmount()
  })

  it('a refused key says so on its row; chosen, its form opens under it; the key is saved once it connects, no record written, no session moved', async () => {
    wire.rejected = [MINE.id]
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE], provider: MINE.id } }))
    const row = rowNamed(m.container, 'Mine')
    expect(row.querySelector('.o-status[data-tone="alert"]')!.textContent).toBe(O.services.rejected)
    const form = m.container.querySelector<HTMLFormElement>('form[data-form="key"]')!
    expect(form.textContent).toContain(O.services.keyForm.refused)
    type(form.querySelector('input')!, 'sk-new')
    submit(form)
    await m.flush()
    await m.flush()
    // the save is all: the stored key changed, the background's watcher clears the mark (ruling 17)
    expect(wire.log).toEqual([`connect ${MINE.id}`, 'patch'])
    expect(stored().services[0]!.apiKey).toBe('sk-new')
    wire.rejected = []
    await m.rerender(h(Harness, { start: stored() }))
    expect(rowNamed(m.container, 'Mine').querySelector('.o-status[data-tone="ok"]')!.textContent).toBe(O.services.connected(42))
    await m.unmount()
  })

  it('a service stored without a key by an earlier version says so, and its form has no first sentence', async () => {
    const keyless = { ...MINE, apiKey: '' }
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [keyless], provider: keyless.id } }))
    expect(rowNamed(m.container, 'Mine').querySelector('.o-status')!.textContent).toBe(S.service.llm_noKey)
    const form = m.container.querySelector<HTMLFormElement>('form[data-form="key"]')!
    expect(form.textContent).not.toContain(O.services.keyForm.refused)
    await m.unmount()
  })

  it('a service is added only once it connects, and chosen; the page translating keeps its chain', async () => {
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG }))
    ;[...card(m.container).querySelectorAll<HTMLButtonElement>('button[data-srow]')].find(b => b.textContent === O.services.add)!.click()
    await m.flush()
    const form = m.container.querySelector<HTMLFormElement>('form[data-form="service"]')!
    const [address, , model] = [...form.querySelectorAll<HTMLInputElement>('input')]
    type(address!, 'http://127.0.0.1:9/v1')
    type(model!, 'echo')
    wire.connect = { ok: false, field: null, reason: 'Couldn\'t connect: offline' }
    submit(form)
    await m.flush()
    await m.flush()
    expect(stored().services).toEqual([])
    wire.connect = { ok: true, ms: 42 }
    submit(form)
    await m.flush()
    await m.flush()
    expect(stored().services).toHaveLength(1)
    expect(stored().provider).toBe(stored().services[0]!.id)
    expect(wire.log.some(l => l.startsWith('send'))).toBe(false)
    expect(rowNamed(m.container, 'echo').querySelector('.o-status[data-tone="ok"]')!.textContent).toBe(O.services.connected(42))
    await m.unmount()
  })

  it('Edit… opens the same form under its row; connected, the service is saved in place, not chosen', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: MINE.id } }))
    menuItem(rowNamed(m.container, 'Other'), O.services.edit).click()
    await m.flush()
    const form = m.container.querySelector<HTMLFormElement>('form[data-form="service"]')!
    const name = [...form.querySelectorAll<HTMLInputElement>('input')][3]!
    type(name, 'Renamed')
    submit(form)
    await m.flush()
    await m.flush()
    expect(stored().services.map(s => s.name)).toEqual(['Mine', 'Renamed'])
    expect(stored().provider).toBe(MINE.id)
    expect(wire.log).toEqual([`connect ${OTHER.id}`, 'patch'])
    await m.unmount()
  })

  it('deleting the chosen one: Microsoft takes over, the undo row stands in its place, nothing irreversible is done; undone, it comes back chosen', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: MINE.id } }))
    menuItem(rowNamed(m.container, 'Mine'), O.services.delete).click()
    await m.flush()
    expect(stored().services.map(s => s.id)).toEqual([OTHER.id])
    expect(stored().provider).toBe('microsoft')
    const undoRow = card(m.container).querySelector<HTMLElement>('[data-undo]')!
    expect(undoRow.textContent).toContain(O.undo.deleted('Mine'))
    expect(wire.log).toEqual(['patch'])
    ;[...undoRow.querySelectorAll('button')].find(b => b.textContent === O.undo.undo)!.click()
    await m.flush()
    expect(stored().services.map(s => s.id)).toEqual([MINE.id, OTHER.id])
    expect(stored().provider).toBe(MINE.id)
    expect(wire.log).toEqual(['patch', 'patch'])
    await m.unmount()
  })

  it('once the undo is past, the deletion\'s clean-up runs in today\'s order: every session moved off, then the origin given back', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: OTHER.id } }))
    menuItem(rowNamed(m.container, 'Mine'), O.services.delete).click()
    await m.flush()
    expect(stored().provider).toBe(OTHER.id)
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    await m.flush()
    await m.flush()
    // the record is not the page's: the deletion stored at once, the background's watcher cleared the mark then
    expect(wire.log).toEqual(['patch', `send axt:engine-ready ${MINE.id} all`, `release ${MINE.baseURL}`])
    expect(card(m.container).querySelector('[data-undo]')).toBeNull()
    await m.unmount()
  })

  it('the fallback shows only while an LLM service is chosen; the target language\'s menu writes it and looks the pack up again', async () => {
    const checks: string[] = []
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE], provider: 'microsoft' }, checks }))
    const fallback = () => m.container.querySelector<HTMLElement>('[data-row="translate/fallback"]')!
    expect(fallback().closest('[inert]')).not.toBeNull()
    radios(m.container)[3]!.click()
    await m.flush()
    expect(fallback().closest('[inert]')).toBeNull()
    const japanese = [...m.container.querySelectorAll<HTMLElement>('[role="option"]')].find(o => /Japanese/.test(o.textContent ?? ''))!
    japanese.click()
    await m.flush()
    expect(stored().targetLanguage).toBe('jpn')
    expect(checks).toEqual(['jpn'])
    await m.unmount()
  })

  it('the radios take their own arrows only: a key from the refused-key form or the "…" menu leaves the choice (and the open form) as it is; a radio\'s own arrow still moves it (fix round 1, item 1)', async () => {
    wire.rejected = [MINE.id]
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: MINE.id } }))
    const form = m.container.querySelector<HTMLFormElement>('form[data-form="key"]')!
    form.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    await m.flush()
    expect(stored().provider).toBe(MINE.id)
    expect(m.container.querySelector('form[data-form="key"]')).not.toBeNull()
    menuItem(rowNamed(m.container, 'Other'), O.services.edit).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await m.flush()
    expect(stored().provider).toBe(MINE.id)
    radios(m.container)[3]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    await m.flush()
    expect(stored().provider).toBe(OTHER.id)
    await m.unmount()
  })

  it('two pending deletions: the first expiring does not pull the focus off the second\'s Undo (fix round 1, item 2)', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: 'microsoft' } }))
    menuItem(rowNamed(m.container, 'Mine'), O.services.delete).click()
    await m.flush()
    // Mine's undo is not yet due; Other's, started now, is due 4 s after it
    await vi.advanceTimersByTimeAsync(4000)
    menuItem(rowNamed(m.container, 'Other'), O.services.delete).click()
    await m.flush()
    const undoRow = (name: string) => [...card(m.container).querySelectorAll<HTMLElement>('[data-undo]')].find(r => r.textContent?.includes(name))!
    const othersButton = undoRow('Other').querySelector('button')!
    othersButton.focus()
    expect(document.activeElement).toBe(othersButton)
    // only Mine's timer is due now; Other's undo row, and its focus, must stand
    await vi.advanceTimersByTimeAsync(1000)
    await m.flush()
    expect(card(m.container).querySelectorAll('[data-undo]')).toHaveLength(1)
    expect(document.activeElement).toBe(othersButton)
    await m.unmount()
  })

  it('nothing on the page writes the refused-key record: it is read here, written by the background alone (ruling 17)', () => {
    const files = (readdirSync(OPTIONS, { recursive: true }) as string[]).filter(f => /\.tsx?$/.test(f))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) expect(readFileSync(join(OPTIONS, f), 'utf8'), f).not.toMatch(/\b(markRejected|clearRejected\w*)\b/)
  })
})
