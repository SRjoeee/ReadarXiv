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
})
