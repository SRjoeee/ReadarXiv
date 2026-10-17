// The paper's abstract page as the reader reads it (session/paper.ts): the latest version of an id with none, and the title,
// one request at a time; a read that cannot be had (the network, a status, no answer in time) forgotten for a retry
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ABSTRACT_CAP, ABSTRACT_MS, abstractPage } from '@/pdf-reader/session/paper'

afterEach(() => vi.useRealTimers())
const PAGE = '<!doctype html><meta name="citation_title" content="T"><div class="submission-history"><b>[v1]</b> <strong>[v3]</strong></div>'

describe('the abstract page', () => {
  it('an answer that never comes is let go at ABSTRACT_MS: nothing to be had now, and asked again on the next read (Codex on #390)', async () => {
    vi.useFakeTimers()
    let calls = 0
    const f = vi.fn((_u: string, init: RequestInit) => {
      calls++
      if (calls > 1) return Promise.resolve(new Response(PAGE, { status: 200 }))
      return new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(init.signal?.reason)))
    })
    const read = abstractPage('2600.00001', f as unknown as typeof fetch)
    const first = read()
    await vi.advanceTimersByTimeAsync(ABSTRACT_MS)
    expect(await first).toEqual({ title: '', version: null })
    expect(await read()).toEqual({ title: 'T', version: 3 })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('a body that stops, or that runs past ABSTRACT_CAP, is let go: nothing to be had now', async () => {
    vi.useFakeTimers()
    const stops = vi.fn(async (_u: string, init: RequestInit) => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('<html>')); init.signal?.addEventListener('abort', () => c.error(init.signal?.reason)) } }), { status: 200 }))
    const a = abstractPage('2600.00001', stops as unknown as typeof fetch)()
    await vi.advanceTimersByTimeAsync(ABSTRACT_MS)
    expect(await a).toEqual({ title: '', version: null })
    vi.useRealTimers()
    const cancel = vi.fn()
    const endless = vi.fn(async () => new Response(new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(65_536).fill(32)) }, cancel }), { status: 200 }))
    expect(await abstractPage('2600.00001', endless as unknown as typeof fetch)()).toEqual({ title: '', version: null })
    expect(cancel).toHaveBeenCalled()
    expect(ABSTRACT_CAP).toBeGreaterThan(200_000)
  })
})
