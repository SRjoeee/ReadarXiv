// The service forms (the redesign's design, §6.3): a suggestion fills the address alone and asks for its origin at once;
// the model list loads by itself only for an origin already granted, and a press on the field asks for one that is
// not; checked when submitted, the first field at fault taking the focus; connected before anything is handed over,
// with a stable id; editing keeps the saved key unless one is typed or it is cleared; the refused key's form. Task 65:
// a permission the browser grants only after the form is gone is given back, and a form gone loads no list; both
// forms are live after StrictMode's double run of their effects, as the settings page renders them. Task 107: a save
// refused after the form is gone gives back what the form asked for, and nothing while the stored value cannot be read.
// The origins (#299 F2): a form holds what it asked for and what it connects with, and a give-back — this form's or
// any other's — takes none of it; let go, an origin goes back only if no stored service and no other open form needs it
import { StrictMode, createElement as h, useEffect } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { originOf } from '@/config/origins'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { Service } from '@/config/services'
import { deferred, mountElement } from '../ui/render-hook'
import { origins } from './origin-wire'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))
const wire = vi.hoisted(() => ({
  asked: [] as string[], removed: [] as string[], listed: [] as string[], candidates: [] as Service[],
  connect: { ok: true, ms: 42 } as { ok: true; ms: number } | { ok: false; field: 'apiKey' | null; reason: string },
  /** what is stored: a saved service joins it (the form's caller saves, Translate.tsx) */
  stored: null as unknown as Config,
  /** the stored value unreadable: the background's read says so, and gives back nothing (config/origins.ts) */
  unreadable: false,
}))
// the browser grants by pattern; the holds and the give-back are the page's model of them (origin-wire.ts)
vi.mock('@/entrypoints/options/permissions', async () => {
  const { origins: model } = await import('./origin-wire')
  const { originOf: patternOf } = await import('@/config/origins')
  return {
    PermissionError: class extends Error {},
    hasHostPermission: vi.fn(async (url: string) => model.granted.has(patternOf(url)!)),
    ensureHostPermission: vi.fn(async (url: string) => {
      wire.asked.push(url)
      model.granted.add(patternOf(url)!)
    }),
    holdOrigin: vi.fn((url: string, service?: string) => model.holdOrigin(url, service)),
    giveBackUnneeded: vi.fn(() => model.giveBackUnneeded()),
  }
})
vi.mock('@/entrypoints/options/models', () => ({
  listModels: vi.fn(async (url: string) => { wire.listed.push(url); return [{ id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash' }, { id: 'qwen/qwen3' }] }),
}))
// as connect.ts: the candidate's origin asked for, then the endpoint tested
vi.mock('@/entrypoints/options/connect', async () => {
  const { origins: model } = await import('./origin-wire')
  const { originOf: patternOf } = await import('@/config/origins')
  return { connectService: vi.fn(async (candidate: Service) => { model.granted.add(patternOf(candidate.baseURL)!); wire.candidates.push(candidate); return wire.connect }) }
})

import { type ConnectResult, connectService } from '@/entrypoints/options/connect'
import { listModels } from '@/entrypoints/options/models'
import { ensureHostPermission } from '@/entrypoints/options/permissions'
import { KeyForm, STILL_MS, ServiceForm } from '@/entrypoints/options/sections/ServiceForm'
import { O, setLocale } from '@/ui/strings'

/** OpenRouter's origin is the manifest's own; the others are granted as a form asks */
const START = ['https://openrouter.ai/*']
const reset = () => {
  Object.assign(wire, { asked: [], removed: [], listed: [], candidates: [], connect: { ok: true, ms: 42 }, stored: DEFAULT_CONFIG, unreadable: false })
  origins.reset(wire.removed, START)
  origins.stored = () => wire.stored
  origins.readable = () => !wire.unreadable
}
/** what the stored services use, granted: a stored service's origin is its own */
const store = (...services: Service[]) => {
  wire.stored = { ...DEFAULT_CONFIG, services }
  for (const s of services) origins.granted.add(originOf(s.baseURL)!)
}
const removed = () => wire.removed.map(line => line.replace(/^remove /, ''))

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
    reset()
  })
  afterEach(() => { vi.useRealTimers() })
  /** connected, the service is stored, as the settings page's caller stores it before the form lets go */
  const form = (over: Partial<Parameters<typeof ServiceForm>[0]> = {}) => {
    const done: [Service, number][] = []
    const props = { target: 'cmn' as const, onConnected: async (s: Service, ms: number) => { done.push([s, ms]); wire.stored = { ...wire.stored, services: [...wire.stored.services, s] } }, onCancel: () => {}, ...over }
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
    origins.granted.add('http://localhost:11434/*')
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
      origins.granted.add(originOf(candidate.baseURL)!)
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
    expect(removed()).toEqual(['https://api.deepseek.com/*'])
  })

  it('a suggestion\'s permission granted only after the form is gone is given back at once, a stored service\'s origin kept (Task 65, item 3)', async () => {
    let answer: () => void = () => {}
    vi.mocked(ensureHostPermission).mockImplementationOnce((url: string) => {
      wire.asked.push(url)
      return new Promise<void>(resolve => { answer = () => { origins.granted.add(originOf(url)!); resolve() } })
    })
    store({ ...SVC, baseURL: 'https://other.example.com/v1' })
    const { element } = form()
    const m = await mountElement(element)
    button(m.container, 'DeepSeek').click()
    await m.flush()
    // the browser's prompt is still open as the form goes: its clean-up has nothing granted to give back yet
    await m.unmount()
    await m.flush()
    expect(wire.asked).toEqual(['https://api.deepseek.com/v1'])
    expect(removed()).toEqual([])
    answer()
    await m.flush()
    expect(removed()).toEqual(['https://api.deepseek.com/*'])
    expect(origins.granted.has('https://other.example.com/*')).toBe(true)
  })

  it('a press on the model field whose permission answers only after the form is gone loads no list (Task 65, round 2, item 3)', async () => {
    let answer: () => void = () => {}
    vi.mocked(ensureHostPermission).mockImplementationOnce((url: string) => {
      wire.asked.push(url)
      return new Promise<void>(resolve => { answer = resolve })
    })
    const { element } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    type(address!, 'https://api.deepseek.com/v1')
    type(key!, 'sk-1')
    await m.flush()
    model!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    await m.flush()
    expect(wire.asked).toEqual(['https://api.deepseek.com/v1'])
    await m.unmount()
    // the answer comes once the form is gone: there is no form left to fill
    answer()
    await m.flush()
    expect(wire.listed).toEqual([])
    expect(removed()).toEqual([])
  })

  // Fix round 1 (Opus review), item 1: Cancel means "stop, save nothing" even once a connection is already in flight
  it('Cancel stops a connection already in flight from being handed over', async () => {
    const { element, done } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    type(address!, 'https://api.example.com/v1')
    type(key!, 'sk-1')
    type(model!, 'm-2')
    let answer: (r: ConnectResult) => void = () => {}
    vi.mocked(connectService).mockImplementationOnce((candidate: Service) => {
      wire.candidates.push(candidate)
      origins.granted.add(originOf(candidate.baseURL)!)
      return new Promise<ConnectResult>(resolve => { answer = resolve })
    })
    submit(m.container)
    await m.flush()
    button(m.container, O.services.cancel).click()
    answer({ ok: true, ms: 5 })
    await m.flush()
    await m.flush()
    expect(done).toEqual([])
    // Fix round 2, item 1: a cancelled success still gives back the permission it used
    expect(removed()).toEqual(['https://api.example.com/*'])
    await m.unmount()
  })

  // Fix round 2, item 1: a stored service using the same origin keeps it granted
  it('a cancelled connect that goes on to succeed keeps an origin a stored service still uses', async () => {
    store(SVC)
    const { element } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    type(address!, 'https://api.example.com/v1')
    type(key!, 'sk-1')
    type(model!, 'm-2')
    let answer: (r: ConnectResult) => void = () => {}
    vi.mocked(connectService).mockImplementationOnce((candidate: Service) => {
      wire.candidates.push(candidate)
      origins.granted.add(originOf(candidate.baseURL)!)
      return new Promise<ConnectResult>(resolve => { answer = resolve })
    })
    submit(m.container)
    await m.flush()
    button(m.container, O.services.cancel).click()
    answer({ ok: true, ms: 5 })
    await m.flush()
    await m.flush()
    expect(removed()).toEqual([])
    expect(origins.granted.has('https://api.example.com/*')).toBe(true)
    await m.unmount()
  })

  // Fix round 2, item 3: the cancelled early return must not leave Connect stuck busy for a caller that keeps the
  // form mounted
  it('busy resets once a cancelled attempt resolves, so Connect is pressable again', async () => {
    const { element } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    type(address!, 'https://api.example.com/v1')
    type(key!, 'sk-1')
    type(model!, 'm-2')
    let answer: (r: ConnectResult) => void = () => {}
    vi.mocked(connectService).mockImplementationOnce((candidate: Service) => {
      wire.candidates.push(candidate)
      origins.granted.add(originOf(candidate.baseURL)!)
      return new Promise<ConnectResult>(resolve => { answer = resolve })
    })
    submit(m.container)
    await m.flush()
    button(m.container, O.services.cancel).click()
    answer({ ok: true, ms: 5 })
    await m.flush()
    await m.flush()
    expect(button(m.container, O.services.connect).getAttribute('aria-busy')).not.toBe('true')
    await m.unmount()
  })

  // Fix round 1, item 2: a secret must never reach an address the reader never gave it to
  it('editing: the saved key does not follow the address to another origin, and returns once the address does too', async () => {
    const { element } = form({ service: SVC })
    const m = await mountElement(element)
    const [address, key] = inputs(m.container)
    type(address!, 'https://openrouter.ai/api/v1')
    await vi.advanceTimersByTimeAsync(STILL_MS * 2)
    await m.flush()
    expect(wire.listed).toEqual([])
    expect(key!.getAttribute('placeholder')).toBe('sk-…')
    submit(m.container)
    await m.flush()
    expect(key!.getAttribute('aria-invalid')).toBe('true')
    type(address!, SVC.baseURL)
    await m.flush()
    expect(key!.getAttribute('placeholder')).toBe(O.services.keySaved)
    await m.unmount()
  })

  // Fix round 1, item 3: the connection worked, the save afterwards did not — a different sentence, and the origin
  // this attempt tested goes back since it was never put to use
  it('a save that fails after connecting says so as a failed save, and gives back the origin it tested', async () => {
    const { element } = form({ onConnected: async () => { throw new Error('too many services') } })
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    type(address!, 'https://api.newhost.example/v1')
    type(key!, 'sk-1')
    type(model!, 'm-2')
    submit(m.container)
    await m.flush()
    await m.flush()
    expect(m.container.querySelector('.o-note')!.textContent).toBe(O.saveFailed)
    expect(removed()).toEqual(['https://api.newhost.example/*'])
    await m.unmount()
  })

  // Task 107: a form can be gone before its refused save's answer comes — the settings page takes its sections away
  // once the stored value cannot be read — and its clean-up then ran while the service was handed over, giving nothing back
  const goneBeforeTheAnswer = async () => {
    const answer = deferred<void>()
    store({ ...SVC, baseURL: 'https://other.example.com/v1' })
    const { element } = form({ onConnected: () => answer.promise })
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    button(m.container, 'DeepSeek').click()
    await m.flush()
    type(address!, 'https://api.newhost.example/v1')
    type(key!, 'sk-1')
    type(model!, 'm-2')
    submit(m.container)
    await m.flush()
    await m.unmount()
    await m.flush()
    expect(removed()).toEqual([])
    return { answer, flush: m.flush }
  }

  it('a save refused by the store, readable, only after the form is gone gives back what the form asked for too, not only the origin it tested', async () => {
    const { answer, flush } = await goneBeforeTheAnswer()
    answer.reject(new Error('refused'))
    await flush()
    expect(removed().sort()).toEqual(['https://api.deepseek.com/*', 'https://api.newhost.example/*'])
    expect(origins.granted.has('https://other.example.com/*')).toBe(true)
  })

  it('a save refused while the stored value cannot be read, the form gone before the answer, gives back no origin: which stored services share one is unknown (Task 107)', async () => {
    const { answer, flush } = await goneBeforeTheAnswer()
    wire.unreadable = true
    answer.reject(new Error('refused'))
    await flush()
    expect(removed()).toEqual([])
    expect(origins.holds).toEqual([])
  })

  // Fix round 1, item 4: the model field may still be disabled at the click that asks for it; the focus catches up
  it('a local suggestion focuses the model field once it is no longer disabled', async () => {
    const { element } = form()
    const m = await mountElement(element)
    button(m.container, O.services.localOllama).click()
    await m.flush()
    const model = inputs(m.container)[2]!
    expect(document.activeElement).toBe(model)
    await m.unmount()
  })

  // Fix round 1, item 5: Clear moves the focus to the field it just cleared, and names what it clears
  it('Clear moves the focus to the key field and names what it clears', async () => {
    const { element } = form({ service: SVC })
    const m = await mountElement(element)
    const clear = button(m.container, O.services.apiKeyClear)
    expect(clear.getAttribute('aria-label')).toBe(`${O.services.apiKeyClear} ${O.services.apiKey}`)
    clear.click()
    await m.flush()
    const key = inputs(m.container)[1]!
    expect(document.activeElement).toBe(key)
    await m.unmount()
  })

  // Fix round 1, item 6: a failed list says so, not the empty-form sentence
  it('the model placeholder says the list failed, not that the form is still empty', async () => {
    vi.mocked(listModels).mockRejectedValueOnce(new Error('down'))
    const { element } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    type(address!, 'https://openrouter.ai/api/v1')
    type(key!, 'sk-1')
    await vi.advanceTimersByTimeAsync(STILL_MS)
    await m.flush()
    await m.flush()
    expect(model!.getAttribute('placeholder')).toBe(O.services.modelNoList)
    await m.unmount()
  })

  // Fix round 1, item 7: nothing else here says what the chips fill
  it('the address suggestions are grouped and named for a screen reader', async () => {
    const { element } = form()
    const m = await mountElement(element)
    const group = m.container.querySelector('.o-chips')!
    expect(group.tagName).toBe('FIELDSET')
    // its own name, distinct from the address field's, so the two controls do not read as one (Task 64b, item 5)
    expect(group.getAttribute('aria-label')).toBe(O.services.baseURLSuggestions)
    const namedBaseURL = [...m.container.querySelectorAll('label')].filter(el => el.textContent === O.services.baseURL)
    expect(namedBaseURL).toHaveLength(1)
    await m.unmount()
  })

  // Fix round 1, item 8: the name follows the model while it still reads as the model's own default
  it('editing: the name follows the model while it still reads as the old one\'s default, and stops once typed', async () => {
    const AUTO_SVC: Service = { id: 'svc-auto0001', kind: 'openai-compat', name: 'm-1', baseURL: 'https://api.example.com/v1', apiKey: 'sk-saved', model: 'm-1', thinking: 'disabled' }
    const { element } = form({ service: AUTO_SVC })
    const m = await mountElement(element)
    const [, , model, name] = inputs(m.container)
    type(model!, 'm-2')
    await m.flush()
    expect(name!.value).toBe('m-2')
    type(name!, 'Custom')
    type(model!, 'm-3')
    await m.flush()
    expect(name!.value).toBe('Custom')
    await m.unmount()
  })

  // Fix round 1, item 9: an origin a chip asked for, but the reader moved past, does not stay granted forever
  it('a successful connect gives back a chip-granted origin the reader did not end up using', async () => {
    const { element, done } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    button(m.container, 'DeepSeek').click()
    await m.flush()
    type(address!, 'https://openrouter.ai/api/v1')
    type(key!, 'sk-or-1')
    type(model!, 'm-2')
    submit(m.container)
    await m.flush()
    await m.flush()
    expect(done).toHaveLength(1)
    expect(removed()).toEqual(['https://api.deepseek.com/*'])
    await m.unmount()
  })

  it('a form\'s Cancel gives back only the origins no stored service and no other open form needs (#299 F2b)', async () => {
    store(SVC)
    // another form, open on this page or another settings tab, holds an origin of its own
    const other = origins.holdOrigin('https://shared.example.com/v1')
    origins.granted.add('https://shared.example.com/*')
    const cancelled: string[] = []
    const { element } = form({ onCancel: () => { cancelled.push('cancel') } })
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    button(m.container, 'DeepSeek').click()
    await m.flush()
    // the model field asks for the address typed: the shared one, then the stored service's own
    type(key!, 'sk-1')
    for (const url of ['https://shared.example.com/v1', SVC.baseURL]) {
      type(address!, url)
      await m.flush()
      model!.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      await m.flush()
      await m.flush()
    }
    expect(wire.asked).toEqual(['https://api.deepseek.com/v1', 'https://shared.example.com/v1', SVC.baseURL])
    button(m.container, O.services.cancel).click()
    await m.unmount()
    await m.flush()
    expect(cancelled).toEqual(['cancel'])
    expect(removed()).toEqual(['https://api.deepseek.com/*'])
    // the other form closes in turn: now nothing needs its origin
    await other.release()
    await origins.giveBackUnneeded()
    expect(removed()).toEqual(['https://api.deepseek.com/*', 'https://shared.example.com/*'])
    expect(origins.granted.has(originOf(SVC.baseURL)!)).toBe(true)
  })

  it('while a form connects, its origin is held: a give-back elsewhere — a deletion\'s commit inside its undo window — does not take it, and once saved the stored service keeps it (#299 F2c)', async () => {
    const { element, done } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    type(address!, SVC.baseURL)
    type(key!, 'sk-1')
    type(model!, 'm-2')
    let answer: (r: ConnectResult) => void = () => {}
    vi.mocked(connectService).mockImplementationOnce((candidate: Service) => {
      origins.granted.add(originOf(candidate.baseURL)!)
      return new Promise<ConnectResult>(resolve => { answer = resolve })
    })
    submit(m.container)
    await m.flush()
    expect(origins.holds).toEqual(['axt-origin https://api.example.com/*'])
    // the deletion of a service on this address, committed while the test is in flight
    await origins.giveBackUnneeded()
    expect(removed()).toEqual([])
    answer({ ok: true, ms: 5 })
    await m.flush()
    await m.flush()
    expect(done).toHaveLength(1)
    expect(origins.holds).toEqual([])
    expect(removed()).toEqual([])
    expect(origins.granted.has('https://api.example.com/*')).toBe(true)
    await m.unmount()
  })

  it('a failed connection gives back the origin taken for that attempt alone; one a suggestion asked for stays with the form until it closes', async () => {
    wire.connect = { ok: false, field: 'apiKey', reason: 'no' }
    const { element } = form()
    const m = await mountElement(element)
    const [address, key, model] = inputs(m.container)
    type(address!, 'https://api.newhost.example/v1')
    type(key!, 'sk-1')
    type(model!, 'm-2')
    submit(m.container)
    await m.flush()
    await m.flush()
    expect(removed()).toEqual(['https://api.newhost.example/*'])
    button(m.container, 'DeepSeek').click()
    await m.flush()
    type(key!, 'sk-2')
    type(model!, 'm-2')
    submit(m.container)
    await m.flush()
    await m.flush()
    expect(removed()).toEqual(['https://api.newhost.example/*'])
    expect(origins.granted.has('https://api.deepseek.com/*')).toBe(true)
    await m.unmount()
    await m.flush()
    expect(removed()).toEqual(['https://api.newhost.example/*', 'https://api.deepseek.com/*'])
  })
})

describe('KeyForm (§6.3)', () => {
  beforeEach(() => {
    setLocale('en')
    reset()
    wire.connect = { ok: true, ms: 7 }
  })

  it('a refused key: the sentence, a new key, Update and connect; checked when submitted; connected, the service handed back with the key', async () => {
    const done: Service[] = []
    const m = await mountElement(h(KeyForm, { service: SVC, refused: true, target: 'cmn', onConnected: async s => { done.push(s) } }))
    expect(m.container.textContent).toContain(O.services.keyForm.refused)
    expect(m.container.textContent).toContain(O.services.savedOnConnect)
    // the added form's key field shows one; this one had none (added at the controller's look, Task 64b item 11)
    expect(inputs(m.container)[0]!.getAttribute('placeholder')).toBe('sk-…')
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

  // Fix round 1 (Opus review), item 1: no Cancel here, but the host may still take the form off the tree mid-connection
  it('unmounting before the connection resolves stops it from being handed over', async () => {
    let answer: (r: ConnectResult) => void = () => {}
    vi.mocked(connectService).mockImplementationOnce(() => new Promise<ConnectResult>(resolve => { answer = resolve }))
    const done: Service[] = []
    const m = await mountElement(h(KeyForm, { service: SVC, refused: true, target: 'cmn', onConnected: async s => { done.push(s) } }))
    type(inputs(m.container)[0]!, 'sk-new')
    submit(m.container)
    await m.flush()
    await m.unmount()
    answer({ ok: true, ms: 5 })
    await m.flush()
    expect(done).toEqual([])
  })

  // Fix round 1, item 3: the connection worked, the save afterwards did not — caught, not an unhandled rejection
  it('a save that fails after connecting is caught and said as a failed save', async () => {
    const m = await mountElement(h(KeyForm, { service: SVC, refused: true, target: 'cmn', onConnected: async () => { throw new Error('config rejected') } }))
    type(inputs(m.container)[0]!, 'sk-new')
    submit(m.container)
    await m.flush()
    await m.flush()
    expect(m.container.querySelector('.o-note')!.textContent).toBe(O.saveFailed)
    await m.unmount()
  })

  // Fix round 1, item 7: the refused sentence is the field's own hint, so aria-describedby carries it
  it('the refused sentence is linked to the key field as its hint', async () => {
    const m = await mountElement(h(KeyForm, { service: SVC, refused: true, target: 'cmn', onConnected: async () => {} }))
    const field = inputs(m.container)[0]!
    const describedBy = (field.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean)
    const hint = describedBy.map(id => document.getElementById(id)).find(el => el?.textContent === O.services.keyForm.refused)
    expect(hint).toBeTruthy()
    await m.unmount()
  })
})

describe('the forms under StrictMode, as the settings page renders them (main.tsx; Task 65, round 3, item 1)', () => {
  beforeEach(() => {
    setLocale('en')
    vi.useFakeTimers({ shouldAdvanceTime: true })
    reset()
  })
  afterEach(() => { vi.useRealTimers() })
  const strict = (child: ReturnType<typeof h>) => h(StrictMode, null, child)

  it('this environment runs a mount\'s effects twice under StrictMode, set up, cleaned up and set up again (else the cases below would prove nothing)', async () => {
    const runs: string[] = []
    function Probe() {
      useEffect(() => { runs.push('setup'); return () => { runs.push('cleanup') } }, [])
      return null
    }
    const m = await mountElement(strict(h(Probe)))
    expect(runs).toEqual(['setup', 'cleanup', 'setup'])
    await m.unmount()
  })

  it('ServiceForm: a suggestion\'s grant is kept for the form, not given back at once; Connect hands the service over', async () => {
    const done: [Service, number][] = []
    const m = await mountElement(strict(h(ServiceForm, { target: 'cmn', onConnected: async (s: Service, ms: number) => { done.push([s, ms]); store(s) }, onCancel: () => {} })))
    button(m.container, 'DeepSeek').click()
    await m.flush()
    expect(wire.asked).toEqual(['https://api.deepseek.com/v1'])
    expect(removed()).toEqual([])
    expect(origins.holds).toEqual(['axt-origin https://api.deepseek.com/*'])
    const [, key, model] = inputs(m.container)
    type(key!, 'sk-1')
    type(model!, 'm-2')
    submit(m.container)
    await m.flush()
    await m.flush()
    expect(done.map(([s]) => s.baseURL)).toEqual(['https://api.deepseek.com/v1'])
    // the origin the saved service uses stays granted
    expect(removed()).toEqual([])
    expect(origins.granted.has('https://api.deepseek.com/*')).toBe(true)
    await m.unmount()
  })

  it('ServiceForm closed with nothing saved still gives back what it asked for', async () => {
    const m = await mountElement(strict(h(ServiceForm, { target: 'cmn', onConnected: async () => {}, onCancel: () => {} })))
    button(m.container, 'DeepSeek').click()
    await m.flush()
    expect(removed()).toEqual([])
    await m.unmount()
    await m.flush()
    expect(removed()).toEqual(['https://api.deepseek.com/*'])
  })

  it('KeyForm: a new key that connects is handed over', async () => {
    const done: Service[] = []
    const m = await mountElement(strict(h(KeyForm, { service: SVC, refused: true, target: 'cmn', onConnected: async s => { done.push(s) } })))
    type(inputs(m.container)[0]!, 'sk-new')
    submit(m.container)
    await m.flush()
    await m.flush()
    expect(done).toEqual([{ ...SVC, apiKey: 'sk-new' }])
    await m.unmount()
  })
})
