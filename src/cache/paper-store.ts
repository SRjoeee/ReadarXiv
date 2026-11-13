// The PDF reader's store of papers on this machine (the reader package's, behind its host's fetch: src/pdf-reader/host/
// stored-fetch.ts; PDF-READER §9.3): our server's answers a paper was drawn from, so that a paper opened again, or opened with
// our server out of reach, is drawn from here (the owner's rule of 2026-10-08: offline, nothing new drawn, a kept paper still
// opens). Two kinds of row: each paper version's last document with a layer (`versions`: the JSON our server answered, when the
// version was last opened, the bytes it holds), and each answer kept (`answers`: an object or a range of one, a face's file or
// table, by the address it was asked at, with its status, the headers the reader reads and the digest of its bytes, taken as
// it was kept). Every answer is checked against that digest each time it is read: bytes that are not the ones kept are a miss,
// and are dropped, so nothing corrupt is ever drawn. Beyond a cap, the paper versions opened least recently go first, with
// everything they hold; the faces' files (no paper's: `pv` '') go last. Every failure of a read, a slow read included, is a miss
// (a read that has not answered within its budget resolves as one, its late answer let go), and of a write, nothing kept: the
// store is never a reason a paper does not open.
//
// The database is the old reader's (`axt-layer`, cache/layer-store.ts), at version 5: the step deletes the old reader's three
// tables (its layers' objects by digest, its catalogs, who held what), which no address of the rebuilt reader's reaches, once,
// on the first open by this build (hard rule 7: a named step, tests/cache/paper-store.test.ts opens a database made by
// version 4's schema; the way back to a build of version 4: PDF-READER §9.3).
import Dexie, { type DexieOptions, type Table } from 'dexie'

/** the store's bytes at most (the old reader's 200 MB: about 400 papers at 0.5 MB, fewer with copies of originals) */
export const PAPER_STORE_BYTES = 200 * 2 ** 20
/** how long a read may take before it is a miss (the old reader's store's, three times its slowest read measured on the
 *  heaviest object, lab/pdf/records/layer-extension.md) */
export const READ_BUDGET_MS = 1500
/** the largest answer kept: one past it is drawn and not kept */
export const ANSWER_MAX_BYTES = 32 * 2 ** 20
export const PAPER_DB = 'axt-layer'
/** the faces' files and tables: kept as no paper's, let go after every paper */
export const SHARED = ''

/** a paper version (`pv`, our server's segment: `2600_00001v1`), its id's segment, when it was last opened, the bytes its
 *  answers hold, its last document with a layer (JSON) */
interface VersionRow { pv: string; id: string; openedAt: number; bytes: number; doc: string | null }
/** an answer kept: the address it was asked at (path and query), whose paper version it is, its status (200 or 206), the
 *  headers the reader reads, the digest of its bytes as kept, and its bytes */
interface AnswerRow { url: string; pv: string; status: number; headers: [string, string][]; sha256: string; bytes: number; data: ArrayBuffer }

class PaperDatabase extends Dexie {
  versions!: Table<VersionRow, string>
  answers!: Table<AnswerRow, string>
  constructor(name = PAPER_DB, options?: DexieOptions) {
    super(name, options)
    // (the old reader's tables named to be deleted: Dexie deletes a table only where a version names it null)
    this.version(5).stores({ objects: null, papers: null, refs: null, versions: 'pv, id, openedAt', answers: 'url, pv' })
  }
}
export function createPaperDb(name?: string, options?: DexieOptions): PaperDatabase {
  return new PaperDatabase(name, options)
}

/** an answer as it was kept */
export interface Kept {
  status: number
  headers: [string, string][]
  bytes: Uint8Array
}

export interface PaperStore {
  /** the answer kept for `url`, its bytes checked against their digest; undefined for a miss, a mismatch (dropped) or a read
   *  past its budget */
  answer(url: string): Promise<Kept | undefined>
  /** an answer kept for paper version `pv` (SHARED: the faces'); `sha256`, where the address names its whole object's digest:
   *  bytes that are not that object are not kept */
  putAnswer(pv: string, url: string, a: Kept, sha256?: string): Promise<void>
  /** the last document with a layer kept of paper version `pv`, or of the id `id` (its version opened last), as JSON */
  doc(o: { pv: string } | { id: string }): Promise<string | undefined>
  /** a document with a layer kept for `pv`: where its layer's directory is not the one kept before, that directory's answers go */
  putDoc(pv: string, doc: string, dir: string | null): Promise<void>
  /** a paper version opened now: the last to be let go */
  opened(pv: string): Promise<void>
  /** the paper versions kept and their bytes, the faces' included, for the settings page */
  usage(): Promise<{ count: number; bytes: number }>
  clear(): Promise<void>
}

const hexOf = (b: ArrayBuffer) => { let s = ''; for (const x of new Uint8Array(b)) s += x.toString(16).padStart(2, '0'); return s }
async function digestOf(bytes: Uint8Array): Promise<string> {
  return hexOf(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>))
}
const copyOf = (b: Uint8Array): ArrayBuffer => b.slice().buffer as ArrayBuffer
/** a promise's answer, or `miss` once `ms` have gone by (its late answer let go) */
function within<T, M>(p: Promise<T>, ms: number, miss: M): Promise<T | M> {
  return new Promise(resolve => {
    const t = setTimeout(() => resolve(miss), ms)
    p.then(v => { clearTimeout(t); resolve(v) }, () => { clearTimeout(t); resolve(miss) })
  })
}
/** a paper version's id segment: its segment without the version */
const idOf = (pv: string) => pv.replace(/v\d+$/, '')

export function createPaperStore(o: { db?: PaperDatabase; maxBytes?: number; budgetMs?: number; now?: () => number } = {}): PaperStore {
  const db = o.db ?? createPaperDb()
  const maxBytes = o.maxBytes ?? PAPER_STORE_BYTES, budget = o.budgetMs ?? READ_BUDGET_MS, now = o.now ?? (() => Date.now())
  /** a paper version's answers and row gone */
  const drop = (pv: string) => db.transaction('rw', db.versions, db.answers, async () => {
    await db.answers.where('pv').equals(pv).delete()
    await db.versions.delete(pv)
  })
  /** paper versions over the cap let go, least recently opened first, never `keep` (the one being opened); the faces last */
  async function evict(keep: string) {
    let total = 0
    await db.versions.each(v => { total += v.bytes })
    if (total <= maxBytes) return
    const order = (await db.versions.orderBy('openedAt').toArray()).filter(v => v.pv !== keep)
    for (const v of [...order.filter(v => v.pv !== SHARED), ...order.filter(v => v.pv === SHARED)]) {
      if (total <= maxBytes) break
      await drop(v.pv)
      total -= v.bytes
    }
  }
  async function read(url: string): Promise<Kept | undefined> {
    const row = await db.answers.get(url)
    if (!row) return undefined
    const bytes = new Uint8Array(row.data)
    if (bytes.length === row.bytes && (await digestOf(bytes)) === row.sha256) return { status: row.status, headers: row.headers, bytes }
    // bytes that are not the ones kept: never drawn, and gone
    await db.transaction('rw', db.versions, db.answers, async () => {
      await db.answers.delete(url)
      const v = await db.versions.get(row.pv)
      if (v) await db.versions.put({ ...v, bytes: Math.max(0, v.bytes - row.bytes) })
    }).catch(() => {})
    return undefined
  }
  return {
    answer: url => within(read(url), budget, undefined),
    async putAnswer(pv, url, a, sha256) {
      try {
        if (a.bytes.length > Math.min(maxBytes, ANSWER_MAX_BYTES)) return
        const digest = await digestOf(a.bytes)
        if (sha256 !== undefined && digest !== sha256) return
        await db.transaction('rw', db.versions, db.answers, async () => {
          const had = await db.answers.get(url)
          await db.answers.put({ url, pv, status: a.status, headers: a.headers, sha256: digest, bytes: a.bytes.length, data: copyOf(a.bytes) })
          const v = await db.versions.get(pv)
          await db.versions.put({ pv, id: idOf(pv), openedAt: v?.openedAt ?? now(), bytes: (v?.bytes ?? 0) - (had?.bytes ?? 0) + a.bytes.length, doc: v?.doc ?? null })
        })
        await evict(pv)
      } catch { /* nothing kept */ }
    },
    doc: q => within((async () => {
      if ('pv' in q) return (await db.versions.get(q.pv))?.doc ?? undefined
      const kept = (await db.versions.where('id').equals(q.id).toArray()).filter(v => v.doc !== null)
      return kept.sort((a, b) => b.openedAt - a.openedAt)[0]?.doc ?? undefined
    })(), budget, undefined),
    async putDoc(pv, doc, dir) {
      try {
        await db.transaction('rw', db.versions, db.answers, async () => {
          const v = await db.versions.get(pv)
          let bytes = v?.bytes ?? 0
          // (a layer made again: the objects of the one before are no paper's any more)
          if (dir !== null) {
            const stale = (await db.answers.where('pv').equals(pv).toArray()).filter(a => a.url.startsWith(`/api/v2/o/p/${pv}/`) && !a.url.startsWith(`/api/v2/o/${dir}/`))
            for (const a of stale) bytes -= a.bytes
            await db.answers.bulkDelete(stale.map(a => a.url))
          }
          await db.versions.put({ pv, id: idOf(pv), openedAt: v?.openedAt ?? now(), bytes: bytes - (v?.doc?.length ?? 0) + doc.length, doc })
        })
        await evict(pv)
      } catch { /* nothing kept */ }
    },
    async opened(pv) {
      try { await db.versions.update(pv, { openedAt: now() }) } catch { /* the order of eviction only */ }
    },
    async usage() {
      let count = 0, bytes = 0
      await db.versions.each(v => { if (v.pv !== SHARED) count++; bytes += v.bytes })
      return { count, bytes }
    },
    async clear() {
      await db.transaction('rw', db.versions, db.answers, async () => { await db.versions.clear(); await db.answers.clear() })
    },
  }
}
