import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { Service } from '@/config/services'
import { mountElement } from '../ui/render-hook'

// The service drawer (options/sections/ServiceDrawer.tsx): deleting a service takes it out of storage, unchooses it,
// moves every session off it and gives its origin back — in that order; "more options" holds the thinking switch,
// whose value is saved with the form on Connect

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))
const sent: unknown[] = []
vi.mock('@/shared/messages', () => ({
  sendMessage: vi.fn(async (message: { type: string }) => {
    sent.push(message)
    if (message.type === 'axt:translate') return { ok: true, result: { segments: [{ id: 'sample', text: 'ok' }], provider: 'svc' }, cached: 0 }
    return undefined
  }),
}))
let stored: Config = DEFAULT_CONFIG
vi.mock('@/config/storage', () => ({ getConfig: vi.fn(async () => stored) }))
const released: [string, readonly string[]][] = []
vi.mock('@/entrypoints/options/permissions', () => ({
  PermissionError: class extends Error { kind = 'denied'; origin = '' },
  ensureHostPermission: vi.fn(async () => false),
  releaseHostPermission: vi.fn(async (url: string, still: readonly string[]) => { released.push([url, still]) }),
}))

import { ServiceDrawer } from '@/entrypoints/options/sections/ServiceDrawer'
import { O, setLocale } from '@/ui/strings'

const mine: Service = { id: 'svc-abcdefgh', kind: 'openai-compat', name: 'Mine', baseURL: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'm', thinking: 'disabled' }
const other: Service = { ...mine, id: 'svc-other000', name: 'Other', baseURL: 'https://other.example.com/v1' }
const buttons = (c: HTMLElement) => Array.from(c.querySelectorAll('button'))
const byText = (c: HTMLElement, text: string) => buttons(c).find(b => b.textContent?.trim() === text)
const setValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}
/** A patch that applies to the stored configuration, the way the data layer's does */
function patcher(patches: Config[]) {
  return async (fn: (latest: Config) => Config) => { stored = fn(stored); patches.push(stored); return stored }
}

describe('ServiceDrawer', () => {
  beforeEach(() => { setLocale('en'); sent.length = 0; released.length = 0 })

  it('delete asks twice, then removes the service from storage, unchooses it, rebinds every session and releases its origin, then closes', async () => {
    stored = { ...DEFAULT_CONFIG, services: [mine, other], provider: mine.id }
    const patches: Config[] = []
    const onClose = vi.fn()
    const mounted = await mountElement(createElement(ServiceDrawer, { service: mine, patch: patcher(patches), onClose }))
    const c = mounted.container
    byText(c, O.services.delete)?.click()
    await mounted.flush()
    expect(patches).toHaveLength(0) // armed, nothing written
    byText(c, O.services.deleteConfirm)?.click()
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(patches).toHaveLength(1)
    expect(patches[0]?.services.map(s => s.id)).toEqual([other.id])
    expect(patches[0]?.provider).toBe('microsoft') // the deleted one cannot stay chosen
    expect(sent).toEqual([{ type: 'axt:engine-ready', id: mine.id, rebindAll: true }])
    expect(released).toEqual([[mine.baseURL, [other.baseURL]]]) // after the rebind, with the origins still in use
    await mounted.unmount()
  })

  it('deleting a service that was not the chosen one leaves the choice alone', async () => {
    stored = { ...DEFAULT_CONFIG, services: [mine, other], provider: other.id }
    const patches: Config[] = []
    const mounted = await mountElement(createElement(ServiceDrawer, { service: mine, patch: patcher(patches), onClose: () => {} }))
    byText(mounted.container, O.services.delete)?.click()
    await mounted.flush()
    byText(mounted.container, O.services.deleteConfirm)?.click()
    await vi.waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]?.provider).toBe(other.id)
    await mounted.unmount()
  })

  it('a new service has no delete; "more options" unfolds the thinking switch, and Connect saves the form with it, selecting the new service', async () => {
    stored = { ...DEFAULT_CONFIG, services: [other], provider: 'microsoft' }
    const patches: Config[] = []
    const mounted = await mountElement(createElement(ServiceDrawer, { service: null, patch: patcher(patches), onClose: () => {} }))
    const c = mounted.container
    expect(byText(c, O.services.delete)).toBeUndefined()
    expect(c.querySelector('[role="switch"]')).toBeNull()
    buttons(c).find(b => b.getAttribute('aria-expanded') === 'false')?.click()
    await mounted.flush()
    const sw = c.querySelector<HTMLButtonElement>('[role="switch"]')
    expect(sw?.getAttribute('aria-checked')).toBe('false')
    sw?.click()
    await mounted.flush()
    expect(c.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('true')
    const inputs = Array.from(c.querySelectorAll<HTMLInputElement>('input'))
    setValue(inputs[0] as HTMLInputElement, 'Fresh') // name
    setValue(inputs[2] as HTMLInputElement, 'sk-new') // key
    setValue(inputs[3] as HTMLInputElement, 'model-x') // model
    byText(c, O.services.connect)?.click()
    await vi.waitFor(() => expect(patches).toHaveLength(1))
    const saved = patches[0]?.services.find(s => s.name === 'Fresh')
    expect(saved).toMatchObject({ kind: 'openai-compat', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'sk-new', model: 'model-x', thinking: 'enabled' })
    expect(patches[0]?.provider).toBe(saved?.id) // adding selects; editing would not
    expect(patches[0]?.services.map(s => s.id)).toEqual([other.id, saved?.id])
    // The test translation names the service, so a broken endpoint cannot be masked by the chain
    expect(sent.find(m => (m as { type: string }).type === 'axt:translate')).toMatchObject({ providerId: saved?.id })
    await mounted.unmount()
  })

  it('a second Connect on a drawer opened with "add" updates the service it saved rather than appending another', async () => {
    stored = { ...DEFAULT_CONFIG, services: [], provider: 'microsoft' }
    const patches: Config[] = []
    const mounted = await mountElement(createElement(ServiceDrawer, { service: null, patch: patcher(patches), onClose: () => {} }))
    const c = mounted.container
    const inputs = Array.from(c.querySelectorAll<HTMLInputElement>('input'))
    setValue(inputs[2] as HTMLInputElement, 'sk-1')
    setValue(inputs[3] as HTMLInputElement, 'model-1')
    byText(c, O.services.connect)?.click()
    await vi.waitFor(() => expect(patches).toHaveLength(1))
    await vi.waitFor(() => expect(byText(c, O.services.connect)).toBeDefined())
    byText(c, O.services.connect)?.click()
    await vi.waitFor(() => expect(patches).toHaveLength(2))
    expect(patches[1]?.services).toHaveLength(1)
    await mounted.unmount()
  })
})
