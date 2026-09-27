// The service forms (the redesign's design, §6.3): a suggestion fills the address alone and asks for its origin at once;
// the model list loads by itself only for an origin already granted, and a press on the field asks for one that is
// not; checked when submitted, the first field at fault taking the focus; connected before anything is handed over,
// with a stable id; editing keeps the saved key unless one is typed or it is cleared; the refused key's form
import { createElement as h } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Service } from '@/config/services'
import { mountElement } from '../ui/render-hook'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))
const wire = vi.hoisted(() => ({
  granted: new Set<string>(), asked: [] as string[], released: [] as string[], listed: [] as string[], candidates: [] as Service[],
  connect: { ok: true, ms: 42 } as { ok: true; ms: number } | { ok: false; field: 'apiKey' | null; reason: string },
}))
vi.mock('@/entrypoints/options/permissions', () => ({
  PermissionError: class extends Error {},
  hasHostPermission: vi.fn(async (url: string) => wire.granted.has(new URL(url).origin)),
  ensureHostPermission: vi.fn(async (url: string) => {
    wire.asked.push(url)
    const origin = new URL(url).origin
    if (wire.granted.has(origin)) return false
    wire.granted.add(origin)
    return true
  }),
  releaseHostPermission: vi.fn(async (url: string) => { wire.released.push(url) }),
}))
vi.mock('@/entrypoints/options/models', () => ({
  listModels: vi.fn(async (url: string) => { wire.listed.push(url); return [{ id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash' }, { id: 'qwen/qwen3' }] }),
}))
vi.mock('@/entrypoints/options/connect', () => ({ connectService: vi.fn(async (candidate: Service) => { wire.candidates.push(candidate); return wire.connect }) }))

import { type ConnectResult, connectService } from '@/entrypoints/options/connect'
import { KeyForm, STILL_MS, ServiceForm } from '@/entrypoints/options/sections/ServiceForm'
import { O, setLocale } from '@/ui/strings'

const SVC: Service = { id: 'svc-abcd1234', kind: 'openai-compat', name: 'Mine', baseURL: 'https://api.example.com/v1', apiKey: 'sk-saved', model: 'm-1', thinking: 'disabled' }
const inputs = (c: HTMLElement) => [...c.querySelectorAll<HTMLInputElement>('form input')]
const type = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
const submit = (c: HTMLElement) => c.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
const button = (c: HTMLElement, name: string) => [...c.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === name)!

describe('ServiceForm (§6.3)', () => {
  beforeEach(() => {
    setLocale('en')
    vi.useFakeTimers({ shouldAdvanceTime: true })
    Object.assign(wire, { granted: new Set(['https://openrouter.ai']), asked: [], released: [], listed: [], candidates: [], connect: { ok: true, ms: 42 } })
  })
  afterEach(() => { vi.useRealTimers() })
  const form = (over: Partial<Parameters<typeof ServiceForm>[0]> = {}) => {
    const done: [Service, number][] = []
    const props = { target: 'cmn' as const, stored: [], onConnected: async (s: Service, ms: number) => { done.push([s, ms]) }, onCancel: () => {}, ...over }
    return { done, element: h(ServiceForm, props) }
  }

  it('opens with the focus on the address; a suggestion fills the address alone and asks for its origin at once', async () => {
    const { element } = form()
    const m = await mountElement(element)
    const [address, key, model, name] = inputs(m.container)
    expect(document.activeElement).toBe(address)
    button(m.container, 'DeepSeek').click()
    await m.flush()
    expect(address!.value).toBe('https://api.deepseek.com/v1')
    expect([key!.value, model!.value, name!.value]).toEqual(['', '', ''])
    expect(wire.asked).toEqual(['https://api.deepseek.com/v1'])
    expect(document.activeElement).toBe(key)
    await m.unmount()
  })

  it('the list loads by itself for an origin already granted, once the address and the key have been still', async () => {
    const { element } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    type(address!, 'https://openrouter.ai/api/v1')
    type(key!, 'sk-or-1')
    await m.flush()
    expect(model!.getAttribute('placeholder')).toBe(O.services.modelEmpty)
    await vi.advanceTimersByTimeAsync(STILL_MS)
    await m.flush()
    expect(wire.listed).toEqual(['https://openrouter.ai/api/v1'])
    expect(model!.getAttribute('placeholder')).toBe(O.services.modelSearch(2))
    expect(wire.asked).toEqual([])
    await m.unmount()
  })

  it('not for an origin that is not granted: no permission asked outside a gesture; a press on the model field asks, then lists', async () => {
    const { element } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    type(address!, 'https://api.deepseek.com/v1')
    type(key!, 'sk-1')
    await vi.advanceTimersByTimeAsync(STILL_MS * 2)
    await m.flush()
    expect([wire.listed, wire.asked]).toEqual([[], []])
    model!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await m.flush()
    await m.flush()
    expect(wire.asked).toEqual(['https://api.deepseek.com/v1'])
    expect(wire.listed).toEqual(['https://api.deepseek.com/v1'])
    await m.unmount()
  })

  it('a local address needs no key: its label says so, and the list may load without one', async () => {
    wire.granted.add('http://localhost:11434')
    const { element } = form()
    const m = await mountElement(element)
    type(inputs(m.container)[0]!, 'http://localhost:11434/v1')
    await vi.advanceTimersByTimeAsync(STILL_MS)
    await m.flush()
    expect(m.container.textContent).toContain(O.services.apiKeyLocalHint)
    expect(wire.listed).toEqual(['http://localhost:11434/v1'])
    await m.unmount()
  })

  it('checked when submitted: each field at fault carries its reason, and the first takes the focus', async () => {
    const { element } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    submit(m.container)
    await m.flush()
    expect(address!.getAttribute('aria-invalid')).toBe('true')
    expect(m.container.textContent).toContain(O.services.checks.baseURL)
    expect(m.container.textContent).toContain(O.services.checks.model)
    expect(document.activeElement).toBe(address)
    type(address!, 'https://api.example.com/v1')
    submit(m.container)
    await m.flush()
    expect(key!.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(key)
    expect(wire.candidates).toEqual([])
    type(key!, 'sk-1')
    type(model!, 'm-2')
    submit(m.container)
    await m.flush()
    expect(wire.candidates).toHaveLength(1)
    await m.unmount()
  })

  it('connects before anything is handed over: a failure says why beside the button and keeps the form, the id stays the same', async () => {
    const { element, done } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    type(address!, 'https://openrouter.ai/api/v1')
    type(key!, 'sk-or-bad')
    await vi.advanceTimersByTimeAsync(STILL_MS)
    await m.flush()
    model!.focus()
    await m.flush()
    ;[...m.container.querySelectorAll('[role="option"]')].find(o => o.textContent?.startsWith('DeepSeek V4 Flash'))!.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }))
    await m.flush()
    wire.connect = { ok: false, field: 'apiKey', reason: 'Couldn\'t connect: bad key' }
    submit(m.container)
    await m.flush()
    await m.flush()
    expect(done).toEqual([])
    expect(m.container.querySelector('.o-note')!.textContent).toBe('Couldn\'t connect: bad key')
    expect(document.activeElement).toBe(key)
    wire.connect = { ok: true, ms: 42 }
    type(key!, 'sk-or-good')
    submit(m.container)
    await m.flush()
    await m.flush()
    expect(done).toHaveLength(1)
    const [saved, ms] = done[0]!
    expect(ms).toBe(42)
    expect(saved).toMatchObject({ kind: 'openai-compat', name: 'DeepSeek V4 Flash', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'sk-or-good', model: 'deepseek/deepseek-v4-flash', thinking: 'disabled' })
    expect(saved.id).toMatch(/^svc-[a-z0-9]{8}$/)
    expect(wire.candidates[0]!.id).toBe(saved.id)
    await m.unmount()
  })

  it('while it connects, Connect waits busy (Part 3\'s busy): O.services.connecting, aria-busy, and a second submission asks nothing more', async () => {
    const { element, done } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    type(address!, 'https://api.example.com/v1')
    type(key!, 'sk-1')
    type(model!, 'm-2')
    let answer: (r: ConnectResult) => void = () => {}
    vi.mocked(connectService).mockImplementationOnce((candidate: Service) => {
      wire.candidates.push(candidate)
      return new Promise<ConnectResult>(resolve => { answer = resolve })
    })
    submit(m.container)
    await m.flush()
    expect(button(m.container, O.services.connecting).getAttribute('aria-busy')).toBe('true')
    submit(m.container)
    await m.flush()
    expect(wire.candidates).toHaveLength(1)
    answer({ ok: true, ms: 42 })
    await m.flush()
    await m.flush()
    expect(done).toHaveLength(1)
    expect(button(m.container, O.services.connect).getAttribute('aria-busy')).not.toBe('true')
    await m.unmount()
  })

  it('extended thinking lives under More, folded, and goes with the service', async () => {
    const { element, done } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    const more = button(m.container, O.more)
    expect(more.getAttribute('aria-expanded')).toBe('false')
    more.click()
    await m.flush()
    m.container.querySelector<HTMLElement>(`[role="switch"][aria-label="${O.services.thinking}"]`)!.click()
    type(address!, 'https://api.example.com/v1')
    type(key!, 'sk-1')
    type(model!, 'm-2')
    submit(m.container)
    await m.flush()
    await m.flush()
    expect(done[0]![0].thinking).toBe('enabled')
    await m.unmount()
  })

  it('editing: filled in, the key field empty saying it is saved; left empty the saved key goes with it, Clear lets it go', async () => {
    const { element, done } = form({ service: SVC })
    const m = await mountElement(element)
    const [address, key, model, name] = inputs(m.container)
    expect([address!.value, model!.value, name!.value]).toEqual([SVC.baseURL, SVC.model, SVC.name])
    expect([key!.value, key!.getAttribute('placeholder')]).toEqual(['', O.services.keySaved])
    submit(m.container)
    await m.flush()
    await m.flush()
    expect(done[0]![0]).toEqual(SVC)
    button(m.container, O.services.apiKeyClear).click()
    await m.flush()
    submit(m.container)
    await m.flush()
    expect(key!.getAttribute('aria-invalid')).toBe('true')
    expect(done).toHaveLength(1)
    await m.unmount()
  })

  it('closed with nothing saved, it gives back the origins it asked for', async () => {
    const { element } = form()
    const m = await mountElement(element)
    button(m.container, 'DeepSeek').click()
    await m.flush()
    await m.unmount()
    await vi.advanceTimersByTimeAsync(0)
    expect(wire.released).toEqual(['https://api.deepseek.com/v1'])
  })
})

describe('KeyForm (§6.3)', () => {
  beforeEach(() => {
    setLocale('en')
    Object.assign(wire, { candidates: [], connect: { ok: true, ms: 7 } })
  })

  it('a refused key: the sentence, a new key, Update and connect; checked when submitted; connected, the service handed back with the key', async () => {
    const done: Service[] = []
    const m = await mountElement(h(KeyForm, { service: SVC, refused: true, target: 'cmn', onConnected: async s => { done.push(s) } }))
    expect(m.container.textContent).toContain(O.services.keyForm.refused)
    expect(m.container.textContent).toContain(O.services.savedOnConnect)
    submit(m.container)
    await m.flush()
    expect(inputs(m.container)[0]!.getAttribute('aria-invalid')).toBe('true')
    type(inputs(m.container)[0]!, 'sk-new')
    submit(m.container)
    await m.flush()
    await m.flush()
    expect(done).toEqual([{ ...SVC, apiKey: 'sk-new' }])
    await m.unmount()
  })

  it('a service stored without a key: the same form, without the first sentence; a failure said beside the button', async () => {
    wire.connect = { ok: false, field: 'apiKey', reason: 'Couldn\'t connect: no' }
    const m = await mountElement(h(KeyForm, { service: { ...SVC, apiKey: '' }, refused: false, target: 'cmn', onConnected: async () => {} }))
    expect(m.container.textContent).not.toContain(O.services.keyForm.refused)
    type(inputs(m.container)[0]!, 'sk-new')
    submit(m.container)
    await m.flush()
    await m.flush()
    expect(m.container.querySelector('.o-note')!.textContent).toBe('Couldn\'t connect: no')
    await m.unmount()
  })
})
