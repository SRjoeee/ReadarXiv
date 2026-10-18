import { beforeEach, describe, expect, it } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { clearRejected, clearRejectedAmong, markRejected, rejectedServices, watchRejected } from '@/shared/service-health'

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

  it('a mark asks its condition in its own turn, after every write queued before it, and a condition that says no marks nothing', async () => {
    await markRejected('svc-aaaaaaaa')
    const clear = clearRejected('svc-aaaaaaaa')
    // what the condition sees is the record as the clear queued ahead of it left it
    let sawCleared: boolean | null = null
    const mark = markRejected('svc-bbbbbbbb', async () => { sawCleared = !(await rejectedServices()).has('svc-aaaaaaaa'); return false })
    await Promise.all([clear, mark])
    expect(sawCleared).toBe(true)
    expect(await rejectedServices()).toEqual(new Set())
    await markRejected('svc-bbbbbbbb', async () => true)
    expect(await rejectedServices()).toEqual(new Set(['svc-bbbbbbbb']))
  })

  it('a condition that fails rejects that mark only; the next mutation still runs', async () => {
    const failed = markRejected('svc-aaaaaaaa', async () => { throw new Error('storage gone') })
    const next = markRejected('svc-bbbbbbbb')
    await expect(failed).rejects.toThrow('storage gone')
    await next
    expect(await rejectedServices()).toEqual(new Set(['svc-bbbbbbbb']))
  })

  it('clears, in one turn, the marks chosen from those present at that turn: a mark queued before the clear is among them', async () => {
    await markRejected('svc-cccccccc')
    const mark = markRejected('svc-aaaaaaaa')
    const seen: string[][] = []
    const clear = clearRejectedAmong(marked => { seen.push([...marked].sort()); return ['svc-aaaaaaaa', 'svc-bbbbbbbb'] })
    await mark
    // only what was there is cleared, and said so
    expect(await clear).toEqual(['svc-aaaaaaaa'])
    expect(seen).toEqual([['svc-aaaaaaaa', 'svc-cccccccc']])
    expect(await rejectedServices()).toEqual(new Set(['svc-cccccccc']))
    // choosing none writes nothing
    const watched: string[][] = []
    const stop = watchRejected(ids => watched.push([...ids]))
    expect(await clearRejectedAmong(() => [])).toEqual([])
    await new Promise(r => setTimeout(r, 0))
    expect(watched).toEqual([])
    stop()
  })
})
