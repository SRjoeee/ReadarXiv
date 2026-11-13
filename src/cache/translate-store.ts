// The background's stores of translation (DESIGN §9; interfaces/translate/DECISION.md "Rows" and "What stage 4 builds"):
// three tables of one IndexedDB database, each read and written in bulk, one transaction a call.
// - `answers`: the chain's Store (`@readarxiv/translate` Ports.store), the raw reply a translator gave for the bytes it was
//   sent, kept only once accepted and judged again on every read (a better reading of an old reply needs no new request);
// - `rows`: a unit's accepted result by the chain's identity, the target and the unit itself (src/providers/transport.ts):
//   what a page opened again reads before anything is asked, so a unit the first translator refused and the next
//   answered is not asked of the first again (stage 4b's check);
// - `ocr`: the recogniser's reading of a figure (background/ocr.ts), which is no translation and was kept in the old
//   cache's translation column.
// Today's bounds hold per table: 30 days from the write, 20,000 entries and 50 MiB, the least recently read going first
// past either cap, a value of at most 64 KiB (an OCR reading 256 KiB). Every failure, of a read or a write, is a miss or
// nothing kept: a store is never a reason a page does not translate.
//
// The database is the old cache's (`axt-translation-cache`), at version 3: the version step drops the old table of
// per-text translations (`entries`, version 2: the HTML page's blocks and the PDF reader's texts, keyed by
// CACHE_KEY_VERSION 6), which no key of the chain could reach, once, on the first open by this release (hard rule 7: a
// named step, tests/cache/translate-store.test.ts opens a database made by version 2's schema).
import Dexie, { type DexieOptions, type Table } from 'dexie'

const TRANSLATE_DB = 'axt-translation-cache'

export interface Limits {
  ttlMs: number
  maxEntries: number
  maxBytes: number
  maxValueBytes: number
}
const ANSWER_LIMITS: Limits = { ttlMs: 30 * 24 * 60 * 60 * 1000, maxEntries: 20_000, maxBytes: 50 * 2 ** 20, maxValueBytes: 64 * 1024 }
const OCR_LIMITS: Limits = { ...ANSWER_LIMITS, maxValueBytes: 256 * 1024 }

interface Entry {
  key: string
  value: string
  /** when it was written: its age */
  made: number
  /** when it was last read: who goes first past a cap */
  used: number
  bytes: number
}

class TranslateDatabase extends Dexie {
  answers!: Table<Entry, string>
  rows!: Table<Entry, string>
  ocr!: Table<Entry, string>
  constructor(name = TRANSLATE_DB, options?: DexieOptions) {
    super(name, options)
    // version 3 (stage 4b): the per-text cache of versions 1 and 2 dropped, the three tables of the chain's hosts made
    const table = '&key, made, used, bytes'
    this.version(3).stores({ entries: null, answers: table, rows: table, ocr: table })
  }
}
export function createTranslateDb(name?: string, options?: DexieOptions): TranslateDatabase {
  return new TranslateDatabase(name, options)
}

const bytesOf = (s: string) => new TextEncoder().encode(s).byteLength

/** One table's bulk reads and writes */
export interface KeyValues {
  read(keys: readonly string[]): Promise<(string | null)[]>
  write(entries: readonly (readonly [key: string, value: string])[]): Promise<void>
}

class Bounded implements KeyValues {
  /** the table's count and bytes, counted once and kept by every write; null until counted or after a clear */
  private totals: { count: number; bytes: number } | null = null
  constructor(
    private readonly table: Table<Entry, string>,
    private readonly db: TranslateDatabase,
    private readonly limits: Limits,
    private readonly now: () => number,
  ) {}

  async read(keys: readonly string[]): Promise<(string | null)[]> {
    if (!keys.length) return []
    try {
      const now = this.now()
      const got = await this.table.bulkGet([...keys])
      const fresh = got.map(e => (e && e.made + this.limits.ttlMs > now ? e : undefined))
      const hit = fresh.flatMap(e => (e ? [e.key] : []))
      // the reading time written back apart, not awaited: the least recently read go first past a cap
      if (hit.length) void this.table.bulkUpdate(hit.map(key => ({ key, changes: { used: now } }))).catch(() => undefined)
      return fresh.map(e => e?.value ?? null)
    } catch {
      return keys.map(() => null)
    }
  }

  async write(entries: readonly (readonly [key: string, value: string])[]): Promise<void> {
    const now = this.now()
    // one entry a key, the last: the put keeps one, and the totals count what it keeps (equal plain units of one call
    // write one row key twice)
    const rows = [...new Map(entries.map(([key, value]) => [key, value]))].flatMap(([key, value]): Entry[] => {
      const bytes = bytesOf(key) + bytesOf(value)
      return bytes > this.limits.maxValueBytes ? [] : [{ key, value, made: now, used: now, bytes }]
    })
    if (!rows.length) return
    try {
      const totals = await this.counted()
      await this.db.transaction('rw', this.table, async () => {
        const before = await this.table.bulkGet(rows.map(r => r.key))
        await this.table.bulkPut(rows)
        for (const [i, r] of rows.entries()) {
          const was = before[i]
          if (was) totals.bytes -= was.bytes
          else totals.count++
          totals.bytes += r.bytes
        }
        await this.evict(totals)
      })
    } catch {
      // nothing kept: the totals are counted again at the next write
      this.totals = null
    }
  }

  /** the count under way: writes that start together wait for the same one and then keep the same totals */
  private counting: Promise<{ count: number; bytes: number }> | null = null

  private counted(): Promise<{ count: number; bytes: number }> {
    if (this.totals) return Promise.resolve(this.totals)
    this.counting ??= (async () => {
      try {
        const sizes = (await this.table.orderBy('bytes').keys()) as number[]
        this.totals = { count: sizes.length, bytes: sizes.reduce((n, b) => n + (b || 0), 0) }
        return this.totals
      } finally {
        this.counting = null
      }
    })()
    return this.counting
  }

  private async evict(totals: { count: number; bytes: number }): Promise<void> {
    const over = () => totals.count > this.limits.maxEntries || totals.bytes > this.limits.maxBytes
    while (over()) {
      const oldest = await this.table.orderBy('used').limit(128).toArray()
      if (!oldest.length) return
      const gone: string[] = []
      for (const e of oldest) {
        if (!over()) break
        gone.push(e.key)
        totals.count--
        totals.bytes -= e.bytes
      }
      await this.table.bulkDelete(gone)
    }
  }

  /** the expired entries deleted; how many */
  async cleanup(): Promise<number> {
    const n = await this.table.where('made').below(this.now() - this.limits.ttlMs).delete()
    if (n) this.totals = null
    return n
  }
  async clear(): Promise<number> {
    const n = await this.table.count()
    await this.table.clear()
    this.totals = { count: 0, bytes: 0 }
    return n
  }
  async stats(): Promise<{ entries: number; bytes: number }> {
    const t = await this.counted()
    return { entries: t.count, bytes: t.bytes }
  }
}

export interface TranslateStore {
  /** the chain's Store */
  answers: KeyValues
  rows: KeyValues
  ocr: KeyValues
  /** every table's expired entries deleted; how many */
  cleanup(): Promise<number>
  /** every table emptied (the settings page's Data section); how many entries went */
  clear(): Promise<number>
  /** the rows' count (S-O-70's passages) and every table's bytes */
  stats(): Promise<{ entries: number; bytes: number }>
}

export function createTranslateStore(o: { db?: TranslateDatabase; limits?: Partial<Limits>; now?: () => number } = {}): TranslateStore {
  const db = o.db ?? createTranslateDb()
  const now = o.now ?? (() => Date.now())
  const tables = {
    answers: new Bounded(db.answers, db, { ...ANSWER_LIMITS, ...o.limits }, now),
    rows: new Bounded(db.rows, db, { ...ANSWER_LIMITS, ...o.limits }, now),
    ocr: new Bounded(db.ocr, db, { ...OCR_LIMITS, ...o.limits }, now),
  }
  const all = Object.values(tables)
  return {
    ...tables,
    cleanup: async () => (await Promise.all(all.map(t => t.cleanup()))).reduce((a, b) => a + b, 0),
    clear: async () => (await Promise.all(all.map(t => t.clear()))).reduce((a, b) => a + b, 0),
    stats: async () => {
      // S-O-70 "{n} passages": the translated passages are the rows; a raw answer behind a row and a figure's reading are
      // not passages, but their bytes are held, so the size is every table's
      const s = await Promise.all(all.map(t => t.stats()))
      return { entries: (await tables.rows.stats()).entries, bytes: s.reduce((n, x) => n + x.bytes, 0) }
    },
  }
}
