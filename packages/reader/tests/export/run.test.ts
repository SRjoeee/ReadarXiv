// @vitest-environment node
// The PDF download's reads of arXiv's bytes and the add-on, whole (export/run.ts readComposed): one operation, so that a read
// that fails lets the other go and the failure is told once both have stopped (#685: 4704125911); both held to their digests.
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { fontsOnWorker, readComposed } from '../../src/export/run.ts'

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
      {
        fetch,
        original: { url: '/orig', bytes: ORIG.length, sha256: sha(ORIG) },
        addOn: { url: '/addon', bytes: ADD.length, sha256: sha(ADD) },
      },
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
      {
        fetch,
        original: { url: '/orig', bytes: ORIG.length, sha256: sha(ORIG) },
        addOn: { url: '/addon', bytes: ADD.length, sha256: sha(ADD) },
      },
      new AbortController().signal,
      () => {},
    )
    expect([out.length, out[0], out[ORIG.length]]).toEqual([ORIG.length + ADD.length, 7, 9])
  })
})

describe("the slices decoded on the export's own PDF.js worker (#686: no global worker, none left behind)", () => {
  const W = new Uint8Array([0x77, 0x4f, 0x46, 0x32, ...new Array(60).fill(0)])
  /** the export's worker as the reader gives it: opened for the decoding, closed after it */
  const counted = () => {
    const log: string[] = []
    return {
      log,
      worker: { open: () => (log.push('open'), { worker: 'axt-export' }), close: () => void log.push('close') },
    }
  }
  it('opens the worker for the decoding and closes it after, twice in a row leaving none open', async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const c = counted()
    const asked: unknown[] = []
    const spy = {
      getDocument: (src: Record<string, unknown>) => {
        asked.push(src.worker)
        // (Node's PDF.js has no worker of ours to run on: the options' worker stood in, the document read as Node reads it)
        const { worker: _, ...rest } = src
        return pdfjs.getDocument(rest as never)
      },
    }
    for (const _ of [1, 2]) await fontsOnWorker(spy as never, c.worker, [], new AbortController().signal)
    await fontsOnWorker(spy as never, c.worker, [{ key: 'k', woff2: W }], new AbortController().signal).catch(() => {})
    expect(c.log).toEqual(['open', 'close', 'open', 'close', 'open', 'close'])
  })
  it('closes it when the decoding fails, and when it is cancelled', async () => {
    const c = counted()
    const refusing = { getDocument: () => ({ promise: Promise.reject(new Error('refused')), destroy: async () => {} }) }
    const slice = { key: 'k', woff2: W }
    await expect(fontsOnWorker(refusing as never, c.worker, [slice], new AbortController().signal)).rejects.toThrow()
    let destroyed = false
    const hanging = {
      getDocument: () => {
        let fail: (e: Error) => void = () => {}
        return {
          promise: new Promise<never>((_, reject) => {
            fail = reject
          }),
          destroy: async () => {
            destroyed = true
            fail(new Error('Worker was destroyed'))
          },
        }
      },
    }
    const a = new AbortController()
    const going = fontsOnWorker(hanging as never, c.worker, [slice], a.signal)
    await new Promise((r) => setTimeout(r, 10))
    a.abort()
    await expect(going).rejects.toThrow()
    expect(destroyed).toBe(true)
    expect(c.log).toEqual(['open', 'close', 'open', 'close'])
  })
})

describe("a cancel at PDF.js's loading, against the pinned PDF.js (#686: 4706206031)", () => {
  it('settles the cancelled decoding at once, ends its worker, and lets the next one through', async () => {
    const { spawnSync } = await import('node:child_process')
    const { fileURLToPath } = await import('node:url')
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('./cancel-child.mts', import.meta.url))], {
      encoding: 'utf8',
      timeout: 60_000,
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
    })
    const line = child.stdout.trim().split('\n').pop() ?? ''
    expect(JSON.parse(line || '{}')).toEqual({
      transportSet: true,
      first: 'cancelled',
      second: 'made',
      log: ['open', 'close', 'open', 'close'],
      allEnded: true,
    })
  }, 90_000)
})
