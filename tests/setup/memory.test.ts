import { PropertySymbol } from 'happy-dom'
import { describe, expect, it } from 'vitest'

// Issue #234. happy-dom hands every element with an `id` to the global `window` as a named property, and does it for
// the documents `DOMParser` makes as well — which in a browser have no window, so no named access. The window kept the
// first element of each id for good, every element holds its document, and so each paper the fixture tests parsed
// stayed alive until its worker exited: 2 GB retained after thirteen papers, a worker at 4.2 GB, and `pnpm test` out of
// memory on any machine under 16 GB. tests/setup-memory.ts takes the window's hold off, and lets the event loop turn
// after every test (below); this keeps both

const collect = async (): Promise<void> => {
  const gc = (globalThis as { gc?: () => void }).gc
  // The run's `execArgv` (vitest.config.ts) exposes it; without it this case could only ever pass
  expect(gc, 'the test run must expose gc (vitest.config.ts: execArgv --expose-gc)').toBeTypeOf('function')
  // A WeakRef's target lives to the end of the job that made it: let the job end, then collect, twice (a collection can free what the first one only unlinks)
  for (let i = 0; i < 2; i++) {
    await new Promise<void>(resolve => setTimeout(resolve, 10))
    gc!()
  }
}

/** happy-dom's own window, the object element ids are written onto — vitest's `window` global and `document.defaultView` are the Node global, not that */
const named = (): Record<string, unknown> => (document as unknown as Record<symbol, Record<string, unknown>>)[PropertySymbol.window]!

/** Parsed in a frame of its own: the test's frame would keep the last document in a register, collection or no */
const parsedWeakly = (i: number): WeakRef<Document> =>
  new WeakRef(new DOMParser().parseFromString(`<!doctype html><html><body><p id="held-${i}">a</p><p id="held-shared">b</p><p id="held-shared">c</p></body></html>`, 'text/html'))

describe('a parsed document', () => {
  it('is collected once nothing of the test refers to it, ids and all', async () => {
    const refs = [parsedWeakly(0), parsedWeakly(1), parsedWeakly(2)]
    await collect()
    expect(refs.map(ref => ref.deref() !== undefined)).toEqual([false, false, false])
  })

  it('still answers getElementById, with the first element of the id', () => {
    const doc = new DOMParser().parseFromString('<!doctype html><html><body><p id="one">a</p><p id="two">b</p><p id="two">c</p></body></html>', 'text/html')
    expect(doc.getElementById('one')?.textContent).toBe('a')
    expect(doc.getElementById('two')?.textContent).toBe('b')
    expect(doc.getElementById('three')).toBeNull()
  })

  it('does not take over the window: only the test document\'s own ids are named properties', () => {
    new DOMParser().parseFromString('<!doctype html><html><body><p id="foreign-id">a</p></body></html>', 'text/html')
    expect(named()['foreign-id']).toBeUndefined()
  })

  it('leaves the named access of the page under test as it was', () => {
    document.body.innerHTML = '<p id="own-id">a</p>'
    expect((named()['own-id'] as Element | undefined)?.textContent).toBe('a')
    document.body.innerHTML = ''
    expect(named()['own-id']).toBeUndefined()
  })
})

// V8 keeps every object a WeakRef was made for (happy-dom makes them for its element caches) strongly reachable until
// the event loop next turns, and a run of tests that never yields to it — vitest awaits only promises between tests —
// keeps all of their documents, collection or no (a heap snapshot: `weak_refs_keep_during_job` → head element →
// window → document). Whether a test yields is what the second of these two cases shows
describe('after a test', () => {
  let earlier: WeakRef<Document> | undefined

  it('(leaves a document behind it)', () => {
    earlier = parsedWeakly(9)
  })

  it('the event loop has turned, so the document it parsed can be collected at once', () => {
    // Synchronously, on purpose: a case that waited for the loop itself would show nothing
    ;(globalThis as { gc?: () => void }).gc!()
    expect(earlier, 'the case before this one did not run').toBeDefined()
    expect(earlier!.deref() !== undefined, 'the document of the case before is still held').toBe(false)
  })
})
