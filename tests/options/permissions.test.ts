// The settings page's side of the host permissions (DESIGN §9): an origin asked for on a gesture; a hold is a shared
// Web Lock under a name the background reads back (config/origins.ts `readHold`), let go on release; a page never gives
// one back itself, it asks the background, and that ask never fails the page
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readHold } from '@/config/origins'

const wire = vi.hoisted(() => ({ granted: new Set<string>(), requested: [] as string[], allow: true, sent: [] as unknown[], sendFails: false }))
vi.mock('wxt/browser', () => ({
  browser: {
    permissions: {
      contains: vi.fn(async ({ origins }: { origins: string[] }) => origins.every(o => wire.granted.has(o))),
      request: vi.fn(async ({ origins }: { origins: string[] }) => {
        wire.requested.push(...origins)
        if (wire.allow) for (const o of origins) wire.granted.add(o)
        return wire.allow
      }),
    },
  },
}))
vi.mock('@/shared/messages', () => ({
  sendMessage: vi.fn(async (message: unknown) => {
    wire.sent.push(message)
    if (wire.sendFails) throw new Error('Could not establish connection. Receiving end does not exist.')
    return { removed: 0 }
  }),
}))

import { PermissionError, ensureHostPermission, giveBackUnneeded, hasHostPermission, holdOrigin } from '@/entrypoints/options/permissions'

/** One lock manager, as every context of the extension shares it: what is held, and what is let go. `late`: a grant
 * waits for it, as one served after the page has moved on */
function fakeLocks(late: Promise<void> | null = null) {
  const held: string[] = []
  return {
    held,
    request: vi.fn(async (name: string, options: { mode: string }, callback: () => Promise<void>) => {
      expect(options.mode).toBe('shared')
      if (late) await late
      held.push(name)
      await callback()
      held.splice(held.indexOf(name), 1)
    }),
  }
}

describe('the settings page\'s host permissions', () => {
  let locks = fakeLocks()
  beforeEach(() => {
    Object.assign(wire, { granted: new Set(), requested: [], allow: true, sent: [], sendFails: false })
    locks = fakeLocks()
    vi.stubGlobal('navigator', { ...navigator, locks })
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('asks for the origin of an address only when it is not granted, by the pattern the background reads', async () => {
    await ensureHostPermission('https://api.example.com/v1/chat')
    expect(wire.requested).toEqual(['https://api.example.com/*'])
    await ensureHostPermission('https://api.example.com/v2')
    expect(wire.requested).toEqual(['https://api.example.com/*'])
    expect(await hasHostPermission('https://api.example.com/v3')).toBe(true)
    expect(await hasHostPermission('nonsense')).toBe(false)
  })

  it('says which way a request failed: an address with no origin, or the reader declining', async () => {
    await expect(ensureHostPermission('nonsense')).rejects.toMatchObject({ kind: 'badURL' })
    wire.allow = false
    const refused = await ensureHostPermission('https://api.example.com/v1').catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(PermissionError)
    expect(refused).toMatchObject({ kind: 'denied', origin: 'https://api.example.com/*' })
  })

  it('a hold is a shared lock the background reads back — the origin, and the service whose undo is open — gone once released', async () => {
    const form = holdOrigin('https://api.example.com/v1')
    const undo = holdOrigin('http://localhost:11434/v1', 'svc-mine0000')
    expect(locks.held.map(readHold)).toEqual([{ origin: 'https://api.example.com/*' }, { origin: 'http://localhost:11434/*', service: 'svc-mine0000' }])
    // released, the lock is let go before the release resolves: the ask that follows finds it gone
    await form.release()
    expect(locks.held.map(readHold)).toEqual([{ origin: 'http://localhost:11434/*', service: 'svc-mine0000' }])
    await form.release()
    await undo.release()
    expect(locks.held).toEqual([])
  })

  it('an address with no origin holds nothing', async () => {
    const none = holdOrigin('nonsense')
    expect(locks.request).not.toHaveBeenCalled()
    await expect(none.ready).resolves.toBeUndefined()
    await expect(none.release()).resolves.toBeUndefined()
  })

  it('`ready` settles once the lock manager has granted the hold, so a write awaiting it is never served before the hold is (I1)', async () => {
    let grant = () => {}
    locks = fakeLocks(new Promise<void>(resolve => { grant = resolve }))
    vi.stubGlobal('navigator', { ...navigator, locks })
    const hold = holdOrigin('https://api.example.com/v1', 'svc-mine0000')
    let ready = false
    void hold.ready.then(() => { ready = true })
    await Promise.resolve()
    await Promise.resolve()
    expect([ready, locks.held]).toEqual([false, []])
    grant()
    await hold.ready
    expect(locks.held).toEqual(['axt-origin https://api.example.com/* svc-mine0000'])
    await hold.release()
    expect(locks.held).toEqual([])
  })

  it('a lock manager that refuses settles `ready` all the same: a write is never held up for good', async () => {
    vi.stubGlobal('navigator', { ...navigator, locks: { request: vi.fn(async () => { throw new Error('refused') }) } })
    const hold = holdOrigin('https://api.example.com/v1')
    await expect(hold.ready).resolves.toBeUndefined()
    await expect(hold.release()).resolves.toBeUndefined()
  })

  it('the page gives nothing back itself: it asks the background, and an ask that does not arrive fails nothing', async () => {
    await giveBackUnneeded()
    expect(wire.sent).toEqual([{ type: 'axt:origins-reconcile' }])
    wire.sendFails = true
    await expect(giveBackUnneeded()).resolves.toBeUndefined()
  })
})
