import { beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { clearRejected, markRejected, rejectedServices, watchRejected } from '@/shared/service-health'

describe('the service health record (the redesign\'s design, §4)', () => {
  beforeEach(() => { fakeBrowser.reset() })

  it('remembers a refused service by its id, and forgets it once cleared', async () => {
    expect(await rejectedServices()).toEqual(new Set())
    await markRejected('svc-abcd1234')
    expect(await rejectedServices()).toEqual(new Set(['svc-abcd1234']))
    expect(await clearRejected('svc-abcd1234')).toBe(true)
    expect(await clearRejected('svc-abcd1234')).toBe(false)
    expect(await rejectedServices()).toEqual(new Set())
  })

  it('holds the id and the time, and nothing of the request (hard rule 5)', async () => {
    await markRejected('svc-abcd1234')
    const stored = (await fakeBrowser.storage.local.get('serviceHealth')).serviceHealth as Record<string, Record<string, unknown>>
    expect(Object.keys(stored)).toEqual(['svc-abcd1234'])
    expect(Object.keys(stored['svc-abcd1234']!)).toEqual(['rejected'])
  })

  it('tells a watcher the ids as they change', async () => {
    const seen: string[][] = []
    const stop = watchRejected(ids => seen.push([...ids]))
    await markRejected('svc-abcd1234')
    await clearRejected('svc-abcd1234')
    await new Promise(r => setTimeout(r, 0))
    expect(seen).toEqual([['svc-abcd1234'], []])
    stop()
  })

  it('gives the ids just before alongside the current ones, so a watcher can tell an addition from a clearing without keeping a copy of its own (Codex review, round 1)', async () => {
    const seen: [string[], string[]][] = []
    const stop = watchRejected((ids, previous) => seen.push([[...ids], [...previous]]))
    await markRejected('svc-abcd1234')
    await clearRejected('svc-abcd1234')
    await new Promise(r => setTimeout(r, 0))
    expect(seen).toEqual([
      [['svc-abcd1234'], []],
      [[], ['svc-abcd1234']],
    ])
    stop()
  })

  it('serialises concurrent mutations: none of them reads a value another\'s write has not landed yet (Codex review)', async () => {
    // Two marks and a clear fired without awaiting between them: read-then-write with no queue would have one
    // overwrite what another just wrote, losing a mark or letting a clear miss the id it was meant for
    const a = markRejected('svc-aaaaaaaa')
    const b = markRejected('svc-bbbbbbbb')
    const c = clearRejected('svc-aaaaaaaa')
    await Promise.all([a, b, c])
    expect(await rejectedServices()).toEqual(new Set(['svc-bbbbbbbb']))
  })

  it('two marks fired at once both survive', async () => {
    const a = markRejected('svc-aaaaaaaa')
    const b = markRejected('svc-bbbbbbbb')
    await Promise.all([a, b])
    expect(await rejectedServices()).toEqual(new Set(['svc-aaaaaaaa', 'svc-bbbbbbbb']))
  })
})
