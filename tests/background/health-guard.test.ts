import { describe, expect, it, vi } from 'vitest'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import { createHealthKeeper, idsToClear, isRefusal, shouldMarkRefusal } from '@/entrypoints/background/health-guard'
import type { ProviderErrorKind } from '@/providers/types'

// Whether a failure marks the service health record, and which marks a configuration change voids (the redesign's
// design, §4): only a 401 means the key was refused, and a mark is about the key and the address the request used
const SVC = { id: 'svc-abcd1234', kind: 'openai-compat' as const, name: 'Mine', baseURL: 'https://openrouter.ai/api/v1', apiKey: 'sk-old', model: 'x/y', thinking: 'disabled' as const }
const OTHER = { ...SVC, id: 'svc-efgh5678', name: 'Other', apiKey: 'sk-other' }
const configWith = (over: Partial<typeof SVC> = {}, ...more: (typeof SVC)[]): Config => ({ ...DEFAULT_CONFIG, services: [{ ...SVC, ...over }, ...more] })
const refused = { id: SVC.id, kind: 'auth' as const, status: 401 }

describe('isRefusal', () => {
  it('is a 401 answered to one of the reader\'s services', () => {
    expect(isRefusal(refused)).toBe(true)
  })

  it('is not a 403 — a moderation refusal or a disallowed origin is not about the key — nor an auth failure with no status', () => {
    expect(isRefusal({ ...refused, status: 403 })).toBe(false)
    expect(isRefusal({ id: SVC.id, kind: 'auth' })).toBe(false)
  })

  it('is not a network failure, a rate limit or a timeout, whatever status they carry', () => {
    for (const [kind, status] of [['network', 503], ['rate-limit', 429], ['timeout', undefined], ['network', 401]] as [ProviderErrorKind, number | undefined][]) {
      expect([kind, isRefusal({ id: SVC.id, kind, ...(status !== undefined ? { status } : {}) })]).toEqual([kind, false])
    }
  })

  it('is not a free engine\'s 401: it is nobody\'s service', () => {
    expect(isRefusal({ ...refused, id: 'microsoft' })).toBe(false)
  })
})

describe('shouldMarkRefusal', () => {
  it('marks a 401 when the key and the address the failing chain used are still the service\'s', () => {
    expect(shouldMarkRefusal(refused, configWith(), configWith())).toBe(true)
  })

  it('does not mark a 403, a network failure, a rate limit or a timeout', () => {
    for (const failure of [{ ...refused, status: 403 }, { id: SVC.id, kind: 'network' as const }, { id: SVC.id, kind: 'rate-limit' as const, status: 429 }, { id: SVC.id, kind: 'timeout' as const }]) {
      expect(shouldMarkRefusal(failure, configWith(), configWith())).toBe(false)
    }
  })

  it('does not mark when the key has since changed: the failure is the old key\'s, not the one in force', () => {
    expect(shouldMarkRefusal(refused, configWith(), configWith({ apiKey: 'sk-new' }))).toBe(false)
  })

  it('does not mark when the address has since changed: the key was refused by an endpoint no longer asked', () => {
    expect(shouldMarkRefusal(refused, configWith(), configWith({ baseURL: 'https://api.deepseek.com/v1' }))).toBe(false)
  })

  it('does not mark a service since deleted', () => {
    expect(shouldMarkRefusal(refused, configWith(), { ...DEFAULT_CONFIG, services: [] })).toBe(false)
  })

  it('does not mark a free engine\'s id', () => {
    expect(shouldMarkRefusal({ ...refused, id: 'microsoft' }, configWith(), configWith())).toBe(false)
  })
})

describe('idsToClear', () => {
  const marked = new Set([SVC.id])

  it('clears a mark when the service\'s key changed', () => {
    expect(idsToClear(configWith(), configWith({ apiKey: 'sk-new' }), marked)).toEqual([SVC.id])
  })

  it('clears a mark when the service\'s address changed', () => {
    expect(idsToClear(configWith(), configWith({ baseURL: 'https://api.deepseek.com/v1' }), marked)).toEqual([SVC.id])
  })

  it('clears a mark when the service was deleted', () => {
    expect(idsToClear(configWith(), { ...DEFAULT_CONFIG, services: [] }, marked)).toEqual([SVC.id])
  })

  it('does not clear for a change of the name or the model, nor for a change elsewhere: the key the endpoint refused is still the one sent', () => {
    expect(idsToClear(configWith(), configWith({ name: 'Renamed' }), marked)).toEqual([])
    expect(idsToClear(configWith(), configWith({ model: 'x/z' }), marked)).toEqual([])
    expect(idsToClear(configWith(), { ...configWith(), theme: 'dark' }, marked)).toEqual([])
  })

  it('clears only the service that changed, and never an unmarked one', () => {
    const before = configWith({}, OTHER)
    const after = configWith({ apiKey: 'sk-new' }, { ...OTHER, apiKey: 'sk-other-new' })
    expect(idsToClear(before, after, new Set([SVC.id]))).toEqual([SVC.id])
    expect(idsToClear(before, configWith({}, { ...OTHER, apiKey: 'sk-other-new' }), new Set([SVC.id, OTHER.id]))).toEqual([OTHER.id])
  })

  it('with no previous configuration to compare with (it did not parse), clears only the services no longer there', () => {
    // a reset out of an unreadable configuration deletes every service: their marks protect nothing
    expect(idsToClear(null, { ...DEFAULT_CONFIG, services: [] }, marked)).toEqual([SVC.id])
    // a key that may or may not have changed is left to the next connection test
    expect(idsToClear(null, configWith({ apiKey: 'sk-new' }), marked)).toEqual([])
  })

  it('never clears a free engine\'s id', () => {
    expect(idsToClear(configWith(), { ...DEFAULT_CONFIG, services: [], provider: 'google-web' }, new Set(['microsoft']))).toEqual([])
  })
})

describe('the keeper: the background\'s writes of the record', () => {
  /** A record in memory whose operations run in the order asked, as service-health.ts's queue runs them */
  function keeper(stored: () => Promise<Config>) {
    const marks = new Set<string>()
    let queue: Promise<unknown> = Promise.resolve()
    const turn = <T>(op: () => Promise<T>): Promise<T> => {
      const next = queue.then(op, op)
      queue = next.catch(() => undefined)
      return next
    }
    const warn = vi.fn()
    const keep = createHealthKeeper({
      getConfig: stored,
      mark: (id, still) => turn(async () => { if (await still()) marks.add(id) }),
      clearAmong: pick => turn(async () => { const gone = pick(new Set(marks)); for (const id of gone) marks.delete(id); return gone }),
      warn,
    })
    return { keep, marks, warn, settled: () => queue }
  }

  it('marks a 401 decided against the configuration stored when its turn comes', async () => {
    const k = keeper(async () => configWith())
    k.keep.failed(configWith(), refused)
    await k.settled()
    expect([...k.marks]).toEqual([SVC.id])
  })

  it('does not even ask for a 403', async () => {
    const stored = vi.fn(async () => configWith())
    const k = keeper(stored)
    k.keep.failed(configWith(), { ...refused, status: 403 })
    await k.settled()
    expect(k.marks.size).toBe(0)
    expect(stored).not.toHaveBeenCalled()
  })

  it('a configuration that cannot be read marks nothing, and becomes a fixed line — never an unhandled rejection, never the key', async () => {
    const k = keeper(async () => { throw new Error('storage gone, sk-secret') })
    k.keep.failed(configWith(), refused)
    await k.settled()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(k.marks.size).toBe(0)
    expect(k.warn).toHaveBeenCalledTimes(1)
    expect(String(k.warn.mock.calls[0]?.[0])).not.toContain('sk-')
  })

  it('a key or an address changed, or a service deleted, clears its mark; a rename does not', async () => {
    const k = keeper(async () => configWith())
    k.marks.add(SVC.id)
    k.keep.configChanged(configWith({ name: 'Renamed' }), configWith())
    await k.settled()
    expect([...k.marks]).toEqual([SVC.id])
    k.keep.configChanged(configWith({ apiKey: 'sk-new' }), configWith())
    await k.settled()
    expect(k.marks.size).toBe(0)
  })

  it('a previous configuration that did not parse compares no key, and still clears a service no longer there', async () => {
    const k = keeper(async () => configWith())
    k.marks.add(SVC.id)
    k.keep.configChanged(configWith({ apiKey: 'sk-new' }), null)
    await k.settled()
    expect([...k.marks]).toEqual([SVC.id])
    k.keep.configChanged({ ...DEFAULT_CONFIG, services: [] }, null)
    await k.settled()
    expect(k.marks.size).toBe(0)
  })

  it('a mark queued before a key change is seen by the clear that change asks for: the clear decides in its own turn', async () => {
    // The race the queue closes: the refusal's stored configuration read before the save lands, its write after the
    // configuration watcher has already looked at the record
    let release: (() => void) | null = null
    const gate = new Promise<void>(resolve => { release = resolve })
    const k = keeper(async () => { await gate; return configWith() })
    k.keep.failed(configWith(), refused)
    k.keep.configChanged(configWith({ apiKey: 'sk-new' }), configWith())
    release!()
    await k.settled()
    expect(k.marks.size).toBe(0)
  })
})
