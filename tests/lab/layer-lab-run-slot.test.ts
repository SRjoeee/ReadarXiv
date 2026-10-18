// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createRunSlot } from '../../lab/pdf/layer-lab/run-slot.mjs'

// The lab's one-run-at-a-time slot (lab/pdf/layer-lab/run-slot.mjs): the engine keeps its font roles for the whole page, so a
// v0 run must not start while the run it replaces is still starting or not yet closed.

/** runs whose start the test ends, and a log of what the slot did, in order */
function setup() {
  const log: string[] = []
  const slot = createRunSlot<{ close(): unknown }>()
  const run = (name: string) => {
    let up!: (ok: boolean) => void
    const started = new Promise<boolean>(done => { up = done })
    const promise = slot.start(async () => {
      log.push(`start ${name}`)
      if (!(await started)) { log.push(`failed ${name}`); throw new Error(`${name} failed`) }
      log.push(`started ${name}`)
      return { close: async () => { log.push(`close ${name}`) } }
    })
    promise.catch(() => {})
    return { promise, finish: () => up(true), fail: () => up(false) }
  }
  return { log, slot, run }
}
const turns = () => new Promise<void>(done => setTimeout(done, 0))

describe('the run slot', () => {
  it('starts the first run at once', async () => {
    const { log, run } = setup()
    const a = run('a')
    await turns()
    expect(log).toEqual(['start a'])
    a.finish()
    expect((await a.promise)?.close).toBeTypeOf('function')
  })

  it('does not start a run while the one it replaces is still starting: it starts after that one is started and closed', async () => {
    const { log, slot, run } = setup()
    const a = run('a')
    await turns()
    // (the rule set changes while a is starting: a is let go, b is asked for)
    slot.release(a.promise)
    const b = run('b')
    await turns()
    expect(log).toEqual(['start a'])
    a.finish()
    await turns()
    expect(log).toEqual(['start a', 'started a', 'close a', 'start b'])
    b.finish()
    await b.promise
    expect(log).toEqual(['start a', 'started a', 'close a', 'start b', 'started b'])
  })

  it('starts the next run after a start that failed, and closes nothing for it', async () => {
    const { log, slot, run } = setup()
    const a = run('a')
    await turns()
    slot.release(a.promise)
    const b = run('b')
    a.fail()
    await turns()
    expect(log).toEqual(['start a', 'failed a', 'start b'])
    b.finish()
    await b.promise
  })

  it('never starts a run that is let go before it began, and does not hold the runs after it up', async () => {
    const { log, slot, run } = setup()
    const a = run('a')
    await turns()
    slot.release(a.promise)
    // (b is asked for while a is starting, and let go before a is done; c is asked for after)
    const b = run('b')
    slot.release(b.promise)
    const c = run('c')
    a.finish()
    await turns()
    expect(await b.promise).toBeNull()
    expect(log).toEqual(['start a', 'started a', 'close a', 'start c'])
    c.finish()
    await c.promise
    expect(log).not.toContain('start b')
  })

  it('lets a run go once: a second release, or none, changes nothing', async () => {
    const { log, slot, run } = setup()
    const a = run('a')
    a.finish()
    await a.promise
    slot.release(a.promise)
    slot.release(a.promise)
    slot.release(null)
    slot.release(undefined)
    await turns()
    expect(log.filter(x => x === 'close a')).toHaveLength(1)
  })

  it('goes on after a run whose close fails', async () => {
    const { log, slot } = setup()
    const a = slot.start(async () => ({ close: async () => { throw new Error('document gone') } }))
    slot.release(a)
    const b = slot.start(async () => { log.push('start b'); return { close() {} } })
    await b
    expect(log).toEqual(['start b'])
  })
})
