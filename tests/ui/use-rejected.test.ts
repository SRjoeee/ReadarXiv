// The refused-key record as a React hook (the redesign's design, §4; Part 3, Task 21): read at mount and followed, the
// read dropped when an event overtook it, a failed read said once without a key, the subscription let go on unmount
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeBrowser } from 'wxt/testing/fake-browser'
import { clearRejected, markRejected, rejectedServices, watchRejected } from '@/shared/service-health'
import { useRejected } from '@/ui/use-rejected'
import { mountHook } from './render-hook'

// the record's own functions, spied on: each test may hold a read back, fail it, or wrap the subscription
vi.mock('@/shared/service-health', async importOriginal => {
  const real = await importOriginal<typeof import('@/shared/service-health')>()
  return { ...real, rejectedServices: vi.fn(real.rejectedServices), watchRejected: vi.fn(real.watchRejected) }
})

describe('useRejected', () => {
  beforeEach(() => {
    fakeBrowser.reset()
    vi.restoreAllMocks()
  })

  it('reads the record at mount, then follows it as it changes', async () => {
    await markRejected('svc-a')
    const hook = await mountHook(useRejected)
    await hook.until(() => hook.current().length === 1)
    expect(hook.current()).toEqual(['svc-a'])
    await hook.run(() => markRejected('svc-b'))
    await hook.until(() => hook.current().length === 2)
    await hook.run(async () => { await clearRejected('svc-a') })
    await hook.until(() => hook.current().length === 1)
    expect(hook.current()).toEqual(['svc-b'])
    await hook.unmount()
  })

  it('drops a read an event overtook: subscribed first, read after, the event is the newer', async () => {
    let answer: (ids: Set<string>) => void = () => {}
    vi.mocked(rejectedServices).mockReturnValueOnce(new Promise(resolve => { answer = resolve }))
    const hook = await mountHook(useRejected)
    await hook.run(() => markRejected('svc-new'))
    await hook.until(() => hook.current().length === 1)
    await hook.run(() => answer(new Set(['svc-stale'])))
    expect(hook.current()).toEqual(['svc-new'])
    await hook.unmount()
  })

  it('says once, with no id and no key, that a read failed; the subscription still brings the next change', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(rejectedServices).mockRejectedValueOnce(new Error('Extension context invalidated.'))
    const hook = await mountHook(useRejected)
    await hook.flush()
    expect([hook.current(), warn.mock.calls]).toEqual([[], [['[axt] the refused-key record could not be read']]])
    await hook.run(() => markRejected('svc-a'))
    await hook.until(() => hook.current().length === 1)
    await hook.unmount()
  })

  it('lets the subscription go on unmount', async () => {
    const real = await vi.importActual<typeof import('@/shared/service-health')>('@/shared/service-health')
    const stopped = vi.fn()
    vi.mocked(watchRejected).mockImplementationOnce(callback => {
      const stop = real.watchRejected(callback)
      return () => { stopped(); stop() }
    })
    const hook = await mountHook(useRejected)
    expect(stopped).not.toHaveBeenCalled()
    await hook.unmount()
    expect(stopped).toHaveBeenCalledTimes(1)
  })
})
