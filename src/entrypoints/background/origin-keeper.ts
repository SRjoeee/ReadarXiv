// The one place a service's host permission is given back (DESIGN §9, the configuration). The settings page asks for
// an origin on a gesture and holds it while a form uses it or a deletion's undo is open (options/permissions.ts); what
// goes back, and when, is decided here, by `reconcileOrigins` (config/origins.ts) over everything that may still use an
// origin: the stored services, every hold in every context of the extension, and the chains still around — a page
// translating keeps the chain it started on (sessions.ts), and with it the address its services had then. The
// background is the only context that knows those chains, so the pages ask and the keeper gives back.
//
// It also finishes a deletion the page could not (#299 rows 116 and 119): the page moves every session off a deleted
// service once its undo is past, then has the origin given back; a page closed before that leaves open pages on the
// service and its origin granted. So a service that left the configuration is watched: while a page holds its undo
// the page decides; once nothing does and it is still gone, the sessions on a chain that has it move to the chain in
// force — the next in the chain serves them — and the origin goes.
import { originsNeeded, readHold, reconcileOrigins } from '@/config/origins'
import type { Config } from '@/config/schema'
import type { ConfigReading } from '@/config/storage'

export interface OriginKeeperDeps {
  /** The origins the browser has granted the extension (`permissions.getAll`) */
  granted(): Promise<readonly string[]>
  /** Give one back (`permissions.remove`) */
  remove(origin: string): Promise<unknown>
  /** The manifest's own hosts, read from the manifest as the browser has it — never a list of our own (`manifestOrigins`) */
  manifest(): Iterable<string>
  /** One read of the stored configuration, with that read's verdict (config/storage.ts `readConfig`) */
  read(): Promise<ConfigReading>
  /** The names of the locks held or asked for in every context of the extension (`navigator.locks.query`) */
  holds(): Promise<readonly string[]>
  /** What every chain still around was built from (chain.ts `configs`) */
  chains(): readonly Config[]
  /** Every session onto the chain in force, the others retired — a deleted service's clean-up (engine-ready.ts, `rebindAll`) */
  moveAll(id: string): Promise<unknown>
  /** A fixed line for the diagnostics log: no address, no key */
  warn(line: string): void
}

/** How often a service that left the configuration is looked at: soon after its write, then while a page holds its undo */
export const DEPARTURE_CHECK_MS = 1000
/**
 * How many times it is looked at again while a page holds its undo (5 s, UndoRow.tsx) or the settings cannot be read.
 * A minute: past that the page is still open and commits the deletion itself, and a worker lives no longer idle anyway
 */
const DEPARTURE_CHECKS = 60

export interface OriginKeeper {
  /** Give back every origin nothing needs; resolves with how many went. Never rejects */
  sweep(): Promise<number>
  /** The stored configuration changed; `previous` is null when the value before could not be read */
  configChanged(next: Config, previous: Config | null): void
}

export function createOriginKeeper(deps: OriginKeeperDeps): OriginKeeper {
  const sweep = async (): Promise<number> => {
    let granted: readonly string[]
    let holds: readonly string[]
    let reading: ConfigReading
    try {
      ;[granted, holds, reading] = await Promise.all([deps.granted(), deps.holds(), deps.read()])
    } catch {
      // a hold that cannot be read may be a form asking for any origin: nothing goes back on a guess
      deps.warn('[axt] host permissions: the grants, the holds or the settings could not be read, nothing given back')
      return 0
    }
    const held = holds.flatMap(name => readHold(name)?.origin ?? [])
    const live = deps.chains().flatMap(config => config.services.map(s => s.baseURL))
    const { remove } = reconcileOrigins({
      granted,
      needed: originsNeeded(reading.config, [...held, ...live]),
      settingsReadable: reading.fallbackReason === null,
      manifest: deps.manifest(),
    })
    let removed = 0
    for (const origin of remove) {
      await deps.remove(origin).then(
        () => { removed++ },
        () => deps.warn('[axt] host permissions: the browser refused to give one back'),
      )
    }
    return removed
  }

  /** The services that left, each with its next look */
  const watching = new Map<string, ReturnType<typeof setTimeout>>()
  const forget = (id: string) => {
    clearTimeout(watching.get(id))
    watching.delete(id)
  }
  const watch = (id: string, left: number) => {
    forget(id)
    watching.set(id, setTimeout(() => {
      watching.delete(id)
      void look(id, left)
    }, DEPARTURE_CHECK_MS))
  }
  const look = async (id: string, left: number): Promise<void> => {
    let reading: ConfigReading
    let holds: readonly string[]
    try {
      ;[reading, holds] = await Promise.all([deps.read(), deps.holds()])
    } catch {
      if (left > 0) watch(id, left - 1)
      return
    }
    // left again meanwhile: the newer departure has its own look
    if (watching.has(id)) return
    const readable = reading.fallbackReason === null
    if (readable && reading.config.services.some(s => s.id === id)) return
    // a read that says nothing, or a page whose undo may still bring it back: looked at again, nothing moved
    if (!readable || holds.some(name => readHold(name)?.service === id)) {
      if (left > 0) watch(id, left - 1)
      return
    }
    // only sessions on a chain that has it: a page's own commit moved them already, and they are not moved twice
    if (deps.chains().some(config => config.services.some(s => s.id === id))) {
      await deps.moveAll(id).catch(() => deps.warn('[axt] a deleted service: its sessions could not be moved'))
    }
    await sweep()
  }

  return {
    sweep,
    configChanged(next, previous) {
      for (const s of next.services) forget(s.id)
      // readable again after a value that was not: what went unneeded meanwhile goes now (#299 row 120)
      if (previous === null) {
        void sweep()
        return
      }
      for (const s of previous.services) if (!next.services.some(n => n.id === s.id)) watch(s.id, DEPARTURE_CHECKS)
    },
  }
}
