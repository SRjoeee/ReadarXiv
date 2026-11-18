// Our server's rows as a whole reader follows them on a host that makes none (reader.ts, the rows' handler: every rows object
// the documents name for the target, each once, until its run is done or failed), over a stand-in of our server: the follow a
// stream whose frames the test writes, the objects the fixture's (s1-columns: its head, its units, its rows), a rows object's
// answer held until the test lets it go. PDF.js never loads (nothing is drawn; no input of the panes'), so that the inputs the
// session takes are the documents, the objects and the timers alone. Staging, 2026-11-17 (six papers opened at once): a reader
// whose rows never reached their end on a paper's first open, every attempt of our server's ended translated
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PaperDoc as Doc, Row } from '@readarxiv/format'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULTS } from '../src/prefs.ts'
import type { Reader } from '../src/reader.ts'
import { layerOf, paperDoc, prepareOf, runOf } from './helpers/doc.ts'
import { bytesOf, rangedServer } from './helpers/ranged-server.ts'

vi.mock('../src/pdfjs/kit.ts', async (real) => ({
  ...(await real<object>()),
  loadKit: () => new Promise(() => {}),
}))
const { openReader } = await import('../src/reader.ts')

const SEG = '2600_00001v1'
const TARGET = 'de'
const enc = (s: string) => new TextEncoder().encode(s)
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '../e2e/fixtures/s1-columns')
const fileOf = (end: string) =>
  new Uint8Array(
    readFileSync(join(FIXTURE, 'bundle', readdirSync(join(FIXTURE, 'bundle')).find((f) => f.endsWith(end)) as string)),
  )
const HEAD = fileOf('.head'),
  UNITS = fileOf('.units')
const ROWS = (JSON.parse(readFileSync(join(FIXTURE, 'de.rows.json'), 'utf8')) as { rows: Row[] }).rows
const at = (dir: string, b: Uint8Array) => ({ path: `${dir}/${sha(b)}`, sha256: sha(b), bytes: b.length })
const CATALOG = at(`p/${SEG}/x`, HEAD)
const UNIT_REFS = [at(`p/${SEG}/x`, UNITS)]
/** a rows object as our server stores one (format's Rows), and its ref in the target's directory */
const rowsObject = (rows: Row[]) => {
  const bytes = enc(JSON.stringify({ format: 1, rows }))
  return { bytes, ref: at(`r/${SEG}/${TARGET}/0e2e00000000`, bytes) }
}
/** the paper's document: its layer of the deployed build, and the target's run as `run` states it */
const docOf = (rev: number, run: Partial<Doc['targets'][string]>): Doc =>
  paperDoc({
    epoch: 'e1',
    rev,
    prepare: prepareOf({ state: 'done', units: UNIT_REFS }),
    layer: layerOf({ catalog: CATALOG, units: UNIT_REFS, stale: false }),
    targets: { [TARGET]: runOf({ units: UNIT_REFS, ...run }) },
  })

/** our server, stood in for: the follow's streams (each a frame the test writes), the objects by path, an object's answer held
 *  (`hold`) until the test lets it go */
function server() {
  const objects = new Map<string, Uint8Array>([
    [CATALOG.path, HEAD],
    [UNIT_REFS[0]?.path as string, UNITS],
  ])
  const original = rangedServer(new Map([[`/api/v2/o/arxiv/${SEG}.pdf`, { bytes: bytesOf(200_000), etag: '"o"' }]]))
  const streams: ReadableStreamDefaultController<Uint8Array>[] = []
  const held = new Map<string, () => void>()
  const asked: string[] = []
  const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const path = url.split('?')[0] as string
    asked.push(path)
    if (path.startsWith('/api/v2/o/arxiv/')) return original.fetch(url, init)
    if (path.startsWith('/api/v2/papers/'))
      return new Response(
        new ReadableStream<Uint8Array>({
          start: (c) => {
            streams.push(c)
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      )
    if (path === '/api/v2/open') throw new Error('no open is asked: the document lacks nothing')
    const key = path.slice('/api/v2/o/'.length)
    const bytes = objects.get(key)
    if (!bytes) return new Response('', { status: 404 })
    if (held.has(key)) await new Promise<void>((go) => held.set(key, go))
    return new Response(bytes.slice(), { status: 200 })
  }
  return {
    fetch,
    asked,
    serve(o: { bytes: Uint8Array; ref: { path: string } }) {
      objects.set(o.ref.path, o.bytes)
    },
    /** an object's answer held until `let` */
    hold(o: { ref: { path: string } }) {
      held.set(o.ref.path, () => {})
    },
    let(o: { ref: { path: string } }) {
      const go = held.get(o.ref.path)
      held.delete(o.ref.path)
      go?.()
    },
    /** a document told on the follow's stream now open; `end`: the stream ended after it, as our server ends one whose last
     *  document says nothing runs */
    tell(d: Doc, o: { end?: boolean } = {}) {
      const c = streams.at(-1)
      if (!c) throw new Error('no follow open')
      c.enqueue(enc(`data: ${JSON.stringify(d)}\n\n`))
      if (o.end) c.close()
    },
    get follows() {
      return streams.length
    },
  }
}

let reader: Reader | null = null
/** the stand-in the reader now opened reads */
let stand: ReturnType<typeof server> | null = null
/** the digests under way: the thread pool's, which no number of the event loop's turns is known to bring back (a fixed count of
 *  turns let one through under a loaded machine's run, the hosted-CI form of 2026-11-18) */
let digesting = 0
/** what the reader has done that a test reads: its rows as told, the inputs its session took, the asks of the stand-in */
const moved = () => `${JSON.stringify(reader?.state().rows)} ${reader?.probe().inputs} ${stand?.asked.length}`

/** time moved on by `ms`, then every answer and digest the host's network gives meanwhile settled: turns of the event loop
 *  (the fake clock not moved) until no digest is under way and nothing has moved for twenty turns in a row */
async function pass(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms)
  for (let quiet = 0, turns = 0; quiet < 20 && turns < 200_000; turns++) {
    const before = moved()
    await vi.advanceTimersByTimeAsync(0)
    await new Promise<void>((r) => setImmediate(r))
    quiet = digesting === 0 && moved() === before ? quiet + 1 : 0
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
  const digest = crypto.subtle.digest.bind(crypto.subtle)
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(((algorithm: AlgorithmIdentifier, data: BufferSource) => {
    digesting++
    return digest(algorithm, data).finally(() => digesting--)
  }) as typeof crypto.subtle.digest)
})
afterEach(() => {
  reader?.close()
  reader = null
  stand = null
  digesting = 0
  vi.restoreAllMocks()
  vi.useRealTimers()
})

/** a reader of the paper on the stand-in, its layer's head and units read (the gate's 1.5 s past), the target's run under way
 *  with no rows yet */
async function opened(s: ReturnType<typeof server>) {
  stand = s
  reader = openReader(document.createElement('div'), {
    host: {
      fetch: s.fetch,
      original: () => `/api/v2/o/arxiv/${SEG}.pdf`,
      prefs: {
        read: async () => ({ ...DEFAULTS, display: 'bilingual', target: TARGET }),
        write: async () => {},
        watch: () => () => {},
      },
    },
    paper: '2600.00001v1',
    visit: { display: 'bilingual', target: TARGET },
  })
  await pass()
  s.tell(docOf(1, { state: 'running', rows: [] }))
  await pass(2000)
  expect(s.asked).toContain(`/api/v2/o/${UNIT_REFS[0]?.path}`)
  return reader
}

describe("our server's rows, followed to their end on a paper's first open", () => {
  it("a document stating the run done, heard while a rows object of the run is being read, ends the rows: every row got, our server's record done (staging B, 2026-11-17: arriving for ever, got 212 of 212)", async () => {
    const s = server()
    const r = await opened(s)
    // the run's two windows, each a rows object, and its end's object restating them all (our server's whole)
    const half = Math.ceil(ROWS.length / 2)
    const window1 = rowsObject(ROWS.slice(0, half)),
      window2 = rowsObject(ROWS.slice(half)),
      whole = rowsObject(ROWS)
    for (const o of [window1, window2, whole]) s.serve(o)
    s.hold(window2)
    // the windows told: the second's answer held
    s.tell(docOf(2, { state: 'running', rows: [window1.ref, window2.ref], done: ROWS.length, total: ROWS.length }))
    await pass()
    expect(s.asked).toContain(`/api/v2/o/${window2.ref.path}`)
    // the run's end told meanwhile, the stream ended after it as our server ends one whose last document says nothing runs
    s.tell(docOf(3, { state: 'done', rows: [whole.ref], done: ROWS.length, total: ROWS.length }), { end: true })
    await pass()
    s.let(window2)
    // twenty minutes on: nothing more of our server's (its follow settled), nothing of the reader's
    await pass(20 * 60_000)
    expect(s.follows).toBe(1)
    expect(r.state().rows).toMatchObject({ s: 'complete', got: ROWS.length, total: ROWS.length, lost: 0 })
  })
})
