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
import { type PaperDoc as Doc, type Head, read, type Row, type Unit, type Units, write } from '@readarxiv/format'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULTS } from '../src/prefs.ts'
import type { Reader } from '../src/reader.ts'
import { RETRY_MS } from '../src/session/client.ts'
import { BACKOFF_MAX_MS, BACKOFF_MS } from '../src/session/machine.ts'
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
/** a layer as the document names it and the objects our server serves for it: its catalog (the head) and its units */
interface Layer {
  catalog: ReturnType<typeof at>
  units: ReturnType<typeof at>[]
  objects: [string, Uint8Array][]
}
const FIXTURE_LAYER: Layer = {
  catalog: CATALOG,
  units: UNIT_REFS,
  objects: [
    [CATALOG.path, HEAD],
    [UNIT_REFS[0]?.path as string, UNITS],
  ],
}
/** the fixture's layer with one unit more, of `kind`, in a directory of its own (another prepare), and its row */
function layerWith(kind: string, dir: string): { layer: Layer; unit: Unit; row: Row } {
  const unit: Unit = {
    id: sha(enc(`${kind} unit of ${dir}`)),
    kind,
    content: [{ t: 'text', s: `A ${kind} the fixture's layer does not hold.` }],
  }
  const units = write('units', { format: 1, units: [...(read('units', UNITS) as Units).units, unit] })
  const head = write('head', { ...(read('head', HEAD) as Head), made: dir, units: [units.digest] })
  const catalog = at(`p/${SEG}/${dir}`, head.bytes)
  const unitRefs = [at(`p/${SEG}/${dir}`, units.bytes)]
  const row: Row = { id: unit.id, ok: true, content: [{ t: 'text', s: `Ein ${kind}.` }], by: 'reader-rows' }
  return {
    layer: {
      catalog,
      units: unitRefs,
      objects: [
        [catalog.path, head.bytes],
        [unitRefs[0]?.path as string, units.bytes],
      ],
    },
    unit,
    row,
  }
}
/** a rows object as our server stores one (format's Rows), and its ref in the target's directory */
const rowsObject = (rows: Row[]) => {
  const bytes = enc(JSON.stringify({ format: 1, rows }))
  return { bytes, ref: at(`r/${SEG}/${TARGET}/0e2e00000000`, bytes) }
}
/** the paper's document: its layer (the fixture's unless named) of the deployed build, and the target's run as `run` states it */
const docOf = (rev: number, run: Partial<Doc['targets'][string]>, layer: Layer = FIXTURE_LAYER): Doc =>
  paperDoc({
    epoch: 'e1',
    rev,
    prepare: prepareOf({ state: 'done', units: layer.units }),
    layer: layerOf({ catalog: layer.catalog, units: layer.units, stale: false }),
    targets: { [TARGET]: runOf({ units: layer.units, ...run }) },
  })

/** our server, stood in for: the follow's streams (each a frame the test writes), the objects by path, an object's answer held
 *  (`hold`) until the test lets it go, or refused by the network (`refuse`) until it is served again (`admit`) */
function server(...layers: Layer[]) {
  const objects = new Map<string, Uint8Array>([FIXTURE_LAYER, ...layers].flatMap((l) => l.objects))
  const original = rangedServer(new Map([[`/api/v2/o/arxiv/${SEG}.pdf`, { bytes: bytesOf(200_000), etag: '"o"' }]]))
  const streams: ReadableStreamDefaultController<Uint8Array>[] = []
  const held = new Map<string, () => void>()
  const refused = new Set<string>()
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
    if (refused.has(key)) throw new TypeError('network')
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
    refuse(o: { ref: { path: string } }) {
      refused.add(o.ref.path)
    },
    admit(o: { ref: { path: string } }) {
      refused.delete(o.ref.path)
    },
    /** the asks of an object */
    asks: (o: { ref: { path: string } }) => asked.filter((p) => p === `/api/v2/o/${o.ref.path}`).length,
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
async function opened(s: ReturnType<typeof server>, layer: Layer = FIXTURE_LAYER) {
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
  s.tell(docOf(1, { state: 'running', rows: [] }, layer))
  await pass(2000)
  expect(s.asked).toContain(`/api/v2/o/${layer.units[0]?.path}`)
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

describe("a rows object our server names that cannot be read (the coordinator's rulings of 2026-11-18, PDF-READER §8.1)", () => {
  /** the run's two windows and its end's whole, each a rows object our server serves */
  function objects(s: ReturnType<typeof server>) {
    const half = Math.ceil(ROWS.length / 2)
    const w1 = rowsObject(ROWS.slice(0, half)),
      w2 = rowsObject(ROWS.slice(half)),
      whole = rowsObject(ROWS)
    for (const o of [w1, w2, whole]) s.serve(o)
    return { half, w1, w2, whole }
  }
  const N = ROWS.length
  it('the run done is complete only once every object its document names is read: with every row in and the whole unread, the rows wait, then complete when it is read (staging A, 2026-11-17: failed unavailable for good, 143 of 143 held)', async () => {
    const s = server()
    const r = await opened(s)
    const { w1, w2, whole } = objects(s)
    s.tell(docOf(2, { state: 'running', rows: [w1.ref, w2.ref], done: N, total: N }))
    await pass()
    expect(r.state().rows).toMatchObject({ s: 'arriving', got: N, total: N })
    // the run's end, its whole an object the network fails to bring, twice
    s.refuse(whole)
    s.tell(docOf(3, { state: 'done', rows: [whole.ref], done: N, total: N }), { end: true })
    await pass()
    await pass(RETRY_MS)
    expect(s.asks(whole)).toBe(2)
    const told = r.state().rows
    expect(told).toMatchObject({ s: 'failed', why: { kind: 'unavailable' }, got: N, total: N, lost: 0, self: true })
    expect(told.s === 'failed' && told.retryAt).toBe(Date.now() + BACKOFF_MS)
    s.admit(whole)
    await pass(BACKOFF_MS)
    expect(s.asks(whole)).toBe(3)
    expect(r.state().rows).toMatchObject({ s: 'complete', got: N, total: N, lost: 0 })
  })
  it("a layer whose units are still being read when the run's end comes with an object unread: the rows wait for the object, never complete on the units of the layer before (the coordinator's review of 2026-11-18)", async () => {
    const { layer, row } = layerWith('para', 'y')
    const s = server(layer)
    const r = await opened(s)
    const { w1, w2 } = objects(s)
    s.tell(docOf(2, { state: 'running', rows: [w1.ref, w2.ref], done: N, total: N }))
    await pass()
    expect(r.state().rows).toMatchObject({ s: 'arriving', got: N, total: N })
    // a layer made again with one paragraph more, its units' answer held: the units read are the layer before's meanwhile
    s.hold({ ref: layer.units[0] as { path: string } })
    const whole = rowsObject([...ROWS, row])
    s.serve(whole)
    s.tell(docOf(3, { state: 'running', attempt: 2, rows: [], done: N, total: N + 1 }, layer))
    await pass()
    s.refuse(whole)
    s.tell(docOf(4, { state: 'done', attempt: 2, rows: [whole.ref], done: N + 1, total: N + 1 }, layer), { end: true })
    await pass()
    await pass(RETRY_MS)
    expect(r.state().rows).toMatchObject({ s: 'failed', why: { kind: 'unavailable' }, self: true })
    // the units in, the whole read at its time: every row of the new layer
    s.let({ ref: layer.units[0] as { path: string } })
    s.admit(whole)
    await pass(BACKOFF_MS)
    expect(r.state().rows).toMatchObject({ s: 'complete', got: N + 1, total: N + 1, lost: 0 })
  })
  it('an object unread holding the rows of units the toggles hide: the rows wait for it, and the units shown later have their rows (the coordinator’s review of 2026-11-18)', async () => {
    const { layer, unit, row } = layerWith('reference', 'z')
    expect(DEFAULTS.classes.references).toBe(false)
    const s = server(layer)
    const r = await opened(s, layer)
    const { w1, w2 } = objects(s)
    s.tell(docOf(2, { state: 'running', rows: [w1.ref, w2.ref], done: N, total: N + 1 }, layer))
    await pass()
    // every unit shown holds its row; the reference, hidden by the toggles, none
    expect(r.state().rows).toMatchObject({ s: 'arriving', got: N, total: N })
    const last = rowsObject([row])
    s.serve(last)
    s.refuse(last)
    s.tell(docOf(3, { state: 'done', rows: [w1.ref, w2.ref, last.ref], done: N + 1, total: N + 1 }, layer), {
      end: true,
    })
    await pass()
    await pass(RETRY_MS)
    expect(r.state().rows).toMatchObject({ s: 'failed', why: { kind: 'unavailable' }, self: true })
    s.admit(last)
    await pass(BACKOFF_MS)
    expect(r.state().rows).toMatchObject({ s: 'complete', got: N, total: N })
    // the references shown: the reference's row is there
    r.do({ do: 'set', prefs: { classes: { ...DEFAULTS.classes, references: true } } })
    await pass()
    expect(r.state().rows).toMatchObject({ s: 'complete', got: N + 1, total: N + 1, lost: 0 })
    expect(unit.kind).toBe('reference')
  })
  it('R1, R4: a read that fails while the run goes on ends nothing, and is not read: the next document asks it again', async () => {
    const s = server()
    const r = await opened(s)
    const { half, w1, w2, whole } = objects(s)
    s.refuse(w2)
    s.tell(docOf(2, { state: 'running', rows: [w1.ref, w2.ref], done: N, total: N }))
    await pass()
    await pass(5000)
    expect(s.asks(w2)).toBe(2)
    expect(r.state().rows).toMatchObject({ s: 'arriving', got: half, total: N })
    s.admit(w2)
    s.tell(docOf(3, { state: 'running', rows: [w1.ref, w2.ref], done: N, total: N }))
    await pass()
    expect(s.asks(w2)).toBe(3)
    expect(r.state().rows).toMatchObject({ s: 'arriving', got: N, total: N })
    s.tell(docOf(4, { state: 'done', rows: [whole.ref], done: N, total: N }), { end: true })
    await pass()
    expect(r.state().rows).toMatchObject({ s: 'complete', got: N, total: N, lost: 0 })
  })
  it("R3: the run done with a unit still lacking its row is asked again at the session's pace, through the rows' wait (failed, its time, asked by itself), then complete once read", async () => {
    const s = server()
    const r = await opened(s)
    const { half, w1, w2, whole } = objects(s)
    s.refuse(w2)
    s.tell(docOf(2, { state: 'running', rows: [w1.ref, w2.ref], done: N, total: N }))
    await pass()
    await pass(5000)
    s.refuse(whole)
    s.tell(docOf(3, { state: 'done', rows: [whole.ref], done: N, total: N }), { end: true })
    await pass()
    // (the whole refused twice, a second apart: the client's once more)
    await pass(RETRY_MS)
    const told = r.state().rows
    expect(told).toMatchObject({
      s: 'failed',
      why: { kind: 'unavailable' },
      got: half,
      total: N,
      lost: N - half,
      self: true,
    })
    expect(told.s === 'failed' && typeof told.retryAt).toBe('number')
    // the network back: the whole asked again at its time, by the reader itself
    s.admit(whole)
    await pass(BACKOFF_MAX_MS)
    expect(r.state().rows).toMatchObject({ s: 'complete', got: N, total: N, lost: 0 })
    expect(s.follows).toBe(1)
  })
})

describe("R3's pace: the session's own for asking again, a second doubled to thirty (the coordinator's ruling of 2026-11-18)", () => {
  const N = ROWS.length
  const half = Math.ceil(N / 2)
  /** a run whose windows `w1` and `w2` were told, `w2`'s read refused (its rows missing), then its end naming `end`, every
   *  object of which the network refuses (the stream ended after it, unless `open`): the first failure told */
  async function ended(
    s: ReturnType<typeof server>,
    r: Reader,
    end: { ref: { path: string; sha256: string; bytes: number } }[],
    open = false,
  ) {
    const w1 = rowsObject(ROWS.slice(0, half)),
      w2 = rowsObject(ROWS.slice(half))
    for (const o of [w1, w2]) s.serve(o)
    s.refuse(w2)
    s.tell(docOf(2, { state: 'running', rows: [w1.ref, w2.ref], done: N, total: N }))
    await pass()
    await pass(RETRY_MS)
    for (const o of end) s.refuse(o)
    s.tell(docOf(3, { state: 'done', rows: end.map((o) => o.ref), done: N, total: N }), { end: !open })
    await pass()
    // (each object asked one after another, each refused twice a second apart: the client's once more)
    for (const _ of end) await pass(RETRY_MS)
    expect(r.state().rows).toMatchObject({ s: 'failed', why: { kind: 'unavailable' }, got: half, self: true })
  }
  /** the wait the rows state names now (its retryAt from the clock's now) */
  const waitOf = (r: Reader) => {
    const told = r.state().rows
    return told.s === 'failed' ? (told.retryAt ?? Number.NaN) - Date.now() : null
  }
  /** that wait out, and the asks it makes of `refused` objects, each refused twice: the next failure told */
  async function again(r: Reader, refused = 1) {
    await pass(waitOf(r) ?? 0)
    for (let k = 0; k < refused; k++) await pass(RETRY_MS)
  }
  it('the tries of an object the network keeps refusing are a second apart, then two, four, … thirty at most', async () => {
    const s = server()
    const r = await opened(s)
    const whole = rowsObject(ROWS)
    s.serve(whole)
    await ended(s, r, [whole])
    const waits: (number | null)[] = []
    for (let k = 0; k < 7; k++) {
      waits.push(waitOf(r))
      await again(r)
    }
    expect(waits).toEqual([BACKOFF_MS, 2000, 4000, 8000, 16000, BACKOFF_MAX_MS, BACKOFF_MAX_MS])
    expect(s.asks(whole)).toBe(2 * 8)
    expect(r.state().rows).toMatchObject({ s: 'failed', got: half })
  })
  it('a read of an object that had failed, succeeding, counts the tries from none again', async () => {
    const s = server()
    const r = await opened(s)
    const a = rowsObject(ROWS.slice(0, 2)),
      b = rowsObject(ROWS.slice(half))
    for (const o of [a, b]) s.serve(o)
    await ended(s, r, [a, b])
    expect(waitOf(r)).toBe(BACKOFF_MS)
    await again(r, 2)
    expect(waitOf(r)).toBe(2000)
    // one of the two read at last: the next wait the first again; the other read: complete
    s.admit(a)
    await again(r, 1)
    expect(waitOf(r)).toBe(BACKOFF_MS)
    s.admit(b)
    await pass(BACKOFF_MS)
    expect(r.state().rows).toMatchObject({ s: 'complete', got: N, total: N, lost: 0 })
  })
  it('a document naming other objects takes the rows again at once, the wait not waited out', async () => {
    const s = server()
    const r = await opened(s)
    const whole = rowsObject(ROWS)
    s.serve(whole)
    // (the follow's stream kept open, so that the next document comes on it)
    await ended(s, r, [whole], true)
    await again(r)
    await again(r)
    expect(waitOf(r)).toBe(4000)
    // our server's run of the target again, its end another whole: read now, not 4 s on
    const next = rowsObject([...ROWS].reverse())
    s.serve(next)
    s.tell(docOf(4, { state: 'done', attempt: 2, rows: [next.ref], done: N, total: N }), { end: true })
    await pass()
    expect(r.state().rows).toMatchObject({ s: 'complete', got: N, total: N, lost: 0 })
  })
})
