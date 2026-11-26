// @vitest-environment node
// The PDF download's reads of arXiv's bytes and the add-on, whole (export/run.ts readComposed): one operation, so that a read
// that fails lets the other go and the failure is told once both have stopped (#685: 4704125911); both held to their digests.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readComposed } from '../../src/export/run.ts'

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const ORIG = new Uint8Array(4096).fill(7)
const ADD = new Uint8Array(512).fill(9)

/** a body that gives `head` and then waits until its request is let go, its end told in `log` */
function stalling(head: Uint8Array, signal: AbortSignal | undefined, log: string[], name: string): Response {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(head)
      signal?.addEventListener('abort', () => {
        log.push(`${name} let go`)
        c.error(new DOMException('aborted', 'AbortError'))
      })
    },
  })
  return new Response(body, { status: 200 })
}

describe("the PDF download's whole reads, one operation", () => {
  it('lets the original go where the add-on fails, and tells the failure only once both have stopped', async () => {
    const log: string[] = []
    const fetch = async (url: string, init?: RequestInit) => {
      if (url === '/orig') return stalling(ORIG.subarray(0, 100), init?.signal ?? undefined, log, 'original')
      return new Response(null, { status: 404 })
    }
    const read = readComposed(
      { fetch, original: { url: '/orig', bytes: ORIG.length, sha256: sha(ORIG) }, addOn: { url: '/addon', bytes: ADD.length, sha256: sha(ADD) } },
      new AbortController().signal,
      () => {},
    ).catch((e: unknown) => {
      log.push('told')
      return e
    })
    const e = await read
    expect(String(e)).toMatch(/404/)
    expect(log).toEqual(['original let go', 'told'])
  })

  it('reads both into one buffer, each held to its digest', async () => {
    const fetch = async (url: string) => new Response(url === '/orig' ? ORIG : ADD, { status: 200 })
    const out = await readComposed(
      { fetch, original: { url: '/orig', bytes: ORIG.length, sha256: sha(ORIG) }, addOn: { url: '/addon', bytes: ADD.length, sha256: sha(ADD) } },
      new AbortController().signal,
      () => {},
    )
    expect([out.length, out[0], out[ORIG.length]]).toEqual([ORIG.length + ADD.length, 7, 9])
  })
})
