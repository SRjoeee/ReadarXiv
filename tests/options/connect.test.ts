// The settings page's connection test (the redesign's design, §6.3): the origin asked for, one sample translated through
// that endpoint alone with the service carried whole, the time it took; a failure names its reason and the field at
// fault, and gives nothing back itself — the form holds the origin until the service is stored or the attempt given up
// (#299 F2c). And the endpoint's list of models
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Service } from '@/config/services'

vi.mock('wxt/browser', () => ({ browser: { runtime: { id: 'test-extension', getURL: (path: string) => path } } }))
const wire = vi.hoisted(() => {
  class PermissionError extends Error {
    constructor(readonly kind: 'badURL' | 'denied', readonly origin?: string) { super(kind) }
  }
  return { sent: [] as unknown[], answer: null as unknown, denied: false, PermissionError }
})
vi.mock('@/shared/messages', () => ({ sendMessage: vi.fn(async (message: unknown) => { wire.sent.push(message); return wire.answer }) }))
vi.mock('@/entrypoints/options/permissions', () => ({
  PermissionError: wire.PermissionError,
  ensureHostPermission: vi.fn(async () => {
    if (wire.denied) throw new wire.PermissionError('denied', 'https://api.example.com/*')
  }),
}))

import { connectService } from '@/entrypoints/options/connect'
import { listModels } from '@/entrypoints/options/models'
import { O, reasonText, setLocale } from '@/ui/strings'

const SVC: Service = { id: 'svc-abcd1234', kind: 'openai-compat', name: 'Mine', baseURL: 'https://api.example.com/v1', apiKey: 'sk-new', model: 'x/y', thinking: 'disabled' }

describe('connectService (§6.3)', () => {
  beforeEach(() => {
    setLocale('en')
    Object.assign(wire, { sent: [], answer: null, denied: false })
  })

  it('carries the service whole, named, and answers with the time it took', async () => {
    wire.answer = { ok: true, result: { segments: [], provider: SVC.id }, cached: 0 }
    const res = await connectService(SVC, 'cmn')
    expect(res.ok).toBe(true)
    expect(wire.sent).toEqual([expect.objectContaining({ type: 'axt:translate', providerId: SVC.id, candidate: SVC })])
    expect((wire.sent[0] as { cache?: unknown }).cache).toBeUndefined()
  })

  it('a refused key names its reason and the key field, and asks for nothing to be given back: the origin is the form\'s to let go (#299 F2c)', async () => {
    wire.answer = { ok: false, error: { kind: 'auth', message: '401', isolatable: false } }
    expect(await connectService(SVC, 'cmn')).toEqual({ ok: false, field: 'apiKey', reason: O.services.failed(reasonText('auth')) })
    expect(wire.sent).toEqual([expect.objectContaining({ type: 'axt:translate' })])
  })

  it('a permission refused says so at the address, in today\'s words, and asks nothing of the endpoint', async () => {
    wire.denied = true
    expect(await connectService(SVC, 'cmn')).toEqual({ ok: false, field: 'baseURL', reason: O.services.permission.denied('https://api.example.com/*') })
    expect(wire.sent).toEqual([])
  })
})

describe('listModels (§6.3)', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('asks the endpoint\'s /models with the key, and reads the OpenAI shape: ids, names beside them, no repeats', async () => {
    const seen: [string, RequestInit | undefined][] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      seen.push([url, init])
      return new Response(JSON.stringify({ data: [{ id: 'a/b', name: 'A B' }, { id: 'c' }, { id: 'a/b' }, { name: 'no id' }] }))
    }))
    expect(await listModels('https://openrouter.ai/api/v1/', 'sk-x', new AbortController().signal)).toEqual([{ id: 'a/b', name: 'A B' }, { id: 'c' }])
    expect(seen[0]![0]).toBe('https://openrouter.ai/api/v1/models')
    expect((seen[0]![1]!.headers as Record<string, string>).Authorization).toBe('Bearer sk-x')
  })

  it('asks a local endpoint without a key, and fails on an answer that is not a list', async () => {
    const seen: [string, RequestInit | undefined][] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      seen.push([url, init])
      return new Response('{"error":"no"}', { status: 404 })
    }))
    await expect(listModels('http://localhost:11434/v1', '', new AbortController().signal)).rejects.toThrow()
    expect((seen[0]![1]!.headers as Record<string, string>).Authorization).toBeUndefined()
  })
})
