import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderStatus } from '@/providers/transport'

// the chain's status as the background would answer it; each test sets what it needs
let status: Partial<ProviderStatus>
const cancel = vi.fn(async () => {})
vi.mock('@/shared/transport', () => ({ createMessageTransport: () => ({ status: async () => status, cancel, translate: vi.fn() }) }))
const { openEngine } = await import('@/pdf-reader/engine/engine.mjs')

const unavailable = (over: Partial<ProviderStatus>): Partial<ProviderStatus> => ({ available: false, providerId: 'my-llm', chosen: 'my-llm', demotions: [], ...over })

describe('openEngine: why the chain cannot translate, in its own error kinds (final review)', () => {
  beforeEach(() => cancel.mockClear())

  it("is a missing key when the reader's own service cannot run", async () => {
    status = unavailable({})
    await expect(openEngine({ paper: '2608.02163' })).rejects.toMatchObject({ name: 'EngineError', kind: 'no-key' })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('is the reason the service was put aside, when it was', async () => {
    status = unavailable({ demotions: [{ id: 'my-llm', kind: 'auth' }] })
    await expect(openEngine({ paper: '2608.02163' })).rejects.toMatchObject({ kind: 'auth' })
  })

  it('is unknown for a built-in engine that cannot run', async () => {
    status = unavailable({ providerId: 'microsoft', chosen: 'microsoft' })
    await expect(openEngine({ paper: '2608.02163' })).rejects.toMatchObject({ kind: 'unknown' })
  })
})
