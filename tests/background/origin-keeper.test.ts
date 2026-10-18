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

  /**
   * Each read answers with the state at the moment it is served, and the three are served over separate channels (the
   * browser's permissions, its lock manager, extension storage): asked together, one may be served long after another.
   * A page takes a hold before its grant or its write and lets it go only once the write has landed, so only a sweep
   * that reads the grants, then the holds, then the settings — each after the one before has answered — always sees
   * an origin in use in one of them (Task 14 review, I1)
   */
  const racing = () => {
    const state = { granted: ['https://api.example.com/*'], holds: [] as string[], stored: { ...DEFAULT_CONFIG, services: [] as Service[] } as Config, chains: [] as Config[] }
    const served: string[] = []
    let late: (() => void) | null = null
    /** this read is served only once `release()` is called; the others at once */
    const slow = new Set<string>()
    const serve = <T,>(name: string, value: () => T): Promise<T> => {
      if (!slow.has(name)) { served.push(name); return Promise.resolve(value()) }
      return new Promise(resolve => { late = () => { served.push(name); resolve(value()) } })
    }
    const log: string[] = []
    const keeper = createOriginKeeper({
      granted: () => serve('granted', () => [...state.granted]),
      remove: async origin => { log.push(`remove ${origin}`) },
      manifest: () => [],
      read: () => serve('read', () => ({ config: state.stored, fallbackReason: null })),
      holds: () => serve('holds', () => [...state.holds]),
      chains: () => state.chains,
      moveAll: async id => { log.push(`move ${id}`) },
      warn: line => log.push(`warn ${line}`),
    })
    return { state, served, slow, release: () => late?.(), keeper, log }
  }

  it('a sweep reads the holds only once the grants have answered, and the settings only once the holds have: a save that lands and lets its hold go in between keeps its origin (I1)', async () => {
    const r = racing()
    // a form connecting with the address holds it; the sweep's lock query is served late
    r.state.holds = [originHold(MINE.baseURL)!]
    r.slow.add('holds')
    const sweep = r.keeper.sweep()
    await vi.advanceTimersByTimeAsync(0)
    // the form's save lands, and it lets go of its hold
    r.state.stored = { ...DEFAULT_CONFIG, services: [MINE] }
    r.state.holds = []
    r.release()
    expect(await sweep).toBe(0)
    expect(r.log).toEqual([])
    expect(r.served).toEqual(['granted', 'holds', 'read'])
  })

  it('a sweep reads the grants before the holds: a hold taken and an origin granted in between are not taken for unneeded (I1)', async () => {
    const r = racing()
    r.state.granted = []
    r.slow.add('granted')
    const sweep = r.keeper.sweep()
    await vi.advanceTimersByTimeAsync(0)
    // a form holds an address, then the browser grants it
    r.state.holds = [originHold(MINE.baseURL)!]
    r.state.granted = ['https://api.example.com/*']
    r.release()
    expect(await sweep).toBe(0)
    expect(r.log).toEqual([])
  })

  it('a departure\'s look reads the holds before the settings: an undo that lands and lets its hold go in between moves nothing (I1)', async () => {
    const r = racing()
    r.state.holds = [originHold(MINE.baseURL, MINE.id)!]
    // a page still translates on the chain built before the deletion
    r.state.chains = [BEFORE]
    r.keeper.configChanged(r.state.stored, { ...DEFAULT_CONFIG, services: [MINE] })
    r.slow.add('holds')
    await vi.advanceTimersByTimeAsync(DEPARTURE_CHECK_MS)
    // the undo's write lands, the service is stored again, and the page lets its hold go
    r.state.stored = { ...DEFAULT_CONFIG, services: [MINE] }
    r.state.holds = []
    r.slow.clear()
    r.release()
    await vi.advanceTimersByTimeAsync(DEPARTURE_CHECK_MS * 3)
    expect(r.log).toEqual([])
  })

  it('a configuration reset out of an unreadable one: a service in a chain still around that the new one lacks is a departure — its sessions move to the next engine and its origin goes back once nothing holds it (PR #327, Codex and Devin)', async () => {
    const start: Config = { ...DEFAULT_CONFIG, services: [MINE], provider: MINE.id }
    const w = world(start)
    w.state.granted.delete('https://other.example.com/*')
    await w.router.forCall('s1', 1)
    expect(await leadOf(w.router.transportFor('s1'))).toBe(MINE.id)
    // the stored value turned unreadable — the watcher hears nothing of a value that does not parse — and is reset:
    // the change comes with no value before it
    w.state.stored = DEFAULT_CONFIG
    w.holder.onConfig(DEFAULT_CONFIG)
    w.state.holds = [originHold(MINE.baseURL)!]
    w.keeper.configChanged(DEFAULT_CONFIG, null)
    await vi.advanceTimersByTimeAsync(DEPARTURE_CHECK_MS * 2)
    // a page still holds the origin: the sessions move, the origin stays
    expect(await leadOf(w.router.transportFor('s1'))).toBe('microsoft')
    expect(w.log).toEqual([`move ${MINE.id}`, 'retire build-1', 'retire build-2'])
    w.state.holds = []
    await vi.advanceTimersByTimeAsync(DEPARTURE_CHECK_MS)
    expect(w.log).toEqual([`move ${MINE.id}`, 'retire build-1', 'retire build-2', 'remove https://api.example.com/*'])
  })

  /** Deps whose next call of a read can be served late, and whose removal of one origin can be held */
  const delayed = () => {
    const state = { granted: [] as string[], holds: [] as string[], stored: DEFAULT_CONFIG as Config }
    const log: string[] = []
    const late = new Map<string, () => void>()
    const slowNext = new Set<string>()
    const serve = <T,>(name: string, value: () => T): Promise<T> => {
      if (!slowNext.delete(name)) return Promise.resolve(value())
      return new Promise(resolve => { late.set(name, () => resolve(value())) })
    }
    let holdRemoval: string | null = null
    let removal = () => {}
    const keeper = createOriginKeeper({
      granted: () => serve('granted', () => [...state.granted]),
      remove: async origin => {
        if (origin === holdRemoval) await new Promise<void>(resolve => { removal = resolve })
        state.granted = state.granted.filter(o => o !== origin)
        log.push(`remove ${origin}`)
      },
      manifest: () => [],
      read: () => serve('read', () => ({ config: state.stored, fallbackReason: null })),
      holds: () => serve('holds', () => [...state.holds]),
      chains: () => [],
      moveAll: async () => undefined,
      warn: line => log.push(`warn ${line}`),
    })
    return { state, log, keeper, slowNext, serveLate: (name: string) => late.get(name)?.(), holdRemovalOf: (o: string) => { holdRemoval = o }, letRemovalGo: () => removal() }
  }

  it('a last look right before each removal: a form that takes its hold and saves while an earlier removal is in flight keeps its new service\'s grant (PR #327, Devin)', async () => {
    const d = delayed()
    d.state.granted = ['https://a.example.com/*', 'https://api.example.com/*']
    d.holdRemovalOf('https://a.example.com/*')
    const sweep = d.keeper.sweep()
    await vi.advanceTimersByTimeAsync(0)
    // the first removal is in flight; a form holds the second origin, finds it granted, connects and saves
    d.state.holds = [originHold(MINE.baseURL)!]
    d.state.stored = { ...DEFAULT_CONFIG, services: [MINE] }
    d.state.holds = []
    d.letRemovalGo()
    expect(await sweep).toBe(1)
    expect(d.log).toEqual(['remove https://a.example.com/*'])
    expect(d.state.granted).toEqual(['https://api.example.com/*'])
  })

  it('a last look right before removing: a sweep that read the holds before a deletion\'s hold and the settings after its write keeps the origin, and the undone service still has it (PR #327, the re-review\'s mirror case)', async () => {
    const d = delayed()
    d.state.granted = ['https://api.example.com/*']
    d.state.stored = { ...DEFAULT_CONFIG, services: [MINE] }
    d.slowNext.add('read')
    const sweep = d.keeper.sweep()
    await vi.advanceTimersByTimeAsync(0)
    // the holds were read (none); the page deletes the service — its hold, then its write — before the settings are read
    d.state.holds = [originHold(MINE.baseURL, MINE.id)!]
    d.state.stored = DEFAULT_CONFIG
    d.serveLate('read')
    expect(await sweep).toBe(0)
    // undone: stored again, the hold let go
    d.state.stored = { ...DEFAULT_CONFIG, services: [MINE] }
    d.state.holds = []
    await d.keeper.sweep()
    expect(d.log).toEqual([])
    expect(d.state.granted).toEqual(['https://api.example.com/*'])
  })

  it('an origin kept only because a page holds it is looked at again: a settings tab closed with a form open — its lock gone, no message — still gives the origin back (PR #327, Codex)', async () => {
    const d = delayed()
    d.state.granted = ['https://api.example.com/*']
    d.state.holds = [originHold(MINE.baseURL)!]
    expect(await d.keeper.sweep()).toBe(0)
    await vi.advanceTimersByTimeAsync(DEPARTURE_CHECK_MS * 3)
    expect(d.log).toEqual([])
    // the tab closes: the browser lets the lock go, and the page sends nothing
    d.state.holds = []
    await vi.advanceTimersByTimeAsync(DEPARTURE_CHECK_MS)
    expect(d.log).toEqual(['remove https://api.example.com/*'])
    // nothing more to look at: no further sweeps
    await vi.advanceTimersByTimeAsync(DEPARTURE_CHECK_MS * 5)
    expect(d.log).toEqual(['remove https://api.example.com/*'])
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
