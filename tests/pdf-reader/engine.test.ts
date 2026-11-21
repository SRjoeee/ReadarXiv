import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderStatus, TranslateCall } from '@/providers/transport'

// the chain's status as the background would answer it; each test sets what it needs
let status: Partial<ProviderStatus>
const cancel = vi.fn(async () => {})
// the background's answer to a translate call; each test sets what it needs
let answer: unknown
// the translate calls the background was sent
const sent: TranslateCall[] = []
vi.mock('@/shared/transport', () => ({ createMessageTransport: () => ({ status: async () => status, cancel, translate: vi.fn(async (call: (typeof sent)[number]) => { sent.push(call); return answer }) }) }))
const { openEngine } = await import('@/pdf-reader/session/translate.mjs')

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

describe('openEngine: translate keeps what the background answered of each text (stage 4b: units of the chain)', () => {
  it("the text written back in the session's wire, the translator that answered and its sentences as wire lengths: the highlight's sentences (B3)", async () => {
    status = { available: true, providerId: 'microsoft', chosen: 'microsoft', targetLanguage: 'cmn', renderPath: 'markers', maxBatchChars: 1000, maxBatchItems: 10, identity: 'ms' } as Partial<ProviderStatus>
    answer = { ok: true, cached: 0, results: [
      { id: '0', ok: true, content: [{ t: 'text', s: '甲乙丙丁戊己庚' }], by: 'microsoft:1', engine: 'microsoft', sentences: { src: [11], tr: [4] } },
      { id: '1', ok: true, content: [{ t: 'text', s: '辛' }], by: 'microsoft:1', engine: 'microsoft' },
    ] }
    const engine = await openEngine({ paper: '2608.02163' })
    expect(await engine.translate(['Aaaaaaaaa. Bbbb.', 'C'])).toEqual([{ text: '甲乙丙丁戊己庚', by: 'microsoft:1', alignment: { source: [11, 5], target: [4, 3] } }, { text: '辛', by: 'microsoft:1' }])
  })

  it('a text the engine cut into sentences goes as a unit that lights by sentence; one cut into none is aligned whole', async () => {
    status = { available: true, providerId: 'google-web', chosen: 'google-web', targetLanguage: 'deu', renderPath: 'tags', maxBatchChars: 1000, maxBatchItems: 10, identity: 'g' } as Partial<ProviderStatus>
    answer = { ok: true, cached: 0, results: [
      { id: '0', ok: true, content: [{ t: 'text', s: 'Aa. Bb.' }], by: 'google:1', sentences: { src: [4], tr: [4] } },
      { id: '1', ok: true, content: [{ t: 'text', s: 'C' }], by: 'google:1' },
      { id: '2', ok: true, content: [{ t: 'text', s: 'D' }], by: 'google:1' },
    ] }
    const engine = await openEngine({ paper: '2608.02163' })
    sent.length = 0
    expect(await engine.translate(['Aa. Bb.', 'C', 'D'], {}, [[4], undefined, []])).toEqual([
      { text: 'Aa. Bb.', by: 'google:1', alignment: { source: [4, 3], target: [4, 3] } },
      { text: 'C', by: 'google:1' },
      { text: 'D', by: 'google:1', alignment: { source: [1], target: [1] } },
    ])
    expect(sent.at(-1)?.units.map(u => u.sentences === true)).toEqual([true, false, false])
  })

  it("a call carries the texts as units, the session's target and scope; a refused unit is a text the engine could not take, a lost one a failure", async () => {
    status = { available: true, providerId: 'microsoft', chosen: 'microsoft', targetLanguage: 'cmn', renderPath: 'markers', maxBatchChars: 1000, maxBatchItems: 10, identity: 'ms' } as Partial<ProviderStatus>
    answer = { ok: true, cached: 0, results: [
      { id: '0', ok: false, why: { kind: 'refused' }, error: { kind: 'invalid-response', message: 'refused' } },
      { id: '1', ok: false, why: { kind: 'unavailable' }, error: { kind: 'network', message: 'down' } },
    ] }
    const engine = await openEngine({ paper: '2608.02163' })
    sent.length = 0
    await expect(engine.translate(['A @a# b', 'C'])).rejects.toMatchObject({ name: 'EngineError', kind: 'network', partial: [null, null], lost: new Set([1]) })
    expect(sent.at(-1)).toMatchObject({ target: 'cmn', scope: expect.stringMatching(/^axt-pdf-/), units: [{ id: '0', content: [{ t: 'text', s: 'A ' }, { t: 'el', id: 'x1' }, { t: 'text', s: ' b' }] }, { id: '1' }] })
  })
})
