// The background's side of the recogniser (DESIGN §15.3): the offscreen document opened when a figure needs reading,
// figures handed over one at a time, a figure that does not come back given up on. The document and the message to it
// are faked; what is tested is what the client does with them
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OCR_VERSION } from '@/core/ocr/version'
import { OcrBackendError } from '@/entrypoints/background/ocr-backend'
import { createRecogniserClient, type RecogniserClientDeps } from '@/entrypoints/background/recogniser'
import type { OcrResult, OcrRunResponse } from '@/shared/ocr'

const RESULT: OcrResult = { width: 10, height: 20, frames: 1, lines: [{ text: 'Accuracy', quad: [[0, 0], [1, 0], [1, 1], [0, 1]], conf: 0.98 }] }
const FIGURE = { image: 'AAAA', mime: 'image/png' }

/** An offscreen document that is there once created, and a `run` whose answers the test gives one by one */
function harness(over: Partial<RecogniserClientDeps> = {}) {
  let open = false
  const pending: Array<{ request: { image: string; mime: string }; answer: (reply: OcrRunResponse) => void; fail: (e: Error) => void }> = []
  const offscreen = {
    has: vi.fn(async () => open),
    create: vi.fn(async () => { open = true }),
    close: vi.fn(async () => { open = false }),
  }
  const run = vi.fn((request: { image: string; mime: string }) => new Promise<OcrRunResponse>((answer, fail) => { pending.push({ request, answer, fail }) }))
  const client = createRecogniserClient({ offscreen, run, ...over })
  return { client, offscreen, run, pending, shut: () => { open = false } }
}
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

describe('createRecogniserClient', () => {
  afterEach(() => { vi.useRealTimers() })

  it('names the recogniser\'s build: the OCR cache key is computed from it', () => {
    expect(harness().client.version).toBe(OCR_VERSION)
  })

  it('opens the document for the first figure and not again while it is there; two figures arriving together open one', async () => {
    const { client, offscreen, pending } = harness()
    const first = client.ocr(FIGURE)
    const second = client.ocr(FIGURE)
    await settle()
    expect(offscreen.create).toHaveBeenCalledTimes(1)
    pending[0]!.answer({ ok: true, result: RESULT })
    await expect(first).resolves.toEqual(RESULT)
    await settle()
    pending[1]!.answer({ ok: true, result: RESULT })
    await expect(second).resolves.toEqual(RESULT)
    expect(offscreen.create).toHaveBeenCalledTimes(1)
  })

  it('hands figures over one at a time: the second is not sent until the first has come back', async () => {
    const { client, run, pending } = harness()
    const first = client.ocr(FIGURE)
    void client.ocr({ image: 'BBBB', mime: 'image/jpeg' })
    await settle()
    expect(run).toHaveBeenCalledTimes(1)
    pending[0]!.answer({ ok: true, result: RESULT })
    await first
    await settle()
    expect(run).toHaveBeenCalledTimes(2)
    expect(pending[1]!.request).toEqual({ image: 'BBBB', mime: 'image/jpeg' })
  })

  it('the document closed itself while idle: asked for again before the next figure, and opened again', async () => {
    const { client, offscreen, pending, shut } = harness()
    const first = client.ocr(FIGURE)
    await settle()
    pending[0]!.answer({ ok: true, result: RESULT })
    await first
    shut()
    void client.ocr(FIGURE)
    await settle()
    expect(offscreen.create).toHaveBeenCalledTimes(2)
  })

  it('nobody answered — the document closed between the asking and the sending: opened and sent once more, and only once', async () => {
    const { client, offscreen, run, pending } = harness()
    const figure = client.ocr(FIGURE)
    await settle()
    pending[0]!.fail(new Error('Could not establish connection. Receiving end does not exist.'))
    await settle()
    expect(run).toHaveBeenCalledTimes(2)
    expect(offscreen.has).toHaveBeenCalledTimes(2)
    pending[1]!.fail(new Error('Could not establish connection. Receiving end does not exist.'))
    await expect(figure).rejects.toMatchObject({ kind: 'network' })
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('heard and left unanswered — the popup is open, the document is not — counts as nobody answering: sent once more, and a second silence is a failure, not a request left waiting', async () => {
    const { client, run, pending } = harness()
    const figure = client.ocr(FIGURE)
    await settle()
    pending[0]!.answer(undefined as unknown as OcrRunResponse)
    await settle()
    expect(run).toHaveBeenCalledTimes(2)
    pending[1]!.answer(undefined as unknown as OcrRunResponse)
    await expect(figure).rejects.toMatchObject({ kind: 'network' })
    // And the queue moves on
    const next = client.ocr(FIGURE)
    await settle()
    expect(run).toHaveBeenCalledTimes(3)
    pending[2]!.answer({ ok: true, result: RESULT })
    await expect(next).resolves.toEqual(RESULT)
  })

  it('a failure the recogniser reports keeps its kind: a file that does not decode is the request\'s fault', async () => {
    const { client, pending } = harness()
    const figure = client.ocr(FIGURE)
    await settle()
    pending[0]!.answer({ ok: false, kind: 'bad-request', message: 'The source image could not be decoded.' })
    await expect(figure).rejects.toBeInstanceOf(OcrBackendError)
    await expect(figure).rejects.toMatchObject({ kind: 'bad-request' })
  })

  it('a figure that does not come back is given up on, the document closed, and the next figure gets a fresh one — with the first figure\'s longer budget again', async () => {
    vi.useFakeTimers()
    const { client, offscreen, run, pending } = harness({ timeoutMs: 1_000, firstTimeoutMs: 5_000 })
    const first = client.ocr(FIGURE)
    const firstOutcome = first.catch((e: OcrBackendError) => e.kind)
    const second = client.ocr(FIGURE)
    await vi.advanceTimersByTimeAsync(4_999)
    expect(offscreen.close).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    expect(await firstOutcome).toBe('timeout')
    expect(offscreen.close).toHaveBeenCalledTimes(1)
    // The queue moved on only once the document was closed, into a new one
    await vi.advanceTimersByTimeAsync(0)
    expect(offscreen.create).toHaveBeenCalledTimes(2)
    expect(run).toHaveBeenCalledTimes(2)
    // A late answer to the figure given up on is nobody's, and does not move the queue a second time: a third
    // figure waits for the second, which is still in the worker. The second's budget runs from the closing, at
    // 5 000: a millisecond short of it nothing more has been closed
    const third = client.ocr(FIGURE)
    pending[0]!.answer({ ok: true, result: RESULT })
    await vi.advanceTimersByTimeAsync(4_998)
    expect(offscreen.close).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(2)
    pending[1]!.answer({ ok: true, result: RESULT })
    await expect(second).resolves.toEqual(RESULT)
    await vi.advanceTimersByTimeAsync(0)
    expect(run).toHaveBeenCalledTimes(3)
    pending[2]!.answer({ ok: true, result: RESULT })
    await expect(third).resolves.toEqual(RESULT)
  })

  it('a figure given up on is not sent again: the closing of the document fails its send, and that failure is nobody\'s to retry', async () => {
    vi.useFakeTimers()
    const { client, offscreen, run, pending, shut } = harness({ timeoutMs: 1_000, firstTimeoutMs: 5_000 })
    // As the browser does it: a message to a document that is closed under it is rejected
    offscreen.close.mockImplementation(async () => {
      shut()
      for (const each of pending.splice(0)) each.fail(new Error('the message port closed before a response was received'))
    })
    const first = client.ocr(FIGURE).catch((e: OcrBackendError) => e.kind)
    const second = client.ocr({ image: 'BBBB', mime: 'image/jpeg' })
    await vi.advanceTimersByTimeAsync(5_001)
    expect(await first).toBe('timeout')
    await vi.advanceTimersByTimeAsync(0)
    // The fresh document has one figure in it, the next one: sent a second time, the figure that took too long would
    // take the worker from it, and its budget with it
    expect(run).toHaveBeenCalledTimes(2)
    expect(pending.map(each => each.request.image)).toEqual(['BBBB'])
    pending[0]!.answer({ ok: true, result: RESULT })
    await expect(second).resolves.toEqual(RESULT)
  })

  it('once a figure has come back the budget is the ordinary one', async () => {
    vi.useFakeTimers()
    const { client, pending } = harness({ timeoutMs: 1_000, firstTimeoutMs: 5_000 })
    const first = client.ocr(FIGURE)
    await vi.advanceTimersByTimeAsync(0)
    pending[0]!.answer({ ok: true, result: RESULT })
    await first
    const second = client.ocr(FIGURE).catch((e: OcrBackendError) => e.kind)
    await vi.advanceTimersByTimeAsync(1_001)
    expect(await second).toBe('timeout')
  })

  it('cancel withdraws a scope\'s figures — the queued ones never sent, the one in the worker answered at once and its result dropped — and leaves other scopes alone', async () => {
    const { client, run, pending } = harness()
    const inWorker = client.ocr(FIGURE, 's1').catch((e: OcrBackendError) => e.kind)
    const queued = client.ocr(FIGURE, 's1').catch((e: OcrBackendError) => e.kind)
    const other = client.ocr(FIGURE, 's2')
    await settle()
    expect(client.cancel('s1')).toBe(2)
    expect(await inWorker).toBe('aborted')
    expect(await queued).toBe('aborted')
    // The worker is still on the withdrawn figure: the other scope's goes in only when it comes back
    expect(run).toHaveBeenCalledTimes(1)
    pending[0]!.answer({ ok: true, result: RESULT })
    await settle()
    expect(run).toHaveBeenCalledTimes(2)
    pending[1]!.answer({ ok: true, result: RESULT })
    await expect(other).resolves.toEqual(RESULT)
    expect(client.cancel('s1')).toBe(0)
  })
})
