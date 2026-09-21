import { describe, expect, it } from 'vitest'
import { createSerialQueue } from '@/core/scheduler/serial'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

describe('createSerialQueue', () => {
  it('runs one after another, in the order queued: the second does not start until the first has settled', async () => {
    const queue = createSerialQueue()
    const order: string[] = []
    const gate = deferred<void>()
    const first = queue(async () => { order.push('first in'); await gate.promise; order.push('first out') })
    const second = queue(async () => { order.push('second in') })
    await Promise.resolve()
    expect(order).toEqual(['first in'])
    gate.resolve()
    await Promise.all([first, second])
    expect(order).toEqual(['first in', 'first out', 'second in'])
  })

  it('a run\'s result and its rejection both reach its own caller', async () => {
    const queue = createSerialQueue()
    await expect(queue(async () => 42)).resolves.toBe(42)
    await expect(queue(async () => { throw new Error('refused') })).rejects.toThrow('refused')
  })

  it('a run that fails does not stop the ones behind it, and they do not hear of it', async () => {
    const queue = createSerialQueue()
    const failed = queue(async () => { throw new Error('refused') })
    const next = queue(async () => 'stored')
    await expect(failed).rejects.toThrow('refused')
    await expect(next).resolves.toBe('stored')
  })

  it('idle() settles once what was queued so far has, and never rejects', async () => {
    const queue = createSerialQueue()
    const gate = deferred<void>()
    let done = false
    void queue(async () => { await gate.promise; throw new Error('refused') }).catch(() => undefined)
    const idle = queue.idle().then(() => { done = true })
    await Promise.resolve()
    expect(done).toBe(false)
    gate.resolve()
    await expect(idle).resolves.toBeUndefined()
    expect(done).toBe(true)
  })
})
