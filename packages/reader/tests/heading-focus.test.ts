// A contents entry gone to with the focus (reader.ts goToHeading, `focus`: a jump from the contents laid over a narrow window,
// PDF-READER §6.3): where no part has placed the heading yet, its page's part is read first, and the focus given to the page
// then. A control the reader moved the focus to while that part was read keeps it: the jump's focus is not given late over
// the reader's own choice. Over a stand-in of our server (the s1-columns fixture's head, units and parts, one part's answer
// held), PDF.js and the panes stood in for (no page is drawn: the panes record what they are asked).
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Head, read } from '@readarxiv/format'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULTS } from '../src/prefs.ts'
import type { Reader } from '../src/reader.ts'
import { layerOf, paperDoc, prepareOf } from './helpers/doc.ts'

/** what the panes were asked to do, by name */
const asked: { name: string; args: unknown[] }[] = []
vi.mock('../src/pdfjs/kit.ts', async (real) => ({
  ...(await real<object>()),
  loadKit: () => Promise.resolve({ sheet: '', lib: {}, options: () => ({}), destroy: () => {} }),
}))
vi.mock('../src/panes/panes.ts', async (real) => ({
  ...(await real<object>()),
  createPanes: () =>
    new Proxy(
      {},
      {
        get: (_, name) => {
          if (name === 'then') return undefined
          if (name === 'on') return () => () => {}
          if (name === 'reading') return () => null
          return (...args: unknown[]) => {
            asked.push({ name: String(name), args })
            return true
          }
        },
      },
    ),
}))
// (the reader's composer and highlight stood in for too: nothing is laid here, and the real ones would read the stood-in panes)
let composers = 0
vi.mock('../src/compose/composer.ts', () => ({
  createComposer: () => {
    composers++
    return {
      on: () => () => {},
      probe: () => ({ laidPages: 0 }),
      page: () => null,
      member: () => null,
      generation: () => 0,
      setDocuments: () => {},
      setLayer: () => {},
      setShown: () => {},
      setClasses: () => {},
      dispose: () => {},
    }
  },
}))
vi.mock('../src/compose/highlight.ts', () => ({
  createHighlight: () => ({
    on: () => () => {},
    lit: () => null,
    setOn: () => {},
    land: () => {},
    litAt: () => null,
    quiet: () => {},
    dispose: () => {},
  }),
}))
const { openReader } = await import('../src/reader.ts')

const SEG = '2600_00001v1'
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex')
const enc = (s: string) => new TextEncoder().encode(s)
const BUNDLE = join(dirname(fileURLToPath(import.meta.url)), '../e2e/fixtures/s1-columns/bundle')
const files = readdirSync(BUNDLE).filter((f) => /^[0-9a-f]{64}\./.test(f))
const bytesOf = (f: string) => new Uint8Array(readFileSync(join(BUNDLE, f)))
const HEAD = bytesOf(files.find((f) => f.endsWith('.head')) as string)
const head = read('head', HEAD) as Head
const dir = `p/${SEG}/x`
const at = (b: Uint8Array) => ({ path: `${dir}/${sha(b)}`, sha256: sha(b), bytes: b.length })

/** our server, stood in for: the follow (a stream the test writes), every object of the fixture's bundle by path, an object's
 *  answer held until the test lets it go; the original never answered (nothing is drawn) */
function server() {
  const objects = new Map(files.map((f) => [`${dir}/${f.slice(0, 64)}`, bytesOf(f)]))
  const held = new Map<string, (() => void) | null>()
  let stream: ReadableStreamDefaultController<Uint8Array> | null = null
  const fetch = async (url: string): Promise<Response> => {
    const path = url.split('?')[0] as string
    // (the original and an open (the target's run asked to start) never answered: nothing here waits for them)
    if (path.startsWith('/api/v2/o/arxiv/') || path === '/api/v2/open' || !path.startsWith('/api/v2/'))
      return new Promise(() => {})
    if (path.startsWith('/api/v2/papers/'))
      return new Response(
        new ReadableStream<Uint8Array>({
          start: (c) => {
            stream = c
          },
        }),
        {
          headers: { 'content-type': 'text/event-stream' },
        },
      )
    const key = path.slice('/api/v2/o/'.length)
    const bytes = objects.get(key)
    if (!bytes) return new Response('', { status: 404 })
    if (held.has(key)) await new Promise<void>((go) => held.set(key, go))
    return new Response(bytes.slice(), { status: 200 })
  }
  return {
    fetch,
    hold: (path: string) => held.set(path, null),
    let(path: string) {
      const go = held.get(path)
      held.delete(path)
      go?.()
    },
    tell(d: unknown) {
      stream?.enqueue(enc(`data: ${JSON.stringify(d)}\n\n`))
    },
    /** whether the reader has opened the paper's stream */
    listening: () => stream !== null,
  }
}

let reader: Reader | null = null
/** the reader let run until `done` holds: a frame's time at each turn, as a browser's frames come, and its real work between
 *  (the code chunk's first import, the digests, the bodies read). Bounded by the test's own time, never by a count of turns:
 *  that work takes real time, which a machine under load stretched past the counts this test waited (2 of 6 runs failed) */
async function until(done: () => boolean) {
  while (!done()) {
    await vi.advanceTimersByTimeAsync(16)
    await new Promise<void>((r) => setImmediate(r))
  }
}
async function pass(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms)
  for (let i = 0; i < 400; i++) {
    await vi.advanceTimersByTimeAsync(0)
    await new Promise<void>((r) => setImmediate(r))
  }
}
beforeEach(() => {
  asked.length = 0
  composers = 0
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
})
afterEach(() => {
  reader?.close()
  reader = null
  document.body.replaceChildren()
  vi.useRealTimers()
})

/** a reader of the paper on the stand-in, its layer's head and units read, the contents made; no part read */
async function opened(s: ReturnType<typeof server>) {
  const root = document.createElement('div')
  document.body.append(root)
  reader = openReader(root, {
    host: {
      fetch: s.fetch,
      original: () => `/api/v2/o/arxiv/${SEG}.pdf`,
      prefs: {
        read: async () => ({ ...DEFAULTS, display: 'bilingual', target: 'de' }),
        write: async () => {},
        watch: () => () => {},
      },
    },
    paper: '2600.00001v1',
    visit: { display: 'bilingual', target: 'de' },
  })
  await until(s.listening)
  const units = files.filter((f) => f.endsWith('.units')).map((f) => at(bytesOf(f)))
  s.tell(
    paperDoc({
      prepare: prepareOf({ state: 'done', units }),
      layer: layerOf({ catalog: at(HEAD), units }),
    }),
  )
  // (the head and the units read, the contents made with page 2's heading in them; the reader's code asked, after the left's
  // page 1 or 1.5 s, and in: its composer the stand-in)
  const r = reader as Reader
  await until(() => composers > 0 && r.state().view.outline.some((e) => e.page === 2))
  expect(composers).toBe(1)
  await pass()
  return r
}

describe('a contents entry gone to with the focus, its page’s part read first', () => {
  // (a heading of the fixture's page 2, whose part is read only for the jump)
  const part2 = `${dir}/${head.parts[1]}`
  const onPage2 = (r: Reader) => r.state().view.outline.find((e) => e.page === 2)?.id as number
  /** a jump the panes were asked for */
  const jump = (a: { name: string }) => a.name === 'goToRect' || a.name === 'goToPage'

  it('gives the focus to the heading’s page once the part is read, the focus not moved meanwhile', async () => {
    const s = server()
    s.hold(part2)
    const r = await opened(s)
    expect(onPage2(r)).toBeTypeOf('number')
    r.do({ do: 'heading', id: onPage2(r), focus: true })
    await pass()
    expect(asked.some((a) => a.name === 'focusPage')).toBe(false)
    const from = asked.length
    s.let(part2)
    // (the part read and the jump made: the focus is given, or not, in the jump's own task)
    await until(() => asked.slice(from).some(jump))
    expect(asked.filter((a) => a.name === 'focusPage').map((a) => a.args)).toEqual([['left', 2]])
  })

  it('leaves the focus on a control the reader moved it to while the part was read', async () => {
    const s = server()
    s.hold(part2)
    const r = await opened(s)
    r.do({ do: 'heading', id: onPage2(r), focus: true })
    await pass()
    const control = document.createElement('button')
    document.body.append(control)
    control.focus()
    const from = asked.length
    s.let(part2)
    await until(() => asked.slice(from).some(jump))
    expect(document.activeElement).toBe(control)
    expect(asked.some((a) => a.name === 'focusPage')).toBe(false)
    // (the jump itself still made: the heading gone to)
    expect(asked.slice(from).some(jump)).toBe(true)
  })
})
