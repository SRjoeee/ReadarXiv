// The background's keeper of the services' host permissions (DESIGN §9, the configuration; #299 rows 116, 119, 120):
// the one place an origin is given back — on a page's ask, once a service left and nothing holds it any more, when the
// stored settings can be read again, at a worker's start — by `reconcileOrigins` over what the browser granted, what
// is stored, what any page still holds and what a chain still around was built from. And a service that left the
// configuration while no page holds its undo moves every session off it, onto the next in the chain, before its
// origin goes
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { manifestOrigins, originHold } from '@/config/origins'
import { type Config, DEFAULT_CONFIG } from '@/config/schema'
import type { Service } from '@/config/services'
import { createChainHolder } from '@/entrypoints/background/chain'
import { engineReady } from '@/entrypoints/background/engine-ready'
import { DEPARTURE_CHECK_MS, createOriginKeeper } from '@/entrypoints/background/origin-keeper'
import { createSessionRouter } from '@/entrypoints/background/sessions'
import { CancelledScopeRegistry } from '@/providers/request/cancellation'
import type { TranslationTransport } from '@/providers/transport'

const service = (id: string, baseURL: string): Service => ({ id, kind: 'openai-compat', name: id, baseURL, apiKey: 'k', model: 'm', thinking: 'disabled' })
const MINE = service('svc-mine0000', 'https://api.example.com/v1')
const OTHER = service('svc-othr0000', 'https://other.example.com/v1')
const BEFORE: Config = { ...DEFAULT_CONFIG, services: [MINE, OTHER], provider: MINE.id }
/** MINE deleted: the choice falls back to the Microsoft service, as the settings page writes it (S-O-21) */
const AFTER: Config = { ...DEFAULT_CONFIG, services: [OTHER], provider: 'microsoft' }
/** The manifest as the browser reads it the day the website's host joins (Task 17) */
const MANIFEST = { host_permissions: ['https://openrouter.ai/*', 'https://edge.microsoft.com/*', 'https://arxiv.org/*', 'https://readarxiv.com/*'], content_scripts: [{ matches: ['https://arxiv.org/html/*'] }] }

/** A chain as the engine-ready tests draw one: its engines, the chosen first */
const chainOf = (name: string, config: Config, log: string[]): TranslationTransport => {
  let gone = false
  const engines = [config.provider, ...['microsoft', 'google-web'].filter(e => e !== config.provider)]
  return {
    translate: async () => ({ ok: true, result: { segments: [], provider: name, kind: 'mt' }, cached: 0 }),
    cancel: async () => 0,
    status: async () => ({ providerId: engines[0]!, chosen: config.provider, revision: name, available: true, maxBatchChars: 1, maxBatchItems: 1, renderPath: 'tags' as const, targetLanguage: 'cmn', promptId: 'default', chain: engines, demotions: [], identity: '', engine: { id: engines[0]! } }),
    retire: () => { gone = true; log.push(`retire ${name}`); return 0 },
    isRetired: () => gone,
  }
}

function world(start: Config = BEFORE) {
  const log: string[] = []
  const state = {
    stored: start,
    readable: true,
    granted: new Set(['https://openrouter.ai/*', 'https://edge.microsoft.com/*', 'https://arxiv.org/*', 'https://readarxiv.com/*', 'https://api.example.com/*', 'https://other.example.com/*']),
    holds: [] as string[],
    manifest: MANIFEST as { host_permissions?: string[]; content_scripts?: { matches?: string[] }[] },
  }
  let n = 0
  const holder = createChainHolder({
    owned: transport => router.sessionsOn(transport) > 0,
    load: async config => {
      const built = config ?? state.stored
      return { config: built, transport: chainOf(`build-${++n}`, built, log) }
    },
  })
  const router = createSessionRouter({ current: () => holder.current(), cancelled: new CancelledScopeRegistry(), retireOthers: () => holder.retireOthers() })
  const keeper = createOriginKeeper({
    granted: async () => [...state.granted],
    remove: async origin => { log.push(`remove ${origin}`); state.granted.delete(origin) },
    manifest: () => manifestOrigins(state.manifest),
    read: async () => ({ config: state.readable ? state.stored : DEFAULT_CONFIG, fallbackReason: state.readable ? null : { kind: 'unknown' as const } }),
    holds: async () => state.holds,
    chains: () => holder.configs(),
    moveAll: async id => { log.push(`move ${id}`); return engineReady(holder, router, { id, rebindAll: true }) },
    warn: line => log.push(`warn ${line}`),
  })
  /** the stored value changes, as the configuration's watcher hears it: the chain rebuilds, then the keeper looks */
  const store = (next: Config) => {
    const previous = state.readable ? state.stored : null
    state.stored = next
    holder.onConfig(next)
    keeper.configChanged(next, previous)
  }
  return { log, state, holder, router, keeper, store }
}

const leadOf = async (t: TranslationTransport | undefined) => (await t!.status()).chain[0]

describe('the origin keeper', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('a sweep gives back what nothing needs: not a stored service\'s, not a held one\'s, not one a chain still around was built from', async () => {
    const w = world({ ...DEFAULT_CONFIG, services: [OTHER] })
    w.state.granted.add('https://held.example.com/*').add('https://gone.example.com/*')
    w.state.holds = [originHold('https://held.example.com/v1')!, 'axt-tex-store']
    // a session translating on a chain built before the address was edited away still uses it (§8.0)
    await w.holder.activate({ ...DEFAULT_CONFIG, services: [MINE] })
    await w.router.forCall('s1', 1)
    await w.holder.activate()
    expect(await w.keeper.sweep()).toBe(1)
    expect(w.log).toEqual(['remove https://gone.example.com/*'])
  })

  it('an origin is never given back while the stored settings cannot be read, and the first change that reads them again gives back what went unneeded meanwhile (#299 row 120, F2a)', async () => {
    const w = world(AFTER)
    w.state.readable = false
    expect(await w.keeper.sweep()).toBe(0)
    expect(w.log).toEqual([])
    // repaired: the watcher hears a value that parses after one that did not
    w.state.readable = true
    w.keeper.configChanged(AFTER, null)
    await vi.advanceTimersByTimeAsync(0)
    expect(w.log).toEqual(['remove https://api.example.com/*'])
  })

  it('readarxiv.com and arXiv, the manifest\'s own hosts, are never given back — read from the manifest at each sweep, so a host it gains is covered the day it joins', async () => {
    const w = world({ ...DEFAULT_CONFIG, services: [] })
    w.state.manifest = { host_permissions: ['https://arxiv.org/*'] }
    await w.keeper.sweep()
    expect(w.log).toContain('remove https://readarxiv.com/*')
    expect(w.log).not.toContain('remove https://arxiv.org/*')
    const w2 = world({ ...DEFAULT_CONFIG, services: [] })
    await w2.keeper.sweep()
    expect(w2.log.filter(l => /readarxiv\.com|arxiv\.org|openrouter|edge\.microsoft/.test(l))).toEqual([])
    expect(w2.log).toEqual(['remove https://api.example.com/*', 'remove https://other.example.com/*'])
  })

  it('the background moves the sessions of a service that left the configuration to the next in the chain, then gives its origin back (#299 row 119)', async () => {
    const w = world()
    const before = await w.router.forCall('s1', 1)
    expect(await leadOf(before)).toBe(MINE.id)
    // the settings page's tab closed between the deletion and its write: the write landed, the page never committed
    w.store(AFTER)
    await vi.advanceTimersByTimeAsync(DEPARTURE_CHECK_MS)
    expect(await leadOf(w.router.transportFor('s1'))).toBe('microsoft')
    // engine-ready's own rebuild is in flight as the sessions move: every chain there was retires, as for a page's commit
    expect(w.log).toEqual([`move ${MINE.id}`, 'retire build-1', 'retire build-2', 'remove https://api.example.com/*'])
  })

  it('a page closed during an undo keeps nothing it did not need: the keeper waits while the undo is held, and once the page is gone moves the sessions and gives the origin back (#299 row 116)', async () => {
    const w = world()
    await w.router.forCall('s1', 1)
    w.state.holds = [originHold(MINE.baseURL, MINE.id)!]
    w.store(AFTER)
    await vi.advanceTimersByTimeAsync(DEPARTURE_CHECK_MS * 3)
    // the undo is the page's: nothing moved, nothing given back while it may still be pressed
    expect(w.log).toEqual([])
    expect(await leadOf(w.router.transportFor('s1'))).toBe(MINE.id)
    // the page closed with the undo open: the browser let its holds go, and its own commit never ran
    w.state.holds = []
    await vi.advanceTimersByTimeAsync(DEPARTURE_CHECK_MS)
    expect(await leadOf(w.router.transportFor('s1'))).toBe('microsoft')
    expect(w.log).toEqual([`move ${MINE.id}`, 'retire build-1', 'retire build-2', 'remove https://api.example.com/*'])
  })

  it('an undo that lands brings the service back: nothing moved, nothing given back', async () => {
    const w = world()
    await w.router.forCall('s1', 1)
    w.state.holds = [originHold(MINE.baseURL, MINE.id)!]
    w.store(AFTER)
    await vi.advanceTimersByTimeAsync(DEPARTURE_CHECK_MS)
    w.store(BEFORE)
    w.state.holds = []
    await vi.advanceTimersByTimeAsync(DEPARTURE_CHECK_MS * 3)
    expect(w.log).toEqual([])
  })

  it('a page that committed its own deletion — every session moved off, the undo let go — is not moved twice: the keeper only gives the origin back if the page\'s ask did not', async () => {
    const w = world()
    await w.router.forCall('s1', 1)
    w.state.holds = [originHold(MINE.baseURL, MINE.id)!]
    w.store(AFTER)
    await vi.advanceTimersByTimeAsync(DEPARTURE_CHECK_MS)
    // the page's commit: engine-ready with rebindAll, then the undo let go and a sweep asked for
    await engineReady(w.holder, w.router, { id: MINE.id, rebindAll: true })
    w.state.holds = []
    await w.keeper.sweep()
    await vi.advanceTimersByTimeAsync(DEPARTURE_CHECK_MS * 3)
    expect(w.log).toEqual(['retire build-1', 'retire build-2', 'remove https://api.example.com/*'])
  })

  it('a service that left while the stored settings cannot be read is looked at again, not taken as gone: nothing moves on a read that says nothing', async () => {
    const w = world()
    await w.router.forCall('s1', 1)
    w.store(AFTER)
    w.state.readable = false
    await vi.advanceTimersByTimeAsync(DEPARTURE_CHECK_MS * 3)
    expect(w.log).toEqual([])
    w.state.readable = true
    await vi.advanceTimersByTimeAsync(DEPARTURE_CHECK_MS)
    expect(w.log).toEqual([`move ${MINE.id}`, 'retire build-1', 'retire build-2', 'remove https://api.example.com/*'])
  })

  it('a removal the browser refuses is a line in the log, and the rest still go', async () => {
    const w = world({ ...DEFAULT_CONFIG, services: [] })
    const keeper = createOriginKeeper({
      granted: async () => ['https://a.example.com/*', 'https://b.example.com/*'],
      remove: async origin => { if (origin.includes('//a.')) throw new Error('refused'); w.log.push(`remove ${origin}`) },
      manifest: () => [],
      read: async () => ({ config: DEFAULT_CONFIG, fallbackReason: null }),
      holds: async () => [],
      chains: () => [],
      moveAll: async () => undefined,
      warn: line => w.log.push(`warn ${line}`),
    })
    expect(await keeper.sweep()).toBe(1)
    expect(w.log).toEqual([expect.stringMatching(/^warn /), 'remove https://b.example.com/*'])
  })

  it('holds that cannot be read give back nothing: a form may be asking for any of them', async () => {
    const w = world({ ...DEFAULT_CONFIG, services: [] })
    const keeper = createOriginKeeper({
      granted: async () => ['https://a.example.com/*'],
      remove: async origin => { w.log.push(`remove ${origin}`) },
      manifest: () => [],
      read: async () => ({ config: DEFAULT_CONFIG, fallbackReason: null }),
      holds: async () => { throw new Error('no locks') },
      chains: () => [],
      moveAll: async () => undefined,
      warn: line => w.log.push(`warn ${line}`),
    })
    expect(await keeper.sweep()).toBe(0)
    expect(w.log).toEqual([expect.stringMatching(/^warn /)])
  })
})
