// The translation section's services (the redesign's design, §6.3): one radio group in the agreed order; Chrome's pack; the reader's own with
// their status — a refused key, none stored, connected —; a refused key's form, saved once it connects; a service added
// only once it connects, chosen, no session moved; an edit saved in place; a deletion undone within 5 s with nothing
// irreversible done, and its clean-up after in today's order; the fallback while an LLM is chosen; the target
// language's menu. The page writes no refused-key record (ruling 17): the background's configuration watcher does.
// Task 65: a deletion is committed only once its own write lands, and one storage refused leaves its row, takes back
// the focus and says so; an origin is given back only when no service may still use it; an undo storage refused
// brings its undo row back, or, answered after the section went, commits the deletion itself; while the stored value
// cannot be read, a commit gives no origin back (round 4), by its own read's verdict (round 5). Task 107: a service
// added, edited or given a new key is connected only once its own write lands
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Fragment, createElement as h, useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { Service } from '@/config/services'
import type { FallbackReason } from '@/config/storage'
import type { PackState } from '@/shared/pack'
import type { OptionsData } from '@/entrypoints/options/data'
import { stubPopovers } from '../pdf-reader/ui/popover-stub'
import { deferred, mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))
const wire = vi.hoisted(() => ({
  log: [] as string[], rejected: [] as string[], stored: null as unknown,
  connect: { ok: true, ms: 42 } as { ok: true; ms: number } | { ok: false; field: null; reason: string },
  /** the writes wait for it; rejected, storage refused them (Task 65) */
  gate: null as Promise<unknown> | null,
  /**
   * the stored value unreadable: the change runs on the defaults (storage.ts getConfig), storage refuses it, and the
   * data layer resolves with the configuration in effect, the defaults (surface-config.ts, data.ts; round 2, item 1)
   */
  unreadable: false,
  /** another read of the page, run once, finishing after the next read has its verdict and before that read answers (round 5) */
  during: null as (() => Promise<unknown>) | null,
}))
vi.mock('@/shared/messages', () => ({ sendMessage: vi.fn(async (m: { type: string; id?: string; rebindAll?: boolean }) => { wire.log.push(`send ${m.type} ${m.id}${m.rebindAll ? ' all' : ''}`); return { reset: true } }) }))
// as storage.ts: a value it cannot read is answered with the defaults, and `readConfig` with its read's verdict
vi.mock('@/config/storage', async () => {
  const { DEFAULT_CONFIG: defaults } = await import('@/config/schema')
  const take = (): { config: Config; fallbackReason: FallbackReason | null } =>
    wire.unreadable ? { config: defaults, fallbackReason: { kind: 'unknown' } } : { config: wire.stored as Config, fallbackReason: null }
  const between = async () => {
    const other = wire.during
    wire.during = null
    await other?.()
  }
  return {
    readConfig: async () => { const reading = take(); await between(); return reading },
    getConfig: async () => { const reading = take(); await between(); return reading.config },
  }
})
vi.mock('@/entrypoints/options/permissions', () => ({
  PermissionError: class extends Error {}, ensureHostPermission: async () => false, hasHostPermission: async () => false,
  // as permissions.ts decides: an origin a still-used address shares is kept
  releaseHostPermission: vi.fn(async (url: string, stillUsed: readonly string[]) => {
    const origin = new URL(url).origin
    wire.log.push(`${stillUsed.some(u => new URL(u).origin === origin) ? 'keep' : 'release'} ${url}`)
  }),
}))
vi.mock('@/entrypoints/options/connect', () => ({ connectService: vi.fn(async (c: Service) => { wire.log.push(`connect ${c.id}`); return wire.connect }) }))
vi.mock('@/entrypoints/options/models', () => ({ listModels: async () => [] }))
vi.mock('@/ui/use-rejected', () => ({ useRejected: () => wire.rejected }))

import { getConfig } from '@/config/storage'
import { Translate } from '@/entrypoints/options/sections/Translate'
import { UNDO_MS } from '@/entrypoints/options/ui/UndoRow'
import { O, S, setLocale } from '@/ui/strings'

const MINE: Service = { id: 'svc-mine0000', kind: 'openai-compat', name: 'Mine', baseURL: 'https://api.example.com/v1', apiKey: 'sk-old', model: 'm-1', thinking: 'disabled' }
const OTHER: Service = { ...MINE, id: 'svc-othr0000', name: 'Other', baseURL: 'https://other.example.com/v1' }

/**
 * `app`: the page as App.tsx draws it, which shows its data section alone once the stored value cannot be read, so a
 * refusal as unreadable takes this section away. It goes before the refused write's caller hears back: surface-config.ts
 * publishes the fallback, then rejects, and data.ts answers with what is in effect; the published state renders at
 * once, before that answer settles (the reviewer's probe on the real data layer, round 4). flushSync stands for that
 * render. The log marks the section's going and the answer
 */
function Harness({ start, pack = null, checks = [], app = false }: { start: Config; pack?: PackState | null; checks?: string[]; app?: boolean }) {
  const [config, setConfig] = useState(start)
  const [fallback, setFallback] = useState(false)
  wire.stored = config
  const data: OptionsData = {
    config, fallbackReason: null, reset: async () => DEFAULT_CONFIG, resetFailed: false,
    patch: async fn => {
      if (wire.gate) await wire.gate
      if (wire.unreadable) {
        fn(DEFAULT_CONFIG)
        if (app) {
          // storage's refusal comes back after the press is over
          await Promise.resolve()
          flushSync(() => setFallback(true))
          wire.log.push('answered')
        }
        return DEFAULT_CONFIG
      }
      const next = fn(wire.stored as Config); wire.stored = next; wire.log.push('patch'); setConfig(next); return next
    },
    pack, checkPack: async target => { checks.push(target); return 'unsupported' }, fetchPack: async () => { wire.log.push('fetch pack') },
    cache: null, cacheError: '', clearCache: async () => undefined, cacheCleared: false,
  }
  if (!app) return h(Translate, { data })
  return fallback ? null : h(Fragment, null, h(Translate, { data }), h(Going))
}
/** Logs the section's going: its clean-ups, the deletions' flush among them, run in the same pass */
function Going() {
  useEffect(() => () => { wire.log.push('section gone') }, [])
  return null
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
const committed = () => wire.log.filter(l => /^(send|release|keep) /.test(l))
const radioNamed = (c: HTMLElement, name: string) => radios(c).find(r => nameOf(r) === name)!
const undoHolds = () => document.activeElement?.closest('[data-undo]') != null
const OPTIONS = join(import.meta.dirname, '../../src/entrypoints/options')

describe('the translation services (§6.3)', () => {
  // happy-dom has no popover API: a menu's pick shuts its popover, so the reader's stub stands in
  let restore = () => {}
  beforeEach(() => {
    setLocale('en')
    vi.useFakeTimers({ shouldAdvanceTime: true })
    Object.assign(wire, { log: [], rejected: [], connect: { ok: true, ms: 42 }, gate: null, unreadable: false, during: null })
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

  it('a new service whose write is refused as unreadable — answered with the defaults — is not connected: its form stays open with the failed-save line, and no origin goes back while the value cannot be read; a write that lands then adds it as before (Task 107)', async () => {
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG }))
    ;[...card(m.container).querySelectorAll<HTMLButtonElement>('button[data-srow]')].find(b => b.textContent === O.services.add)!.click()
    await m.flush()
    const form = m.container.querySelector<HTMLFormElement>('form[data-form="service"]')!
    const [address, , model] = [...form.querySelectorAll<HTMLInputElement>('input')]
    type(address!, 'http://127.0.0.1:9/v1')
    type(model!, 'echo')
    wire.unreadable = true
    submit(form)
    await m.flush()
    await m.flush()
    expect(form.closest('[inert]')).toBeNull()
    expect(form.querySelector('.o-note')!.textContent).toBe(O.saveFailed)
    expect(card(m.container).querySelector('.o-status[data-tone="ok"]')).toBeNull()
    // the form says so; the list's foot is for the list's own refusals
    expect(card(m.container).querySelector('.o-list-note')).toBeNull()
    // the stored services are unknown while the value cannot be read: the origin the connection was granted is kept
    expect(committed()).toEqual([])
    wire.unreadable = false
    submit(form)
    await m.flush()
    await m.flush()
    expect(stored().services).toHaveLength(1)
    expect(stored().provider).toBe(stored().services[0]!.id)
    expect(form.closest('[inert]')).not.toBeNull()
    expect(rowNamed(m.container, 'echo').querySelector('.o-status[data-tone="ok"]')!.textContent).toBe(O.services.connected(42))
    await m.unmount()
  })

  it('an edit whose write is refused as unreadable is not connected: its form stays open with the failed-save line, the stored service as it was; a write that lands then saves it as before (Task 107)', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: MINE.id } }))
    menuItem(rowNamed(m.container, 'Other'), O.services.edit).click()
    await m.flush()
    const form = m.container.querySelector<HTMLFormElement>('form[data-form="service"]')!
    type([...form.querySelectorAll<HTMLInputElement>('input')][3]!, 'Renamed')
    wire.unreadable = true
    submit(form)
    await m.flush()
    await m.flush()
    expect(form.closest('[inert]')).toBeNull()
    expect(form.querySelector('.o-note')!.textContent).toBe(O.saveFailed)
    expect(stored().services.map(s => s.name)).toEqual(['Mine', 'Other'])
    expect(rowNamed(m.container, 'Other').querySelector('.o-status[data-tone="ok"]')).toBeNull()
    // no origin given back while the value cannot be read
    expect(committed()).toEqual([])
    wire.unreadable = false
    submit(form)
    await m.flush()
    await m.flush()
    expect(stored().services.map(s => s.name)).toEqual(['Mine', 'Renamed'])
    expect(form.closest('[inert]')).not.toBeNull()
    expect(rowNamed(m.container, 'Renamed').querySelector('.o-status[data-tone="ok"]')!.textContent).toBe(O.services.connected(42))
    await m.unmount()
  })

  it('a new key whose write is refused as unreadable is not connected: the key form says the save failed, and the stored key is the old one (Task 107)', async () => {
    wire.rejected = [MINE.id]
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE], provider: MINE.id } }))
    const form = m.container.querySelector<HTMLFormElement>('form[data-form="key"]')!
    type(form.querySelector('input')!, 'sk-new')
    wire.unreadable = true
    submit(form)
    await m.flush()
    await m.flush()
    wire.unreadable = false
    expect(form.closest('[inert]')).toBeNull()
    expect(form.querySelector('.o-note')!.textContent).toBe(O.saveFailed)
    expect(stored().services[0]!.apiKey).toBe('sk-old')
    // the mark cleared (the background's, ruling 17): the row says nothing of a connection that stored nothing
    wire.rejected = []
    await m.rerender(h(Harness, { start: stored() }))
    expect(rowNamed(m.container, 'Mine').querySelector('.o-status[data-tone="ok"]')).toBeNull()
    await m.unmount()
  })

  it('in the page\'s own order — the section taken away before the refusal\'s answer — a new service refused as unreadable gives no origin back once the answer comes: the value cannot be read (Task 107)', async () => {
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG, app: true }))
    ;[...card(m.container).querySelectorAll<HTMLButtonElement>('button[data-srow]')].find(b => b.textContent === O.services.add)!.click()
    await m.flush()
    const form = m.container.querySelector<HTMLFormElement>('form[data-form="service"]')!
    const [address, , model] = [...form.querySelectorAll<HTMLInputElement>('input')]
    type(address!, 'http://127.0.0.1:9/v1')
    type(model!, 'echo')
    wire.unreadable = true
    submit(form)
    await m.flush()
    await m.flush()
    expect(m.container.querySelector('[data-row="translate/services"]')).toBeNull()
    expect(wire.log[0]).toMatch(/^connect /)
    expect(wire.log.slice(1)).toEqual(['section gone', 'answered'])
    await m.unmount()
    await m.flush()
    expect(committed()).toEqual([])
  })

  it('a new service whose write the store, readable, rejects is not connected either: its form stays open with the failed-save line, and the origin it tested goes back (Task 107)', async () => {
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG }))
    ;[...card(m.container).querySelectorAll<HTMLButtonElement>('button[data-srow]')].find(b => b.textContent === O.services.add)!.click()
    await m.flush()
    const form = m.container.querySelector<HTMLFormElement>('form[data-form="service"]')!
    const [address, , model] = [...form.querySelectorAll<HTMLInputElement>('input')]
    type(address!, 'http://127.0.0.1:9/v1')
    type(model!, 'echo')
    wire.gate = Promise.reject(new Error('refused'))
    wire.gate.catch(() => undefined)
    submit(form)
    await m.flush()
    await m.flush()
    wire.gate = null
    expect(form.closest('[inert]')).toBeNull()
    expect(form.querySelector('.o-note')!.textContent).toBe(O.saveFailed)
    expect(stored().services).toEqual([])
    expect(committed()).toEqual(['release http://127.0.0.1:9/v1'])
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

  it('the keyboard\'s undo whose write outlasts a frame: the focus lands on the service\'s radio once its row is drawn, never on the page — as the styles and the prompts lists do (Part 7\'s final review, B-I3, item 23)', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: OTHER.id } }))
    // the keyboard's deletion: the undo row's button takes the focus
    document.documentElement.removeAttribute('data-axt-pointer')
    menuItem(rowNamed(m.container, 'Mine'), O.services.delete).click()
    await m.flush()
    expect(undoHolds()).toBe(true)
    const write = deferred<void>()
    wire.gate = write.promise
    ;[...card(m.container).querySelector<HTMLElement>('[data-undo]')!.querySelectorAll('button')].find(b => b.textContent === O.undo.undo)!.click()
    await m.flush()
    // a frame and more pass while the write is out (the real page: a storage read, a validated write, a digest)
    await vi.advanceTimersByTimeAsync(50)
    await m.flush()
    expect(radios(m.container).map(nameOf)).not.toContain('Mine')
    write.resolve()
    await m.flush()
    await vi.advanceTimersByTimeAsync(50)
    await m.flush()
    expect(stored().services.map(s => s.id)).toEqual([MINE.id, OTHER.id])
    expect(document.activeElement).toBe(radioNamed(m.container, 'Mine'))
    await m.unmount()
  })

  it('a service added whose write outlasts a frame: the focus lands on its radio once its row is drawn (Part 7\'s final review, item 23)', async () => {
    const m = await mountElement(h(Harness, { start: DEFAULT_CONFIG }))
    ;[...card(m.container).querySelectorAll<HTMLButtonElement>('button[data-srow]')].find(b => b.textContent === O.services.add)!.click()
    await m.flush()
    const form = m.container.querySelector<HTMLFormElement>('form[data-form="service"]')!
    const [address, , model] = [...form.querySelectorAll<HTMLInputElement>('input')]
    type(address!, 'http://127.0.0.1:9/v1')
    type(model!, 'echo')
    const write = deferred<void>()
    wire.gate = write.promise
    submit(form)
    await m.flush()
    await vi.advanceTimersByTimeAsync(50)
    await m.flush()
    expect(stored().services).toEqual([])
    write.resolve()
    await m.flush()
    await vi.advanceTimersByTimeAsync(50)
    await m.flush()
    expect(stored().services).toHaveLength(1)
    expect(document.activeElement).toBe(radioNamed(m.container, 'echo'))
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

  it('an undo that expires while the deletion\'s write is held sends nothing: every session moved off only once the deletion is stored, then the origin given back (Task 65, item 1)', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: OTHER.id } }))
    const write = deferred<void>()
    wire.gate = write.promise
    menuItem(rowNamed(m.container, 'Mine'), O.services.delete).click()
    await m.flush()
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    await m.flush()
    expect(card(m.container).querySelector('[data-undo]')).toBeNull()
    // a rebind now would have the background rebuild from a configuration that still holds the service
    expect(wire.log).toEqual([])
    write.resolve()
    await m.flush()
    await m.flush()
    expect(wire.log).toEqual(['patch', `send axt:engine-ready ${MINE.id} all`, `release ${MINE.baseURL}`])
    await m.unmount()
  })

  it('leaving the page with a deletion whose write is held: its clean-up waits for the write, then runs in today\'s order (Task 65, item 1)', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: OTHER.id } }))
    const write = deferred<void>()
    wire.gate = write.promise
    menuItem(rowNamed(m.container, 'Mine'), O.services.delete).click()
    await m.flush()
    await m.unmount()
    await m.flush()
    expect(wire.log).toEqual([])
    write.resolve()
    await m.flush()
    await m.flush()
    expect(wire.log).toEqual(['patch', `send axt:engine-ready ${MINE.id} all`, `release ${MINE.baseURL}`])
  })

  it('a deletion whose write rejects: the row stays and takes back the focus its undo row held, the list\'s foot says so; nothing is committed, and the next write that lands takes the line away (Task 65; round 2, item 2)', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: MINE.id } }))
    const write = deferred<void>()
    wire.gate = write.promise
    menuItem(rowNamed(m.container, 'Mine'), O.services.delete).click()
    await m.flush()
    // the keyboard's deletion: the undo row's button holds the focus
    expect(undoHolds()).toBe(true)
    write.reject(new Error('refused'))
    await m.flush()
    await m.flush()
    wire.gate = null
    expect(radios(m.container).map(nameOf)).toContain('Mine')
    expect(card(m.container).querySelector('[data-undo]')).toBeNull()
    expect(document.activeElement).toBe(radioNamed(m.container, 'Mine'))
    const note = card(m.container).querySelector<HTMLElement>('.o-list-note')!
    expect(note.getAttribute('role')).toBe('status')
    expect(note.textContent).toBe(O.saveFailed)
    expect(card(m.container).lastElementChild).toBe(note)
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    await m.flush()
    radios(m.container)[1]!.click()
    await m.flush()
    expect(stored().provider).toBe('google-web')
    expect(card(m.container).querySelector('.o-list-note')).toBeNull()
    await m.unmount()
    await m.flush()
    expect(committed()).toEqual([])
  })

  it('a deletion refused because the stored value cannot be read — answered with the defaults, which hold no service — is a refusal: nothing is committed, the row takes back the focus (round 2, items 1 and 2)', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: MINE.id } }))
    wire.unreadable = true
    menuItem(rowNamed(m.container, 'Mine'), O.services.delete).click()
    await m.flush()
    await m.flush()
    wire.unreadable = false
    // the page stops drawing its sections in this state (App.tsx); the harness keeps them to show nothing else moved
    expect(radios(m.container).map(nameOf)).toContain('Mine')
    expect(card(m.container).querySelector('[data-undo]')).toBeNull()
    expect(document.activeElement).toBe(radioNamed(m.container, 'Mine'))
    expect(card(m.container).querySelector('.o-list-note')!.textContent).toBe(O.saveFailed)
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    await m.unmount()
    await m.flush()
    expect(committed()).toEqual([])
  })

  it('an undo storage refused: the service stays deleted, its undo row comes back with a fresh 5 s and the focus, the list\'s foot says so; its clean-up runs once that undo is past (round 3, item 3)', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: OTHER.id } }))
    menuItem(rowNamed(m.container, 'Mine'), O.services.delete).click()
    await m.flush()
    await vi.advanceTimersByTimeAsync(4000)
    const write = deferred<void>()
    wire.gate = write.promise
    ;[...card(m.container).querySelector<HTMLElement>('[data-undo]')!.querySelectorAll('button')].find(b => b.textContent === O.undo.undo)!.click()
    await m.flush()
    expect(card(m.container).querySelector('[data-undo]')).toBeNull()
    write.reject(new Error('refused'))
    await m.flush()
    await m.flush()
    wire.gate = null
    expect(stored().services.map(s => s.id)).toEqual([OTHER.id])
    const back = card(m.container).querySelector<HTMLElement>('[data-undo]')!
    expect(back.textContent).toContain(O.undo.deleted('Mine'))
    expect(document.activeElement).toBe(back.querySelector('button'))
    expect(card(m.container).querySelector('.o-list-note')!.textContent).toBe(O.saveFailed)
    // a fresh 5 s: past where the first would have ended, it stands, and nothing is committed yet
    await vi.advanceTimersByTimeAsync(2000)
    await m.flush()
    expect(card(m.container).querySelector('[data-undo]')).not.toBeNull()
    expect(committed()).toEqual([])
    await vi.advanceTimersByTimeAsync(UNDO_MS - 2000)
    await m.flush()
    await m.flush()
    expect(card(m.container).querySelector('[data-undo]')).toBeNull()
    expect(committed()).toEqual([`send axt:engine-ready ${MINE.id} all`, `release ${MINE.baseURL}`])
    await m.unmount()
  })

  it('an undo refused because the stored value cannot be read takes the section away before its answer, the flush run with nothing pending: the deletion is still committed, every session moved off, and no origin given back while the value cannot be read (round 4, item 1 and addendum)', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: OTHER.id }, app: true }))
    menuItem(rowNamed(m.container, 'Mine'), O.services.delete).click()
    await m.flush()
    expect(stored().services.map(s => s.id)).toEqual([OTHER.id])
    wire.unreadable = true
    ;[...card(m.container).querySelector<HTMLElement>('[data-undo]')!.querySelectorAll('button')].find(b => b.textContent === O.undo.undo)!.click()
    await m.flush()
    await m.flush()
    expect(m.container.querySelector('[data-row="translate/services"]')).toBeNull()
    // the section went, and its flush ran, before the refusal's answer; the commit follows the answer
    expect(wire.log).toEqual(['patch', 'section gone', 'answered', `send axt:engine-ready ${MINE.id} all`])
    await m.unmount()
  })

  it('a deletion committed while the stored value cannot be read moves every session off and gives no origin back: the addresses stored are unknown (round 4, addendum)', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: OTHER.id } }))
    menuItem(rowNamed(m.container, 'Mine'), O.services.delete).click()
    await m.flush()
    expect(stored().services.map(s => s.id)).toEqual([OTHER.id])
    // the value turns unreadable while the undo is open; the commit's own read finds it so
    wire.unreadable = true
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    await m.flush()
    await m.flush()
    expect(card(m.container).querySelector('[data-undo]')).toBeNull()
    expect(committed()).toEqual([`send axt:engine-ready ${MINE.id} all`])
    await m.unmount()
    await m.flush()
    expect(committed()).toEqual([`send axt:engine-ready ${MINE.id} all`])
  })

  it('a commit whose own read finds the stored value unreadable gives no origin back, even when a read that finds it readable finishes before the commit looks: the verdict is its read\'s, not the latest (round 5)', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: OTHER.id } }))
    menuItem(rowNamed(m.container, 'Mine'), O.services.delete).click()
    await m.flush()
    expect(stored().services.map(s => s.id)).toEqual([OTHER.id])
    wire.unreadable = true
    // the value repaired elsewhere while the commit's read answers, and another read of the page (another list's
    // write) finding it readable in that gap
    wire.during = async () => { wire.unreadable = false; await getConfig() }
    await vi.advanceTimersByTimeAsync(UNDO_MS)
    await m.flush()
    await m.flush()
    // the premise: the other read ran inside the commit's, finding the value readable
    expect(wire.during).toBeNull()
    expect(committed()).toEqual([`send axt:engine-ready ${MINE.id} all`])
    await m.unmount()
    await m.flush()
    expect(committed()).toEqual([`send axt:engine-ready ${MINE.id} all`])
  })

  it('a later write refused as unreadable leaves the failed-save line up; one that lands takes it away (round 3, item 4)', async () => {
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: MINE.id } }))
    wire.unreadable = true
    menuItem(rowNamed(m.container, 'Mine'), O.services.delete).click()
    await m.flush()
    await m.flush()
    expect(card(m.container).querySelector('.o-list-note')!.textContent).toBe(O.saveFailed)
    // still unreadable: answered with the defaults, not with the change's own value
    radios(m.container)[1]!.click()
    await m.flush()
    expect(stored().provider).toBe(MINE.id)
    expect(card(m.container).querySelector('.o-list-note')!.textContent).toBe(O.saveFailed)
    wire.unreadable = false
    radios(m.container)[1]!.click()
    await m.flush()
    expect(stored().provider).toBe('google-web')
    expect(card(m.container).querySelector('.o-list-note')).toBeNull()
    await m.unmount()
  })

  it('two services on one origin, both deleted: the first one\'s clean-up keeps the origin while the second\'s undo is open, and undone, the second still has it (round 2, item 4)', async () => {
    const same: Service = { ...MINE, id: 'svc-same0000', name: 'Same', baseURL: 'https://api.example.com/v2' }
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, same, OTHER], provider: OTHER.id } }))
    menuItem(rowNamed(m.container, 'Mine'), O.services.delete).click()
    await m.flush()
    await vi.advanceTimersByTimeAsync(1000)
    menuItem(rowNamed(m.container, 'Same'), O.services.delete).click()
    await m.flush()
    // Mine's undo is past; Same's is still open
    await vi.advanceTimersByTimeAsync(UNDO_MS - 1000)
    await m.flush()
    await m.flush()
    expect(committed()).toEqual([`send axt:engine-ready ${MINE.id} all`, `keep ${MINE.baseURL}`])
    const undoRow = [...card(m.container).querySelectorAll<HTMLElement>('[data-undo]')].find(r => r.textContent?.includes('Same'))!
    ;[...undoRow.querySelectorAll('button')].find(b => b.textContent === O.undo.undo)!.click()
    await m.flush()
    expect(stored().services.map(s => s.id)).toEqual([same.id, OTHER.id])
    await m.unmount()
    await m.flush()
    expect(committed()).toEqual([`send axt:engine-ready ${MINE.id} all`, `keep ${MINE.baseURL}`])
  })

  it('an origin is kept for a service undone while another on it is committed, until the undo\'s own write lands (round 2, item 4)', async () => {
    const same: Service = { ...MINE, id: 'svc-same0000', name: 'Same', baseURL: 'https://api.example.com/v2' }
    const m = await mountElement(h(Harness, { start: { ...DEFAULT_CONFIG, services: [MINE, same, OTHER], provider: OTHER.id } }))
    menuItem(rowNamed(m.container, 'Mine'), O.services.delete).click()
    await m.flush()
    await vi.advanceTimersByTimeAsync(1000)
    menuItem(rowNamed(m.container, 'Same'), O.services.delete).click()
    await m.flush()
    // Same undone, its write held: it is neither waiting on its undo nor stored yet as Mine's clean-up runs
    const write = deferred<void>()
    wire.gate = write.promise
    const undoRow = [...card(m.container).querySelectorAll<HTMLElement>('[data-undo]')].find(r => r.textContent?.includes('Same'))!
    ;[...undoRow.querySelectorAll('button')].find(b => b.textContent === O.undo.undo)!.click()
    await m.flush()
    await vi.advanceTimersByTimeAsync(UNDO_MS - 1000)
    await m.flush()
    await m.flush()
    expect(committed()).toEqual([`send axt:engine-ready ${MINE.id} all`, `keep ${MINE.baseURL}`])
    write.resolve()
    await m.flush()
    wire.gate = null
    expect(stored().services.map(s => s.id)).toEqual([same.id, OTHER.id])
    await m.unmount()
  })

  it('nothing on the page writes the refused-key record: it is read here, written by the background alone (ruling 17)', () => {
    const files = (readdirSync(OPTIONS, { recursive: true }) as string[]).filter(f => /\.tsx?$/.test(f))
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) expect(readFileSync(join(OPTIONS, f), 'utf8'), f).not.toMatch(/\b(markRejected|clearRejected\w*)\b/)
  })
})
