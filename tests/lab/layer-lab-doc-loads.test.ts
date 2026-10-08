// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createDocLoads } from '../../lab/pdf/layer-lab/doc-loads.mjs'

// The documents a fixture load opens (lab/pdf/layer-lab/doc-loads.mjs): fixtures can be picked faster than they open, and a load
// that a newer one replaces, or that fails, must close every document it opened, whenever each finishes loading, and never
// leave one open or installed.

interface Doc { url: string }
/** loads whose bytes arrive when the test says so, and whose tasks are watched */
function setup() {
  const waiting = new Map<string, () => void>()
  const tasks: { url: string; destroy: ReturnType<typeof vi.fn> }[] = []
  const loads = createDocLoads<Doc>({
    fetchBytes: url => new Promise<Uint8Array>(done => { waiting.set(url, () => done(new TextEncoder().encode(url))) }),
    getDocument: bytes => {
      const url = new TextDecoder().decode(bytes)
      const task = { url, destroy: vi.fn(), promise: Promise.resolve({ url }) }
      tasks.push(task)
      return task
    },
  })
  const arrive = async (url: string) => { waiting.get(url)!(); await new Promise(done => setTimeout(done, 0)) }
  const destroyed = () => tasks.filter(t => t.destroy.mock.calls.length > 0).map(t => t.url).sort()
  return { loads, arrive, tasks, destroyed }
}

describe('the documents of a fixture load', () => {
  it('keeps the documents of a load that is still the newest, and closes none of them', async () => {
    const { loads, arrive, destroyed } = setup()
    const load = loads.begin()
    const doc = load.open('a.pdf')
    await arrive('a.pdf')
    expect(await doc).toEqual({ url: 'a.pdf' })
    expect(load.keep()).toBe(true)
    load.close()
    expect(destroyed()).toEqual([])
  })

  it('closes the documents of a load that a newer one replaced while it was opening them, finished or not', async () => {
    const { loads, arrive, destroyed } = setup()
    const a = loads.begin()
    const aArxiv = a.open('a/arxiv.pdf')
    const aFinal = a.open('a/final.pdf')
    await arrive('a/arxiv.pdf')
    await aArxiv
    // (fixture b is picked: a has one document open and one still arriving)
    const b = loads.begin()
    expect(a.stale()).toBe(true)
    expect(b.stale()).toBe(false)
    const bArxiv = b.open('b/arxiv.pdf')
    await arrive('b/arxiv.pdf')
    await bArxiv
    // (a finishes, after b's documents are in: it is not kept, and what it opened is closed)
    await arrive('a/final.pdf')
    await aFinal
    expect(a.keep()).toBe(false)
    expect(destroyed()).toEqual(['a/arxiv.pdf', 'a/final.pdf'])
    expect(b.keep()).toBe(true)
    expect(destroyed()).toEqual(['a/arxiv.pdf', 'a/final.pdf'])
  })

  it('closes a load\'s documents on a failure, and opens none that arrive after', async () => {
    const { loads, arrive, tasks, destroyed } = setup()
    const load = loads.begin()
    const first = load.open('x/arxiv.pdf')
    const second = load.open('x/final.pdf')
    await arrive('x/final.pdf')
    await second
    // (the other fails: the load is closed, with the document that did open)
    load.close()
    expect(destroyed()).toEqual(['x/final.pdf'])
    // (and the document still arriving is never opened)
    const refused = expect(first).rejects.toThrow('superseded')
    await arrive('x/arxiv.pdf')
    await refused
    expect(tasks.map(t => t.url)).toEqual(['x/final.pdf'])
  })

  it('does not close a task twice, or fail on a task that cannot be closed', async () => {
    const { loads, arrive, tasks } = setup()
    const load = loads.begin()
    const doc = load.open('a.pdf')
    await arrive('a.pdf')
    await doc
    tasks[0]!.destroy.mockRejectedValue(new Error('already gone'))
    load.close()
    load.close()
    await new Promise(done => setTimeout(done, 0))
    expect(tasks[0]!.destroy).toHaveBeenCalledTimes(1)
  })
})
