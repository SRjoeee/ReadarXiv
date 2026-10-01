import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderStatus } from '@/providers/transport'

// the chain's status as the background would answer it; each test sets what it needs
let status: Partial<ProviderStatus>
const cancel = vi.fn(async () => {})
// the background's answer to a translate call; each test sets what it needs
let answer: unknown
// the translate calls the background was sent
const sent: { request: { segments: { id: string; text: string; cuts?: number[] }[] }; keepContext?: boolean }[] = []
vi.mock('@/shared/transport', () => ({ createMessageTransport: () => ({ status: async () => status, cancel, translate: vi.fn(async (call: (typeof sent)[number]) => { sent.push(call); return answer }) }) }))
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

describe('openEngine: translate keeps what the background answered of each text', () => {
  it("the text, the identity that made it and the engine's sentence lengths (Microsoft's sentLen, verified by the service): the highlight's sentences (B3)", async () => {
    status = { available: true, providerId: 'microsoft', chosen: 'microsoft', targetLanguage: 'cmn', renderPath: 'markers', maxBatchChars: 1000, maxBatchItems: 10, identity: 'ms' } as Partial<ProviderStatus>
    const alignment = { source: [10, 5], target: [4, 3] }
    answer = { ok: true, result: { provider: 'microsoft', segments: [{ id: '0', text: '甲乙丙丁戊己庚', identity: 'ms', alignment }, { id: '1', text: '辛', identity: 'ms' }] } }
    const engine = await openEngine({ paper: '2608.02163' })
    expect(await engine.translate(['Aaaaaaaaa. Bbbb.', 'C'])).toEqual([{ text: '甲乙丙丁戊己庚', by: 'ms', alignment }, { text: '辛', by: 'ms' }])
  })

  it('the sentence cuts of a text sent with it, where given (the tags path: the service marks them, B3b)', async () => {
    status = { available: true, providerId: 'google-web', chosen: 'google-web', targetLanguage: 'deu', renderPath: 'tags', maxBatchChars: 1000, maxBatchItems: 10, identity: 'g' } as Partial<ProviderStatus>
    answer = { ok: true, result: { provider: 'google-web', segments: [{ id: '0', text: 'Aa. Bb.', identity: 'g', alignment: { source: [4, 3], target: [4, 3] } }, { id: '1', text: 'C', identity: 'g' }] } }
    const engine = await openEngine({ paper: '2608.02163' })
    sent.length = 0
    expect(await engine.translate(['Aa. Bb.', 'C'], {}, [[4], undefined])).toEqual([{ text: 'Aa. Bb.', by: 'g', alignment: { source: [4, 3], target: [4, 3] } }, { text: 'C', by: 'g' }])
    expect(sent.at(-1)?.request.segments).toEqual([{ id: '0', text: 'Aa. Bb.', cuts: [4] }, { id: '1', text: 'C' }])
    // asking the service to keep the translation's context: no markers on an engine that would translate each sentence
    // apart (Google), so its translation is lit by paragraph; Microsoft's own lengths and an LLM's markers stand
    expect(sent.at(-1)).toMatchObject({ keepContext: true })
  })
})
