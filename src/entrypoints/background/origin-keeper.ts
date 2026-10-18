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

/**
 * The three reads of a sweep are served over separate channels — the browser's permissions, its lock manager, extension
 * storage — and each answers with the state at the moment it is served, so asked together one may be served long after
 * another. A page takes its hold before the grant or the write it covers, and lets it go only once its write has landed
 * (options/permissions.ts). So the sweep reads **the grants, then the holds, then the settings**, each once the one
 * before has answered: an origin granted after the grants were read is not among them; one whose hold was let go
 * before the holds were read was stored before the settings were read. Asked together, a save that lands and lets go in
 * between would find its origin in neither and lose it (the Task 14 review, I1). A departure's look reads the holds
 * before the settings for the same reason: an undo that lands and lets go in between is then stored
 */
export function createOriginKeeper(deps: OriginKeeperDeps): OriginKeeper {
  const live = () => deps.chains().flatMap(config => config.services.map(s => s.baseURL))
  /**
   * One more look right before an origin goes: the holds, then the settings, then the holds again, each once the one
   * before has answered. A form that took its hold and found the origin granted after the sweep's own reads — an
   * earlier removal in flight meanwhile — or a deletion whose hold came after the sweep read the holds and whose write
   * before it read the settings, is in one of them; an origin any of them needs stays (PR #327, Devin and the re-review).
   * What remains is the removal itself, one browser call
   */
  const stillUnneeded = async (origin: string): Promise<boolean> => {
    try {
      const before = await deps.holds()
      const reading = await deps.read()
      const after = await deps.holds()
      const held = [...before, ...after].flatMap(name => readHold(name)?.origin ?? [])
      const settingsReadable = reading.fallbackReason === null
      return reconcileOrigins({ granted: [origin], needed: originsNeeded(reading.config, [...held, ...live()]), settingsReadable, manifest: deps.manifest() }).remove.length === 1
    } catch {
      return false
    }
  }
  /**
   * An origin kept only because a page holds it: a page that closes lets its lock go and sends nothing — a settings tab
   * closed with a form open runs no clean-up (PR #327, Codex). So the keeper sweeps again every second while such an
   * origin is kept, for as long as a departure is watched; a sweep asked for anew gives it that long again
   */
  let heldLooks = 0
  let heldTimer: ReturnType<typeof setTimeout> | undefined
  const watchHolds = (fresh: boolean) => {
    if (fresh) heldLooks = DEPARTURE_CHECKS
    if (heldTimer !== undefined || heldLooks <= 0) return
    heldLooks--
    heldTimer = setTimeout(() => {
      heldTimer = undefined
      void run(false)
    }, DEPARTURE_CHECK_MS)
  }
  const run = async (fresh: boolean): Promise<number> => {
    let granted: readonly string[]
    let holds: readonly string[]
    let reading: ConfigReading
    try {
      granted = await deps.granted()
      holds = await deps.holds()
      reading = await deps.read()
    } catch {
      // a hold that cannot be read may be a form asking for any origin: nothing goes back on a guess
      deps.warn('[axt] host permissions: the grants, the holds or the settings could not be read, nothing given back')
      return 0
    }
    const held = holds.flatMap(name => readHold(name)?.origin ?? [])
    const settingsReadable = reading.fallbackReason === null
    const manifest = [...deps.manifest()]
    const { remove } = reconcileOrigins({ granted, needed: originsNeeded(reading.config, [...held, ...live()]), settingsReadable, manifest })
    // what would go but for a page's hold: looked at again until the hold is gone
    let heldOnly = reconcileOrigins({ granted, needed: originsNeeded(reading.config, live()), settingsReadable, manifest }).remove.some(o => !remove.includes(o))
    let removed = 0
    for (const origin of remove) {
      if (!(await stillUnneeded(origin))) {
        heldOnly = true
        continue
      }
      await deps.remove(origin).then(
        () => { removed++ },
        () => deps.warn('[axt] host permissions: the browser refused to give one back'),
      )
    }
    if (heldOnly) watchHolds(fresh)
    return removed
  }
  const sweep = () => run(true)

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
    let holds: readonly string[]
    let reading: ConfigReading
    try {
      // the holds first, the settings after: see the order above
      holds = await deps.holds()
      reading = await deps.read()
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
      const gone = (s: { id: string }) => !next.services.some(n => n.id === s.id)
      // readable again after a value that was not: what went unneeded meanwhile goes now (#299 row 120). The services it
      // held are unknown, but a chain still around was built from them: one the new value lacks left, as a deletion's
      // service does, and its sessions are moved off it the same way (PR #327, Codex and Devin)
      if (previous === null) {
        void sweep()
        for (const id of new Set(deps.chains().flatMap(config => config.services.filter(gone).map(s => s.id)))) watch(id, DEPARTURE_CHECKS)
        return
      }
      for (const s of previous.services) if (gone(s)) watch(s.id, DEPARTURE_CHECKS)
    },
  }
}
